/**
 * test-yc26-29-api.ts — Kiểm thử API cho gói YC-26 → YC-29.
 *
 * Chạy cùng dev server cục bộ:
 *   $env:DATABASE_URL="postgresql://postgres:postgres@localhost:54329/talung_dev"; $env:DIRECT_URL=$env:DATABASE_URL
 *   npx next dev -p 3100
 *   npx tsx scripts/test-yc26-29-api.ts
 *
 * CHẶN CỨNG: chỉ chạy với DB cục bộ (localhost:54329) — không đụng Production.
 * Nguyên tắc: mọi bản ghi do test tạo ra đều được DỌN SẠCH (phân công, chỉ tiêu giao, bản ghi ngày, người tạm).
 */
import { PrismaClient } from "@prisma/client";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

const rawUrl = process.env.DIRECT_URL || process.env.DATABASE_URL || "";
if (!rawUrl.includes("localhost:54329")) {
  console.error(
    "❌ CHẶN AN TOÀN: bộ test chỉ chạy trên DB cục bộ (localhost:54329). Hiện tại:",
    rawUrl.replace(/\/\/[^@]+@/, "//***@")
  );
  process.exit(1);
}
const prisma = new PrismaClient({ datasources: { db: { url: rawUrl } } });
const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3100";
const PASSWORD = "LocalTest@2026";
const OUT_DIR = path.resolve("demo-ops/yc2629-tests");
const D = (v: any) => Number(v);

