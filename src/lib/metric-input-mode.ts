/**
 * Kiểu giá trị của một chỉ tiêu:
 * - INCREMENTAL: số phát sinh trong kỳ (mặc định, cộng dồn các lần nhập).
 * - CUMULATIVE: số lũy kế đến ngày nhập; kỳ = lũy kế cuối kỳ - lũy kế đầu kỳ.
 *
 * Cấu hình nằm trong MetricDefinition.derivation.inputMode để không cần migration.
 */
export type MetricInputMode = "INCREMENTAL" | "CUMULATIVE";

export const METRIC_INPUT_MODE_LABELS: Record<MetricInputMode, string> = {
  INCREMENTAL: "Số phát sinh",
  CUMULATIVE: "Lũy kế ngày",
};

export function metricInputMode(metric: { derivation?: unknown } | null | undefined): MetricInputMode {
  const derivation =
    metric?.derivation && typeof metric.derivation === "object"
      ? (metric.derivation as Record<string, unknown>)
      : null;
  return derivation?.inputMode === "CUMULATIVE" ? "CUMULATIVE" : "INCREMENTAL";
}

export function isCumulativeMetric(metric: { derivation?: unknown } | null | undefined): boolean {
  return metricInputMode(metric) === "CUMULATIVE";
}
