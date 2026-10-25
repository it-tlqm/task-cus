/**
 * YC-09 Phase 1 — TaskParticipantResult / participant events / submission snapshots.
 *
 * Nguyên tắc:
 * - Một Task vẫn chỉ có MỘT ApprovalCase (S4 tạo ở lần quyết định đầu).
 * - Participant result/event là dữ liệu con; không tạo case/decision riêng.
 * - Collaborator chỉ ghi phần mình; không ghi Task progress / actualResultText chung.
 * - Snapshot theo (task, round) tại thời điểm chủ trì nộp chung.
 */
import { prisma } from "./db";
import { SessionUser } from "./auth";
import { isTaskLeader, isTerminalTaskStatus } from "./task-transitions";
import { recordAuditEvent } from "./audit";
import { createNotification } from "./notifications";
import { advisoryLock, isValidProgressStep } from "./idempotency";
import { ParticipantError } from "./task-participant-error";
import { createRouteSnapshotForSubmission, isPrecheckEnabled } from "./approval-route";

export { ParticipantError };

export const PARTICIPANT_STATUSES = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "SUBMITTED",
  "RETURNED",
  "ACCEPTED",
  "EXEMPT",
] as const;

export type ParticipantStatus = (typeof PARTICIPANT_STATUSES)[number];

const STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: "Chưa bắt đầu",
  IN_PROGRESS: "Đang thực hiện",
  SUBMITTED: "Đã báo phần việc",
  RETURNED: "Bị trả lại",
  ACCEPTED: "Đã chấp nhận",
  EXEMPT: "Được miễn",
};

function toDateOnly(value: string | Date): Date {
  const raw = typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
  const d = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new ParticipantError("Ngày hoàn thành không hợp lệ.", 422);
  return d;
}

function assertStatus(value: string): asserts value is ParticipantStatus {
  if (!(PARTICIPANT_STATUSES as readonly string[]).includes(value)) {
    throw new ParticipantError("Trạng thái phần việc không hợp lệ.", 422);
  }
}

async function getTaskWithPeople(tx: any, taskId: string) {
  const task = await tx.task.findUnique({
    where: { id: taskId },
    include: {
      owner: { select: { id: true, fullName: true } },
      assignees: { include: { person: { select: { id: true, fullName: true } } } },
    },
  });
  if (!task) throw new ParticipantError("Nhiệm vụ không tồn tại.", 404);
  return task;
}

/**
 * Tạo/đảm bảo dòng participant cho owner + collaborator (không tạo VIEWER).
 * Lazy: Task cũ không bị backfill cho tới khi dùng tính năng.
 */
export async function ensureParticipantRows(
  tx: any,
  taskId: string,
  opts: { legacy?: boolean } = { legacy: true }
) {
  const task = await getTaskWithPeople(tx, taskId);
  const legacy = opts.legacy ?? true;
  const rows: any[] = [];
  const owner = await tx.taskParticipantResult.upsert({
    where: { taskId_personId: { taskId, personId: task.ownerId } },
    update: legacy ? {} : { legacy: false },
    create: {
      taskId,
      personId: task.ownerId,
      role: "OWNER",
      partStatus: "NOT_STARTED",
      legacy,
    },
  });
  rows.push(owner);
  for (const a of task.assignees || []) {
    if (a.role === "VIEWER") continue;
    const row = await tx.taskParticipantResult.upsert({
      where: { taskId_personId: { taskId, personId: a.personId } },
      update: legacy ? {} : { legacy: false },
      create: {
        taskId,
        personId: a.personId,
        role: "COLLABORATOR",
        partStatus: "NOT_STARTED",
        legacy,
      },
    });
    rows.push(row);
  }
  return { task, rows };
}

/** Khởi tạo participant cho Task mới qua API: từ đây S-ALL được áp dụng. */
export async function initializeTaskParticipants(tx: any, taskId: string) {
  return ensureParticipantRows(tx, taskId, { legacy: false });
}