let passed = 0;
let failed = 0;
const failures: string[] = [];
const evidence: Record<string, any> = {};

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`✅ [PASS] ${name}${detail ? " — " + detail : ""}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? " — " + detail : ""}`);
    console.log(`❌ [FAIL] ${name}${detail ? " — " + detail : ""}`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api(method: string, urlPath: string, token?: string, body?: any) {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE_URL}${urlPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const ct = res.headers.get("content-type") || "";
  const json = ct.includes("json") ? await res.json().catch(() => null) : null;
  return { status: res.status, json };
}

async function login(username: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Đăng nhập ${username} thất bại (HTTP ${res.status})`);
  const json: any = await res.json();
  return json.token;
}

async function waitForServer(): Promise<void> {
  for (let i = 1; i <= 60; i++) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) {
        console.log(`• Dev server sẵn sàng (lần thử ${i}).`);
        return;
      }
    } catch {
      /* chưa lên */
    }
    await sleep(2000);
  }
  throw new Error("Dev server không phản hồi sau 120 giây");
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const todayVnStr = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
/** POST /api/metrics/entries trả về "items" — chuẩn hóa về danh sách entryId chuỗi. */
const normEntryIds = (items: any[] | undefined): string[] =>
  (items || []).map((i) => (typeof i === "string" ? i : i?.entryId || i?.id)).filter((x: any) => typeof x === "string");

// ============================================================
// DỌN DẸP — mọi thứ do test tạo
// ============================================================
const cleanup = {
  assignmentIds: [] as string[],
  targetIds: [] as string[],
  entryIds: [] as string[],
  personIds: [] as string[],
};

async function runCleanup() {
  let n = 0;
  cleanup.entryIds = Array.from(new Set(cleanup.entryIds));
  if (cleanup.entryIds.length) {
    await prisma.metricEntryRevision.deleteMany({ where: { entryId: { in: cleanup.entryIds } } });
    const r = await prisma.metricDailyEntry.deleteMany({ where: { id: { in: cleanup.entryIds } } });
    n += r.count;
  }
  if (cleanup.targetIds.length) {
    const r = await prisma.metricPlanTarget.deleteMany({ where: { id: { in: cleanup.targetIds } } });
    n += r.count;
  }
  if (cleanup.assignmentIds.length) {
    const r = await prisma.metricEntryAssignment.deleteMany({ where: { id: { in: cleanup.assignmentIds } } });
    n += r.count;
  }
  if (cleanup.personIds.length) {
    const r = await prisma.person.deleteMany({ where: { id: { in: cleanup.personIds } } });
    n += r.count;
  }
  if (n > 0) console.log(`• Đã dọn ${n} bản ghi test khỏi DB cục bộ.`);
}

async function main() {
  await waitForServer();
  const leader = await login("demold01");
  console.log("• Đã đăng nhập demold01 (lãnh đạo)");

  const today = todayVnStr();
  const anchors = "year=2026&month=10&week=42&quarter=4";

  // ---------- Dữ liệu nền từ DB ----------
  const cb014 = await prisma.person.findFirstOrThrow({ where: { code: "CB-014" } });
  const cbAccount = await prisma.account.findFirstOrThrow({ where: { personId: cb014.id } });
  const gatesBefore = await prisma.roleGrant.findMany({ where: { accountId: cbAccount.id } });
  const thu = await prisma.metricDefinition.findFirstOrThrow({ where: { code: "THU_NSNN" } });
  const thuClasses = await prisma.metricClassification.findMany({ where: { metricId: thu.id }, orderBy: { sortOrder: "asc" } });
  const oToClass = thuClasses.find((c) => c.code === "O_TO");
  if (!oToClass) throw new Error("Thiếu phân loại O_TO của THU_NSNN trong DB cục bộ");

  // ============================================================
  // PHẦN 1 — YC-27: tìm CB-014 + kiểm tra người khi phân công
  // ============================================================
  console.log("\n[PHẦN 1] YC-27 — CB-014 trong danh sách phân công + chặn dữ liệu người không hợp lệ");

  const adminCfg = await api("GET", "/api/metrics/admin", leader);
  check("1.1 GET cấu hình thành công", adminCfg.status === 200 && adminCfg.json?.success === true);
  const people = adminCfg.json?.people || [];
  const cb = people.find((p: any) => p.code === "CB-014");
  check("1.2 CB-014 có trong danh sách người (đủ để tìm bằng mã)", !!cb, cb ? `id=${cb.id}` : "KHÔNG THẤY");
  check("1.3 CB-014 kèm đơn vị công tác", !!cb?.unitName, cb?.unitName || "");
  check("1.4 CB-014 có tài khoản hoạt động", cb?.accountStatus === "ACTIVE");
  check(
    "1.5 Danh sách người có đủ trường tìm kiếm (code + fullName)",
    people.length >= 20 && people.every((p: any) => p.code && p.fullName)
  );
  evidence["1_peopleCount"] = people.length;
  evidence["1_cb014"] = cb;

  const badPerson = await api("POST", "/api/metrics/admin", leader, {
    entity: "assignment",
    action: "create",
    data: { personId: "00000000-0000-0000-0000-000000000000", metricId: thu.id, canEnter: true },
  });
  check("1.6 Chặn phân công cho người KHÔNG tồn tại", badPerson.status === 400 && /không tồn tại/i.test(badPerson.json?.error || ""));

  const inactivePerson = await prisma.person.create({
    data: { code: "TEST-YC29-INACTIVE", fullName: "Người thử đã nghỉ (test)", status: "INACTIVE" },
  });
  cleanup.personIds.push(inactivePerson.id);
  const inactiveRes = await api("POST", "/api/metrics/admin", leader, {
    entity: "assignment",
    action: "create",
    data: { personId: inactivePerson.id, metricId: thu.id, canEnter: true },
  });
  check("1.7 Chặn phân công cho người đã ngừng công tác", inactiveRes.status === 400 && /ngừng công tác/i.test(inactiveRes.json?.error || ""));

  // Chọn các chỉ tiêu CB-014 chưa có phân công để thử
  const herAssignmentsBefore = await prisma.metricEntryAssignment.findMany({ where: { personId: cb014.id } });
  const herMetricIds = new Set(herAssignmentsBefore.map((a) => a.metricId).filter(Boolean) as string[]);
  const freeMetrics = await prisma.metricDefinition.findMany({
    where: { active: true, id: { notIn: Array.from(herMetricIds) } },
    orderBy: { code: "asc" },
    take: 5,
  });
  check("1.8 Đủ chỉ tiêu trống để thử phân công", freeMetrics.length >= 4, `${freeMetrics.length} chỉ tiêu`);

  const singleMetric = freeMetrics[0];
  const single1 = await api("POST", "/api/metrics/admin", leader, {
    entity: "assignment",
    action: "create",
    data: { personId: cb014.id, metricId: singleMetric.id, canEnter: true, canConfirm: false },
  });
  check("1.9 Phân công đơn cho CB-014 thành công", single1.status === 200 && single1.json?.success === true && !single1.json?.duplicated);
  if (single1.json?.id && !single1.json?.duplicated) cleanup.assignmentIds.push(single1.json.id);

  const single2 = await api("POST", "/api/metrics/admin", leader, {
    entity: "assignment",
    action: "create",
    data: { personId: cb014.id, metricId: singleMetric.id, canEnter: true, canConfirm: false },
  });
  const rowsAfterDup = await prisma.metricEntryAssignment.count({ where: { personId: cb014.id, metricId: singleMetric.id } });
  check(
    "1.10 Gửi lặp phân công đơn KHÔNG tạo trùng (báo đã tồn tại)",
    single2.status === 200 && single2.json?.duplicated === true && rowsAfterDup === 1,
    `rows=${rowsAfterDup}`
  );

  // ============================================================
  // PHẦN 2 — YC-28: lưu phân công hàng loạt
  // ============================================================
  console.log("\n[PHẦN 2] YC-28 — Lưu phân công hàng loạt (chống trùng, phân quyền, audit)");

  const bulkMetrics = freeMetrics.slice(1, 4);
  const bulkIds = bulkMetrics.map((m) => m.id);
  const auditBefore = await prisma.auditEvent.count({ where: { action: "METRIC_ADMIN_ASSIGNMENT_BULK_SAVED" } });

  // YC-28 (bổ sung): ghi nhận phân công CÓ SẴN (ngoài phạm vi sắp thao tác) để đối chiếu sau khi lưu hàng loạt
  const outsideBefore = await prisma.metricEntryAssignment.findMany({
    where: { personId: cb014.id, NOT: { metricId: { in: bulkIds } } },
    orderBy: { id: "asc" },
    select: { id: true, metricId: true, groupId: true, canEnter: true, canConfirm: true, active: true },
  });

  const bulk1 = await api("POST", "/api/metrics/admin", leader, {
    entity: "assignment",
    action: "create_bulk",
    data: { personId: cb014.id, metricIds: bulkIds, canEnter: true, canConfirm: false },
  });
  check(
    "2.1 Lưu hàng loạt 3 chỉ tiêu thành công",
    bulk1.status === 200 && bulk1.json?.success === true && bulk1.json?.created === 3,
    `created=${bulk1.json?.created} updated=${bulk1.json?.updated} skipped=${bulk1.json?.skipped}`
  );
  const bulkRows1 = await prisma.metricEntryAssignment.findMany({ where: { personId: cb014.id, metricId: { in: bulkIds } } });
  check("2.2 Không sinh bản ghi trùng sau lần lưu đầu", bulkRows1.length === 3, `rows=${bulkRows1.length}`);
  for (const a of bulkRows1) cleanup.assignmentIds.push(a.id);

  const bulk2 = await api("POST", "/api/metrics/admin", leader, {
    entity: "assignment",
    action: "create_bulk",
    data: { personId: cb014.id, metricIds: bulkIds, canEnter: true, canConfirm: false },
  });
  const bulkRows2 = await prisma.metricEntryAssignment.count({ where: { personId: cb014.id, metricId: { in: bulkIds } } });
  check(
    "2.3 Lưu lại y hệt → bỏ qua 3, không thêm bản ghi",
    bulk2.json?.skipped === 3 && bulk2.json?.created === 0 && bulkRows2 === 3,
    `skipped=${bulk2.json?.skipped} rows=${bulkRows2}`
  );

  const bulk3 = await api("POST", "/api/metrics/admin", leader, {
    entity: "assignment",
    action: "create_bulk",
    data: { personId: cb014.id, metricIds: bulkIds, canEnter: true, canConfirm: true },
  });
  const bulkRows3 = await prisma.metricEntryAssignment.count({ where: { personId: cb014.id, metricId: { in: bulkIds } } });
  const bulkConfirmFlags = await prisma.metricEntryAssignment.count({ where: { personId: cb014.id, metricId: { in: bulkIds }, canConfirm: true } });
  check(
    "2.4 Đổi quyền (xác nhận) → cập nhật 3, không thêm bản ghi",
    bulk3.json?.updated === 3 && bulkRows3 === 3 && bulkConfirmFlags === 3,
    `updated=${bulk3.json?.updated} rows=${bulkRows3} confirmTrue=${bulkConfirmFlags}`
  );

  // YC-28 (bổ sung): phân công ngoài phạm vi thao tác phải nguyên vẹn sau các lần lưu hàng loạt
  const outsideAfter = await prisma.metricEntryAssignment.findMany({
    where: { personId: cb014.id, NOT: { metricId: { in: bulkIds } } },
    orderBy: { id: "asc" },
    select: { id: true, metricId: true, groupId: true, canEnter: true, canConfirm: true, active: true },
  });
  check(
    "2.4b Không xóa/không đổi phân công ngoài phạm vi đang thao tác",
    outsideBefore.length > 0 && JSON.stringify(outsideBefore) === JSON.stringify(outsideAfter),
    `ngoài phạm vi: trước=${outsideBefore.length}, sau=${outsideAfter.length}`
  );

  const emptyBulk = await api("POST", "/api/metrics/admin", leader, {
    entity: "assignment",
    action: "create_bulk",
    data: { personId: cb014.id, metricIds: [] },
  });
  check("2.5 Chặn lưu khi chưa chọn chỉ tiêu", emptyBulk.status === 400 && /chưa chọn|chưa chọn chỉ tiêu/i.test(emptyBulk.json?.error || ""));

  const unknownBulk = await api("POST", "/api/metrics/admin", leader, {
    entity: "assignment",
    action: "create_bulk",
    data: { personId: cb014.id, metricIds: [thu.id, "00000000-0000-0000-0000-000000000001"] },
  });
  check("2.6 Chặn lưu khi có chỉ tiêu không tồn tại", unknownBulk.status === 400 && /không tồn tại/i.test(unknownBulk.json?.error || ""));

  const tooMany = await api("POST", "/api/metrics/admin", leader, {
    entity: "assignment",
    action: "create_bulk",
    data: { personId: cb014.id, metricIds: Array.from({ length: 101 }, (_, i) => `00000000-0000-0000-0000-0000000${String(i).padStart(5, "0")}`) },
  });
  check("2.7 Chặn lưu quá 100 chỉ tiêu một lần", tooMany.status === 400 && /100/.test(tooMany.json?.error || ""));

  const staff = await login("democb01");
  const staffBulk = await api("POST", "/api/metrics/admin", staff, {
    entity: "assignment",
    action: "create_bulk",
    data: { personId: cb014.id, metricIds: [thu.id] },
  });
  check("2.8 Cán bộ thường KHÔNG được lưu phân công (403)", staffBulk.status === 403);

  const auditAfter = await prisma.auditEvent.count({ where: { action: "METRIC_ADMIN_ASSIGNMENT_BULK_SAVED" } });
  check("2.9 Có ghi audit cho lần lưu hàng loạt", auditAfter > auditBefore, `audit +${auditAfter - auditBefore}`);

  // ============================================================
  // PHẦN 3 — YC-26: bảng so sánh kết quả thu
  // ============================================================
  console.log("\n[PHẦN 3] YC-26 — Bảng so sánh (chỉ tiêu BTC/UBND, KH tháng, tháng trước, cùng kỳ)");

  const comp0 = await api("GET", `/api/metrics/summary?${anchors}&comparison=1`, leader);
  const rows0 = comp0.json?.comparison?.rows || [];
  const thuRow0 = rows0.find((r: any) => r.code === "THU_NSNN");
  check("3.1 API summary trả về khối comparison", comp0.status === 200 && Array.isArray(rows0) && rows0.length > 0, `rows=${rows0.length}`);
  check(
    "3.2 Chưa cấu hình chỉ tiêu BTC/UBND → tỷ lệ rỗng (không bịa số)",
    !!thuRow0 && thuRow0.btc.targetValue === null && thuRow0.btc.percent === null && thuRow0.ubnd.targetValue === null && thuRow0.monthPlan.targetValue === null
  );
  check(
    "3.3 Thiếu dữ liệu tháng trước/cùng kỳ → giá trị và tỷ lệ đều rỗng",
    !!thuRow0 && thuRow0.prevMonth.percent === null && thuRow0.samePeriodLastYear.percent === null
  );

  const scale = thu.displayScale || 1;
  const mkTarget = async (
    label: string,
    periodType: string,
    periodNo: number | null,
    baseValue: number,
    comparisonKind = "NONE"
  ) => {
    const r = await api("POST", "/api/metrics/admin", leader, {
      entity: "target",
      action: "create",
      data: {
        metricId: thu.id,
        classificationId: "",
        label,
        periodType,
        year: 2026,
        periodNo,
        value: String(baseValue / scale),
        comparisonKind,
        sourceNote: "[TEST-YC26] căn cứ kiểm thử",
      },
    });
    if (r.json?.id) cleanup.targetIds.push(r.json.id);
    return r;
  };
  const confirmTarget = async (id: string) =>
    api("POST", "/api/metrics/admin", leader, {
      entity: "target",
      action: "confirm",
      data: { id, metricId: thu.id, reason: "Xác nhận kiểm thử" },
    });
  const tBtc = await mkTarget("[TEST-YC26] Chỉ tiêu BTC", "YEAR", null, 1_685_000_000_000, "BTC_YEAR");
  const tUbnd = await mkTarget("[TEST-YC26] Chỉ tiêu UBND tỉnh", "YEAR", null, 1_700_000_000_000, "UBND_YEAR");
  const tKh = await mkTarget("[TEST-YC26] KH tháng 10", "MONTH", 10, 200_000_000_000, "MONTH_PLAN");
  check("3.4 Tạo được 3 chỉ tiêu giao thử (BTC/UBND/KH tháng)", tBtc.json?.success && tUbnd.json?.success && tKh.json?.success);
  const tConfirm = await Promise.all([confirmTarget(tBtc.json.id), confirmTarget(tUbnd.json.id), confirmTarget(tKh.json.id)]);
  check("3.4b Xác nhận được 3 chỉ tiêu giao thử", tConfirm.every((r) => r.json?.status === "CONFIRMED"));

  const comp1 = await api("GET", `/api/metrics/summary?${anchors}&comparison=1`, leader);
  const thuRow = (comp1.json?.comparison?.rows || []).find((r: any) => r.code === "THU_NSNN");
  const expectedBtcPct = round2((thuRow.yearCum / 1_685_000_000_000) * 100);
  const expectedUbndPct = round2((thuRow.yearCum / 1_700_000_000_000) * 100);
  const expectedKhPct = round2((thuRow.monthCum / 200_000_000_000) * 100);
  check(
    "3.5 Tỷ lệ BTC năm = LK năm / chỉ tiêu BTC (đủ tử số & mẫu số)",
    thuRow.btc.targetValue === 1_685_000_000_000 && thuRow.btc.percent === expectedBtcPct,
    `${thuRow.yearCum} / 1.685e12 = ${thuRow.btc.percent}% (kỳ vọng ${expectedBtcPct}%)`
  );
  check(
    "3.6 Tỷ lệ UBND tỉnh = LK năm / chỉ tiêu UBND",
    thuRow.ubnd.targetValue === 1_700_000_000_000 && thuRow.ubnd.percent === expectedUbndPct,
    `${thuRow.ubnd.percent}% (kỳ vọng ${expectedUbndPct}%)`
  );
  check(
    "3.7 Tỷ lệ KH tháng = LK tháng / KH tháng 10",
    thuRow.monthPlan.targetValue === 200_000_000_000 && thuRow.monthPlan.percent === expectedKhPct && thuRow.monthPlan.ambiguous === false,
    `${thuRow.monthCum} / 2e11 = ${thuRow.monthPlan.percent}% (kỳ vọng ${expectedKhPct}%)`
  );
  evidence["3_comparison"] = thuRow;

  // B-C-1: không cho tạo trùng loại đối chiếu trong cùng kỳ (tránh tự chọn bừa).
  const dupKh = await mkTarget("[TEST-YC26] KH tháng 10 trùng", "MONTH", 10, 120_000_000_000, "MONTH_PLAN");
  check("3.7b Chặn tạo trùng loại đối chiếu KH tháng", dupKh.status === 400, JSON.stringify(dupKh.json));
  const comp2 = await api("GET", `/api/metrics/summary?${anchors}&comparison=1`, leader);
  const thuRow2 = (comp2.json?.comparison?.rows || []).find((r: any) => r.code === "THU_NSNN");
  evidence["3_comp2_monthPlan"] = thuRow2?.monthPlan;
  check(
    "3.8 Không có chỉ tiêu trùng loại → dùng đúng chỉ tiêu KH đã cấu hình",
    thuRow2.monthPlan.ambiguous === false && thuRow2.monthPlan.targetValue === 200_000_000_000
  );

  // YC-26 (bổ sung): cờ chất lượng dữ liệu — nhận diện DEMO trộn trong nguồn số liệu
  const demoCount = await prisma.metricPlanTarget.count({ where: { label: { startsWith: "[DEMO" } } });
  const dq = comp2.json?.dataQuality;
  check(
    "3.9 Chỉ tiêu [DEMO] vẫn tồn tại nhưng KHÔNG được dùng làm nguồn đối chiếu (đã chứng minh ở 3.2)",
    demoCount > 0,
    `${demoCount} chỉ tiêu DEMO trong DB`
  );
  check(
    "3.10 Summary trả cờ dataQuality (mốc lũy kế / bản ghi / chỉ tiêu DEMO)",
    !!dq && dq.demoBaselines > 0 && dq.demoEntries > 0 && dq.demoTargets > 0 && dq.demoPresent === true,
    JSON.stringify(dq)
  );
  check(
    "3.11 Cờ phân biệt bản ghi thật (realEntries) và trạng thái trộn (mixedWithReal)",
    !!dq && Number.isInteger(dq.realEntries) && dq.realEntries >= 0 && typeof dq.mixedWithReal === "boolean",
    `realEntries=${dq?.realEntries} mixedWithReal=${dq?.mixedWithReal}`
  );
  evidence["3_dataQuality"] = dq;

  // ============================================================
  // PHẦN 4 — YC-29: cột Trong ngày + trạng thái tháng + đối chiếu DB
  // ============================================================
  console.log("\n[PHẦN 4] YC-29 — Bảng Dashboard: Trong ngày, trạng thái, 0 ≠ chưa nhập");

  const sum0 = await api("GET", `/api/metrics/summary?scope=dashboard&${anchors}`, leader);
  const rowsDash = (sum0.json?.groups || []).flatMap((g: any) => g.metrics);
  const thuDash = rowsDash.find((m: any) => m.code === "THU_NSNN");
  check("4.1 Summary dashboard trả về cột 'Trong ngày' cho mọi chỉ tiêu", rowsDash.every((m: any) => "day" in m.cols));
  check("4.2 Hôm nay chưa nhập gì → Trong ngày = null (KHÁC số 0)", thuDash.cols.day === null);

  const monthVersionCount = await prisma.briefingReportVersion.count({ where: { periodType: "MONTH", periodKey: "2026-10" } });
  const lockedStates = rowsDash.filter((m: any) => m.status?.monthState === "LOCKED");
  check(
    "4.3 Trạng thái tháng của chỉ tiêu có dữ liệu = Đã chốt báo cáo (có phiên bản tháng 10)",
    monthVersionCount > 0 && !!thuDash.status?.monthState && thuDash.status.monthState === "LOCKED",
    `versions=${monthVersionCount} state=${thuDash.status?.monthState}`
  );
  check(
    "4.4 Có ít nhất một chỉ tiêu 'Chưa nhập' dù báo cáo tháng đã chốt (không gắn nhãn chốt cho chỉ tiêu trống)",
    await (async () => {
      const full = await api("GET", `/api/metrics/summary?${anchors}`, leader);
      const allRows = (full.json?.groups || []).flatMap((g: any) => g.metrics);
      return monthVersionCount > 0 && allRows.some((m: any) => m.cols.month === null && m.status?.monthState === "NONE");
    })()
  );
  check("4.5 Mọi nhánh đều có trạng thái hợp lệ", rowsDash.every((m: any) => ["NONE", "RECORDED", "CONFIRMED", "LOCKED"].includes(m.status?.monthState)));

  // Đối chiếu số liệu DB: từng phân loại THU_NSNN
  const monthStart = new Date("2026-10-01T00:00:00.000Z");
  const monthEnd = new Date("2026-10-31T00:00:00.000Z");
  const classChecks: any[] = [];
  for (const cls of thuClasses) {
    const dbSumMonth = await prisma.metricDailyEntry.aggregate({
      where: { metricId: thu.id, classificationId: cls.id, entryDate: { gte: monthStart, lte: monthEnd } },
      _sum: { valueNumeric: true },
    });
    const classRow = (thuDash.classCols || []).find((c: any) => c.classificationId === cls.id);
    const apiVal = classRow?.cols?.month ?? null;
    const dbVal = dbSumMonth._sum.valueNumeric !== null ? D(dbSumMonth._sum.valueNumeric) : null;
    classChecks.push({ cls: cls.code, apiVal, dbVal });
  }
  evidence["4_classMonthParity"] = classChecks;
  check(
    "4.6 Lũy kế tháng theo từng phân loại khớp 100% dữ liệu DB",
    classChecks.every((c) => (c.dbVal === null && c.apiVal === null) || Math.abs((c.apiVal ?? 0) - (c.dbVal ?? 0)) < 0.001),
    JSON.stringify(classChecks)
  );
  const totalMonth = (thuDash.classCols || []).reduce((a: number, c: any) => a + (c.cols.month || 0), 0);
  check("4.7 Tổng Lũy kế tháng = tổng các phân loại", Math.abs((thuDash.cols.month ?? 0) - totalMonth) < 0.001, `api=${thuDash.cols.month} sumClass=${totalMonth}`);

  // ============================================================
  // PHẦN 5 — P0: cảnh báo nhập bất thường (không chặn lưu)
  // ============================================================
  console.log("\n[PHẦN 5] P0 — Cảnh báo mềm khi nhập số lũy kế vào ô phát sinh ngày");

  const postEntry = (value: string) =>
    api("POST", "/api/metrics/entries", leader, {
      entries: [{ metricId: thu.id, classificationId: oToClass.id, entryDate: today, value }],
    });

  const huge = await postEntry("897309948092");
  check("5.1 Ghi được bản ghi với giá trị lớn (không chặn lưu)", huge.status === 200 && huge.json?.success === true);
  cleanup.entryIds.push(...normEntryIds(huge.json?.items));
  check(
    "5.2 Trả cảnh báo 'có dấu hiệu nhập số lũy kế'",
    Array.isArray(huge.json?.warnings) && huge.json.warnings.length >= 1 && /lũy kế/i.test(huge.json.warnings[0]?.message || ""),
    huge.json?.warnings?.[0]?.message || "không có cảnh báo"
  );

  const afterHugeNoWarn = await postEntry("2611800000");
  check("5.3 Giá trị bình thường → không cảnh báo", afterHugeNoWarn.status === 200 && (afterHugeNoWarn.json?.warnings || []).length === 0);
  cleanup.entryIds.push(...normEntryIds(afterHugeNoWarn.json?.items));

  const sumAfter = await api("GET", `/api/metrics/summary?scope=dashboard&${anchors}`, leader);
  const thuDash2 = ((sumAfter.json?.groups || []).flatMap((g: any) => g.metrics) as any[]).find((m) => m.code === "THU_NSNN");
  check("5.4 'Trong ngày' cập nhật đúng theo bản ghi vừa nhập", thuDash2.cols.day === 2611800000, `day=${thuDash2.cols.day}`);
  check("5.5 Trạng thái tháng vẫn là Đã chốt báo cáo (không đổi vì có bản ghi mới)", thuDash2.status.monthState === "LOCKED");

  const zeroCheck = await prisma.metricDailyEntry.count({ where: { entryDate: new Date(today + "T00:00:00.000Z"), valueNumeric: 0 } });
  evidence["5_zeroEntries"] = zeroCheck;

  // ============================================================
  // Đối soát cuối: quyền của CB-014 không đổi
  // ============================================================
  const gatesAfter = await prisma.roleGrant.findMany({ where: { accountId: cbAccount.id } });
  const key = (g: any) => `${g.roleId}|${g.scopeType || ""}|${g.scopeUnitId || ""}`;
  const before = gatesBefore.map(key).sort().join(",");
  const after = gatesAfter.map(key).sort().join(",");
  check("6.1 Quyền (RoleGrant) của CB-014 KHÔNG bị thay đổi/nâng cấp", before === after, `before=[${before}] after=[${after}]`);
}

(async () => {
  try {
    await main();
  } catch (e: any) {
    console.error("❌ LỖI CHẠY TEST:", e?.message || e);
    failed++;
    failures.push(`Lỗi chạy test: ${e?.message || e}`);
  } finally {
    try {
      await runCleanup();
    } catch (e: any) {
      console.error("⚠️ Lỗi dọn dẹp:", e?.message || e);
    }
    mkdirSync(OUT_DIR, { recursive: true });
    const outFile = path.join(OUT_DIR, `api-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    writeFileSync(outFile, JSON.stringify({ passed, failed, failures, evidence }, null, 2), "utf8");
    console.log(`\n================ KẾT QUẢ ================\n✅ PASS: ${passed}   ❌ FAIL: ${failed}`);
    if (failures.length) console.log("Thất bại:\n- " + failures.join("\n- "));
    console.log(`Bằng chứng: ${outFile}`);
    await prisma.$disconnect();
    process.exit(failed > 0 ? 1 : 0);
  }
})();
