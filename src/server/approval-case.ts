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
import {
  applyFinalDecisionToParticipants,
  getEffectiveSubmitterId,
  getParticipantSummary,
} from "./task-participant";
import { unaccentSearchIds } from "./search";
import {
  buildApprovalQualityView,
  isApprovalQualityEnabled,
  isQualityRequired,
  parseQualityPercent,
  type ApprovalQualityView,
} from "./approval-quality";
import {
  assertFinalDecisionAllowed,
  getTaskPrecheckView,
  isPrecheckEnabled,
  linkRouteSnapshotToCase,
  resolveTaskRoute,
} from "./approval-route";
import { ParticipantError } from "./task-participant-error";

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

/** Lấy tên người từ danh sách personId (ApprovalDecision không khai báo relation Person). */
async function personNamesByIds(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter((x): x is string => !!x)));
  if (unique.length === 0) return new Map();
  const people = await prisma.person.findMany({
    where: { id: { in: unique } },
    select: { id: true, fullName: true },
  });
  return new Map(people.map((p) => [p.id, p.fullName]));
}

export interface TaskApprovalSummary {
  caseId: string;
  caseStatus: string;
  round: number;
  action: "AGREE" | "REJECT" | "CLARIFY" | "RESPOND" | null;
  actionLabel: string | null;
  reason: string | null;
  content: string | null;
  decidedById: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  /** YC-10: chỉ trả khi truyền viewer và người xem thuộc owner/tuyến/decider. */
  quality: ApprovalQualityView | null;
}

/**
 * YC-08 — projection phê duyệt cho nhiệm vụ (badge, người, thời gian, lý do).
 * Trả về quyết định gần nhất của hồ sơ TASK_RESULT; không suy diễn COMPLETED thành "đã duyệt"
 * nếu không có ApprovalDecision tương ứng.
 *
 * YC-10: truyền `viewer` để nhận thông tin quality; collaborator nhận `visible=false`
 * (không lộ mức chất lượng), danh sách Task không truyền viewer nên không kéo dữ liệu quality.
 */
