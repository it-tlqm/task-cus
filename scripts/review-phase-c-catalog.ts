/**
 * S3 — Phase C: rà soát danh mục số liệu giao ban (READ-ONLY).
 *
 * Mục đích:
 *  - Chụp danh mục 49 chỉ tiêu, phân loại, chỉ tiêu giao, mốc lũy kế, bản ghi
 *    trên database test của worktree S3.
 *  - Sinh snapshot JSON + bảng Markdown để S0/S2 đối chiếu contract.
 *
 * An toàn:
 *  - Chỉ đọc. Không tạo/sửa/xóa bản ghi.
 *  - Không gọi API, không dùng Production.
 *
 * Chạy:
 *  npx tsx --env-file=.env scripts/review-phase-c-catalog.ts
 */
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../src/server/db";

const OUT_DIR = path.resolve("docs/evidence/multi-session/S3");
const OUT_JSON = path.join(OUT_DIR, "catalog-snapshot.json");
const OUT_MD = path.join(OUT_DIR, "catalog-appendix.md");

const PERIOD_YEAR = 2026;
const PERIOD_MONTH = 10;

type MeasureMode = "PERIOD_FLOW" | "CUMULATIVE" | "SNAPSHOT" | "DERIVED";
type PeriodApplicability = "DAILY" | "EVENT" | "PERIOD_END" | "DERIVED";

/** Các chỉ tiêu có tần suất phát sinh thưa, không nên cảnh báo "thiếu ngày" mặc định. */
const SPARSE_CODES = new Set([
  "KS_BG",
  "KS_HS",
  "KS_PHAT",
  "KS_CHO_GIO",
  "KS_CHO_LAN",
  "KT_TIEN_AN",
  "KT_TIEN_CN",
  "KT_QD_AN",
  "KT_QD_XP",
  "KT_TIEN_XP",
  "XOA_NO",
]);

function measureModeOf(code: string, valueKind: string): MeasureMode {
  if (valueKind === "DERIVED") return "DERIVED";
  if (valueKind === "BALANCE") return "SNAPSHOT";
  if (code === "XOA_NO" || code === "PHI_LK_THU") return "CUMULATIVE";
  return "PERIOD_FLOW";
}

function periodApplicabilityOf(code: string, valueKind: string, expectDaily: boolean): PeriodApplicability {
  if (valueKind === "DERIVED") return "DERIVED";
  if (valueKind === "BALANCE") return "PERIOD_END";
  if (SPARSE_CODES.has(code) || !expectDaily) return "EVENT";
  return "DAILY";
}

function currentDataState(input: {
  entryCountMonth: number;
  confirmedMonth: number;
  locked: boolean;
}): string {
  if (input.entryCountMonth === 0) return "CHUA_NHAP";
  if (input.locked) return "DA_CHOT";
  if (input.confirmedMonth > 0) return "DA_XAC_NHAN";
  return "DA_NHAP";
}

