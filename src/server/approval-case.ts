/**
 * YC-37 — Hồ sơ chấp thuận / không đồng ý / yêu cầu giải trình.
 *
 * Nguyên tắc:
 * - Bấm "Chấp thuận" CHỈ mở bước XEM TRƯỚC. Không ghi quyết định, không đổi trạng thái.
 * - Quyết định gồm 3 lựa chọn: AGREE (đồng ý) · REJECT (không đồng ý, có lý do) ·
 *   CLARIFY (yêu cầu giải trình, có nội dung cần giải trình).
 * - Người được yêu cầu giải trình có thể bổ sung và gửi lại; vòng lặp nằm trên
 *   `approval_cases` (khoá duy nhất caseType+resourceId) → KHÔNG tạo Task/hồ sơ trùng.
 * - Mọi lượt quyết định đều lưu vào `approval_decisions` (lịch sử đầy đủ).
 * - Quyền kiểm tra ở SERVER; chống bấm lặp bằng update có điều kiện (trạng thái).
 * - Phân biệt quy trình: duyệt CÔNG VIỆC (TASK_RESULT) ≠ phê duyệt KẾ HOẠCH (PLAN)
 *   ≠ duyệt GIA HẠN (DEADLINE_REQUEST). Quy trình duyệt KẾT QUẢ ĐÁNH GIÁ CÁ NHÂN
 *   (PERSONAL_EVALUATION) là quy trình riêng — chưa có nguồn nên chưa mở.
 */

import { prisma } from "./db";
import { formatVnDateTime } from "@/lib/datetime";
import { SessionUser } from "./auth";
import { getAuthorizedUnitIds, verifyTaskAccess } from "./guard";
import { recordAuditEvent } from "./audit";
import { createNotification } from "./notifications";

export type ApprovalCaseType = "TASK_RESULT" | "PLAN" | "DEADLINE_REQUEST";
export type ApprovalAction = "AGREE" | "REJECT" | "CLARIFY" | "RESPOND";
export type ApprovalCaseStatus =
  | "OPEN"
  | "AGREED"
  | "REJECTED"
  | "CLARIFY_REQUESTED"
  | "CLOSED";

export const APPROVAL_CASE_TYPES: ApprovalCaseType[] = [
  "TASK_RESULT",
  "PLAN",
  "DEADLINE_REQUEST",
];

export const APPROVAL_ACTION_LABELS: Record<ApprovalAction, string> = {
  AGREE: "Đồng ý",
  REJECT: "Không đồng ý",
  CLARIFY: "Yêu cầu giải trình",
  RESPOND: "Phản hồi giải trình",
};

export function isApprovalCaseType(v: string): v is ApprovalCaseType {
  return (APPROVAL_CASE_TYPES as string[]).includes(v);
}

// ---------------------------------------------------------------- helpers

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function diffDays(a: Date, b: Date) {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86400000);
}

// YC-38 UAT fix: hiển thị thời hạn theo giờ Việt Nam, KHÔNG phụ thuộc múi giờ máy chủ
function formatDateTime(v: Date | string | null | undefined) {
  if (!v) return null;
  return formatVnDateTime(v);
}

/** Người có quyền quyết định hồ sơ này không? */
async function canDecide(user: SessionUser, unitId: string | null): Promise<boolean> {
  if (user.role === "UNIT_LEADER") return true;
  if (user.role === "SYSTEM_ADMIN") return false; // quản trị kỹ thuật không duyệt nghiệp vụ
  if (user.role === "DEPARTMENT_LEADER") {
    const units = await getAuthorizedUnitIds(user);
    if (units === "ALL") return true;
    return !!unitId && units.includes(unitId);
  }
  return false;
}

// ---------------------------------------------------------------- preview

export interface ApprovalPreviewAttachment {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedBy: string;
  createdAt: string;
  /** Endpoint có kiểm tra quyền — không trả URL public. */
  downloadUrl: string;
}

export interface ApprovalPreviewHistoryEntry {
  round: number;
  action: ApprovalAction;
  actionLabel: string;
  reason: string | null;
  content: string | null;
  actorName: string;
  actorPersonId: string | null;
  createdAt: string;
}

export interface ApprovalPreview {
  caseType: ApprovalCaseType;
  caseId: string | null;
  resourceId: string;
  code: string;
  title: string;
  caseStatus: ApprovalCaseStatus | "NOT_CREATED";
  currentRound: number;
  submitter: { id: string | null; fullName: string; unitName: string | null } | null;
  submittedAt: string | null;
  deadline: {
    original: string | null;
    current: string | null;
    extensionDays: number | null;
    requestedDeadline: string | null;
  };
  progress: { percent: number | null; status: string | null; updatedAt: string | null };
  result: { expected: string | null; actual: string | null };
  content: Record<string, unknown>;
  attachments: ApprovalPreviewAttachment[];
  history: ApprovalPreviewHistoryEntry[];
  permissions: {
    canDecide: boolean;
    canRespond: boolean;
    reason: string | null;
  };
  warnings: string[];
}

