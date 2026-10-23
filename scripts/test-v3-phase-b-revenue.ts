/**
 * S2 — Phase B / YC-01/02 regression trên DB kiểm thử.
 *
 * CHỈ chạy trên môi trường cách ly:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/talung_v3_phase_b
 *   TEST_BASE_URL=http://localhost:3112
 *   npx tsx scripts/test-v3-phase-b-revenue.ts
 *
 * Bộ test này tạo dữ liệu tạm (target/mốc/bản ghi ngày) và DỌN SẠCH trong finally.
 * Không dùng dữ liệu Production, không hard-code số Excel.
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

const round1 = (n: number) => Math.round(n * 10) / 10;

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
  // Revision lưu độc lập (không FK cascade) → dọn theo id trước/sau đều được.
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
  // Audit test: dọn để lần chạy sau không nhiễu.
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

  // ============================================================
  // 1. Phân quyền: không dùng system.config cho nghiệp vụ
  // ============================================================
  const staffCfg = await api("GET", "/api/metrics/admin", staff.token);
  check("1.1 STAFF không được xem/cấu hình chỉ tiêu giao (403)", staffCfg.status === 403, `HTTP ${staffCfg.status}`);

  const staffTarget = await api("POST", "/api/metrics/admin", staff.token, {
    entity: "target",
    action: "create",
    data: { metricId: thu.id, label: `${TAG} staff`, periodType: "YEAR", year: 2024, periodNo: null, value: "1" },
  });
  check("1.2 STAFF không được tạo chỉ tiêu giao (403)", staffTarget.status === 403, `HTTP ${staffTarget.status}`);

  // Tạo tạm SYSTEM_ADMIN (không có metrics.config) để chứng minh system.config không mở quyền nghiệp vụ.
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
  // 2. Tạo chỉ tiêu gốc + trạng thái + nguồn/căn cứ + lịch sử
  // ============================================================
  const mkTarget = async (label: string, periodType: string, year: number, periodNo: number | null, value: string, kind: string) =>
    api("POST", "/api/metrics/admin", leader.token, {
      entity: "target",
      action: "create",
      data: {
        metricId: thu.id,
        classificationId: "",
        label,
        periodType,
        year,
        periodNo,
        value,
        comparisonKind: kind,
        sourceNote: `${TAG} căn cứ kiểm thử`,
        note: "Dữ liệu kiểm thử tự động",
      },
    });

  const btc = await mkTarget(`${TAG} BTC 2024`, "YEAR", 2024, null, "1000", "BTC_YEAR");
  const ubnd = await mkTarget(`${TAG} UBND 2024`, "YEAR", 2024, null, "500", "UBND_YEAR");
  const monthPlan = await mkTarget(`${TAG} KH tháng 02/2024`, "MONTH", 2024, 2, "100", "MONTH_PLAN");
  for (const r of [btc, ubnd, monthPlan]) if (r.json?.id) cleanup.targetIds.push(r.json.id);
  check("2.1 Tạo được 3 chỉ tiêu gốc tường minh (BTC/UBND/KH tháng)", !!btc.json?.id && !!ubnd.json?.id && !!monthPlan.json?.id);
  check("2.2 Chỉ tiêu mới ở trạng thái PROPOSED", btc.json?.status === "PROPOSED", String(btc.json?.status));

  const cfg1 = await api("GET", "/api/metrics/admin", leader.token);
  const cfgMetric = (cfg1.json?.groups || []).flatMap((g: any) => g.metrics || []).find((m: any) => m.code === "THU_NSNN");
  const cfgBtc = (cfgMetric?.targets || []).find((t: any) => t.id === btc.json?.id);
  check(
    "2.3 API cấu hình trả nguồn/căn cứ + trạng thái + người đề xuất",
    !!cfgBtc && cfgBtc.sourceNote === `${TAG} căn cứ kiểm thử` && cfgBtc.status === "PROPOSED" && !!cfgBtc.proposedAt,
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
  check("2.4 Xác nhận được 3 chỉ tiêu gốc", confirmTargets.every((r) => r.status === 200 && r.json?.status === "CONFIRMED"));

  const revTargetCount = await prisma.metricPlanTargetRevision.count({ where: { targetId: { in: cleanup.targetIds } } });
  check("2.5 Lịch sử chỉ tiêu gốc ghi CREATE + CONFIRM (3×2)", revTargetCount === 6, `revisions=${revTargetCount}`);

  const auditTarget = await prisma.auditEvent.count({
    where: {
      resourceId: { in: cleanup.targetIds },
      action: { in: ["METRIC_ADMIN_TARGET_CREATED", "METRIC_ADMIN_TARGET_CONFIRMED"] },
    },
  });
  check("2.6 Audit ghi nhận tạo + xác nhận chỉ tiêu", auditTarget >= 6, `audit=${auditTarget}`);

  // ============================================================
  // 3. Mốc lũy kế + phát sinh ngày; chống cộng trùng
  // ============================================================
  const baseCreate = await api("POST", "/api/metrics/admin", leader.token, {
    entity: "baseline",
    action: "create",
    data: {
      metricId: thu.id,
      classificationId: thuClass.id,
      cumKind: "YEAR",
      asOfDate: "2024-01-31",
      value: "100",
      sourceNote: `${TAG} mốc kiểm thử`,
    },
  });
  if (baseCreate.json?.id) cleanup.baselineIds.push(baseCreate.json.id);
  check("3.1 Tạo mốc lũy kế ở trạng thái PROPOSED", baseCreate.status === 200 && baseCreate.json?.status === "PROPOSED");

  const baseConfirm = await api("POST", "/api/metrics/admin", leader.token, {
    entity: "baseline",
    action: "confirm",
    data: { id: baseCreate.json.id, reason: "Xác nhận mốc kiểm thử" },
  });
  check("3.2 Xác nhận mốc lũy kế", baseConfirm.status === 200 && baseConfirm.json?.status === "CONFIRMED");

  const entryRes = await api("POST", "/api/metrics/entries", leader.token, {
    entries: [
      { metricId: thu.id, classificationId: thuClass.id, entryDate: "2024-01-15", value: "50", note: `${TAG} entry Jan` },
      { metricId: thu.id, classificationId: thuClass.id, entryDate: "2024-02-01", value: "10", note: `${TAG} entry Feb 1` },
      { metricId: thu.id, classificationId: thuClass.id, entryDate: "2024-02-02", value: "5", note: `${TAG} entry Feb 2` },
    ],
  });
  const entryIds = (entryRes.json?.items || []).map((i: any) => i.entryId || i.id).filter(Boolean);
  cleanup.entryIds.push(...entryIds);
  check("3.3 Nhập được phát sinh ngày (3 bản ghi)", entryRes.status === 200 && entryIds.length === 3, JSON.stringify(entryRes.json?.errors || null));

  const sum1 = await api("GET", `/api/metrics/summary?year=2024&month=2&week=6&quarter=1&comparison=1`, leader.token);
  const row1 = (sum1.json?.comparison?.rows || []).find((r: any) => r.code === "THU_NSNN");
  check("3.4 Lũy kế năm 2024 = mốc 100 + phát sinh sau mốc 15 = 115 (không cộng trùng)", row1?.yearCum === 115, `yearCum=${row1?.yearCum}`);
  check("3.5 Lũy kế tháng 02 = 10 + 5 = 15", row1?.monthCum === 15, `monthCum=${row1?.monthCum}`);
  check("3.6 Số liệu đến ngày 02/02/2024", row1?.latestDate === "2024-02-02", String(row1?.latestDate));

  evidence.comparison = row1;

  // ============================================================
  // 4. Tỷ lệ tự tính + hợp đồng B-C-1
  // ============================================================
  check("4.1 Hợp đồng trả version B-C-1", sum1.json?.comparison?.version === "B-C-1", String(sum1.json?.comparison?.version));
  check("4.2 % BTC = 115/1000 = 11.5%", row1?.btc?.percent === 11.5, `${row1?.btc?.percent}%`);
  check("4.3 % UBND = 115/500 = 23%", row1?.ubnd?.percent === 23, `${row1?.ubnd?.percent}%`);
  check("4.4 % KH tháng = 15/100 = 15%", row1?.monthPlan?.percent === 15, `${row1?.monthPlan?.percent}%`);
  check("4.5 Target trả kèm nguồn/căn cứ + trạng thái đã xác nhận", row1?.btc?.status === "CONFIRMED" && row1?.btc?.sourceNote?.startsWith(TAG), JSON.stringify({ status: row1?.btc?.status, source: row1?.btc?.sourceNote }));
  check(
    "4.6 Tháng trước: có giá trị 50 nhưng KHÔNG công bố % (B1 pending)",
    row1?.prevMonth?.value === 50 && row1?.prevMonth?.percent === null && row1?.prevMonth?.ruleState === "PENDING_B1",
    JSON.stringify(row1?.prevMonth)
  );
  check(
    "4.7 Cùng kỳ năm trước: percent null + PENDING_B1",
    row1?.samePeriodLastYear?.percent === null && row1?.samePeriodLastYear?.ruleState === "PENDING_B1",
    JSON.stringify(row1?.samePeriodLastYear)
  );

  const dash = await api("GET", `/api/metrics/summary?scope=dashboard&year=2024&month=2&week=6&quarter=1&comparison=1`, leader.token);
  const dashRow = (dash.json?.comparison?.rows || []).find((r: any) => r.code === "THU_NSNN");
  check(
    "4.8 Dashboard dùng cùng hợp đồng: % BTC/UBND/KH tháng khớp /giao-ban",
    dashRow?.btc?.percent === row1?.btc?.percent &&
      dashRow?.ubnd?.percent === row1?.ubnd?.percent &&
      dashRow?.monthPlan?.percent === row1?.monthPlan?.percent,
    JSON.stringify({ btc: dashRow?.btc?.percent, ubnd: dashRow?.ubnd?.percent, kh: dashRow?.monthPlan?.percent })
  );

  // ============================================================
  // 5. Mẫu số 0 và target chưa xác nhận không tạo %
  // ============================================================
  const updateZero = await api("POST", "/api/metrics/admin", leader.token, {
    entity: "target",
    action: "update",
    data: {
      id: btc.json.id,
      metricId: thu.id,
      label: `${TAG} BTC 2024`,
      periodType: "YEAR",
      year: 2024,
      periodNo: null,
      value: "0",
      comparisonKind: "BTC_YEAR",
      sourceNote: `${TAG} căn cứ kiểm thử (sửa về 0)`,
      reason: "Kiểm thử mẫu số 0",
    },
  });
  check("5.1 Sửa chỉ tiêu đã xác nhận quay về PROPOSED (buộc xác nhận lại)", updateZero.json?.status === "PROPOSED", JSON.stringify(updateZero.json));
  await api("POST", "/api/metrics/admin", leader.token, {
    entity: "target",
    action: "confirm",
    data: { id: btc.json.id, metricId: thu.id, reason: "Xác nhận lại sau sửa" },
  });
  const sumZero = await api("GET", `/api/metrics/summary?year=2024&month=2&week=6&quarter=1&comparison=1`, leader.token);
  const rowZero = (sumZero.json?.comparison?.rows || []).find((r: any) => r.code === "THU_NSNN");
  check(
    "5.2 Mẫu số 0 → percent null (không hiện 0%)",
    rowZero?.btc?.targetValue === 0 && rowZero?.btc?.percent === null,
    JSON.stringify(rowZero?.btc)
  );

  const proposed2025 = await mkTarget(`${TAG} BTC 2025 chưa xác nhận`, "YEAR", 2025, null, "500", "BTC_YEAR");
  if (proposed2025.json?.id) cleanup.targetIds.push(proposed2025.json.id);
  const sum2025 = await api("GET", `/api/metrics/summary?year=2025&month=1&week=1&quarter=1&comparison=1`, leader.token);
  const row2025 = (sum2025.json?.comparison?.rows || []).find((r: any) => r.code === "THU_NSNN");
  check(
    "5.3 Target PROPOSED không được dùng tính % chính thức",
    row2025?.btc?.status === "PROPOSED" && row2025?.btc?.percent === null && row2025?.btc?.ruleState === "PROPOSED",
    JSON.stringify(row2025?.btc)
  );

  // ============================================================
  // 6. Chống xóa mất lịch sử + lịch sử sửa mốc
  // ============================================================
  const delConfirmed = await api("POST", "/api/metrics/admin", leader.token, {
    entity: "target",
    action: "delete",
    data: { id: btc.json.id, metricId: thu.id },
  });
  check("6.1 Không xóa được chỉ tiêu đã xác nhận/chốt", delConfirmed.status === 400, `HTTP ${delConfirmed.status}`);

  const delProposed = await api("POST", "/api/metrics/admin", leader.token, {
    entity: "target",
    action: "delete",
    data: { id: proposed2025.json.id, metricId: thu.id },
  });
  const deletedRev = await prisma.metricPlanTargetRevision.count({
    where: { targetId: proposed2025.json.id, action: "DELETE" },
  });
  check("6.2 Xóa target PROPOSED nhưng vẫn giữ revision DELETE", delProposed.status === 200 && deletedRev === 1, `revisionDelete=${deletedRev}`);

  const baseUpdate = await api("POST", "/api/metrics/admin", leader.token, {
    entity: "baseline",
    action: "update",
    data: { id: baseCreate.json.id, value: "120", asOfDate: "2024-01-31", sourceNote: `${TAG} mốc sửa`, reason: "Kiểm thử sửa mốc" },
  });
  check("6.3 Sửa mốc đã xác nhận quay về PROPOSED", baseUpdate.json?.status === "PROPOSED", JSON.stringify(baseUpdate.json));
  const baseRev = await prisma.metricBaselineRevision.count({ where: { baselineId: baseCreate.json.id } });
  check("6.4 Lịch sử mốc ghi CREATE + CONFIRM + UPDATE", baseRev === 3, `revisions=${baseRev}`);

  const sumBaseDraft = await api("GET", `/api/metrics/summary?year=2024&month=2&week=6&quarter=1&comparison=1`, leader.token);
  const rowBaseDraft = (sumBaseDraft.json?.comparison?.rows || []).find((r: any) => r.code === "THU_NSNN");
  check(
    "6.5 Mốc chưa xác nhận lại không được dùng (năm = tổng phát sinh 65)",
    rowBaseDraft?.yearCum === 65,
    `yearCum=${rowBaseDraft?.yearCum}`
  );

  await api("POST", "/api/metrics/admin", leader.token, {
    entity: "baseline",
    action: "confirm",
    data: { id: baseCreate.json.id, reason: "Xác nhận lại mốc sau sửa" },
  });
  const sumBaseFixed = await api("GET", `/api/metrics/summary?year=2024&month=2&week=6&quarter=1&comparison=1`, leader.token);
  const rowBaseFixed = (sumBaseFixed.json?.comparison?.rows || []).find((r: any) => r.code === "THU_NSNN");
  check(
    "6.6 Mốc xác nhận lại 120 + phát sinh 15 = 135 (không cộng trùng)",
    rowBaseFixed?.yearCum === 135,
    `yearCum=${rowBaseFixed?.yearCum}`
  );

  const baseLock = await api("POST", "/api/metrics/admin", leader.token, {
    entity: "baseline",
    action: "lock",
    data: { id: baseCreate.json.id, reason: "Chốt mốc kiểm thử" },
  });
  const sumBaseLocked = await api("GET", `/api/metrics/summary?year=2024&month=2&week=6&quarter=1&comparison=1`, leader.token);
  const rowBaseLocked = (sumBaseLocked.json?.comparison?.rows || []).find((r: any) => r.code === "THU_NSNN");
  check(
    "6.7 Mốc LOCKED vẫn được dùng tính lũy kế",
    baseLock.json?.status === "LOCKED" && rowBaseLocked?.yearCum === 135,
    `status=${baseLock.json?.status}, yearCum=${rowBaseLocked?.yearCum}`
  );

  // ============================================================
  // 7. Lịch sử bản ghi ngày
  // ============================================================
  const histEntry = await api("GET", `/api/metrics/entries?history=${encodeURIComponent(entryIds[0])}`, leader.token);
  check(
    "7.1 Lịch sử bản ghi ngày trả revision CREATE + người nhập",
    histEntry.status === 200 && (histEntry.json?.revisions || []).some((r: any) => r.action === "CREATE" && r.editedByName),
    JSON.stringify(histEntry.json?.revisions?.[0] || null)
  );

  evidence.totals = { passed, failed };

  // ============================================================
  // Dọn dẹp
  // ============================================================
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
        contract: "B-C-1",
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
