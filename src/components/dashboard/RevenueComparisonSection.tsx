"use client";

import { V5Icon } from "@/components/v5/ui/icon";

import React, { useState } from "react";
import Link from "next/link";
import { fmtDate, fmtMetric, fmtMetricCompact, fmtPercent } from "@/lib/metric-format";
import { usePermissions } from "@/hooks/usePermissions";
import { shiftComparisonDate } from "@/lib/comparison-dates";
import ComparisonTargetQuickModal from "@/components/dashboard/ComparisonTargetQuickModal";

export interface ComparisonTargetBlock {
  targetId: string | null;
  label: string | null;
  comparisonKind: string | null;
  targetValue: number | null;
  percent: number | null;
  percentText: string | null;
  periodLabel: string;
  basis: "YEAR_CUM" | "MONTH_CUM";
  ruleState: "OFFICIAL" | "PROPOSED" | "AMBIGUOUS" | "NO_TARGET" | "NOT_APPROVED";
  ambiguous: boolean;
  status: string | null;
  dataSource: string | null;
  isOfficial: boolean;
  sourceNote: string | null;
  confirmedAt: string | null;
  direction?: string;
  measureMode?: string;
  baselineScope?: string;
}

export interface ComparisonDiffBlock {
  value: number | null;
  percent: number | null;
  percentText: string | null;
  label: string;
  basis: "SAME_DAYS_TO_CUTOFF";
  ruleState: "SAME_DAYS" | "INCOMPLETE_PERIOD" | "NO_DATA";
  cutoffDate: string | null;
  dayCount: number;
  periodComplete: boolean;
  note: string;
}

export interface ComparisonRow {
  metricId: string;
  code: string;
  name: string;
  unitType: string;
  unitLabel: string;
  displayScale: number;
  decimals: number;
  yearCum: number | null;
  monthCum: number | null;
  latestDate: string | null;
  btc: ComparisonTargetBlock;
  ubnd: ComparisonTargetBlock;
  monthPlan: ComparisonTargetBlock;
  prevMonth: ComparisonDiffBlock;
  samePeriodLastYear: ComparisonDiffBlock;
}

export interface ComparisonData {
  version?: string;
  rule?: {
    targetSource?: string;
    prevMonth?: string;
    samePeriodLastYear?: string;
    notes?: string;
  };
  anchors?: {
    year?: number;
    month?: number;
    monthLabel?: string;
    prevMonthLabel?: string;
    lastYearLabel?: string;
  };
  rows?: ComparisonRow[];
}

/**
 * YC-01 — Khối "So sánh kết quả thu NSNN" dùng CHUNG cho Dashboard và /giao-ban.
 * - BTC/UBND/KH tháng: chỉ tính % khi target đã CONFIRMED/LOCKED + quy tắc D5 đã duyệt;
 *   target PROPOSED hiển thị số gốc kèm nhãn "Chưa xác nhận" (không coi là chính thức).
 * - Tháng trước/cùng kỳ (B1-A): so CÙNG SỐ NGÀY đến data cutoff; tháng chưa đủ kỳ ghi
 *   "Chưa đủ kỳ"; thiếu dữ liệu/mẫu số 0 hiển thị "Chưa xác định", không tự hiện 0%.
 */
