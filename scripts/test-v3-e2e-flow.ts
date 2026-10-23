/**
 * test-v3-e2e-flow.ts — KỊCH BẢN END-TO-END V3 (môi trường demo local).
 *
 *   $env:DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/talung_v3_demo"
 *   $env:DIRECT_URL=$env:DATABASE_URL
 *   $env:TEST_BASE_URL="http://localhost:3100"
 *   npx tsx scripts/test-v3-e2e-flow.ts
 *
 * Phủ đúng 10 hạng mục kiểm thử bắt buộc:
 *  1. Công chức lập kế hoạch từ danh mục TX (348 mục)
 *  2. Tìm & gắn nhiều SP QĐ1277
 *  3. Công chức thực hiện và báo kết quả
 *  4. Lãnh đạo nhận, trả lại, xác nhận
 *  5. Lãnh đạo xem lại được hồ sơ đã duyệt (lịch sử)
 *  6. Kết quả đã xác nhận liên thông sang kết quả tháng (bản nháp → hồ sơ, không ghi trùng)
 *  7. Điểm dự thảo / SP thiếu hệ số / chống trùng
 *  8. Công việc không có SP
 *  9. Sai vai trò, khóa sau nghiệm thu, API trực tiếp
 * 10. Không phá luồng V1/V2 (hồi quy riêng) + F16/F17
 */
import { createRequire } from "node:module";
import { assertLocalTestDatabase } from "./lib/test-db-safety";
const req = createRequire(import.meta.url);
const { PrismaClient } = req("@prisma/client");
const dbUrl = assertLocalTestDatabase(
  process.env.DIRECT_URL || process.env.DATABASE_URL || "",
  "test-v3-e2e-flow"
);
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const BASE = process.env.TEST_BASE_URL || "http://localhost:3100";
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
async function login(u: string) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: u, password: PASSWORD }),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.token) throw new Error("dang nhap " + u + " loi " + r.status);
  return j.token;
}
const H = (t: string) => ({ Authorization: "Bearer " + t, "Content-Type": "application/json" });

const created: { itemIds: string[]; resultIds: string[]; spIds: string[] } = { itemIds: [], resultIds: [], spIds: [] };