/** Lấy hồ sơ + quyền, KHÔNG ghi bất cứ gì. */
export async function buildApprovalPreview(
  user: SessionUser,
  caseType: ApprovalCaseType,
  resourceId: string
): Promise<{ ok: true; preview: ApprovalPreview } | { ok: false; status: number; error: string }> {
  const warnings: string[] = [];
  let code = "";
  let title = "";
  let unitId: string | null = null;
  let submitterId: string | null = null;
  let submittedAt: string | null = null;
  const deadline = {
    original: null as string | null,
    current: null as string | null,
    extensionDays: null as number | null,
    requestedDeadline: null as string | null,
  };
  const progress = { percent: null as number | null, status: null as string | null, updatedAt: null as string | null };
  const result = { expected: null as string | null, actual: null as string | null };
  const content: Record<string, unknown> = {};
  let attachments: ApprovalPreviewAttachment[] = [];
  let resourceStatus: string | null = null;
  let resourceOwnerId: string | null = null;

  if (caseType === "TASK_RESULT") {
    const task = await prisma.task.findUnique({
      where: { id: resourceId },
      include: {
        owner: { select: { id: true, fullName: true } },
        unit: { select: { id: true, name: true } },
        assignees: { include: { person: { select: { id: true, fullName: true } } } },
        attachments: {
          include: { uploadedBy: { select: { fullName: true } } },
          orderBy: { createdAt: "desc" },
        },
        updates: {
          include: { author: { select: { fullName: true } } },
          orderBy: { createdAt: "desc" },
          take: 5,
        },
        planLinks: {
          include: { planItem: { include: { plan: { select: { id: true, title: true, status: true } } } } },
        },
        workItems: { select: { id: true, title: true, completedDate: true, dueDate: true } },
      },
    });
    if (!task) return { ok: false, status: 404, error: "Nhiệm vụ không tồn tại" };

    const access = await verifyTaskAccess(user, task.id, "READ");
    if (!access.allowed) {
      return { ok: false, status: 403, error: access.reason || "Không có quyền xem hồ sơ này" };
    }

    code = task.code;
    title = task.title;
    unitId = task.unitId;
    submitterId = task.ownerId;
    resourceStatus = task.status;
    resourceOwnerId = task.ownerId;
    submittedAt = task.updatedAt.toISOString();
    deadline.original = formatDateTime(task.originalDeadline);
    deadline.current = formatDateTime(task.currentDeadline);
    const ext = diffDays(task.currentDeadline, task.originalDeadline);
    deadline.extensionDays = ext > 0 ? ext : null;
    result.expected = task.expectedResultText;
    result.actual = task.actualResultText;
    progress.status = task.status;
    progress.updatedAt = task.updatedAt.toISOString();

    const lastUpdate = task.updates[0];
    progress.percent = lastUpdate?.progressPercent ?? null;

    content.unitName = task.unit?.name ?? null;
    content.ownerName = task.owner?.fullName ?? null;
    content.priority = task.priority;
    content.description = task.description;
    content.hasIssue = task.hasIssue;
    content.issueNotes = task.issueNotes;
    content.assignees = task.assignees.map((a) => ({
      name: a.person?.fullName ?? "—",
      role: a.role,
    }));
    content.planLink = task.planLinks[0]?.planItem?.plan
      ? {
          planId: task.planLinks[0].planItem.plan.id,
          planTitle: task.planLinks[0].planItem.plan.title,
          planStatus: task.planLinks[0].planItem.plan.status,
        }
      : null;
    content.recentUpdates = task.updates.map((u) => ({
      percent: u.progressPercent,
      statusBefore: u.statusBefore,
      statusAfter: u.statusAfter,
      notes: u.notes,
      at: formatDateTime(u.createdAt),
      author: u.author?.fullName ?? "",
    }));
    content.linkedWorkItems = task.workItems.map((w) => ({
      title: w.title,
      dueDate: formatDateTime(w.dueDate),
      completedDate: formatDateTime(w.completedDate),
    }));

    attachments = task.attachments.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      fileSize: a.fileSize,
      mimeType: a.mimeType,
      uploadedBy: a.uploadedBy?.fullName ?? "—",
      createdAt: a.createdAt.toISOString(),
      downloadUrl: `/api/tasks/${task.id}/attachments`,
    }));

    if (!task.actualResultText) {
      warnings.push("Nhiệm vụ chưa có nội dung kết quả thực hiện — cân nhắc yêu cầu bổ sung.");
    }
    if (task.hasIssue) {
      warnings.push("Nhiệm vụ đang được đánh dấu có vấn đề (xem ghi chú vấn đề).");
    }
  } else if (caseType === "PLAN") {
    const plan = await prisma.plan.findUnique({
      where: { id: resourceId },
      include: {
        unit: { select: { id: true, name: true } },
        items: {
          include: { group: { select: { name: true } } },
          orderBy: { sortOrder: "asc" },
        },
        period: { select: { id: true, title: true, startAt: true, endAt: true, isLocked: true } },
        versions: { orderBy: { version: "desc" }, take: 3 },
      },
    });
    if (!plan) return { ok: false, status: 404, error: "Kế hoạch không tồn tại" };

    const authorizedUnits = await getAuthorizedUnitIds(user);
    const isUnitAuthorized = authorizedUnits === "ALL" || authorizedUnits.includes(plan.unitId);
    const isCreator = plan.creatorId === user.personId;
    if (!isUnitAuthorized && !isCreator) {
      return { ok: false, status: 403, error: "Bạn không có quyền xem kế hoạch này" };
    }

    code = plan.id.slice(0, 8);
    title = plan.title;
    unitId = plan.unitId;
    submitterId = plan.creatorId;
    resourceStatus = plan.status;
    submittedAt = plan.updatedAt.toISOString();
    deadline.original = formatDateTime(plan.period?.startAt);
    deadline.current = formatDateTime(plan.period?.endAt);
    result.expected = null;

    const planCreator = plan.creatorId
      ? await prisma.person.findUnique({
          where: { id: plan.creatorId },
          select: { fullName: true },
        })
      : null;
    content.unitName = plan.unit?.name ?? null;
    content.creatorName = planCreator?.fullName ?? null;
    content.planStatus = plan.status;
    content.periodTitle = plan.period?.title ?? null;
    content.periodLocked = plan.period?.isLocked ?? false;
    content.items = plan.items.map((it) => ({
      id: it.id,
      title: it.title,
      group: it.group?.name ?? null,
    }));
    content.versions = plan.versions.map((v) => ({
      version: v.version,
      statusBefore: v.statusBefore,
      statusAfter: v.statusAfter,
      at: formatDateTime(v.createdAt),
      reason: v.reason ?? null,
      createdBy: v.createdBy ?? null,
    }));
  } else if (caseType === "DEADLINE_REQUEST") {
    const req = await prisma.deadlineRequest.findUnique({
      where: { id: resourceId },
      include: {
        task: {
          include: {
            owner: { select: { id: true, fullName: true } },
            unit: { select: { id: true, name: true } },
          },
        },
        requestedBy: { select: { id: true, fullName: true } },
      },
    });
    if (!req) return { ok: false, status: 404, error: "Đề nghị gia hạn không tồn tại" };

    const access = await verifyTaskAccess(user, req.taskId, "READ");
    if (!access.allowed) {
      return { ok: false, status: 403, error: access.reason || "Không có quyền xem hồ sơ này" };
    }

    code = req.task.code;
    title = `Gia hạn: ${req.task.title}`;
    unitId = req.task.unitId;
    submitterId = req.requestedById;
    resourceStatus = req.status;
    resourceOwnerId = req.requestedById;
    submittedAt = req.createdAt.toISOString();
    deadline.original = formatDateTime(req.task.originalDeadline);
    deadline.current = formatDateTime(req.task.currentDeadline);
    deadline.requestedDeadline = formatDateTime(req.requestedDeadline);
    const ext = diffDays(req.requestedDeadline, req.task.currentDeadline);
    deadline.extensionDays = ext > 0 ? ext : null;
    result.expected = req.task.expectedResultText;
    result.actual = req.task.actualResultText;
    progress.status = req.task.status;

    content.unitName = req.task.unit?.name ?? null;
    content.ownerName = req.task.owner?.fullName ?? null;
    content.requestedByName = req.requestedBy?.fullName ?? null;
    content.reason = req.reason;
    content.taskStatus = req.task.status;
    content.requestStatus = req.status;
  } else {
    return { ok: false, status: 400, error: "Loại hồ sơ không hợp lệ" };
  }

  // Lịch sử quyết định (nếu có case)
  const existingCase = await prisma.approvalCase.findUnique({
    where: { caseType_resourceId: { caseType, resourceId } },
    include: {
      decisions: { orderBy: { createdAt: "asc" } },
    },
  });

  const history: ApprovalPreviewHistoryEntry[] = (existingCase?.decisions ?? []).map((d) => ({
    round: d.round,
    action: d.action as ApprovalAction,
    actionLabel: APPROVAL_ACTION_LABELS[d.action as ApprovalAction] ?? d.action,
    reason: d.reason,
    content: d.content,
    actorName: d.actorPersonId ? String(d.actorPersonId) : "—",
    actorPersonId: d.actorPersonId,
    createdAt: d.createdAt.toISOString(),
  }));

  const isDecider = await canDecide(user, unitId);
  const isSubmitter = !!submitterId && submitterId === user.personId;
  const rawCaseStatus = existingCase?.status;
  const caseStatus: ApprovalCaseStatus | "NOT_CREATED" = rawCaseStatus
    ? (rawCaseStatus as ApprovalCaseStatus)
    : "NOT_CREATED";
  const caseOpen = caseStatus === "OPEN" || caseStatus === "NOT_CREATED";

  let canRespond = false;
  let permissionReason: string | null = null;
  if (caseStatus === "CLARIFY_REQUESTED") {
    canRespond = isSubmitter;
    if (isSubmitter) {
      permissionReason = "Bạn được yêu cầu giải trình — bổ sung nội dung rồi gửi lại.";
    }
  } else if (isDecider) {
    permissionReason = null;
  } else if (caseStatus === "AGREED" || caseStatus === "REJECTED") {
    permissionReason = "Hồ sơ đã được xử lý.";
  } else {
    permissionReason = "Bạn không có thẩm quyền quyết định hồ sơ này.";
  }

  // Người xem trước phải thấy cảnh báo nếu hồ sơ đã xử lý
  if (caseStatus === "AGREED") warnings.push("Hồ sơ đã được chấp thuận trước đó.");
  if (caseStatus === "REJECTED") warnings.push("Hồ sơ đã bị từ chối trước đó.");
  if (caseStatus === "CLARIFY_REQUESTED")
    warnings.push("Hồ sơ đang chờ người trình bổ sung giải trình.");

  const submitter = submitterId
    ? await prisma.person.findUnique({
        where: { id: submitterId },
        select: { id: true, fullName: true, assignments: { include: { unit: { select: { name: true } } } } },
      })
    : null;

  const preview: ApprovalPreview = {
    caseType,
    caseId: existingCase?.id ?? null,
    resourceId,
    code,
    title,
    caseStatus,
    currentRound: existingCase?.currentRound ?? 1,
    submitter: submitter
      ? {
          id: submitter.id,
          fullName: submitter.fullName,
          unitName: submitter.assignments[0]?.unit?.name ?? (content.unitName as string) ?? null,
        }
      : null,
    submittedAt,
    deadline,
    progress,
    result,
    content,
    attachments,
    history,
    permissions: {
      // Hồ sơ chưa tạo (lần đầu) vẫn cho quyết định — case được tạo khi ghi quyết định.
      canDecide: isDecider && caseOpen,
      canRespond,
      reason: permissionReason,
    },
    warnings,
  };

  // Ghi log truy cập hồ sơ (không ghi quyết định)
  await recordAuditEvent({
    actorId: user.id,
    action: "APPROVAL_PREVIEW_VIEW",
    resourceType: "ApprovalCase",
    resourceId: existingCase?.id ?? resourceId,
    newData: { caseType, resourceId, code, caseStatus },
  });

  void resourceStatus;
  void resourceOwnerId;
  return { ok: true, preview };
}

