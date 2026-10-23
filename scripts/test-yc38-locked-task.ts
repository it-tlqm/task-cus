/**
 * test-yc38-locked-task.ts — YC-38: khóa nhiệm vụ đã nghiệm thu (F1–F5).
 *
 *   $env:DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/talung_yc38_restore"
 *   $env:DIRECT_URL=$env:DATABASE_URL
 *   npx next dev -p 3100     # chạy song song
 *   npx tsx scripts/test-yc38-locked-task.ts
 *
 * 14 nhóm kiểm thử bắt buộc (mục V của yêu cầu phê duyệt).
 */
import fs from "fs";
import { createRequire } from "node:module";
const require = createRequire("D:/thanhnx/OpenCode/talung-cus-work/package.json");
const { PrismaClient } = require("@prisma/client");

const BASE = process.env.TEST_BASE_URL || "http://localhost:3100";
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
});
const secrets = JSON.parse(
  fs.readFileSync("D:/thanhnx/OpenCode/talung-cus-work/demo-ops/demo-secrets.json", "utf8")
);
// Mật khẩu local: dùng file demo-secrets.json, trừ khi biến môi trường chỉ định (DB local).
const LOCAL_PW = process.env.TEST_PASSWORD || "LocalTest@2026";
const pw = Object.fromEntries(
  secrets.accounts.map((a: any) => [a.username, process.env.TEST_PASSWORD ? LOCAL_PW : a.password])
);

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`[PASS] ${name}${detail ? " - " + detail : ""}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? " - " + detail : ""}`);
    console.log(`[FAIL] ${name}${detail ? " - " + detail : ""}`);
  }
}
const TAG = `[YC38-LOCK-TEST-${Date.now()}]`;
const created: string[] = [];

async function login(u: string) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: u, password: pw[u] }),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.token) throw new Error(`đăng nhập ${u} lỗi ${r.status}`);
  return j.token;
}
const H = (t: string) => ({ Authorization: `Bearer ${t}`, "Content-Type": "application/json" });

