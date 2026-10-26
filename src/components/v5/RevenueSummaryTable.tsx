"use client";

import React from "react";
import Link from "next/link";
import { ChevronRight, CircleDollarSign } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/v5/ui/card";
import { Badge } from "@/components/v5/ui/badge";
import { fmtDate, fmtMetricCompact } from "@/lib/metric-format";
import { cn } from "@/lib/utils";

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
  cols: Cols & Record<string, number | null>;
  classCols?: ClassCol[];
  latestDate?: string | null;
}

interface TargetBlock {
  targetValue?: number | null;
  percent?: number | null;
  percentText?: string | null;
  label?: string | null;
}

interface ComparisonRow {
  btc?: TargetBlock;
  ubnd?: TargetBlock;
  monthPlan?: TargetBlock;
  prevMonth?: { percent?: number | null; percentText?: string | null; value?: number | null; label?: string };
  samePeriodLastYear?: { percent?: number | null; percentText?: string | null; value?: number | null; label?: string };
}

interface Group {
  id: string;
  name: string;
  metrics: Metric[];
}

function findMetric(groups: Group[], code: string): Metric | null {
  for (const group of groups) {
    const found = group.metrics.find((metric) => metric.code === code);
    if (found) return found;
  }
  return null;
}

function formatValue(value: number | null | undefined, metric?: Metric | null): string {
  if (value === null || value === undefined) return "—";
  return fmtMetricCompact(
    value,
    {
      displayScale: metric?.displayScale || 1,
      decimals: metric?.decimals ?? 0,
      unitLabel: metric?.unitLabel,
    },
    { withUnit: false }
  );
}

function percentText(block?: TargetBlock | null): string {
  if (!block) return "—";
  if (block.percentText) return `${block.percentText.replace(/%$/, "")}%`;
  if (block.percent !== null && block.percent !== undefined) {
    return `${block.percent.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%`;
  }
  return "Chưa xác định";
}

function diffText(block?: { percent?: number | null; percentText?: string | null } | null): string {
  if (!block) return "—";
  if (block.percentText) return `${block.percentText.replace(/%$/, "")}%`;
  if (block.percent !== null && block.percent !== undefined) {
    return `${block.percent.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%`;
  }
  return "Chưa xác định";
}

function percentTone(block: { percent?: number | null } | null | undefined, kind: "target" | "diff"): string {
  const value = block?.percent;
  if (value === null || value === undefined) return "text-v5-danger";
  if (kind === "target") return value >= 100 ? "text-v5-success" : "text-v5-danger";
  return value >= 0 ? "text-v5-success" : "text-v5-danger";
}

