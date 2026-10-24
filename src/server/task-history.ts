/**
 * E12-A — Lịch sử hợp nhất của nhiệm vụ (Task / kết quả / duyệt).
 *
 * Phạm vi ĐÃ CHỐT: chỉ gồm 3 nguồn
 *   1. TaskUpdate            — cập nhật tiến độ/trạng thái cấp nhiệm vụ
 *   2. ApprovalDecision      — quyết định duyệt trên ApprovalCase của nhiệm vụ
 *   3. TaskParticipantEvent  — sự kiện phần việc của người phối hợp
 *
 * KHÔNG gộp bình luận (TaskComment) và tệp đính kèm (TaskAttachment).
 * Mỗi bản ghi trả về kèm `source` + `sourceLabel` để UI/API không trộn nguồn.
 *
 * Bản ghi TaskUpdate mirror của phần việc phối hợp (subjectPersonId/participantEventId)
 * bị loại khỏi nguồn TaskUpdate để không trùng với TaskParticipantEvent.
 */

import { prisma } from "./db";
import type { SessionUser } from "./auth";
import { APPROVAL_ACTION_LABELS, type ApprovalAction } from "./approval-case";
import { canViewApprovalQuality } from "./approval-quality";

export const TASK_HISTORY_SOURCES = [
  "TASK_UPDATE",
  "APPROVAL_DECISION",
  "PARTICIPANT_EVENT",
] as const;

export type TaskHistorySource = (typeof TASK_HISTORY_SOURCES)[number];

export const TASK_HISTORY_SOURCE_LABELS: Record<TaskHistorySource, string> = {
  TASK_UPDATE: "Cập nhật nhiệm vụ",
  APPROVAL_DECISION: "Quyết định duyệt",
  PARTICIPANT_EVENT: "Phần việc phối hợp",
};

export function isTaskHistorySource(value: string): value is TaskHistorySource {
  return (TASK_HISTORY_SOURCES as readonly string[]).includes(value);
}

export interface TaskHistoryEntry {
  id: string;
  at: string;
  source: TaskHistorySource;
  sourceLabel: string;
  kind: string;
  title: string;
  detail: string | null;
  actorName: string;
  actorPersonId: string | null;
  /** Người được ghi nhận trong sự kiện phần việc (nếu có). */
  subjectPersonName: string | null;
  progressPercent: number | null;
  statusFrom: string | null;
  statusTo: string | null;
  round: number | null;
  action: string | null;
  actionLabel: string | null;
  qualityPercent: number | null;
}

export interface TaskHistoryFilters {
  sources?: TaskHistorySource[];
  /** Số bản ghi tối đa sau khi lọc (mặc định 200, tối đa 500). */
  limit?: number | null;
}

/**
 * Ngữ cảnh người xem lịch sử. Dùng để quyết định có hiển thị `qualityPercent`
 * của quyết định duyệt hay không (E10.6).
 *
 * Không truyền `access` => ẩn quality (fail closed).
 */
export interface TaskHistoryAccess {
  viewer: SessionUser;
  ownerId?: string | null;
  unitId?: string | null;
}

export interface TaskHistoryResult {
  taskId: string;
  entries: TaskHistoryEntry[];
  counts: Record<TaskHistorySource, number>;
  /** Nguồn được yêu cầu (rỗng = tất cả). */
  sources: TaskHistorySource[];
  limit: number;
}

const TASK_UPDATE_TITLES: Record<string, string> = {
  accept: "Xác nhận nhận việc",
  submit: "Nộp kết quả / Chờ duyệt",
  approve: "Nghiệm thu hoàn thành",
  return: "Trả lại yêu cầu hoàn thiện",
  cancel: "Loại nhiệm vụ trùng",
  extend: "Gia hạn",
  progress: "Cập nhật tiến độ",
};

const PARTICIPANT_EVENT_TITLES: Record<string, string> = {
  SUBMIT: "Báo phần việc",
  PROGRESS: "Cập nhật phần việc",
  RETURN: "Trả lại phần việc",
  ACCEPT: "Chấp nhận phần việc",
  EXEMPT: "Miễn phần việc",
  REOPEN: "Mở lại phần việc",
  PRECHECK_PASS: "Kiểm tra sơ bộ đạt",
  PRECHECK_RETURN: "Kiểm tra sơ bộ trả lại",
};

const SOURCE_RANK: Record<TaskHistorySource, number> = {
  APPROVAL_DECISION: 0,
  TASK_UPDATE: 1,
  PARTICIPANT_EVENT: 2,
};

function clampLimit(value?: number | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 200;
  return Math.min(Math.floor(parsed), 500);
}

async function namesByIds(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => typeof x === "string" && x.length > 0))];
  if (unique.length === 0) return new Map();
  const people = await prisma.person.findMany({
    where: { id: { in: unique } },
    select: { id: true, fullName: true },
  });
  return new Map(people.map((p) => [p.id, p.fullName]));
}

/**
 * Đọc lịch sử hợp nhất. Người gọi PHẢI tự kiểm tra quyền READ trên Task trước
 * (route dùng `verifyTaskAccess(..., "READ")`).
 *
 * `access` quyết định quyền xem `qualityPercent`. Bỏ trống => ẩn quality (fail closed).
 */