// ---------------------------------------------------------------- decision

export interface DecideParams {
  user: SessionUser;
  caseType: ApprovalCaseType;
  resourceId: string;
  action: "AGREE" | "REJECT" | "CLARIFY";
  reason?: string | null;
  content?: string | null;
}

export interface DecideResult {
  success: boolean;
  message?: string;
  status?: number;
  error?: string;
  data?: { caseId: string; status: string; round: number; deduplicated?: boolean };
}

/** Ghi quyết định + áp dụng hiệu ứng nghiệp vụ, chống bấm lặp bằng update có điều kiện. */
export async function decideApproval(params: DecideParams): Promise<DecideResult> {
  const { user, caseType, resourceId, action } = params;
  const reason = params.reason?.trim() || null;
  const content = params.content?.trim() || null;

  if (action === "REJECT" && !reason) {
    return { success: false, status: 400, error: "Vui lòng nêu lý do không đồng ý." };
  }
  if (action === "CLARIFY" && !content) {
    return { success: false, status: 400, error: "Vui lòng nêu nội dung cần giải trình." };
  }

  // 1) Lấy hồ sơ nghiệp vụ + kiểm tra quyền
  let unitId: string | null = null;
  let submitterId: string | null = null;
  let code = "";
  let title = "";
  let resourceStatus: string | null = null;
  let notifyUrl = "/approvals";
  let notifyLabel = "Xem hồ sơ";
  let taskId: string | null = null;

  if (caseType === "TASK_RESULT") {
    const task = await prisma.task.findUnique({
      where: { id: resourceId },
      include: { owner: { select: { id: true, fullName: true } } },
    });
    if (!task) return { success: false, status: 404, error: "Nhiệm vụ không tồn tại" };
    const access = await verifyTaskAccess(user, task.id, "WRITE");
    if (!access.allowed) {
      return { success: false, status: 403, error: access.reason || "Không có quyền xử lý hồ sơ này" };
    }
    unitId = task.unitId;
    submitterId = task.ownerId;
    code = task.code;
    title = task.title;
    resourceStatus = task.status;
    taskId = task.id;
  } else if (caseType === "PLAN") {
    const plan = await prisma.plan.findUnique({
      where: { id: resourceId },
    });
    if (!plan) return { success: false, status: 404, error: "Kế hoạch không tồn tại" };
    const units = await getAuthorizedUnitIds(user);
    const isUnitAuthorized = units === "ALL" || units.includes(plan.unitId);
    if (!isUnitAuthorized) {
      return { success: false, status: 403, error: "Bạn không có quyền xử lý kế hoạch của bộ phận khác" };
    }
    if (plan.creatorId && plan.creatorId === user.personId) {
      return { success: false, status: 403, error: "Người lập kế hoạch không được tự phê duyệt kế hoạch của mình" };
    }
    unitId = plan.unitId;
    submitterId = plan.creatorId;
    code = plan.id.slice(0, 8);
    title = plan.title;
    resourceStatus = plan.status;
    notifyUrl = "/plans";
    notifyLabel = "Xem kế hoạch";
  } else if (caseType === "DEADLINE_REQUEST") {
    const req = await prisma.deadlineRequest.findUnique({
      where: { id: resourceId },
      include: { task: { include: { owner: { select: { id: true, fullName: true } } } } },
    });
    if (!req) return { success: false, status: 404, error: "Đề nghị gia hạn không tồn tại" };
    const access = await verifyTaskAccess(user, req.taskId, "WRITE");
    if (!access.allowed) {
      return { success: false, status: 403, error: access.reason || "Không có quyền xử lý hồ sơ này" };
    }
    unitId = req.task.unitId;
    submitterId = req.requestedById;
    code = req.task.code;
    title = `Gia hạn: ${req.task.title}`;
    resourceStatus = req.status;
    taskId = req.taskId;
  } else {
    return { success: false, status: 400, error: "Loại hồ sơ không hợp lệ" };
  }

  const allowedToDecide = await canDecide(user, unitId);
  if (!allowedToDecide) {
    return { success: false, status: 403, error: "Bạn không có thẩm quyền quyết định hồ sơ này" };
  }

  // KHÔNG AI TỰ QUYẾT ĐỊNH HỒ SƠ CỦA MÌNH (áp dụng cho mọi loại hồ sơ:
  // nghiệm thu nhiệm vụ, phê duyệt kế hoạch, gia hạn hạn chót).
  // Lãnh đạo vẫn duyệt được hồ sơ của người khác trong đơn vị.
  if (submitterId && submitterId === user.personId) {
    return {
      success: false,
      status: 403,
      error: "Bạn không được tự quyết định hồ sơ do chính mình trình — cần lãnh đạo khác thẩm quyền xử lý.",
    };
  }

  // 2) Điều kiện trạng thái hợp lệ theo từng quy trình
  if (caseType === "TASK_RESULT" && resourceStatus !== "WAITING_REVIEW") {
    return {
      success: false,
      status: 409,
      error:
        resourceStatus === "COMPLETED" || resourceStatus === "DONE"
          ? "Nhiệm vụ này đã được nghiệm thu trước đó — không thể quyết định lại."
          : `Nhiệm vụ đang ở trạng thái "${resourceStatus}" — chỉ quyết định được khi đang chờ nghiệm thu.`,
    };
  }
  if (caseType === "PLAN" && resourceStatus !== "SUBMITTED") {
    return {
      success: false,
      status: 409,
      error:
        resourceStatus === "APPROVED" || resourceStatus === "IN_EFFECT"
          ? "Kế hoạch đã được phê duyệt trước đó — không thể quyết định lại."
          : `Chỉ kế hoạch ở trạng thái "SUBMITTED" mới có thể quyết định.`,
    };
  }
  if (caseType === "DEADLINE_REQUEST" && resourceStatus !== "PENDING") {
    return {
      success: false,
      status: 409,
      error: "Đề nghị gia hạn này đã được xử lý trước đó.",
    };
  }

  // 3) Tạo/lấy case (khoá duy nhất caseType+resourceId → không tạo hồ sơ trùng)
  const approvalCase = await prisma.approvalCase.upsert({
    where: { caseType_resourceId: { caseType, resourceId } },
    update: {
      title,
      resourceCode: code,
      unitId,
      submittedById: submitterId,
    },
    create: {
      caseType,
      resourceId,
      resourceCode: code,
      title,
      unitId,
      submittedById: submitterId,
      status: "OPEN",
    },
  });

  // 4) Chống bấm lặp: chỉ quyết định được khi case đang OPEN
  const targetStatus: ApprovalCaseStatus =
    action === "AGREE" ? "AGREED" : action === "REJECT" ? "REJECTED" : "CLARIFY_REQUESTED";

  const claimed = await prisma.approvalCase.updateMany({
    where: { id: approvalCase.id, status: "OPEN" },
    data: {
      status: targetStatus,
      decidedById: user.personId ?? null,
      decidedAt: new Date(),
    },
  });
  if (claimed.count === 0) {
    const current = await prisma.approvalCase.findUnique({ where: { id: approvalCase.id } });
    return {
      success: false,
      status: 409,
      error: "Hồ sơ này vừa được xử lý bởi người khác — không thể quyết định lại.",
      data: {
        caseId: approvalCase.id,
        status: current?.status ?? "OPEN",
        round: current?.currentRound ?? 1,
        deduplicated: true,
      },
    };
  }

  const round = approvalCase.currentRound;

  // 5) Ghi lịch sử quyết định
  await prisma.approvalDecision.create({
    data: {
      caseId: approvalCase.id,
      round,
      action,
      reason,
      content,
      actorId: user.id,
      actorPersonId: user.personId ?? null,
    },
  });

  // 6) Áp dụng hiệu ứng nghiệp vụ (có điều kiện để không duyệt sai trạng thái)
  let workflowMessage = "";
  if (caseType === "TASK_RESULT" && taskId) {
    if (action === "AGREE") {
      const r = await prisma.task.updateMany({
        where: { id: taskId, status: "WAITING_REVIEW" },
        data: { status: "COMPLETED" },
      });
      if (r.count === 0) {
        await rollbackCase(approvalCase.id, "OPEN");
        return {
          success: false,
          status: 409,
          error: "Trạng thái nhiệm vụ đã thay đổi — không thể nghiệm thu lúc này.",
        };
      }
      workflowMessage = "Nhiệm vụ đã được nghiệm thu hoàn thành.";
    } else {
      // REJECT / CLARIFY → trả nhiệm vụ về đang thực hiện, GIỮ NGUYÊN kết quả đã ghi
      const r = await prisma.task.updateMany({
        where: { id: taskId, status: "WAITING_REVIEW" },
        data: { status: "IN_PROGRESS" },
      });
      if (r.count === 0) {
        await rollbackCase(approvalCase.id, "OPEN");
        return {
          success: false,
          status: 409,
          error: "Trạng thái nhiệm vụ đã thay đổi — không thể trả lại lúc này.",
        };
      }
      workflowMessage =
        action === "REJECT"
          ? "Nhiệm vụ đã bị trả lại, giữ nguyên nội dung kết quả đã ghi."
          : "Nhiệm vụ đã chờ giải trình, giữ nguyên nội dung kết quả đã ghi.";
    }
  } else if (caseType === "PLAN") {
    if (action === "AGREE") {
      const r = await prisma.plan.updateMany({
        where: { id: resourceId, status: "SUBMITTED" },
        data: { status: "APPROVED", approvedBy: user.personId ?? null, approvedAt: new Date() },
      });
      if (r.count === 0) {
        await rollbackCase(approvalCase.id, "OPEN");
        return {
          success: false,
          status: 409,
          error: "Kế hoạch đã được xử lý bởi người khác — không thể phê duyệt lại.",
        };
      }
      workflowMessage = "Kế hoạch đã được phê duyệt.";
    } else {
      const r = await prisma.plan.updateMany({
        where: { id: resourceId, status: "SUBMITTED" },
        data: { status: "RETURNED" },
      });
      if (r.count === 0) {
        await rollbackCase(approvalCase.id, "OPEN");
        return {
          success: false,
          status: 409,
          error: "Kế hoạch đã được xử lý bởi người khác.",
        };
      }
      workflowMessage =
        action === "REJECT"
          ? "Kế hoạch đã bị trả lại yêu cầu hoàn thiện."
          : "Kế hoạch đã được trả lại để bổ sung giải trình.";
    }
  } else if (caseType === "DEADLINE_REQUEST") {
    const nextStatus = action === "AGREE" ? "APPROVED" : "REJECTED";
    const r = await prisma.deadlineRequest.updateMany({
      where: { id: resourceId, status: "PENDING" },
      data: {
        status: nextStatus,
        reviewedById: user.personId ?? null,
        reviewedAt: new Date(),
        reviewNotes: content || reason,
      },
    });
    if (r.count === 0) {
      await rollbackCase(approvalCase.id, "OPEN");
      return {
        success: false,
        status: 409,
        error: "Đề nghị gia hạn đã được xử lý bởi người khác.",
      };
    }
    if (action === "AGREE" && taskId) {
      const req = await prisma.deadlineRequest.findUnique({ where: { id: resourceId } });
      if (req) {
        await prisma.task.updateMany({
          where: { id: taskId },
          data: { currentDeadline: req.requestedDeadline },
        });
      }
    }
    workflowMessage =
      action === "AGREE"
        ? "Đề nghị gia hạn đã được chấp thuận."
        : "Đề nghị gia hạn đã bị từ chối.";
  }

  // 7) Audit + thông báo
  await recordAuditEvent({
    actorId: user.id,
    action: `APPROVAL_${action}`,
    resourceType: "ApprovalCase",
    resourceId: approvalCase.id,
    oldData: { status: "OPEN" },
    newData: {
      caseType,
      resourceId,
      code,
      action,
      reason,
      content,
      round,
      effect: workflowMessage,
    },
  });

  if (submitterId) {
    const notifyType =
      action === "AGREE" ? "APPROVAL_AGREED" : action === "REJECT" ? "APPROVAL_REJECTED" : "APPROVAL_CLARIFY";
    const tag =
      action === "AGREE" ? "ĐÃ CHẤP THUẬN" : action === "REJECT" ? "KHÔNG ĐỒNG Ý" : "YÊU CẦU GIẢI TRÌNH";
    const tagType = action === "AGREE" ? "success" : action === "REJECT" ? "danger" : "warning";
    const detail =
      action === "CLARIFY"
        ? `Lãnh đạo yêu cầu giải trình: ${content}`
        : action === "REJECT"
          ? `Lãnh đạo không đồng ý. Lý do: ${reason}`
          : `Lãnh đạo đã chấp thuận.`;
    await createNotification({
      recipientId: submitterId,
      category: "approval",
      type: notifyType,
      title:
        action === "AGREE"
          ? `Hồ sơ đã được chấp thuận: [${code}] ${title}`
          : action === "REJECT"
            ? `Hồ sơ không được đồng ý: [${code}] ${title}`
            : `Hồ sơ cần giải trình: [${code}] ${title}`,
      content: detail,
      tag,
      tagType,
      entityType: "TASK",
      entityId: taskId || resourceId,
      actionUrl: notifyUrl,
      actionLabel: notifyLabel,
      idempotencyKey: `EVENT_APPROVAL_${approvalCase.id}_${round}_${action}`,
    });
  }

  return {
    success: true,
    message:
      action === "AGREE"
        ? `Đã chấp thuận hồ sơ [${code}]. ${workflowMessage}`
        : action === "REJECT"
          ? `Đã từ chối hồ sơ [${code}]. ${workflowMessage}`
          : `Đã yêu cầu giải trình hồ sơ [${code}]. ${workflowMessage}`,
    data: { caseId: approvalCase.id, status: targetStatus, round },
  };
}

