/**
 * test-v3-multi-product.ts — V3.0.2/0.3: nhiều sản phẩm QĐ1277 trên một công việc,
 * xác nhận từng SP độc lập, SP chưa xác nhận không đủ điều kiện tính điểm chính thức,
 * chống ghi trùng, khoá khi đã gửi/đã xác nhận (Q-B4/A-1..A-4).
 */
import { createRequire } from "node:module";
const require = createRequire("D:/thanhnx/OpenCode/talung-cus-work/package.json");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });

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

const created: { itemId?: string; spIds: string[] } = { spIds: [] };

async function main() {
  console.log("=== V3.0.2/0.3 — NHIỀU SẢN PHẨM QĐ1277 & KẾT QUẢ THÁNG DỰ THẢO ===\n");

  const staffToken = await login("democb01");
  const leaderToken = await login("demold01");
  const otherToken = await login("democb02");

  const staff = await prisma.person.findFirst({ where: { code: "DEMO-CB-01" } });
  const period = await prisma.reportingPeriod.findFirst({ where: { type: "MONTH", title: { contains: "10/2026" } } });
  const version = await prisma.productCatalogVersion.findFirst({ where: { status: "ACTIVE" } });
  const products = await prisma.productItem.findMany({
    where: { versionId: version!.id, status: "ACTIVE" },
    take: 3,
    orderBy: { code: "asc" },
  });
  check("0. Danh mục QĐ1277 có sẵn để thử", products.length >= 3, `${products.length} mã SP`);
  if (!staff || !period || products.length < 3) return;

  // ---------------------------------------------------------------- 1. Tạo công việc
  const createRes = await fetch(`${BASE}/api/personal-work-items`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({
      personId: staff.id,
      periodId: period.id,
      title: "[V3-SP] công việc nhiều sản phẩm",
      status: "IN_PROGRESS",
    }),
  });
  const createJson = await createRes.json().catch(() => ({}));
  const itemId = createJson?.data?.id;
  created.itemId = itemId;
  check("1. Tạo được công việc", createRes.status === 201 && !!itemId, `HTTP ${createRes.status}`);
  if (!itemId) return;

  // ---------------------------------------------------------------- 2. Đề xuất 3 SP
  for (let i = 0; i < 3; i++) {
    const res = await fetch(`${BASE}/api/work-item-products`, {
      method: "POST",
      headers: H(staffToken),
      body: JSON.stringify({
        workItemId: itemId,
        productItemId: products[i].id,
        quantity: i === 0 ? 10 : null,
        quantityUnit: i === 0 ? "bộ" : null,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (json?.data?.id) created.spIds.push(json.data.id);
    check(`2.${i + 1} Đề xuất mã SP ${products[i].code}`, res.status === 201, `HTTP ${res.status}`);
  }

  const listRes = await fetch(`${BASE}/api/work-item-products?workItemId=${itemId}`, { headers: H(staffToken) });
  const listJson = await listRes.json().catch(() => ({}));
  const rows = listJson.data || [];
  check("2. Công việc có 3 mã SP", rows.length === 3, `${rows.length} SP`);
  check("2. Mã SP chưa xác nhận ở trạng thái 'Chờ lãnh đạo xác nhận'", rows.every((r: any) => r.reviewState === "PROPOSED"));
  check("2. Hệ số lấy từ danh mục QĐ1277, không tự đặt", rows.every((r: any) => r.factorSource === "QD1277_PRODUCT"));
  check("2. Số lượng + đơn vị tính được lưu", rows.some((r: any) => r.quantity === 10 && r.quantityUnit === "bộ"));

  // ---------------------------------------------------------------- 3. Chống trùng
  const dupRes = await fetch(`${BASE}/api/work-item-products`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({ workItemId: itemId, productItemId: products[0].id }),
  });
  check("3. Đề xuất trùng mã SP ⇒ 409", dupRes.status === 409, `HTTP ${dupRes.status}`);

  const wrongOwner = await fetch(`${BASE}/api/work-item-products`, {
    method: "POST",
    headers: H(otherToken),
    body: JSON.stringify({ workItemId: itemId, productItemId: products[0].id }),
  });
  check("3. Người khác không đề xuất SP cho công việc này ⇒ 403", wrongOwner.status === 403, `HTTP ${wrongOwner.status}`);

  // ---------------------------------------------------------------- 4. Xác nhận từng SP độc lập
  const staffConfirm = await fetch(`${BASE}/api/work-item-products/${created.spIds[0]}`, {
    method: "PATCH",
    headers: H(staffToken),
    body: JSON.stringify({ action: "CONFIRM" }),
  });
  check("4. Cán bộ tự xác nhận SP ⇒ 403", staffConfirm.status === 403, `HTTP ${staffConfirm.status}`);

  const otherConfirm = await fetch(`${BASE}/api/work-item-products/${created.spIds[0]}`, {
    method: "PATCH",
    headers: H(otherToken),
    body: JSON.stringify({ action: "CONFIRM" }),
  });
  check("4. Không phải lãnh đạo trực tiếp ⇒ 403", otherConfirm.status === 403, `HTTP ${otherConfirm.status}`);

  const c1 = await fetch(`${BASE}/api/work-item-products/${created.spIds[0]}`, {
    method: "PATCH",
    headers: H(leaderToken),
    body: JSON.stringify({ action: "CONFIRM" }),
  });
  check("4. Lãnh đạo xác nhận SP1 ⇒ 200", c1.status === 200, `HTTP ${c1.status}`);
  const after1 = await prisma.workItemProduct.findUnique({ where: { id: created.spIds[0] } });
  check("4. SP1 = CONFIRMED", after1?.reviewState === "CONFIRMED", String(after1?.reviewState));
  check("4. Hệ số được chụp lại khi xác nhận (không sửa danh mục)", after1?.factorSnapshot === products[0].convertFactor, `snapshot=${after1?.factorSnapshot}`);
  const sp2 = await prisma.workItemProduct.findUnique({ where: { id: created.spIds[1] } });
  const sp3 = await prisma.workItemProduct.findUnique({ where: { id: created.spIds[2] } });
  check("4. Xác nhận SP1 KHÔNG tự xác nhận SP2/SP3", sp2?.reviewState === "PROPOSED" && sp3?.reviewState === "PROPOSED", `${sp2?.reviewState}/${sp3?.reviewState}`);

  // ---------------------------------------------------------------- 5. Kết quả tháng: chưa đủ điều kiện
  const mrRes = await fetch(`${BASE}/api/monthly-results?year=2026&month=10`, { headers: H(staffToken) });
  const mrJson = await mrRes.json().catch(() => ({}));
  const drafts = mrJson.drafts || [];
  // F11/F12: bản nháp CHỈ gồm công việc ĐÃ được lãnh đạo xác nhận (sẵn sàng ghi kết quả tháng).
  check(
    "5. Công việc CHƯA xác nhận KHÔNG có trong mục Bản nháp",
    !drafts.some((d: any) => d.id === itemId),
    `${drafts.length} bản nháp`
  );
  check("5. Bản nháp không tạo bản ghi kết quả tháng (chống trùng)", (mrJson.data || []).filter((r: any) => r.workItemId === itemId).length === 0);

  // Xác nhận công việc (sau khi đã gửi) ⇒ phải xuất hiện trong bản nháp
  const confEarly = await fetch(`${BASE}/api/personal-work-items/${itemId}/review`, {
    method: "POST",
    headers: H(leaderToken),
    body: JSON.stringify({ action: "CONFIRM" }),
  });
  check("5. Chưa gửi thì chưa xác nhận được ⇒ 409", confEarly.status === 409, `HTTP ${confEarly.status}`);

  // Gửi duyệt công việc → trạng thái chờ
  const submitRes = await fetch(`${BASE}/api/personal-work-items/${itemId}/review`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({ action: "SUBMIT", resultText: "Đã rà soát và đề xuất 3 mã sản phẩm.", completedOn: "2026-10-21" }),
  });
  check("5. Gửi công việc lên lãnh đạo ⇒ 200", submitRes.status === 200, `HTTP ${submitRes.status}`);

  // Đã gửi + lãnh đạo xác nhận ⇒ công việc xuất hiện ở BẢN NHÁP kết quả tháng
  // (xác nhận SP ở bước 7, sau khi bước này — đúng thứ tự nghiệp vụ)

  // ---------------------------------------------------------------- 6. Khoá khi đã gửi
  const addLocked = await fetch(`${BASE}/api/work-item-products`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({ workItemId: itemId, productItemId: products[0].id }),
  });
  check("6. Thêm SP khi công việc đã gửi ⇒ 409 (bổ sung sau nghiệm thu phải qua quy trình riêng)", addLocked.status === 409, `HTTP ${addLocked.status}`);

  // ---------------------------------------------------------------- 7. Xác nhận nốt SP
  const c2 = await fetch(`${BASE}/api/work-item-products/${created.spIds[1]}`, {
    method: "PATCH",
    headers: H(leaderToken),
    body: JSON.stringify({ action: "CONFIRM" }),
  });
  check("7. Xác nhận SP2 ⇒ 200", c2.status === 200, `HTTP ${c2.status}`);

  // SP3 bị từ chối
  const r3 = await fetch(`${BASE}/api/work-item-products/${created.spIds[2]}`, {
    method: "PATCH",
    headers: H(leaderToken),
    body: JSON.stringify({ action: "REJECT", note: "Mã sản phẩm chưa đúng với hồ sơ, đề nghị đối chiếu lại." }),
  });
  check("7. Từ chối SP3 ⇒ 200", r3.status === 200, `HTTP ${r3.status}`);
  const rejectNoNote = await fetch(`${BASE}/api/work-item-products/${created.spIds[2]}`, {
    method: "PATCH",
    headers: H(leaderToken),
    body: JSON.stringify({ action: "REJECT", note: "" }),
  });
  check("7. Từ chối mà không có lý do ⇒ 400", rejectNoNote.status === 400, `HTTP ${rejectNoNote.status}`);

  // ---------------------------------------------------------------- 8. Điểm chính thức
  const confirmItem = await fetch(`${BASE}/api/personal-work-items/${itemId}/review`, {
    method: "POST",
    headers: H(leaderToken),
    body: JSON.stringify({ action: "CONFIRM" }),
  });
  check("8. Lãnh đạo xác nhận công việc ⇒ 200", confirmItem.status === 200, `HTTP ${confirmItem.status}`);

  // F11/F12: công việc đã xác nhận xuất hiện ở BẢN NHÁP kết quả tháng (chưa có hồ sơ kết quả)
  const mrRes2 = await fetch(`${BASE}/api/monthly-results?year=2026&month=10`, { headers: H(staffToken) });
  const mrJson2 = await mrRes2.json().catch(() => ({}));
  const draft2 = (mrJson2.drafts || []).find((d: any) => d.id === itemId);
  check("8. Công việc đã xác nhận xuất hiện ở mục Bản nháp kết quả tháng", !!draft2, `${(mrJson2.drafts || []).length} bản nháp`);
  check(
    "8. Bản nháp ghi rõ số SP đã xác nhận / tổng số SP",
    draft2?.spTotal === 3 && draft2?.spConfirmed === 2,
    `${draft2?.spConfirmed}/${draft2?.spTotal}`
  );
  const confirmAgain = await fetch(`${BASE}/api/personal-work-items/${itemId}/review`, {
    method: "POST",
    headers: H(leaderToken),
    body: JSON.stringify({ action: "CONFIRM" }),
  });
  check("8. Xác nhận lần hai ⇒ 409 (không mở lại hồ sơ đã nghiệm thu)", confirmAgain.status === 409, `HTTP ${confirmAgain.status}`);

  const mr2 = await fetch(`${BASE}/api/monthly-results?year=2026&month=10`, { headers: H(staffToken) });
  const mr2Json = await mr2.json().catch(() => ({}));
  // Tạo kết quả tháng cho công việc này để kiểm tra nhãn dự thảo / chính thức
  const createMr = await fetch(`${BASE}/api/monthly-results`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({
      personId: staff.id,
      periodYear: 2026,
      periodMonth: 10,
      title: "[V3-SP] công việc nhiều sản phẩm",
      workItemId: itemId,
      productItemId: products[0].id,
      assignedQty: 10,
      completedQty: 10,
      dueDate: "2026-10-21T00:00:00.000Z",
      completedDate: "2026-10-21T00:00:00.000Z",
    }),
  });
  check("8. Tạo được kết quả tháng liên kết công việc", createMr.status === 200 || createMr.status === 201, `HTTP ${createMr.status}`);
  const mr3 = await fetch(`${BASE}/api/monthly-results?year=2026&month=10`, { headers: H(staffToken) });
  const mr3Json = await mr3.json().catch(() => ({}));
  const row3 = (mr3Json.data || []).find((r: any) => r.workItemId === itemId);
  check("8. Dòng có nhãn trạng thái chính thức/dự thảo", !!row3?.officialState, row3?.officialState);
  check(
    "8. SP chưa được xác nhận ⇒ KHÔNG đủ điều kiện tổng hợp chính thức",
    row3?.officialState === "SP_PENDING" && row3?.officialReady === false,
    `state=${row3?.officialState} ready=${row3?.officialReady}`
  );
  check("8. Không tạo trùng bản ghi kết quả tháng", (mr3Json.data || []).filter((r: any) => r.workItemId === itemId).length === 1);
  check("8. Bản nháp không còn hiển thị sau khi đã có kết quả tháng", !(mr3Json.drafts || []).some((d: any) => d.id === itemId));

  // ---------------------------------------------------------------- 9. Lịch sử
  const history = await prisma.workItemReview.findMany({ where: { workItemId: itemId } });
  check("9. Lịch sử có bản ghi xác nhận SP", history.some((h) => h.action === "SP_CONFIRMED"), history.map((h) => h.action).join(","));
  check("9. Lịch sử có bản ghi gửi + xác nhận công việc", history.some((h) => h.action === "SUBMITTED") && history.some((h) => h.action === "CONFIRMED"));

  console.log(`\n=== KẾT QUẢ: ${passed} pass / ${failed} fail ===`);
  if (failures.length) failures.forEach((f) => console.log("  - " + f));
  process.exitCode = failed === 0 ? 0 : 1;
}

async function cleanup() {
  if (created.itemId) {
    try {
      await prisma.workItemReview.deleteMany({ where: { workItemId: created.itemId } });
      await prisma.workItemProduct.deleteMany({ where: { workItemId: created.itemId } });
      await prisma.monthlyWorkResult.deleteMany({ where: { workItemId: created.itemId } });
      await prisma.personalWorkItem.delete({ where: { id: created.itemId } });
    } catch {}
  }
  await prisma.$disconnect();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
  });