async function main() {
  console.log("=== YC-38 — Khóa nhiệm vụ đã nghiệm thu (F1–F5) ===\n");
  const leaderToken = await login("demold01");
  const staffToken = await login("democb01");
  const staff2Token = await login("democb02");
  const leader = await prisma.person.findFirst({ where: { code: "DEMO-LD-01" } });
  const staff = await prisma.person.findFirst({ where: { code: "DEMO-CB-01" } });
  const staff2 = await prisma.person.findFirst({ where: { code: "DEMO-CB-02" } });

  // Tạo + nghiệm thu 1 nhiệm vụ để dùng làm mẫu
  const title = `${TAG} nhiệm vụ đã nghiệm thu`;
  const c = await (
    await fetch(`${BASE}/api/tasks`, {
      method: "POST",
      headers: H(leaderToken),
      body: JSON.stringify({
        title,
        priority: "Cao",
        ownerId: staff.id,
        unitId: leader.assignments?.[0]?.unitId,
        currentDeadline: "2026-11-30T10:00:00.000Z",
        description: "test",
        assigneeIds: [staff2.id],
      }),
    })
  ).json();
  const taskId = c?.data?.id;
  check("0. Tạo nhiệm vụ (chủ trì + 1 phối hợp)", !!taskId, c?.data?.code || c?.error);
  if (!taskId) process.exit(1);
  created.push(taskId);

  await fetch(`${BASE}/api/tasks`, {
    method: "PATCH",
    headers: H(staffToken),
    body: JSON.stringify({ id: taskId, action: "ACCEPT_TASK" }),
  });
  // YC-09 Phase 1: collaborator báo phần việc trước khi owner nộp chung (S-ALL).
  await fetch(`${BASE}/api/tasks/${taskId}/participant-results`, {
    method: "POST",
    headers: H(staff2Token),
    body: JSON.stringify({
      action: "SUBMIT",
      partResultText: `${TAG} phần việc phối hợp`,
      partCompletedOn: "2026-10-23",
      partProgressPercent: 100,
    }),
  });
  // nộp duyệt (100% → submit)
  await fetch(`${BASE}/api/tasks/${taskId}/updates`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({ progressPercent: 100, notes: `${TAG} nộp duyệt`, submitForReview: true }),
  });
  // lãnh đạo nghiệm thu
  await fetch(`${BASE}/api/tasks`, {
    method: "PATCH",
    headers: H(leaderToken),
    body: JSON.stringify({ id: taskId, action: "CONFIRM_COMPLETION" }),
  });
  const t0 = await prisma.task.findUnique({ where: { id: taskId } });
  check("0. Nhiệm vụ mẫu đã nghiệm thu (COMPLETED)", t0?.status === "COMPLETED", t0?.status);

  const snap = async () => {
    const t = await prisma.task.findUnique({ where: { id: taskId } });
    const n = await prisma.taskUpdate.count({ where: { taskId } });
    return { status: t?.status, result: t?.actualResultText, updates: n };
  };
  const before = await snap();

  // ---------------------------------------------------------------- 1
  const r1 = await fetch(`${BASE}/api/tasks/${taskId}/updates`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({ progressPercent: 50, notes: `${TAG} mở lại`, newStatus: "IN_PROGRESS", statusAfter: "IN_PROGRESS" }),
  });
  check("1. COMPLETED → IN_PROGRESS: bị chặn", r1.status === 409, `HTTP ${r1.status}`);

  // ---------------------------------------------------------------- 2
  const r2 = await fetch(`${BASE}/api/tasks/${taskId}/updates`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({ progressPercent: 100, notes: `${TAG} nộp lại`, submitForReview: true }),
  });
  check("2. COMPLETED → WAITING_REVIEW: bị chặn", r2.status === 409, `HTTP ${r2.status}`);

  // ---------------------------------------------------------------- 3
  const r3 = await fetch(`${BASE}/api/tasks/${taskId}/updates`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({ progressPercent: 100, notes: `${TAG} ghi de`, newStatus: "COMPLETED", statusAfter: "COMPLETED" }),
  });
  const after3 = await snap();
  check("3. COMPLETED → COMPLETED: không ghi bản ghi mới", after3.updates === before.updates, `updates ${before.updates}→${after3.updates} (HTTP ${r3.status})`);

  // ---------------------------------------------------------------- 4
  const r4 = await fetch(`${BASE}/api/tasks/${taskId}/updates`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({ progressPercent: 100, notes: `${TAG} ghi de ket qua`, actualResultText: "KẾT QUẢ BỊ GHI ĐÈ" }),
  });
  const after4 = await snap();
  check(
    "4. Ghi đè actualResultText sau nghiệm thu: bị chặn",
    r4.status === 409 && after4.result === before.result,
    `HTTP ${r4.status}, result không đổi=${after4.result === before.result}`
  );

  // ---------------------------------------------------------------- 5
  const r5 = await fetch(`${BASE}/api/tasks`, {
    method: "PATCH",
    headers: H(staffToken),
    body: JSON.stringify({ id: taskId, action: "SUBMIT_COMPLETION", actualResultText: "x" }),
  });
  const after5 = await snap();
  check("5. SUBMIT_COMPLETION sau nghiệm thu: bị chặn", r5.status === 409 && after5.status === "COMPLETED", `HTTP ${r5.status}`);

  // ---------------------------------------------------------------- 6
  const r6 = await fetch(`${BASE}/api/tasks/${taskId}/deadline-request`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({ requestedDeadline: "2026-12-05T10:00:00.000Z", reason: "test" }),
  });
  check("6. Xin gia hạn sau nghiệm thu: bị chặn", r6.status === 409 || r6.status === 400, `HTTP ${r6.status}`);

  // ---------------------------------------------------------------- 7 & 8
  const after78 = await snap();
  check(
    "7. Người phối hợp không thay đổi được nhiệm vụ đã nghiệm thu",
    after78.status === "COMPLETED" && after78.updates === before.updates && after78.result === before.result
  );
  const r8 = await fetch(`${BASE}/api/tasks/${taskId}/updates`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({ progressPercent: 10, notes: `${TAG} chu tri tu mo` }),
  });
  const after8 = await snap();
  check("8. Người chủ trì cũng không tự mở lại được", r8.status === 409 && after8.status === "COMPLETED", `HTTP ${r8.status}`);

  // ---------------------------------------------------------------- 9
  const r9 = await fetch(`${BASE}/api/tasks/${taskId}`, {
    method: "PATCH",
    headers: H(leaderToken),
    body: JSON.stringify({ title: `${TAG} sửa tiêu đề`, status: "IN_PROGRESS" }),
  });
  const after9 = await snap();
  check(
    "9. Lãnh đạo không ghi đè kết quả đã duyệt qua API thường",
    r9.status >= 400 && after9.status === "COMPLETED" && after9.result === before.result,
    `HTTP ${r9.status}`
  );

  // ---------------------------------------------------------------- 10 (UI tĩnh)
  const myWork = fs.readFileSync("D:/thanhnx/OpenCode/talung-cus-work/src/app/my-work/page.tsx", "utf8");
  const tasksPage = fs.readFileSync("D:/thanhnx/OpenCode/talung-cus-work/src/app/tasks/page.tsx", "utf8");
  check(
    "10. UI khóa thao tác ở trạng thái kết thúc",
    myWork.includes("isTaskTerminal") && tasksPage.includes("isTaskTerminal"),
    "my-work + tasks: isTaskTerminal"
  );

  // ---------------------------------------------------------------- 11 (kiểm tra lại lúc ghi)
  const apiSrc = fs.readFileSync(
    "D:/thanhnx/OpenCode/talung-cus-work/src/app/api/tasks/[id]/updates/route.ts",
    "utf8"
  );
  check(
    "11. API kiểm tra lại trạng thái NGAY LÚC GHI (trong transaction, sau khoá)",
    apiSrc.includes("isTerminalTaskStatus(fresh.status)") && apiSrc.includes("task-status:"),
    "đọc lại trạng thái sau advisoryLock"
  );

  // ---------------------------------------------------------------- 12 (luồng hợp lệ vẫn chạy)
  const t12 = await (
    await fetch(`${BASE}/api/tasks`, {
      method: "POST",
      headers: H(leaderToken),
      body: JSON.stringify({
        title: `${TAG} luong hop le`,
        priority: "Cao",
        ownerId: staff.id,
        unitId: leader.assignments?.[0]?.unitId,
        currentDeadline: "2026-11-30T10:00:00.000Z",
        description: "test",
      }),
    })
  ).json();
  const id12 = t12?.data?.id;
  created.push(id12);
  await fetch(`${BASE}/api/tasks`, {
    method: "PATCH",
    headers: H(staffToken),
    body: JSON.stringify({ id: id12, action: "ACCEPT_TASK" }),
  });
  const s12 = await fetch(`${BASE}/api/tasks/${id12}/updates`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({ progressPercent: 100, notes: `${TAG} nộp`, submitForReview: true }),
  });
  const a12 = await fetch(`${BASE}/api/tasks`, {
    method: "PATCH",
    headers: H(leaderToken),
    body: JSON.stringify({ id: id12, action: "CONFIRM_COMPLETION" }),
  });
  const st12 = await prisma.task.findUnique({ where: { id: id12 } });
  check("12. Luồng đang thực hiện → nộp duyệt → lãnh đạo duyệt vẫn chạy", st12?.status === "COMPLETED", `HTTP ${s12.status}/${a12.status} → ${st12?.status}`);

  // ---------------------------------------------------------------- 13 (trả lại trước nghiệm thu)
  const t13 = await (
    await fetch(`${BASE}/api/tasks`, {
      method: "POST",
      headers: H(leaderToken),
      body: JSON.stringify({
        title: `${TAG} luong tra lai`,
        priority: "Cao",
        ownerId: staff.id,
        unitId: leader.assignments?.[0]?.unitId,
        currentDeadline: "2026-11-30T10:00:00.000Z",
        description: "test",
      }),
    })
  ).json();
  const id13 = t13?.data?.id;
  created.push(id13);
  await fetch(`${BASE}/api/tasks`, {
    method: "PATCH",
    headers: H(staffToken),
    body: JSON.stringify({ id: id13, action: "ACCEPT_TASK" }),
  });
  await fetch(`${BASE}/api/tasks/${id13}/updates`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({ progressPercent: 100, notes: `${TAG} nộp`, submitForReview: true }),
  });
  const ret = await fetch(`${BASE}/api/tasks/${id13}`, {
    method: "PATCH",
    headers: H(leaderToken),
    body: JSON.stringify({ status: "IN_PROGRESS", notes: "Yêu cầu bổ sung" }),
  });
  const st13 = await prisma.task.findUnique({ where: { id: id13 } });
  const re13 = await fetch(`${BASE}/api/tasks/${id13}/updates`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({ progressPercent: 100, notes: `${TAG} trình lại`, submitForReview: true }),
  });
  const st13b = await prisma.task.findUnique({ where: { id: id13 } });
  check(
    "13. Luồng trả lại trước nghiệm thu vẫn hoạt động",
    ret.status < 400 && st13?.status === "IN_PROGRESS" && re13.status === 201 && st13b?.status === "WAITING_REVIEW",
    `trả lại HTTP ${ret.status} → ${st13?.status}; trình lại HTTP ${re13.status} → ${st13b?.status}`
  );

  console.log(`\n=== KẾT QUẢ: ${passed} pass / ${failed} fail ===`);
  if (failures.length) failures.forEach((f) => console.log("  - " + f));
  process.exit(failed === 0 ? 0 : 1);
}

main()
  .catch(async (e) => {
    console.error(e);
    for (const id of created) {
      try {
        await prisma.taskUpdate.deleteMany({ where: { taskId: id } });
        await prisma.task.deleteMany({ where: { id } });
      } catch {}
    }
    await prisma.$disconnect();
    process.exit(1);
  })
  .finally(async () => {
    for (const id of created) {
      try {
        await prisma.taskUpdate.deleteMany({ where: { taskId: id } });
        await prisma.task.deleteMany({ where: { id } });
      } catch {}
    }
    await prisma.$disconnect();
  });