export function RevenueComparisonSection({
  comparison,
  className = "",
  showConfigureLink = false,
}: {
  comparison: ComparisonData | null | undefined;
  className?: string;
  showConfigureLink?: boolean;
}) {
  const { can } = usePermissions();
  const canConfigure = can("metrics.config");
  const [quickTargetOpen, setQuickTargetOpen] = useState(false);
  const rows = Array.isArray(comparison?.rows) ? comparison!.rows! : [];
  if (rows.length === 0) return null;

  const primaryRow = rows.find((row) => row.code === "THU_NSNN") || rows[0]!;
  const quickYear = comparison?.anchors?.year || new Date().getFullYear();
  const quickMonth = comparison?.anchors?.month || new Date().getMonth() + 1;

  const targetChip = (block: ComparisonTargetBlock) => {
    if (block.ruleState === "AMBIGUOUS")
      return <span className="text-[10px] px-1.5 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800 font-semibold">Nhiều chỉ tiêu trùng kỳ</span>;
    if (block.ruleState === "NO_TARGET")
      return <span className="text-[10px] px-1.5 py-0.5 rounded border border-border-default text-on-surface-variant font-semibold">Chưa cấu hình</span>;
    if (block.ruleState === "NOT_APPROVED")
      return <span className="text-[10px] px-1.5 py-0.5 rounded border border-border-default text-on-surface-variant font-semibold">Chưa có quy tắc gán chỉ tiêu</span>;
    if (block.ruleState === "PROPOSED")
      return <span className="text-[10px] px-1.5 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800 font-semibold">Chưa xác nhận</span>;
    if (block.percent === null)
      return <span className="text-[10px] px-1.5 py-0.5 rounded border border-border-default text-on-surface-variant font-semibold">Chưa xác định</span>;
    // D5-A: chỉ tô xanh/đỏ khi chiều đánh giá đã duyệt; NEUTRAL/khác giữ trung tính.
    const cls =
      block.direction === "HIGHER_IS_BETTER"
        ? block.percent >= 100
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-amber-200 bg-amber-50 text-amber-700"
        : "border-border-default text-on-surface-variant";
    // B-C-2/Q11: API trả percentText 2 chữ số thập phân, dấu phẩy vi-VN.
    return (
      <span className={`text-[11px] px-1.5 py-0.5 rounded border font-semibold ${cls}`}>
        {block.percentText ? `${block.percentText}%` : fmtPercent(block.percent)}
      </span>
    );
  };

  const targetWidget = (
    label: string,
    block: ComparisonTargetBlock,
    current: number | null,
    currentLabel: string,
    rowStyle: { displayScale: number; decimals: number; unitLabel: string }
  ) => {
    const hasCurrent = current !== null;
    const hasTarget = block.targetValue !== null;
    return (
      <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-border-default/50 bg-surface-container-low/30 p-3">
        <div className="flex items-start justify-between gap-2">
          <span className="text-body-xs font-semibold leading-snug text-on-surface-variant">{label}</span>
          <span className="shrink-0">{targetChip(block)}</span>
        </div>
        {hasCurrent && hasTarget ? (
          <>
            <div className="flex flex-wrap items-baseline gap-1.5">
              <span
                className="text-headline-sm font-bold tabular-nums text-primary"
                title={fmtMetric(current, rowStyle)}
              >
                {fmtMetricCompact(current, rowStyle, { withUnit: false })}
              </span>
              <span className="text-body-xs text-on-surface-variant">
                / {fmtMetricCompact(block.targetValue, rowStyle, { withUnit: false })}
              </span>
            </div>
            <div className="text-[10px] text-on-surface-variant">{currentLabel} · so với chỉ tiêu</div>
          </>
        ) : (
          <div className="flex min-h-[52px] items-center text-body-xs italic text-on-surface-variant">
            {block.ruleState === "AMBIGUOUS"
              ? "Chưa xác định quy tắc đối chiếu"
              : "Chưa có dữ liệu đối chiếu"}
          </div>
        )}
      </div>
    );
  };

  const diffWidget = (
    label: string,
    block: ComparisonDiffBlock,
    current: number | null,
    currentLabel: string,
    rowStyle: { displayScale: number; decimals: number; unitLabel: string },
    actualDate: string | null
  ) => {
    const hasData = current !== null && block.value !== null;
    const percentTone =
      block.percent === null
        ? "border-border-default text-on-surface-variant"
        : block.percent > 0
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : block.percent < 0
            ? "border-rose-200 bg-rose-50 text-rose-700"
            : "border-border-default text-on-surface-variant";
    return (
      <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-border-default/50 bg-surface-container-low/30 p-3">
        <div className="flex items-start justify-between gap-2">
          <span className="text-body-xs font-semibold leading-snug text-on-surface-variant">{label}</span>
          <span className="shrink-0">
            {block.percent !== null ? (
              <span className={`text-[11px] px-1.5 py-0.5 rounded border font-semibold ${percentTone}`}>
                {block.percentText}%
              </span>
            ) : (
              <span className="text-[10px] px-1.5 py-0.5 rounded border border-border-default font-semibold text-on-surface-variant">
                {block.ruleState === "NO_DATA" ? "Chưa xác định" : "Không %"}
              </span>
            )}
          </span>
        </div>

        {hasData ? (
          <>
            <div className="flex flex-wrap items-baseline gap-1.5">
              <span
                className="text-headline-sm font-bold tabular-nums text-primary"
                title={fmtMetric(current, rowStyle)}
              >
                {fmtMetricCompact(current, rowStyle, { withUnit: false })}
              </span>
              <span className="text-body-xs text-on-surface-variant">
                so với {fmtMetricCompact(block.value, rowStyle, { withUnit: false })}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-on-surface-variant">
              <span>{currentLabel}</span>
              {block.ruleState === "INCOMPLETE_PERIOD" ? (
                <span
                  data-testid="comparison-incomplete"
                  className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-800"
                  title="B1-A: tháng hiện tại chưa đủ kỳ; chỉ so cùng số ngày đến data cutoff, không hiển thị 0% khi thiếu."
                >
                  Chưa đủ kỳ
                </span>
              ) : null}
              {block.ruleState === "SAME_DAYS" ? <span>{block.dayCount} ngày</span> : null}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-start gap-1">
            <span className="text-body-xs italic text-on-surface-variant">Chưa có dữ liệu đối chiếu</span>
            {actualDate && (
              <Link
                href={`/giao-ban/nhap?date=${actualDate}&metric=THU_NSNN`}
                className="inline-flex items-center gap-1 rounded border border-primary/20 bg-primary/5 px-1.5 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/10"
                title={`Mở nhập số thực tế ngày ${actualDate}`}
              >
                <V5Icon name="edit_note" className="text-[13px]" />
                Nhập số thực tế
              </Link>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`bg-surface-container-lowest rounded-xl shadow-sm border border-border-default/50 overflow-hidden ${className}`} data-testid="comparison-section">
      <div className="px-4 py-3 bg-surface-container-low border-b border-border-default/40 flex items-center gap-2 flex-wrap">
        <V5Icon name="compare_arrows" className="text-[18px] text-primary" />
        <span className="font-label-lg text-label-lg text-primary font-bold uppercase tracking-wide">So sánh kết quả thu NSNN</span>
        <span className="text-body-xs text-on-surface-variant">
          ({comparison?.anchors?.monthLabel || ""} — tháng trước: {comparison?.anchors?.prevMonthLabel || ""}, cùng kỳ:{" "}
          {comparison?.anchors?.lastYearLabel || ""})
        </span>
        <span
          data-testid="comparison-rule-same-days"
          title="B1-A: tháng trước/cùng kỳ so CÙNG SỐ NGÀY đến data cutoff; tháng chưa đủ kỳ ghi 'Chưa đủ kỳ'; thiếu dữ liệu không hiển thị 0%."
          className="ml-auto text-[10px] px-1.5 py-0.5 rounded border border-sky-300 bg-sky-50 text-sky-800 font-semibold whitespace-nowrap"
        >
          Kỳ trước/cùng kỳ: SO CÙNG SỐ NGÀY (B1-A)
        </span>
        {canConfigure ? (
          <button
            type="button"
            onClick={() => setQuickTargetOpen(true)}
            title="Nhập nhanh BTC, UBND và KH tháng"
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-label-sm font-semibold text-primary hover:bg-primary/10 whitespace-nowrap"
          >
            <V5Icon name="edit_note" className="text-[16px]" />
            Nhập chỉ tiêu BTC/UBND/KH
          </button>
        ) : showConfigureLink ? (
          <Link
            href="/giao-ban/cau-hinh?tab=TARGET&metric=THU_NSNN"
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-label-sm font-semibold text-primary hover:bg-primary/10 whitespace-nowrap"
          >
            <V5Icon name="edit_note" className="text-[16px]" />
            Cấu hình chỉ tiêu →
          </Link>
        ) : null}
      </div>

      <div className="p-4 flex flex-col gap-5">
        {rows.map((r) => {
          const rowStyle = { displayScale: r.displayScale, decimals: r.decimals, unitLabel: r.unitLabel };
          const prevActualDate = r.latestDate ? shiftComparisonDate(r.latestDate, -1, 0) : null;
          const lastYearActualDate = r.latestDate ? shiftComparisonDate(r.latestDate, 0, -1) : null;
          return (
            <div key={r.metricId} data-testid={`comparison-${r.code}`}>
              <div className="flex items-baseline gap-2 flex-wrap mb-1.5">
                <span className="font-semibold text-on-surface">{r.name}</span>
                {r.unitLabel ? <span className="text-body-xs text-on-surface-variant">({r.unitLabel})</span> : null}
                {r.latestDate ? <span className="text-body-xs text-on-surface-variant">Số liệu đến {fmtDate(r.latestDate)}</span> : null}
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">
                Chỉ tiêu giao
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                {targetWidget("Chỉ tiêu Bộ Tài chính (năm)", r.btc, r.yearCum, "LK năm", rowStyle)}
                {targetWidget("Chỉ tiêu UBND tỉnh (năm)", r.ubnd, r.yearCum, "LK năm", rowStyle)}
                {targetWidget("Kế hoạch tháng HQTL", r.monthPlan, r.monthCum, "LK tháng", rowStyle)}
              </div>

              <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">
                So sánh kỳ
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {diffWidget("So với tháng trước", r.prevMonth, r.monthCum, "LK tháng", rowStyle, prevActualDate)}
                {diffWidget("So với cùng kỳ năm trước", r.samePeriodLastYear, r.monthCum, "LK tháng", rowStyle, lastYearActualDate)}
              </div>
            </div>
          );
        })}

      </div>

      <ComparisonTargetQuickModal
        open={quickTargetOpen}
        onClose={() => setQuickTargetOpen(false)}
        metricId={primaryRow.metricId}
        year={quickYear}
        month={quickMonth}
        onSaved={() => window.location.reload()}
      />
    </div>
  );
}
