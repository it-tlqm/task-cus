/**
 * work-item-review.ts — V3.0.1: vòng đời xác nhận công việc tự ghi nhận.
 *
 * Quyết định nghiệp vụ được thực thi ở đây:
 *  - A    : chỉ công việc đã được lãnh đạo xác nhận mới đủ điều kiện điểm chính thức
 *  - A1   : người xác nhận là LÃNH ĐẠO TRỰC TIẾP quản lý công chức
 *  - B2   : bắt buộc có NỘI DUNG KẾT QUẢ khi báo hoàn thành; minh chứng linh hoạt
 *  - C1   : công chức được chọn NGÀY HOÀN THÀNH THỰC TẾ
 *  - D1-A : sau khi gửi xác nhận thì KHOÁ chỉnh sửa; lãnh đạo trả lại thì được sửa & gửi lại;
 *           sau khi xác nhận thì khoá kết quả.
 *  - R3-C : minh chứng bị khoá theo trạng thái hồ sơ (đã gửi / đã xác nhận ⇒ khoá).
 *
 * Lưu ý: MỌI kiểm tra đều thực hiện phía server. Giao diện chỉ hiển thị.
 */
import { prisma } from "@/server/db";
import { SessionUser } from "@/server/auth";
import { getAuthorizedUnitIds } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";
import { createNotification } from "@/server/notifications";
import { assertPeriodWritable } from "@/server/period-guard";
import { assertWorkItemNotLinkedToClosedTask } from "@/server/work-item-linkage";

export type ReviewState = "DRAFT" | "SUBMITTED" | "RETURNED" | "CONFIRMED";
export type ReviewAction = "SUBMIT" | "RETURN" | "CONFIRM";

/** Nhãn hiển thị cho người dùng (không dùng thuật ngữ kỹ thuật). */
export const REVIEW_STATE_LABEL: Record<ReviewState, string> = {
  DRAFT: "Chưa gửi lãnh đạo",
  SUBMITTED: "Đã gửi — chờ lãnh đạo xác nhận",
  RETURNED: "Lãnh đạo trả lại — cần chỉnh sửa và gửi lại",
  CONFIRMED: "Đã được lãnh đạo xác nhận",
};

export const REVIEW_ACTION_LABEL: Record<ReviewAction, string> = {
  SUBMIT: "Gửi lãnh đạo xác nhận",
  RETURN: "Trả lại để chỉnh sửa",
  CONFIRM: "Xác nhận hoàn thành",
};

export function reviewStateOf(item: { reviewState?: string | null }): ReviewState {
  const s = (item.reviewState || "DRAFT") as ReviewState;
  return (["DRAFT", "SUBMITTED", "RETURNED", "CONFIRMED"] as string[]).includes(s) ? s : "DRAFT";
}

/**
 * D1-A / R3-C: hồ sơ đang chờ xác nhận hoặc đã xác nhận thì bị KHOÁ
 * (không sửa nội dung, không thêm/xoá minh chứng).
 */
export function isWorkItemReviewLocked(item: { reviewState?: string | null }): boolean {
  const s = reviewStateOf(item);
  return s === "SUBMITTED" || s === "CONFIRMED";
}

export class ReviewError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

/* ------------------------------------------------------------------ */
/* A1 — Lãnh đạo trực tiếp                                            */
/* ------------------------------------------------------------------ */

/**
 * Lãnh đạo trực tiếp của một cán bộ, lấy theo quan hệ phụ trách đã xác nhận.
 * Nếu cán bộ CHƯA có quan hệ phụ trách nào thì trả về rỗng (không tự suy diễn).
 */
export async function resolveDirectLeaderIds(subordinatePersonId: string): Promise<string[]> {
  const now = new Date();
  const rows = await prisma.personSupervision.findMany({
    where: {
      subordinatePersonId,
      status: "CONFIRMED",
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
    },
    select: { managerPersonId: true },
  });
  return Array.from(new Set(rows.map((r) => r.managerPersonId)));
}

/**
 * Người dùng có quyền xác nhận/trả lại công việc của cán bộ này không?
 *
 * 1. Lãnh đạo trực tiếp theo `person_supervisions` (nguồn chính, quyết định A1).
 * 2. Nếu cán bộ ĐÃ có quan hệ phụ trách nhưng người đang đăng nhập không phải lãnh đạo
 *    của họ ⇒ KHÔNG được quyền (không mở rộng theo đơn vị).
 * 3. Nếu cán bộ CHƯA có quan hệ phụ trách nào ⇒ lùi về phạm vi đơn vị
 *    (lãnh đạo bộ phận phụ trách đơn vị của cán bộ) để hệ thống vẫn dùng được.
 * 4. SYSTEM_ADMIN không tự động có quyền nghiệp vụ (R3-C điểm 5).
 */
