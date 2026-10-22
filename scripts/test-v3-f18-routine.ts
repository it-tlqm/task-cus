/**
 * test-v3-f18-routine.ts — F18: Nhật ký tác nghiệp dùng danh mục TX + SP QĐ1277, liên thông V3.
 *
 *   $env:DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/talung_v3_demo"
 *   $env:DIRECT_URL=$env:DATABASE_URL
 *   $env:TEST_BASE_URL="http://localhost:3100"
 *   npx tsx scripts/test-v3-f18-routine.ts
 */
import { createRequire } from "node:module";
const creq = createRequire("D:/thanhnx/OpenCode/talung-cus-work/package.json");
const { PrismaClient } = creq("@prisma/client");
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });

const BASE = process.env.TEST_BASE_URL || "http://localhost:3100";
const PASSWORD = process.env.V3_DEMO_PASSWORD || "LocalTest@2026";
const TMP = "[F18-TEST]";

let passed = 0, failed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail = "") {
  if (cond) { passed++; console.log(`[PASS] ${name}${detail ? " - " + detail : ""}`); }
  else { failed++; failures.push(`${name}${detail ? " - " + detail : ""}`); console.log(`[FAIL] ${name}${detail ? " - " + detail : ""}`); }
}
async function login(u: string) {
  const r = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u, password: PASSWORD }) });
  const j = await r.json().catch(() => ({}));
  if (!j.token) throw new Error("dang nhap " + u + " loi " + r.status);
  return j.token;
}
const H = (t: string) => ({ Authorization: `Bearer ${t}`, "Content-Type": "application/json" });

const created: { entryIds: string[]; itemIds: string[] } = { entryIds: [], itemIds: [] };