/** Hoàn táy trạng thái case khi hiệu ứng nghiệp vụ thất bại (giữ nguyên lịch sử). */
async function rollbackCase(caseId: string, status: string) {
  await prisma.approvalCase.updateMany({ where: { id: caseId }, data: { status } });
}

// ---------------------------------------------------------------- respond

/** Người được yêu cầu giải trình bổ sung và gửi lại. */
export async function respondToApproval(
  user: SessionUser,
  caseType: ApprovalCaseType,
  resourceId: string,
  content: string
): Promise<DecideResult> {
  const text = content.trim();
  if (!text) {
    return { success: false, status: 400, error: "Vui lòng nhập nội dung giải trình." };
  }

  const approvalCase = await prisma.approvalCase.findUnique({
    where: { caseType_resourceId: { caseType, resourceId } },
  });
  if (!approvalCase) {
    return { success: false, status: 404, error: "Không tìm thấy hồ sơ cần giải trình." };
  }
  if (approvalCase.status !== "CLARIFY_REQUESTED") {
    return {
      success: false,
      status: 409,
      error: "Hồ sơ này hiện không ở trạng thái chờ giải trình.",
    };
  }
  if (!approvalCase.submittedById || approvalCase.submittedById !== user.personId) {
    return {
      success: false,
      status: 403,
      error: "Chỉ người trình hồ sơ mới được phản hồi giải trình.",
    };
  }

  const round = approvalCase.currentRound;

  await prisma.approvalDecision.create({
    data: {
      caseId: approvalCase.id,
      round,
      action: "RESPOND",
      content: text,
      actorId: user.id,
      actorPersonId: user.personId ?? null,
    },
  });

  // Mở lại vòng quyết định (tăng số vòng) — không tạo hồ sơ/Task mới
  const reopened = await prisma.approvalCase.updateMany({
    where: { id: approvalCase.id, status: "CLARIFY_REQUESTED" },
    data: { status: "OPEN", currentRound: { increment: 1 } },
  });
  if (reopened.count === 0) {
    return {
      success: false,
      status: 409,
      error: "Hồ sơ vừa được xử lý bởi người khác.",
    };
  }

  // Đưa nhiệm vụ trở lại hàng đợi nghiệm thu (nếu là quy trình công việc)
  if (caseType === "TASK_RESULT") {
    await prisma.task.updateMany({
      where: { id: resourceId, status: "IN_PROGRESS" },
      data: { status: "WAITING_REVIEW" },
    });
  }

  await recordAuditEvent({
    actorId: user.id,
    action: "APPROVAL_RESPOND",
    resourceType: "ApprovalCase",
    resourceId: approvalCase.id,
    newData: { caseType, resourceId, round, content: text },
  });

  // Thông báo người duyệt
  if (approvalCase.decidedById) {
    await createNotification({
      recipientId: approvalCase.decidedById,
      category: "approval",
      type: "APPROVAL_CLARIFY_ANSWERED",
      title: `Hồ sơ đã được giải trình: [${approvalCase.resourceCode ?? ""}] ${approvalCase.title}`,
      content: `Người trình đã bổ sung nội dung giải trình vòng ${round}: ${text}`,
      tag: "ĐÃ GIẢI TRÌNH",
      tagType: "primary",
      entityType: "TASK",
      entityId: resourceId,
      actionUrl: "/approvals",
      actionLabel: "Xem hồ sơ",
      idempotencyKey: `EVENT_APPROVAL_RESP_${approvalCase.id}_${round}`,
    });
  }

  return {
    success: true,
    message: "Đã gửi nội dung giải trình — hồ sơ quay lại hàng đợi xử lý.",
    data: { caseId: approvalCase.id, status: "OPEN", round: round + 1 },
  };
}

