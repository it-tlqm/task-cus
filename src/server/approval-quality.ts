/**
 * YC-10 — Mức chất lượng kết quả Task do lãnh đạo đánh giá (65..100, bước 5).
 *
 * Nguyên tắc đã chốt (E10.1–E10.7, P-3):
 * - Chỉ gắn với kết quả Task tại lượt duyệt (Q1), KHÔNG gắn QĐ1277/từng người.
 * - Bắt buộc khi AGREE + TASK_RESULT (M1); REJECT/CLARIFY không bắt buộc.
 * - AGREE 65 vẫn là AGREE — không tự reject, không tự đổi điểm.
 * - Bất biến sau quyết định (A1): điều chỉnh qua yêu cầu riêng, lưu old/new/lý do/audit,
 *   KHÔNG update đè `approval_decisions.quality_percent`.
 * - Chất lượng hiệu lực = quality gốc của lượt AGREE cuối + adjustment APPROVED mới nhất.
 * - Không tham gia điểm tháng/QĐ1277/xếp loại; chỉ hiển thị/audit/sheet phụ.
 * - Feature flag server-side `V3_YC10_QUALITY`, mặc định TẮT.
 */

import type {
  ApprovalCase,
  ApprovalDecision,
  ApprovalQualityAdjustment,
} from "@prisma/client";
import { prisma } from "./db";
import type { SessionUser } from "./auth";
import { getAuthorizedUnitIds } from "./guard";
import { recordAuditEvent } from "./audit";
import { createNotification } from "./notifications";

export const APPROVAL_QUALITY_VALUES = [65, 70, 75, 80, 85, 90, 95, 100] as const;
export type ApprovalQualityValue = (typeof APPROVAL_QUALITY_VALUES)[number];

export const APPROVAL_QUALITY_ACTIONS = ["APPROVE", "REJECT"] as const;
export type ApprovalQualityDecisionAction = (typeof APPROVAL_QUALITY_ACTIONS)[number];

export type ApprovalQualityAdjustmentStatus = "PENDING" | "APPROVED" | "REJECTED";

export const APPROVAL_QUALITY_STATUS_LABELS: Record<string, string> = {
  PENDING: "Chờ quyết định",
  APPROVED: "Đã chấp thuận điều chỉnh",
  REJECTED: "Đã từ chối điều chỉnh",
};

/** Flag bật/tắt đọc tại thời điểm gọi (test có thể đổi env). */
export function isApprovalQualityEnabled(): boolean {
  const raw = (process.env.V3_YC10_QUALITY || "").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes" || raw === "on";
}

export function isApprovalQualityValue(value: unknown): value is ApprovalQualityValue {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    (APPROVAL_QUALITY_VALUES as readonly number[]).includes(value)
  );
}

export type QualityParseResult =
  | { ok: true; value: ApprovalQualityValue | null }
  | { ok: false; error: string };

/**
 * Chuẩn hoá input quality. Chỉ nhận number nguyên thuộc tập 65..100 bước 5.
 * Không nhận chuỗi/số lẻ/ngoài tập; null/undefined/rỗng = chưa đánh giá.
 */
export function parseQualityPercent(raw: unknown): QualityParseResult {
  if (raw === undefined || raw === null || raw === "") return { ok: true, value: null };
  if (typeof raw !== "number") {
    return {
      ok: false,
      error: `Mức chất lượng phải là số nguyên thuộc ${APPROVAL_QUALITY_VALUES.join(", ")}.`,
    };
  }
  if (!isApprovalQualityValue(raw)) {
    return {
      ok: false,
      error: `Mức chất lượng không hợp lệ. Chỉ chấp nhận ${APPROVAL_QUALITY_VALUES.join(", ")}.`,
    };
  }
  return { ok: true, value: raw };
}

/** M1: bắt buộc với AGREE + TASK_RESULT khi flag bật. */
export function isQualityRequired(caseType: string, action: string): boolean {
  return isApprovalQualityEnabled() && caseType === "TASK_RESULT" && action === "AGREE";
}

