/**
 * S2 — Phase B / YC-01/02 regression trên DB kiểm thử (B-C-2).
 *
 * CHỈ chạy trên môi trường cách ly:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/talung_v3_phase_b
 *   TEST_BASE_URL=http://localhost:3112
 *   npx tsx scripts/test-v3-phase-b-revenue.ts
 *
 * Bộ test này tạo dữ liệu tạm (target/mốc/bản ghi ngày) và DỌN SẠCH trong finally.
 * Không dùng dữ liệu Production, không hard-code số ngoài fixture.
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const dbUrl = process.env.DATABASE_URL || "";
if (!dbUrl.includes("talung_v3_phase_b")) {
  throw new Error(
    "TỪ CHỐI CHẠY: DATABASE_URL phải trỏ database kiểm thử talung_v3_phase_b (không dùng Production)."
  );
}
const BASE = process.env.TEST_BASE_URL || "http://localhost:3112";
if (!/^http:\/\/localhost:3112\/?$/.test(BASE)) {
  throw new Error(`TỪ CHỐI CHẠY: TEST_BASE_URL phải là http://localhost:3112 (hiện tại: ${BASE})`);
}
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
const PASSWORD = process.env.TEST_PASSWORD || "LocalTest@2026";
const TAG = `[S2-PHASE-B-${Date.now()}]`;
const OUT_DIR = path.resolve("docs/evidence/multi-session");
const OUT_FILE = path.join(OUT_DIR, "S2_PHASE_B_TEST_RESULTS_2026-10-23.json");

// Fixture đối chiếu đã được S0/YC-01 chấp thuận — chỉ dùng trong test, không seed.
const ACC = {
  year: 2023,
  month: 10,
  yearCum: 1_317_372_334_554,
  monthCum: 219_341_201_856,
  baseline: 1_098_031_132_698, // yearCum - monthCum
  btc: 1_685_000_000_000,
  ubnd: 1_700_000_000_000,
  monthPlan: 200_000_000_000,
  prevMonthEntry: 50,
};

let passed = 0;
let failed = 0;
const failures: string[] = [];
const evidence: Record<string, any> = {};

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`[PASS] ${name}${detail ? " — " + detail : ""}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? " — " + detail : ""}`);
    console.log(`[FAIL] ${name}${detail ? " — " + detail : ""}`);
  }
}

async function login(username: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: PASSWORD }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!json.token) throw new Error(`Đăng nhập ${username} thất bại (HTTP ${res.status})`);
  return json as { token: string; user: any };
}

async function api(method: string, urlPath: string, token?: string, body?: any) {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json: any = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

const cleanup = {
  targetIds: [] as string[],
  baselineIds: [] as string[],
  entryIds: [] as string[],
  accountIds: [] as string[],
  personIds: [] as string[],
};

async function cleanupAll() {
  if (cleanup.targetIds.length) {
    await prisma.metricPlanTargetRevision.deleteMany({ where: { targetId: { in: cleanup.targetIds } } });
    await prisma.metricPlanTarget.deleteMany({ where: { id: { in: cleanup.targetIds } } });
  }
  if (cleanup.baselineIds.length) {
    await prisma.metricBaselineRevision.deleteMany({ where: { baselineId: { in: cleanup.baselineIds } } });
    await prisma.metricBaseline.deleteMany({ where: { id: { in: cleanup.baselineIds } } });
  }
  if (cleanup.entryIds.length) {
    await prisma.metricEntryRevision.deleteMany({ where: { entryId: { in: cleanup.entryIds } } });
    await prisma.metricDailyEntry.deleteMany({ where: { id: { in: cleanup.entryIds } } });
  }
  if (cleanup.accountIds.length) await prisma.account.deleteMany({ where: { id: { in: cleanup.accountIds } } });
  if (cleanup.personIds.length) await prisma.person.deleteMany({ where: { id: { in: cleanup.personIds } } });

  const resourceIds = [...cleanup.targetIds, ...cleanup.baselineIds];
  if (resourceIds.length) {
    await prisma.auditEvent.deleteMany({
      where: {
        resourceId: { in: resourceIds },
        action: {
          in: [
            "METRIC_ADMIN_TARGET_CREATED",
            "METRIC_ADMIN_TARGET_UPDATED",
            "METRIC_ADMIN_TARGET_CONFIRMED",
            "METRIC_ADMIN_TARGET_LOCKED",
            "METRIC_ADMIN_TARGET_DELETED",
            "METRIC_ADMIN_BASELINE_PROPOSED",
            "METRIC_ADMIN_BASELINE_UPDATED",
            "METRIC_ADMIN_BASELINE_CONFIRMED",
            "METRIC_ADMIN_BASELINE_LOCKED",
            "METRIC_ADMIN_BASELINE_DELETED",
          ],
        },
      },
    });
  }
}

async function summary(year: number, month: number, token: string, scope = "full") {
  return api(
    "GET",
    `/api/metrics/summary?year=${year}&month=${month}&week=40&quarter=4&comparison=1${scope === "dashboard" ? "&scope=dashboard" : ""}`,
    token
  );
}

function thuRow(res: any) {
  return (res.json?.comparison?.rows || []).find((r: any) => r.code === "THU_NSNN");
}

async function main() {
  console.log(`=== S2 PHASE B (YC-01/02) — ${TAG} ===`);
  console.log(`DB: ${dbUrl.replace(/\/\/[^@]+@/, "//***@")} | API: ${BASE}`);

  const leader = await login("demold01");
  const staff = await login("democb01");
  console.log("• Đăng nhập demold01 (UNIT_LEADER) + democb01 (STAFF)");

  const thu = await prisma.metricDefinition.findFirstOrThrow({ where: { code: "THU_NSNN" } });
  const thuClass = await prisma.metricClassification.findFirstOrThrow({
    where: { metricId: thu.id, active: true },
    orderBy: { sortOrder: "asc" },
  });
  evidence.metric = { code: thu.code, id: thu.id, classification: thuClass.label };
  evidence.fixture = ACC;

  // ============================================================
  // 1. Phân quyền: Q8 — metrics.*, không dùng system.config
  // ============================================================
  const staffCfg = await api("GET", "/api/metrics/admin", staff.token);
  check("1.1 STAFF không được xem/cấu hình chỉ tiêu giao (403)", staffCfg.status === 403, `HTTP ${staffCfg.status}`);

  const staffTarget = await api("POST", "/api/metrics/admin", staff.token, {
    entity: "target",
    action: "create",
    data: { metricId: thu.id, label: `${TAG} staff`, periodType: "YEAR", year: 2024, periodNo: null, value: "1" },
  });
  check("1.2 STAFF không được tạo chỉ tiêu giao (403)", staffTarget.status === 403, `HTTP ${staffTarget.status}`);

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: "SYSTEM_ADMIN" } });
  const adminPerson = await prisma.person.create({
    data: { code: `S2ADM${Date.now()}`, fullName: `${TAG} System Admin tạm` },
  });
  cleanup.personIds.push(adminPerson.id);
  const adminUsername = `s2admin${Date.now()}`;
  const adminAccount = await prisma.account.create({
    data: {
      personId: adminPerson.id,
      username: adminUsername,
      passwordHash: await bcrypt.hash(PASSWORD, 4),
    },
  });
  cleanup.accountIds.push(adminAccount.id);
  await prisma.roleGrant.create({
    data: { accountId: adminAccount.id, roleId: adminRole.id, scopeType: "ORGANIZATION" },
  });
  const adminLogin = await login(adminUsername);
  const adminCfg = await api("GET", "/api/metrics/admin", adminLogin.token);
  check(
    "1.3 SYSTEM_ADMIN không mặc nhiên có quyền nghiệp vụ số liệu (403)",
    adminCfg.status === 403,
    `HTTP ${adminCfg.status}; permissions=${JSON.stringify(adminLogin.user.permissions)}`
  );
  evidence.permissions = {
    leader: leader.user.permissions.filter((p: string) => p.startsWith("metrics.")),
    staff: staff.user.permissions.filter((p: string) => p.startsWith("metrics.")),
    systemAdmin: adminLogin.user.permissions.filter((p: string) => p.startsWith("metrics.")),
  };

  // ============================================================
  // 2. Q9 — dataSource/isOfficial + backfill, không dùng regex nhãn
  // ============================================================
  const legacyDemoTargets = await prisma.metricPlanTarget.count({ where: { label: { contains: "[DEMO" } } });
  const legacyDemoTargetsFlagged = await prisma.metricPlanTarget.count({
    where: { label: { contains: "[DEMO" }, dataSource: "DEMO" },
  });
  const legacyDemoLabelMisflagged = await prisma.metricPlanTarget.count({
    where: { label: { contains: "[DEMO" }, dataSource: "REAL" },
  });
  check(
    "2.1 Backfill target [DEMO] → dataSource=DEMO (migration rehearsal)",
    legacyDemoTargets > 0 && legacyDemoTargetsFlagged === legacyDemoTargets && legacyDemoLabelMisflagged === 0,
    `legacy=${legacyDemoTargets}, flagged=${legacyDemoTargetsFlagged}, misflagged=${legacyDemoLabelMisflagged}`
  );

  const legacyDemoBaselineLabels = await prisma.metricBaseline.count({
    where: { sourceNote: { contains: "[DEMO" } },
  });
  const baselineDemoFlagged = await prisma.metricBaseline.count({ where: { dataSource: "DEMO" } });
  const realBaselineWithDemoLabel = await prisma.metricBaseline.count({
    where: { sourceNote: { contains: "[DEMO" }, dataSource: "REAL" },
  });
  check(
    "2.2 Backfill baseline DEMO theo cờ dữ liệu",
    baselineDemoFlagged > 0 &&
      baselineDemoFlagged >= legacyDemoBaselineLabels &&
      realBaselineWithDemoLabel === 0,
    `demoBaselines=${baselineDemoFlagged}, legacyLabels=${legacyDemoBaselineLabels}, misflagged=${realBaselineWithDemoLabel}`
  );

  const demoEntriesFlagged = await prisma.metricDailyEntry.count({ where: { dataSource: "DEMO" } });
  check("2.3 Backfill entry DEMO theo cờ dữ liệu", demoEntriesFlagged > 0, `demoEntries=${demoEntriesFlagged}`);

  // ============================================================
  // 3. Tạo chỉ tiêu gốc + trạng thái + nguồn/căn cứ + lịch sử
  // ============================================================
  const mkTarget = async (opts: {
    label: string;
    periodType: string;
    year: number;
    periodNo: number | null;
    value: string;
    kind: string;
    dataSource?: "REAL" | "DEMO";
  }) =>
    api("POST", "/api/metrics/admin", leader.token, {
      entity: "target",
      action: "create",
      data: {
        metricId: thu.id,
        classificationId: "",
        label: opts.label,
        periodType: opts.periodType,
        year: opts.year,
        periodNo: opts.periodNo,
        value: opts.value,
        comparisonKind: opts.kind,
        dataSource: opts.dataSource || "REAL",
        sourceNote: `${TAG} căn cứ kiểm thử`,
        note: "Dữ liệu kiểm thử tự động",
      },
    });

  const btc = await mkTarget({
    label: `${TAG} BTC 2023`,
    periodType: "YEAR",
    year: ACC.year,
    periodNo: null,
    value: "1685000000000",
    kind: "BTC_YEAR",
  });
  const ubnd = await mkTarget({
    label: `${TAG} UBND 2023`,
    periodType: "YEAR",
    year: ACC.year,
    periodNo: null,
    value: "1700000000000",
    kind: "UBND_YEAR",
  });
  const monthPlan = await mkTarget({
    label: `${TAG} KH tháng 10/2023`,
    periodType: "MONTH",
    year: ACC.year,
    periodNo: ACC.month,
    value: "200000000000",
    kind: "MONTH_PLAN",
  });
  for (const r of [btc, ubnd, monthPlan]) if (r.json?.id) cleanup.targetIds.push(r.json.id);
  check(
    "3.1 Tạo được 3 chỉ tiêu gốc REAL (BTC/UBND/KH tháng)",
    !!btc.json?.id && !!ubnd.json?.id && !!monthPlan.json?.id
  );
  check(
    "3.2 API trả dataSource=REAL + isOfficial=true cho target thật",
    btc.json?.dataSource === "REAL" && btc.json?.isOfficial === true,
    JSON.stringify(btc.json)
  );
  check("3.3 Chỉ tiêu mới ở trạng thái PROPOSED", btc.json?.status === "PROPOSED", String(btc.json?.status));

  const cfg1 = await api("GET", "/api/metrics/admin", leader.token);
  const cfgMetric = (cfg1.json?.groups || []).flatMap((g: any) => g.metrics || []).find((m: any) => m.code === "THU_NSNN");
  const cfgBtc = (cfgMetric?.targets || []).find((t: any) => t.id === btc.json?.id);
  check(
    "3.4 API cấu hình trả nguồn/căn cứ + trạng thái + dataSource/isOfficial",
    !!cfgBtc &&
      cfgBtc.sourceNote === `${TAG} căn cứ kiểm thử` &&
      cfgBtc.status === "PROPOSED" &&
      cfgBtc.dataSource === "REAL" &&
      cfgBtc.isOfficial === true &&
      !!cfgBtc.proposedAt,
    JSON.stringify(cfgBtc || null)
  );

  const confirmTargets = await Promise.all(
    [btc, ubnd, monthPlan].map((r) =>
      api("POST", "/api/metrics/admin", leader.token, {
        entity: "target",
        action: "confirm",
        data: { id: r.json.id, metricId: thu.id, reason: "Xác nhận kiểm thử" },
      })
    )
  );
  check("3.5 Xác nhận được 3 chỉ tiêu gốc", confirmTargets.every((r) => r.status === 200 && r.json?.status === "CONFIRMED"));

  const revTargetCount = await prisma.metricPlanTargetRevision.count({ where: { targetId: { in: cleanup.targetIds } } });
  check("3.6 Lịch sử chỉ tiêu gốc ghi CREATE + CONFIRM (3×2)", revTargetCount === 6, `revisions=${revTargetCount}`);

  const auditTarget = await prisma.auditEvent.count({
    where: {
      resourceId: { in: cleanup.targetIds },
      action: { in: ["METRIC_ADMIN_TARGET_CREATED", "METRIC_ADMIN_TARGET_CONFIRMED"] },
    },
  });
  check("3.7 Audit ghi nhận tạo + xác nhận chỉ tiêu", auditTarget >= 6, `audit=${auditTarget}`);

  // ============================================================
  // 4. Mốc lũy kế + phát sinh ngày; chống cộng trùng
  // ============================================================
  const baseCreate = await api("POST", "/api/metrics/admin", leader.token, {
    entity: "baseline",
    action: "create",
    data: {
      metricId: thu.id,
      classificationId: thuClass.id,
      cumKind: "YEAR",
      asOfDate: "2023-09-30",
      value: String(ACC.baseline),
      dataSource: "REAL",
      sourceNote: `${TAG} mốc kiểm thử`,
      reason: `${TAG} nhập mốc kiểm thử (B2-A)`,
    },
  });
  if (baseCreate.json?.id) cleanup.baselineIds.push(baseCreate.json.id);
  check(
    "4.1 Tạo mốc lũy kế REAL ở trạng thái PROPOSED",
    baseCreate.status === 200 && baseCreate.json?.status === "PROPOSED" && baseCreate.json?.dataSource === "REAL"
  );

  const baseConfirm = await api("POST", "/api/metrics/admin", leader.token, {
    entity: "baseline",
    action: "confirm",
    data: { id: baseCreate.json.id, reason: "Xác nhận mốc kiểm thử" },
  });
  check("4.2 Xác nhận mốc lũy kế", baseConfirm.status === 200 && baseConfirm.json?.status === "CONFIRMED");

  const entryRes = await api("POST", "/api/metrics/entries", leader.token, {
    entries: [
      { metricId: thu.id, classificationId: thuClass.id, entryDate: "2023-09-15", value: String(ACC.prevMonthEntry), note: `${TAG} entry Sep` },
      { metricId: thu.id, classificationId: thuClass.id, entryDate: "2023-10-31", value: String(ACC.monthCum), note: `${TAG} entry Oct` },
    ],
  });
  const entryIds = (entryRes.json?.items || []).map((i: any) => i.entryId || i.id).filter(Boolean);
  cleanup.entryIds.push(...entryIds);
  check("4.3 Nhập được phát sinh ngày (2 bản ghi REAL)", entryRes.status === 200 && entryIds.length === 2);
  check(
    "4.4 Entry API trả dataSource=REAL/isOfficial=true",
    (entryRes.json?.items || []).every((i: any) => i.dataSource === "REAL" && i.isOfficial === true)
  );

  const sum1 = await summary(ACC.year, ACC.month, leader.token);
  const row1 = thuRow(sum1);
  check(
    "4.5 Lũy kế năm = mốc + phát sinh sau mốc (không cộng trùng)",
    row1?.yearCum === ACC.yearCum,
    `yearCum=${row1?.yearCum}`
  );
  check("4.6 Lũy kế tháng = phát sinh trong tháng", row1?.monthCum === ACC.monthCum, `monthCum=${row1?.monthCum}`);
  check("4.7 Số liệu đến ngày 31/10/2023", row1?.latestDate === "2023-10-31", String(row1?.latestDate));

  evidence.comparison = row1;

  // ============================================================
  // 5. Q11/YC-02 — tỷ lệ 2 chữ số thập phân + hợp đồng B-C-2
  // ============================================================
  check("5.1 Hợp đồng trả version B-C-2", sum1.json?.comparison?.version === "B-C-2", String(sum1.json?.comparison?.version));
  check(
    "5.2 % BTC = 78,18% (API percent 78.18 + percentText)",
    row1?.btc?.percent === 78.18 && row1?.btc?.percentText === "78,18",
    JSON.stringify({ percent: row1?.btc?.percent, text: row1?.btc?.percentText })
  );
  check(
    "5.3 % UBND = 77,49%",
    row1?.ubnd?.percent === 77.49 && row1?.ubnd?.percentText === "77,49",
    JSON.stringify({ percent: row1?.ubnd?.percent, text: row1?.ubnd?.percentText })
  );
  check(
    "5.4 % KH tháng = 109,67%",
    row1?.monthPlan?.percent === 109.67 && row1?.monthPlan?.percentText === "109,67",
    JSON.stringify({ percent: row1?.monthPlan?.percent, text: row1?.monthPlan?.percentText })
  );
  check(
    "5.5 Target trả dataSource=REAL + isOfficial=true khi tính chính thức",
    row1?.btc?.dataSource === "REAL" && row1?.btc?.isOfficial === true && row1?.btc?.status === "CONFIRMED"
  );
  check(
    "5.6 Tháng trước: so cùng số ngày đến cutoff, có % khi đủ dữ liệu (B1-A)",
    row1?.prevMonth?.value === ACC.prevMonthEntry && row1?.prevMonth?.percent !== null && row1?.prevMonth?.ruleState === "SAME_DAYS" && row1?.prevMonth?.basis === "SAME_DAYS_TO_CUTOFF",
    JSON.stringify(row1?.prevMonth)
  );
  check(
    "5.7 Cùng kỳ năm trước: thiếu dữ liệu → NO_DATA, không 0% (B1-A)",
    row1?.samePeriodLastYear?.percent === null
      ? row1?.samePeriodLastYear?.ruleState === "NO_DATA"
      : typeof row1?.samePeriodLastYear?.percent === "number",
    JSON.stringify(row1?.samePeriodLastYear)
  );

  const dash = await summary(ACC.year, ACC.month, leader.token, "dashboard");
  const dashRow = thuRow(dash);
  check(
    "5.8 Dashboard dùng cùng hợp đồng: % BTC/UBND/KH tháng khớp /giao-ban",
    dashRow?.btc?.percent === row1?.btc?.percent &&
      dashRow?.ubnd?.percent === row1?.ubnd?.percent &&
      dashRow?.monthPlan?.percent === row1?.monthPlan?.percent,
    JSON.stringify({ btc: dashRow?.btc?.percent, ubnd: dashRow?.ubnd?.percent, kh: dashRow?.monthPlan?.percent })
  );

  // ============================================================
  // 6. Q9 — nhãn không quyết định; DEMO không tính chính thức
  // ============================================================
  const demoCountBefore = await prisma.metricPlanTarget.count({ where: { dataSource: "DEMO" } });
  const realWithDemoLabel = await mkTarget({
    label: `[DEMO] ${TAG} nhãn DEMO nhưng dataSource REAL`,
    periodType: "YEAR",
    year: 2024,
    periodNo: null,
    value: "1000",
    kind: "BTC_YEAR",
    dataSource: "REAL",
  });
  if (realWithDemoLabel.json?.id) cleanup.targetIds.push(realWithDemoLabel.json.id);
  await api("POST", "/api/metrics/admin", leader.token, {
    entity: "target",
    action: "confirm",
    data: { id: realWithDemoLabel.json.id, metricId: thu.id, reason: "Xác nhận kiểm thử nhãn" },
  });
  const sum2024 = await summary(2024, 1, leader.token);
  const row2024 = thuRow(sum2024);
  check(
    "6.1 Target nhãn [DEMO] nhưng dataSource REAL vẫn là nguồn thật (isOfficial=true)",
    row2024?.btc?.targetValue === 1000 && row2024?.btc?.isOfficial === true && row2024?.btc?.ruleState === "OFFICIAL",
    JSON.stringify(row2024?.btc)
  );

  const demoCountAfterRealLabel = await prisma.metricPlanTarget.count({ where: { dataSource: "DEMO" } });
  check(
    "6.2 Target nhãn [DEMO] + dataSource REAL không làm tăng demoTargets",
    demoCountAfterRealLabel === demoCountBefore,
    `before=${demoCountBefore}, after=${demoCountAfterRealLabel}`
  );

  const demo2025 = await mkTarget({
    label: `${TAG} BTC 2025 DEMO không nhãn`,
    periodType: "YEAR",
    year: 2025,
    periodNo: null,
    value: "500",
    kind: "BTC_YEAR",
    dataSource: "DEMO",
  });
  if (demo2025.json?.id) cleanup.targetIds.push(demo2025.json.id);
  await api("POST", "/api/metrics/admin", leader.token, {
    entity: "target",
    action: "confirm",
    data: { id: demo2025.json.id, metricId: thu.id, reason: "Xác nhận kiểm thử DEMO" },
  });
  const sum2025 = await summary(2025, 1, leader.token);
  const row2025 = thuRow(sum2025);
  check(
    "6.3 Target dataSource=DEMO không được dùng tính % chính thức",
    row2025?.btc?.targetValue === null && row2025?.btc?.ruleState === "NO_TARGET",
    JSON.stringify(row2025?.btc)
  );

  // ============================================================
  // 7. Mẫu số 0 + target PROPOSED không tạo %
  // ============================================================
  const updateZero = await api("POST", "/api/metrics/admin", leader.token, {
    entity: "target",
    action: "update",
    data: {
      id: realWithDemoLabel.json.id,
      metricId: thu.id,
      label: `[DEMO] ${TAG} nhãn DEMO nhưng dataSource REAL`,
      periodType: "YEAR",
      year: 2024,
      periodNo: null,
      value: "0",
      comparisonKind: "BTC_YEAR",
      dataSource: "REAL",
      sourceNote: `${TAG} căn cứ kiểm thử (sửa về 0)`,
      reason: "Kiểm thử mẫu số 0",
    },
  });
  check("7.1 Sửa chỉ tiêu đã xác nhận quay về PROPOSED (buộc xác nhận lại)", updateZero.json?.status === "PROPOSED", JSON.stringify(updateZero.json));
  await api("POST", "/api/metrics/admin", leader.token, {
    entity: "target",
    action: "confirm",
    data: { id: realWithDemoLabel.json.id, metricId: thu.id, reason: "Xác nhận lại sau sửa" },
  });
  const sumZero = await summary(2024, 1, leader.token);
  const rowZero = thuRow(sumZero);
  check(
    "7.2 Mẫu số 0 → percent null (không hiện 0%)",
    rowZero?.btc?.targetValue === 0 && rowZero?.btc?.percent === null && rowZero?.btc?.percentText === null,
    JSON.stringify(rowZero?.btc)
  );

  const proposed2026 = await mkTarget({
    label: `${TAG} BTC 2026 chưa xác nhận`,
    periodType: "YEAR",
    year: 2026,
    periodNo: null,
    value: "500",
    kind: "BTC_YEAR",
    dataSource: "REAL",
  });
  if (proposed2026.json?.id) cleanup.targetIds.push(proposed2026.json.id);
  const sum2026 = await summary(2026, 1, leader.token);
  const row2026 = thuRow(sum2026);
  check(
    "7.3 Target REAL nhưng PROPOSED không được tính % chính thức",
    row2026?.btc?.status === "PROPOSED" &&
      row2026?.btc?.isOfficial === true &&
      row2026?.btc?.percent === null &&
      row2026?.btc?.ruleState === "PROPOSED",
    JSON.stringify(row2026?.btc)
  );

  // ============================================================
  // 8. Chống xóa mất lịch sử + lịch sử sửa mốc
  // ============================================================
  const delConfirmed = await api("POST", "/api/metrics/admin", leader.token, {
    entity: "target",
    action: "delete",
    data: { id: btc.json.id, metricId: thu.id },
  });
  check("8.1 Không xóa được chỉ tiêu đã xác nhận/chốt", delConfirmed.status === 400, `HTTP ${delConfirmed.status}`);

  const delProposed = await api("POST", "/api/metrics/admin", leader.token, {
    entity: "target",
    action: "delete",
    data: { id: proposed2026.json.id, metricId: thu.id },
  });
  const deletedRev = await prisma.metricPlanTargetRevision.count({
    where: { targetId: proposed2026.json.id, action: "DELETE" },
  });
  check("8.2 Xóa target PROPOSED nhưng vẫn giữ revision DELETE", delProposed.status === 200 && deletedRev === 1, `revisionDelete=${deletedRev}`);

  const baseUpdate = await api("POST", "/api/metrics/admin", leader.token, {
    entity: "baseline",
    action: "update",
    data: {
      id: baseCreate.json.id,
      value: String(ACC.baseline),
      asOfDate: "2023-09-30",
      dataSource: "REAL",
      sourceNote: `${TAG} mốc sửa`,
      reason: "Kiểm thử sửa mốc",
    },
  });
  check("8.3 Sửa mốc đã xác nhận quay về PROPOSED", baseUpdate.json?.status === "PROPOSED", JSON.stringify(baseUpdate.json));
  const baseRev = await prisma.metricBaselineRevision.count({ where: { baselineId: baseCreate.json.id } });
  check("8.4 Lịch sử mốc ghi CREATE + CONFIRM + UPDATE", baseRev === 3, `revisions=${baseRev}`);

  const sumBaseDraft = await summary(ACC.year, ACC.month, leader.token);
  const rowBaseDraft = thuRow(sumBaseDraft);
  check(
    "8.5 Mốc chưa xác nhận lại không được dùng (năm = tổng phát sinh 219.341.201.906)",
    rowBaseDraft?.yearCum === ACC.monthCum + ACC.prevMonthEntry,
    `yearCum=${rowBaseDraft?.yearCum}`
  );

  await api("POST", "/api/metrics/admin", leader.token, {
    entity: "baseline",
    action: "confirm",
    data: { id: baseCreate.json.id, reason: "Xác nhận lại mốc sau sửa" },
  });
  const sumBaseFixed = await summary(ACC.year, ACC.month, leader.token);
  const rowBaseFixed = thuRow(sumBaseFixed);
  check("8.6 Mốc xác nhận lại + phát sinh = 1.317.372.334.554 (không cộng trùng)", rowBaseFixed?.yearCum === ACC.yearCum, `yearCum=${rowBaseFixed?.yearCum}`);

  const baseLock = await api("POST", "/api/metrics/admin", leader.token, {
    entity: "baseline",
    action: "lock",
    data: { id: baseCreate.json.id, reason: "Chốt mốc kiểm thử" },
  });
  const sumBaseLocked = await summary(ACC.year, ACC.month, leader.token);
  const rowBaseLocked = thuRow(sumBaseLocked);
  check(
    "8.7 Mốc LOCKED vẫn được dùng tính lũy kế",
    baseLock.json?.status === "LOCKED" && rowBaseLocked?.yearCum === ACC.yearCum,
    `status=${baseLock.json?.status}, yearCum=${rowBaseLocked?.yearCum}`
  );

  // ============================================================
  // 9. Lịch sử bản ghi ngày + dataSource
  // ============================================================
  const histEntry = await api("GET", `/api/metrics/entries?history=${encodeURIComponent(entryIds[0])}`, leader.token);
  check(
    "9.1 Lịch sử bản ghi ngày trả revision CREATE + người nhập",
    histEntry.status === 200 && (histEntry.json?.revisions || []).some((r: any) => r.action === "CREATE" && r.editedByName),
    JSON.stringify(histEntry.json?.revisions?.[0] || null)
  );

  const entryCheck = await prisma.metricDailyEntry.findFirst({ where: { id: entryIds[0] } });
  check("9.2 Entry do tài khoản thật nhập có dataSource=REAL", entryCheck?.dataSource === "REAL", String(entryCheck?.dataSource));

  evidence.totals = { passed, failed };

  await cleanupAll();
  console.log("\n• Đã dọn dữ liệu kiểm thử.");

  console.log(`\n=== KẾT QUẢ: ${passed} PASS / ${failed} FAIL ===`);
  if (failed > 0) {
    console.log("FAILURES:");
    for (const f of failures) console.log(" - " + f);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    OUT_FILE,
    JSON.stringify(
      {
        session: "S2",
        yc: ["YC-01", "YC-02"],
        contract: "B-C-2",
        timestamp: new Date().toISOString(),
        db: "talung_v3_phase_b",
        api: BASE,
        passed,
        failed,
        failures,
        evidence,
      },
      null,
      2
    ),
    "utf8"
  );
  console.log(`• Bằng chứng: ${OUT_FILE}`);

  if (failed > 0) process.exitCode = 1;
}

main()
  .catch(async (err) => {
    console.error("LỖI BỘ TEST:", err);
    try {
      await cleanupAll();
    } catch (e) {
      console.error("Lỗi dọn dẹp:", e);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