async function main() {
  const groups = await prisma.metricGroup.findMany({ orderBy: { sortOrder: "asc" } });
  const metrics = await prisma.metricDefinition.findMany({ orderBy: [{ groupId: "asc" }, { sortOrder: "asc" }] });
  const classes = await prisma.metricClassification.findMany({ orderBy: [{ metricId: "asc" }, { sortOrder: "asc" }] });
  const targets = await prisma.metricPlanTarget.findMany();
  const baselines = await prisma.metricBaseline.findMany();
  const entries = await prisma.metricDailyEntry.findMany({
    where: {
      entryDate: {
        gte: new Date(Date.UTC(PERIOD_YEAR, PERIOD_MONTH - 1, 1)),
        lte: new Date(Date.UTC(PERIOD_YEAR, PERIOD_MONTH, 0)),
      },
    },
    select: { metricId: true, classificationId: true, entryDate: true, status: true, valueNumeric: true },
  });
  const reportVersions = await prisma.briefingReportVersion.findMany({
    where: { periodType: "MONTH", periodKey: `${PERIOD_YEAR}-${String(PERIOD_MONTH).padStart(2, "0")}` },
    select: { id: true, versionNo: true, createdAt: true },
  });
  const locked = reportVersions.length > 0;

  const groupById = new Map(groups.map((g) => [g.id, g]));
  const classesByMetric = new Map<string, typeof classes>();
  for (const c of classes) {
    const arr = classesByMetric.get(c.metricId) || [];
    arr.push(c);
    classesByMetric.set(c.metricId, arr);
  }
  const entriesByMetric = new Map<string, typeof entries>();
  for (const e of entries) {
    const arr = entriesByMetric.get(e.metricId) || [];
    arr.push(e);
    entriesByMetric.set(e.metricId, arr);
  }

  const groupOrder = new Map(groups.map((g, i) => [g.id, i]));
  const orderedMetrics = [...metrics].sort((a, b) => {
    const ga = groupOrder.get(a.groupId) ?? 999;
    const gb = groupOrder.get(b.groupId) ?? 999;
    if (ga !== gb) return ga - gb;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.code.localeCompare(b.code);
  });

  const snapshot = orderedMetrics.map((m) => {
    const mes = entriesByMetric.get(m.id) || [];
    const t = targets.filter((x) => x.metricId === m.id);
    const bs = baselines.filter((x) => x.metricId === m.id);
    const cs = classesByMetric.get(m.id) || [];
    const officialTargets = t.filter((x) => !/^\s*\[DEMO/i.test(x.label));
    const demoTargets = t.filter((x) => /^\s*\[DEMO/i.test(x.label));
    const classCoverage = cs.map((c) => {
      const ce = mes.filter((e) => e.classificationId === c.id);
      return {
        code: c.code,
        label: c.label,
        entryCount: ce.length,
        hasData: ce.length > 0,
      };
    });

    return {
      groupCode: groupById.get(m.groupId)?.code ?? null,
      groupName: groupById.get(m.groupId)?.name ?? null,
      code: m.code,
      name: m.name,
      active: m.active,
      valueKind: m.valueKind,
      measureModeProposal: measureModeOf(m.code, m.valueKind),
      periodApplicabilityProposal: periodApplicabilityOf(m.code, m.valueKind, m.expectDaily),
      unitType: m.unitType,
      unitLabel: m.unitLabel,
      displayScale: m.displayScale,
      decimals: m.decimals,
      expectDailyCurrent: m.expectDaily,
      requireConfirmCurrent: m.requireConfirm,
      showOnDashboard: m.showOnDashboard,
      classifications: classCoverage,
      classificationCompleteness:
        cs.length === 0 ? "N/A" : classCoverage.every((c) => c.hasData) ? "DU" : classCoverage.some((c) => c.hasData) ? "THIEU" : "CHUA_CO",
      entryCountMonth: mes.length,
      confirmedCountMonth: mes.filter((e) => e.status === "CONFIRMED").length,
      entryDatesMonth: Array.from(new Set(mes.map((e) => e.entryDate.toISOString().slice(0, 10)))).sort(),
      lastEntryDate: mes.length
        ? Array.from(new Set(mes.map((e) => e.entryDate.toISOString().slice(0, 10)))).sort().at(-1) ?? null
        : null,
      currentDerivedState: currentDataState({
        entryCountMonth: mes.length,
        confirmedMonth: mes.filter((e) => e.status === "CONFIRMED").length,
        locked,
      }),
      targetCount: t.length,
      officialTargetCount: officialTargets.length,
      demoTargetCount: demoTargets.length,
      targetYears: Array.from(new Set(t.map((x) => x.year))).sort(),
      targetPeriods: Array.from(
        new Set(t.map((x) => `${x.periodType}${x.periodNo ? `-${x.periodNo}` : ""}/${x.year}`))
      ).sort(),
      baselineCount: bs.length,
      confirmedBaselineCount: bs.filter((b) => b.status === "CONFIRMED").length,
      /** Đề xuất để S0/C1 chốt — KHÔNG phải quyết định đã duyệt. */
      targetApplicabilityProposal: "PENDING_C1",
      directionProposal: "PENDING_C1",
    };
  });

  const summary = {
    generatedAt: new Date().toISOString().slice(0, 10),
    contractStatus: "APPROVED — S0_DECISION_LOG_2026-10-23",
    implementationScope:
      "Pure helper/state model + target UI draft mock. No schema, metrics.ts, /api/metrics/*, /giao-ban, or shared migration changes.",
    database: "talung_v3_phase_c (local test)",
    productionTouched: false,
    period: { year: PERIOD_YEAR, month: PERIOD_MONTH },
    monthLocked: locked,
    reportVersions,
    counts: {
      groups: groups.length,
      metrics: metrics.length,
      activeMetrics: metrics.filter((m) => m.active).length,
      classifications: classes.length,
      targets: targets.length,
      officialTargets: targets.filter((t) => !/^\s*\[DEMO/i.test(t.label)).length,
      demoTargets: targets.filter((t) => /^\s*\[DEMO/i.test(t.label)).length,
      baselines: baselines.length,
      demoBaselines: baselines.filter((b) => /\[DEMO/i.test(b.sourceNote || "")).length,
      entriesMonth: entries.length,
      confirmedEntriesMonth: entries.filter((e) => e.status === "CONFIRMED").length,
      zeroEntriesMonth: entries.filter((e) => Number(e.valueNumeric) === 0).length,
      requireConfirmTrue: metrics.filter((m) => m.requireConfirm).length,
      expectDailyTrue: metrics.filter((m) => m.expectDaily).length,
    },
    valueKinds: {
      FLOW: metrics.filter((m) => m.valueKind === "FLOW").length,
      BALANCE: metrics.filter((m) => m.valueKind === "BALANCE").length,
      DERIVED: metrics.filter((m) => m.valueKind === "DERIVED").length,
    },
    metrics: snapshot,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(summary, null, 2), "utf8");

  const md: string[] = [];
  md.push("# S3 — Phụ lục danh mục 49 chỉ tiêu (snapshot đọc-only)");
  md.push("");
  md.push(`- Database: \`${summary.database}\``);
  md.push(`- Contract: **${summary.contractStatus}**`);
  md.push(`- Kỳ chụp: tháng ${PERIOD_MONTH}/${PERIOD_YEAR}; báo cáo tháng đã lưu: ${locked ? "CÓ" : "KHÔNG"}`);
  md.push(`- Production touched: **NO**`);
  md.push("");
  md.push("| # | Nhóm | Mã | Tên | Kiểu | Đơn vị | expectDaily | Bản ghi T10 | Trạng thái hiện tại | Target chính thức | Target DEMO | Đề xuất measureMode | Đề xuất tần suất |");
  md.push("|---:|---|---|---|---|---|---:|---:|---|---:|---:|---|---|");
  snapshot.forEach((m, i) => {
    md.push(
      `| ${i + 1} | ${m.groupCode} | \`${m.code}\` | ${m.name} | ${m.valueKind} | ${m.unitType}/${m.unitLabel ?? "-"} | ${m.expectDailyCurrent ? "CÓ" : "KHÔNG"} | ${m.entryCountMonth} | ${m.currentDerivedState} | ${m.officialTargetCount} | ${m.demoTargetCount} | ${m.measureModeProposal} | ${m.periodApplicabilityProposal} |`
    );
  });
  md.push("");
  fs.writeFileSync(OUT_MD, md.join("\n"), "utf8");

  console.log("S3 catalog review (READ-ONLY)");
  console.log(JSON.stringify(summary.counts, null, 2));
  console.log("valueKinds", summary.valueKinds, "monthLocked", locked);
  console.log("wrote", OUT_JSON);
  console.log("wrote", OUT_MD);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
