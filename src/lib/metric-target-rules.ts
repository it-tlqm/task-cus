/**
 * V3.2 (D5-A/C1-A) — hằng số/validate quy tắc đánh giá & gán chỉ tiêu.
 *
 * Nguồn quyết định là bảng `metric_target_rules` (migration 20261023200000);
 * module này chỉ giữ danh sách giá trị hợp lệ + hàm thuần, không đọc DB.
 */
import type {
  BaselineScope,
  Direction,
  MeasureMode,
  TargetRuleSnapshot,
} from "./metrics-contract";
import { UNCONFIGURED_TARGET_RULE } from "./metrics-contract";

export const TARGET_PERIOD_TYPES = ["YEAR", "QUARTER", "MONTH"] as const;
export type TargetPeriodType = (typeof TARGET_PERIOD_TYPES)[number];

export const TARGET_DIRECTIONS: Direction[] = [
  "HIGHER_IS_BETTER",
  "LOWER_IS_BETTER",
  "NEUTRAL",
  "NOT_SET",
];

export const TARGET_MEASURE_MODES: MeasureMode[] = [
  "PERIOD_FLOW",
  "CUMULATIVE",
  "SNAPSHOT",
  "DERIVED",
  "PENDING_BUSINESS_INPUT",
];

export const TARGET_BASELINE_SCOPES: BaselineScope[] = [
  "YEAR_START",
  "MONTH_START",
  "PERIOD_START",
  "PENDING_BUSINESS_INPUT",
];

export function isTargetPeriodType(value: unknown): value is TargetPeriodType {
  return typeof value === "string" && (TARGET_PERIOD_TYPES as readonly string[]).includes(value);
}

export function isTargetDirection(value: unknown): value is Direction {
  return typeof value === "string" && (TARGET_DIRECTIONS as string[]).includes(value);
}

export function isTargetMeasureMode(value: unknown): value is MeasureMode {
  return typeof value === "string" && (TARGET_MEASURE_MODES as string[]).includes(value);
}

export function isTargetBaselineScope(value: unknown): value is BaselineScope {
  return typeof value === "string" && (TARGET_BASELINE_SCOPES as string[]).includes(value);
}

export interface MetricTargetRuleRecord extends TargetRuleSnapshot {
  id: string;
  metricId: string;
  periodType: TargetPeriodType;
  sourceNote: string | null;
}

export function ruleKey(metricId: string, periodType: string): string {
  return `${metricId}|${periodType}`;
}

export function ruleOf(
  rules: Map<string, MetricTargetRuleRecord>,
  metricId: string,
  periodType: string
): TargetRuleSnapshot {
  return rules.get(ruleKey(metricId, periodType)) ?? UNCONFIGURED_TARGET_RULE;
}

/** Chỉ cho tạo/sửa target khi quy tắc đã duyệt và đủ semantics. */
export function canAssignTarget(rule: TargetRuleSnapshot): boolean {
  return (
    rule.configured &&
    rule.targetApplicable &&
    rule.direction !== "NOT_SET" &&
    rule.measureMode !== "PENDING_BUSINESS_INPUT" &&
    rule.baselineScope !== "PENDING_BUSINESS_INPUT"
  );
}
