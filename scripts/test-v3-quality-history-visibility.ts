/**
 * V3.2 remediation Task 1.1 — quality trong lịch sử hợp nhất phải ẩn với collaborator.
 *
 * Lỗ hổng: `GET /api/tasks/[id]/history` trả `qualityPercent` của quyết định duyệt cho
 * mọi người có quyền READ Task, kể cả collaborator (không thuộc tuyến duyệt).
 *
 * Kiểm chứng:
 *  A. Collaborator `democb02` gọi history => HTTP 200, vẫn thấy quyết định nhưng
 *     `qualityPercent` = null (không lộ 80).
 *  B. Owner `democb01` và `UNIT_LEADER` `demold01` gọi cùng task => thấy 80.
 *  C. Ngoài trường quality, response của collaborator giống owner (không đổi shape).
 *  D. Fail closed: gọi service không truyền `access` => quality null.
 *  E. Flag `V3_YC10_QUALITY` OFF => mọi người null (kiểm tra trực tiếp service).
 *
 * Chạy (server port 3117, DB fixture, flag ON):
 *   $env:DATABASE_URL="postgresql://postgres:***@localhost:5432/talung_v3_approval_impl_quality"
 *   $env:DIRECT_URL=$env:DATABASE_URL
 *   $env:V3_YC10_QUALITY="true"; pnpm dev -- -p 3117
 *   $env:TEST_BASE_URL="http://localhost:3117"
 *   npx tsx scripts/test-v3-quality-history-visibility.ts
 *
 * Phần flag OFF kiểm tra trực tiếp service (không cần restart server), theo cách
 * `scripts/test-v3-yc10-quality.ts` đã làm.
 */
import { createRequire } from "node:module";
import { assertLocalTestDatabase } from "./lib/test-db-safety";

const creq = createRequire(import.meta.url);
const { PrismaClient } = creq("@prisma/client");

const dbUrl = assertLocalTestDatabase(
  process.env.DIRECT_URL || process.env.DATABASE_URL || "",
  "test-v3-quality-history-visibility"
);
process.env.DATABASE_URL = dbUrl;
process.env.DIRECT_URL = dbUrl;
process.env.JWT_SECRET = process.env.JWT_SECRET || "phase_a_local_test_secret";

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const BASE = process.env.TEST_BASE_URL || "http://localhost:3117";
const PASSWORD = process.env.TEST_PASSWORD || "LocalTest@2026";
const TAG = `[E12Q-${Date.now().toString().slice(-6)}]`;
const QUALITY = 80;

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
  if (!json.token) throw new Error(`Đăng nhập ${username} lỗi HTTP ${res.status}: ${json.error || ""}`);
  return json.token as string;
}

const H = (t: string) => ({ Authorization: `Bearer ${t}`, "Content-Type": "application/json" });

function toSessionUser(account: any, person: any): any {
  const grant = account.roleGrants[0];
  return {
    id: account.id,
    personId: person.id,
    username: account.username,
    fullName: person.fullName,
    personCode: person.code,
    unitId: person.assignments?.[0]?.unitId,
    unitName: person.assignments?.[0]?.unit?.name,
    role: grant?.role?.code || "STAFF",
    scopeType: grant?.scopeType || "DEPARTMENT",
    scopeUnitId: grant?.scopeUnitId ?? null,
    permissions: [],
  };
}

let createdTaskId: string | null = null;

