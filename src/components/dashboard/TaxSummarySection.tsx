"use client";

import { V5Icon } from "@/components/v5/ui/lucide-icon";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { fmtMetric, fmtMetricCompact, STATUS_LABELS, STATUS_STYLES } from "@/lib/metric-format";
import { DataQualityBanner, type MetricDataQuality } from "@/components/dashboard/DataQualityBanner";
import { RevenueComparisonSection, type ComparisonData } from "@/components/dashboard/RevenueComparisonSection";

interface Cols {
  day: number | null;
  week: number | null;
  month: number | null;
  quarter: number | null;
  year: number | null;
}

interface DashMetric {
  id: string;
  code: string;
  name: string;
  unitLabel: string;
  displayScale: number;
  decimals: number;
  cols: Cols;
  classCols: { classificationId: string; label: string; cols: Cols; latestDate: string | null }[];
  latest: { date: string; status: string; byName: string | null } | null;
  status?: { monthState: "NONE" | "RECORDED" | "CONFIRMED" | "LOCKED"; monthLocked: boolean; monthPeriodKey: string };
}

interface DashGroup {
  id: string;
  code: string;
  name: string;
  metrics: DashMetric[];
}

/** YC-29 — nhãn trạng thái kỳ tháng (Đã nhập / Đã xác nhận / Đã chốt báo cáo). */
const MONTH_STATE_LABELS: Record<string, string> = {
  NONE: "Chưa nhập",
  RECORDED: STATUS_LABELS.RECORDED || "Đã nhập",
  CONFIRMED: STATUS_LABELS.CONFIRMED || "Đã xác nhận",
  LOCKED: "Đã chốt báo cáo",
};

const MONTH_STATE_STYLES: Record<string, string> = {
  NONE: "border-v5-line text-v5-muted bg-v5-bg",
  RECORDED: STATUS_STYLES.RECORDED,
  CONFIRMED: STATUS_STYLES.CONFIRMED,
  LOCKED: "bg-violet-50 text-violet-700 border-violet-200",
};

const COLS = ["day", "week", "month", "year"] as const;

/**
 * YC-17/YC-19 → YC-29 — Khu "Số liệu giao ban" trên Trang chủ:
 * bảng kẻ dòng/cột theo nhóm chỉ tiêu với các cột Trong ngày / Tuần / Lũy kế tháng / Lũy kế năm / Trạng thái.
 * Quy ước hiển thị: "—" = CHƯA NHẬP (null), "0" = đã nhập giá trị 0. Chỉ hiện chỉ tiêu bật "Hiện trên Trang chủ".
 * className: cho phép trang gọi khối này với khoảng đệm theo từng bố cục (mobile mặc định / desktop không đệm).
 */
