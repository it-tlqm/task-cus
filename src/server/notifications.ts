import { prisma } from "@/server/db";
import { getAuthorizedUnitIds } from "@/server/guard";
import { SessionUser } from "@/server/auth";
import { getSystemConfigNumber } from "@/server/system-config";

export interface CreateNotificationInput {
  recipientId: string;
  category?: "task" | "approval" | "deadline" | "system";
  type: string;
  title: string;
  content: string;
  tag?: string;
  tagType?: "danger" | "primary" | "success" | "warning";
  entityType?: "TASK" | "PLAN" | "DEADLINE_REQUEST" | "ROUTINE";
  entityId?: string;
  actionUrl: string;
  actionLabel?: string;
  taskCode?: string;
  idempotencyKey?: string;
}

/**
 * Tạo mới thông báo an toàn vào PostgreSQL, chống trùng lặp tuyệt đối bằng idempotencyKey.
 */
export async function createNotification(input: CreateNotificationInput) {
  try {
    if (input.idempotencyKey) {
      const existing = await prisma.notification.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) {
        return existing;
      }
    }

    return await prisma.notification.create({
      data: {
        recipientId: input.recipientId,
        category: input.category || "task",
        type: input.type,
        title: input.title,
        content: input.content,
        tag: input.tag || "THÔNG BÁO",
        tagType: input.tagType || "primary",
        entityType: input.entityType || null,
        entityId: input.entityId || null,
        actionUrl: input.actionUrl,
        actionLabel: input.actionLabel || "Xem chi tiết",
        taskCode: input.taskCode || null,
        idempotencyKey: input.idempotencyKey || null,
      },
    });
  } catch (error: any) {
    if (error.code === "P2002" && input.idempotencyKey) {
      return await prisma.notification.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
    }
    console.error("Failed to create notification:", error);
    return null;
  }
}

/**
 * Đồng bộ cảnh báo vận hành (quá hạn, sắp đến hạn, chờ phê duyệt, nhắc ca trực) vào PostgreSQL
 * với khóa idempotency ổn định. Bảo đảm không tạo trùng và không ghi đè trạng thái đã đọc/ẩn.
 */