export async function listParticipantResults(taskId: string, tx: any = prisma) {
  const { task } = await ensureParticipantRows(tx, taskId);
  const rows = await tx.taskParticipantResult.findMany({
    where: { taskId },
    include: {
      person: { select: { id: true, fullName: true, code: true } },
      submittedBy: { select: { id: true, fullName: true } },
      decidedBy: { select: { id: true, fullName: true } },
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });
  return rows.sort((a: any, b: any) => {
    if (a.role === "OWNER" && b.role !== "OWNER") return -1;
    if (b.role === "OWNER" && a.role !== "OWNER") return 1;
    return a.person.fullName.localeCompare(b.person.fullName, "vi");
  });
}

export function participantSummary(row: any) {
  return {
    id: row.id,
    personId: row.personId,
    personName: row.person?.fullName ?? "—",
    personCode: row.person?.code ?? null,
    role: row.role,
    partStatus: row.partStatus,
    partStatusLabel: STATUS_LABEL[row.partStatus] ?? row.partStatus,
    partResultText: row.partResultText,
    partCompletedOn: row.partCompletedOn
      ? new Date(row.partCompletedOn).toISOString().slice(0, 10)
      : null,
    partProgressPercent: row.partProgressPercent,
    submittedAt: row.submittedAt?.toISOString?.() ?? null,
    decidedAt: row.decidedAt?.toISOString?.() ?? null,
    decisionNote: row.decisionNote,
    round: row.round,
    legacy: row.legacy,
  };
}

async function getCurrentSubmissionRound(tx: any, taskId: string) {
  const latest = await tx.taskSubmissionSnapshot.findFirst({
    where: { taskId },
    orderBy: { round: "desc" },
    select: { round: true },
  });
  return (latest?.round ?? 0) + 1;
}

export async function getParticipantSummary(taskId: string, tx: any = prisma) {
  const rows = await listParticipantResults(taskId, tx);
  return rows.map(participantSummary);
}

export async function getLatestSubmissionSnapshot(taskId: string, tx: any = prisma) {
  return tx.taskSubmissionSnapshot.findFirst({
    where: { taskId },
    orderBy: { round: "desc" },
  });
}

export async function getEffectiveSubmitterId(taskId: string, tx: any = prisma) {
  const snapshot = await getLatestSubmissionSnapshot(taskId, tx);
  if (snapshot?.submittedById) return snapshot.submittedById as string;
  const task = await tx.task.findUnique({ where: { id: taskId }, select: { ownerId: true } });
  return task?.ownerId ?? null;
}

export async function getMissingParticipants(taskId: string, tx: any = prisma) {
  const rows = await listParticipantResults(taskId, tx);
  return rows.filter(
    (r: any) =>
      r.role === "COLLABORATOR" &&
      !r.legacy &&
      !["SUBMITTED", "ACCEPTED", "EXEMPT"].includes(String(r.partStatus))
  );
}

export async function assertCanSubmitOverall(taskId: string, tx: any = prisma) {
  const missing = await getMissingParticipants(taskId, tx);
  if (missing.length > 0) {
    throw new ParticipantError(
      `Chưa đủ phần việc của người phối hợp: ${missing
        .map((m: any) => m.person?.fullName ?? m.personId)
        .join(", ")}.`,
      409,
      {
        missing: missing.map((m: any) => ({
          personId: m.personId,
          personName: m.person?.fullName ?? null,
          partStatus: m.partStatus,
        })),
      }
    );
  }
}

function eventTypeFor(action: "SUBMIT" | "PROGRESS" | "RETURN" | "ACCEPT" | "EXEMPT") {
  return action;
}

async function createParticipantEvent(
  tx: any,
  params: {
    participantResultId: string;
    taskId: string;
    personId: string;
    eventType: string;
    round: number;
    actor: SessionUser;
    note?: string | null;
    resultText?: string | null;
    completedOn?: Date | null;
  }
) {
  return tx.taskParticipantEvent.create({
    data: {
      participantResultId: params.participantResultId,
      taskId: params.taskId,
      personId: params.personId,
      eventType: params.eventType,
      round: params.round,
      actorAccountId: params.actor.id,
      actorPersonId: params.actor.personId ?? null,
      note: params.note?.trim() || null,
      resultTextSnapshot: params.resultText ?? null,
      completedOnSnapshot: params.completedOn ?? null,
    },
  });
}

async function mirrorParticipantUpdate(
  tx: any,
  params: {
    taskId: string;
    actor: SessionUser;
    personId: string;
    kind: string;
    note: string;
    participantEventId?: string;
  }
) {
  return tx.taskUpdate.create({
    data: {
      taskId: params.taskId,
      authorId: params.actor.personId,
      progressPercent: 0, // không làm thay đổi Task progress
      statusBefore: null,
      statusAfter: null,
      kind: params.kind,
      notes: params.note,
      subjectPersonId: params.personId,
      participantEventId: params.participantEventId ?? null,
    },
  });
}

export async function submitParticipantPart(
  user: SessionUser,
  taskId: string,
  input: {
    partResultText: string;
    partCompletedOn: string | Date;
    partProgressPercent?: number | null;
    notes?: string | null;
  }
) {
  const text = (input.partResultText || "").trim();
  if (text.length < 5) throw new ParticipantError("Vui lòng nhập kết quả phần việc (ít nhất 5 ký tự).", 422);
  const completedOn = toDateOnly(input.partCompletedOn);
  if (input.partProgressPercent !== undefined && input.partProgressPercent !== null) {
    if (!isValidProgressStep(input.partProgressPercent)) {
      throw new ParticipantError("Tiến độ phần việc phải là bội số của 5% trong khoảng 0–100.", 422);
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    await advisoryLock(tx, `task-participant:${taskId}:${user.personId}`);
    await advisoryLock(tx, `task-status:${taskId}`);
    const { task } = await ensureParticipantRows(tx, taskId, { legacy: false });
    if (isTerminalTaskStatus(task.status)) throw new ParticipantError("Nhiệm vụ đã kết thúc — không thể báo phần việc.", 409);
    if (task.status === "WAITING_REVIEW") throw new ParticipantError("Nhiệm vụ đang chờ lãnh đạo duyệt — phần việc đã khóa.", 409);
    const row = await tx.taskParticipantResult.findUnique({
      where: { taskId_personId: { taskId, personId: user.personId } },
    });
    if (!row) throw new ParticipantError("Bạn không phải người tham gia nhiệm vụ này.", 403);
    if (row.role === "VIEWER") throw new ParticipantError("Người xem không được báo phần việc.", 403);
    if (row.partStatus === "ACCEPTED") throw new ParticipantError("Phần việc đã được chấp nhận — không thể sửa.", 409);

    const round = await getCurrentSubmissionRound(tx, taskId);
    const updated = await tx.taskParticipantResult.update({
      where: { id: row.id },
      data: {
        partStatus: "SUBMITTED",
        partResultText: text,
        partCompletedOn: completedOn,
        partProgressPercent: input.partProgressPercent ?? 100,
        submittedAt: new Date(),
        submittedById: user.personId,
        decidedAt: null,
        decidedById: null,
        decisionNote: null,
        round,
      },
    });
    const event = await createParticipantEvent(tx, {
      participantResultId: updated.id,
      taskId,
      personId: user.personId,
      eventType: eventTypeFor("SUBMIT"),
      round,
      actor: user,
      note: input.notes || null,
      resultText: text,
      completedOn,
    });
    await mirrorParticipantUpdate(tx, {
      taskId,
      actor: user,
      personId: user.personId,
      kind: "participant_submit",
      note: `Báo phần việc: ${text}`,
      participantEventId: event.id,
    });
    return { updated, task, round };
  });

  await recordAuditEvent({
    actorId: user.id,
    action: "TASK_PARTICIPANT_SUBMIT",
    resourceType: "Task",
    resourceId: taskId,
    oldData: null,
    newData: {
      personId: user.personId,
      personName: user.fullName,
      partResultText: text.slice(0, 500),
      round: result.round,
    },
  });

  // Chủ trì biết phần việc của collaborator đã báo.
  if (result.task.ownerId !== user.personId) {
    await createNotification({
      recipientId: result.task.ownerId,
      category: "task",
      type: "TASK_PARTICIPANT_SUBMITTED",
      title: `Phần việc đã báo: [${result.task.code}]`,
      content: `${user.fullName} đã báo phần việc cho nhiệm vụ "${result.task.title}".`,
      tag: "PHẦN VIỆC",
      tagType: "primary",
      entityType: "TASK",
      entityId: taskId,
      actionUrl: `/tasks/${taskId}`,
      actionLabel: "Xem nhiệm vụ",
      taskCode: result.task.code,
      idempotencyKey: `participant-submit:${taskId}:${user.personId}:${result.round}`,
    });
  }

  return result.updated;
}

export async function recordParticipantProgress(
  user: SessionUser,
  taskId: string,
  input: { progressPercent: number; notes?: string | null }
) {
  if (!isValidProgressStep(input.progressPercent)) {
    throw new ParticipantError("Tiến độ phần việc phải là bội số của 5% trong khoảng 0–100.", 422);
  }
  const result = await prisma.$transaction(async (tx) => {
    await advisoryLock(tx, `task-participant:${taskId}:${user.personId}`);
    const { task } = await ensureParticipantRows(tx, taskId, { legacy: false });
    if (isTerminalTaskStatus(task.status)) throw new ParticipantError("Nhiệm vụ đã kết thúc — không thể cập nhật phần việc.", 409);
    if (task.status === "WAITING_REVIEW") throw new ParticipantError("Nhiệm vụ đang chờ lãnh đạo duyệt — phần việc đã khóa.", 409);
    const row = await tx.taskParticipantResult.findUnique({
      where: { taskId_personId: { taskId, personId: user.personId } },
    });
    if (!row) throw new ParticipantError("Bạn không phải người tham gia nhiệm vụ này.", 403);
    if (row.partStatus === "ACCEPTED") throw new ParticipantError("Phần việc đã được chấp nhận — không thể sửa.", 409);
    const round = await getCurrentSubmissionRound(tx, taskId);
    const nextStatus = row.partStatus === "SUBMITTED" ? "SUBMITTED" : "IN_PROGRESS";
    const updated = await tx.taskParticipantResult.update({
      where: { id: row.id },
      data: {
        partStatus: nextStatus,
        partProgressPercent: input.progressPercent,
        round,
      },
    });
    const event = await createParticipantEvent(tx, {
      participantResultId: updated.id,
      taskId,
      personId: user.personId,
      eventType: "PROGRESS",
      round,
      actor: user,
      note: input.notes || null,
    });
    await mirrorParticipantUpdate(tx, {
      taskId,
      actor: user,
      personId: user.personId,
      kind: "participant_progress",
      note: input.notes?.trim() || `Cập nhật tiến độ phần việc: ${input.progressPercent}%`,
      participantEventId: event.id,
    });
    return updated;
  });
  await recordAuditEvent({
    actorId: user.id,
    action: "TASK_PARTICIPANT_PROGRESS",
    resourceType: "Task",
    resourceId: taskId,
    newData: { personId: user.personId, progressPercent: input.progressPercent },
  });
  return result;
}

export async function decideParticipantPart(
  user: SessionUser,
  taskId: string,
  personId: string,
  action: "RETURN" | "ACCEPT" | "EXEMPT",
  note?: string | null
) {
  const result = await prisma.$transaction(async (tx) => {
    await advisoryLock(tx, `task-status:${taskId}`);
    const { task } = await ensureParticipantRows(tx, taskId, { legacy: false });
    if (isTerminalTaskStatus(task.status)) throw new ParticipantError("Nhiệm vụ đã kết thúc — không thể xử lý phần việc.", 409);
    if (task.status === "WAITING_REVIEW") throw new ParticipantError("Nhiệm vụ đang chờ quyết định cuối — xử lý tại hồ sơ duyệt.", 409);
    if (user.role === "SYSTEM_ADMIN") throw new ParticipantError("Quản trị kỹ thuật không có quyền nghiệp vụ.", 403);
    const leader = await isTaskLeader(user, task.unitId);
    if (!leader) throw new ParticipantError("Chỉ lãnh đạo có thẩm quyền mới được xử lý phần việc.", 403);
    if (personId === user.personId) throw new ParticipantError("Bạn không thể tự quyết định phần việc của chính mình.", 403);
    const row = await tx.taskParticipantResult.findUnique({
      where: { taskId_personId: { taskId, personId } },
    });
    if (!row) throw new ParticipantError("Không tìm thấy phần việc.", 404);

    // YC-11: khi bật pre-check, không cho ACCEPT trực tiếp để tránh bỏ qua bước 1.
    // Legacy row (Task cũ) giữ hành vi Phase 1.
    if (action === "ACCEPT" && !row.legacy && isPrecheckEnabled()) {
      throw new ParticipantError(
        "Đã bật kiểm tra sơ bộ — dùng thao tác Pre-check đạt/Trả lại thay vì chấp nhận phần việc.",
        409
      );
    }

    const textNote = (note || "").trim();
    if ((action === "RETURN" || action === "EXEMPT") && textNote.length < 3) {
      throw new ParticipantError(
        action === "RETURN" ? "Vui lòng ghi rõ lý do trả lại." : "Vui lòng ghi rõ lý do miễn phần việc.",
        422
      );
    }
    if (action === "RETURN" && !["SUBMITTED", "ACCEPTED"].includes(String(row.partStatus))) {
      throw new ParticipantError("Chỉ trả lại phần việc đã báo hoặc đã chấp nhận.", 409);
    }
    if (action === "ACCEPT" && row.partStatus !== "SUBMITTED") {
      throw new ParticipantError("Chỉ chấp nhận phần việc đã báo.", 409);
    }
    const nextStatus = action === "RETURN" ? "RETURNED" : action === "ACCEPT" ? "ACCEPTED" : "EXEMPT";
    assertStatus(nextStatus);
    const round = row.round || (await getCurrentSubmissionRound(tx, taskId));
    const updated = await tx.taskParticipantResult.update({
      where: { id: row.id },
      data: {
        partStatus: nextStatus,
        decidedAt: new Date(),
        decidedById: user.personId,
        decisionNote: textNote || null,
        round,
      },
    });
    const event = await createParticipantEvent(tx, {
      participantResultId: updated.id,
      taskId,
      personId,
      eventType: action,
      round,
      actor: user,
      note: textNote || null,
      resultText: row.partResultText,
      completedOn: row.partCompletedOn,
    });
    await mirrorParticipantUpdate(tx, {
      taskId,
      actor: user,
      personId,
      kind: `participant_${action.toLowerCase()}`,
      note:
        action === "RETURN"
          ? `Trả lại phần việc: ${textNote}`
          : action === "ACCEPT"
            ? "Chấp nhận phần việc"
            : `Miễn phần việc: ${textNote}`,
      participantEventId: event.id,
    });
    return { updated, task, row };
  });

  await recordAuditEvent({
    actorId: user.id,
    action: `TASK_PARTICIPANT_${action}`,
    resourceType: "Task",
    resourceId: taskId,
    oldData: { personId, partStatus: result.row.partStatus },
    newData: { personId, partStatus: result.updated.partStatus, note: note || null },
  });

  for (const recipientId of new Set([personId, result.task.ownerId])) {
    if (recipientId === user.personId) continue;
    await createNotification({
      recipientId,
      category: "task",
      type: `TASK_PARTICIPANT_${action}`,
      title:
        action === "RETURN"
          ? `Phần việc bị trả lại: [${result.task.code}]`
          : action === "ACCEPT"
            ? `Phần việc được chấp nhận: [${result.task.code}]`
            : `Phần việc được miễn: [${result.task.code}]`,
      content:
        action === "RETURN"
          ? `Lý do: ${note}`
          : action === "ACCEPT"
            ? "Phần việc đã được lãnh đạo chấp nhận."
            : `Lý do: ${note}`,
      tag: action === "RETURN" ? "TRẢ LẠI" : action === "ACCEPT" ? "CHẤP NHẬN" : "MIỄN",
      tagType: action === "RETURN" ? "warning" : "success",
      entityType: "TASK",
      entityId: taskId,
      actionUrl: `/tasks/${taskId}`,
      actionLabel: "Xem nhiệm vụ",
      taskCode: result.task.code,
      idempotencyKey: `participant-${action}:${taskId}:${personId}:${result.updated.round}:${Date.now()}`,
    });
  }

  return result.updated;
}

export async function acceptParticipantPart(user: SessionUser, taskId: string) {
  const result = await prisma.$transaction(async (tx) => {
    await advisoryLock(tx, `task-participant:${taskId}:${user.personId}`);
    const { task } = await ensureParticipantRows(tx, taskId, { legacy: false });
    if (isTerminalTaskStatus(task.status)) throw new ParticipantError("Nhiệm vụ đã kết thúc.", 409);
    if (task.status === "WAITING_REVIEW") throw new ParticipantError("Nhiệm vụ đang chờ lãnh đạo duyệt.", 409);
    const row = await tx.taskParticipantResult.findUnique({
      where: { taskId_personId: { taskId, personId: user.personId } },
    });
    if (!row) throw new ParticipantError("Bạn không phải người tham gia nhiệm vụ này.", 403);
    if (row.partStatus === "ACCEPTED") return { row, task, changed: false };
    const round = await getCurrentSubmissionRound(tx, taskId);
    const updated = await tx.taskParticipantResult.update({
      where: { id: row.id },
      data: { partStatus: "IN_PROGRESS", round },
    });
    const event = await createParticipantEvent(tx, {
      participantResultId: updated.id,
      taskId,
      personId: user.personId,
      eventType: "PROGRESS",
      round,
      actor: user,
      note: "Nhận phần việc",
    });
    await mirrorParticipantUpdate(tx, {
      taskId,
      actor: user,
      personId: user.personId,
      kind: "participant_accept_task",
      note: "Đã nhận phần việc",
      participantEventId: event.id,
    });
    return { row: updated, task, changed: true };
  });
  if (result.changed) {
    await recordAuditEvent({
      actorId: user.id,
      action: "TASK_PARTICIPANT_ACCEPT_TASK",
      resourceType: "Task",
      resourceId: taskId,
      newData: { personId: user.personId },
    });

    // Chủ trì (và người giao việc nếu có) biết công chức phối hợp đã nhận phần việc.
    const recipients = new Set(
      [result.task.ownerId, result.task.assignedById].filter(
        (id: string | null | undefined): id is string => !!id && id !== user.personId
      )
    );
    for (const recipientId of recipients) {
      await createNotification({
        recipientId,
        category: "task",
        type: "TASK_ACCEPTED",
        title: `Đã nhận phần việc: [${result.task.code}]`,
        content: `${user.fullName} đã xác nhận nhận phần việc phối hợp trong nhiệm vụ '${result.task.title}'.`,
        tag: "NHẬN PHẦN VIỆC",
        tagType: "success",
        entityType: "TASK",
        entityId: taskId,
        actionUrl: `/tasks/${taskId}`,
        actionLabel: "Xem nhiệm vụ",
        taskCode: result.task.code,
        idempotencyKey: `participant-accept-task:${taskId}:${user.personId}:${recipientId}`,
      });
    }
  }
  return result.row;
}

export async function submitOverallResult(
  user: SessionUser,
  taskId: string,
  input: { actualResultText?: string | null; note?: string | null }
) {
  const text = (input.actualResultText || "").trim();
  const result = await prisma.$transaction(async (tx) => {
    await advisoryLock(tx, `task-status:${taskId}`);
    const { task } = await ensureParticipantRows(tx, taskId);
    if (task.ownerId !== user.personId) {
      throw new ParticipantError("Chỉ người chủ trì mới được nộp kết quả chung.", 403);
    }
    if (isTerminalTaskStatus(task.status)) throw new ParticipantError("Nhiệm vụ đã kết thúc.", 409);
    if (task.status === "WAITING_REVIEW") throw new ParticipantError("Nhiệm vụ đã được trình duyệt.", 409);
    await assertCanSubmitOverall(taskId, tx);
    const round = await getCurrentSubmissionRound(tx, taskId);
    const participants = await listParticipantResults(taskId, tx);

    // YC-11: trước khi nộp chung, mọi phần bắt buộc phải được pre-check.
    // Legacy (không có participant row / row legacy) giữ final-only.
    const precheckEnabled = isPrecheckEnabled();

    // Owner cũng có phần việc: đánh dấu đã báo khi nộp chung.
    // Khi bật pre-check, owner phải báo phần mình trước để pre-checker xử lý;
    // không tự đánh dấu SUBMITTED tại bước nộp chung.
    const ownerRow = participants.find((p: any) => p.role === "OWNER");
    const ownerAlreadyReported =
      !!ownerRow && ["SUBMITTED", "ACCEPTED", "EXEMPT"].includes(String(ownerRow.partStatus));
    if (ownerRow && (!precheckEnabled || !ownerAlreadyReported)) {
      await tx.taskParticipantResult.update({
        where: { id: ownerRow.id },
        data: {
          partStatus: "SUBMITTED",
          partResultText: text || ownerRow.partResultText,
          partCompletedOn: ownerRow.partCompletedOn ?? new Date(),
          partProgressPercent: 100,
          submittedAt: new Date(),
          submittedById: user.personId,
          round,
        },
      });
      const event = await createParticipantEvent(tx, {
        participantResultId: ownerRow.id,
        taskId,
        personId: user.personId,
        eventType: "SUBMIT",
        round,
        actor: user,
        note: input.note || null,
        resultText: text || ownerRow.partResultText,
        completedOn: ownerRow.partCompletedOn ?? new Date(),
      });
      await mirrorParticipantUpdate(tx, {
        taskId,
        actor: user,
        personId: user.personId,
        kind: "participant_owner_submit",
        note: "Chủ trì nộp kết quả chung",
        participantEventId: event.id,
      });
    }

    const snapshotRows = await listParticipantResults(taskId, tx);
    const snapshotJson = {
      round,
      submittedById: user.personId,
      submittedAt: new Date().toISOString(),
      participants: snapshotRows.map(participantSummary),
    };
    const snapshot = await tx.taskSubmissionSnapshot.create({
      data: {
        taskId,
        round,
        snapshotJson: snapshotJson as any,
        submittedById: user.personId,
      },
    });

    // YC-11: chốt tuyến tại thời điểm nộp. Chỉ tạo được khi tất cả phần bắt buộc
    // đã pre-check PASS và route READY; legacy trả null (final-only).
    if (precheckEnabled) {
      await createRouteSnapshotForSubmission(tx, { taskId, round, user });
    }

    const updatedTask = await tx.task.update({
      where: { id: taskId },
      data: {
        status: "WAITING_REVIEW",
        ...(text ? { actualResultText: text } : {}),
      },
    });

    const update = await tx.taskUpdate.create({
      data: {
        taskId,
        authorId: user.personId,
        progressPercent: 100,
        statusBefore: task.status,
        statusAfter: "WAITING_REVIEW",
        kind: "submit",
        notes: input.note?.trim() || (text ? `Nộp kết quả chung: ${text}` : "Nộp kết quả chung"),
      },
    });

    return { task: updatedTask, snapshot, update, round };
  });

  await recordAuditEvent({
    actorId: user.id,
    action: "TASK_SUBMIT_OVERALL",
    resourceType: "Task",
    resourceId: taskId,
    oldData: { status: "IN_PROGRESS" },
    newData: { status: "WAITING_REVIEW", round: result.round, actualResultText: text || null },
  });

  return result;
}

/**
 * Áp dụng quyết định cuối của lãnh đạo vào participant status (E9.3).
 * Gọi trong cùng transaction của decideApproval; không tạo case/decision mới.
 */
export async function applyFinalDecisionToParticipants(
  tx: any,
  taskId: string,
  action: "AGREE" | "REJECT" | "CLARIFY",
  actor: SessionUser,
  selectedPersonIds: string[] = []
) {
  await ensureParticipantRows(tx, taskId);
  const rows = await tx.taskParticipantResult.findMany({
    where: { taskId },
  });
  if (rows.length === 0) return [];
  const selected = new Set(selectedPersonIds);
  const changed: any[] = [];
  for (const row of rows) {
    if (row.legacy) continue;
    if (action === "AGREE") {
      if (row.partStatus === "EXEMPT" || row.partStatus === "ACCEPTED") continue;
      const updated = await tx.taskParticipantResult.update({
        where: { id: row.id },
        data: { partStatus: "ACCEPTED", decidedAt: new Date(), decidedById: actor.personId },
      });
      await createParticipantEvent(tx, {
        participantResultId: row.id,
        taskId,
        personId: row.personId,
        eventType: "ACCEPT",
        round: row.round,
        actor,
        note: "Chấp nhận theo quyết định cuối",
      });
      changed.push(updated);
    } else {
      // E9.3: giữ ACCEPTED; trả selected (hoặc toàn bộ phần chưa accepted nếu không chọn).
      if (row.partStatus === "ACCEPTED" || row.partStatus === "EXEMPT") continue;
      const shouldReturn = selected.size > 0 ? selected.has(row.personId) : true;
      if (!shouldReturn) continue;
      const updated = await tx.taskParticipantResult.update({
        where: { id: row.id },
        data: {
          partStatus: "RETURNED",
          decidedAt: new Date(),
          decidedById: actor.personId,
          decisionNote:
            action === "REJECT" ? "Trả lại theo quyết định không đồng ý" : "Trả lại để giải trình",
        },
      });
      await createParticipantEvent(tx, {
        participantResultId: row.id,
        taskId,
        personId: row.personId,
        eventType: "RETURN",
        round: row.round,
        actor,
        note: action === "REJECT" ? "Không đồng ý — trả lại" : "Yêu cầu giải trình",
      });
      changed.push(updated);
    }
  }
  return changed;
}