async function main() {
  console.log("=== KỊCH BẢN END-TO-END V3 (demo local) ===\n");
  const staffToken = await login("democb01");
  const leaderToken = await login("demold01");
  const otherToken = await login("democb02");
  const staff = await prisma.person.findFirst({ where: { code: "DEMO-CB-01" } });
  const period = await prisma.reportingPeriod.findFirst({ where: { type: "MONTH", title: { contains: "10/2026" } } });

  /* ---------- F16/F17: tìm kiếm + danh mục TX ---------- */
  console.log("--- F16/F17 ---");
  const p1 = await fetch(`${BASE}/api/products?search=kiem%20tra&pageSize=5`, { headers: H(staffToken) });
  const p2 = await fetch(`${BASE}/api/products?search=ki%E1%BB%83m%20tra&pageSize=5`, { headers: H(staffToken) });
  const j1 = await p1.json().catch(() => ({}));
  const j2 = await p2.json().catch(() => ({}));
  check("F16. Tìm SP không dấu (3.386 SP) hoạt động", p1.status === 200 && (j1.data || []).length > 0, `${(j1.data || []).length} kết quả`);
  check("F16. Tìm SP có dấu cho kết quả tương đương", p2.status === 200 && (j2.data || []).length > 0, `${(j2.data || []).length} kết quả`);
  check("F16. Không lộ lỗi SQL/Prisma ra giao diện", !j1.error, String(j1.error || "-"));

  const cat = await fetch(`${BASE}/api/work-catalog`, { headers: H(staffToken) });
  const cj = await cat.json().catch(() => ({}));
  const cd = cj.data || {};
  check("F17. Danh mục TX tải được đủ 348 mục", (cd.entries || []).length === 348, `${(cd.entries || []).length} mục`);
  check("F17. Trạng thái kích hoạt = ACTIVATED", cd.activation?.status === "ACTIVATED", String(cd.activation?.status));
  check("F17. 48 mẫu cũ không thay thế nguồn TX", cd.legacyTemplatesSelectable === false);
  const txEntry = (cd.entries || [])[0];
  check("F17. Có mã TX để lập kế hoạch", !!txEntry?.code, String(txEntry?.code));

  /* ---------- 1. Lập kế hoạch từ danh mục TX ---------- */
  console.log("\n--- 1. Lập kế hoạch từ danh mục TX ---");
  const createRes = await fetch(`${BASE}/api/personal-work-items`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({
      periodId: period.id,
      catalogEntryId: txEntry.id,
      title: "[V3-E2E] " + String(txEntry.title).slice(0, 40),
      dueDate: "2026-10-30",
      priority: "Cao",
      expectedResult: "Hoàn thành theo danh mục TX",
      status: "NOT_STARTED",
    }),
  });
  const cj2 = await createRes.json().catch(() => ({}));
  const itemId = cj2?.data?.id;
  created.itemIds.push(itemId);
  check("1. Tạo được đầu việc từ danh mục TX", createRes.status === 201 && !!itemId, `HTTP ${createRes.status}`);
  if (!itemId) return;
  const item0 = await prisma.personalWorkItem.findUnique({ where: { id: itemId } });
  check("1. Đầu việc gắn đúng mã TX + nguồn TX_CATALOG", item0?.catalogEntryId === txEntry.id && item0?.sourceKind === "TX_CATALOG", `source=${item0?.sourceKind}`);

  /* ---------- 2. Gắn nhiều SP QĐ1277 ---------- */
  console.log("\n--- 2. Gắn nhiều SP QĐ1277 ---");
  const version = await prisma.productCatalogVersion.findFirst({ where: { status: "ACTIVE" } });
  const products = await prisma.productItem.findMany({ where: { versionId: version.id, status: "ACTIVE" }, take: 3, orderBy: { code: "asc" } });
  const spIds: string[] = [];
  for (const p of products) {
    const res = await fetch(`${BASE}/api/work-item-products`, {
      method: "POST",
      headers: H(staffToken),
      body: JSON.stringify({ workItemId: itemId, productItemId: p.id, quantity: 5, quantityUnit: "bộ" }),
    });
    const j = await res.json().catch(() => ({}));
    if (j?.data?.id) spIds.push(j.data.id);
  }
  created.spIds.push(...spIds);
  check("2. Gắn được 3 mã SP trên 1 công việc", spIds.length === 3, `${spIds.length}/3 SP`);
  const spList = await fetch(`${BASE}/api/work-item-products?workItemId=${itemId}`, { headers: H(staffToken) });
  const slj = await spList.json().catch(() => ({}));
  check("2. Mỗi SP chờ lãnh đạo xác nhận", (slj.data || []).every((x: any) => x.reviewState === "PROPOSED"));

  /* ---------- 3. Công chức báo kết quả ---------- */
  console.log("\n--- 3. Công chức báo kết quả ---");
  const noText = await fetch(`${BASE}/api/personal-work-items/${itemId}/review`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({ action: "SUBMIT", resultText: "", completedOn: "2026-10-22" }),
  });
  check("3. Thiếu nội dung kết quả ⇒ 400", noText.status === 400, `HTTP ${noText.status}`);
  const submit = await fetch(`${BASE}/api/personal-work-items/${itemId}/review`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({ action: "SUBMIT", resultText: "Đã hoàn thành công việc theo danh mục TX, có biên bản kèm theo.", completedOn: "2026-10-22" }),
  });
  check("3. Gửi lên lãnh đạo ⇒ 200", submit.status === 200, `HTTP ${submit.status}`);

  /* ---------- 4. Lãnh đạo nhận, trả lại, xác nhận ---------- */
  console.log("\n--- 4. Lãnh đạo xử lý ---");
  const queue = await fetch(`${BASE}/api/personal-work-items/review-queue?status=pending`, { headers: H(leaderToken) });
  const qj = await queue.json().catch(() => ({}));
  check("4. Hồ sơ xuất hiện trong hàng đợi của lãnh đạo", (qj.data || []).some((x: any) => x.id === itemId));

  const otherQueue = await fetch(`${BASE}/api/personal-work-items/review-queue?status=pending`, { headers: H(otherToken) });
  const oqj = await otherQueue.json().catch(() => ({}));
  check("9. Người không phải lãnh đạo trực tiếp không thấy hồ sơ", !(oqj.data || []).some((x: any) => x.id === itemId));

  const otherConfirm = await fetch(`${BASE}/api/personal-work-items/${itemId}/review`, {
    method: "POST",
    headers: H(otherToken),
    body: JSON.stringify({ action: "CONFIRM" }),
  });
  check("9. Người sai vai trò không xác nhận được ⇒ 403", otherConfirm.status === 403, `HTTP ${otherConfirm.status}`);

  const ret = await fetch(`${BASE}/api/personal-work-items/${itemId}/review`, {
    method: "POST",
    headers: H(leaderToken),
    body: JSON.stringify({ action: "RETURN", note: "Bổ sung biên bản và số hiệu văn bản." }),
  });
  check("4. Trả lại ⇒ 200", ret.status === 200, `HTTP ${ret.status}`);
  const resubmit = await fetch(`${BASE}/api/personal-work-items/${itemId}/review`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({ action: "SUBMIT", resultText: "Đã hoàn thành, bổ sung biên bản và số hiệu văn bản theo yêu cầu.", completedOn: "2026-10-22" }),
  });
  check("4. Cán bộ sửa & gửi lại ⇒ 200", resubmit.status === 200, `HTTP ${resubmit.status}`);

  // Lãnh đạo xác nhận từng SP
  for (let i = 0; i < spIds.length - 1; i++) {
    const c = await fetch(`${BASE}/api/work-item-products/${spIds[i]}`, {
      method: "PATCH",
      headers: H(leaderToken),
      body: JSON.stringify({ action: "CONFIRM" }),
    });
    check(`4. Xác nhận SP ${i + 1} ⇒ 200`, c.status === 200, `HTTP ${c.status}`);
  }
  const spAfter = await fetch(`${BASE}/api/work-item-products?workItemId=${itemId}`, { headers: H(leaderToken) });
  const sa = await spAfter.json().catch(() => ({}));
  const states = (sa.data || []).map((x: any) => x.reviewState);
  check("7. Xác nhận SP1 KHÔNG tự xác nhận SP còn lại", states.filter((s) => s === "CONFIRMED").length === 2, states.join("/"));

  const conf = await fetch(`${BASE}/api/personal-work-items/${itemId}/review`, {
    method: "POST",
    headers: H(leaderToken),
    body: JSON.stringify({ action: "CONFIRM" }),
  });
  check("4. Lãnh đạo xác nhận công việc ⇒ 200", conf.status === 200, `HTTP ${conf.status}`);

  /* ---------- 5. Lãnh đạo xem lại hồ sơ đã duyệt ---------- */
  console.log("\n--- 5. Lịch sử phê duyệt ---");
  const hist = await fetch(`${BASE}/api/personal-work-items/review-queue?status=confirmed`, { headers: H(leaderToken) });
  const hj = await hist.json().catch(() => ({}));
  const mine = (hj.data || []).find((x: any) => x.id === itemId);
  check("5. Lãnh đạo tìm lại được hồ sơ đã xác nhận", !!mine, `${(hj.data || []).length} hồ sơ đã duyệt`);
  const acts = (mine?.history || []).map((h: any) => h.action);
  check("5. Lịch sử đủ chuỗi gửi → trả lại → gửi lại → xác nhận", acts.includes("SUBMITTED") && acts.includes("RETURNED") && acts.includes("CONFIRMED"), acts.join(" → "));
  const histAll = await fetch(`${BASE}/api/personal-work-items/review-queue?status=all`, { headers: H(leaderToken) });
  const ha = await histAll.json().catch(() => ({}));
  check("5. Tab 'Tất cả / Lịch sử' trả về hồ sơ đã xử lý", (ha.data || []).some((x: any) => x.id === itemId));
  const histOther = await fetch(`${BASE}/api/personal-work-items/review-queue?status=all`, { headers: H(otherToken) });
  const ho = await histOther.json().catch(() => ({}));
  check("9. Lịch sử không lộ hồ sơ ngoài phạm vi quản lý", !(ho.data || []).some((x: any) => x.id === itemId));

  /* ---------- 6. Liên thông sang kết quả tháng ---------- */
  console.log("\n--- 6. Liên thông kết quả tháng ---");
  const mr0 = await fetch(`${BASE}/api/monthly-results?year=2026&month=10`, { headers: H(staffToken) });
  const mj0 = await mr0.json().catch(() => ({}));
  const draft = (mj0.drafts || []).find((d: any) => d.id === itemId);
  check("6. Công việc đã xác nhận xuất hiện ở BẢN NHÁP kết quả tháng", !!draft, `${(mj0.drafts || []).length} bản nháp`);
  check("6. Bản nháp ghi rõ số SP đã xác nhận", draft?.spConfirmed === 2 && draft?.spTotal === 3, `${draft?.spConfirmed}/${draft?.spTotal}`);

  const mrCreate = await fetch(`${BASE}/api/monthly-results`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({
      personId: staff.id,
      periodYear: 2026,
      periodMonth: 10,
      title: "[V3-E2E] kết quả tháng",
      workItemId: itemId,
      productItemId: products[0].id,
      assignedQty: 5,
      completedQty: 5,
      completedDate: "2026-10-22T00:00:00.000Z",
    }),
  });
  check("6. Tạo được hồ sơ kết quả tháng", mrCreate.status === 200 || mrCreate.status === 201, `HTTP ${mrCreate.status}`);
  const row = await prisma.monthlyWorkResult.findFirst({ where: { workItemId: itemId } });
  if (row) created.resultIds.push(row.id);
  check("6. Chỉ MỘT hồ sơ kết quả cho một công việc (không ghi trùng)", (await prisma.monthlyWorkResult.count({ where: { workItemId: itemId } })) === 1);

  const mr1 = await fetch(`${BASE}/api/monthly-results?year=2026&month=10`, { headers: H(staffToken) });
  const mj1 = await mr1.json().catch(() => ({}));
  const myRow = (mj1.data || []).find((r: any) => r.workItemId === itemId);
  check("7. Dòng có nhãn trạng thái (SP chưa duyệt ⇒ chưa đủ điều kiện chính thức)", myRow?.officialState === "SP_PENDING" && myRow?.officialReady === false, `state=${myRow?.officialState}`);
  check("6. Bản nháp biến mất sau khi đã có hồ sơ kết quả", !(mj1.drafts || []).some((d: any) => d.id === itemId));

  const dup = await fetch(`${BASE}/api/monthly-results`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({ personId: staff.id, periodYear: 2026, periodMonth: 10, title: "trùng", workItemId: itemId }),
  });
  check("6. Ghi trùng kết quả tháng bị chặn", dup.status === 200 || dup.status === 201 || dup.status === 409, `HTTP ${dup.status}`);
  check("6. Vẫn chỉ 1 hồ sơ sau khi thử ghi trùng", (await prisma.monthlyWorkResult.count({ where: { workItemId: itemId } })) === 1);

  /* ---------- 9. Khóa sau nghiệm thu ---------- */
  console.log("\n--- 9. Khóa sau nghiệm thu ---");
  const lockPatch = await fetch(`${BASE}/api/personal-work-items`, {
    method: "PATCH",
    headers: H(staffToken),
    body: JSON.stringify({ id: itemId, title: "sửa sau khi xác nhận" }),
  });
  check("9. Không sửa được sau khi lãnh đạo xác nhận ⇒ 409", lockPatch.status === 409, `HTTP ${lockPatch.status}`);
  const lockEv = await fetch(`${BASE}/api/work-evidence`, {
    method: "POST",
    headers: { Authorization: "Bearer " + staffToken },
    body: (() => {
      const fd = new FormData();
      fd.set("workItemId", itemId);
      fd.set("file", new Blob(["x"], { type: "text/plain" }), "x.txt");
      return fd;
    })(),
  });
  check("9. Không thêm minh chứng sau khi xác nhận ⇒ 409", lockEv.status === 409, `HTTP ${lockEv.status}`);

  /* ---------- 8. Công việc không có SP ---------- */
  console.log("\n--- 8. Công việc không có SP ---");
  const noSp = await fetch(`${BASE}/api/personal-work-items`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({ personId: staff.id, periodId: period.id, title: "[V3-E2E] công việc không gắn SP", status: "IN_PROGRESS" }),
  });
  const nj = await noSp.json().catch(() => ({}));
  const noSpId = nj?.data?.id;
  created.itemIds.push(noSpId);
  check("8. Tạo được công việc không có SP", noSp.status === 201 && !!noSpId, `HTTP ${noSp.status}`);
  if (noSpId) {
    const sub = await fetch(`${BASE}/api/personal-work-items/${noSpId}/review`, {
      method: "POST",
      headers: H(staffToken),
      body: JSON.stringify({ action: "SUBMIT", resultText: "Xong rồi, không gắn sản phẩm.", completedOn: "2026-10-22" }),
    });
    check("8. Vẫn gửi & xác nhận được khi không có SP (chờ đối chiếu)", sub.status === 200, `HTTP ${sub.status}`);
    const cf = await fetch(`${BASE}/api/personal-work-items/${noSpId}/review`, {
      method: "POST",
      headers: H(leaderToken),
      body: JSON.stringify({ action: "CONFIRM" }),
    });
    check("8. Lãnh đạo xác nhận được công việc không SP", cf.status === 200, `HTTP ${cf.status}`);
    const mr2 = await fetch(`${BASE}/api/monthly-results?year=2026&month=10`, { headers: H(staffToken) });
    const mj2 = await mr2.json().catch(() => ({}));
    const noSpRow = (mj2.data || []).find((r: any) => r.workItemId === noSpId);
    check("8. Công việc không SP không được tính điểm chính thức", !noSpRow || noSpRow.officialReady === false, `state=${noSpRow?.officialState}`);
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
  await prisma.$disconnect();
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await cleanup(); });
