"use client";

import React from "react";
import Link from "next/link";
import { fmtDate, fmtMetric, fmtPercent } from "@/lib/metric-format";
import { usePermissions } from "@/hooks/usePermissions";

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
  const rows = Array.isArray(comparison?.rows) ? comparison!.rows! : [];
  if (rows.length === 0) return null;

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

  const sourceLine = (block: ComparisonTargetBlock) => (
    <span className="text-body-xs text-on-surface-variant block">
      {block.label ? `${block.label} · ${block.periodLabel}` : block.periodLabel}
      {block.dataSource === "DEMO" ? (
        <span className="ml-1 text-[10px] px-1 py-0.5 rounded border border-slate-300 bg-slate-50 text-slate-600 font-semibold">DEMO</span>
      ) : null}
      {block.sourceNote ? <span className="block italic">Căn cứ: {block.sourceNote}</span> : null}
      {block.confirmedAt ? <span className="block">Xác nhận: {fmtDate(block.confirmedAt)}</span> : null}
    </span>
  );

  const targetRow = (
    label: string,
    block: ComparisonTargetBlock,
    current: number | null,
    currentLabel: string,
    rowStyle: { displayScale: number; decimals: number; unitLabel: string }
  ) => {
    const hasCurrent = current !== null;
    const hasTarget = block.targetValue !== null;
    return (
      <tr className="border-b border-border-default/20 align-top">
        <td className="px-3 py-2 font-medium text-on-surface">{label}</td>
        <td className="px-3 py-2 text-body-xs text-on-surface-variant">{sourceLine(block)}</td>
        <td className="px-3 py-2 text-right tabular-nums">
          {hasCurrent && hasTarget ? (
            <>
              {fmtMetric(current, rowStyle, { withUnit: false })} / {fmtMetric(block.targetValue, rowStyle, { withUnit: false })}
              <span className="text-body-xs text-on-surface-variant"> ({currentLabel})</span>
            </>
          ) : block.ruleState === "AMBIGUOUS" ? (
            <span className="text-on-surface-variant italic">Chưa xác định quy tắc đối chiếu</span>
          ) : (
            <span className="text-on-surface-variant italic">Chưa có dữ liệu đối chiếu</span>
          )}
        </td>
        <td className="px-3 py-2 text-center">{targetChip(block)}</td>
      </tr>
    );
  };

  const diffRow = (
    label: string,
    block: ComparisonDiffBlock,
    current: number | null,
    currentLabel: string,
    rowStyle: { displayScale: number; decimals: number; unitLabel: string }
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
      <tr className="border-b border-border-default/20 align-top">
        <td className="px-3 py-2 font-medium text-on-surface">{label}</td>
        <td className="px-3 py-2 text-body-xs text-on-surface-variant">
          {block.label}
          <span className="block text-[10px] text-on-surface-variant">{block.note}</span>
        </td>
        <td className="px-3 py-2 text-right tabular-nums">
          {hasData ? (
            <>
              {fmtMetric(current, rowStyle, { withUnit: false })} so với {fmtMetric(block.value, rowStyle, { withUnit: false })}
              <span className="text-body-xs text-on-surface-variant"> ({currentLabel})</span>
            </>
          ) : (
            <span className="text-on-surface-variant italic">Chưa có dữ liệu đối chiếu</span>
          )}
        </td>
        <td className="px-3 py-2 text-center">
          <div className="flex flex-col items-center gap-1">
            {block.percent !== null ? (
              <span className={`text-[11px] px-1.5 py-0.5 rounded border font-semibold ${percentTone}`}>
                {block.percentText}%
              </span>
            ) : (
              <span className="text-[10px] px-1.5 py-0.5 rounded border border-border-default text-on-surface-variant font-semibold">
                {block.ruleState === "NO_DATA" ? "Chưa xác định" : "Không %"}
              </span>
            )}
            {block.ruleState === "INCOMPLETE_PERIOD" ? (
              <span
                data-testid="comparison-incomplete"
                className="text-[10px] px-1.5 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800 font-semibold whitespace-nowrap"
                title="B1-A: tháng hiện tại chưa đủ kỳ; chỉ so cùng số ngày đến data cutoff, không hiển thị 0% khi thiếu."
              >
                Chưa đủ kỳ
              </span>
            ) : null}
            {block.ruleState === "SAME_DAYS" ? (
              <span className="text-[10px] text-on-surface-variant whitespace-nowrap">{block.dayCount} ngày</span>
            ) : null}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className={`bg-surface-container-lowest rounded-xl shadow-sm border border-border-default/50 overflow-hidden ${className}`} data-testid="comparison-section">
      <div className="px-4 py-3 bg-surface-container-low border-b border-border-default/40 flex items-center gap-2 flex-wrap">
        <span className="material-symbols-outlined text-[18px] text-primary">compare_arrows</span>
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
        {(showConfigureLink || canConfigure) && (
          <Link
            href="/giao-ban/cau-hinh?tab=TARGET&metric=THU_NSNN"
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-label-sm font-semibold text-primary hover:bg-primary/10 whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-[16px]">edit_note</span>
            Nhập chỉ tiêu đối chiếu →
          </Link>
        )}
      </div>

      <div className="p-4 flex flex-col gap-5">
        {rows.map((r) => {
          const rowStyle = { displayScale: r.displayScale, decimals: r.decimals, unitLabel: r.unitLabel };
          return (
            <div key={r.metricId} data-testid={`comparison-${r.code}`}>
              <div className="flex items-baseline gap-2 flex-wrap mb-1.5">
                <span className="font-semibold text-on-surface">{r.name}</span>
                {r.unitLabel ? <span className="text-body-xs text-on-surface-variant">({r.unitLabel})</span> : null}
                {r.latestDate ? <span className="text-body-xs text-on-surface-variant">Số liệu đến {fmtDate(r.latestDate)}</span> : null}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-body-sm min-w-[720px] border-collapse">
                  <thead>
                    <tr className="text-body-xs text-on-surface-variant border-b border-border-default/40">
                      <th className="px-3 py-1.5 font-semibold text-left">Nội dung đối chiếu</th>
                      <th className="px-3 py-1.5 font-semibold text-left">Nguồn / Kỳ</th>
                      <th className="px-3 py-1.5 font-semibold text-right">Số liệu đối chiếu</th>
                      <th className="px-3 py-1.5 font-semibold text-center w-[130px]">Tỷ lệ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {targetRow("Chỉ tiêu Bộ Tài chính (năm)", r.btc, r.yearCum, "LK năm", rowStyle)}
                    {targetRow("Chỉ tiêu UBND tỉnh (năm)", r.ubnd, r.yearCum, "LK năm", rowStyle)}
                    {targetRow("Kế hoạch tháng HQTL", r.monthPlan, r.monthCum, "LK tháng", rowStyle)}
                    {diffRow("So với tháng trước", r.prevMonth, r.monthCum, "LK tháng", rowStyle)}
                    {diffRow("So với cùng kỳ năm trước", r.samePeriodLastYear, r.monthCum, "LK tháng", rowStyle)}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

        <p className="text-body-xs text-on-surface-variant">
          Công thức: % BTC/UBND = lũy kế năm / chỉ tiêu năm × 100; % KH tháng = lũy kế tháng / kế hoạch tháng × 100. Chỉ tiêu BTC/UBND/KH
          tháng phải được cấu hình tường minh trong <b>Cấu hình → Chỉ tiêu giao</b>, có nguồn dữ liệu <b>REAL</b> (không dùng DEMO), ở
          trạng thái Đã xác nhận/Đã chốt và chỉ tiêu/kỳ phải có <b>quy tắc đánh giá đã duyệt</b> (V3.2/D5-A). Tỷ lệ hiển thị 2 chữ số
          thập phân; thiếu dữ liệu hoặc mẫu số bằng 0 hiển thị “Chưa xác định”, không tự hiện 0%. Hai dòng kỳ trước/cùng kỳ so{" "}
          <b>cùng số ngày đến data cutoff</b> (B1-A); tháng chưa đủ kỳ ghi “Chưa đủ kỳ”.
        </p>
      </div>
    </div>
  );
}
