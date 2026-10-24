/**
 * V3.2 (D5-A/C1-A) — đọc quy tắc đánh giá/gán chỉ tiêu từ DB.
 *
 * Không suy từ tên/valueKind: thiếu dòng = UNCONFIGURED (NOT_SET/PENDING).
 * Bảng `metric_target_rules` do migration 20261023200000 tạo và chỉ chứa
 * quyết định nghiệp vụ đã duyệt (THU_NSNN + 5 mã chờ quy tắc).
 */
import { prisma } from "./db";
import type { BaselineScope, Direction, MeasureMode } from "@/lib/metrics-contract";
import {
  isTargetBaselineScope,
  isTargetDirection,
  isTargetMeasureMode,
  isTargetPeriodType,
  ruleKey,
  type MetricTargetRuleRecord,
} from "@/lib/metric-target-rules";

export async function loadMetricTargetRules(
  metricIds: string[]
): Promise<Map<string, MetricTargetRuleRecord>> {
  if (metricIds.length === 0) return new Map();
  const rows = await prisma.metricTargetRule.findMany({
    where: { metricId: { in: metricIds } },
  });
  const map = new Map<string, MetricTargetRuleRecord>();
  for (const row of rows) {
    if (!isTargetPeriodType(row.periodType)) continue;
    const direction: Direction = isTargetDirection(row.direction) ? row.direction : "NOT_SET";
    const measureMode: MeasureMode = isTargetMeasureMode(row.measureMode)
      ? row.measureMode
      : "PENDING_BUSINESS_INPUT";
    const baselineScope: BaselineScope = isTargetBaselineScope(row.baselineScope)
      ? row.baselineScope
      : "PENDING_BUSINESS_INPUT";
    map.set(ruleKey(row.metricId, row.periodType), {
      id: row.id,
      metricId: row.metricId,
      periodType: row.periodType,
      configured: true,
      targetApplicable: row.targetApplicable === true,
      direction,
      measureMode,
      baselineScope,
      sourceNote: row.sourceNote,
    });
  }
  return map;
}

export async function getMetricTargetRule(metricId: string, periodType: string) {
  const map = await loadMetricTargetRules([metricId]);
  return map.get(ruleKey(metricId, periodType)) ?? null;
}
