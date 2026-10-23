/**
 * YC-09 Phase 1 — per-person participant result/event/snapshot.
 * Chạy trên DB fixture: talung_v3_approval_impl (port 3116).
 */
import { createRequire } from "node:module";
import { assertLocalTestDatabase } from "./lib/test-db-safety";

const creq = createRequire(import.meta.url);
const { PrismaClient } = creq("@prisma/client");
const dbUrl = assertLocalTestDatabase(
  process.env.DIRECT_URL || process.env.DATABASE_URL || "",
  "test-v3-yc09-per-person"
);
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const BASE = process.env.TEST_BASE_URL || "http://localhost:3116";
const PASSWORD = process.env.TEST_PASSWORD || "LocalTest@2026";
const TAG = `[YC09-P1-${Date.now().toString().slice(-6)}]`;
const createdTaskIds: string[] = [];

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

async function createTask(input: {
  code: string;
  title: string;
  ownerId: string;
  unitId: string;
  collaboratorId?: string;
  status?: string;
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
      description: TAG,
      assignees: input.collaboratorId
        ? { create: [{ personId: input.collaboratorId, role: "COLLABORATOR" }] }
        : undefined,
    },
  });
  createdTaskIds.push(row.id);
  await prisma.taskParticipantResult.createMany({
    data: [
      { taskId: row.id, personId: input.ownerId, role: "OWNER", partStatus: "NOT_STARTED", legacy: false },
      ...(input.collaboratorId
        ? [{ taskId: row.id, personId: input.collaboratorId, role: "COLLABORATOR", partStatus: "NOT_STARTED", legacy: false }]
        : []),
    ],
    skipDuplicates: true,
  });
  return row;
}

async function getTask(token: string, taskId: string) {
  const res = await fetch(`${BASE}/api/tasks/${taskId}`, { headers: H(token) });
  const json = await res.json().catch(() => ({}));
  return { res, json, task: json.data };
}

async function participantRows(taskId: string) {
  return prisma.taskParticipantResult.findMany({ where: { taskId } });
}

async function caseCount(taskId: string) {
  return prisma.approvalCase.count({ where: { caseType: "TASK_RESULT", resourceId: taskId } });
}