/** Người có thẩm quyền quyết định hồ sơ (cùng quy tắc với ApprovalCase; không cấp quyền mới). */
export async function canDecideApprovalCase(
  user: SessionUser,
  unitId: string | null
): Promise<boolean> {
  if (user.role === "UNIT_LEADER") return true;
  if (user.role === "SYSTEM_ADMIN") return false;
  if (user.role === "DEPARTMENT_LEADER") {
    const units = await getAuthorizedUnitIds(user);
    if (units === "ALL") return true;
    return !!unitId && units.includes(unitId);
  }
  return false;
}

export interface QualityVisibilityContext {
  ownerId?: string | null;
  submitterId?: string | null;
  deciderId?: string | null;
  unitId?: string | null;
}

/**
 * E10.6: owner + tuyến duyệt + người quyết định được xem quality.
 * Collaborator không mặc nhiên; SYSTEM_ADMIN không nghiệp vụ.
 */
export async function canViewApprovalQuality(
  user: SessionUser,
  ctx: QualityVisibilityContext
): Promise<boolean> {
  if (!isApprovalQualityEnabled()) return false;
  if (!user.personId) return false;
  if (user.role === "SYSTEM_ADMIN") return false;
  if (user.personId === ctx.ownerId || user.personId === ctx.submitterId) return true;
  if (user.personId === ctx.deciderId) return true;
  return await canDecideApprovalCase(user, ctx.unitId ?? null);
}

/** Người được gửi yêu cầu điều chỉnh: owner/submitter hoặc tuyến duyệt có thẩm quyền. */
async function canRequestQualityAdjustment(
  user: SessionUser,
  ctx: QualityVisibilityContext
): Promise<boolean> {
  if (!isApprovalQualityEnabled()) return false;
  if (!user.personId || user.role === "SYSTEM_ADMIN") return false;
  if (user.personId === ctx.ownerId || user.personId === ctx.submitterId) return true;
  return await canDecideApprovalCase(user, ctx.unitId ?? null);
}

// ---------------------------------------------------------------- read model

type DecisionLike = Pick<
  ApprovalDecision,
  "id" | "round" | "action" | "qualityPercent" | "actorPersonId" | "createdAt"
>;
type AdjustmentLike = Pick<
  ApprovalQualityAdjustment,
  | "id"
  | "caseId"
  | "decisionId"
  | "revision"
  | "oldQualityPercent"
  | "newQualityPercent"
  | "reason"
  | "requestedById"
  | "requestedAt"
  | "status"
  | "decidedById"
  | "decidedAt"
  | "decisionNote"
>;

export interface ApprovalQualityHistoryEntry {
  decisionId: string;
  round: number;
  action: string;
  actionLabel: string;
  qualityPercent: number | null;
  actorPersonId: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface ApprovalQualityAdjustmentView {
  id: string;
  decisionId: string;
  revision: number;
  oldQualityPercent: number | null;
  newQualityPercent: number;
  reason: string;
  status: string;
  statusLabel: string;
  requestedById: string;
  requestedByName: string | null;
  requestedAt: string;
  decidedById: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  /** Người xem có được quyết định yêu cầu này (không tự duyệt). */
  canDecide: boolean;
}

export interface ApprovalQualityView {
  /** false = không được xem dữ liệu quality (collaborator/admin/flag tắt). */
  visible: boolean;
  enabled: boolean;
  required: boolean;
  original: number | null;
  effective: number | null;
  adjusted: boolean;
  latestAdjustmentId: string | null;
  latestAdjustmentAt: string | null;
  canRequestAdjustment: boolean;
  pendingAdjustmentCount: number;
  history: ApprovalQualityHistoryEntry[];
  adjustments: ApprovalQualityAdjustmentView[];
}

const ACTION_LABELS: Record<string, string> = {
  AGREE: "Đồng ý",
  REJECT: "Không đồng ý",
  CLARIFY: "Yêu cầu giải trình",
  RESPOND: "Phản hồi giải trình",
};

export function emptyQualityView(enabled = isApprovalQualityEnabled()): ApprovalQualityView {
  return {
    visible: false,
    enabled,
    required: false,
    original: null,
    effective: null,
    adjusted: false,
    latestAdjustmentId: null,
    latestAdjustmentAt: null,
    canRequestAdjustment: false,
    pendingAdjustmentCount: 0,
    history: [],
    adjustments: [],
  };
}

/** Lượt AGREE cuối cùng là mức chính thức; adjustment APPROVED mới nhất phủ lên (không sửa gốc). */
export function computeEffectiveQuality(decisions: DecisionLike[], adjustments: AdjustmentLike[]) {
  const agrees = decisions
    .filter((d) => d.action === "AGREE")
    .sort((a, b) => {
      const byTime = b.createdAt.getTime() - a.createdAt.getTime();
      if (byTime !== 0) return byTime;
      return b.round - a.round;
    });
  const latestAgree = agrees[0] ?? null;
  const approved = adjustments
    .filter((a) => a.status === "APPROVED" && a.decisionId === latestAgree?.id)
    .sort((a, b) => {
      const byTime = (b.decidedAt?.getTime() ?? b.requestedAt.getTime()) -
        (a.decidedAt?.getTime() ?? a.requestedAt.getTime());
      if (byTime !== 0) return byTime;
      return b.revision - a.revision;
    })[0] ?? null;
  return {
    latestAgree,
    original: latestAgree?.qualityPercent ?? null,
    approvedAdjustment: approved,
    effective: approved ? approved.newQualityPercent : latestAgree?.qualityPercent ?? null,
    adjusted: !!approved,
  };
}

async function personNamesByIds(
  ids: Array<string | null | undefined>
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter((x): x is string => !!x)));
  if (unique.length === 0) return new Map();
  const people = await prisma.person.findMany({
    where: { id: { in: unique } },
    select: { id: true, fullName: true },
  });
  return new Map(people.map((p) => [p.id, p.fullName]));
}