export function TaxSummarySection({ className = "px-margin pt-space-md" }: { className?: string }) {
  const [groups, setGroups] = useState<DashGroup[] | null>(null);
  const [range, setRange] = useState<any>(null);
  const [quality, setQuality] = useState<MetricDataQuality | null>(null);
  const [comparison, setComparison] = useState<ComparisonData | null>(null);

  useEffect(() => {
    // YC-01: lấy kèm khối so sánh Thu NSNN, dùng chung hợp đồng B-C-1 với /giao-ban.
    fetch("/api/metrics/summary?scope=dashboard&comparison=1")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.success) {
          setGroups(json.groups || []);
          setRange(json.range);
          setQuality(json.dataQuality || null);
          setComparison(json.comparison || null);
        }
      })
      .catch(() => setGroups([]));
  }, []);

  if (groups === null) return null;
  const totalMetrics = groups.reduce((a, g) => a + g.metrics.length, 0);
  if (totalMetrics === 0) {
    return (
      <section className={className}>
        <div className="bg-v5-surface rounded-xl border border-dashed border-v5-line/60 p-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <V5Icon name="monitoring" className="text-[20px] text-v5-ink" />
            <span className="text-[12px] text-v5-muted">
              Khu vực số liệu giao ban chưa được bật chỉ tiêu. Vào <b>Cấu hình số liệu</b> để chọn chỉ tiêu hiển thị trên Trang chủ.
            </span>
          </div>
          <Link href="/giao-ban/cau-hinh" className="text-[11px] font-semibold text-v5-ink hover:underline">
            Cấu hình →
          </Link>
        </div>
      </section>
    );
  }

  const monthLabel = range?.month?.label ? `Lũy kế ${String(range.month.label).toLowerCase()}` : "Lũy kế tháng";

  return (
    <section className={className}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <V5Icon name="monitoring" className="text-[20px] text-v5-ink" />
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-v5-ink font-bold uppercase tracking-wide text-[12px]">Số liệu giao ban</h2>
        </div>
        <Link href="/giao-ban" className="text-[11px] font-semibold text-v5-ink hover:underline flex items-center gap-0.5">
          Chi tiết
          <V5Icon name="chevron_right" className="text-[16px]" />
        </Link>
      </div>

      <DataQualityBanner q={quality} className="mb-2" />

      <div className="bg-v5-surface rounded-xl shadow-sm border border-v5-line/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] min-w-[820px] border-collapse" data-testid="dashboard-tax-table">
            <thead>
              <tr className="text-[11px] text-v5-muted bg-v5-bg border-b border-v5-line/40">
                <th className="px-3 py-2 font-semibold text-left w-[32%] min-w-[220px]">Chỉ tiêu</th>
                <th className="px-2 py-2 font-semibold text-right border-l border-v5-line/30 min-w-[120px]">Trong ngày</th>
                <th className="px-2 py-2 font-semibold text-right border-l border-v5-line/30 min-w-[120px]">Tuần</th>
                <th
                  className="px-2 py-2 font-bold text-right border-l border-v5-line/30 min-w-[140px] bg-v5-accent/10 text-v5-ink"
                  data-testid="dash-cum-header-month"
                >
                  {monthLabel}
                </th>
                <th
                  className="px-2 py-2 font-bold text-right border-l border-v5-line/30 min-w-[140px] bg-v5-accent/10 text-v5-ink"
                  data-testid="dash-cum-header-year"
                >
                  Lũy kế năm
                </th>
                <th className="px-2 py-2 font-semibold text-center border-l border-v5-line/30 min-w-[130px]">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <React.Fragment key={g.id}>
                  <tr className="bg-v5-bg/70 border-y border-v5-line/30">
                    <td colSpan={6} className="px-3 py-1.5 font-bold uppercase tracking-wide text-[11px] text-v5-ink">
                      {g.name}
                    </td>
                  </tr>
                  {g.metrics.map((m) => {
                    const state = m.status?.monthState || "NONE";
                    return (
                      <React.Fragment key={m.id}>
                        <tr className="border-b border-v5-line/20 align-top" data-testid={`dash-row-${m.code}`}>
                          <td className="px-3 py-2">
                            <span className="font-medium text-v5-ink">{m.name}</span>
                            {m.unitLabel ? <span className="text-[11px] text-v5-muted"> · {m.unitLabel}</span> : null}
                          </td>
                          {COLS.map((c) => (
                            <td
                              key={c}
                              data-testid={c === "month" || c === "year" ? `dash-cum-${c}-${m.code}` : undefined}
                              title={m.cols[c] !== null ? fmtMetric(m.cols[c], m) : undefined}
                              className={`px-2 py-2 text-right tabular-nums border-l border-v5-line/20 ${
                                c === "month" || c === "year"
                                  ? "bg-v5-accent/5 font-bold text-v5-ink"
                                  : ""
                              }`}
                            >
                              {m.cols[c] === null ? (
                                <span className="text-v5-muted" title="Chưa nhập">
                                  —
                                </span>
                              ) : (
                                fmtMetricCompact(m.cols[c], m, { withUnit: false })
                              )}
                            </td>
                          ))}
                          <td className="px-2 py-2 text-center border-l border-v5-line/20">
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold whitespace-nowrap ${
                                MONTH_STATE_STYLES[state] || MONTH_STATE_STYLES.NONE
                              }`}
                              data-testid={`dash-status-${m.code}`}
                            >
                              {MONTH_STATE_LABELS[state] || state}
                            </span>
                          </td>
                        </tr>
                        {m.classCols.map((cc) => (
                          <tr key={m.id + cc.classificationId} className="border-b border-v5-line/20 bg-v5-surface/60">
                            <td className="px-3 py-1.5 pl-8 text-v5-muted">↳ {cc.label}</td>
                            {COLS.map((c) => (
                              <td
                                key={c}
                                className={`px-2 py-1.5 text-right tabular-nums border-l border-v5-line/20 ${
                                  c === "month" || c === "year"
                                    ? "bg-v5-accent/5 font-semibold text-v5-ink"
                                    : "text-v5-muted"
                                }`}
                              >
                                {cc.cols[c] === null ? (
                                  <span className="text-v5-muted" title="Chưa nhập">
                                    —
                                  </span>
                                ) : (
                                  <span title={fmtMetric(cc.cols[c], m)}>
                                    {fmtMetricCompact(cc.cols[c], m, { withUnit: false })}
                                  </span>
                                )}
                              </td>
                            ))}
                            <td className="px-2 py-1.5 text-center text-v5-muted border-l border-v5-line/20">—</td>
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <RevenueComparisonSection comparison={comparison} className="mt-3" />
      <p className="text-[11px] text-v5-muted mt-1.5">
        “—” là <b>chưa nhập</b> (khác với số 0 đã nhập). Trạng thái theo tháng: Đã nhập → Đã xác nhận → Đã chốt báo cáo.
        <span className="lg:hidden"> Bảng cuộn ngang trên điện thoại.</span>
      </p>
    </section>
  );
}