async function main() {
  console.log(`=== E12-QUALITY HISTORY VISIBILITY — ${BASE} ===\n`);

  const accounts = await prisma.account.findMany({
    include: {
      person: { include: { assignments: { where: { isPrimary: true }, include: { unit: true } } } },
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

  const tokOwner = await login(owner.username);
  const tokLeader = await login(leader.username);
  const tokCollab = await login(collaborator.username);

  // ---------------------------------------------------------------- fixture
  const task = await prisma.task.create({
    data: {
      code: `E12Q-${Date.now().toString().slice(-5)}`,
      title: `${TAG} nhiệm vụ quality trong lịch sử`,
      ownerId: owner.personId,
      unitId,
      status: "COMPLETED",
      priority: "Trung bình",
      originalDeadline: new Date("2026-12-31T00:00:00.000Z"),
      currentDeadline: new Date("2026-12-31T00:00:00.000Z"),
      description: TAG,
      actualResultText: `${TAG} kết quả`,
      assignees: { create: [{ personId: collaborator.personId, role: "COLLABORATOR" }] },
    },
  });
  createdTaskId = task.id;

  const approvalCase = await prisma.approvalCase.create({
    data: {
      caseType: "TASK_RESULT",
      resourceId: task.id,
      resourceCode: task.code,
      title: task.title,
      unitId,
      submittedById: owner.personId,
      status: "AGREED",
      currentRound: 1,
      decidedById: leader.personId,
      decidedAt: new Date(),
    },
  });
  await prisma.approvalDecision.create({
    data: {
      caseId: approvalCase.id,
      round: 1,
      action: "AGREE",
      reason: `${TAG} đạt yêu cầu`,
      qualityPercent: QUALITY,
      actorId: leader.id,
      actorPersonId: leader.personId,
    },
  });

  const storedDecision = await prisma.approvalDecision.findFirst({
    where: { caseId: approvalCase.id },
    select: { qualityPercent: true },
  });
  check("A0. Fixture: quyết định AGREE lưu quality 80", storedDecision?.qualityPercent === QUALITY,
    String(storedDecision?.qualityPercent));

  // ---------------------------------------------------------------- HTTP
  const fetchHistory = async (token: string) => {
    const res = await fetch(`${BASE}/api/tasks/${task.id}/history`, { headers: H(token) });
    const json = await res.json().catch(() => null);
    const entries: any[] = json?.data?.entries || [];
    return { res, json, entries, decisions: entries.filter((e) => e.source === "APPROVAL_DECISION") };
  };

  const collab = await fetchHistory(tokCollab);
  check("B1. Collaborator gọi history => 200 (vẫn xem được lịch sử)", collab.res.status === 200,
    `HTTP ${collab.res.status}`);
  check("B2. Collaborator vẫn thấy quyết định duyệt (không ẩn cả entry)",
    collab.decisions.length === 1 && collab.decisions[0].action === "AGREE" && collab.decisions[0].round === 1,
    `decisions=${collab.decisions.length}`);
  check("B3. Collaborator: qualityPercent = null, không lộ 80",
    collab.decisions.length === 1 &&
      collab.decisions[0].qualityPercent === null &&
      !JSON.stringify(collab.decisions).includes('"qualityPercent":80'),
    JSON.stringify(collab.decisions.map((d) => d.qualityPercent)));

  const ownerHistory = await fetchHistory(tokOwner);
  check("C1. Owner gọi history => 200", ownerHistory.res.status === 200, `HTTP ${ownerHistory.res.status}`);
  check("C2. Owner thấy quality 80", ownerHistory.decisions[0]?.qualityPercent === QUALITY,
    String(ownerHistory.decisions[0]?.qualityPercent));

  const leaderHistory = await fetchHistory(tokLeader);
  check("C3. UNIT_LEADER gọi history => 200", leaderHistory.res.status === 200, `HTTP ${leaderHistory.res.status}`);
  check("C4. UNIT_LEADER thấy quality 80", leaderHistory.decisions[0]?.qualityPercent === QUALITY,
    String(leaderHistory.decisions[0]?.qualityPercent));

  // Không đổi response ngoài trường quality
  const stripQuality = (entries: any[]) =>
    JSON.stringify(
      entries.map((e) => ({ ...e, qualityPercent: null }))
    );
  check("D1. Ngoài qualityPercent, response collaborator giống owner",
    stripQuality(collab.entries) === stripQuality(ownerHistory.entries),
    `collab=${collab.entries.length}, owner=${ownerHistory.entries.length}`);
  check("D2. counts/sources/limit không đổi giữa collaborator và owner",
    JSON.stringify(collab.json?.data?.counts) === JSON.stringify(ownerHistory.json?.data?.counts) &&
      JSON.stringify(collab.json?.data?.sources) === JSON.stringify(ownerHistory.json?.data?.sources) &&
      collab.json?.data?.limit === ownerHistory.json?.data?.limit);

  // ---------------------------------------------------------------- service (fail closed + flag OFF)
  process.env.V3_YC10_QUALITY = "true";
  const historySvc = await import("../src/server/task-history");
  const svcOwner = toSessionUser(owner, owner.person);
  const svcLeader = toSessionUser(leader, leader.person);
  const svcCollab = toSessionUser(collaborator, collaborator.person);

  const noAccess = await historySvc.getTaskUnifiedHistory(task.id, { sources: ["APPROVAL_DECISION"] });
  check("E1. Service không truyền access => quality null (fail closed)",
    noAccess.entries.length === 1 && noAccess.entries[0].qualityPercent === null,
    String(noAccess.entries[0]?.qualityPercent));

  const ownerAccess = await historySvc.getTaskUnifiedHistory(
    task.id,
    { sources: ["APPROVAL_DECISION"] },
    { viewer: svcOwner, ownerId: task.ownerId, unitId: task.unitId }
  );
  check("E2. Service access owner => quality 80", ownerAccess.entries[0]?.qualityPercent === QUALITY,
    String(ownerAccess.entries[0]?.qualityPercent));

  const leaderAccess = await historySvc.getTaskUnifiedHistory(
    task.id,
    { sources: ["APPROVAL_DECISION"] },
    { viewer: svcLeader, ownerId: task.ownerId, unitId: task.unitId }
  );
  check("E3. Service access UNIT_LEADER => quality 80", leaderAccess.entries[0]?.qualityPercent === QUALITY,
    String(leaderAccess.entries[0]?.qualityPercent));

  const collabAccess = await historySvc.getTaskUnifiedHistory(
    task.id,
    { sources: ["APPROVAL_DECISION"] },
    { viewer: svcCollab, ownerId: task.ownerId, unitId: task.unitId }
  );
  check("E4. Service access collaborator => quality null", collabAccess.entries[0]?.qualityPercent === null,
    String(collabAccess.entries[0]?.qualityPercent));

  process.env.V3_YC10_QUALITY = "false";
  const offOwner = await historySvc.getTaskUnifiedHistory(
    task.id,
    { sources: ["APPROVAL_DECISION"] },
    { viewer: svcOwner, ownerId: task.ownerId, unitId: task.unitId }
  );
  const offLeader = await historySvc.getTaskUnifiedHistory(
    task.id,
    { sources: ["APPROVAL_DECISION"] },
    { viewer: svcLeader, ownerId: task.ownerId, unitId: task.unitId }
  );
  const offCollab = await historySvc.getTaskUnifiedHistory(
    task.id,
    { sources: ["APPROVAL_DECISION"] },
    { viewer: svcCollab, ownerId: task.ownerId, unitId: task.unitId }
  );
  check("F1. Flag OFF: owner thấy null", offOwner.entries[0]?.qualityPercent === null,
    String(offOwner.entries[0]?.qualityPercent));
  check("F2. Flag OFF: UNIT_LEADER thấy null", offLeader.entries[0]?.qualityPercent === null,
    String(offLeader.entries[0]?.qualityPercent));
  check("F3. Flag OFF: collaborator thấy null", offCollab.entries[0]?.qualityPercent === null,
    String(offCollab.entries[0]?.qualityPercent));
  check("F4. Flag OFF: vẫn trả quyết định duyệt (chỉ ẩn quality)",
    offOwner.entries.length === 1 && offOwner.entries[0].action === "AGREE");
  process.env.V3_YC10_QUALITY = "true";

  console.log(`\n=== KẾT QUẢ: ${pass} PASS / ${fail} FAIL ===`);
}

main()
  .catch((err) => {
    fail++;
    console.error("LỖI TEST:", err);
  })
  .finally(async () => {
    try {
      if (createdTaskId) {
        await prisma.approvalCase.deleteMany({
          where: { caseType: "TASK_RESULT", resourceId: createdTaskId },
        });
        await prisma.task.delete({ where: { id: createdTaskId } }).catch(() => {});
      }
    } catch (e) {
      console.error("[CLEANUP]", e);
    }
    await prisma.$disconnect();
    process.exit(fail === 0 ? 0 : 1);
  });