export interface BuildQualityViewParams {
  user: SessionUser;
  caseType: string;
  case?: Pick<ApprovalCase, "id" | "status" | "unitId" | "submittedById" | "decidedById"> | null;
  decisions: DecisionLike[];
  adjustments: AdjustmentLike[];
  ownerId?: string | null;
}

/** Dựng read model quality cho preview/task detail. Không ghi dữ liệu. */
export async function buildApprovalQualityView(
  params: BuildQualityViewParams
): Promise<ApprovalQualityView> {
  const enabled = isApprovalQualityEnabled();
  if (!enabled) return emptyQualityView(false);

  const { user, caseType, case: approvalCase, decisions, adjustments, ownerId } = params;
  const ctx: QualityVisibilityContext = {
    ownerId: ownerId ?? null,
    submitterId: approvalCase?.submittedById ?? null,
    deciderId: approvalCase?.decidedById ?? null,
    unitId: approvalCase?.unitId ?? null,
  };
  const visible = await canViewApprovalQuality(user, ctx);
  if (!visible) return emptyQualityView(true);

  const quality = computeEffectiveQuality(decisions, adjustments);
  const names = await personNamesByIds([
    ...decisions.map((d) => d.actorPersonId),
    ...adjustments.map((a) => a.requestedById),
    ...adjustments.map((a) => a.decidedById),
  ]);

  const history: ApprovalQualityHistoryEntry[] = decisions
    .filter((d) => d.action !== "RESPOND")
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((d) => ({
      decisionId: d.id,
      round: d.round,
      action: d.action,
      actionLabel: ACTION_LABELS[d.action] ?? d.action,
      qualityPercent: d.qualityPercent ?? null,
      actorPersonId: d.actorPersonId,
      actorName: d.actorPersonId ? names.get(d.actorPersonId) ?? null : null,
      createdAt: d.createdAt.toISOString(),
    }));

  const isCaseSubmitter =
    !!approvalCase?.submittedById && approvalCase.submittedById === user.personId;
  const canDecide =
    !isCaseSubmitter && (await canDecideApprovalCase(user, approvalCase?.unitId ?? null));
  const mayRequest = await canRequestQualityAdjustment(user, ctx);
  const pending = adjustments.filter((a) => a.status === "PENDING");

  const adjustmentViews: ApprovalQualityAdjustmentView[] = adjustments
    .slice()
    .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime())
    .map((a) => ({
      id: a.id,
      decisionId: a.decisionId,
      revision: a.revision,
      oldQualityPercent: a.oldQualityPercent ?? null,
      newQualityPercent: a.newQualityPercent,
      reason: a.reason,
      status: a.status,
      statusLabel: APPROVAL_QUALITY_STATUS_LABELS[a.status] ?? a.status,
      requestedById: a.requestedById,
      requestedByName: names.get(a.requestedById) ?? null,
      requestedAt: a.requestedAt.toISOString(),
      decidedById: a.decidedById ?? null,
      decidedByName: a.decidedById ? names.get(a.decidedById) ?? null : null,
      decidedAt: a.decidedAt ? a.decidedAt.toISOString() : null,
      decisionNote: a.decisionNote ?? null,
      canDecide: canDecide && a.status === "PENDING" && a.requestedById !== user.personId,
    }));

  const currentEffective = quality.effective;
  return {
    visible: true,
    enabled: true,
    required: caseType === "TASK_RESULT",
    original: quality.original,
    effective: currentEffective,
    adjusted: quality.adjusted,
    latestAdjustmentId: quality.approvedAdjustment?.id ?? null,
    latestAdjustmentAt: quality.approvedAdjustment?.decidedAt?.toISOString() ?? null,
    canRequestAdjustment:
      caseType === "TASK_RESULT" &&
      approvalCase?.status === "AGREED" &&
      !!quality.latestAgree &&
      pending.length === 0 &&
      mayRequest,
    pendingAdjustmentCount: pending.length,
    history,
    adjustments: adjustmentViews,
  };
}