export async function getTaskApprovalSummaries(
  taskIds: string[],
  viewer?: SessionUser
): Promise<Map<string, TaskApprovalSummary>> {
  const out = new Map<string, TaskApprovalSummary>();
  if (taskIds.length === 0) return out;
  const cases = viewer
    ? await prisma.approvalCase.findMany({
        where: { caseType: "TASK_RESULT", resourceId: { in: taskIds } },
        include: {
          decisions: { orderBy: { createdAt: "asc" } },
          qualityAdjustments: { orderBy: { requestedAt: "asc" } },
        },
      })
    : await prisma.approvalCase.findMany({
        where: { caseType: "TASK_RESULT", resourceId: { in: taskIds } },
        include: {
          decisions: {
            where: { action: { in: ["AGREE", "REJECT", "CLARIFY"] } },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      });

  const tasks = viewer
    ? await prisma.task.findMany({
        where: { id: { in: taskIds } },
        select: { id: true, ownerId: true, unitId: true },
      })
    : [];
  const taskById = new Map(tasks.map((t) => [t.id, t]));

  const names = await personNamesByIds(
    cases.flatMap((c) => [
      c.decidedById,
      ...c.decisions.map((d) => d.actorPersonId),
    ])
  );
  for (const c of cases) {
    const decisions = (c.decisions as any[]).slice();
    const latest = viewer
      ? [...decisions]
          .filter((d) => ["AGREE", "REJECT", "CLARIFY"].includes(d.action))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null
      : decisions[0] || null;
    const task = taskById.get(c.resourceId);
    const quality = viewer
      ? await buildApprovalQualityView({
          user: viewer,
          caseType: "TASK_RESULT",
          case: c,
          decisions,
          adjustments: (c as any).qualityAdjustments ?? [],
          ownerId: task?.ownerId ?? null,
        })
      : null;
    out.set(c.resourceId, {
      caseId: c.id,
      caseStatus: c.status,
      round: latest?.round ?? c.currentRound,
      action: (latest?.action as TaskApprovalSummary["action"]) ?? null,
      actionLabel: latest
        ? APPROVAL_ACTION_LABELS[latest.action as ApprovalAction] ?? latest.action
        : null,
      reason: latest?.reason ?? null,
      content: latest?.content ?? null,
      decidedById: c.decidedById,
      decidedByName: c.decidedById ? names.get(c.decidedById) ?? null : null,
      decidedAt: (c.decidedAt ?? latest?.createdAt)?.toISOString() ?? null,
      quality,
    });
  }
  return out;
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
  /** E12-A: nhãn nguồn để không trộn lịch sử duyệt với TaskUpdate/phần việc. */
  source: "APPROVAL_DECISION";
  sourceLabel: string;
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
  /** YC-10: mức chất lượng hiện tại/hiệu lực/lịch sử (null/visible=false nếu không có quyền). */
  quality: ApprovalQualityView;
  /** YC-11: tuyến pre-check/final tại thời điểm nộp (flag tắt => enabled=false). */
  precheck: ApprovalPreviewPrecheck | null;
  permissions: {
    canDecide: boolean;
    canRespond: boolean;
    reason: string | null;
  };
  warnings: string[];
}

export interface ApprovalPreviewPrecheck {
  enabled: boolean;
  routeStatus: string | null;
  required: boolean;
  allPrechecked: boolean;
  canDecideFinal: boolean;
  snapshotRound: number | null;
  finalCandidates: Array<{
    personId: string;
    fullName: string;
    role: string | null;
    unitName: string | null;
  }>;
  participants: Array<{
    personId: string;
    fullName: string;
    partStatus: string;
    precheckStatus: string;
    precheckedByName: string | null;
    precheckedAt: string | null;
    precheckNote: string | null;
  }>;
  snapshot: {
    round: number;
    routeStatus: string;
    createdAt: string;
  } | null;
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
    submitterId = await getEffectiveSubmitterId(task.id);
    resourceStatus = task.status;
    resourceOwnerId = task.ownerId;
    // Thời điểm trình duyệt thực tế (không dùng updatedAt vì có thể bị thay đổi bởi thao tác khác)
    const lastSubmit = task.updates.find((u) => u.kind === "submit");
    submittedAt = (lastSubmit?.createdAt ?? task.updatedAt).toISOString();
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
    content.participants = await getParticipantSummary(task.id);
    content.participantSummary = content.participants;
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
      qualityAdjustments: { orderBy: { requestedAt: "asc" } },
    },
  });

  const history: ApprovalPreviewHistoryEntry[] = (existingCase?.decisions ?? []).map((d) => ({
    round: d.round,
    action: d.action as ApprovalAction,
    actionLabel: APPROVAL_ACTION_LABELS[d.action as ApprovalAction] ?? d.action,
    reason: d.reason,
    content: d.content,
    actorName: "—",
    actorPersonId: d.actorPersonId,
    createdAt: d.createdAt.toISOString(),
    source: "APPROVAL_DECISION" as const,
    sourceLabel: "Quyết định duyệt",
  }));
  const historyNames = await personNamesByIds(history.map((h) => h.actorPersonId));
  for (const h of history) {
    if (h.actorPersonId) h.actorName = historyNames.get(h.actorPersonId) ?? "—";
  }

  const isDecider = await canDecide(user, unitId);
  const isSubmitter = !!submitterId && submitterId === user.personId;
  const rawCaseStatus = existingCase?.status;
  const caseStatus: ApprovalCaseStatus | "NOT_CREATED" = rawCaseStatus
    ? (rawCaseStatus as ApprovalCaseStatus)
    : "NOT_CREATED";
  const caseOpen = caseStatus === "OPEN" || caseStatus === "NOT_CREATED";

  let canRespond = false;
  if (caseStatus === "CLARIFY_REQUESTED") {
    canRespond = isSubmitter;
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

  const quality = await buildApprovalQualityView({
    user,
    caseType,
    case: existingCase,
    decisions: existingCase?.decisions ?? [],
    adjustments: existingCase?.qualityAdjustments ?? [],
    ownerId: resourceOwnerId,
  });

  // YC-11: tuyến pre-check/final và quyền final theo snapshot tại thời điểm nộp.
  let precheck: ApprovalPreviewPrecheck | null = null;
  let routeFinalAllowed = true;
  let routeDeniedReason: string | null = null;
  if (caseType === "TASK_RESULT" && isPrecheckEnabled()) {
    const view = await getTaskPrecheckView(resourceId, user);
    const snapshotJson: any = view.latestSnapshot?.routeJson ?? null;
    const snapshotParticipants: any[] = Array.isArray(snapshotJson?.participants)
      ? snapshotJson.participants
      : [];
    const currentParticipants = view.route?.participants ?? [];
    const sourceParticipants = snapshotParticipants.length > 0 ? snapshotParticipants : currentParticipants;
    const snapshotFinal: any[] = Array.isArray(snapshotJson?.final?.candidates)
      ? snapshotJson.final.candidates
      : [];
    const currentFinal = (view.route?.finalCandidates ?? []).map((c) => ({
      personId: c.personId,
      fullName: c.fullName,
      role: c.role,
      unitName: c.unitName,
    }));
    const finalCandidates = snapshotFinal.length > 0 ? snapshotFinal : currentFinal;
    const excluded: string[] = Array.isArray(snapshotJson?.final?.excludedPrecheckerIds)
      ? snapshotJson.final.excludedPrecheckerIds
      : [];
    const routeStatus = view.latestSnapshot?.routeStatus ?? view.route?.status ?? null;
    const required = view.route?.required ?? snapshotParticipants.length > 0;
    const allPrechecked = view.latestSnapshot
      ? true
      : view.route?.allPrechecked ?? false;
    routeFinalAllowed =
      !!user.personId &&
      finalCandidates.some((c) => c.personId === user.personId) &&
      !excluded.includes(user.personId) &&
      (!view.latestSnapshot || String(view.latestSnapshot.routeStatus) === "READY");
    // Chưa có snapshot: chỉ Task legacy (không có participant row) được final-only.
    // Task có participant row nhưng thiếu snapshot phải bị chặn, không được coi là legacy.
    if (!view.latestSnapshot) {
      if (view.route?.legacyOnly) {
        routeFinalAllowed = true;
      } else {
        routeFinalAllowed = false;
        routeDeniedReason =
          "Chưa có snapshot tuyến kiểm tra sơ bộ tại thời điểm nộp — không thể quyết định cuối.";
      }
    }
    if (!routeFinalAllowed && !routeDeniedReason) {
      routeDeniedReason = excluded.includes(String(user.personId))
        ? "Bạn đã pre-check hồ sơ này — cần người có thẩm quyền khác quyết định cuối."
        : "Bạn không thuộc tuyến quyết định cuối đã chốt tại thời điểm nộp hồ sơ.";
    }
    precheck = {
      enabled: true,
      routeStatus,
      required,
      allPrechecked,
      canDecideFinal: routeFinalAllowed,
      snapshotRound: view.latestSnapshot?.round ?? null,
      finalCandidates,
      participants: sourceParticipants.map((p: any) => ({
        personId: String(p.personId),
        fullName: String(p.fullName ?? "—"),
        partStatus: String(p.partStatus ?? ""),
        precheckStatus: String(p.precheckStatus ?? "PENDING"),
        precheckedByName:
          p.precheckedBy?.fullName ??
          (p.precheckedBy && typeof p.precheckedBy === "string" ? p.precheckedBy : null),
        precheckedAt: p.precheckedAt ?? null,
        precheckNote: p.precheckNote ?? null,
      })),
      snapshot: view.latestSnapshot
        ? {
            round: view.latestSnapshot.round,
            routeStatus: view.latestSnapshot.routeStatus,
            createdAt: view.latestSnapshot.createdAt,
          }
        : null,
    };
  }

  let permissionReason: string | null = null;
  if (caseStatus === "CLARIFY_REQUESTED") {
    if (isSubmitter) {
      permissionReason = "Bạn được yêu cầu giải trình — bổ sung nội dung rồi gửi lại.";
    }
  } else if (isSubmitter && caseOpen) {
    // Chặn tự duyệt ngay trên preview: người trình không được thấy nút quyết định.
    permissionReason = "Bạn là người trình hồ sơ — cần lãnh đạo khác thẩm quyền quyết định.";
  } else if (isDecider) {
    permissionReason = routeDeniedReason;
  } else if (caseStatus === "AGREED" || caseStatus === "REJECTED") {
    permissionReason = "Hồ sơ đã được xử lý.";
  } else {
    permissionReason = "Bạn không có thẩm quyền quyết định hồ sơ này.";
  }

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
    quality,
    precheck,
    permissions: {
      // Hồ sơ chưa tạo (lần đầu) vẫn cho quyết định — case được tạo khi ghi quyết định.
      // Người trình KHÔNG bao giờ được quyết định hồ sơ của chính mình.
      canDecide: isDecider && caseOpen && !isSubmitter && routeFinalAllowed,
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
  /** YC-10: mức chất lượng 65..100 bước 5 (bắt buộc khi AGREE + TASK_RESULT nếu flag bật). */
  qualityPercent?: unknown;
  /** E9.3: các personId được chọn trả lại khi REJECT/CLARIFY. Rỗng = trả các phần chưa accepted. */
  returnPersonIds?: string[];
}

export interface DecideResult {
  success: boolean;
  message?: string;
  status?: number;
  error?: string;
  data?: {
    caseId: string;
    status: string;
    round: number;
    deduplicated?: boolean;
    /** E8-A: tiến độ được giữ nguyên khi trả lại (kể cả 100%). */
    progressPercent?: number | null;
  };
}

/**
 * E8-A — tiến độ hiện tại của Task là bản ghi TaskUpdate cấp nhiệm vụ gần nhất.
 *
 * Bỏ qua bản ghi phần việc phối hợp (`subject_person_id`/`participant_event_id`):
 * các bản ghi này luôn ghi 0% và không đại diện cho tiến độ chung của nhiệm vụ.
 * Nếu không lọc, một cập nhật phần việc chen giữa có thể làm "trôi" tiến độ 100%
 * khi lãnh đạo trả lại hồ sơ.
 */
async function latestTaskLevelProgress(tx: any, taskId: string): Promise<number> {
  const latest = await tx.taskUpdate.findFirst({
    where: { taskId, subjectPersonId: null, participantEventId: null },
    orderBy: { createdAt: "desc" },
    select: { progressPercent: true },
  });
  return latest?.progressPercent ?? 0;
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

  // YC-10 — validate quality TRƯỚC mọi thay đổi case/Task. Flag tắt = giữ nguyên hành vi cũ.
  let qualityPercent: number | null = null;
  if (!isApprovalQualityEnabled()) {
    qualityPercent = null;
  } else if (isQualityRequired(caseType, action)) {
    const parsed = parseQualityPercent(params.qualityPercent);
    if (!parsed.ok) return { success: false, status: 422, error: parsed.error };
    if (parsed.value === null) {
      return {
        success: false,
        status: 422,
        error: "Vui lòng chọn mức chất lượng kết quả (65–100, bước 5) khi đồng ý nghiệm thu.",
      };
    }
    qualityPercent = parsed.value;
  } else if (caseType === "TASK_RESULT") {
    // REJECT/CLARIFY: quality không bắt buộc; nếu có thì phải hợp lệ và được lưu lịch sử.
    const parsed = parseQualityPercent(params.qualityPercent);
    if (!parsed.ok) return { success: false, status: 422, error: parsed.error };
    qualityPercent = parsed.value;
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
  let collaboratorIds: string[] = [];

  if (caseType === "TASK_RESULT") {
    const task = await prisma.task.findUnique({
      where: { id: resourceId },
      include: {
        owner: { select: { id: true, fullName: true } },
        assignees: { select: { personId: true } },
      },
    });
    if (!task) return { success: false, status: 404, error: "Nhiệm vụ không tồn tại" };
    const access = await verifyTaskAccess(user, task.id, "WRITE");
    if (!access.allowed) {
      return { success: false, status: 403, error: access.reason || "Không có quyền xử lý hồ sơ này" };
    }
    unitId = task.unitId;
    submitterId = await getEffectiveSubmitterId(task.id);
    code = task.code;
    title = task.title;
    resourceStatus = task.status;
    taskId = task.id;
    collaboratorIds = task.assignees.map((a) => a.personId);
    notifyUrl = `/tasks/${task.id}`;
    notifyLabel = "Xem nhiệm vụ";
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
    notifyUrl = `/tasks/${req.taskId}`;
    notifyLabel = "Xem nhiệm vụ";
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

  // YC-11: quyết định cuối phải do người thuộc tuyến final đã chốt tại thời điểm nộp;
  // pre-checker/participant không được final. Legacy không snapshot => final-only.
  if (caseType === "TASK_RESULT" && taskId && isPrecheckEnabled()) {
    try {
      await assertFinalDecisionAllowed(user, taskId);
    } catch (err: any) {
      if (err instanceof ParticipantError) {
        return {
          success: false,
          status: err.statusCode,
          error: err.message,
          data: err.data,
        };
      }
      throw err;
    }
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

  const targetStatus: ApprovalCaseStatus =
    action === "AGREE" ? "AGREED" : action === "REJECT" ? "REJECTED" : "CLARIFY_REQUESTED";

  class DecisionConflict extends Error {
    statusCode: number;
    constructor(message: string, statusCode = 409) {
      super(message);
      this.statusCode = statusCode;
    }
  }

  // 3-6) Ghi hồ sơ + quyết định + hiệu ứng nghiệp vụ + nhật ký TaskUpdate trong CÙNG transaction.
  // Nếu hiệu ứng thất bại (trạng thái vừa bị người khác đổi), toàn bộ quyết định được rollback
  // — không để lại lịch sử duyệt "treo" trên hồ sơ chưa thực sự được xử lý.
  let txResult:
    | {
        ok: true;
        caseId: string;
        round: number;
        task: any | null;
        workflowMessage: string;
        progressPercent: number | null;
      }
    | { ok: false; status: number; error: string; data?: DecideResult["data"] };
  try {
    txResult = await prisma.$transaction(async (tx) => {
      const existingCase = await tx.approvalCase.findUnique({
        where: { caseType_resourceId: { caseType, resourceId } },
      });
      const approvalCase = existingCase
        ? await tx.approvalCase.update({
            where: { id: existingCase.id },
            data: { title, resourceCode: code, unitId },
          })
        : await tx.approvalCase.create({
            data: {
              caseType,
              resourceId,
              resourceCode: code,
              title,
              unitId,
              submittedById: submitterId,
              status: "OPEN",
            },
          });

      const claimed = await tx.approvalCase.updateMany({
        where: { id: approvalCase.id, status: "OPEN" },
        data: {
          status: targetStatus,
          decidedById: user.personId ?? null,
          decidedAt: new Date(),
        },
      });
      if (claimed.count === 0) {
        const current = await tx.approvalCase.findUnique({ where: { id: approvalCase.id } });
        return {
          ok: false as const,
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

      if (caseType === "TASK_RESULT" && taskId) {
        await linkRouteSnapshotToCase(tx, taskId, round, approvalCase.id);
      }

      await tx.approvalDecision.create({
        data: {
          caseId: approvalCase.id,
          round,
          action,
          reason,
          content,
          qualityPercent,
          actorId: user.id,
          actorPersonId: user.personId ?? null,
        },
      });

      let workflowMessage = "";
      let updatedTask: any | null = null;
      let preservedProgress: number | null = null;

      if (caseType === "TASK_RESULT" && taskId) {
        // E8-A: trả lại GIỮ NGUYÊN tiến độ hiện tại (kể cả 100%), không tự reset.
        // Chỉ lấy bản ghi cấp nhiệm vụ, không lấy bản ghi phần việc phối hợp.
        const progress = await latestTaskLevelProgress(tx, taskId);
        preservedProgress = progress;

        if (action === "AGREE") {
          const r = await tx.task.updateMany({
            where: { id: taskId, status: "WAITING_REVIEW" },
            data: { status: "COMPLETED" },
          });
          if (r.count === 0) {
            throw new DecisionConflict("Trạng thái nhiệm vụ đã thay đổi — không thể nghiệm thu lúc này.");
          }
          await tx.taskUpdate.create({
            data: {
              taskId,
              authorId: user.personId,
              progressPercent: progress,
              statusBefore: "WAITING_REVIEW",
              statusAfter: "COMPLETED",
              kind: "approve",
              notes: reason
                ? `Lãnh đạo nghiệm thu hoàn thành. Ý kiến: ${reason}`
                : "Lãnh đạo nghiệm thu hoàn thành nhiệm vụ.",
            },
          });
          workflowMessage = "Nhiệm vụ đã được nghiệm thu hoàn thành.";
        } else {
          // REJECT / CLARIFY → trả nhiệm vụ về đang thực hiện, GIỮ NGUYÊN kết quả đã ghi.
          const r = await tx.task.updateMany({
            where: { id: taskId, status: "WAITING_REVIEW" },
            data: { status: "IN_PROGRESS" },
          });
          if (r.count === 0) {
            throw new DecisionConflict("Trạng thái nhiệm vụ đã thay đổi — không thể trả lại lúc này.");
          }
          await tx.taskUpdate.create({
            data: {
              taskId,
              authorId: user.personId,
              progressPercent: progress,
              statusBefore: "WAITING_REVIEW",
              statusAfter: "IN_PROGRESS",
              kind: "return",
              notes:
                action === "REJECT"
                  ? `Lãnh đạo trả lại nhiệm vụ. Lý do: ${reason}`
                  : `Lãnh đạo yêu cầu giải trình: ${content}`,
            },
          });
          workflowMessage =
            action === "REJECT"
              ? "Nhiệm vụ đã bị trả lại, giữ nguyên nội dung kết quả đã ghi."
              : "Nhiệm vụ đã chờ giải trình, giữ nguyên nội dung kết quả đã ghi.";
        }
        // YC-09 Phase 1: cập nhật participant status theo E9.3 trong cùng transaction.
        await applyFinalDecisionToParticipants(
          tx,
          taskId,
          action,
          user,
          params.returnPersonIds || []
        );
        updatedTask = await tx.task.findUnique({
          where: { id: taskId },
          include: {
            owner: true,
            unit: true,
            assignees: { include: { person: true } },
          },
        });
      } else if (caseType === "PLAN") {
        if (action === "AGREE") {
          const r = await tx.plan.updateMany({
            where: { id: resourceId, status: "SUBMITTED" },
            data: { status: "APPROVED", approvedBy: user.personId ?? null, approvedAt: new Date() },
          });
          if (r.count === 0) {
            throw new DecisionConflict("Kế hoạch đã được xử lý bởi người khác — không thể phê duyệt lại.");
          }
          workflowMessage = "Kế hoạch đã được phê duyệt.";
        } else {
          const r = await tx.plan.updateMany({
            where: { id: resourceId, status: "SUBMITTED" },
            data: { status: "RETURNED" },
          });
          if (r.count === 0) {
            throw new DecisionConflict("Kế hoạch đã được xử lý bởi người khác.");
          }
          workflowMessage =
            action === "REJECT"
              ? "Kế hoạch đã bị trả lại yêu cầu hoàn thiện."
              : "Kế hoạch đã được trả lại để bổ sung giải trình.";
        }
      } else if (caseType === "DEADLINE_REQUEST") {
        const nextStatus = action === "AGREE" ? "APPROVED" : "REJECTED";
        const r = await tx.deadlineRequest.updateMany({
          where: { id: resourceId, status: "PENDING" },
          data: {
            status: nextStatus,
            reviewedById: user.personId ?? null,
            reviewedAt: new Date(),
            reviewNotes: content || reason,
          },
        });
        if (r.count === 0) {
          throw new DecisionConflict("Đề nghị gia hạn đã được xử lý bởi người khác.");
        }
        if (action === "AGREE" && taskId) {
          const req = await tx.deadlineRequest.findUnique({ where: { id: resourceId } });
          if (req) {
            await tx.task.updateMany({
              where: { id: taskId },
              data: { currentDeadline: req.requestedDeadline },
            });
            await tx.taskUpdate.create({
              data: {
                taskId,
                authorId: user.personId,
                progressPercent: 0,
                statusBefore: "IN_PROGRESS",
                statusAfter: null,
                kind: "extend",
                notes: `Lãnh đạo phê duyệt gia hạn đến ${req.requestedDeadline.toLocaleDateString("vi-VN")}. Lý do: ${req.reason}`,
              },
            });
          }
        } else if (taskId) {
          await tx.taskUpdate.create({
            data: {
              taskId,
              authorId: user.personId,
              progressPercent: 0,
              statusBefore: "IN_PROGRESS",
              statusAfter: null,
              kind: "extend",
              notes: `Lãnh đạo từ chối đề nghị gia hạn. Lý do: ${reason || content || "Không chấp thuận"}`,
            },
          });
        }
        workflowMessage =
          action === "AGREE"
            ? "Đề nghị gia hạn đã được chấp thuận."
            : "Đề nghị gia hạn đã bị từ chối.";
      }

      return {
        ok: true as const,
        caseId: approvalCase.id,
        round,
        task: updatedTask,
        workflowMessage,
        progressPercent: preservedProgress,
      };
    });
  } catch (err: any) {
    if (err instanceof DecisionConflict) {
      return { success: false, status: err.statusCode, error: err.message };
    }
    throw err;
  }

  if (!txResult.ok) {
    return { success: false, status: txResult.status, error: txResult.error, data: txResult.data };
  }

  // 7) Audit + thông báo
  await recordAuditEvent({
    actorId: user.id,
    action: `APPROVAL_${action}`,
    resourceType: "ApprovalCase",
    resourceId: txResult.caseId,
    oldData: { status: "OPEN" },
    newData: {
      caseType,
      resourceId,
      code,
      action,
      reason,
      content,
      qualityPercent,
      round: txResult.round,
      effect: txResult.workflowMessage,
      // E8-A: bằng chứng tiến độ được giữ nguyên khi trả lại (không reset ngầm).
      progressPercent: txResult.progressPercent,
      progressPolicy:
        action !== "AGREE" && txResult.progressPercent !== null
          ? "PRESERVED_ON_RETURN"
          : null,
    },
  });

  const recipients = new Set<string>();
  if (submitterId) recipients.add(submitterId);
  if (caseType === "TASK_RESULT") {
    // YC-08: thông báo cho chủ trì VÀ người phối hợp theo quyền.
    for (const id of collaboratorIds) recipients.add(id);
  }
  recipients.delete(user.personId);

  for (const recipientId of recipients) {
    const isSubmitter = recipientId === submitterId;
    const notifyType =
      action === "AGREE" ? "APPROVAL_AGREED" : action === "REJECT" ? "APPROVAL_REJECTED" : "APPROVAL_CLARIFY";
    const tag =
      action === "AGREE" ? "ĐÃ CHẤP THUẬN" : action === "REJECT" ? "KHÔNG ĐỒNG Ý" : "YÊU CẦU GIẢI TRÌNH";
    const tagType = action === "AGREE" ? "success" : action === "REJECT" ? "danger" : "warning";
    // E10.6 — quality chỉ dành cho người trình hồ sơ. Collaborator nhận thông báo
    // không kèm quality (fail closed nếu người trình không xác định được).
    const canShowQuality = isSubmitter && qualityPercent !== null;
    const detail =
      action === "CLARIFY"
        ? `Lãnh đạo yêu cầu giải trình: ${content}`
        : action === "REJECT"
          ? `Lãnh đạo không đồng ý. Lý do: ${reason}`
          : `Lãnh đạo đã chấp thuận.${
              canShowQuality ? ` Mức chất lượng: ${qualityPercent}%.` : ""
            }`;
    await createNotification({
      recipientId,
      category: "approval",
      type: notifyType,
      title:
        action === "AGREE"
          ? `Hồ sơ đã được chấp thuận: [${code}] ${title}`
          : action === "REJECT"
            ? `Hồ sơ không được đồng ý: [${code}] ${title}`
            : `Hồ sơ cần giải trình: [${code}] ${title}`,
      content: isSubmitter ? detail : `Bạn là người phối hợp. ${detail}`,
      tag,
      tagType,
      entityType: "TASK",
      entityId: taskId || resourceId,
      actionUrl: notifyUrl,
      actionLabel: notifyLabel,
      idempotencyKey: `EVENT_APPROVAL_${txResult.caseId}_${txResult.round}_${action}_${recipientId}`,
    });
  }

  return {
    success: true,
    message:
      action === "AGREE"
        ? `Đã chấp thuận hồ sơ [${code}]. ${txResult.workflowMessage}`
        : action === "REJECT"
          ? `Đã từ chối hồ sơ [${code}]. ${txResult.workflowMessage}`
          : `Đã yêu cầu giải trình hồ sơ [${code}]. ${txResult.workflowMessage}`,
    data: {
      caseId: txResult.caseId,
      status: targetStatus,
      round: txResult.round,
      progressPercent: txResult.progressPercent,
    },
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

  // YC-11: với Task có phần việc per-person, không cho "phản hồi giải trình" tắt
  // đường pre-check. Chủ trì phải báo lại phần việc và nộp kết quả chung để tạo
  // snapshot tuyến/vòng mới. Task legacy (không participant row) giữ hành vi cũ.
  if (caseType === "TASK_RESULT" && isPrecheckEnabled()) {
    const requiredRows = await prisma.taskParticipantResult.count({
      where: { taskId: resourceId, legacy: false },
    });
    if (requiredRows > 0) {
      return {
        success: false,
        status: 409,
        error:
          "Nhiệm vụ có phần việc per-person — hãy báo lại phần việc/nộp kết quả chung để kiểm tra sơ bộ lại, không phản hồi giải trình tắt bước.",
      };
    }
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
    const latest = await prisma.taskUpdate.findFirst({
      where: { taskId: resourceId },
      orderBy: { createdAt: "desc" },
      select: { progressPercent: true },
    });
    const moved = await prisma.task.updateMany({
      where: { id: resourceId, status: "IN_PROGRESS" },
      data: { status: "WAITING_REVIEW" },
    });
    if (moved.count > 0) {
      await prisma.taskUpdate.create({
        data: {
          taskId: resourceId,
          authorId: user.personId,
          progressPercent: latest?.progressPercent ?? 0,
          statusBefore: "IN_PROGRESS",
          statusAfter: "WAITING_REVIEW",
          kind: "submit",
          notes: `Người chủ trì gửi giải trình và trình lại hồ sơ. Nội dung: ${text}`,
        },
      });
    }
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
  const names = await personNamesByIds(cases.flatMap((c) => c.decisions.map((d) => d.actorPersonId)));
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
          actorName: c.decisions[0].actorPersonId
            ? names.get(c.decisions[0].actorPersonId) ?? null
            : null,
          at: c.decisions[0].createdAt.toISOString(),
          source: "APPROVAL_DECISION" as const,
          sourceLabel: "Quyết định duyệt",
        }
      : null,
  }));
}

export interface DecidedApprovalFilters {
  /** Tìm cán bộ theo mã hoặc tên (không dấu). */
  person?: string;
  /** Tháng 1–12. */
  month?: number | string | null;
  /** Năm, ví dụ 2026. */
  year?: number | string | null;
}

/** Khoảng thời gian theo tháng dương lịch Việt Nam (UTC+7). */
function vnMonthRange(month: number, year: number) {
  const gte = new Date(Date.UTC(year, month - 1, 1) - 7 * 3600 * 1000);
  const lt = new Date(Date.UTC(year, month, 1) - 7 * 3600 * 1000);
  return { gte, lt };
}

/**
 * YC-12 — "Đã xử lý": lịch sử hồ sơ đã có quyết định, lọc theo cán bộ + tháng/năm.
 * Quyền xem:
 *  - Người đã ra quyết định luôn thấy lịch sử của mình (kể cả tuyến phụ trách đã thay đổi).
 *  - Lãnh đạo đơn vị / trưởng bộ phận thấy hồ sơ trong phạm vi đơn vị được cấp.
 *  - SYSTEM_ADMIN không có quyền nghiệp vụ.
 */
export async function listDecidedApprovalCases(
  user: SessionUser,
  filters: DecidedApprovalFilters = {}
) {
  if (!user.personId || user.role === "SYSTEM_ADMIN") return [];

  const where: any = {
    status: { in: ["AGREED", "REJECTED", "CLARIFY_REQUESTED", "CLOSED"] },
  };

  if (user.role === "UNIT_LEADER") {
    // Toàn đơn vị
  } else if (user.role === "DEPARTMENT_LEADER") {
    const units = await getAuthorizedUnitIds(user);
    where.OR = [
      { decidedById: user.personId },
      ...(units === "ALL" ? [] : [{ unitId: { in: units } }]),
    ];
  } else {
    where.decidedById = user.personId;
  }

  if (filters.person?.trim()) {
    const personIds = await unaccentSearchIds("people", ["code", "full_name"], filters.person.trim(), 200);
    if (!personIds || personIds.length === 0) return [];
    where.submittedById = { in: personIds };
  }

  const monthNum = filters.month ? Number(filters.month) : null;
  const yearNum = filters.year ? Number(filters.year) : null;
  if (monthNum && monthNum >= 1 && monthNum <= 12) {
    const { gte, lt } = vnMonthRange(monthNum, yearNum || new Date().getFullYear());
    where.decidedAt = { gte, lt };
  } else if (yearNum) {
    where.decidedAt = {
      gte: new Date(Date.UTC(yearNum, 0, 1) - 7 * 3600 * 1000),
      lt: new Date(Date.UTC(yearNum + 1, 0, 1) - 7 * 3600 * 1000),
    };
  }

  const cases = await prisma.approvalCase.findMany({
    where,
    include: {
      decisions: { orderBy: { createdAt: "desc" }, take: 5 },
    },
    orderBy: [{ decidedAt: "desc" }, { updatedAt: "desc" }],
    take: 100,
  });

  const names = await personNamesByIds([
    ...cases.map((c) => c.submittedById),
    ...cases.map((c) => c.decidedById),
    ...cases.flatMap((c) => c.decisions.map((d) => d.actorPersonId)),
  ]);

  return cases.map((c) => {
    const latest = c.decisions[0] || null;
    const history = c.decisions.map((d) => ({
      id: d.id,
      round: d.round,
      action: d.action,
      actionLabel: APPROVAL_ACTION_LABELS[d.action as ApprovalAction] ?? d.action,
      reason: d.reason,
      content: d.content,
      qualityPercent: d.qualityPercent ?? null,
      actorName: d.actorPersonId ? names.get(d.actorPersonId) ?? null : null,
      at: d.createdAt.toISOString(),
      source: "APPROVAL_DECISION" as const,
      sourceLabel: "Quyết định duyệt",
    }));
    return {
      id: c.id,
      caseType: c.caseType,
      resourceId: c.resourceId,
      code: c.resourceCode,
      title: c.title,
      status: c.status,
      currentRound: c.currentRound,
      unitId: c.unitId,
      submittedById: c.submittedById,
      submittedByName: c.submittedById ? names.get(c.submittedById) ?? null : null,
      decidedById: c.decidedById,
      decidedByName: c.decidedById ? names.get(c.decidedById) ?? null : null,
      decidedAt: (c.decidedAt ?? latest?.createdAt)?.toISOString() ?? null,
      latestDecision: latest
        ? {
            action: latest.action,
            actionLabel: APPROVAL_ACTION_LABELS[latest.action as ApprovalAction] ?? latest.action,
            reason: latest.reason,
            content: latest.content,
            actorName: latest.actorPersonId ? names.get(latest.actorPersonId) ?? null : null,
            at: latest.createdAt.toISOString(),
            source: "APPROVAL_DECISION" as const,
            sourceLabel: "Quyết định duyệt",
          }
        : null,
      /** E12-A: đủ các vòng đã quyết định, kèm nhãn nguồn. */
      history,
    };
  });
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
  const actor = await prisma.account.findUnique({
    where: { id: actorAccountId },
    select: { personId: true },
  });
  // YC-09 Phase 1: chỉ owner/submitter được mở lại vòng của TASK_RESULT.
  if (caseType === "TASK_RESULT") {
    const task = await prisma.task.findUnique({
      where: { id: resourceId },
      select: { ownerId: true },
    });
    const snapshot = await prisma.taskSubmissionSnapshot.findFirst({
      where: { taskId: resourceId },
      orderBy: { round: "desc" },
      select: { submittedById: true },
    });
    const actorPersonId = actor?.personId ?? null;
    const allowed =
      !!actorPersonId &&
      (actorPersonId === task?.ownerId || actorPersonId === snapshot?.submittedById);
    if (!allowed) return null;
  }
  await prisma.approvalDecision.create({
    data: {
      caseId: approvalCase.id,
      round,
      action: "RESPOND",
      content:
        note?.trim() ||
        "Đã trình lại hồ sơ sau khi bổ sung nội dung theo yêu cầu của cấp có thẩm quyền.",
      actorId: actorAccountId,
      actorPersonId: actor?.personId ?? null,
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