export function RevenueSummaryTable({
  groups,
  comparison,
  latestDate,
}: {
  groups: Group[];
  comparison?: { rows?: ComparisonRow[] } | null;
  latestDate?: string | null;
}) {
  const tax = findMetric(groups, "THU_NSNN");
  const vehicle = findMetric(groups, "OTO_XE") || findMetric(groups, "OTO_XE_PS");
  const usd = findMetric(groups, "TRI_GIA_USD") || findMetric(groups, "XNK_USD");
  const noTax = findMetric(groups, "NO_THUE");
  const row = comparison?.rows?.[0];

  const classes = tax?.classCols?.length
    ? tax.classCols
    : [{ classificationId: "", label: "Tổng Thu NSNN", cols: tax?.cols || {} }];

  const rows = classes.map((item) => {
    const normalized = item.label.toLowerCase();
    const isCar = normalized.includes("ô tô");
    const isOther = normalized.includes("khác");
    const usdClass = usd?.classCols?.find((candidate) => {
      const label = candidate.label.toLowerCase();
      return isCar ? label.includes("ô tô") : isOther ? label.includes("khác") : false;
    });
    return {
      key: item.classificationId || item.label,
      label: item.label,
      day: item.cols.day ?? null,
      monthTax: item.cols.month ?? null,
      monthVehicle: isCar ? vehicle?.cols.month ?? null : null,
      yearVehicle: isCar ? vehicle?.cols.year ?? null : null,
      yearUsd: usdClass?.cols.year ?? usd?.cols.year ?? null,
      yearTax: item.cols.year ?? null,
      isOther,
    };
  });

  const sumOrNull = (values: Array<number | null>) => {
    const present = values.filter((value): value is number => value !== null);
    return present.length ? present.reduce((sum, value) => sum + value, 0) : null;
  };
  const totalDay = tax?.cols.day ?? sumOrNull(rows.map((item) => item.day));
  const totalMonthTax = tax?.cols.month ?? sumOrNull(rows.map((item) => item.monthTax));
  const totalYearTax = tax?.cols.year ?? sumOrNull(rows.map((item) => item.yearTax));

  const summaryItems = [
    { label: "Chỉ tiêu BTC", block: row?.btc, value: row?.btc?.targetValue, kind: "target" as const },
    { label: "Chỉ tiêu UBND tỉnh", block: row?.ubnd, value: row?.ubnd?.targetValue, kind: "target" as const },
    { label: "Kế hoạch tháng HQTL", block: row?.monthPlan, value: row?.monthPlan?.targetValue, kind: "target" as const },
    { label: "So với tháng trước", block: row?.prevMonth, value: null, kind: "diff" as const },
    { label: "So với cùng kỳ 2025", block: row?.samePeriodLastYear, value: null, kind: "diff" as const },
  ];

  const noTaxValue = noTax ? noTax.cols.month ?? noTax.cols.year ?? null : null;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-start justify-between gap-3 border-b border-v5-line/70 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-v5-accent-soft text-v5-accent">
              <CircleDollarSign className="h-3.5 w-3.5" />
            </span>
            <CardTitle className="text-[15px]">Tổng hợp số thu ngày</CardTitle>
          </div>
          <p className="mt-1 text-[11px] text-v5-muted">
            {latestDate ? `Số liệu đến ${fmtDate(latestDate)}` : "Số liệu kỳ hiện tại"} · đơn vị: đồng / USD / xe
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">Dữ liệu thật</Badge>
          <Link href="/v5/giao-ban" className="inline-flex items-center gap-1 text-[11px] font-medium text-v5-accent hover:underline">
            Chi tiết <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="grid grid-cols-2 divide-x divide-y divide-v5-line/70 border-b border-v5-line/70 md:grid-cols-5 md:divide-y-0">
          {summaryItems.map((item) => (
            <div key={item.label} className="px-3 py-2.5">
              <div className="text-[9px] font-semibold uppercase tracking-wide text-v5-muted">{item.label}</div>
              <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
                {item.value !== null && item.value !== undefined ? (
                  <span className="text-[12px] font-semibold tabular-nums text-v5-ink">{formatValue(item.value, tax)}</span>
                ) : null}
                <span className={`text-[11px] font-semibold ${percentTone(item.block, item.kind)}`}>
                  {percentText(item.block)}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse text-[11px]" data-testid="v5-revenue-summary-table">
            <thead>
              <tr className="border-b border-v5-line/70 bg-v5-bg/60 text-[10px] text-v5-muted">
                <th rowSpan={2} className="border-r border-v5-line/60 px-3 py-2 text-left font-semibold">
                  Chỉ tiêu
                </th>
                <th rowSpan={2} className="border-r border-v5-line/60 px-3 py-2 text-right font-semibold">
                  Số thuế phát sinh trong ngày
                </th>
                <th colSpan={2} className="border-r border-v5-line/60 px-3 py-1.5 text-center font-semibold text-v5-accent">
                  Lũy kế tháng
                </th>
                <th colSpan={3} className="px-3 py-1.5 text-center font-semibold text-v5-accent">
                  Lũy kế từ đầu năm
                </th>
              </tr>
              <tr className="border-b border-v5-line/70 bg-v5-bg/40 text-[10px] text-v5-muted">
                <th className="border-r border-v5-line/60 px-3 py-1.5 text-right font-medium">Số tiền thuế</th>
                <th className="border-r border-v5-line/60 px-3 py-1.5 text-right font-medium">Lượng xe</th>
                <th className="border-r border-v5-line/60 px-3 py-1.5 text-right font-medium">SL xe</th>
                <th className="border-r border-v5-line/60 px-3 py-1.5 text-right font-medium">Trị giá USD</th>
                <th className="px-3 py-1.5 text-right font-medium">Tổng số thuế</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.key} className="border-b border-v5-line/50 hover:bg-v5-bg/40">
                  <td className="border-r border-v5-line/40 px-3 py-2 font-medium text-v5-ink">
                    {item.label}
                    {item.isOther && <span className="ml-1 text-[9px] text-v5-muted"> (than cốc; VPHC)</span>}
                  </td>
                  <td className="border-r border-v5-line/40 px-3 py-2 text-right tabular-nums text-v5-ink">{formatValue(item.day, tax)}</td>
                  <td className="border-r border-v5-line/40 px-3 py-2 text-right tabular-nums text-v5-ink">{formatValue(item.monthTax, tax)}</td>
                  <td className="border-r border-v5-line/40 px-3 py-2 text-right tabular-nums text-v5-muted">{formatValue(item.monthVehicle, vehicle)}</td>
                  <td className="border-r border-v5-line/40 px-3 py-2 text-right tabular-nums text-v5-muted">{formatValue(item.yearVehicle, vehicle)}</td>
                  <td className="border-r border-v5-line/40 px-3 py-2 text-right tabular-nums text-v5-muted">{formatValue(item.yearUsd, usd)}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-v5-ink">{formatValue(item.yearTax, tax)}</td>
                </tr>
              ))}
              <tr className="border-b border-v5-line/70 bg-v5-gold-soft/50 font-semibold">
                <td className="border-r border-v5-line/40 px-3 py-2 text-v5-ink">TỔNG CỘNG</td>
                <td className="border-r border-v5-line/40 px-3 py-2 text-right tabular-nums text-v5-ink">{formatValue(totalDay, tax)}</td>
                <td className="border-r border-v5-line/40 px-3 py-2 text-right tabular-nums text-v5-ink">{formatValue(totalMonthTax, tax)}</td>
                <td className="border-r border-v5-line/40 px-3 py-2 text-right tabular-nums text-v5-muted">—</td>
                <td className="border-r border-v5-line/40 px-3 py-2 text-right tabular-nums text-v5-muted">{formatValue(vehicle?.cols.year, vehicle)}</td>
                <td className="border-r border-v5-line/40 px-3 py-2 text-right tabular-nums text-v5-muted">{formatValue(usd?.cols.year, usd)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-v5-ink">{formatValue(totalYearTax, tax)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {noTaxValue !== null && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-v5-line/70 bg-v5-gold-soft/30 px-3 py-2.5 text-[11px]">
            <span className="font-medium text-v5-gold-ink">Đã mở TK chưa nộp thuế</span>
            <span className="font-semibold tabular-nums text-v5-ink">{formatValue(noTaxValue, noTax)}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
