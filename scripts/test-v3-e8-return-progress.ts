/**
 * E8-A — Trả lại nhiệm vụ/kết quả: GIỮ NGUYÊN tiến độ (kể cả 100%), bắt buộc có ghi chú.
 *
 * Kiểm chứng:
 *  A. Quyết định REJECT qua ApprovalCase: thiếu lý do => 400; có lý do => giữ 100%,
 *     ghi TaskUpdate kind=return, audit có progressPercent + progressPolicy.
 *  B. PATCH /api/tasks/[id] trả lại: thiếu ghi chú => 400; có ghi chú => giữ tiến độ.
 *  C. POST /api/tasks/[id]/updates trả lại: đi qua ApprovalCase, không ghi đè 0%,
 *     thiếu ghi chú => 400.
 *  D. Quick approve REJECT_COMPLETION qua /api/tasks: thiếu lý do => 400.
 *  E. Bản ghi phần việc phối hợp chen giữa KHÔNG làm trôi tiến độ Task.
 *
 * Chạy:
 *   TEST_BASE_URL=http://localhost:3118 \
 *   DATABASE_URL=postgresql://.../talung_v3_approval_impl_quality \
 *   npx tsx scripts/test-v3-e8-return-progress.ts
 */
import { createRequire } from "node:module";

const creq = createRequire(import.meta.url);
const { PrismaClient } = creq("@prisma/client");
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
});

const BASE = process.env.TEST_BASE_URL || "http://localhost:3117";
const PASSWORD = process.env.TEST_PASSWORD || "LocalTest@2026";
const TAG = `[E8-${Date.now().toString().slice(-6)}]`;

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
  if (!json.token) throw new Error(`Đăng nhập ${username} lỗi HTTP ${res.status}`);
  return json.token as string;
}

const H = (t: string) => ({ Authorization: `Bearer ${t}`, "Content-Type": "application/json" });
const createdTaskIds: string[] = [];

async function createTask(input: {
  code: string;
  title: string;
  ownerId: string;
  unitId: string;
  status?: string;
  actualResultText?: string | null;
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
    },
  });
  createdTaskIds.push(row.id);
  return row;
}

async function submit(taskId: string, token: string, progress = 100) {
  return fetch(`${BASE}/api/tasks/${taskId}/updates`, {
    method: "POST",
    headers: H(token),
    body: JSON.stringify({
      progressPercent: progress,
      notes: `${TAG} nộp kết quả`,
      submitForReview: true,
      actualResultText: `${TAG} kết quả cần giữ nguyên`,
    }),
  });
}

async function decision(taskId: string, token: string, body: any) {
  return fetch(`${BASE}/api/approvals/TASK_RESULT/${taskId}/decision`, {
    method: "POST",
    headers: H(token),
    body: JSON.stringify(body),
  });
}

