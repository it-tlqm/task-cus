import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { getAuthorizedUnitIds, jsonError } from "@/server/guard";
import { getIsoWeekFromDate } from "@/lib/period-helper";

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
    const periodParam = searchParams.get("period"); // today, w41, month10, custom, all, or a period ID
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

    // 2. Tải danh sách các kỳ báo cáo có sẵn từ CSDL để không bị cố định vào tuần/tháng cụ thể
    const availablePeriods = await prisma.reportingPeriod.findMany({
      orderBy: { startAt: "desc" },
      take: 12,
      select: {
        id: true,
        title: true,
        type: true,
        startAt: true,
        endAt: true,
        isLocked: true,
      },
    });

    // Xác định phạm vi thời gian / Kỳ báo cáo (Period Filter)
    let periodStart: Date | null = null;
    let periodEnd: Date | null = null;
    let selectedPeriodTitle = "Toàn bộ nhiệm vụ";
    let matchedPeriodId: string | null = null;

    const targetPeriodKey = periodIdParam || periodParam;

    if (targetPeriodKey && targetPeriodKey !== "all") {
      // Kiểm tra nếu là UUID của ReportingPeriod
      const matchedPeriod = availablePeriods.find(
        (p) => p.id === targetPeriodKey || p.title.toLowerCase().includes(targetPeriodKey.toLowerCase())
      );

      if (matchedPeriod) {
        periodStart = matchedPeriod.startAt;
        periodEnd = matchedPeriod.endAt;
        selectedPeriodTitle = matchedPeriod.title;
        matchedPeriodId = matchedPeriod.id;
      } else if (targetPeriodKey === "today") {
        const now = new Date();
        periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        periodEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        selectedPeriodTitle = `Hôm nay (${now.toLocaleDateString("vi-VN")})`;
      } else if (targetPeriodKey === "w41") {
        const pW41 = availablePeriods.find((p) => p.title.includes("Tuần 41"));
        if (pW41) {
          periodStart = pW41.startAt;
          periodEnd = pW41.endAt;
          selectedPeriodTitle = pW41.title;
          matchedPeriodId = pW41.id;
        } else {
          periodStart = new Date("2026-10-05T00:00:00Z");
          periodEnd = new Date("2026-10-12T23:59:59Z");
          selectedPeriodTitle = "Tuần 41/2026";
        }
      } else if (targetPeriodKey === "month10") {
        const pMonth = availablePeriods.find((p) => p.type === "MONTH" && p.title.includes("Tháng 10"));
        if (pMonth) {
          periodStart = pMonth.startAt;
          periodEnd = pMonth.endAt;
          selectedPeriodTitle = pMonth.title;
          matchedPeriodId = pMonth.id;
        } else {
          periodStart = new Date("2026-10-01T00:00:00Z");
          periodEnd = new Date("2026-10-31T23:59:59Z");
          selectedPeriodTitle = "Tháng 10/2026";
        }
      } else if (targetPeriodKey === "week") {
        // Tuần hiện tại theo lịch (động — không kẹt ở Tuần 41):
        // ưu tiên kỳ WEEK trong DB chứa hôm nay, nếu không có thì tính Thứ 2–Chủ nhật theo lịch
        const nowW = new Date();
        const containing = availablePeriods.find(
          (p) => p.type === "WEEK" && p.startAt <= nowW && nowW <= p.endAt
        );
        if (containing) {
          periodStart = containing.startAt;
          periodEnd = containing.endAt;
          selectedPeriodTitle = containing.title;
          matchedPeriodId = containing.id;
        } else {
          const dow = (nowW.getDay() + 6) % 7; // Thứ 2 = 0
          periodStart = new Date(nowW.getFullYear(), nowW.getMonth(), nowW.getDate() - dow, 0, 0, 0);
          periodEnd = new Date(periodStart.getTime() + 6 * 86400000 + 86399999);
          const iso = getIsoWeekFromDate(nowW);
          selectedPeriodTitle = `Tuần ${iso.weekNumber}/${iso.year}`;
        }
      } else if (targetPeriodKey === "month") {
        // Tháng hiện tại theo lịch (động)
        const nowM = new Date();
        const containingM = availablePeriods.find(
          (p) => p.type === "MONTH" && p.startAt <= nowM && nowM <= p.endAt
        );
        if (containingM) {
          periodStart = containingM.startAt;
          periodEnd = containingM.endAt;
          selectedPeriodTitle = containingM.title;
          matchedPeriodId = containingM.id;
        } else {
          periodStart = new Date(nowM.getFullYear(), nowM.getMonth(), 1, 0, 0, 0);
          periodEnd = new Date(nowM.getFullYear(), nowM.getMonth() + 1, 0, 23, 59, 59, 999);
          selectedPeriodTitle = `Tháng ${nowM.getMonth() + 1}/${nowM.getFullYear()}`;
        }
      } else if (targetPeriodKey === "custom" && startDateParam && endDateParam) {
        periodStart = new Date(startDateParam);
        periodEnd = new Date(endDateParam);
        selectedPeriodTitle = `Từ ${new Date(startDateParam).toLocaleDateString("vi-VN")} đến ${new Date(endDateParam).toLocaleDateString("vi-VN")}`;
      }
    }

    // Áp dụng điều kiện lọc thời gian theo quy tắc nhất quán:
    // Nhiệm vụ thuộc kỳ nếu:
    // (a) Có liên kết với Kế hoạch của kỳ đó, HOẶC
    // (b) Hạn hiện hành nằm trong khoảng ngày của kỳ, HOẶC
    // (c) Được tạo trong khoảng ngày của kỳ
    if (periodStart && periodEnd) {
      const periodCondition: any[] = [
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
      ];

      if (matchedPeriodId) {
        periodCondition.push({
          planLinks: {
            some: {
              planItem: {
                plan: {
                  periodId: matchedPeriodId,
                },
              },
            },
          },
        });
      }

      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: periodCondition }];
        delete where.OR;
      } else {
        where.OR = periodCondition;
      }
    }

    // 3. Truy vấn danh sách nhiệm vụ từ PostgreSQL kèm lịch sử cập nhật
    const now = new Date();

    const tasks = await prisma.task.findMany({
      where,
      include: {
        owner: { select: { id: true, fullName: true, code: true } },
        unit: { select: { id: true, name: true, code: true } },
        updates: {
          orderBy: { createdAt: "desc" },
          select: {
            progressPercent: true,
            createdAt: true,
            statusBefore: true,
            statusAfter: true,
          },
        },
        deadlineRequests: {
          where: { status: "PENDING" },
          select: { id: true, requestedDeadline: true, reason: true },
        },
      },
      orderBy: [{ currentDeadline: "asc" }, { createdAt: "desc" }],
    });

    // 4. Bóc tách danh sách và tính toán KPI theo chuẩn nghiệp vụ
    // Loại bỏ các nhiệm vụ CANCELED
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

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    let newTasksCount = 0;

    // Danh sách nhiệm vụ hoàn thành và đang thực hiện
    const completedTasksList: typeof activeTasks = [];
    const inProgressTasksList: typeof activeTasks = [];

    for (const t of activeTasks) {
      // Trạng thái hoàn thành chính thức: chỉ tính COMPLETED hoặc DONE
      // WAITING_REVIEW TUYỆT ĐỐI KHÔNG ĐƯỢC tính vào COMPLETED
      const isDone = t.status === "COMPLETED" || t.status === "DONE";
      const isWaiting = t.status === "WAITING_REVIEW";
      const isInProg = t.status === "IN_PROGRESS";
      const isNotStart = t.status === "NOT_STARTED";
      const isOver = !isDone && new Date(t.currentDeadline) < now;
      const isUrgent = t.priority === "Cao" || t.priority === "Khẩn";

      if (isDone) {
        completed++;
        completedTasksList.push(t);
      } else if (isWaiting) {
        waitingReview++;
      } else if (isInProg) {
        inProgress++;
        inProgressTasksList.push(t);
      } else if (isNotStart) {
        notStarted++;
      }

      if (isOver) overdue++;
      if (t.hasIssue && !isDone) hasIssue++;
      if (t.ownerId) ownedTasksCount++;
      if (isUrgent && !isDone) urgentTasksCount++;
      if (isWaiting && isUrgent) urgentReviewCount++;

      // Nhiệm vụ mới trong 7 ngày
      if (new Date(t.createdAt) >= sevenDaysAgo) {
        newTasksCount++;
      }
    }

    // 4.1 TÍNH TIẾN ĐỘ TRUNG BÌNH (averageProgress):
    // Yêu cầu: Không tính trung bình tất cả bản ghi TaskUpdate trong lịch sử.
    // Mỗi Task chỉ được đóng góp duy nhất MỘT giá trị tiến độ hiện hành (t.updates[0]).
    let sumCurrentProgress = 0;
    for (const t of inProgressTasksList) {
      // Lấy bản cập nhật gần nhất của Task này
      const latestProgress = t.updates[0]?.progressPercent ?? 0;
      sumCurrentProgress += latestProgress;
    }
    const averageProgress =
      inProgressTasksList.length > 0
        ? Math.round(sumCurrentProgress / inProgressTasksList.length)
        : null;

    // 4.2 TÍNH TỶ LỆ HOÀN THÀNH ĐÚNG HẠN (onTimeRate):
    // Yêu cầu: Không sử dụng Task.updatedAt.
    // Tìm thời điểm thực tế nhiệm vụ chuyển sang COMPLETED/DONE trong TaskUpdate hoặc AuditEvent.
    // Nếu dữ liệu lịch sử chưa đủ để xác định thời điểm hoàn thành, trả về null ("Chưa đủ dữ liệu").
    const tasksMissingUpdateCompletion = completedTasksList.filter(
      (t) => !t.updates.some((u) => u.statusAfter === "COMPLETED" || u.statusAfter === "DONE")
    );

    const auditCompletionMap = new Map<string, Date>();
    if (tasksMissingUpdateCompletion.length > 0) {
      const taskIdsToCheck = tasksMissingUpdateCompletion.map((t) => t.id);
      const auditLogs = await prisma.auditEvent.findMany({
        where: {
          resourceType: "Task",
          resourceId: { in: taskIdsToCheck },
          action: "TASK_APPROVE_COMPLETED",
        },
        select: { resourceId: true, timestamp: true },
        orderBy: { timestamp: "desc" },
      });
      for (const log of auditLogs) {
        if (log.resourceId && !auditCompletionMap.has(log.resourceId)) {
          auditCompletionMap.set(log.resourceId, log.timestamp);
        }
      }
    }

    let evaluableCompletedCount = 0;
    let onTimeCompletedCount = 0;

    for (const t of completedTasksList) {
      // Tìm bản cập nhật khi nhiệm vụ được chuyển sang COMPLETED/DONE
      const completionUpdate = t.updates.find(
        (u) => u.statusAfter === "COMPLETED" || u.statusAfter === "DONE"
      );

      let actualCompletedAt: Date | null = null;
      if (completionUpdate) {
        actualCompletedAt = completionUpdate.createdAt;
      } else if (auditCompletionMap.has(t.id)) {
        actualCompletedAt = auditCompletionMap.get(t.id)!;
      }

      // Chỉ đánh giá nếu có bằng chứng lịch sử rõ ràng về thời điểm nghiệm thu hoàn thành
      if (actualCompletedAt) {
        evaluableCompletedCount++;
        // Đối chiếu với thời hạn có hiệu lực tại thời điểm đó (currentDeadline)
        if (new Date(actualCompletedAt) <= new Date(t.currentDeadline)) {
          onTimeCompletedCount++;
        }
      }
    }

    const onTimeRate =
      evaluableCompletedCount > 0
        ? Math.round((onTimeCompletedCount / evaluableCompletedCount) * 100)
        : null;

    // Tỷ lệ hoàn thành: completed / totalTasks * 100 (Nếu total = 0 -> null)
    const completionRate = totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : null;

    // Tỷ lệ có cán bộ chủ trì: owned / totalTasks * 100
    const assignedRate = totalTasks > 0 ? Math.round((ownedTasksCount / totalTasks) * 100) : null;

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
        // Số cán bộ = số NGƯỜI duy nhất (không đếm trùng người kiêm nhiệm nhiều bộ phận)
        assignments: { select: { personId: true } },
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
      // Nếu tổng số việc = 0, trả về null để hiển thị "Chưa có dữ liệu"
      const dCompletionRate = dTotal > 0 ? Math.round((dCompleted / dTotal) * 100) : null;

      const dInProgTasks = deptTasks.filter((t) => t.status === "IN_PROGRESS");
      const dSumProg = dInProgTasks.reduce((acc, t) => acc + (t.updates[0]?.progressPercent ?? 0), 0);
      const dAvgProg = dInProgTasks.length > 0 ? Math.round(dSumProg / dInProgTasks.length) : null;

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
        staffCount: new Set(u.assignments.map((a) => a.personId)).size,
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
      selectedPeriod: {
        key: targetPeriodKey || "all",
        title: selectedPeriodTitle,
        startAt: periodStart?.toISOString() || null,
        endAt: periodEnd?.toISOString() || null,
      },
      availablePeriods,
      kpis: {
        totalTasks,
        inProgress,
        waitingReview,
        completed,
        overdue,
        hasIssue,
        notStarted,
        completionRate,
        assignedRate,
        averageProgress,
        onTimeRate,
        evaluableCompletedCount,
        onTimeCompletedCount,
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
