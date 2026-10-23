/**
 * S4 — Task & Approval hardening (YC-08 / hotfix YC-09 / YC-12)
 *
 * Kiểm chứng:
 *  A. Chặn tự duyệt trên MỌI đường: decision, tasks PATCH action, tasks/[id] PATCH,
 *     updates POST, quick approve deadline.
 *  B. Collaborator không ghi đè kết quả / không nộp thay / không đổi assignee /
 *     không hủy task; API không báo success khi bỏ result.
 *  C. ApprovalCase phản ánh đúng: status AGREED (không phải APPROVED), TaskUpdate
 *     approve/return, giữ tiến độ, lưu người/thời gian/lý do, thông báo owner + collaborator.
 *  D. YC-12: badge/action theo reviewState; lịch sử theo reviewedById; lọc cán bộ/tháng/năm;
 *     "/approvals Đã xử lý" theo thẩm quyền.
 *
 * Chạy: TEST_BASE_URL=http://localhost:3114 npx tsx scripts/test-v3-task-approval-hardening.ts
 */
import { createRequire } from "node:module";

const creq = createRequire(import.meta.url);
const { PrismaClient } = creq("@prisma/client");
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
});

const BASE = process.env.TEST_BASE_URL || "http://localhost:3114";
const PASSWORD = process.env.TEST_PASSWORD || "LocalTest@2026";
const TAG = `[S4-HARDEN-${Date.now().toString().slice(-6)}]`;

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) {
    pass++;
    console.log(`  [PASS] ${name}${detail ? " - " + detail : ""}`);
  } else {
    fail++;
    console.log(`  [FAIL] ${name}${detail ? " - " + detail : ""}`);
  }
};

async function login(username: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: PASSWORD }),
  });
  const json = await res.json().catch(() => ({}));
  if (!json.token) throw new Error(`đăng nhập ${username} lỗi HTTP ${res.status}`);
  return json.token as string;
}

const H = (t: string) => ({ Authorization: `Bearer ${t}`, "Content-Type": "application/json" });
const createdTaskIds: string[] = [];
const createdDeadlineReqIds: string[] = [];
let createdWorkItemId: string | null = null;
let createdPeriodId: string | null = null;
let createdSupervisionId: string | null = null;

async function createTask(input: {
  code: string;
  title: string;
  ownerId: string;
  unitId: string;
  status?: string;
  actualResultText?: string | null;
  collaboratorId?: string;
}) {
  const row = await prisma.task.create({
    data: {
      code: input.code,
      title: input.title,
      ownerId: input.ownerId,
      unitId: input.unitId,
      status: input.status || "IN_PROGRESS",
      priority: "Trung bình",
      originalDeadline: new Date("2026-12-31T00:00:00.000Z"),
      currentDeadline: new Date("2026-12-31T00:00:00.000Z"),
      actualResultText: input.actualResultText ?? null,
      description: TAG,
      assignees: input.collaboratorId
        ? { create: [{ personId: input.collaboratorId, role: "COLLABORATOR" }] }
        : undefined,
    },
  });
  createdTaskIds.push(row.id);
  return row;
}

