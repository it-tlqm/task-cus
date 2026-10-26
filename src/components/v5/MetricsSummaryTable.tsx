"use client";

import React from "react";
import { Badge } from "@/components/v5/ui/badge";
import { fmtMetric, fmtMetricCompact } from "@/lib/metric-format";

interface Cols {
  day?: number | null;
  week?: number | null;
  month?: number | null;
  quarter?: number | null;
  year?: number | null;
}

interface ClassCol {
  classificationId: string;
  label: string;
  cols: Cols;
}

interface Metric {
  id: string;
  code: string;
  name: string;
  unitLabel?: string;
  displayScale?: number;
  decimals?: number;
  cols: Cols;
  classCols?: ClassCol[];
  status?: { monthState?: string };
}

interface Group {
  id: string;
  name: string;
  metrics: Metric[];
}

const COLS = [
  { key: "day" as const, label: "Trong ngày" },
  { key: "week" as const, label: "Tuần" },
  { key: "month" as const, label: "Lũy kế tháng" },
  { key: "quarter" as const, label: "Lũy kế quý" },
  { key: "year" as const, label: "Lũy kế năm" },
];

function statusLabel(status?: string) {
  switch (status) {
    case "LOCKED":
      return "Đã chốt";
    case "CONFIRMED":
      return "Đã xác nhận";
    case "RECORDED":
      return "Đã nhập";
    default:
      return "Chưa nhập";
  }
}

function statusVariant(status?: string): "success" | "accent" | "warning" | "default" {
  if (status === "LOCKED" || status === "CONFIRMED") return "success";
  if (status === "RECORDED") return "accent";
  if (status === "NEEDS_FIX") return "warning";
  return "default";
}

export function MetricsSummaryTable({ groups }: { groups: Group[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-v5-line bg-v5-surface">
      <table className="w-full min-w-[980px] border-collapse text-[11px]" data-testid="v5-metrics-summary-table">
        <thead>
          <tr className="border-b border-v5-line bg-v5-bg/60 text-[10px] text-v5-muted">
            <th className="sticky left-0 z-10 border-r border-v5-line bg-v5-bg/95 px-3 py-2.5 text-left font-semibold">
              Chỉ tiêu
            </th>
            {COLS.map((col) => (
              <th
                key={col.key}
                className={`px-3 py-2.5 text-right font-semibold ${
                  col.key === "month" || col.key === "quarter" || col.key === "year" ? "bg-v5-accent-soft/60 text-v5-accent" : ""
                }`}
              >
                {col.label}
              </th>
            ))}
            <th className="px-3 py-2.5 text-center font-semibold">Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <React.Fragment key={group.id}>
              <tr className="border-b border-v5-line/70 bg-v5-bg/50">
                <td colSpan={7} className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-v5-accent">
                  {group.name}
                </td>
              </tr>
              {group.metrics.map((metric) => {
                const style = {
                  displayScale: metric.displayScale || 1,
                  decimals: metric.decimals ?? 0,
                  unitLabel: metric.unitLabel,
                };
                return (
                  <React.Fragment key={metric.id}>
                    <tr className="border-b border-v5-line/50 hover:bg-v5-bg/30">
                      <td className="sticky left-0 z-10 border-r border-v5-line/50 bg-v5-surface px-3 py-2 font-medium text-v5-ink">
                        {metric.name}
                        {metric.unitLabel ? (
                          <span className="ml-1 text-[9px] font-normal text-v5-muted">· {metric.unitLabel}</span>
                        ) : null}
                      </td>
                      {COLS.map((col) => (
                        <td
                          key={col.key}
                          className="px-3 py-2 text-right tabular-nums text-v5-ink"
                          title={fmtMetric(metric.cols[col.key], style)}
                        >
                          {fmtMetricCompact(metric.cols[col.key], style, { withUnit: false })}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-center">
                        <Badge variant={statusVariant(metric.status?.monthState)}>
                          {statusLabel(metric.status?.monthState)}
                        </Badge>
                      </td>
                    </tr>
                    {(metric.classCols || []).map((item) => (
                      <tr key={`${metric.id}-${item.classificationId}`} className="border-b border-v5-line/40 bg-v5-bg/20">
                        <td className="sticky left-0 z-10 border-r border-v5-line/40 bg-v5-bg/90 px-3 py-1.5 pl-8 text-[10px] text-v5-muted">
                          ↳ {item.label}
                        </td>
                        {COLS.map((col) => (
                          <td
                            key={col.key}
                            className="px-3 py-1.5 text-right tabular-nums text-[10px] text-v5-muted"
                            title={fmtMetric(item.cols[col.key], style)}
                          >
                            {fmtMetricCompact(item.cols[col.key], style, { withUnit: false })}
                          </td>
                        ))}
                        <td className="px-3 py-1.5 text-center text-v5-muted">—</td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </React.Fragment>
          ))}
          {groups.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-10 text-center text-xs text-v5-muted">
                Chưa có chỉ tiêu hiển thị.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