// ---------------------------------------------------------------- adjustment write

export interface QualityAdjustmentResult {
  success: boolean;
  status?: number;
  error?: string;
  data?: { id: string; status: string; oldQualityPercent: number | null; newQualityPercent: number };
}

interface QualityContext {
  approvalCase: ApprovalCase;
  decisions: ApprovalDecision[];
  adjustments: ApprovalQualityAdjustment[];
}

async function loadQualityContext(caseId: string): Promise<QualityContext | null> {
  const approvalCase = await prisma.approvalCase.findUnique({
    where: { id: caseId },
    include: {
      decisions: { orderBy: { createdAt: "asc" } },
      qualityAdjustments: { orderBy: { requestedAt: "asc" } },
    },
  });
  if (!approvalCase) return null;
  return {
    approvalCase,
    decisions: approvalCase.decisions,
    adjustments: approvalCase.qualityAdjustments,
  };
}

export interface RequestQualityAdjustmentParams {
  user: SessionUser;
  caseType: string;
  resourceId: string;
  newQualityPercent: unknown;
  reason: unknown;
}

/**
 * A1 — tạo yêu cầu điều chỉnh chất lượng sau khi hồ sơ đã AGREED.
 * Không cập nhật quyết định gốc; chỉ tạo bản ghi chờ người có thẩm quyền khác duyệt.
 */