async function main() {
  console.log("=== F18 — NHẬT KÝ TÁC NGHIỆP + DANH MỤC TX/SP + LIÊN THÔNG V3 ===\n");
  const staffToken = await login("democb01");
  const leaderToken = await login("demold01");
  const otherToken = await login("democb02");
  const staff = await prisma.person.findFirst({ where: { code: "DEMO-CB-01" } });
  const period = await prisma.reportingPeriod.findFirst({ where: { type: "MONTH", title: { contains: "10/2026" } } });
  // 2 ky khac nhau de thu 2 loai "khong phat sinh" (chi 1 ban ghi NOT_OCCURRED moi nguoi/ky)
  const usedNotOccurred = await prisma.routineEntry.findMany({
    where: { personId: staff.id, occurrenceStatus: "NOT_OCCURRED" },
    select: { periodId: true },
  });
  const usedIds = new Set(usedNotOccurred.map((x) => x.periodId));
  const freePeriods = await prisma.reportingPeriod.findMany({
    where: { type: "MONTH", id: { notIn: [...usedIds] } },
    orderBy: { startAt: "asc" },
  });
  const periodA = freePeriods[0] || period!;
  const periodB = freePeriods[1] || freePeriods[0] || period!;

  // Danh muc TX + SP
  const tx = await prisma.workCatalogEntry.findFirst({ where: { status: "ACTIVE" }, orderBy: { code: "asc" } });
  const products = await prisma.productItem.findMany({ where: { status: "ACTIVE" }, take: 2, orderBy: { code: "asc" } });
  const productWithFactor = products.find((p) => p.convertFactor !== null && p.convertFactor !== undefined) || products[0];
  const productSecond = products.find((p) => p.id !== productWithFactor.id) || products[1];
  const productNoFactor = await prisma.productItem.findFirst({ where: { status: "ACTIVE", convertFactor: null } });
  check("0. Danh mục TX + SP QĐ1277 có dữ liệu", !!tx && !!productWithFactor, `TX=${tx?.code} SP=${productWithFactor?.code}`);

  // ---- 1. Tim theo ma/ten/co dau/khong dau (API) ----
  const noAccent = productWithFactor!.taskName
    .slice(0, 12)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const searchCases: Array<{ name: string; url: string }> = [
    { name: "TX theo ma", url: "/api/work-catalog?search=" + encodeURIComponent(tx!.code) },
    { name: "SP theo ma", url: "/api/products?search=" + encodeURIComponent(productWithFactor!.code) + "&pageSize=5" },
    { name: "SP khong dau", url: "/api/products?search=" + encodeURIComponent(noAccent) + "&pageSize=5" },
  ];
  for (const c of searchCases) {
    const res = await fetch(BASE + c.url, { headers: H(staffToken) });
    const j = await res.json().catch(() => ({}));
    const n = Array.isArray(j.data) ? j.data.length : (j.data?.entries || []).length;
    check("1. Tim " + c.name + " hoat dong", res.status === 200 && n > 0, "HTTP " + res.status + " n=" + n);
  }

  // ---- 2. Tao nhat ky tac nghiep co TX + 2 SP ----
  const createRes = await fetch(`${BASE}/api/routine`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({
      periodId: period!.id,
      title: `${TMP} kiểm tra container`,
      notes: "Ghi chú nghiệm vụ",
      occurrenceStatus: "OCCURRED",
      companyName: "DN kiểm tra",
      containerCount: 5,
      progressPercent: 100,
      timeSpent: "Theo ca trực",
      catalogEntryId: tx!.id,
      // client gui he so SAI de chung minh server lay tu danh muc
      proposedProducts: [
        { productItemId: productWithFactor!.id, code: productWithFactor!.code, taskName: productWithFactor!.taskName, factor: 999, quantity: 5, unit: "bộ" },
        { productItemId: productSecond.id, code: productSecond.code, taskName: productSecond.taskName, factor: 999, quantity: null, unit: null },
      ],
    }),
  });
  const cj = await createRes.json().catch(() => ({}));
  const entryId = cj?.routineEntry?.id || cj?.entry?.id || cj?.data?.id;
  created.entryIds.push(entryId);
  check("2. Tạo được nhật ký tác nghiệp có TX + 2 SP", createRes.status === 201 && !!entryId, `HTTP ${createRes.status} ${cj?.error || ""}`);

  const entry = entryId ? await prisma.routineEntry.findUnique({ where: { id: entryId }, include: { workItem: true } }) : null;
  check("2. Bản ghi lưu đúng mã TX", entry?.catalogEntryId === tx!.id);
  check("2. Bản ghi lưu danh sách SP đề xuất", (entry?.proposedProducts ? JSON.parse(entry.proposedProducts) : []).length === 2);
  const proposedParsed = entry?.proposedProducts ? JSON.parse(entry.proposedProducts) : [];
  check("2. Hệ số lấy TỪ DANH MỤC (không tin client)", proposedParsed[0]?.factor === Number(productWithFactor!.convertFactor) && proposedParsed[0]?.factor !== 999, `factor=${proposedParsed[0]?.factor}`);
  check("2. Công việc gắn TX + nguồn TX_CATALOG", entry?.workItem?.catalogEntryId === tx!.id && entry?.workItem?.sourceKind === "TX_CATALOG", `${entry?.workItem?.sourceKind}`);
  check("2. Công việc CHƯA được coi là đã nghiệm thu (reviewState=DRAFT)", entry?.workItem?.reviewState === "DRAFT", String(entry?.workItem?.reviewState));
  check("2. Bản ghi gắn được công việc (đường liên kết 2 chiều)", !!entry?.workItemId);
  if (entry?.workItemId) created.itemIds.push(entry.workItemId);

  // ---- 3. SP duoc gan vao cong viec o trang thai PROPOSED ----
  const sps = await prisma.workItemProduct.findMany({ where: { workItemId: entry?.workItemId } });
  check("3. SP đề xuất gắn vào công việc, trạng thái PROPOSED (chưa xác nhận)", sps.length === 2 && sps.every((s) => s.reviewState === "PROPOSED"), sps.map((s) => s.reviewState).join("/"));

  // ---- 4. Form Builder van giu nguyen ----
  const subs = await prisma.resultSubmission.findMany({ where: { routineEntryId: entryId }, include: { values: true } });
  const vals = Object.fromEntries((subs[0]?.values || []).map((v) => [v.fieldKey, v.valueText ?? v.valueNumber]));
  check("4. Trường Form Builder (DN/chủ hàng, số container) vẫn lưu", vals["company_name"] === "DN kiểm tra" && Number(vals["container_count"]) === 5, JSON.stringify(vals).slice(0, 90));

  // ---- 5. Trung ma gia khi khong co ma that ----
  const getRes = await fetch(`${BASE}/api/routine`, { headers: H(staffToken) });
  const getJson = await getRes.json().catch(() => ({}));
  const myEntry = (getJson.entries || []).find((e: any) => e.id === entryId);
  check("5. Mã hiển thị lấy từ danh mục TX (không còn mã giả TTHQ/KPS)", myEntry?.catalogEntry?.code === tx!.code, String(myEntry?.code));

  // ---- 6. De nghi ghi nhan ket qua -> quy trinh V3 ----
  const submitRes = await fetch(`${BASE}/api/routine/${entryId}/submit`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({ resultText: "Đã kiểm tra 5 container, không có vụ việc phát sinh.", completedOn: "2026-10-22" }),
  });
  check("6. Đề nghị ghi nhận kết quả (V3) ⇒ 200", submitRes.status === 200, `HTTP ${submitRes.status} ${(await submitRes.json().catch(() => ({}))).error || ""}`);
  const wiAfter = await prisma.personalWorkItem.findUnique({ where: { id: entry?.workItemId } });
  check("6. Công việc chuyển sang 'đang chờ lãnh đạo xác nhận' (SUBMITTED)", wiAfter?.reviewState === "SUBMITTED", String(wiAfter?.reviewState));

  // ---- 7. Sai vai tro ----
  const otherSubmit = await fetch(`${BASE}/api/routine/${entryId}/submit`, {
    method: "POST",
    headers: H(otherToken),
    body: JSON.stringify({ resultText: "cố gửi hộ người khác", completedOn: "2026-10-22" }),
  });
  check("7. Người khác không đề nghị hộ được ⇒ 403", otherSubmit.status === 403, `HTTP ${otherSubmit.status}`);

  // ---- 8. Lanh dao xac nhan cong viec + xac nhan tung SP ----
  const confirmSp = await fetch(`${BASE}/api/work-item-products/${sps[0].id}`, {
    method: "PATCH",
    headers: H(leaderToken),
    body: JSON.stringify({ action: "CONFIRM" }),
  });
  check("8. Lãnh đạo xác nhận được từng SP", confirmSp.status === 200, `HTTP ${confirmSp.status}`);
  const spStates = await prisma.workItemProduct.findMany({ where: { workItemId: entry?.workItemId } });
  check("8. Xác nhận SP1 KHÔNG tự xác nhận SP2", spStates.filter((s) => s.reviewState === "CONFIRMED").length === 1, spStates.map((s) => s.reviewState).join("/"));

  const confirmItem = await fetch(`${BASE}/api/personal-work-items/${entry?.workItemId}/review`, {
    method: "POST",
    headers: H(leaderToken),
    body: JSON.stringify({ action: "CONFIRM" }),
  });
  check("8. Lãnh đạo xác nhận công việc ⇒ 200", confirmItem.status === 200, `HTTP ${confirmItem.status}`);

  // ---- 9. Sau khi xac nhan: khong sua / khong gui lai ----
  const patchAfter = await fetch(`${BASE}/api/personal-work-items/${entry?.workItemId}/review`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({ action: "SUBMIT", resultText: "gửi lại sau khi đã xác nhận", completedOn: "2026-10-22" }),
  });
  check("9. Sau khi xác nhận không gửi lại được ⇒ 409", patchAfter.status === 409, `HTTP ${patchAfter.status}`);

  // ---- 10. SP chua xac nhan / thieu he so khong vao diem chinh thuc ----
  const mrRes = await fetch(`${BASE}/api/monthly-results?year=2026&month=10`, { headers: H(staffToken) });
  const mrJson = await mrRes.json().catch(() => ({}));
  const row = (mrJson.data || []).find((r: any) => r.workItemId === entry?.workItemId);
  check("10. Dòng có SP chưa xác nhận ⇒ KHÔNG đủ điều kiện chính thức", !row || row.officialReady === false, `state=${row?.officialState}`);

  // ---- 11. Hai loai "khong phat sinh" ----
  const noActivity = await fetch(`${BASE}/api/routine`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({ periodId: periodA.id, title: "", notes: "", occurrenceStatus: "NOT_OCCURRED", notOccurredKind: "NO_ACTIVITY" }),
  });
  const naJson = await noActivity.json().catch(() => ({}));
  const naId = naJson?.routineEntry?.id || naJson?.entry?.id || naJson?.data?.id;
  if (naId) created.entryIds.push(naId);
  const naEntry = naId ? await prisma.routineEntry.findUnique({ where: { id: naId } }) : null;
  check("11. 'Ca không có hoạt động tác nghiệp' ghi đúng nội dung, không gán mã giả", naEntry?.notes?.includes("không có hoạt động tác nghiệp") && !naEntry?.templateId, naEntry?.notes?.slice(0, 50));

  if (naId) { await prisma.routineEntry.delete({ where: { id: naId } }).catch(() => {}); }
  const noViolation = await fetch(`${BASE}/api/routine`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({ periodId: periodA.id, title: "", notes: "", occurrenceStatus: "NOT_OCCURRED", notOccurredKind: "NO_VIOLATION" }),
  });
  const nvJson = await noViolation.json().catch(() => ({}));
  const nvId = nvJson?.routineEntry?.id || nvJson?.entry?.id || nvJson?.data?.id;
  if (nvId) created.entryIds.push(nvId);
  const nvEntry = nvId ? await prisma.routineEntry.findUnique({ where: { id: nvId } }) : null;
  check("11. 'Ca không phát sinh vụ việc' ghi nội dung KHÁC, không gán mã giả", nvEntry?.notes?.includes("không phát sinh vụ việc") && nvEntry?.notes !== naEntry?.notes, nvEntry?.notes?.slice(0, 50));

  // Xoa ban ghi "khong phat sinh" dau tien de ky con trong cung ky (chi 1 ban ghi NOT_OCCURRED/nguoi/ky)
  if (naId) { await prisma.routineEntry.delete({ where: { id: naId } }).catch(() => {}); }

  // ---- 12. Du lieu mau: loc, khong xoa ----
  const demoBefore = await prisma.routineEntry.count({ where: { OR: [{ workItem: { title: { startsWith: "[DEMO]" } } }, { notes: { startsWith: "[DEMO]" } }] } });
  const hidden = await fetch(`${BASE}/api/routine?hideDemo=1`, { headers: H(staffToken) });
  const hiddenJson = await hidden.json().catch(() => ({}));
  const stillDemo = (hiddenJson.entries || []).filter((e: any) => String(e.title || "").startsWith("[DEMO]") || String(e.notes || "").startsWith("[DEMO]"));
  check("12. Bộ lọc ẩn dữ liệu [DEMO] hoạt động", stillDemo.length === 0, `còn ${stillDemo.length} bản ghi DEMO hiện`);
  const demoAfter = await prisma.routineEntry.count({ where: { OR: [{ workItem: { title: { startsWith: "[DEMO]" } } }, { notes: { startsWith: "[DEMO]" } }] } });
  check("12. Dữ liệu DEMO KHÔNG bị xoá", demoBefore === demoAfter, `${demoBefore} → ${demoAfter}`);

  console.log(`\n=== KẾT QUẢ: ${passed} pass / ${failed} fail ===`);
  if (failures.length) failures.forEach((f) => console.log("  - " + f));
  process.exitCode = failed === 0 ? 0 : 1;
}

async function cleanup() {
  for (const id of created.entryIds) {
    try {
      await prisma.resultSubmission.deleteMany({ where: { routineEntryId: id } });
      await prisma.routineEntry.delete({ where: { id } });
    } catch {}
  }
  for (const id of created.itemIds) {
    try {
      await prisma.workItemReview.deleteMany({ where: { workItemId: id } });
      await prisma.workItemProduct.deleteMany({ where: { workItemId: id } });
      await prisma.personalWorkItem.delete({ where: { id } });
    } catch {}
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(async () => { await cleanup(); });
