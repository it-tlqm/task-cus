/**
 * V3.2 (S2/S3) — test quyết định metrics: D5-A / B1-A / B2-A / C1-A.
 *
 * Chỉ chạy DB test local:
 *   - talung_v3_fixture_integration (đã rehearsal migration 20261023200000)
 *   - hoặc talung_v3_phase_c
 *
 * Chạy:
 *   DATABASE_URL=... DIRECT_URL=... npx tsx scripts/test-phase-c-v32-metrics.ts
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../src/server/db";
import type { SessionUser } from "../src/server/auth";
import { computeMetricComparison, computeMetricSummary, dateOnly } from "../src/server/metrics";
import {
  MetricAdjustmentError,
  confirmCumulativeAdjustment,
  createCumulativeAdjustment,
  updateCumulativeAdjustment,
} from "../src/server/metric-baseline-adjustments";
import {
  MetricTargetError,
  confirmMetricTarget,
  createMetricTarget,
} from "../src/server/metric-targets";

const DB = process.env.DIRECT_URL || process.env.DATABASE_URL || "";
if (!DB.includes("talung_v3_phase_c") && !DB.includes("talung_v3_fixture_integration")) {
  throw new Error("TỪ CHỐI CHẠY: chỉ dùng database test local (phase_c/fixture_integration).");
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

async function expectTargetError(fn: () => Promise<unknown>, status: number, includes: string) {
  try {
    await fn();
    return false;
  } catch (e) {
    return e instanceof MetricTargetError && e.statusCode === status && e.message.includes(includes);
  }
}

async function expectAdjustmentError(fn: () => Promise<unknown>, status: number, includes: string) {
  try {
    await fn();
    return false;
  } catch (e) {
    return e instanceof MetricAdjustmentError && e.statusCode === status && e.message.includes(includes);
  }
}

async function main() {
  const account = await prisma.account.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { username: "asc" },
    select: { id: true, username: true, personId: true, person: { select: { code: true, fullName: true, status: true } } },
  });
  if (!account || account.person.status !== "ACTIVE") throw new Error("Không có account/person ACTIVE.");

  const manager: SessionUser = {
    id: account.id,
    personId: account.personId,
    username: account.username,
    fullName: account.person.fullName,
    personCode: account.person.code,
    role: "UNIT_LEADER",
    scopeType: "ORGANIZATION",
    permissions: ["metrics.config", "metrics.entry_all"],
  };
  const denied: SessionUser = {
    ...manager,
    id: "v32-denied",
    personId: "v32-denied",
    username: "v32-denied",
    role: "STAFF",
    permissions: [],
  };

  const thu = await prisma.metricDefinition.findFirstOrThrow({ where: { code: "THU_NSNN" } });
  const pendingCodes = ["PHI_LK_THU", "PHI_CON", "XOA_NO", "NO_THUE", "TV_CHO"];
  const tag = `V32-${Date.now()}`;
  const createdTargetIds: string[] = [];
  const createdBaselineIds: string[] = [];
  const createdEntryIds: string[] = [];
  let assignmentId: string | null = null;

  try {
    // ============================================================
    // A. D5-A — quy tắc tường minh trong DB
    // ============================================================
    console.log("\n[A] D5-A — QUY TẮC TƯỜNG MINH");
    const thuRules = await prisma.metricTargetRule.findMany({ where: { metricId: thu.id } });
    const thuYear = thuRules.find((r) => r.periodType === "YEAR");
    const thuMonth = thuRules.find((r) => r.periodType === "MONTH");
    check(
      "A1. THU_NSNN năm = HIGHER_IS_BETTER/CUMULATIVE/YEAR_START, applicable",
      Boolean(thuYear && thuYear.targetApplicable && thuYear.direction === "HIGHER_IS_BETTER" && thuYear.measureMode === "CUMULATIVE" && thuYear.baselineScope === "YEAR_START"),
      thuYear
    );
    check(
      "A2. THU_NSNN tháng = HIGHER_IS_BETTER/CUMULATIVE/MONTH_START, applicable",
      Boolean(thuMonth && thuMonth.targetApplicable && thuMonth.direction === "HIGHER_IS_BETTER" && thuMonth.measureMode === "CUMULATIVE" && thuMonth.baselineScope === "MONTH_START"),
      thuMonth
    );
    check("A3. THU_NSNN quý chưa có quy tắc (không tự suy)", !thuRules.some((r) => r.periodType === "QUARTER"));

    for (const code of pendingCodes) {
      const metric = await prisma.metricDefinition.findFirstOrThrow({ where: { code } });
      const rules = await prisma.metricTargetRule.findMany({ where: { metricId: metric.id } });
      check(
        `A4.${code} đủ 3 kỳ NOT_SET/PENDING và không applicable`,
        rules.length === 3 &&
          rules.every(
            (r) =>
              !r.targetApplicable &&
              r.direction === "NOT_SET" &&
              r.measureMode === "PENDING_BUSINESS_INPUT" &&
              r.baselineScope === "PENDING_BUSINESS_INPUT"
          ),
        rules.map((r) => `${r.periodType}:${r.direction}/${r.measureMode}/${r.baselineScope}`)
      );
    }

    const xnk = await prisma.metricDefinition.findFirstOrThrow({ where: { code: "XNK_TK" } });
    check("A5. XNK_TK không có dòng quy tắc (UNCONFIGURED)", (await prisma.metricTargetRule.count({ where: { metricId: xnk.id } })) === 0);
    check("A6. Không auto-gán quy tắc cho 49 chỉ tiêu", (await prisma.metricTargetRule.count()) < 49);

    // ============================================================
    // B. C1-A — chỉ THU_NSNN được gán chỉ tiêu
    // ============================================================
    console.log("\n[B] C1-A — TARGET APPLICABILITY");
    check(
      "B1. XNK_TK bị chặn tạo target",
      await expectTargetError(
        () =>
          createMetricTarget(manager, {
            metricId: xnk.id,
            label: `${tag}-XNK`,
            periodType: "YEAR",
            year: 2026,
            periodNo: null,
            value: "1",
            comparisonKind: "NONE",
            dataSource: "REAL",
          }),
        400,
        "quy tắc"
      )
    );
    const pendingMetric = await prisma.metricDefinition.findFirstOrThrow({ where: { code: "PHI_LK_THU" } });
    check(
      "B2. PHI_LK_THU bị chặn tạo target",
      await expectTargetError(
        () =>
          createMetricTarget(manager, {
            metricId: pendingMetric.id,
            label: `${tag}-PHI`,
            periodType: "YEAR",
            year: 2026,
            periodNo: null,
            value: "1",
            comparisonKind: "NONE",
            dataSource: "REAL",
          }),
        400,
        "quy tắc"
      )
    );

    const target = await createMetricTarget(manager, {
      metricId: thu.id,
      label: `${tag} THU năm`,
      periodType: "YEAR",
      year: 2026,
      periodNo: null,
      value: "1000000",
      comparisonKind: "NONE",
      dataSource: "REAL",
      sourceNote: `${tag} nguồn`,
    });
    createdTargetIds.push(target.id);
    await confirmMetricTarget(manager, target.id, { reason: `${tag} confirm` });
    check("B3. THU_NSNN năm tạo + xác nhận target được", target.rules.officialPercentAllowed === true);

    // ============================================================
    // C. D5-A — summary chỉ tính % khi đủ quy tắc
    // ============================================================
    console.log("\n[C] D5-A — SUMMARY % CHÍNH THỨC");
    const summary = await computeMetricSummary({ year: 2026, weekNumber: 42, month: 10, quarter: 4 }, "full");
    const allRows = summary.groups.flatMap((g) => g.metrics);
    const thuRow = allRows.find((m) => m.code === "THU_NSNN");
    const targetRow = thuRow?.targets.find((t) => t.id === target.id);
    check("C1. THU_NSNN target % COMPUTED", Boolean(targetRow && targetRow.percentState === "COMPUTED" && targetRow.percent !== null && targetRow.percentText), targetRow);
    check(
      "C2. THU_NSNN policy HIGHER/CUMULATIVE/YEAR_START",
      thuRow?.targetPolicy.direction === "HIGHER_IS_BETTER" && thuRow?.targetPolicy.measureMode === "CUMULATIVE" && thuRow?.targetPolicy.baselineScope === "YEAR_START" && thuRow?.targetPolicy.officialPercentAllowed === true,
      thuRow?.targetPolicy
    );
    const phiRow = allRows.find((m) => m.code === "PHI_LK_THU");
    check("C3. PHI_LK_THU policy không applicable", phiRow?.targetPolicy.targetApplicable === false && phiRow?.targetPolicy.direction === "NOT_SET");
    const phiTarget = phiRow?.targets[0];
    check(
      "C4. Target PHI_LK_THU không có % chính thức + lý do quy tắc",
      !phiTarget || (phiTarget.percent === null && phiTarget.percentState === "NOT_COMPUTED" && phiTarget.percentReason === "TARGET_RULE_NOT_APPROVED"),
      phiTarget
    );
    const xnkRow = allRows.find((m) => m.code === "XNK_TK");
    check("C5. XNK_TK không có quy tắc cấu hình", xnkRow?.targetPolicy.configured === false && xnkRow?.targetPolicy.targetApplicable === false);
    check(
      "C6. Target DEMO không bị tính %",
      (thuRow?.targets || []).filter((t) => t.dataSource === "DEMO").every((t) => t.percent === null),
      thuRow?.targets.filter((t) => t.dataSource === "DEMO").map((t) => t.percent)
    );

    // ============================================================
    // D. B1-A — so cùng số ngày đến data cutoff
    // ============================================================
    console.log("\n[D] B1-A — SAME-DAY COMPARISON");
    const sepDate = dateOnly(2026, 9, 10);
    const existingSep = await prisma.metricDailyEntry.findUnique({
      where: { metricId_classificationId_entryDate: { metricId: thu.id, classificationId: "", entryDate: sepDate } },
    });
    if (!existingSep) {
      const tempEntry = await prisma.metricDailyEntry.create({
        data: {
          metricId: thu.id,
          classificationId: "",
          entryDate: sepDate,
          valueNumeric: new Prisma.Decimal("1000000000"),
          dataSource: "REAL",
          status: "RECORDED",
          enteredById: manager.personId,
        },
      });
      createdEntryIds.push(tempEntry.id);
    }
    const comparison = await computeMetricComparison({ year: 2026, weekNumber: 42, month: 10, quarter: 4 });
    const compRow = comparison.rows.find((r) => r.code === "THU_NSNN");
    check("D1. Comparison dùng rule FULL_MONTH", comparison.rule.prevMonth === "FULL_MONTH" && comparison.rule.samePeriodLastYear === "FULL_MONTH");
    check("D2. Data cutoff = ngày 18 (fixture 02–18/10)", compRow?.prevMonth.cutoffDate === "2026-10-18" && compRow?.prevMonth.dayCount === 18, compRow?.prevMonth);
    check("D3. So lũy kế tháng → FULL_MONTH", compRow?.prevMonth.ruleState === "FULL_MONTH" && compRow?.prevMonth.periodComplete === true, compRow?.prevMonth);
    check("D4. Tháng trước lấy đúng 18 ngày (có entry 10/9)", compRow?.prevMonth.value !== null && compRow?.prevMonth.value >= 1000000000, compRow?.prevMonth);
    check("D5. Có % thay đổi khi đủ tử/mẫu (không 0% giả)", compRow?.prevMonth.percent !== null && compRow?.prevMonth.percentText !== null, compRow?.prevMonth);
    check("D6. Cùng kỳ năm trước thiếu dữ liệu → NO_DATA, percent null", compRow?.samePeriodLastYear.ruleState === "NO_DATA" && compRow?.samePeriodLastYear.percent === null, compRow?.samePeriodLastYear);
    check("D7. Không hiển thị 0% khi thiếu dữ liệu", compRow?.samePeriodLastYear.value === null || compRow?.samePeriodLastYear.percent !== null);
    check("D8. Nhãn nêu so cả tháng", (compRow?.prevMonth.note || "").includes("cả tháng"), compRow?.prevMonth.note);

    // ============================================================
    // E. B2-A — điều chỉnh lũy kế bằng canEnter/canConfirm
    // ============================================================
    console.log("\n[E] B2-A — CUMULATIVE ADJUSTMENT");
    const assignment = await prisma.metricEntryAssignment.create({
      data: {
        personId: manager.personId,
        metricId: thu.id,
        canEnter: true,
        canConfirm: false,
        active: true,
        createdById: manager.personId,
      },
    });
    assignmentId = assignment.id;
    const enterOnly: SessionUser = { ...manager, role: "STAFF", permissions: [] };
    let adjId: string | null = null;
    try {
      check(
        "E1. Thiếu lý do → 400",
        await expectAdjustmentError(
          () =>
            createCumulativeAdjustment(enterOnly, {
              metricId: thu.id,
              cumKind: "YEAR",
              asOfDate: "2026-02-28",
              value: "123",
              reason: "",
            }),
          400,
          "lý do"
        )
      );
      const adj = await createCumulativeAdjustment(enterOnly, {
        metricId: thu.id,
        cumKind: "YEAR",
        asOfDate: "2026-02-28",
        value: "123",
        reason: `${tag} nhập bổ sung`,
        sourceNote: `${tag} nguồn`,
      });
      adjId = adj.id;
      createdBaselineIds.push(adj.id);
      check("E2. canEnter tạo mốc PROPOSED", adj.status === "PROPOSED" && adj.reason === `${tag} nhập bổ sung` && adj.canEdit === true && adj.canConfirm === false);
      const updated = await updateCumulativeAdjustment(enterOnly, adj.id, {
        asOfDate: "2026-02-28",
        value: "456",
        reason: `${tag} sửa lũy kế`,
      });
      check("E3. canEnter sửa mốc PROPOSED", updated.valueBase === 456 && updated.reason === `${tag} sửa lũy kế`);
      check(
        "E4. Revision UPDATE ghi old/new",
        (await prisma.metricBaselineRevision.count({ where: { baselineId: adj.id, action: "UPDATE", oldValue: new Prisma.Decimal(123), newValue: new Prisma.Decimal(456) } })) === 1
      );
      const audit = await prisma.auditEvent.findMany({ where: { resourceType: "MetricBaseline", resourceId: adj.id } });
      const updateAudit = audit.find((a) => a.action === "METRIC_BASELINE_ADJUSTMENT_UPDATED");
      check(
        "E5. Audit UPDATE có old/new",
        Boolean(updateAudit && (updateAudit.oldData as any)?.valueBase === "123" && (updateAudit.newData as any)?.valueBase === "456"),
        updateAudit?.oldData
      );
      check(
        "E6. canEnter thiếu canConfirm không xác nhận được",
        await expectAdjustmentError(() => confirmCumulativeAdjustment(enterOnly, adj.id!, { reason: `${tag} confirm` }), 403, "xác nhận")
      );
      await prisma.metricEntryAssignment.update({ where: { id: assignment.id }, data: { canConfirm: true } });
      const confirmed = await confirmCumulativeAdjustment(enterOnly, adj.id, { reason: `${tag} xác nhận mốc` });
      check("E7. canConfirm xác nhận được mốc", confirmed.status === "CONFIRMED" && confirmed.reason === `${tag} xác nhận mốc`);
      check(
        "E8. Revision CONFIRM + audit CONFIRMED",
        (await prisma.metricBaselineRevision.count({ where: { baselineId: adj.id, action: "CONFIRM" } })) === 1 &&
          (await prisma.auditEvent.count({ where: { resourceType: "MetricBaseline", resourceId: adj.id, action: "METRIC_BASELINE_ADJUSTMENT_CONFIRMED" } })) === 1
      );
      const locked = await prisma.metricBaseline.update({ where: { id: adj.id }, data: { status: "LOCKED" } });
      check(
        "E9. Mốc LOCKED không sửa trực tiếp",
        await expectAdjustmentError(
          () => updateCumulativeAdjustment(enterOnly, locked.id, { asOfDate: "2026-02-28", value: "789", reason: `${tag} sửa locked` }),
          400,
          "đã chốt"
        )
      );
      check(
        "E10. STAFF không phân công bị 403",
        await expectAdjustmentError(
          () =>
            createCumulativeAdjustment(denied, {
              metricId: thu.id,
              cumKind: "YEAR",
              asOfDate: "2026-03-31",
              value: "1",
              reason: `${tag} denied`,
            }),
          403,
          "phân công"
        )
      );
    } finally {
      if (assignmentId) await prisma.metricEntryAssignment.deleteMany({ where: { id: assignmentId } });
    }
  } finally {
    if (createdTargetIds.length) {
      await prisma.metricPlanTargetRevision.deleteMany({ where: { targetId: { in: createdTargetIds } } });
      await prisma.metricPlanTarget.deleteMany({ where: { id: { in: createdTargetIds } } });
      await prisma.auditEvent.deleteMany({ where: { resourceType: "MetricConfig", resourceId: { in: createdTargetIds } } });
    }
    if (createdBaselineIds.length) {
      await prisma.metricBaselineRevision.deleteMany({ where: { baselineId: { in: createdBaselineIds } } });
      await prisma.metricBaseline.deleteMany({ where: { id: { in: createdBaselineIds } } });
      await prisma.auditEvent.deleteMany({ where: { resourceType: "MetricBaseline", resourceId: { in: createdBaselineIds } } });
    }
    if (createdEntryIds.length) {
      await prisma.metricEntryRevision.deleteMany({ where: { entryId: { in: createdEntryIds } } });
      await prisma.metricDailyEntry.deleteMany({ where: { id: { in: createdEntryIds } } });
    }
    console.log(`CLEANUP: target=${createdTargetIds.length}, baseline=${createdBaselineIds.length}, entry=${createdEntryIds.length}, assignment=${assignmentId ? 1 : 0}`);
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