export async function requestQualityAdjustment(
  params: RequestQualityAdjustmentParams
): Promise<QualityAdjustmentResult> {
  if (!isApprovalQualityEnabled()) {
    return { success: false, status: 409, error: "Tính năng điều chỉnh chất lượng chưa được bật." };
  }
  if (params.caseType !== "TASK_RESULT") {
    return {
      success: false,
      status: 400,
      error: "Chỉ điều chỉnh chất lượng cho hồ sơ nghiệm thu kết quả công việc.",
    };
  }

  const parsed = parseQualityPercent(params.newQualityPercent);
  if (!parsed.ok) return { success: false, status: 422, error: parsed.error };
  if (parsed.value === null) {
    return { success: false, status: 422, error: "Vui lòng chọn mức chất lượng điều chỉnh." };
  }
  const newQuality = parsed.value;
  const reason = typeof params.reason === "string" ? params.reason.trim() : "";
  if (!reason) {
    return { success: false, status: 422, error: "Vui lòng nêu lý do điều chỉnh chất lượng." };
  }

  const approvalCase = await prisma.approvalCase.findUnique({
    where: {
      caseType_resourceId: { caseType: "TASK_RESULT", resourceId: params.resourceId },
    },
  });
  if (!approvalCase) {
    return { success: false, status: 404, error: "Không tìm thấy hồ sơ nghiệm thu của nhiệm vụ." };
  }
  if (approvalCase.status !== "AGREED") {
    return {
      success: false,
      status: 409,
      error: "Chỉ điều chỉnh chất lượng sau khi hồ sơ đã được chấp thuận.",
    };
  }

  const task = await prisma.task.findUnique({
    where: { id: params.resourceId },
    select: { id: true, ownerId: true, unitId: true },
  });
  if (!task) return { success: false, status: 404, error: "Nhiệm vụ không tồn tại." };

  const ctx: QualityVisibilityContext = {
    ownerId: task.ownerId,
    submitterId: approvalCase.submittedById,
    deciderId: approvalCase.decidedById,
    unitId: approvalCase.unitId ?? task.unitId,
  };
  if (!(await canRequestQualityAdjustment(params.user, ctx))) {
    return {
      success: false,
      status: 403,
      error: "Bạn không có quyền yêu cầu điều chỉnh chất lượng hồ sơ này.",
    };
  }

  const context = await loadQualityContext(approvalCase.id);
  if (!context) return { success: false, status: 404, error: "Không tìm thấy hồ sơ." };
  const quality = computeEffectiveQuality(context.decisions, context.adjustments);
  if (!quality.latestAgree) {
    return { success: false, status: 409, error: "Hồ sơ chưa có quyết định AGREE để điều chỉnh." };
  }
  if (quality.effective === newQuality) {
    return {
      success: false,
      status: 422,
      error: `Mức chất lượng hiện tại đã là ${newQuality}% — không có thay đổi để điều chỉnh.`,
    };
  }
  const pending = context.adjustments.find(
    (a) => a.status === "PENDING" && a.decisionId === quality.latestAgree!.id
  );
  if (pending) {
    return {
      success: false,
      status: 409,
      error: "Đã có yêu cầu điều chỉnh chất lượng đang chờ xử lý cho hồ sơ này.",
    };
  }

  const decisionId = quality.latestAgree.id;
  const oldQuality = quality.effective;
  let created: ApprovalQualityAdjustment;
  try {
    created = await prisma.$transaction(async (tx) => {
      const maxRevision = await tx.approvalQualityAdjustment.aggregate({
        where: { decisionId },
        _max: { revision: true },
      });
      return tx.approvalQualityAdjustment.create({
        data: {
          caseId: approvalCase.id,
          decisionId,
          revision: (maxRevision._max.revision ?? 0) + 1,
          oldQualityPercent: oldQuality,
          newQualityPercent: newQuality,
          reason,
          requestedById: params.user.personId,
          requestedByAccountId: params.user.id,
          status: "PENDING",
        },
      });
    });
  } catch (err: any) {
    if (err?.code === "P2002") {
      return {
        success: false,
        status: 409,
        error: "Đã có yêu cầu điều chỉnh chất lượng đang chờ xử lý cho hồ sơ này.",
      };
    }
    throw err;
  }

  await recordAuditEvent({
    actorId: params.user.id,
    action: "APPROVAL_QUALITY_ADJUSTMENT_REQUESTED",
    resourceType: "ApprovalQualityAdjustment",
    resourceId: created.id,
    oldData: { qualityPercent: oldQuality },
    newData: {
      caseId: approvalCase.id,
      decisionId,
      resourceId: params.resourceId,
      round: quality.latestAgree.round,
      oldQualityPercent: oldQuality,
      newQualityPercent: newQuality,
      reason,
      requestedById: params.user.personId,
      revision: created.revision,
    },
  });

  return {
    success: true,
    data: {
      id: created.id,
      status: created.status,
      oldQualityPercent: created.oldQualityPercent ?? null,
      newQualityPercent: created.newQualityPercent,
    },
  };
}

export interface DecideQualityAdjustmentParams {
  user: SessionUser;
  adjustmentId: string;
  action: unknown;
  note?: unknown;
}

/**
 * Duyệt/từ chối yêu cầu điều chỉnh.
 * - Chỉ người có thẩm quyền quyết định hồ sơ.
 * - Không tự duyệt yêu cầu do chính mình gửi.
 * - Không sửa `approval_decisions.quality_percent`; quality hiệu lực đọc từ adjustment APPROVED.
 */
