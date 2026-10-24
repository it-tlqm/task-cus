/**
 * S3 — Phase C: DB test cho service target-only (D7=A).
 *
 * Chỉ chạy trên `talung_v3_phase_c`; tạo rồi dọn sạch target/revision/audit test.
 * Không dùng HTTP server, không Production.
 *
 * Chạy:
 *   npx tsx --env-file=.env scripts/test-phase-c-target-api.ts
 */
import { prisma } from "../src/server/db";
import type { SessionUser } from "../src/server/auth";
import {
  MetricTargetError,
  confirmMetricTarget,
  createMetricTarget,
  getMetricTarget,
  listMetricTargetRevisions,
  listMetricTargets,
  lockMetricTarget,
  updateMetricTarget,
  voidMetricTarget,
} from "../src/server/metric-targets";

const DB = process.env.DIRECT_URL || process.env.DATABASE_URL || "";
if (!DB.includes("talung_v3_phase_c") && !DB.includes("talung_v3_fixture_integration")) {
  throw new Error("TỪ CHỐI CHẠY: chỉ dùng database test talung_v3_phase_c hoặc talung_v3_fixture_integration.");
}

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    passed++;
    console.log(`PASS  ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`FAIL  ${name}${detail === undefined ? "" : ` :: ${JSON.stringify(detail)}`}`);
  }
}

async function expectError(fn: () => Promise<unknown>, status: number, code?: string) {
  try {
    await fn();
    return false;
  } catch (e) {
    return e instanceof MetricTargetError && e.statusCode === status && (!code || e.message.includes(code));
  }
}

async function main() {
  const account = await prisma.account.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { username: "asc" },
    select: {
      id: true,
      username: true,
      personId: true,
      person: { select: { code: true, fullName: true, status: true } },
    },
  });
  if (!account || account.person.status !== "ACTIVE") throw new Error("Không có account/person ACTIVE để chạy test.");

  const manager: SessionUser = {
    id: account.id,
    personId: account.personId,
    username: account.username,
    fullName: account.person.fullName,
    personCode: account.person.code,
    role: "UNIT_LEADER",
    scopeType: "ORGANIZATION",
    permissions: ["metrics.config"],
  };
  const denied: SessionUser = {
    ...manager,
    id: "staff-test",
    personId: "staff-test",
    username: "staff-test",
    role: "STAFF",
    permissions: [],
  };

  const metric = await prisma.metricDefinition.findFirstOrThrow({ where: { code: "THU_NSNN" } });
  const tag = `S3-TGT-${Date.now()}`;
  const createdIds: string[] = [];
  const labels: string[] = [];

  try {
    const base = await createMetricTarget(manager, {
      metricId: metric.id,
      label: `${tag}-A`,
      periodType: "YEAR",
      year: 2026,
      periodNo: null,
      value: "1000",
      comparisonKind: "NONE",
      dataSource: "REAL",
      sourceNote: "",
      note: "test",
    });
    createdIds.push(base.id);
    labels.push(base.label);
    check("A1. Create trả PROPOSED", base.status === "PROPOSED");
    check("A2. dataSource REAL → isOfficial true", base.isOfficial === true && base.dataSource === "REAL");
    check("A3. D5 rules THU_NSNN năm: HIGHER/CUMULATIVE/YEAR_START", base.rules.officialPercentAllowed === true && base.rules.direction === "HIGHER_IS_BETTER" && base.rules.measureMode === "CUMULATIVE" && base.rules.baselineScope === "YEAR_START");
    check("A3b. D5 semantics có top-level trên target view", base.direction === "HIGHER_IS_BETTER" && base.measureMode === "CUMULATIVE" && base.baselineScope === "YEAR_START" && base.targetApplicable === true);
    check("A4. valueBase đúng đơn vị gốc", base.valueBase === 1000);
    check("A5. Có revision CREATE", base.revisionCount === 1);

    check("A6. Confirm thiếu nguồn → 400", await expectError(() => confirmMetricTarget(manager, base.id, {}), 400, "nguồn"));
    const updated = await updateMetricTarget(manager, base.id, {
      label: `${tag}-A`,
      periodType: "YEAR",
      year: 2026,
      periodNo: null,
      value: "1000",
      comparisonKind: "NONE",
      dataSource: "REAL",
      sourceNote: `${tag} nguồn test`,
      note: "test updated",
    });
    check("A7. Update giữ PROPOSED + ghi nguồn", updated.status === "PROPOSED" && updated.sourceNote === `${tag} nguồn test`);
    check("A8. Update revisionCount=2", updated.revisionCount === 2);

    const confirmed = await confirmMetricTarget(manager, base.id, { reason: "test confirm" });
    check("A9. Confirm → CONFIRMED", confirmed.status === "CONFIRMED" && confirmed.confirmedByName === account.person.fullName);
    check("A10. Confirm giữ rules D5-A đã duyệt", confirmed.rules.officialPercentAllowed === true && confirmed.rules.baselineScope === "YEAR_START");

    const locked = await lockMetricTarget(manager, base.id, { reason: "test lock" });
    check("A11. Lock → LOCKED", locked.status === "LOCKED" && Boolean(locked.lockedAt));
    check("A12. Update LOCKED → 400", await expectError(() => updateMetricTarget(manager, base.id, { label: `${tag}-A`, periodType: "YEAR", year: 2026, periodNo: null, value: "999", comparisonKind: "NONE", dataSource: "REAL" }), 400, "đã chốt"));

    const revisions = await listMetricTargetRevisions(manager, base.id);
    check("A13. Revision có CREATE/UPDATE/CONFIRM/LOCK", ["CREATE", "UPDATE", "CONFIRM", "LOCK"].every((a) => revisions.some((r) => r.action === a)));
    check("A14. Revision lưu old/new value", revisions.some((r) => r.action === "UPDATE" && r.oldValue === 1000 && r.newValue === 1000));

    const demo = await createMetricTarget(manager, {
      metricId: metric.id,
      label: `${tag}-DEMO`,
      periodType: "YEAR",
      year: 2026,
      periodNo: null,
      value: "2000",
      comparisonKind: "NONE",
      dataSource: "DEMO",
      sourceNote: "demo test",
    });
    createdIds.push(demo.id);
    labels.push(demo.label);
    check("A15. DEMO → isOfficial false", demo.isOfficial === false && demo.dataSource === "DEMO");
    check("A16. DEMO vẫn PROPOSED, không tự official", demo.status === "PROPOSED");

    const realBtc = await createMetricTarget(manager, {
      metricId: metric.id,
      label: `${tag}-BTC-REAL`,
      periodType: "YEAR",
      year: 2026,
      periodNo: null,
      value: "3000",
      comparisonKind: "BTC_YEAR",
      dataSource: "REAL",
      sourceNote: "btc real",
    });
    createdIds.push(realBtc.id);
    labels.push(realBtc.label);
    const demoBtc = await createMetricTarget(manager, {
      metricId: metric.id,
      label: `${tag}-BTC-DEMO`,
      periodType: "YEAR",
      year: 2026,
      periodNo: null,
      value: "3100",
      comparisonKind: "BTC_YEAR",
      dataSource: "DEMO",
      sourceNote: "btc demo",
    });
    createdIds.push(demoBtc.id);
    labels.push(demoBtc.label);
    check("A17. Cùng comparisonKind khác dataSource được phép", realBtc.id !== demoBtc.id);
    check("A18. Trùng comparisonKind cùng dataSource → 400", await expectError(() => createMetricTarget(manager, {
      metricId: metric.id,
      label: `${tag}-BTC-REAL-2`,
      periodType: "YEAR",
      year: 2026,
      periodNo: null,
      value: "3200",
      comparisonKind: "BTC_YEAR",
      dataSource: "REAL",
      sourceNote: "dup",
    }), 400, "cùng loại"));

    const toVoid = await createMetricTarget(manager, {
      metricId: metric.id,
      label: `${tag}-VOID`,
      periodType: "YEAR",
      year: 2026,
      periodNo: null,
      value: "4000",
      comparisonKind: "NONE",
      dataSource: "REAL",
      sourceNote: "void test",
    });
    createdIds.push(toVoid.id);
    labels.push(toVoid.label);
    await voidMetricTarget(manager, toVoid.id, { reason: "test void" });
    check("A19. Void PROPOSED → xóa target", (await prisma.metricPlanTarget.count({ where: { id: toVoid.id } })) === 0);
    check("A20. Void giữ revision DELETE", (await listMetricTargetRevisions(manager, toVoid.id)).some((r) => r.action === "DELETE"));

    check("A21. STAFF không metrics.config bị 403 (list)", await expectError(() => listMetricTargets(denied, { metricId: metric.id }), 403));
    check("A22. STAFF không metrics.config bị 403 (create)", await expectError(() => createMetricTarget(denied, { metricId: metric.id, label: `${tag}-DENIED`, periodType: "YEAR", year: 2026, periodNo: null, value: "1", comparisonKind: "NONE", dataSource: "REAL" }), 403));
    check("A23. List theo metric trả target test", (await listMetricTargets(manager, { metricId: metric.id, year: 2026 })).some((t) => t.label === `${tag}-A`));
    check("A24. Get target theo id", (await getMetricTarget(manager, base.id)).id === base.id);

    // Validation cơ bản
    check("A25. BTC_YEAR + kỳ THÁNG → 400", await expectError(() => createMetricTarget(manager, { metricId: metric.id, label: `${tag}-BAD-PERIOD`, periodType: "MONTH", year: 2026, periodNo: 10, value: "1", comparisonKind: "BTC_YEAR", dataSource: "REAL", sourceNote: "x" }), 400, "Năm"));
    check("A26. value âm → 400", await expectError(() => createMetricTarget(manager, { metricId: metric.id, label: `${tag}-NEG`, periodType: "YEAR", year: 2026, periodNo: null, value: "-1", comparisonKind: "NONE", dataSource: "REAL" }), 400, "âm"));

    // V3.2/C1-A: chỉ THU_NSNN được gán chỉ tiêu; các mã chưa duyệt bị chặn.
    const pendingMetric = await prisma.metricDefinition.findFirstOrThrow({ where: { code: "PHI_LK_THU" } });
    check("A27. PHI_LK_THU (chưa có quy tắc) không được tạo target", await expectError(() => createMetricTarget(manager, {
      metricId: pendingMetric.id, label: `${tag}-PENDING`, periodType: "YEAR", year: 2026, periodNo: null, value: "1", comparisonKind: "NONE", dataSource: "REAL",
    }), 400, "quy tắc gán"));
    const unconfigured = await prisma.metricDefinition.findFirstOrThrow({ where: { code: "XNK_TK" } });
    check("A28. XNK_TK (không có dòng quy tắc) không được tạo target", await expectError(() => createMetricTarget(manager, {
      metricId: unconfigured.id, label: `${tag}-UNCONFIG`, periodType: "MONTH", year: 2026, periodNo: 10, value: "1", comparisonKind: "NONE", dataSource: "REAL",
    }), 400, "quy tắc"));
    const thuMonth = await createMetricTarget(manager, {
      metricId: metric.id,
      label: `${tag}-MONTH`,
      periodType: "MONTH",
      year: 2026,
      periodNo: 10,
      value: "100",
      comparisonKind: "MONTH_PLAN",
      dataSource: "REAL",
      sourceNote: "month rule test",
    });
    createdIds.push(thuMonth.id);
    labels.push(thuMonth.label);
    check("A29. THU_NSNN tháng: MONTH_START + officialPercentAllowed", thuMonth.rules.direction === "HIGHER_IS_BETTER" && thuMonth.rules.measureMode === "CUMULATIVE" && thuMonth.rules.baselineScope === "MONTH_START" && thuMonth.rules.officialPercentAllowed === true);
    check("A30. THU_NSNN quý chưa có quy tắc → 400", await expectError(() => createMetricTarget(manager, {
      metricId: metric.id, label: `${tag}-QUARTER`, periodType: "QUARTER", year: 2026, periodNo: 4, value: "1", comparisonKind: "NONE", dataSource: "REAL",
    }), 400, "quy tắc"));
  } finally {
    // Dọn revision trước (không FK), rồi target, rồi audit test.
    if (createdIds.length) {
      await prisma.metricPlanTargetRevision.deleteMany({ where: { targetId: { in: createdIds } } });
      await prisma.metricPlanTarget.deleteMany({ where: { id: { in: createdIds } } });
      await prisma.auditEvent.deleteMany({
        where: {
          resourceType: "MetricConfig",
          resourceId: { in: createdIds },
          action: { startsWith: "METRIC_ADMIN_TARGET_" },
        },
      });
    }
    // Target bị void đã xóa khỏi bảng; xóa revision/audit còn lại theo label/ID.
    const orphanRevisions = await prisma.metricPlanTargetRevision.findMany({
      where: { targetId: { in: createdIds } },
      select: { id: true },
    });
    if (orphanRevisions.length) {
      await prisma.metricPlanTargetRevision.deleteMany({ where: { id: { in: orphanRevisions.map((r) => r.id) } } });
    }
    console.log(`CLEANUP: ${createdIds.length} target id, ${labels.length} label test.`);
    await prisma.$disconnect();
  }

  console.log(`\n[TỔNG HỢP] PASS ${passed}/${passed + failed}, FAIL ${failed}`);
  if (failed > 0) {
    console.log("Failures:", failures.join(" | "));
    process.exitCode = 1;
  }
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