export async function canReviewAsDirectLeader(
  user: SessionUser,
  subordinatePersonId: string
): Promise<boolean> {
  if (!user?.personId) return false;
  if (user.role === "SYSTEM_ADMIN") return false;

  const leaderIds = await resolveDirectLeaderIds(subordinatePersonId);
  if (leaderIds.length > 0) return leaderIds.includes(user.personId);

  // Chưa có quan hệ phụ trách → lùi về phạm vi đơn vị
  const authorized = await getAuthorizedUnitIds(user);
  if (authorized === "ALL") return user.role === "UNIT_LEADER";
  if (user.role !== "DEPARTMENT_LEADER") return false;
  const assignments = await prisma.personAssignment.findMany({
    where: { personId: subordinatePersonId },
    select: { unitId: true },
  });
  return assignments.some((a) => authorized.includes(a.unitId));
}

/* ------------------------------------------------------------------ */
/* Chuyển trạng thái                                                   */
/* ------------------------------------------------------------------ */

const TRANSITIONS: Record<ReviewState, ReviewAction[]> = {
  DRAFT: ["SUBMIT"],
  RETURNED: ["SUBMIT"],
  SUBMITTED: ["RETURN", "CONFIRM"],
  CONFIRMED: [],
};

export function assertTransitionAllowed(state: ReviewState, action: ReviewAction) {
  if (!TRANSITIONS[state].includes(action)) {
    const map: Record<string, string> = {
      "DRAFT|SUBMIT": "Công việc đang ở trạng thái không cho phép thao tác này.",
      "RETURNED|SUBMIT": "Công việc đang ở trạng thái không cho phép thao tác này.",
      "SUBMITTED|RETURN": "Chỉ xử lý được hồ sơ đang chờ xác nhận.",
      "SUBMITTED|CONFIRM": "Chỉ xử lý được hồ sơ đang chờ xác nhận.",
      "CONFIRMED|SUBMIT": "Hồ sơ đã được xác nhận, không gửi lại được.",
    };
    throw new ReviewError(map[`${state}|${action}`] || "Thao tác không hợp lệ với trạng thái hiện tại.", 409);
  }
}

/* ------------------------------------------------------------------ */
/* Gửi lên lãnh đạo (SUBMIT)                                          */
/* ------------------------------------------------------------------ */

export async function submitWorkItemForReview(
  user: SessionUser,
  workItemId: string,
  input: { resultText: string; completedOn: Date }
) {
  const item = await prisma.personalWorkItem.findUnique({
    where: { id: workItemId },
    include: { person: true, period: true },
  });
  if (!item) throw new ReviewError("Đầu việc không tồn tại", 404);
  if (item.personId !== user.personId) {
    throw new ReviewError("Chỉ người thực hiện công việc mới có thể gửi lãnh đạo xác nhận.", 403);
  }
  if (item.taskId) {
    // Không tạo hai luồng duyệt trùng cho cùng một kết quả:
    // công việc đã gắn nhiệm vụ thì do quy trình của nhiệm vụ xử lý.
    throw new ReviewError(
      "Công việc này đã gắn với một nhiệm vụ nên được duyệt theo quy trình của nhiệm vụ. Bạn không cần gửi xác nhận riêng.",
      409
    );
  }
  if (!input.resultText || input.resultText.trim().length < 5) {
    throw new ReviewError("Vui lòng nhập nội dung kết quả công việc (ít nhất 5 ký tự).", 400);
  }
  await assertPeriodWritable(item.periodId);
  const state = reviewStateOf(item);
  assertTransitionAllowed(state, "SUBMIT");

  const updated = await prisma.$transaction(async (tx) => {
    await assertWorkItemNotLinkedToClosedTask(workItemId, tx);
    const next = await tx.personalWorkItem.update({
      where: { id: workItemId },
      data: {
        reviewState: "SUBMITTED",
        resultText: input.resultText.trim(),
        completedDate: input.completedOn,
        completedAt: new Date(),
        submittedAt: new Date(),
        submittedById: user.personId,
        reviewedAt: null,
        reviewedById: null,
        reviewNote: null,
        submitCount: { increment: 1 },
        status: "COMPLETED",
      },
    });
    await tx.workItemReview.create({
      data: {
        workItemId,
        action: "SUBMITTED",
        resultText: input.resultText.trim(),
        completedOn: input.completedOn,
        actorId: user.personId,
      },
    });
    return next;
  });

  await recordAuditEvent({
    actorId: user.id,
    action: "WORK_ITEM_REVIEW_SUBMIT",
    resourceType: "PersonalWorkItem",
    resourceId: workItemId,
    newData: {
      title: item.title,
      resultText: input.resultText.trim().slice(0, 500),
      completedOn: input.completedOn.toISOString(),
      submitCount: updated.submitCount,
    },
  });

  // Thông báo lãnh đạo trực tiếp
  const leaderIds = await resolveDirectLeaderIds(item.personId);
  for (const leaderId of leaderIds) {
    await createNotification({
      recipientId: leaderId,
      category: "approval",
      type: "WORK_ITEM_SUBMITTED",
      title: "Có công việc chờ bạn xác nhận",
      content: `${item.person.fullName} đã gửi "${item.title}" để bạn xác nhận.`,
      tag: "CHỜ XÁC NHẬN",
      tagType: "warning",
      entityType: "FEEDBACK",
      entityId: workItemId,
      actionUrl: "/work-item-reviews",
      actionLabel: "Xem và xử lý",
      idempotencyKey: `wi-submit:${workItemId}:${updated.submitCount}`,
    });
  }

  return updated;
}