export async function decideQualityAdjustment(
  params: DecideQualityAdjustmentParams
): Promise<QualityAdjustmentResult> {
  if (!isApprovalQualityEnabled()) {
    return { success: false, status: 409, error: "Tính năng điều chỉnh chất lượng chưa được bật." };
  }
  const action = String(params.action || "").toUpperCase();
  if (!(APPROVAL_QUALITY_ACTIONS as readonly string[]).includes(action)) {
    return { success: false, status: 400, error: "Quyết định không hợp lệ (APPROVE hoặc REJECT)." };
  }
  const note = typeof params.note === "string" ? params.note.trim() || null : null;

  const adjustment = await prisma.approvalQualityAdjustment.findUnique({
    where: { id: params.adjustmentId },
    include: { case: true },
  });
  if (!adjustment) {
    return { success: false, status: 404, error: "Không tìm thấy yêu cầu điều chỉnh chất lượng." };
  }
  if (adjustment.status !== "PENDING") {
    return { success: false, status: 409, error: "Yêu cầu điều chỉnh này đã được xử lý." };
  }

  const canDecide = await canDecideApprovalCase(params.user, adjustment.case.unitId);
  if (!canDecide) {
    return {
      success: false,
      status: 403,
      error: "Bạn không có thẩm quyền quyết định điều chỉnh chất lượng hồ sơ này.",
    };
  }
  if (adjustment.requestedById === params.user.personId) {
    return {
      success: false,
      status: 403,
      error: "Bạn không được tự duyệt yêu cầu điều chỉnh do chính mình gửi — cần người khác thẩm quyền.",
    };
  }
  if (adjustment.case.submittedById === params.user.personId) {
    return {
      success: false,
      status: 403,
      error:
        "Bạn là người trình hồ sơ — không được tự duyệt điều chỉnh chất lượng của chính hồ sơ mình đã trình; cần người khác thẩm quyền.",
    };
  }

  if (action === "APPROVE") {
    const context = await loadQualityContext(adjustment.caseId);
    if (!context) return { success: false, status: 404, error: "Không tìm thấy hồ sơ." };
    const quality = computeEffectiveQuality(context.decisions, context.adjustments);
    if (quality.latestAgree?.id !== adjustment.decisionId) {
      return {
        success: false,
        status: 409,
        error: "Quyết định gốc đã thay đổi — yêu cầu điều chỉnh không còn áp dụng.",
      };
    }
    if ((quality.effective ?? null) !== (adjustment.oldQualityPercent ?? null)) {
      return {
        success: false,
        status: 409,
        error: "Mức chất lượng đã thay đổi kể từ khi gửi yêu cầu — vui lòng tạo yêu cầu mới.",
      };
    }
  }

  const status = action === "APPROVE" ? "APPROVED" : "REJECTED";
  const claimed = await prisma.approvalQualityAdjustment.updateMany({
    where: { id: adjustment.id, status: "PENDING" },
    data: {
      status,
      decidedById: params.user.personId,
      decidedByAccountId: params.user.id,
      decidedAt: new Date(),
      decisionNote: note,
    },
  });
  if (claimed.count === 0) {
    return { success: false, status: 409, error: "Yêu cầu điều chỉnh vừa được xử lý bởi người khác." };
  }

  await recordAuditEvent({
    actorId: params.user.id,
    action:
      status === "APPROVED"
        ? "APPROVAL_QUALITY_ADJUSTMENT_APPROVED"
        : "APPROVAL_QUALITY_ADJUSTMENT_REJECTED",
    resourceType: "ApprovalQualityAdjustment",
    resourceId: adjustment.id,
    oldData: { status: "PENDING" },
    newData: {
      status,
      caseId: adjustment.caseId,
      decisionId: adjustment.decisionId,
      resourceId: adjustment.case.resourceId,
      oldQualityPercent: adjustment.oldQualityPercent,
      newQualityPercent: adjustment.newQualityPercent,
      reason: adjustment.reason,
      requestedById: adjustment.requestedById,
      decidedById: params.user.personId,
      decisionNote: note,
    },
  });

  if (adjustment.requestedById !== params.user.personId) {
    await createNotification({
      recipientId: adjustment.requestedById,
      category: "approval",
      type:
        status === "APPROVED"
          ? "APPROVAL_QUALITY_ADJUSTMENT_APPROVED"
          : "APPROVAL_QUALITY_ADJUSTMENT_REJECTED",
      title:
        status === "APPROVED"
          ? `Yêu cầu điều chỉnh chất lượng đã được chấp thuận: [${adjustment.case.resourceCode ?? ""}] ${adjustment.case.title}`
          : `Yêu cầu điều chỉnh chất lượng bị từ chối: [${adjustment.case.resourceCode ?? ""}] ${adjustment.case.title}`,
      content:
        status === "APPROVED"
          ? `Mức chất lượng được điều chỉnh từ ${adjustment.oldQualityPercent ?? "chưa đánh giá"}% sang ${adjustment.newQualityPercent}%.`
          : `Yêu cầu điều chỉnh sang ${adjustment.newQualityPercent}% bị từ chối${note ? `: ${note}` : "."}`,
      tag: status === "APPROVED" ? "ĐÃ ĐIỀU CHỈNH" : "TỪ CHỐI ĐIỀU CHỈNH",
      tagType: status === "APPROVED" ? "success" : "danger",
      entityType: "TASK",
      entityId: adjustment.case.resourceId,
      actionUrl: `/tasks/${adjustment.case.resourceId}`,
      actionLabel: "Xem nhiệm vụ",
      idempotencyKey: `EVENT_QUALITY_ADJ_${adjustment.id}_${status}`,
    });
  }

  return {
    success: true,
    data: {
      id: adjustment.id,
      status,
      oldQualityPercent: adjustment.oldQualityPercent ?? null,
      newQualityPercent: adjustment.newQualityPercent,
    },
  };
}

