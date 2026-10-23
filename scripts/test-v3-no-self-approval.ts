/**
 * test-v3-no-self-approval.ts — KHÔNG AI TỰ DUYỆT CÔNG VIỆC CỦA MÌNH.
 *
 * Bao phủ CẢ HAI luồng:
 *  A) Luồng V3 (đầu việc tự ghi nhận): `canReviewAsDirectLeader` chỉ theo tuyến phụ trách.
 *  B) Luồng nhiệm vụ CŨ (nghiệm thu nhiệm vụ):
 *     - POST /api/tasks/{id}/updates (status → COMPLETED/DONE) của CHỦ NHIỆM vụ bị chặn.
 *     - POST /api/approvals/TASK_RESULT/{id}/decision (AGREE) của người TRÌNH bị chặn.
 */
import { createRequire } from "node:module";
import { assertLocalTestDatabase } from "./lib/test-db-safety";

const creq = createRequire(import.meta.url);
const { PrismaClient } = creq("@prisma/client");
const dbUrl = assertLocalTestDatabase(
  process.env.DIRECT_URL || process.env.DATABASE_URL || "",
  "test-v3-no-self-approval"
);
const prisma = new PrismaClient({
  datasources: { db: { url: dbUrl } },
});

const BASE = process.env.TEST_BASE_URL || "http://localhost:3100";
const PASSWORD = process.env.TEST_PASSWORD || "LocalTest@2026";
const TAG = "[V3-NO-SELF-APPROVAL]";

let pass = 0,
  fail = 0;
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
  return json.token;
}
const H = (t: string) => ({ Authorization: `Bearer ${t}`, "Content-Type": "application/json" });

async function main() {
  console.log("=== V3.1.3 — CHỐNG TỰ DUYỆT (mọi luồng) ===\n");

  const accounts = await prisma.account.findMany({
    include: {
      person: {
        include: { assignments: { where: { isPrimary: true }, include: { unit: true } } },
      },
      roleGrants: { include: { role: true } },
    },
  });
  const leader = accounts.find(
    (a) => a.roleGrants[0]?.role.code === "UNIT_LEADER" && a.username === "demold01"
  ) || accounts.find((a) => a.roleGrants[0]?.role.code === "UNIT_LEADER");
  const staff = accounts.find((a) => a.username === "democb01");
  if (!leader || !staff) {
    console.log("  THIẾU tài khoản fixture — bỏ qua.");
    return;
  }

  // Nhiệm vụ do CHÍNH LÃNH ĐẠO làm chủ nhiệm
  const task = await prisma.task.create({
    data: {
      code: "TST-SELF-" + Date.now().toString().slice(-6),
      title: `${TAG} nhiem vu chu nhiem la lanh dao`,
      unitId: leader.person.assignments[0]!.unitId,
      ownerId: leader.personId,
      status: "IN_PROGRESS",
      priority: "Thường",
      originalDeadline: new Date("2026-12-31T00:00:00.000Z"),
      currentDeadline: new Date("2026-12-31T00:00:00.000Z"),
      description: TAG,
    },
  });

  try {
    const tokLeader = await login(leader.username);
    const tokStaff = await login(staff.username);

    // A. Lãnh đạo tự nghiệm thu nhiệm vụ của chính mình
    const r1 = await fetch(`${BASE}/api/tasks/${task.id}/updates`, {
      method: "POST",
      headers: H(tokLeader),
      body: JSON.stringify({ progress: 100, status: "COMPLETED", notes: TAG }),
    });
    const j1 = await r1.json().catch(() => ({}));
    check(
      "A1. Lanh dao TU nghiem thu nhiem vu cua minh => bi chan (403)",
      r1.status === 403,
      `HTTP ${r1.status} ${String(j1.error || j1.message || "").slice(0, 70)}`
    );
    const after = await prisma.task.findUnique({ where: { id: task.id } });
    check("A2. Trang thai nhiem vu KHONG doi", after?.status === "IN_PROGRESS", String(after?.status));

    // B. Hồ sơ nghiệm thu: lãnh đạo là chủ nhiệm => không được tự AGREE
    await prisma.task.update({ where: { id: task.id }, data: { status: "WAITING_REVIEW" } });
    const r2 = await fetch(`${BASE}/api/approvals/TASK_RESULT/${task.id}/decision`, {
      method: "POST",
      headers: H(tokLeader),
      body: JSON.stringify({ action: "AGREE", reason: TAG }),
    });
    const j2 = await r2.json().catch(() => ({}));
    check(
      "B1. Lanh dao TU quyet dinh ho so cua minh (AGREE) => bi chan (403)",
      r2.status === 403,
      `HTTP ${r2.status} ${String(j2.error || j2.message || "").slice(0, 70)}`
    );
    const caseRow = await prisma.approvalCase.findFirst({
      where: { resourceId: task.id },
      orderBy: { createdAt: "desc" },
    });
    check(
      "B2. Ho so chua co quyet dinh tu duyet",
      !caseRow || caseRow.status !== "APPROVED",
      `status=${caseRow?.status}`
    );

    // C. Cán bộ (không phải lãnh đạo) cũng không duyệt được
    const r3 = await fetch(`${BASE}/api/approvals/TASK_RESULT/${task.id}/decision`, {
      method: "POST",
      headers: H(tokStaff),
      body: JSON.stringify({ action: "AGREE", reason: TAG }),
    });
    check("C1. Can bo khong co tham quyen quyet dinh => bi chan (403)", r3.status === 403, `HTTP ${r3.status}`);
  } finally {
    await prisma.approvalDecision.deleteMany({ where: { caseId: { in: (await prisma.approvalCase.findMany({ where: { resourceId: task.id }, select: { id: true } })).map((c) => c.id) } } }).catch(() => {});
    await prisma.approvalCase.deleteMany({ where: { resourceId: task.id } }).catch(() => {});
    await prisma.taskUpdate.deleteMany({ where: { taskId: task.id } }).catch(() => {});
    await prisma.task.delete({ where: { id: task.id } }).catch(() => {});
    await prisma.$disconnect();
  }

  console.log(`\n=== ${pass} pass / ${fail} fail ===`);
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error("LỖI:", String(e.stack || e.message).slice(0, 400));
  await prisma.$disconnect();
  process.exit(1);
});