/* ------------------------------------------------------------------ */
/* Lãnh đạo xác nhận / trả lại (CONFIRM | RETURN)                       */
/* ------------------------------------------------------------------ */

export async function decideWorkItemReview(
  user: SessionUser,
  workItemId: string,
  input: { decision: "RETURN" | "CONFIRM"; note?: string }
) {
  const item = await prisma.personalWorkItem.findUnique({
    where: { id: workItemId },
    include: { person: true, period: true },
  });
  if (!item) throw new ReviewError("Đầu việc không tồn tại", 404);

  const canReview = await canReviewAsDirectLeader(user, item.personId);
  if (!canReview) {
    throw new ReviewError("Bạn không phải lãnh đạo trực tiếp quản lý công việc này.", 403);
  }
  await assertPeriodWritable(item.periodId);
  const state = reviewStateOf(item);
  assertTransitionAllowed(state, input.decision);

  const note = (input.note || "").trim();
  if (input.decision === "RETURN" && note.length < 3) {
    throw new ReviewError("Vui lòng ghi rõ lý do trả lại để cán bộ chỉnh sửa.", 400);
  }

  const updated = await prisma.$transaction(async (tx) => {
    await assertWorkItemNotLinkedToClosedTask(workItemId, tx);
    const next = await tx.personalWorkItem.update({
      where: { id: workItemId },
      data:
        input.decision === "CONFIRM"
          ? {
              reviewState: "CONFIRMED",
              reviewedAt: new Date(),
              reviewedById: user.personId,
              reviewNote: note || null,
              status: "COMPLETED",
            }
          : {
              reviewState: "RETURNED",
              reviewedAt: new Date(),
              reviewedById: user.personId,
              reviewNote: note,
              // trả lại ⇒ mở lại khả năng chỉnh sửa
              status: "IN_PROGRESS",
            },
    });
    await tx.workItemReview.create({
      data: {
        workItemId,
        action: input.decision === "CONFIRM" ? "CONFIRMED" : "RETURNED",
        note: note || null,
        resultText: item.resultText,
        completedOn: item.completedDate,
        actorId: user.personId,
      },
    });
    return next;
  });

  await recordAuditEvent({
    actorId: user.id,
    action: input.decision === "CONFIRM" ? "WORK_ITEM_REVIEW_CONFIRM" : "WORK_ITEM_REVIEW_RETURN",
    resourceType: "PersonalWorkItem",
    resourceId: workItemId,
    oldData: { reviewState: state },
    newData: {
      reviewState: input.decision === "CONFIRM" ? "CONFIRMED" : "RETURNED",
      note: note || null,
      title: item.title,
    },
  });

  await createNotification({
    recipientId: item.personId,
    category: "approval",
    type: input.decision === "CONFIRM" ? "WORK_ITEM_CONFIRMED" : "WORK_ITEM_RETURNED",
    title:
      input.decision === "CONFIRM"
        ? "Lãnh đạo đã xác nhận công việc của bạn"
        : "Lãnh đạo trả lại công việc để chỉnh sửa",
    content:
      input.decision === "CONFIRM"
        ? `"${item.title}" đã được xác nhận và khóa lại.`
        : `"${item.title}" được trả lại. Lý do: ${note}`,
    tag: input.decision === "CONFIRM" ? "ĐÃ XÁC NHẬN" : "TRẢ LẠI",
    tagType: input.decision === "CONFIRM" ? "success" : "warning",
    entityType: "FEEDBACK",
    entityId: workItemId,
    actionUrl: "/my-work",
    actionLabel: "Xem công việc",
    idempotencyKey: `wi-decide:${workItemId}:${Date.now()}`,
  });

  return updated;
}

/* ------------------------------------------------------------------ */
/* Truy vấn                                                            */
/* ------------------------------------------------------------------ */

/** Danh sách công việc chờ lãnh đạo trực tiếp xác nhận. */
export async function listPendingReviews(user: SessionUser) {
  const items = await prisma.personalWorkItem.findMany({
    where: { reviewState: "SUBMITTED" },
    include: {
      person: { select: { id: true, code: true, fullName: true } },
      period: { select: { id: true, title: true, type: true } },
      product: { select: { id: true, code: true, taskName: true } },
      catalogEntry: { select: { id: true, code: true, title: true } },
      _count: { select: { evidences: true } },
    },
    orderBy: { submittedAt: "asc" },
  });
  const visible: any[] = [];
  for (const item of items) {
    if (await canReviewAsDirectLeader(user, item.personId)) visible.push(item);
  }
  return visible;
}

/** Lịch sử xử lý của một công việc. */
export async function listReviewHistory(workItemId: string) {
  return prisma.workItemReview.findMany({
    where: { workItemId },
    include: { actor: { select: { id: true, code: true, fullName: true } } },
    orderBy: { createdAt: "asc" },
  });
}