export async function getTaskUnifiedHistory(
  taskId: string,
  filters: TaskHistoryFilters = {},
  access?: TaskHistoryAccess
): Promise<TaskHistoryResult> {
  const limit = clampLimit(filters.limit);
  const requestedSources = (filters.sources ?? []).filter(isTaskHistorySource);

  const [updates, participantEvents, approvalCase] = await Promise.all([
    prisma.taskUpdate.findMany({
      where: {
        taskId,
        // Chỉ bản ghi cấp nhiệm vụ; mirror phần việc phối hợp thuộc nguồn PARTICIPANT_EVENT.
        subjectPersonId: null,
        participantEventId: null,
      },
      include: { author: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.taskParticipantEvent.findMany({
      where: { taskId },
      include: {
        person: { select: { id: true, fullName: true } },
        actorPerson: { select: { id: true, fullName: true } },
        actorAccount: { select: { person: { select: { id: true, fullName: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.approvalCase.findUnique({
      where: { caseType_resourceId: { caseType: "TASK_RESULT", resourceId: taskId } },
      include: {
        decisions: {
          orderBy: { createdAt: "desc" },
          take: 200,
        },
      },
    }),
  ]);

  const decisionNames = await namesByIds(
    (approvalCase?.decisions ?? []).map((d) => d.actorPersonId)
  );

  // E10.6 — collaborator không thuộc tuyến duyệt không được thấy quality trong lịch sử.
  // Không truyền viewer => ẩn (fail closed).
  const canSeeQuality = access?.viewer
    ? await canViewApprovalQuality(access.viewer, {
        ownerId: access.ownerId ?? null,
        submitterId: approvalCase?.submittedById ?? null,
        deciderId: approvalCase?.decidedById ?? null,
        unitId: approvalCase?.unitId ?? access.unitId ?? null,
      })
    : false;

  const entries: TaskHistoryEntry[] = [];

  for (const u of updates) {
    const kind = u.kind || "progress";
    entries.push({
      id: `upd-${u.id}`,
      at: u.createdAt.toISOString(),
      source: "TASK_UPDATE",
      sourceLabel: TASK_HISTORY_SOURCE_LABELS.TASK_UPDATE,
      kind,
      title: TASK_UPDATE_TITLES[kind] || "Cập nhật tiến độ",
      detail: u.notes || null,
      actorName: u.author?.fullName || "Cán bộ thụ lý",
      actorPersonId: u.authorId,
      subjectPersonName: null,
      progressPercent: u.progressPercent,
      statusFrom: u.statusBefore || null,
      statusTo: u.statusAfter || null,
      round: null,
      action: null,
      actionLabel: null,
      qualityPercent: null,
    });
  }

  for (const d of approvalCase?.decisions ?? []) {
    const action = d.action as ApprovalAction;
    const actionLabel = APPROVAL_ACTION_LABELS[action] ?? d.action;
    entries.push({
      id: `dec-${d.id}`,
      at: d.createdAt.toISOString(),
      source: "APPROVAL_DECISION",
      sourceLabel: TASK_HISTORY_SOURCE_LABELS.APPROVAL_DECISION,
      kind: `approval_${d.action.toLowerCase()}`,
      title: actionLabel,
      detail:
        [d.reason ? `Lý do: ${d.reason}` : null, d.content ? `Nội dung: ${d.content}` : null]
          .filter(Boolean)
          .join(" · ") || null,
      actorName:
        (d.actorPersonId ? decisionNames.get(d.actorPersonId) : null) || "Lãnh đạo thẩm quyền",
      actorPersonId: d.actorPersonId ?? null,
      subjectPersonName: null,
      progressPercent: null,
      statusFrom: null,
      statusTo: null,
      round: d.round,
      action: d.action,
      actionLabel,
      qualityPercent: canSeeQuality ? d.qualityPercent ?? null : null,
    });
  }

  for (const e of participantEvents) {
    entries.push({
      id: `pev-${e.id}`,
      at: e.createdAt.toISOString(),
      source: "PARTICIPANT_EVENT",
      sourceLabel: TASK_HISTORY_SOURCE_LABELS.PARTICIPANT_EVENT,
      kind: `participant_${e.eventType.toLowerCase()}`,
      title: PARTICIPANT_EVENT_TITLES[e.eventType] || `Sự kiện phần việc: ${e.eventType}`,
      detail:
        [e.note ? e.note : null, e.resultTextSnapshot ? `Kết quả phần việc: ${e.resultTextSnapshot}` : null]
          .filter(Boolean)
          .join(" · ") || null,
      actorName:
        e.actorPerson?.fullName ||
        e.actorAccount?.person?.fullName ||
        e.person?.fullName ||
        "Cán bộ",
      actorPersonId: e.actorPersonId ?? e.actorAccount?.person?.id ?? null,
      subjectPersonName: e.person?.fullName ?? null,
      progressPercent: null,
      statusFrom: null,
      statusTo: null,
      round: e.round,
      action: null,
      actionLabel: null,
      qualityPercent: null,
    });
  }

  const counts: Record<TaskHistorySource, number> = {
    TASK_UPDATE: 0,
    APPROVAL_DECISION: 0,
    PARTICIPANT_EVENT: 0,
  };
  for (const entry of entries) counts[entry.source] += 1;

  entries.sort((a, b) => {
    const diff = new Date(b.at).getTime() - new Date(a.at).getTime();
    if (diff !== 0) return diff;
    const rank = SOURCE_RANK[a.source] - SOURCE_RANK[b.source];
    if (rank !== 0) return rank;
    return a.id.localeCompare(b.id);
  });

  const filtered =
    requestedSources.length > 0
      ? entries.filter((entry) => requestedSources.includes(entry.source))
      : entries;

  return {
    taskId,
    entries: filtered.slice(0, limit),
    counts,
    sources: requestedSources,
    limit,
  };
}