export async function syncOperationalAlerts(user: SessionUser) {
  try {
    const personId = user.personId;
    if (!personId) return;

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const dueSoonHours = await getSystemConfigNumber("taskDueSoonHours", 24);
    const maxWarningItems = await getSystemConfigNumber("taskMaxWarningItems", 10);
    const inDueSoonWindow = new Date(now.getTime() + dueSoonHours * 60 * 60 * 1000);

    // 1. CẢNH BÁO NHIỆM VỤ QUÁ HẠN (Của chính cán bộ phụ trách hoặc phối hợp)
    const overdueTasks = await prisma.task.findMany({
      where: {
        OR: [
          { ownerId: personId },
          { assignees: { some: { personId } } },
        ],
        status: { notIn: ["COMPLETED", "DONE", "CANCELED"] },
        currentDeadline: { lt: now },
      },
      select: {
        id: true,
        code: true,
        title: true,
        currentDeadline: true,
      },
      take: maxWarningItems,
    });

    for (const t of overdueTasks) {
      const deadlineDateStr = t.currentDeadline.toISOString().slice(0, 10);
      await createNotification({
        recipientId: personId,
        category: "deadline",
        type: "TASK_OVERDUE",
        title: `Cảnh báo quá hạn thực hiện: [${t.code}]`,
        content: `${t.title} • Hạn xử lý: ${t.currentDeadline.toLocaleDateString("vi-VN")} đã quá hạn. Cần khẩn trương giải quyết.`,
        tag: "QUÁ HẠN",
        tagType: "danger",
        entityType: "TASK",
        entityId: t.id,
        actionUrl: `/tasks/${t.id}`,
        actionLabel: "Cập nhật tiến độ ngay",
        taskCode: t.code,
        idempotencyKey: `ALERT_OVERDUE_${t.id}_${deadlineDateStr}_${personId}`,
      });
    }

    // 2. CẢNH BÁO SẮP ĐẾN HẠN (Theo khoảng thời gian cấu hình động: ${dueSoonHours} giờ)
    const dueSoonTasks = await prisma.task.findMany({
      where: {
        OR: [
          { ownerId: personId },
          { assignees: { some: { personId } } },
        ],
        status: { notIn: ["COMPLETED", "DONE", "CANCELED"] },
        currentDeadline: { gte: now, lte: inDueSoonWindow },
      },
      select: {
        id: true,
        code: true,
        title: true,
        currentDeadline: true,
      },
      take: maxWarningItems,
    });

    for (const t of dueSoonTasks) {
      const deadlineDateStr = t.currentDeadline.toISOString().slice(0, 10);
      await createNotification({
        recipientId: personId,
        category: "deadline",
        type: "TASK_DUE_SOON",
        title: `Nhắc nhở sắp đến hạn: [${t.code}]`,
        content: `${t.title} • Hạn chót: ${t.currentDeadline.toLocaleDateString("vi-VN")} ${t.currentDeadline.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}.`,
        tag: "SẮP ĐẾN HẠN",
        tagType: "warning",
        entityType: "TASK",
        entityId: t.id,
        actionUrl: `/tasks/${t.id}`,
        actionLabel: "Xem nhiệm vụ",
        taskCode: t.code,
        idempotencyKey: `ALERT_DUESOON_${t.id}_${deadlineDateStr}_${personId}`,
      });
    }

    // 3. CẢNH BÁO PHÊ DUYỆT (Nếu là Lãnh đạo đơn vị hoặc Trưởng bộ phận)
    const isLeader = user.role === "UNIT_LEADER" || user.role === "DEPARTMENT_LEADER";
    if (isLeader) {
      const authorizedUnits = await getAuthorizedUnitIds(user);
      const unitFilter = authorizedUnits === "ALL" ? {} : { in: authorizedUnits };

      // a. Kế hoạch công tác chờ phê duyệt
      const pendingPlans = await prisma.plan.findMany({
        where: {
          status: "SUBMITTED",
          ...(authorizedUnits !== "ALL" ? { unitId: unitFilter } : {}),
        },
        include: { unit: true },
        take: 5,
      });

      for (const p of pendingPlans) {
        await createNotification({
          recipientId: personId,
          category: "approval",
          type: "PLAN_SUBMITTED",
          title: `Kế hoạch tuần đang trình duyệt: ${p.title}`,
          content: `Đơn vị: ${p.unit.name} • Đang chờ lãnh đạo xem xét ký duyệt.`,
          tag: "TRÌNH DUYỆT",
          tagType: "primary",
          entityType: "PLAN",
          entityId: p.id,
          actionUrl: "/approvals",
          actionLabel: "Xem xét & Ký duyệt",
          idempotencyKey: `ALERT_PLAN_SUB_${p.id}_${personId}`,
        });
      }

      // b. Nhiệm vụ chờ nghiệm thu (WAITING_REVIEW)
      const reviewTasks = await prisma.task.findMany({
        where: {
          status: "WAITING_REVIEW",
          ...(authorizedUnits !== "ALL" ? { unitId: unitFilter } : {}),
        },
        include: { owner: true, unit: true },
        take: 5,
      });

      for (const t of reviewTasks) {
        await createNotification({
          recipientId: personId,
          category: "approval",
          type: "TASK_WAITING_REVIEW",
          title: `Nhiệm vụ chờ nghiệm thu: [${t.code}] ${t.title}`,
          content: `Cán bộ: ${t.owner.fullName} (${t.unit.name}) • Đã báo cáo hoàn thành, chờ nghiệm thu kết quả.`,
          tag: "CHỜ NGHIỆM THU",
          tagType: "warning",
          entityType: "TASK",
          entityId: t.id,
          actionUrl: `/approvals`,
          actionLabel: "Nghiệm thu kết quả",
          taskCode: t.code,
          idempotencyKey: `ALERT_TASK_REV_${t.id}_${personId}`,
        });
      }

      // c. Đề nghị lùi hạn chờ duyệt (PENDING)
      const pendingDeadlineReqs = await prisma.deadlineRequest.findMany({
        where: {
          status: "PENDING",
          ...(authorizedUnits !== "ALL" ? { task: { unitId: unitFilter } } : {}),
        },
        include: { task: true, requestedBy: true },
        take: 5,
      });

      for (const dr of pendingDeadlineReqs) {
        await createNotification({
          recipientId: personId,
          category: "approval",
          type: "DEADLINE_REQUEST_PENDING",
          title: `Đề xuất gia hạn thời hạn: [${dr.task.code}]`,
          content: `Cán bộ ${dr.requestedBy.fullName} đề xuất gia hạn đến ${dr.requestedDeadline.toLocaleDateString("vi-VN")}. Lý do: ${dr.reason}`,
          tag: "XIN GIA HẠN",
          tagType: "warning",
          entityType: "DEADLINE_REQUEST",
          entityId: dr.id,
          actionUrl: `/approvals`,
          actionLabel: "Xét duyệt gia hạn",
          taskCode: dr.task.code,
          idempotencyKey: `ALERT_DEADLINE_REQ_${dr.id}_${personId}`,
        });
      }
    }

    // 4. NHẮC NHỞ NHẬT KÝ CA TRỰC HÔM NAY (Trước 17:00)
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const todayRoutine = await prisma.routineEntry.findFirst({
      where: {
        personId,
        createdAt: { gte: todayStart },
      },
    });

    if (!todayRoutine) {
      await createNotification({
        recipientId: personId,
        category: "deadline",
        type: "ROUTINE_REMINDER",
        title: "Nhắc nhở nhật ký ca trực tác nghiệp hôm nay",
        content: "Đồng chí chưa ghi nhận nhật ký tác nghiệp hoặc xác nhận 'Không phát sinh' cho ca trực hôm nay.",
        tag: "HẠN CA TRỰC",
        tagType: "warning",
        entityType: "ROUTINE",
        actionUrl: "/routine",
        actionLabel: "Vào ghi nhật ký",
        idempotencyKey: `ALERT_ROUTINE_${todayStr}_${personId}`,
      });
    }
  } catch (error) {
    console.error("syncOperationalAlerts error:", error);
  }
}