// ---------------------------------------------------------------- export support

export interface ApprovalQualityExportRow {
  taskId: string;
  taskCode: string;
  taskTitle: string;
  decisionRound: number | null;
  originalQualityPercent: number | null;
  effectiveQualityPercent: number | null;
  adjusted: boolean;
  adjustmentReason: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
}

/**
 * Dữ liệu sheet phụ "Đánh giá chất lượng".
 * Chỉ lấy Task thuộc sở hữu của personId (nếu truyền) để collaborator không thấy quality qua export.
 */
export async function getApprovalQualityExportRows(
  taskIds: string[],
  ownerPersonId?: string | null
): Promise<ApprovalQualityExportRow[]> {
  if (taskIds.length === 0) return [];
  const tasks = await prisma.task.findMany({
    where: {
      id: { in: taskIds },
      ...(ownerPersonId ? { ownerId: ownerPersonId } : {}),
    },
    select: { id: true, code: true, title: true, ownerId: true },
  });
  if (tasks.length === 0) return [];

  const cases = await prisma.approvalCase.findMany({
    where: { caseType: "TASK_RESULT", resourceId: { in: tasks.map((t) => t.id) } },
    include: {
      decisions: { orderBy: { createdAt: "asc" } },
      qualityAdjustments: { orderBy: { requestedAt: "asc" } },
    },
  });
  const caseByTask = new Map(cases.map((c) => [c.resourceId, c]));
  const names = await personNamesByIds(
    cases.flatMap((c) =>
      c.decisions.filter((d) => d.action === "AGREE").map((d) => d.actorPersonId)
    )
  );

  return tasks.map((task) => {
    const approvalCase = caseByTask.get(task.id) ?? null;
    if (!approvalCase) {
      return {
        taskId: task.id,
        taskCode: task.code,
        taskTitle: task.title,
        decisionRound: null,
        originalQualityPercent: null,
        effectiveQualityPercent: null,
        adjusted: false,
        adjustmentReason: null,
        decidedByName: null,
        decidedAt: null,
      };
    }
    const quality = computeEffectiveQuality(
      approvalCase.decisions,
      approvalCase.qualityAdjustments
    );
    const approved = quality.approvedAdjustment;
    return {
      taskId: task.id,
      taskCode: task.code,
      taskTitle: task.title,
      decisionRound: quality.latestAgree?.round ?? null,
      originalQualityPercent: quality.original,
      effectiveQualityPercent: quality.effective,
      adjusted: quality.adjusted,
      adjustmentReason: approved?.reason ?? null,
      decidedByName: quality.latestAgree?.actorPersonId
        ? names.get(quality.latestAgree.actorPersonId) ?? null
        : null,
      decidedAt: quality.latestAgree?.createdAt?.toISOString() ?? null,
    };
  });
}
