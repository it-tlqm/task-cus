import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { getAuthorizedUnitIds, jsonError } from "@/server/guard";

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return jsonError("Yêu cầu đăng nhập tài khoản để xem Dashboard KPI", 401);
    }

    // Quản trị kỹ thuật không mặc nhiên có quyền đọc số liệu nghiệp vụ chuyên môn
    if (user.role === "SYSTEM_ADMIN") {
      return jsonError("Tài khoản Quản trị kỹ thuật không có quyền truy cập số liệu nghiệp vụ", 403);
    }

    const { searchParams } = new URL(req.url);
    const requestedUnitId = searchParams.get("unitId");
    const periodParam = searchParams.get("period"); // today, w41, month10, custom, all
    const periodIdParam = searchParams.get("periodId");
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");

    // 1. Scope Guard: Kiểm tra danh sách đơn vị mà người dùng được phép xem
    const authorizedUnits = await getAuthorizedUnitIds(user);

    const where: any = {};

    if (authorizedUnits === "ALL") {
      // Lãnh đạo đơn vị: Được xem tất cả hoặc lọc theo đơn vị được yêu cầu
      if (requestedUnitId && requestedUnitId !== "ALL") {
        where.unitId = requestedUnitId;
      }
    } else {
      // Cán bộ / Trưởng bộ phận: Chỉ được xem trong phạm vi authorizedUnits
      if (requestedUnitId && requestedUnitId !== "ALL") {
        if (!authorizedUnits.includes(requestedUnitId)) {
          return jsonError("Bạn không có quyền xem dữ liệu của bộ phận này (Scope Guard Violation)", 403);
        }
        where.unitId = requestedUnitId;
      } else {
        where.unitId = { in: authorizedUnits };
      }
    }

    // Nếu cán bộ có scopeType là OWN, chỉ tính nhiệm vụ mà họ là chủ trì hoặc phối hợp
    if (user.scopeType === "OWN") {
      where.OR = [
        { ownerId: user.personId },
        { assignees: { some: { personId: user.personId } } },
      ];
    }

    // 2. Xác định phạm vi thời gian / Kỳ báo cáo (Period Filter)
    let periodStart: Date | null = null;
    let periodEnd: Date | null = null;

    if (periodIdParam) {
      const p = await prisma.reportingPeriod.findUnique({
        where: { id: periodIdParam },
      });
      if (p) {
        periodStart = p.startAt;
        periodEnd = p.endAt;
      }
    } else if (periodParam === "today") {
      const now = new Date();
      periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      periodEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else if (periodParam === "w41") {
      // Tìm kỳ Tuần 41 trong DB nếu có, hoặc dùng khoảng ngày tuần 41 (05/10 - 12/10/2026)
      const pW41 = await prisma.reportingPeriod.findFirst({
        where: { title: { contains: "Tuần 41" } },
      });
      if (pW41) {
        periodStart = pW41.startAt;
        periodEnd = pW41.endAt;
      } else {
        periodStart = new Date("2026-10-05T00:00:00Z");
        periodEnd = new Date("2026-10-12T23:59:59Z");
      }
    } else if (periodParam === "month10") {
      const pMonth = await prisma.reportingPeriod.findFirst({
        where: { type: "MONTH", title: { contains: "Tháng 10" } },
      });
      if (pMonth) {
        periodStart = pMonth.startAt;
        periodEnd = pMonth.endAt;
      } else {
        periodStart = new Date("2026-10-01T00:00:00Z");
        periodEnd = new Date("2026-10-31T23:59:59Z");
      }
    } else if (periodParam === "custom" && startDateParam && endDateParam) {
      periodStart = new Date(startDateParam);
      periodEnd = new Date(endDateParam);
    }

    // Áp dụng điều kiện lọc thời gian nếu có
    if (periodStart && periodEnd) {
      const periodCondition = [
        {
          currentDeadline: {
            gte: periodStart,
            lte: periodEnd,
          },
        },
        {
          createdAt: {
            gte: periodStart,
            lte: periodEnd,
          },
        },
        {
          planLinks: {
            some: {
              planItem: {
                plan: {
                  period: {
                    startAt: { lte: periodEnd },
                    endAt: { gte: periodStart },
                  },
                },
              },
            },
          },
        },
      ];

      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: periodCondition }];
        delete where.OR;
      } else {
        where.OR = periodCondition;
      }
    }

    // 3. Truy vấn danh sách nhiệm vụ thực tế từ PostgreSQL
    const now = new Date();

    const tasks = await prisma.task.findMany({
      where,
      include: {
        owner: { select: { id: true, fullName: true, code: true } },
        unit: { select: { id: true, name: true, code: true } },
        updates: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { progressPercent: true, createdAt: true },
        },
        deadlineRequests: {
          where: { status: "PENDING" },
          select: { id: true, requestedDeadline: true, reason: true },
        },
      },
      orderBy: [{ currentDeadline: "asc" }, { createdAt: "desc" }],
    });

    // 4. Tính toán chính xác toàn bộ các chỉ số KPI theo quy tắc nghiệp vụ
    // Không đếm các nhiệm vụ CANCELED vào tổng số đang hoạt động
    const activeTasks = tasks.filter((t) => t.status !== "CANCELED");
    const totalTasks = activeTasks.length;

    let inProgress = 0;
    let waitingReview = 0;
    let completed = 0;
    let overdue = 0;
    let hasIssue = 0;
    let notStarted = 0;
    let ownedTasksCount = 0;
    let urgentTasksCount = 0;
    let urgentReviewCount = 0;
    let sumProgress = 0;
    let inProgressCount = 0;
    let onTimeCompletedCount = 0;

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    let newTasksCount = 0;

    for (const t of activeTasks) {
      const isDone = t.status === "COMPLETED" || t.status === "DONE";
      const isWaiting = t.status === "WAITING_REVIEW";
      const isInProg = t.status === "IN_PROGRESS";
      const isNotStart = t.status === "NOT_STARTED";
      const isOver = !isDone && new Date(t.currentDeadline) < now;
      const isUrgent = t.priority === "Cao" || t.priority === "Khẩn";

      if (isDone) completed++;
      else if (isWaiting) waitingReview++;
      else if (isInProg) inProgress++;
      else if (isNotStart) notStarted++;

      if (isOver) overdue++;
      if (t.hasIssue && !isDone) hasIssue++;
      if (t.ownerId) ownedTasksCount++;
      if (isUrgent && !isDone) urgentTasksCount++;
      if (isWaiting && isUrgent) urgentReviewCount++;

      // Tiến độ trung bình
      if (isInProg) {
        inProgressCount++;
        const prog = t.updates[0]?.progressPercent ?? 0;
        sumProgress += prog;
      }

      // Hoàn thành đúng hạn
      if (isDone) {
        if (new Date(t.updatedAt) <= new Date(t.currentDeadline)) {
          onTimeCompletedCount++;
        }
      }

      // Nhiệm vụ mới trong 7 ngày
      if (new Date(t.createdAt) >= sevenDaysAgo) {
        newTasksCount++;
      }
    }

    // Tỷ lệ hoàn thành: completed / totalTasks * 100 (Nếu total = 0 -> null)
    const completionRate = totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : null;

    // Tỷ lệ có cán bộ chủ trì: owned / totalTasks * 100
    const assignedRate = totalTasks > 0 ? Math.round((ownedTasksCount / totalTasks) * 100) : null;

    // Tiến độ trung bình của các nhiệm vụ đang làm: sumProgress / inProgressCount
    const averageProgress =
      inProgressCount > 0
        ? Math.round(sumProgress / inProgressCount)
        : completed > 0
        ? 100
        : null;

    // Tỷ lệ đúng hạn: onTimeCompletedCount / completed (hoặc tỷ lệ nhiệm vụ hiện chưa quá hạn)
    const onTimeRate =
      completed > 0
        ? Math.round((onTimeCompletedCount / completed) * 100)
        : totalTasks > 0
        ? Math.round(((totalTasks - overdue) / totalTasks) * 100)
        : null;

    // 5. Thống kê theo bộ phận (Department Breakdown)
    const deptWhere: any = { level: 2 };
    if (authorizedUnits !== "ALL") {
      deptWhere.id = { in: authorizedUnits };
    }

    const units = await prisma.orgUnit.findMany({
      where: deptWhere,
      include: {
        _count: {
          select: { assignments: true },
        },
      },
      orderBy: { sortOrder: "asc" },
    });

    const departmentBreakdown = units.map((u) => {
      const deptTasks = activeTasks.filter((t) => t.unitId === u.id);
      const dTotal = deptTasks.length;
      const dCompleted = deptTasks.filter((t) => t.status === "COMPLETED" || t.status === "DONE").length;
      const dInProgress = deptTasks.filter((t) => t.status === "IN_PROGRESS").length;
      const dWaiting = deptTasks.filter((t) => t.status === "WAITING_REVIEW").length;
      const dOverdue = deptTasks.filter(
        (t) => t.status !== "COMPLETED" && t.status !== "DONE" && new Date(t.currentDeadline) < now
      ).length;

      // Tỷ lệ hoàn thành bộ phận thật: completed / total * 100
      // Nếu tổng số việc = 0, trả về null để Frontend hiển thị "Chưa có dữ liệu" / N/A
      const dCompletionRate = dTotal > 0 ? Math.round((dCompleted / dTotal) * 100) : null;

      const dInProgTasks = deptTasks.filter((t) => t.status === "IN_PROGRESS");
      const dAvgProg =
        dInProgTasks.length > 0
          ? Math.round(
              dInProgTasks.reduce((acc, t) => acc + (t.updates[0]?.progressPercent ?? 0), 0) /
                dInProgTasks.length
            )
          : dCompleted > 0
          ? 100
          : null;

      return {
        id: u.id,
        name: u.name,
        code: u.code,
        taskCount: dTotal,
        completedTasks: dCompleted,
        inProgressTasks: dInProgress,
        waitingReviewTasks: dWaiting,
        overdueTasks: dOverdue,
        completionRate: dCompletionRate,
        averageProgress: dAvgProg,
        staffCount: u._count.assignments,
      };
    });

    // 6. Danh sách nhiệm vụ cần chỉ đạo khẩn (Attention Tasks)
    const attentionTasks = activeTasks
      .filter(
        (t) =>
          new Date(t.currentDeadline) < now ||
          t.hasIssue ||
          t.status === "WAITING_REVIEW" ||
          t.priority === "Khẩn" ||
          t.priority === "Cao"
      )
      .sort((a, b) => {
        // Ưu tiên: Quá hạn > Có vướng mắc > Chờ duyệt > Hạn gần nhất
        const aOverdue = new Date(a.currentDeadline) < now ? 1 : 0;
        const bOverdue = new Date(b.currentDeadline) < now ? 1 : 0;
        if (bOverdue !== aOverdue) return bOverdue - aOverdue;

        const aIssue = a.hasIssue ? 1 : 0;
        const bIssue = b.hasIssue ? 1 : 0;
        if (bIssue !== aIssue) return bIssue - aIssue;

        return new Date(a.currentDeadline).getTime() - new Date(b.currentDeadline).getTime();
      })
      .slice(0, 10)
      .map((t) => ({
        id: t.id,
        code: t.code,
        title: t.title,
        priority: t.priority,
        status: t.status,
        isOverdue:
          t.status !== "COMPLETED" && t.status !== "DONE" && new Date(t.currentDeadline) < now,
        hasIssue: t.hasIssue,
        issueNotes: t.issueNotes,
        originalDeadline: t.originalDeadline.toISOString(),
        currentDeadline: t.currentDeadline.toISOString(),
        owner: t.owner ? { id: t.owner.id, fullName: t.owner.fullName, code: t.owner.code } : null,
        unit: t.unit ? { id: t.unit.id, name: t.unit.name, code: t.unit.code } : null,
        hasPendingDeadlineRequest: t.deadlineRequests.length > 0,
      }));

    // 7. Cảnh báo nóng (Hot Alerts)
    const hotAlerts = activeTasks
      .filter(
        (t) =>
          (t.status !== "COMPLETED" && t.status !== "DONE" && new Date(t.currentDeadline) < now) ||
          (t.hasIssue && t.status !== "COMPLETED") ||
          (t.priority === "Khẩn" && t.status !== "COMPLETED")
      )
      .slice(0, 5)
      .map((t) => {
        const isOver = new Date(t.currentDeadline) < now;
        return {
          id: t.id,
          code: t.code,
          title: t.title,
          type: isOver
            ? "Quá hạn xử lý"
            : t.hasIssue
            ? "Vướng mắc nghiệp vụ"
            : "Nhiệm vụ khẩn cấp",
          severity: isOver ? "DANGER" : t.hasIssue ? "WARNING" : "INFO",
          ownerName: t.owner?.fullName || "Chưa phân công",
          unitName: t.unit?.name || "",
          message:
            t.issueNotes ||
            (isOver
              ? `Hạn xử lý: ${new Date(t.currentDeadline).toLocaleDateString("vi-VN")}`
              : "Cần tập trung giải quyết dứt điểm"),
        };
      });

    return NextResponse.json({
      success: true,
      kpis: {
        totalTasks,
        inProgress,
        waitingReview,
        completed,
        overdue,
        hasIssue,
        notStarted,
        // Chỉ số phụ tính toán thực tế
        completionRate,
        assignedRate,
        averageProgress,
        onTimeRate,
        newTasksCount,
        urgentTasksCount,
        urgentReviewCount,
      },
      departmentBreakdown,
      attentionTasks,
      hotAlerts,
    });
  } catch (error: any) {
    console.error("Error in GET /api/dashboard/kpi:", error);
    return jsonError("Lỗi hệ thống khi tải dữ liệu KPI: " + error.message, 500);
  }
}
