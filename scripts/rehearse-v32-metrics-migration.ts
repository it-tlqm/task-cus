/**
 * V3.2 — rehearsal migration 20261023200000 trên DB test local.
 *
 * Quy trình: đếm dữ liệu nghiệp vụ → rollback (drop bảng quy tắc) → xác nhận
 * dữ liệu nghiệp vụ không đổi → apply lại → xác nhận 17 dòng quy tắc.
 * KHÔNG dùng Production.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const url = process.env.DIRECT_URL || process.env.DATABASE_URL || "";
if (!url.includes("talung_v3_fixture_integration") && !url.includes("talung_v3_phase_c")) {
  throw new Error("TỪ CHỐI: rehearsal chỉ chạy trên DB test local.");
}

const prisma = new PrismaClient({ datasources: { db: { url } } });
const MIGRATION = "prisma/migrations/20261023200000_v32_metrics_decisions/migration.sql";
const ROLLBACK = "scripts/sql/v32_metrics_decisions_rollback.sql";
const OUT = path.resolve("docs/evidence/multi-session/V32_METRICS_MIGRATION_REHEARSAL_2026-10-24.json");

async function counts() {
  return {
    metrics: await prisma.metricDefinition.count(),
    entries: await prisma.metricDailyEntry.count(),
    targets: await prisma.metricPlanTarget.count(),
    baselines: await prisma.metricBaseline.count(),
    targetRevisions: await prisma.metricPlanTargetRevision.count(),
    baselineRevisions: await prisma.metricBaselineRevision.count(),
    rules: await prisma.metricTargetRule.count().catch(() => null),
  };
}

async function runSql(file: string) {
  execSync(`npx prisma db execute --file "${file}" --url "${url}"`, {
    stdio: "pipe",
    env: process.env,
  });
}

async function main() {
  const before = await counts();
  const beforeRules = before.rules;

  await runSql(ROLLBACK);
  const afterRollback = await counts();
  const tableAfterRollback = await prisma
    .$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM information_schema.tables WHERE table_name = 'metric_target_rules'`)
    .then((r) => Number(r[0]?.n ?? 0));

  await runSql(MIGRATION);
  const afterApply = await counts();

  const grams = await prisma.metricTargetRule.findMany({
    select: { periodType: true, targetApplicable: true, direction: true, measureMode: true, baselineScope: true, metric: { select: { code: true } } },
  });
  const thu = grams.filter((r) => r.metric.code === "THU_NSNN");
  const pending = grams.filter((r) => ["PHI_LK_THU", "PHI_CON", "XOA_NO", "NO_THUE", "TV_CHO"].includes(r.metric.code));

  const businessUnchanged =
    before.metrics === afterRollback.metrics &&
    before.metrics === afterApply.metrics &&
    before.entries === afterRollback.entries &&
    before.entries === afterApply.entries &&
    before.targets === afterRollback.targets &&
    before.targets === afterApply.targets &&
    before.baselines === afterRollback.baselines &&
    before.baselines === afterApply.baselines &&
    before.targetRevisions === afterRollback.targetRevisions &&
    before.targetRevisions === afterApply.targetRevisions &&
    before.baselineRevisions === afterRollback.baselineRevisions &&
    before.baselineRevisions === afterApply.baselineRevisions;

  const pass =
    tableAfterRollback === 0 &&
    businessUnchanged &&
    afterApply.rules === 17 &&
    thu.length === 2 &&
    thu.every((r) => r.targetApplicable && r.direction === "HIGHER_IS_BETTER" && r.measureMode === "CUMULATIVE") &&
    thu.find((r) => r.periodType === "YEAR")?.baselineScope === "YEAR_START" &&
    thu.find((r) => r.periodType === "MONTH")?.baselineScope === "MONTH_START" &&
    pending.length === 15 &&
    pending.every((r) => !r.targetApplicable && r.direction === "NOT_SET" && r.measureMode === "PENDING_BUSINESS_INPUT" && r.baselineScope === "PENDING_BUSINESS_INPUT");

  const report = {
    session: "S2/S3 V3.2",
    date: "2026-10-24",
    database: url.replace(/:\/\/([^:]+):[^@]+@/, "://***:***@"),
    migration: "20261023200000_v32_metrics_decisions",
    before,
    beforeRules,
    afterRollback,
    tableAfterRollback,
    afterApply,
    rules: {
      total: grams.length,
      thu: thu.map((r) => `${r.periodType}:${r.direction}/${r.measureMode}/${r.baselineScope}/${r.targetApplicable}`),
      pendingCount: pending.length,
    },
    businessUnchanged,
    pass,
    productionTouched: false,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  if (!pass) process.exitCode = 1;
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
