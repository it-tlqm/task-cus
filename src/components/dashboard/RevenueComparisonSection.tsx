"use client";

import React from "react";
import Link from "next/link";
import { fmtDate, fmtMetric } from "@/lib/metric-format";

export interface ComparisonTargetBlock {
  targetId: string | null;
  label: string | null;
  comparisonKind: string | null;
  targetValue: number | null;
  percent: number | null;
  periodLabel: string;
  basis: "YEAR_CUM" | "MONTH_CUM";
  ruleState: "OFFICIAL" | "PROPOSED" | "AMBIGUOUS" | "NO_TARGET";
  ambiguous: boolean;
  status: string | null;
  sourceNote: string | null;
  confirmedAt: string | null;
}

export interface ComparisonDiffBlock {
  value: number | null;
  percent: null;
  label: string;
  basis: "FULL_PREVIOUS_MONTH_CUM" | "FULL_MONTH_LAST_YEAR_CUM";
  ruleState: "PENDING_B1";
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
 * - BTC/UBND/KH tháng: chỉ tính % khi target đã CONFIRMED/LOCKED; target PROPOSED
 *   hiển thị số gốc kèm nhãn "Chưa xác nhận" (không coi là chính thức).
 * - Tháng trước/cùng kỳ: B1 chưa chốt, không hiển thị phần trăm.
 * - Thiếu dữ liệu/mẫu số 0: "Chưa xác định", không tự hiện 0%.
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
  const rows = Array.isArray(comparison?.rows) ? comparison!.rows! : [];
  if (rows.length === 0) return null;

  const targetChip = (block: ComparisonTargetBlock) => {
    if (block.ruleState === "AMBIGUOUS")
      return <span className="text-[10px] px-1.5 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800 font-semibold">Nhiều chỉ tiêu trùng kỳ</span>;
    if (block.ruleState === "NO_TARGET")
      return <span className="text-[10px] px-1.5 py-0.5 rounded border border-border-default text-on-surface-variant font-semibold">Chưa cấu hình</span>;
    if (block.ruleState === "PROPOSED")
      return <span className="text-[10px] px-1.5 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800 font-semibold">Chưa xác nhận</span>;
    if (block.percent === null)
      return <span className="text-[10px] px-1.5 py-0.5 rounded border border-border-default text-on-surface-variant font-semibold">Chưa xác định</span>;
    const cls =
      block.percent >= 100
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-amber-200 bg-amber-50 text-amber-700";
    return <span className={`text-[11px] px-1.5 py-0.5 rounded border font-semibold ${cls}`}>{block.percent}%</span>;
  };

  const sourceLine = (block: ComparisonTargetBlock) => (
    <span className="text-body-xs text-on-surface-variant block">
      {block.label ? `${block.label} · ${block.periodLabel}` : block.periodLabel}
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
    return (
      <tr className="border-b border-border-default/20 align-top">
        <td className="px-3 py-2 font-medium text-on-surface">{label}</td>
        <td className="px-3 py-2 text-body-xs text-on-surface-variant">{block.label}</td>
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
          <span
            className="text-[10px] px-1.5 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800 font-semibold whitespace-nowrap"
            title="B1 chưa chốt: chưa xác định so cùng số ngày hay cả tháng"
          >
            Chờ chốt quy tắc
          </span>
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
          data-testid="comparison-rule-pending"
          title="B1 chưa chốt: chưa xác định 'tháng trước/cùng kỳ' so cùng số ngày hay cả tháng. API không trả phần trăm cho 2 dòng này."
          className="ml-auto text-[10px] px-1.5 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800 font-semibold whitespace-nowrap"
        >
          Kỳ trước/cùng kỳ: CHỜ CHỐT (B1)
        </span>
        {showConfigureLink && (
          <Link href="/giao-ban/cau-hinh" className="text-label-sm font-semibold text-primary hover:underline whitespace-nowrap">
            Cấu hình chỉ tiêu →
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
          tháng phải được cấu hình tường minh trong <b>Cấu hình → Chỉ tiêu giao</b> (không dò nhãn) và ở trạng thái Đã xác nhận/Đã chốt.
          Thiếu dữ liệu hoặc mẫu số bằng 0 hiển thị “Chưa xác định”, không tự hiện 0%. Hai dòng kỳ trước/cùng kỳ đang chờ quyết định B1.
        </p>
      </div>
    </div>
  );
}