async function main() {
  console.log(`=== S4 TASK/APPROVAL HARDENING — ${BASE} ===\n`);

  const accounts = await prisma.account.findMany({
    include: {
      person: { include: { assignments: { where: { isPrimary: true } } } },
      roleGrants: { include: { role: true } },
    },
  });
  const leader = accounts.find(
    (a) => a.username === "demold01" && a.roleGrants.some((g) => g.role.code === "UNIT_LEADER")
  );
  const owner = accounts.find((a) => a.username === "democb01");
  const collaborator = accounts.find((a) => a.username === "democb02");
  if (!leader || !owner || !collaborator) {
    console.log("  THIẾU tài khoản fixture (demold01/democb01/democb02) — bỏ qua.");
    return;
  }
  const unitId = owner.person.assignments[0]?.unitId || leader.person.assignments[0]!.unitId;
  const leaderUnitId = leader.person.assignments[0]!.unitId;

  const tokLeader = await login(leader.username);
  const tokOwner = await login(owner.username);
  const tokCollab = await login(collaborator.username);

  // ================================================================
  // A. CHẶN TỰ DUYỆT — lãnh đạo là chủ nhiệm vụ
  // ================================================================
  console.log("\n--- A. Tự duyệt mọi đường ---");
  const selfTask = await createTask({
    code: `S4-SELF-${Date.now().toString().slice(-5)}`,
    title: `${TAG} nhiệm vụ của chính lãnh đạo`,
    ownerId: leader.personId,
    unitId: leaderUnitId,
    status: "WAITING_REVIEW",
    actualResultText: "Kết quả lãnh đạo tự làm",
  });

  const selfDecision = await fetch(`${BASE}/api/approvals/TASK_RESULT/${selfTask.id}/decision`, {
    method: "POST",
    headers: H(tokLeader),
    body: JSON.stringify({ action: "AGREE", reason: TAG }),
  });
  check("A1. decision AGREE hồ sơ của mình => 403", selfDecision.status === 403, `HTTP ${selfDecision.status}`);

  const selfConfirm = await fetch(`${BASE}/api/tasks`, {
    method: "PATCH",
    headers: H(tokLeader),
    body: JSON.stringify({ id: selfTask.id, action: "CONFIRM_COMPLETION" }),
  });
  check("A2. quick approve CONFIRM_COMPLETION => 403", selfConfirm.status === 403, `HTTP ${selfConfirm.status}`);

  const selfPatch = await fetch(`${BASE}/api/tasks/${selfTask.id}`, {
    method: "PATCH",
    headers: H(tokLeader),
    body: JSON.stringify({ status: "COMPLETED" }),
  });
  check("A3. tasks/[id] PATCH status COMPLETED => 403", selfPatch.status === 403, `HTTP ${selfPatch.status}`);

  const selfUpdates = await fetch(`${BASE}/api/tasks/${selfTask.id}/updates`, {
    method: "POST",
    headers: H(tokLeader),
    body: JSON.stringify({ progressPercent: 100, newStatus: "COMPLETED" }),
  });
  check("A4. updates POST status COMPLETED => 403", selfUpdates.status === 403, `HTTP ${selfUpdates.status}`);

  const selfAfter = await prisma.task.findUnique({ where: { id: selfTask.id } });
  check("A5. Trạng thái không đổi sau 4 đường tự duyệt", selfAfter?.status === "WAITING_REVIEW", selfAfter?.status);
  const selfCase = await prisma.approvalCase.findUnique({
    where: { caseType_resourceId: { caseType: "TASK_RESULT", resourceId: selfTask.id } },
    include: { decisions: true },
  });
  check(
    "A6. Không có ApprovalCase AGREED/decision tự duyệt",
    (!selfCase || selfCase.status !== "AGREED") && (selfCase?.decisions.length ?? 0) === 0,
    `case=${selfCase?.status ?? "none"}, decisions=${selfCase?.decisions.length ?? 0}`
  );

  // Quick approve đề nghị gia hạn của chính mình
  const selfDeadline = await prisma.deadlineRequest.create({
    data: {
      taskId: selfTask.id,
      requestedById: leader.personId,
      requestedDeadline: new Date("2027-01-15T00:00:00.000Z"),
      reason: TAG,
      status: "PENDING",
    },
  });
  createdDeadlineReqIds.push(selfDeadline.id);
  const selfDeadlineApprove = await fetch(
    `${BASE}/api/tasks/${selfTask.id}/deadline-request/${selfDeadline.id}/review`,
    { method: "POST", headers: H(tokLeader), body: JSON.stringify({ action: "APPROVE" }) }
  );
  const selfDeadlineAfter = await prisma.deadlineRequest.findUnique({ where: { id: selfDeadline.id } });
  check(
    "A7. Tự duyệt đề nghị gia hạn => 403 và vẫn PENDING",
    selfDeadlineApprove.status === 403 && selfDeadlineAfter?.status === "PENDING",
    `HTTP ${selfDeadlineApprove.status}, status=${selfDeadlineAfter?.status}`
  );

  // ================================================================
  // B. COLLABORATOR KHÔNG ĐƯỢC VƯỢT QUYỀN
  // ================================================================
  console.log("\n--- B. Quyền của người phối hợp ---");
  const collabTask = await createTask({
    code: `S4-COL-${Date.now().toString().slice(-5)}`,
    title: `${TAG} nhiệm vụ có người phối hợp`,
    ownerId: owner.personId,
    unitId,
    status: "IN_PROGRESS",
    actualResultText: "Kết quả gốc của chủ trì",
    collaboratorId: collaborator.personId,
  });

  const collabResult = await fetch(`${BASE}/api/tasks/${collabTask.id}/updates`, {
    method: "POST",
    headers: H(tokCollab),
    body: JSON.stringify({ progressPercent: 50, notes: TAG, actualResultText: "COLLAB GHI ĐÈ" }),
  });
  const afterCollabResult = await prisma.task.findUnique({ where: { id: collabTask.id } });
  check(
    "B1. Collaborator ghi đè result => 403, không báo success",
    collabResult.status === 403 && afterCollabResult?.actualResultText === "Kết quả gốc của chủ trì",
    `HTTP ${collabResult.status}, result=${afterCollabResult?.actualResultText}`
  );

  const collabUpdates = await fetch(`${BASE}/api/tasks/${collabTask.id}/updates`, {
    method: "POST",
    headers: H(tokCollab),
    body: JSON.stringify({ progressPercent: 100, notes: TAG, submitForReview: true }),
  });
  const afterCollabSubmit = await prisma.task.findUnique({ where: { id: collabTask.id } });
  check(
    "B2. Collaborator nộp thay => 403, trạng thái không đổi",
    collabUpdates.status === 403 && afterCollabSubmit?.status === "IN_PROGRESS",
    `HTTP ${collabUpdates.status}, status=${afterCollabSubmit?.status}`
  );

  const collabLegacySubmit = await fetch(`${BASE}/api/tasks`, {
    method: "PATCH",
    headers: H(tokCollab),
    body: JSON.stringify({ id: collabTask.id, action: "SUBMIT_COMPLETION", actualResultText: TAG }),
  });
  check("B3. Legacy SUBMIT_COMPLETION của collaborator => 403", collabLegacySubmit.status === 403, `HTTP ${collabLegacySubmit.status}`);

  const collabPatchResult = await fetch(`${BASE}/api/tasks/${collabTask.id}`, {
    method: "PATCH",
    headers: H(tokCollab),
    body: JSON.stringify({ actualResultText: "COLLAB PATCH ĐÈ" }),
  });
  check("B4. tasks/[id] PATCH ghi đè result => 403", collabPatchResult.status === 403, `HTTP ${collabPatchResult.status}`);

  const collabAssignees = await fetch(`${BASE}/api/tasks/${collabTask.id}`, {
    method: "PATCH",
    headers: H(tokCollab),
    body: JSON.stringify({ assigneeIds: [] }),
  });
  const assigneeCount = await prisma.taskAssignee.count({ where: { taskId: collabTask.id } });
  check(
    "B5. Collaborator đổi assignee => 403, giữ nguyên người phối hợp",
    collabAssignees.status === 403 && assigneeCount === 1,
    `HTTP ${collabAssignees.status}, assignees=${assigneeCount}`
  );

  const collabLegacyAssignees = await fetch(`${BASE}/api/tasks`, {
    method: "PATCH",
    headers: H(tokCollab),
    body: JSON.stringify({ id: collabTask.id, assigneeIds: [] }),
  });
  check("B6. Legacy PATCH đổi assignee => 403", collabLegacyAssignees.status === 403, `HTTP ${collabLegacyAssignees.status}`);

  const collabCancel = await fetch(`${BASE}/api/tasks/${collabTask.id}`, {
    method: "PATCH",
    headers: H(tokCollab),
    body: JSON.stringify({ status: "CANCELED", cancelReason: TAG }),
  });
  const afterCancel = await prisma.task.findUnique({ where: { id: collabTask.id } });
  check(
    "B7. Collaborator hủy task => 403, không đổi CANCELED",
    collabCancel.status === 403 && afterCancel?.status === "IN_PROGRESS",
    `HTTP ${collabCancel.status}, status=${afterCancel?.status}`
  );

  const collabLegacyCancel = await fetch(`${BASE}/api/tasks`, {
    method: "PATCH",
    headers: H(tokCollab),
    body: JSON.stringify({ id: collabTask.id, status: "CANCELED" }),
  });
  check("B8. Legacy PATCH status CANCELED => 403", collabLegacyCancel.status === 403, `HTTP ${collabLegacyCancel.status}`);

  // Owner nộp đúng
  const ownerSubmit = await fetch(`${BASE}/api/tasks/${collabTask.id}/updates`, {
    method: "POST",
    headers: H(tokOwner),
    body: JSON.stringify({
      progressPercent: 100,
      notes: `${TAG} chủ trì nộp kết quả`,
      submitForReview: true,
      actualResultText: "Kết quả chủ trì xác nhận",
    }),
  });
  const afterOwnerSubmit = await prisma.task.findUnique({ where: { id: collabTask.id } });
  check(
    "B9. Chủ trì nộp đúng => WAITING_REVIEW + nhận result",
    ownerSubmit.status === 201 &&
      afterOwnerSubmit?.status === "WAITING_REVIEW" &&
      afterOwnerSubmit?.actualResultText === "Kết quả chủ trì xác nhận",
    `HTTP ${ownerSubmit.status}, status=${afterOwnerSubmit?.status}`
  );

  // ================================================================
  // C. DECISION + HISTORY (AGREED, TaskUpdate, thông báo)
  // ================================================================
  console.log("\n--- C. Quyết định + lịch sử ---");
  const approveRes = await fetch(`${BASE}/api/approvals/TASK_RESULT/${collabTask.id}/decision`, {
    method: "POST",
    headers: H(tokLeader),
    body: JSON.stringify({ action: "AGREE", reason: "Đồng ý nghiệm thu" }),
  });
  const approveJson = await approveRes.json().catch(() => ({}));
  const approvedTask = await prisma.task.findUnique({ where: { id: collabTask.id } });
  const approvedCase = await prisma.approvalCase.findUnique({
    where: { caseType_resourceId: { caseType: "TASK_RESULT", resourceId: collabTask.id } },
    include: { decisions: { orderBy: { createdAt: "desc" } } },
  });
  const approveUpdate = await prisma.taskUpdate.findFirst({
    where: { taskId: collabTask.id, kind: "approve" },
    orderBy: { createdAt: "desc" },
  });
  check("C1. Leader AGREE => task COMPLETED", approveRes.ok && approvedTask?.status === "COMPLETED", `HTTP ${approveRes.status}, task=${approvedTask?.status}`);
  check("C2. ApprovalCase dùng đúng trạng thái AGREED (không phải APPROVED)", approvedCase?.status === "AGREED", `case=${approvedCase?.status}`);
  check(
    "C3. ApprovalDecision lưu người/lý do",
    approvedCase?.decisions[0]?.action === "AGREE" &&
      approvedCase?.decisions[0]?.actorPersonId === leader.personId &&
      approvedCase?.decisions[0]?.reason === "Đồng ý nghiệm thu",
    `action=${approvedCase?.decisions[0]?.action}`
  );
  check(
    "C4. TaskUpdate kind=approve + giữ tiến độ 100%",
    !!approveUpdate && approveUpdate.progressPercent === 100 && approveUpdate.statusAfter === "COMPLETED",
    `kind=${approveUpdate?.kind}, progress=${approveUpdate?.progressPercent}`
  );

  const detailRes = await fetch(`${BASE}/api/tasks/${collabTask.id}`, { headers: H(tokOwner), cache: "no-store" as any });
  const detailJson = await detailRes.json().catch(() => ({}));
  const approval = detailJson?.data?.approval;
  check(
    "C5. API chi tiết trả projection approval (người/thời gian/lý do)",
    approval?.action === "AGREE" &&
      approval?.decidedByName === leader.person.fullName &&
      !!approval?.decidedAt &&
      approval?.reason === "Đồng ý nghiệm thu",
    JSON.stringify(approval || null).slice(0, 140)
  );

  const timeline = detailJson?.data?.timeline || [];
  const approveEvent = timeline.find((e: any) => e.kind === "approve");
  check("C6. Nhật ký hợp nhất có dòng approve đúng người", !!approveEvent && approveEvent.actor === leader.person.fullName, approveEvent?.actor);

  const notifications = await prisma.notification.findMany({
    where: { entityType: "TASK", entityId: collabTask.id, type: "APPROVAL_AGREED" },
  });
  const notifyRecipients = new Set(notifications.map((n) => n.recipientId));
  check(
    "C7. Thông báo cho cả chủ trì và người phối hợp, deep link nhiệm vụ",
    notifyRecipients.has(owner.personId) &&
      notifyRecipients.has(collaborator.personId) &&
      notifications.every((n) => n.actionUrl === `/tasks/${collabTask.id}`),
    `recipients=${[...notifyRecipients].length}, urls=${[...new Set(notifications.map((n) => n.actionUrl))].join(",")}`
  );

  // ================================================================
  // D. TRẢ LẠI: giữ kết quả + tiến độ, mở vòng mới khi trình lại
  // ================================================================
  console.log("\n--- D. Trả lại + trình lại ---");
  const returnTask = await createTask({
    code: `S4-RET-${Date.now().toString().slice(-5)}`,
    title: `${TAG} nhiệm vụ bị trả lại`,
    ownerId: owner.personId,
    unitId,
    status: "IN_PROGRESS",
  });
  const submitReturnTask = await fetch(`${BASE}/api/tasks/${returnTask.id}/updates`, {
    method: "POST",
    headers: H(tokOwner),
    body: JSON.stringify({
      progressPercent: 100,
      notes: `${TAG} nộp lần 1`,
      submitForReview: true,
      actualResultText: "Kết quả lần 1 cần giữ",
    }),
  });
  check("D1. Chủ trì nộp lần 1 => 201", submitReturnTask.status === 201, `HTTP ${submitReturnTask.status}`);

  const rejectRes = await fetch(`${BASE}/api/approvals/TASK_RESULT/${returnTask.id}/decision`, {
    method: "POST",
    headers: H(tokLeader),
    body: JSON.stringify({ action: "REJECT", reason: "Thiếu chứng từ đối chiếu" }),
  });
  const returnedTask = await prisma.task.findUnique({ where: { id: returnTask.id } });
  const returnUpdate = await prisma.taskUpdate.findFirst({
    where: { taskId: returnTask.id, kind: "return" },
    orderBy: { createdAt: "desc" },
  });
  check(
    "D2. Trả lại: IN_PROGRESS, GIỮ kết quả + tiến độ 100%",
    rejectRes.ok &&
      returnedTask?.status === "IN_PROGRESS" &&
      returnedTask?.actualResultText === "Kết quả lần 1 cần giữ" &&
      returnUpdate?.progressPercent === 100,
    `HTTP ${rejectRes.status}, status=${returnedTask?.status}, progress=${returnUpdate?.progressPercent}`
  );

  const detailReturn = await (await fetch(`${BASE}/api/tasks/${returnTask.id}`, { headers: H(tokOwner), cache: "no-store" as any })).json();
  check(
    "D3. Projection bị trả lại có lý do/người",
    detailReturn?.data?.approval?.action === "REJECT" &&
      detailReturn?.data?.approval?.reason === "Thiếu chứng từ đối chiếu" &&
      detailReturn?.data?.approval?.decidedByName === leader.person.fullName,
    JSON.stringify(detailReturn?.data?.approval || null).slice(0, 140)
  );

  const resubmit = await fetch(`${BASE}/api/tasks/${returnTask.id}/updates`, {
    method: "POST",
    headers: H(tokOwner),
    body: JSON.stringify({ progressPercent: 100, notes: `${TAG} bổ sung và trình lại`, submitForReview: true }),
  });
  const reopenedCase = await prisma.approvalCase.findUnique({
    where: { caseType_resourceId: { caseType: "TASK_RESULT", resourceId: returnTask.id } },
    include: { decisions: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const resubmitUpdate = await prisma.taskUpdate.findFirst({
    where: { taskId: returnTask.id, kind: "submit" },
    orderBy: { createdAt: "desc" },
  });
  check(
    "D4. Trình lại: WAITING_REVIEW, case mở vòng 2, lưu RESPOND đúng người",
    resubmit.status === 201 &&
      reopenedCase?.status === "OPEN" &&
      reopenedCase?.currentRound === 2 &&
      reopenedCase?.decisions[0]?.action === "RESPOND" &&
      reopenedCase?.decisions[0]?.actorPersonId === owner.personId,
    `HTTP ${resubmit.status}, case=${reopenedCase?.status}, round=${reopenedCase?.currentRound}, actor=${reopenedCase?.decisions[0]?.actorPersonId}`
  );
  check("D5. Lịch sử submit khi trình lại có mặt", !!resubmitUpdate, resubmitUpdate?.kind);

  // ================================================================
  // E. YC-12 — /approvals "Đã xử lý" theo thẩm quyền + lọc
  // ================================================================
  console.log("\n--- E. YC-12 lịch sử đã xử lý ---");
  const nowVn = new Date(Date.now() + 7 * 3600 * 1000);
  const month = nowVn.getUTCMonth() + 1;
  const year = nowVn.getUTCFullYear();

  const decidedRes = await fetch(
    `${BASE}/api/approvals/cases?scope=decided&person=${encodeURIComponent("DEMO-CB-01")}&month=${month}&year=${year}`,
    { headers: H(tokLeader), cache: "no-store" as any }
  );
  const decidedJson = await decidedRes.json().catch(() => ({}));
  const decidedFound = (decidedJson.data || []).find((c: any) => c.resourceId === collabTask.id);
  check(
    "E1. Leader thấy hồ sơ đã xử lý, lọc đúng cán bộ + tháng/năm",
    decidedRes.ok && !!decidedFound && decidedFound.decidedByName === leader.person.fullName,
    `HTTP ${decidedRes.status}, found=${!!decidedFound}`
  );

  const wrongMonth = month === 12 ? 1 : month + 1;
  const wrongMonthRes = await fetch(
    `${BASE}/api/approvals/cases?scope=decided&person=${encodeURIComponent("DEMO-CB-01")}&month=${wrongMonth}&year=${year}`,
    { headers: H(tokLeader), cache: "no-store" as any }
  );
  const wrongMonthJson = await wrongMonthRes.json().catch(() => ({}));
  check(
    "E2. Lọc sai tháng không trả hồ sơ",
    !(wrongMonthJson.data || []).some((c: any) => c.resourceId === collabTask.id),
    `HTTP ${wrongMonthRes.status}`
  );

  const staffDecidedRes = await fetch(`${BASE}/api/approvals/cases?scope=decided`, { headers: H(tokOwner) });
  const staffDecidedJson = await staffDecidedRes.json().catch(() => ({}));
  check(
    "E3. Cán bộ không phải người quyết định không thấy lịch sử xử lý",
    !(staffDecidedJson.data || []).some((c: any) => c.resourceId === collabTask.id),
    `HTTP ${staffDecidedRes.status}`
  );

  // ================================================================
  // F. YC-12 — /work-item-reviews badge/action/history theo tuyến
  // ================================================================
  console.log("\n--- F. YC-12 lịch sử xác nhận công việc ---");
  const period = await prisma.reportingPeriod.create({
    data: {
      type: "MONTH",
      title: `${TAG} ${month}/${year}`,
      startAt: new Date(Date.UTC(year, month - 1, 1)),
      endAt: new Date(Date.UTC(year, month, 0, 23, 59, 59)),
      isLocked: false,
    },
  });
  createdPeriodId = period.id;

  const supervision = await prisma.personSupervision.create({
    data: {
      managerPersonId: leader.personId,
      subordinatePersonId: owner.personId,
      scopeType: "UNIT",
      effectiveFrom: new Date(Date.now() - 60_000),
      status: "CONFIRMED",
      note: TAG,
    },
  });
  createdSupervisionId = supervision.id;

  const workItem = await prisma.personalWorkItem.create({
    data: {
      personId: owner.personId,
      periodId: period.id,
      title: `${TAG} công việc tự ghi nhận`,
      status: "COMPLETED",
      reviewState: "SUBMITTED",
      resultText: "Kết quả công việc để xác nhận",
      completedDate: new Date(),
      completedAt: new Date(),
      submittedAt: new Date(),
      submittedById: owner.personId,
      submitCount: 1,
    },
  });
  createdWorkItemId = workItem.id;
  await prisma.workItemReview.create({
    data: {
      workItemId: workItem.id,
      action: "SUBMITTED",
      resultText: "Kết quả công việc để xác nhận",
      completedOn: new Date(),
      actorId: owner.personId,
    },
  });

  const pendingQueue = await (
    await fetch(`${BASE}/api/personal-work-items/review-queue?status=pending`, {
      headers: H(tokLeader),
      cache: "no-store" as any,
    })
  ).json();
  const pendingItem = (pendingQueue.data || []).find((i: any) => i.id === workItem.id);
  check(
    "F1. Hồ sơ chờ xác nhận: badge SUBMITTED + canDecide=true",
    pendingItem?.reviewState === "SUBMITTED" && pendingItem?.canDecide === true,
    JSON.stringify({ state: pendingItem?.reviewState, canDecide: pendingItem?.canDecide })
  );

  const otherPending = await (
    await fetch(`${BASE}/api/personal-work-items/review-queue?status=pending`, {
      headers: H(tokCollab),
    })
  ).json();
  check(
    "F2. Người không phải tuyến trực tiếp không thấy hồ sơ chờ",
    !(otherPending.data || []).some((i: any) => i.id === workItem.id),
    `count=${(otherPending.data || []).length}`
  );

  const confirmItem = await fetch(`${BASE}/api/personal-work-items/${workItem.id}/review`, {
    method: "POST",
    headers: H(tokLeader),
    body: JSON.stringify({ action: "CONFIRM", note: "Đồng ý xác nhận" }),
  });
  check("F3. Lãnh đạo trực tiếp xác nhận => 200", confirmItem.status === 200, `HTTP ${confirmItem.status}`);

  const confirmedQueue = await (
    await fetch(
      `${BASE}/api/personal-work-items/review-queue?status=confirmed&person=${encodeURIComponent("DEMO-CB-01")}&month=${month}&year=${year}`,
      { headers: H(tokLeader), cache: "no-store" as any }
    )
  ).json();
  const confirmedItem = (confirmedQueue.data || []).find((i: any) => i.id === workItem.id);
  check(
    "F4. Lịch sử đã xác nhận: badge CONFIRMED, canDecide=false, có reviewedBy",
    confirmedItem?.reviewState === "CONFIRMED" &&
      confirmedItem?.canDecide === false &&
      confirmedItem?.reviewedBy?.id === leader.personId,
    JSON.stringify({
      state: confirmedItem?.reviewState,
      canDecide: confirmedItem?.canDecide,
      reviewer: confirmedItem?.reviewedBy?.fullName,
    })
  );
  check(
    "F5. Lịch sử có actor và lý do xác nhận",
    (confirmedItem?.history || []).some(
      (h: any) => h.action === "CONFIRMED" && h.actor?.id === leader.personId && h.note === "Đồng ý xác nhận"
    ),
    `history=${(confirmedItem?.history || []).length}`
  );

  // Đổi tuyến: xóa quan hệ phụ trách hiện tại; người đã quyết định vẫn xem được lịch sử.
  await prisma.personSupervision.delete({ where: { id: supervision.id } });
  createdSupervisionId = null;

  const historyAfterRouteChange = await (
    await fetch(`${BASE}/api/personal-work-items/review-queue?status=confirmed`, {
      headers: H(tokLeader),
      cache: "no-store" as any,
    })
  ).json();
  check(
    "F6. Đổi tuyến vẫn giữ lịch sử cho người đã xử lý (reviewedById)",
    (historyAfterRouteChange.data || []).some((i: any) => i.id === workItem.id),
    `count=${(historyAfterRouteChange.data || []).length}`
  );

  const otherHistory = await (
    await fetch(`${BASE}/api/personal-work-items/review-queue?status=confirmed`, {
      headers: H(tokCollab),
    })
  ).json();
  check(
    "F7. Người ngoài tuyến/không quyết định không thấy lịch sử",
    !(otherHistory.data || []).some((i: any) => i.id === workItem.id),
    `count=${(otherHistory.data || []).length}`
  );

  // ================================================================
  // G. Deadline quick approve lưu ApprovalCase (không bỏ qua lịch sử)
  // ================================================================
  console.log("\n--- G. Quick approve đề nghị gia hạn ---");
  const deadlineTask = await createTask({
    code: `S4-DL-${Date.now().toString().slice(-5)}`,
    title: `${TAG} nhiệm vụ xin gia hạn`,
    ownerId: owner.personId,
    unitId,
    status: "IN_PROGRESS",
  });
  const deadlineReq = await prisma.deadlineRequest.create({
    data: {
      taskId: deadlineTask.id,
      requestedById: owner.personId,
      requestedDeadline: new Date("2027-01-20T00:00:00.000Z"),
      reason: TAG,
      status: "PENDING",
    },
  });
  createdDeadlineReqIds.push(deadlineReq.id);
  const quickApprove = await fetch(
    `${BASE}/api/tasks/${deadlineTask.id}/deadline-request/${deadlineReq.id}/review`,
    { method: "POST", headers: H(tokLeader), body: JSON.stringify({ action: "APPROVE", reviewNotes: "Đồng ý gia hạn" }) }
  );
  const deadlineCase = await prisma.approvalCase.findUnique({
    where: { caseType_resourceId: { caseType: "DEADLINE_REQUEST", resourceId: deadlineReq.id } },
    include: { decisions: true },
  });
  const deadlineTaskAfter = await prisma.task.findUnique({ where: { id: deadlineTask.id } });
  check(
    "G1. Quick approve tạo ApprovalCase AGREED + decision AGREE",
    quickApprove.ok && deadlineCase?.status === "AGREED" && deadlineCase?.decisions[0]?.action === "AGREE",
    `HTTP ${quickApprove.status}, case=${deadlineCase?.status}`
  );
  check(
    "G2. Gia hạn cập nhật hạn nhiệm vụ + ghi TaskUpdate extend",
    deadlineTaskAfter?.currentDeadline.toISOString() === new Date("2027-01-20T00:00:00.000Z").toISOString() &&
      (await prisma.taskUpdate.count({ where: { taskId: deadlineTask.id, kind: "extend" } })) === 1,
    `deadline=${deadlineTaskAfter?.currentDeadline.toISOString()}`
  );

  console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
}

main()
  .catch((e) => {
    console.error("LỖI:", String(e.stack || e.message).slice(0, 800));
    fail++;
  })
  .finally(async () => {
    // Dọn dữ liệu test theo thứ tự phụ thuộc.
    try {
      const caseIds = (
        await prisma.approvalCase.findMany({
          where: {
            OR: [
              { resourceId: { in: createdTaskIds } },
              { resourceId: { in: createdDeadlineReqIds } },
            ],
          },
          select: { id: true },
        })
      ).map((c) => c.id);
      await prisma.approvalDecision.deleteMany({ where: { caseId: { in: caseIds } } }).catch(() => {});
      await prisma.approvalCase.deleteMany({ where: { id: { in: caseIds } } }).catch(() => {});
      await prisma.deadlineRequest.deleteMany({
        where: { OR: [{ taskId: { in: createdTaskIds } }, { id: { in: createdDeadlineReqIds } }] },
      }).catch(() => {});
      await prisma.taskUpdate.deleteMany({ where: { taskId: { in: createdTaskIds } } }).catch(() => {});
      await prisma.taskAssignee.deleteMany({ where: { taskId: { in: createdTaskIds } } }).catch(() => {});
      await prisma.notification.deleteMany({ where: { entityType: "TASK", entityId: { in: createdTaskIds } } }).catch(() => {});
      await prisma.task.deleteMany({ where: { id: { in: createdTaskIds } } }).catch(() => {});
      if (createdWorkItemId) {
        await prisma.workItemReview.deleteMany({ where: { workItemId: createdWorkItemId } }).catch(() => {});
        await prisma.personalWorkItem.delete({ where: { id: createdWorkItemId } }).catch(() => {});
      }
      if (createdSupervisionId) {
        await prisma.personSupervision.delete({ where: { id: createdSupervisionId } }).catch(() => {});
      }
      if (createdPeriodId) {
        await prisma.reportingPeriod.delete({ where: { id: createdPeriodId } }).catch(() => {});
      }
    } catch {
      /* dọn dẹp best-effort */
    }
    await prisma.$disconnect();
    if (fail > 0) process.exit(1);
  });