async function main() {
  console.log(`=== E8-A RETURN KEEPS PROGRESS — ${BASE} ===\n`);

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

  // ------------------------------------------------------------------ A
  console.log("\n--- A. Quyết định REJECT qua ApprovalCase ---");
  const taskA = await createTask({
    code: `E8-A-${Date.now().toString().slice(-5)}`,
    title: `${TAG} trả lại qua decision`,
    ownerId: owner.personId,
    unitId,
  });
  const submitA = await submit(taskA.id, tokOwner);
  check("A1. Chủ trì nộp 100% => 201", submitA.status === 201, `HTTP ${submitA.status}`);

  const noReasonA = await decision(taskA.id, tokLeader, { action: "REJECT" });
  const noReasonJsonA = await noReasonA.json().catch(() => ({}));
  check(
    "A2. REJECT thiếu lý do => 400 (không tự sinh ghi chú)",
    noReasonA.status === 400 && /lý do/i.test(String(noReasonJsonA?.error || noReasonJsonA?.message || "")),
    `HTTP ${noReasonA.status}`
  );

  // Bản ghi phần việc phối hợp chen giữa, cố tình ghi 0% (mirror legacy chưa có event id).
  await new Promise((r) => setTimeout(r, 15));
  await prisma.taskUpdate.create({
    data: {
      taskId: taskA.id,
      authorId: collaborator.personId,
      progressPercent: 0,
      statusBefore: null,
      statusAfter: null,
      kind: "participant_progress",
      notes: `${TAG} cập nhật phần việc 0%`,
      subjectPersonId: collaborator.personId,
      participantEventId: null,
    },
  });

  const rejectA = await decision(taskA.id, tokLeader, {
    action: "REJECT",
    reason: `${TAG} thiếu chứng từ`,
  });
  const taskAAfter = await prisma.task.findUnique({ where: { id: taskA.id } });
  const returnA = await prisma.taskUpdate.findFirst({
    where: { taskId: taskA.id, kind: "return" },
    orderBy: { createdAt: "desc" },
  });
  const auditA = await prisma.auditEvent.findFirst({
    where: { resourceType: "ApprovalCase", action: "APPROVAL_REJECT" },
    orderBy: { timestamp: "desc" },
  });
  const auditNewA: any = auditA?.newData || {};
  check(
    "A3. REJECT có lý do => 200, giữ kết quả + trạng thái IN_PROGRESS",
    rejectA.status === 200 && taskAAfter?.status === "IN_PROGRESS" &&
      taskAAfter?.actualResultText === `${TAG} kết quả cần giữ nguyên`,
    `HTTP ${rejectA.status}, status=${taskAAfter?.status}`
  );
  check(
    "A4. TaskUpdate kind=return giữ 100% (bỏ qua bản ghi phần việc 0%)",
    returnA?.progressPercent === 100,
    `progress=${returnA?.progressPercent}`
  );
  check(
    "A5. Audit lưu progressPercent=100 + progressPolicy=PRESERVED_ON_RETURN",
    auditNewA.progressPercent === 100 && auditNewA.progressPolicy === "PRESERVED_ON_RETURN",
    JSON.stringify({ progressPercent: auditNewA.progressPercent, policy: auditNewA.progressPolicy })
  );
  const detailA = await (await fetch(`${BASE}/api/tasks/${taskA.id}`, { headers: H(tokOwner) })).json();
  check(
    "A6. API chi tiết trả progressPercent=100 và lý do trả lại",
    detailA?.data?.progressPercent === 100 &&
      detailA?.data?.approval?.action === "REJECT" &&
      detailA?.data?.approval?.reason === `${TAG} thiếu chứng từ`,
    `progress=${detailA?.data?.progressPercent}, action=${detailA?.data?.approval?.action}`
  );

  // ------------------------------------------------------------------ B
  console.log("\n--- B. PATCH /api/tasks/[id] trả lại ---");
  const taskB = await createTask({
    code: `E8-B-${Date.now().toString().slice(-5)}`,
    title: `${TAG} trả lại qua PATCH`,
    ownerId: owner.personId,
    unitId,
    status: "WAITING_REVIEW",
    actualResultText: `${TAG} kết quả B`,
  });
  await prisma.taskUpdate.create({
    data: {
      taskId: taskB.id,
      authorId: owner.personId,
      progressPercent: 100,
      statusBefore: "IN_PROGRESS",
      statusAfter: "WAITING_REVIEW",
      kind: "submit",
      notes: `${TAG} nộp B`,
    },
  });
  const patchNoNote = await fetch(`${BASE}/api/tasks/${taskB.id}`, {
    method: "PATCH",
    headers: H(tokLeader),
    body: JSON.stringify({ status: "IN_PROGRESS" }),
  });
  check("B1. PATCH trả lại thiếu ghi chú => 400", patchNoNote.status === 400, `HTTP ${patchNoNote.status}`);

  const patchOk = await fetch(`${BASE}/api/tasks/${taskB.id}`, {
    method: "PATCH",
    headers: H(tokLeader),
    body: JSON.stringify({ status: "IN_PROGRESS", notes: `${TAG} bổ sung B` }),
  });
  const taskBAfter = await prisma.task.findUnique({ where: { id: taskB.id } });
  const returnB = await prisma.taskUpdate.findFirst({
    where: { taskId: taskB.id, kind: "return" },
    orderBy: { createdAt: "desc" },
  });
  check(
    "B2. PATCH có ghi chú => 200, giữ 100% + kết quả",
    patchOk.status === 200 && taskBAfter?.status === "IN_PROGRESS" &&
      taskBAfter?.actualResultText === `${TAG} kết quả B` && returnB?.progressPercent === 100,
    `HTTP ${patchOk.status}, progress=${returnB?.progressPercent}`
  );

  // ------------------------------------------------------------------ C
  console.log("\n--- C. POST /api/tasks/[id]/updates trả lại ---");
  const taskC = await createTask({
    code: `E8-C-${Date.now().toString().slice(-5)}`,
    title: `${TAG} trả lại qua updates`,
    ownerId: owner.personId,
    unitId,
    status: "WAITING_REVIEW",
    actualResultText: `${TAG} kết quả C`,
  });
  await prisma.taskUpdate.create({
    data: {
      taskId: taskC.id,
      authorId: owner.personId,
      progressPercent: 100,
      statusBefore: "IN_PROGRESS",
      statusAfter: "WAITING_REVIEW",
      kind: "submit",
      notes: `${TAG} nộp C`,
    },
  });
  const updatesNoNote = await fetch(`${BASE}/api/tasks/${taskC.id}/updates`, {
    method: "POST",
    headers: H(tokLeader),
    body: JSON.stringify({ newStatus: "IN_PROGRESS", progressPercent: 0 }),
  });
  check("C1. Updates trả lại thiếu ghi chú => 400", updatesNoNote.status === 400, `HTTP ${updatesNoNote.status}`);

  const updatesOk = await fetch(`${BASE}/api/tasks/${taskC.id}/updates`, {
    method: "POST",
    headers: H(tokLeader),
    body: JSON.stringify({
      newStatus: "IN_PROGRESS",
      progressPercent: 0,
      notes: `${TAG} yêu cầu làm lại C`,
    }),
  });
  const taskCAfter = await prisma.task.findUnique({ where: { id: taskC.id } });
  const returnC = await prisma.taskUpdate.findFirst({
    where: { taskId: taskC.id, kind: "return" },
    orderBy: { createdAt: "desc" },
  });
  const caseC = await prisma.approvalCase.findUnique({
    where: { caseType_resourceId: { caseType: "TASK_RESULT", resourceId: taskC.id } },
    include: { decisions: true },
  });
  check(
    "C2. Updates trả lại có ghi chú => thành công, KHÔNG ghi đè 0%",
    updatesOk.ok && taskCAfter?.status === "IN_PROGRESS" && returnC?.progressPercent === 100,
    `HTTP ${updatesOk.status}, progress=${returnC?.progressPercent}`
  );
  check(
    "C3. Updates trả lại đi qua ApprovalCase (có quyết định REJECT)",
    caseC?.status === "REJECTED" && caseC?.decisions.some((d) => d.action === "REJECT"),
    `case=${caseC?.status}, decisions=${caseC?.decisions.length}`
  );

  // ------------------------------------------------------------------ D
  console.log("\n--- D. Quick approve REJECT_COMPLETION ---");
  const taskD = await createTask({
    code: `E8-D-${Date.now().toString().slice(-5)}`,
    title: `${TAG} trả lại quick approve`,
    ownerId: owner.personId,
    unitId,
    status: "WAITING_REVIEW",
    actualResultText: `${TAG} kết quả D`,
  });
  await prisma.taskUpdate.create({
    data: {
      taskId: taskD.id,
      authorId: owner.personId,
      progressPercent: 100,
      statusBefore: "IN_PROGRESS",
      statusAfter: "WAITING_REVIEW",
      kind: "submit",
      notes: `${TAG} nộp D`,
    },
  });
  const quickNoReason = await fetch(`${BASE}/api/tasks`, {
    method: "PATCH",
    headers: H(tokLeader),
    body: JSON.stringify({ id: taskD.id, action: "REJECT_COMPLETION" }),
  });
  check("D1. REJECT_COMPLETION thiếu lý do => 400", quickNoReason.status === 400, `HTTP ${quickNoReason.status}`);

  const quickOk = await fetch(`${BASE}/api/tasks`, {
    method: "PATCH",
    headers: H(tokLeader),
    body: JSON.stringify({ id: taskD.id, action: "REJECT_COMPLETION", issueNotes: `${TAG} thiếu D` }),
  });
  const returnD = await prisma.taskUpdate.findFirst({
    where: { taskId: taskD.id, kind: "return" },
    orderBy: { createdAt: "desc" },
  });
  check(
    "D2. REJECT_COMPLETION có lý do => 200, giữ 100%",
    quickOk.status === 200 && returnD?.progressPercent === 100,
    `HTTP ${quickOk.status}, progress=${returnD?.progressPercent}`
  );

  console.log(`\n=== KẾT QUẢ: ${pass} PASS / ${fail} FAIL ===`);
}

main()
  .catch((err) => {
    fail++;
    console.error("LỖI TEST:", err);
  })
  .finally(async () => {
    if (createdTaskIds.length > 0) {
      await prisma.task.deleteMany({ where: { id: { in: createdTaskIds } } }).catch(() => {});
    }
    await prisma.$disconnect();
    process.exit(fail === 0 ? 0 : 1);
  });