async function main() {
  console.log(`=== YC-09 PHASE 1 PER-PERSON — ${BASE} ===\n`);

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

  const tokLeader = await login(leader.username);
  const tokOwner = await login(owner.username);
  const tokCollab = await login(collaborator.username);

  // ================================================================
  // A. Collaborator progress đi participant, không làm Task 100%
  // ================================================================
  console.log("\n--- A. Collaborator progress / quyền ---");
  const taskA = await createTask({
    code: `${TAG}-A`,
    title: `${TAG} nhiệm vụ A`,
    ownerId: owner.personId,
    unitId,
    collaboratorId: collaborator.personId,
  });

  let res = await fetch(`${BASE}/api/tasks/${taskA.id}/updates`, {
    method: "POST",
    headers: H(tokCollab),
    body: JSON.stringify({ progressPercent: 50, notes: "Đã làm 50% phần việc" }),
  });
  check("A1. Collaborator cập nhật tiến độ phần việc => 201", res.status === 201, `HTTP ${res.status}`);

  const detailA1 = await getTask(tokOwner, taskA.id);
  check(
    "A2. Task progress KHÔNG bị collaborator đẩy lên 50%",
    detailA1.task?.progressPercent === 0,
    `task progress=${detailA1.task?.progressPercent}`
  );
  const rowsA1 = await participantRows(taskA.id);
  const collabA1 = rowsA1.find((r) => r.personId === collaborator.personId);
  check(
    "A3. Participant collaborator IN_PROGRESS/50%",
    collabA1?.partStatus === "IN_PROGRESS" && collabA1?.partProgressPercent === 50,
    `${collabA1?.partStatus}/${collabA1?.partProgressPercent}`
  );

  res = await fetch(`${BASE}/api/tasks/${taskA.id}/updates`, {
    method: "POST",
    headers: H(tokCollab),
    body: JSON.stringify({ progressPercent: 100, notes: "Xong phần việc", submitForReview: true }),
  });
  check("A4. Collaborator nộp thay chủ trì => 403", res.status === 403, `HTTP ${res.status}`);

  res = await fetch(`${BASE}/api/tasks/${taskA.id}/updates`, {
    method: "POST",
    headers: H(tokCollab),
    body: JSON.stringify({ progressPercent: 100, actualResultText: "Ghi đè kết quả" }),
  });
  check("A5. Collaborator ghi đè actualResultText => 403", res.status === 403, `HTTP ${res.status}`);

  res = await fetch(`${BASE}/api/tasks/${taskA.id}`, {
    method: "PATCH",
    headers: H(tokCollab),
    body: JSON.stringify({ assigneeIds: [] }),
  });
  check("A6. Collaborator đổi assignee => 403", res.status === 403, `HTTP ${res.status}`);

  res = await fetch(`${BASE}/api/tasks/${taskA.id}`, {
    method: "PATCH",
    headers: H(tokCollab),
    body: JSON.stringify({ status: "IN_PROGRESS", hasIssue: true }),
  });
  check("A7. Collaborator đổi Task status/issue => 403", res.status === 403, `HTTP ${res.status}`);

  // ================================================================
  // B. Submit part -> owner overall -> preview -> AGREE
  // ================================================================
  console.log("\n--- B. Submit part / overall / AGREE ---");
  res = await fetch(`${BASE}/api/tasks/${taskA.id}/participant-results`, {
    method: "POST",
    headers: H(tokCollab),
    body: JSON.stringify({
      action: "SUBMIT",
      partResultText: "Hoàn thành phần việc A",
      partCompletedOn: "2026-10-23",
      partProgressPercent: 100,
    }),
  });
  check("B1. Collaborator báo phần việc => 201", res.status === 201, `HTTP ${res.status}`);
  const rowsB1 = await participantRows(taskA.id);
  check(
    "B2. Participant collaborator SUBMITTED",
    rowsB1.find((r) => r.personId === collaborator.personId)?.partStatus === "SUBMITTED"
  );

  res = await fetch(`${BASE}/api/tasks/${taskA.id}/submit-overall`, {
    method: "POST",
    headers: H(tokCollab),
    body: JSON.stringify({ actualResultText: "Nộp thay" }),
  });
  check("B3. Collaborator nộp kết quả chung => 403", res.status === 403, `HTTP ${res.status}`);

  res = await fetch(`${BASE}/api/tasks/${taskA.id}/submit-overall`, {
    method: "POST",
    headers: H(tokOwner),
    body: JSON.stringify({ actualResultText: "Kết quả chung A" }),
  });
  check("B4. Owner nộp chung khi collaborator đã báo => 201", res.status === 201, `HTTP ${res.status}`);

  const taskAAfter = await prisma.task.findUnique({ where: { id: taskA.id } });
  check("B5. Task WAITING_REVIEW", taskAAfter?.status === "WAITING_REVIEW", String(taskAAfter?.status));
  check("B6. Chưa tạo ApprovalCase lúc submit", (await caseCount(taskA.id)) === 0);

  const snapA = await prisma.taskSubmissionSnapshot.findMany({ where: { taskId: taskA.id } });
  check("B7. Snapshot round 1 + submittedBy owner", snapA.length === 1 && snapA[0].round === 1 && snapA[0].submittedById === owner.personId);

  const previewRes = await fetch(
    `${BASE}/api/approvals/TASK_RESULT/${taskA.id}/preview`,
    { headers: H(tokLeader) }
  );
  const previewJson = await previewRes.json().catch(() => ({}));
  const participants = previewJson?.data?.content?.participants || [];
  check("B8. Preview có participant summary", previewRes.ok && participants.length === 2, `HTTP ${previewRes.status}`);
  check(
    "B9. Preview submitter là owner thật",
    previewJson?.data?.submitter?.id === owner.personId,
    String(previewJson?.data?.submitter?.id)
  );

  res = await fetch(`${BASE}/api/approvals/TASK_RESULT/${taskA.id}/decision`, {
    method: "POST",
    headers: H(tokLeader),
    body: JSON.stringify({ action: "AGREE", reason: "Đồng ý nghiệm thu" }),
  });
  check("B10. Leader AGREE => 200", res.status === 200, `HTTP ${res.status}`);
  const taskAAfterAgree = await prisma.task.findUnique({ where: { id: taskA.id } });
  const caseAAfter = await prisma.approvalCase.findUnique({
    where: { caseType_resourceId: { caseType: "TASK_RESULT", resourceId: taskA.id } },
  });
  const rowsAAfter = await participantRows(taskA.id);
  check("B11. Task COMPLETED", taskAAfterAgree?.status === "COMPLETED", String(taskAAfterAgree?.status));
  check("B12. Case AGREED", caseAAfter?.status === "AGREED", String(caseAAfter?.status));
  check(
    "B13. Participant bắt buộc ACCEPTED",
    rowsAAfter.filter((r) => r.role === "COLLABORATOR").every((r) => r.partStatus === "ACCEPTED")
  );
  check("B14. Một ApprovalCase/Task", (await caseCount(taskA.id)) === 1);

  // ================================================================
  // C. E9.3 REJECT chọn phần -> resubmit -> round 2
  // ================================================================
  console.log("\n--- C. E9.3 REJECT chọn phần / resubmit ---");
  const taskC = await createTask({
    code: `${TAG}-C`,
    title: `${TAG} nhiệm vụ C`,
    ownerId: owner.personId,
    unitId,
    collaboratorId: collaborator.personId,
  });
  await fetch(`${BASE}/api/tasks/${taskC.id}/participant-results`, {
    method: "POST",
    headers: H(tokCollab),
    body: JSON.stringify({
      action: "SUBMIT",
      partResultText: "Phần việc C",
      partCompletedOn: "2026-10-23",
      partProgressPercent: 100,
    }),
  });
  await fetch(`${BASE}/api/tasks/${taskC.id}/submit-overall`, {
    method: "POST",
    headers: H(tokOwner),
    body: JSON.stringify({ actualResultText: "Kết quả C" }),
  });

  const caseCBefore = await prisma.approvalCase.findUnique({
    where: { caseType_resourceId: { caseType: "TASK_RESULT", resourceId: taskC.id } },
  });
  check("C1. Chưa có case trước quyết định (S4 timing)", caseCBefore === null, String(caseCBefore?.status));

  res = await fetch(`${BASE}/api/approvals/TASK_RESULT/${taskC.id}/decision`, {
    method: "POST",
    headers: H(tokLeader),
    body: JSON.stringify({
      action: "REJECT",
      reason: "Trả phần phối hợp để bổ sung",
      returnPersonIds: [collaborator.personId],
    }),
  });
  check("C2. Leader REJECT => 200", res.status === 200, `HTTP ${res.status}`);
  const caseCRejected = await prisma.approvalCase.findUnique({
    where: { caseType_resourceId: { caseType: "TASK_RESULT", resourceId: taskC.id } },
  });
  check("C2b. Case REJECTED", caseCRejected?.status === "REJECTED", String(caseCRejected?.status));
  const rowsC1 = await participantRows(taskC.id);
  const collabC1 = rowsC1.find((r) => r.personId === collaborator.personId);
  check("C3. Phần collaborator RETURNED", collabC1?.partStatus === "RETURNED", String(collabC1?.partStatus));
  const taskCAfterReject = await prisma.task.findUnique({ where: { id: taskC.id } });
  check("C4. Task IN_PROGRESS", taskCAfterReject?.status === "IN_PROGRESS", String(taskCAfterReject?.status));

  res = await fetch(`${BASE}/api/tasks/${taskC.id}/submit-overall`, {
    method: "POST",
    headers: H(tokOwner),
    body: JSON.stringify({ actualResultText: "Kết quả C lần 2" }),
  });
  check("C5. Owner nộp lại khi collaborator chưa báo => 409", res.status === 409, `HTTP ${res.status}`);

  await fetch(`${BASE}/api/tasks/${taskC.id}/participant-results`, {
    method: "POST",
    headers: H(tokCollab),
    body: JSON.stringify({
      action: "SUBMIT",
      partResultText: "Phần việc C bổ sung",
      partCompletedOn: "2026-10-23",
      partProgressPercent: 100,
    }),
  });
  res = await fetch(`${BASE}/api/tasks/${taskC.id}/submit-overall`, {
    method: "POST",
    headers: H(tokOwner),
    body: JSON.stringify({ actualResultText: "Kết quả C lần 2" }),
  });
  check("C6. Owner nộp lại khi đủ S-ALL => 201", res.status === 201, `HTTP ${res.status}`);
  const caseCReopened = await prisma.approvalCase.findUnique({
    where: { caseType_resourceId: { caseType: "TASK_RESULT", resourceId: taskC.id } },
  });
  const snapC = await prisma.taskSubmissionSnapshot.findMany({
    where: { taskId: taskC.id },
    orderBy: { round: "asc" },
  });
  check("C7. Case mở lại round 2", caseCReopened?.status === "OPEN" && caseCReopened?.currentRound === 2);
  check("C8. Snapshot có round 1 + 2", snapC.length === 2 && snapC[1].round === 2);

  res = await fetch(`${BASE}/api/approvals/TASK_RESULT/${taskC.id}/decision`, {
    method: "POST",
    headers: H(tokLeader),
    body: JSON.stringify({ action: "AGREE" }),
  });
  check("C9. Leader AGREE lần 2 => 200", res.status === 200, `HTTP ${res.status}`);
  check("C10. Vẫn một ApprovalCase/Task", (await caseCount(taskC.id)) === 1);

  // ================================================================
  // D. Tự duyệt khi lãnh đạo là chủ trì
  // ================================================================
  console.log("\n--- D. Tự duyệt ---");
  const taskD = await createTask({
    code: `${TAG}-D`,
    title: `${TAG} nhiệm vụ D`,
    ownerId: leader.personId,
    unitId: leader.person.assignments[0]!.unitId,
  });
  res = await fetch(`${BASE}/api/tasks/${taskD.id}/submit-overall`, {
    method: "POST",
    headers: H(tokLeader),
    body: JSON.stringify({ actualResultText: "Kết quả D" }),
  });
  check("D1. Leader tự nộp chung => 201", res.status === 201, `HTTP ${res.status}`);
  res = await fetch(`${BASE}/api/approvals/TASK_RESULT/${taskD.id}/decision`, {
    method: "POST",
    headers: H(tokLeader),
    body: JSON.stringify({ action: "AGREE" }),
  });
  check("D2. Leader tự duyệt => 403", res.status === 403, `HTTP ${res.status}`);
  check("D3. Không tạo case khi tự duyệt bị chặn", (await caseCount(taskD.id)) === 0);

  // ================================================================
  // E. Legacy Task không collaborator
  // ================================================================
  console.log("\n--- E. Legacy Task ---");
  const taskE = await createTask({
    code: `${TAG}-E`,
    title: `${TAG} nhiệm vụ E legacy`,
    ownerId: owner.personId,
    unitId,
  });
  res = await fetch(`${BASE}/api/tasks/${taskE.id}/submit-overall`, {
    method: "POST",
    headers: H(tokOwner),
    body: JSON.stringify({ actualResultText: "Kết quả E" }),
  });
  check("E1. Legacy owner nộp chung => 201", res.status === 201, `HTTP ${res.status}`);
  res = await fetch(`${BASE}/api/approvals/TASK_RESULT/${taskE.id}/decision`, {
    method: "POST",
    headers: H(tokLeader),
    body: JSON.stringify({ action: "AGREE" }),
  });
  check("E2. Legacy AGREE => 200", res.status === 200, `HTTP ${res.status}`);
  const taskEAfter = await prisma.task.findUnique({ where: { id: taskE.id } });
  check("E3. Legacy Task COMPLETED", taskEAfter?.status === "COMPLETED", String(taskEAfter?.status));

  // ================================================================
  // G. Task tạo qua API: S-ALL áp dụng ngay
  // ================================================================
  console.log("\n--- G. Task mới qua API: S-ALL ---");
  const createRes = await fetch(`${BASE}/api/tasks`, {
    method: "POST",
    headers: H(tokLeader),
    body: JSON.stringify({
      title: `${TAG} nhiệm vụ tạo qua API`,
      ownerId: owner.personId,
      unitId,
      priority: "Trung bình",
      currentDeadline: "2026-12-31T00:00:00.000Z",
      assigneeIds: [collaborator.personId],
    }),
  });
  const createJson = await createRes.json().catch(() => ({}));
  const taskGId = createJson?.data?.id as string | undefined;
  if (taskGId) createdTaskIds.push(taskGId);
  check("G1. Tạo Task qua API => 201", createRes.status === 201 && !!taskGId, `HTTP ${createRes.status}`);
  if (taskGId) {
    res = await fetch(`${BASE}/api/tasks/${taskGId}/submit-overall`, {
      method: "POST",
      headers: H(tokOwner),
      body: JSON.stringify({ actualResultText: "Kết quả G" }),
    });
    check("G2. Owner nộp khi collaborator chưa báo => 409", res.status === 409, `HTTP ${res.status}`);
    await fetch(`${BASE}/api/tasks/${taskGId}/participant-results`, {
      method: "POST",
      headers: H(tokCollab),
      body: JSON.stringify({
        action: "SUBMIT",
        partResultText: "Phần việc G",
        partCompletedOn: "2026-10-23",
        partProgressPercent: 100,
      }),
    });
    res = await fetch(`${BASE}/api/tasks/${taskGId}/submit-overall`, {
      method: "POST",
      headers: H(tokOwner),
      body: JSON.stringify({ actualResultText: "Kết quả G" }),
    });
    check("G3. Owner nộp sau khi collaborator báo => 201", res.status === 201, `HTTP ${res.status}`);
  }

  // ================================================================
  // F. Không chạm monthly/QĐ1277
  // ================================================================
  console.log("\n--- F. Không tạo dòng monthly/QĐ1277 ---");
  const monthly = await prisma.monthlyWorkResult.count({
    where: { taskId: { in: createdTaskIds } },
  });
  check("F1. Không sinh MonthlyWorkResult cho participant/task test", monthly === 0, String(monthly));

  console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
}

main()
  .catch((err) => {
    fail++;
    console.error("\n[FATAL]", err);
  })
  .finally(async () => {
    try {
      if (createdTaskIds.length > 0) {
        await prisma.approvalCase.deleteMany({
          where: { caseType: "TASK_RESULT", resourceId: { in: createdTaskIds } },
        });
        await prisma.task.deleteMany({ where: { id: { in: createdTaskIds } } });
      }
    } catch (e) {
      console.error("[CLEANUP]", e);
    }
    await prisma.$disconnect();
    if (fail > 0) process.exitCode = 1;
  });
