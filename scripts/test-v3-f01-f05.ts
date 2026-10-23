/**
 * test-v3-f01-f05.ts — Đợt sửa lỗi UAT: F01 (bỏ đường hoàn thành bypass) + F05 (tương phản nút).
 *
 *   $env:DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/talung_v3_demo"
 *   $env:DIRECT_URL=$env:DATABASE_URL
 *   $env:TEST_BASE_URL="http://localhost:3100"
 *   npx tsx scripts/test-v3-f01-f05.ts
 */
import fs from "fs";
import path from "path";
import { createRequire } from "node:module";
import { assertLocalTestDatabase } from "./lib/test-db-safety";
const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");
const dbUrl = assertLocalTestDatabase(
  process.env.DIRECT_URL || process.env.DATABASE_URL || "",
  "test-v3-f01-f05"
);
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const BASE = process.env.TEST_BASE_URL || "http://localhost:3100";
const REPO = path.resolve(".") + path.sep;
const PASSWORD = process.env.V3_DEMO_PASSWORD || "LocalTest@2026";

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

const created: { itemIds: string[]; taskIds: string[]; resultIds: string[] } = { itemIds: [], taskIds: [], resultIds: [] };

async function main() {
  console.log("=== ĐỢT SỬA LỖI UAT — F01 (luồng hoàn thành) + F05 (tương phản nút) ===\n");

  const staffToken = await login("democb01");
  const leaderToken = await login("demold01");
  const staff = await prisma.person.findFirst({ where: { code: "DEMO-CB-01" } });
  const period = await prisma.reportingPeriod.findFirst({ where: { type: "MONTH", title: { contains: "10/2026" } } });
  if (!staff || !period) return;

  /* ================= F05 — nền/chữ của nút chính ================= */
  console.log("--- F05 ---");
  const tw = fs.readFileSync(REPO + "tailwind.config.ts", "utf8");
  check("F05.1 Theme có token 'status-primary' (nguyên nhân gốc: thiếu token ⇒ nền không sinh)", /"status-primary":\s*"#001d36"/.test(tw));
  const box = fs.readFileSync(REPO + "src/app/my-work/WorkItemReviewBox.tsx", "utf8");
  check("F05.2 Nút chính dùng nền đặc + chữ tương phản", /bg-status-primary[^\"]*text-on-primary/.test(box), "bg-status-primary + text-on-primary");
  check("F05.3 Nút gửi trong hộp thoại cũng dùng cặp màu đúng", (box.match(/bg-status-primary/g) || []).length >= 2, `${(box.match(/bg-status-primary/g) || []).length} chỗ`);
  check("F05.4 Có trạng thái focus rõ ràng cho bàn phím", /focus-visible:ring/.test(box) || /focus-visible:outline/.test(box));
  const cssFiles = fs.existsSync(REPO + ".next") ? fs.readdirSync(REPO + ".next", { recursive: true }) : [];
  let cssFound = false;
  for (const f of cssFiles) {
    if (typeof f === "string" && f.endsWith(".css")) {
      const c = fs.readFileSync(REPO + ".next/" + f, "utf8");
      if (/\.bg-status-primary\{/.test(c) && /\.text-on-primary\{/.test(c)) { cssFound = true; break; }
    }
  }
  check("F05.5 CSS build đã sinh class nền/chữ của nút", cssFound);

  /* ================= F01 — đường hoàn thành ================= */
  console.log("\n--- F01 ---");
  const createRes = await fetch(`${BASE}/api/personal-work-items`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({ personId: staff.id, periodId: period.id, title: "[V3-F01] công việc tự ghi nhận", status: "IN_PROGRESS" }),
  });
  const createJson = await createRes.json().catch(() => ({}));
  const itemId = createJson?.data?.id;
  created.itemIds.push(itemId);
  check("F01.1 Tạo được công việc tự ghi nhận", createRes.status === 201 && !!itemId, `HTTP ${createRes.status}`);
  if (!itemId) return;

  const patchCompleted = await fetch(`${BASE}/api/personal-work-items`, {
    method: "PATCH",
    headers: H(staffToken),
    body: JSON.stringify({ id: itemId, completedDate: "2026-10-21T00:00:00.000Z" }),
  });
  check("F01.2 Gán ngày hoàn thành trực tiếp cho công việc tự ghi nhận ⇒ 409", patchCompleted.status === 409, `HTTP ${patchCompleted.status}`);
  const patchStatus = await fetch(`${BASE}/api/personal-work-items`, {
    method: "PATCH",
    headers: H(staffToken),
    body: JSON.stringify({ id: itemId, status: "COMPLETED" }),
  });
  check("F01.3 Đặt trạng thái COMPLETED trực tiếp ⇒ 409", patchStatus.status === 409, `HTTP ${patchStatus.status}`);

  const afterAttempts = await prisma.personalWorkItem.findUnique({ where: { id: itemId } });
  check("F01.4 Ngày hoàn thành KHÔNG bị gán (không tự xác nhận nghiệp vụ)", afterAttempts?.completedDate === null, String(afterAttempts?.completedDate));

  const patchTitle = await fetch(`${BASE}/api/personal-work-items`, {
    method: "PATCH",
    headers: H(staffToken),
    body: JSON.stringify({ id: itemId, title: "[V3-F01] đã sửa tiêu đề" }),
  });
  check("F01.5 Sửa nội dung khác vẫn bình thường (200)", patchTitle.status === 200, `HTTP ${patchTitle.status}`);

  // Luồng V1/V2: công việc gắn nhiệm vụ vẫn đánh dấu hoàn thành được
  const taskRes = await fetch(`${BASE}/api/tasks`, {
    method: "POST",
    headers: H(leaderToken),
    body: JSON.stringify({
      title: "[V3-F01] nhiệm vụ để kiểm tra tương thích V1/V2",
      description: "kiểm tra luồng nhiệm vụ",
      ownerId: staff.id,
      assigneeIds: [staff.id],
      currentDeadline: "2026-10-30T10:00:00.000Z",
    }),
  });
  const taskJson = await taskRes.json().catch(() => ({}));
  const taskId = taskJson?.data?.id;
  created.taskIds.push(taskId);
  check("F01.6 Tạo được nhiệm vụ để kiểm tra tương thích", taskRes.status < 300 && !!taskId, `HTTP ${taskRes.status}`);
  if (taskId) {
    const create2 = await fetch(`${BASE}/api/personal-work-items`, {
      method: "POST",
      headers: H(staffToken),
      body: JSON.stringify({ personId: staff.id, periodId: period.id, title: "[V3-F01] công việc có nhiệm vụ", taskId }),
    });
    const cj2 = await create2.json().catch(() => ({}));
    const item2 = cj2?.data?.id;
    created.itemIds.push(item2);
    check("F01.7 Tạo được công việc gắn nhiệm vụ", create2.status === 201 && !!item2, `HTTP ${create2.status}`);
    if (item2) {
      const patchTaskItem = await fetch(`${BASE}/api/personal-work-items`, {
        method: "PATCH",
        headers: H(staffToken),
        body: JSON.stringify({ id: item2, completedDate: "2026-10-21T00:00:00.000Z" }),
      });
      check("F01.8 Luồng nhiệm vụ V1/V2: đánh dấu hoàn thành VẪN được (200)", patchTaskItem.status === 200, `HTTP ${patchTaskItem.status}`);
    }
  }

  // Giao diện: nút cũ chỉ còn cho công việc gắn nhiệm vụ
  const src = fs.readFileSync(REPO + "src/app/my-work/MyWorkItemsSection.tsx", "utf8");
  check(
    "F01.9 Giao diện: nút đánh dấu hoàn thành chỉ hiện cho công việc gắn nhiệm vụ",
    /!!item\.taskId && \(item\.reviewState \|\| "DRAFT"\) === "DRAFT"/.test(src),
    "điều kiện !!item.taskId && reviewState === DRAFT"
  );

  // Khoá khi đang chờ duyệt / đã xác nhận
  const submit = await fetch(`${BASE}/api/personal-work-items/${itemId}/review`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({ action: "SUBMIT", resultText: "Đã rà soát hồ sơ, xin lãnh đạo xác nhận.", completedOn: "2026-10-21" }),
  });
  check("F01.10 Gửi lãnh đạo ⇒ 200", submit.status === 200, `HTTP ${submit.status}`);
  const patchWaiting = await fetch(`${BASE}/api/personal-work-items`, {
    method: "PATCH",
    headers: H(staffToken),
    body: JSON.stringify({ id: itemId, completedDate: "2026-10-22T00:00:00.000Z" }),
  });
  check("F01.11 Khi đang chờ xác nhận ⇒ không sửa được ngày hoàn thành (409)", patchWaiting.status === 409, `HTTP ${patchWaiting.status}`);

  const confirm = await fetch(`${BASE}/api/personal-work-items/${itemId}/review`, {
    method: "POST",
    headers: H(leaderToken),
    body: JSON.stringify({ action: "CONFIRM" }),
  });
  check("F01.12 Lãnh đạo xác nhận ⇒ 200", confirm.status === 200, `HTTP ${confirm.status}`);
  const patchConfirmed = await fetch(`${BASE}/api/personal-work-items`, {
    method: "PATCH",
    headers: H(staffToken),
    body: JSON.stringify({ id: itemId, completedDate: null }),
  });
  check("F01.13 Sau khi xác nhận ⇒ không bỏ hoàn thành được (409)", patchConfirmed.status === 409, `HTTP ${patchConfirmed.status}`);
  const patchTitle2 = await fetch(`${BASE}/api/personal-work-items`, {
    method: "PATCH",
    headers: H(staffToken),
    body: JSON.stringify({ id: itemId, title: "[V3-F01] cố sửa sau khi xác nhận" }),
  });
  check("F01.14 Sau khi xác nhận ⇒ không sửa được nội dung (409)", patchTitle2.status === 409, `HTTP ${patchTitle2.status}`);

  // Kết quả tháng: công việc chưa xác nhận ⇒ đánh dấu "chờ đối chiếu"
  const version = await prisma.productCatalogVersion.findFirst({ where: { status: "ACTIVE" } });
  const anyProduct = version
    ? await prisma.productItem.findFirst({ where: { versionId: version.id, status: "ACTIVE" } })
    : null;
  const mrRes = await fetch(`${BASE}/api/monthly-results`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({
      personId: staff.id,
      periodYear: 2026,
      periodMonth: 10,
      title: "[V3-F01] kết quả tháng",
      workItemId: itemId,
      productItemId: anyProduct?.id,
      completedQty: 1,
      completedDate: "2026-10-21T00:00:00.000Z",
    }),
  });
  const mrJson = await mrRes.json().catch(() => ({}));
  const row = await prisma.monthlyWorkResult.findFirst({ where: { workItemId: itemId } });
  if (row) created.resultIds.push(row.id);
  check("F01.15 Tạo được kết quả tháng", mrRes.status === 200 || mrRes.status === 201, `HTTP ${mrRes.status}`);
  check(
    "F01.16 Kết quả tháng gắn công việc đã xác nhận ⇒ KHÔNG 'chờ đối chiếu'",
    row?.needsReview === false,
    `needsReview=${row?.needsReview}`
  );

  const item3Res = await fetch(`${BASE}/api/personal-work-items`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({ personId: staff.id, periodId: period.id, title: "[V3-F01] công việc chưa xác nhận" }),
  });
  const item3Json = await item3Res.json().catch(() => ({}));
  const item3 = item3Json?.data?.id;
  created.itemIds.push(item3);
  if (item3) {
    await fetch(`${BASE}/api/monthly-results`, {
      method: "POST",
      headers: H(staffToken),
      body: JSON.stringify({
        personId: staff.id,
        periodYear: 2026,
        periodMonth: 10,
        title: "[V3-F01] kết quả tháng chưa xác nhận",
        workItemId: item3,
      }),
    });
    const row3 = await prisma.monthlyWorkResult.findFirst({ where: { workItemId: item3 } });
    if (row3) created.resultIds.push(row3.id);
    check(
      "F01.17 Kết quả tháng gắn công việc CHƯA xác nhận ⇒ 'chờ đối chiếu' (needsReview)",
      row3?.needsReview === true,
      `needsReview=${row3?.needsReview}`
    );
  }

  console.log(`\n=== KẾT QUẢ: ${passed} pass / ${failed} fail ===`);
  if (failures.length) failures.forEach((f) => console.log("  - " + f));
  process.exitCode = failed === 0 ? 0 : 1;
}

async function cleanup() {
  for (const id of created.resultIds) {
    try { await prisma.monthlyWorkResult.delete({ where: { id } }); } catch {}
  }
  for (const id of created.itemIds) {
    try {
      await prisma.workItemReview.deleteMany({ where: { workItemId: id } });
      await prisma.workItemProduct.deleteMany({ where: { workItemId: id } });
      await prisma.monthlyWorkResult.deleteMany({ where: { workItemId: id } });
      await prisma.personalWorkItem.delete({ where: { id } });
    } catch {}
  }
  for (const id of created.taskIds) {
    try {
      await prisma.taskUpdate.deleteMany({ where: { taskId: id } });
      await prisma.task.delete({ where: { id } });
    } catch {}
  }
  await prisma.$disconnect();
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await cleanup(); });