/** Danh sách hồ sơ của tôi (để người trình theo dõi & phản hồi giải trình). */
export async function listMyApprovalCases(user: SessionUser) {
  const cases = await prisma.approvalCase.findMany({
    where: { submittedById: user.personId ?? undefined },
    include: {
      decisions: { orderBy: { createdAt: "desc" }, take: 5 },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  return cases.map((c) => ({
    id: c.id,
    caseType: c.caseType,
    resourceId: c.resourceId,
    code: c.resourceCode,
    title: c.title,
    status: c.status,
    currentRound: c.currentRound,
    decidedAt: c.decidedAt,
    updatedAt: c.updatedAt,
    latestDecision: c.decisions[0]
      ? {
          action: c.decisions[0].action,
          reason: c.decisions[0].reason,
          content: c.decisions[0].content,
          at: c.decisions[0].createdAt.toISOString(),
        }
      : null,
  }));
}

/**
 * Hook khi người trình GỬI LẠI hồ sơ sau khi bị trả lại / được yêu cầu giải trình
 * (kế hoạch trình duyệt lại, nhiệm vụ chuyển lại WAITING_REVIEW).
 *
 * → mở lại vòng quyết định (currentRound + 1), KHÔNG tạo hồ sơ/Task mới.
 */
export async function reopenApprovalCaseOnResubmit(
  caseType: ApprovalCaseType,
  resourceId: string,
  actorAccountId: string,
  note?: string
) {
  const approvalCase = await prisma.approvalCase.findUnique({
    where: { caseType_resourceId: { caseType, resourceId } },
  });
  if (!approvalCase) return null;
  if (approvalCase.status !== "CLARIFY_REQUESTED" && approvalCase.status !== "REJECTED") {
    return null;
  }
  const round = approvalCase.currentRound;
  await prisma.approvalDecision.create({
    data: {
      caseId: approvalCase.id,
      round,
      action: "RESPOND",
      content:
        note?.trim() ||
        "Đã trình lại hồ sơ sau khi bổ sung nội dung theo yêu cầu của cấp có thẩm quyền.",
      actorId: actorAccountId,
      actorPersonId: null,
    },
  });
  const reopened = await prisma.approvalCase.updateMany({
    where: {
      id: approvalCase.id,
      status: { in: ["CLARIFY_REQUESTED", "REJECTED"] },
    },
    data: { status: "OPEN", currentRound: { increment: 1 } },
  });
  if (reopened.count === 0) return null;
  await recordAuditEvent({
    actorId: actorAccountId,
    action: "APPROVAL_CASE_REOPENED",
    resourceType: "ApprovalCase",
    resourceId: approvalCase.id,
    oldData: { status: approvalCase.status, round },
    newData: { status: "OPEN", round: round + 1, reason: "resubmit" },
  });
  return { caseId: approvalCase.id, round: round + 1 };
}
