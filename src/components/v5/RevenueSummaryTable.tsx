"use client";

import React from "react";
import Link from "next/link";
import { ChevronRight, CircleDollarSign, Pencil, Save, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/v5/ui/card";
import { Badge } from "@/components/v5/ui/badge";
import { Button } from "@/components/v5/ui/button";
import FormattedNumberInput from "@/components/ui/FormattedNumberInput";
import { toast } from "@/components/ui/Toast";
import { baseToInput, fmtDate, fmtMetricCompact } from "@/lib/metric-format";
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
  entryPeriod?: string;
  latest?: {
    date?: string;
    value?: number;
    status?: string;
    note?: string | null;
  } | null;
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
  period,
  periodLabel,
  onSaved,
}: {
  groups: Group[];
  comparison?: { rows?: ComparisonRow[] } | null;
  latestDate?: string | null;
  period: "week" | "month" | "year";
  periodLabel?: string;
  onSaved?: () => void;
}) {
  const tax = findMetric(groups, "THU_NSNN");
  const vehicle = findMetric(groups, "OTO_XE") || findMetric(groups, "OTO_XE_PS");
  const usd = findMetric(groups, "TRI_GIA_USD") || findMetric(groups, "XNK_USD");
  const noTax = findMetric(groups, "NO_THUE");
  const row = comparison?.rows?.[0];
  const [noTaxOpen, setNoTaxOpen] = React.useState(false);
  const [noTaxAmount, setNoTaxAmount] = React.useState("");
  const [noTaxNote, setNoTaxNote] = React.useState("");
  const [savingNoTax, setSavingNoTax] = React.useState(false);
  const [anchorsOpen, setAnchorsOpen] = React.useState(false);
  const [anchorMode, setAnchorMode] = React.useState<"MONTH" | "YTD">("MONTH");
  const [anchorReason, setAnchorReason] = React.useState("Bổ sung số liệu lịch sử để so sánh");
  const [anchorCurrent, setAnchorCurrent] = React.useState<Record<string, string>>({});
  const [anchorOpening, setAnchorOpening] = React.useState<Record<string, string>>({});
  const [anchorInitial, setAnchorInitial] = React.useState<Record<string, string>>({});
  const [anchorPrev, setAnchorPrev] = React.useState("");
  const [anchorPrevInitial, setAnchorPrevInitial] = React.useState("");
  const [anchorLastYear, setAnchorLastYear] = React.useState("");
  const [anchorLastYearInitial, setAnchorLastYearInitial] = React.useState("");
  const [savingAnchors, setSavingAnchors] = React.useState(false);

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
      weekTax: item.cols.week ?? null,
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
  const totalWeekTax = tax?.cols.week ?? sumOrNull(rows.map((item) => item.weekTax));
  const totalMonthTax = tax?.cols.month ?? sumOrNull(rows.map((item) => item.monthTax));
  const totalYearTax = tax?.cols.year ?? sumOrNull(rows.map((item) => item.yearTax));

  const summaryItems =
    period === "year"
      ? [
          { label: "Chỉ tiêu BTC", block: row?.btc, value: row?.btc?.targetValue, kind: "target" as const },
          { label: "Chỉ tiêu UBND tỉnh", block: row?.ubnd, value: row?.ubnd?.targetValue, kind: "target" as const },
        ]
      : [
          { label: "Chỉ tiêu BTC", block: row?.btc, value: row?.btc?.targetValue, kind: "target" as const },
          { label: "Chỉ tiêu UBND tỉnh", block: row?.ubnd, value: row?.ubnd?.targetValue, kind: "target" as const },
          { label: "Kế hoạch tháng HQTL", block: row?.monthPlan, value: row?.monthPlan?.targetValue, kind: "target" as const },
          { label: "So với tháng trước", block: row?.prevMonth, value: null, kind: "diff" as const },
          { label: "So với cùng kỳ 2025", block: row?.samePeriodLastYear, value: null, kind: "diff" as const },
        ];

  const noTaxValue = noTax ? noTax.cols.month ?? noTax.cols.year ?? null : null;
  const anchorDate = latestDate || new Date().toISOString().slice(0, 10);
  const fallbackStyle = { displayScale: 1, decimals: 0, unitLabel: "đồng" };
  const taxStyle = tax
    ? { displayScale: tax.displayScale || 1, decimals: tax.decimals ?? 0, unitLabel: tax.unitLabel }
    : fallbackStyle;
  const noTaxStyle = noTax
    ? { displayScale: noTax.displayScale || 1, decimals: noTax.decimals ?? 0, unitLabel: noTax.unitLabel }
    : fallbackStyle;
  const digitsOnly = (value: string) => value.replace(/[^\d]/g, "");
  const isYearLikeInput = (item: (typeof classes)[number]) => {
    const entered = digitsOnly(anchorCurrent[item.classificationId || ""] || "");
    if (!entered || item.cols.year === null || item.cols.year === undefined) return false;
    return entered === digitsOnly(baseToInput(item.cols.year, taxStyle));
  };
  const currentLooksLikeYear = anchorMode === "MONTH" && classes.some(isYearLikeInput);
  const currentMissing = classes.some(
    (item) => !digitsOnly(anchorCurrent[item.classificationId || ""] || "")
  );
  const openingMissing =
    anchorMode === "YTD" &&
    classes.some((item) => !digitsOnly(anchorOpening[item.classificationId || ""] || ""));
  const ytdInvalid =
    anchorMode === "YTD" &&
    classes.some((item) => {
      const key = item.classificationId || "";
      const current = Number(digitsOnly(anchorCurrent[key] || "") || "0");
      const opening = Number(digitsOnly(anchorOpening[key] || "") || "0");
      return current < opening;
    });
  const blockAnchorsSave = currentLooksLikeYear || currentMissing || openingMissing || ytdInvalid;

  function openNoTaxEditor() {
    setNoTaxAmount(
      noTaxValue !== null && noTaxValue !== undefined ? baseToInput(noTaxValue, noTaxStyle) : ""
    );
    setNoTaxNote(noTax?.latest?.note || "");
    setNoTaxOpen(true);
  }

  async function saveNoTax() {
    if (!noTax) return;
    if (!noTaxAmount.trim()) {
      toast.error("Vui lòng nhập số tiền thuế.");
      return;
    }
    setSavingNoTax(true);
    try {
      const res = await fetch("/api/metrics/entries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entryPeriod: noTax.entryPeriod || "MONTH",
          periodDate: anchorDate,
          entries: [
            {
              metricId: noTax.id,
              classificationId: "",
              value: noTaxAmount,
              note: noTaxNote.trim() || null,
            },
          ],
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        throw new Error(json?.errors?.[0]?.message || json.error || "Không lưu được số liệu.");
      }
      toast.success("Đã cập nhật nội dung và số tiền thuế.");
      setNoTaxOpen(false);
      onSaved?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không lưu được số liệu.");
    } finally {
      setSavingNoTax(false);
    }
  }

  React.useEffect(() => {
    const handler = () => openAnchorEditor();
    window.addEventListener("v5:open-anchors", handler);
    return () => window.removeEventListener("v5:open-anchors", handler);
  });

  function openAnchorEditor() {
    const preferYtd = classes.some((item) => {
      if (item.cols.month === null || item.cols.month === undefined) return false;
      if (item.cols.year === null || item.cols.year === undefined) return false;
      return (
        digitsOnly(baseToInput(item.cols.month, taxStyle)) ===
        digitsOnly(baseToInput(item.cols.year, taxStyle))
      );
    });
    const next: Record<string, string> = {};
    for (const item of classes) {
      const value = preferYtd ? item.cols.year : item.cols.month;
      next[item.classificationId || ""] =
        value !== null && value !== undefined ? baseToInput(value, taxStyle) : "";
    }
    setAnchorMode(preferYtd ? "YTD" : "MONTH");
    setAnchorCurrent(next);
    setAnchorInitial(next);
    setAnchorOpening({});
    const prevInitial =
      row?.prevMonth?.value !== null && row?.prevMonth?.value !== undefined
        ? baseToInput(row.prevMonth.value, taxStyle)
        : "";
    const lastYearInitial =
      row?.samePeriodLastYear?.value !== null && row?.samePeriodLastYear?.value !== undefined
        ? baseToInput(row.samePeriodLastYear.value, taxStyle)
        : "";
    setAnchorPrev(prevInitial);
    setAnchorPrevInitial(prevInitial);
    setAnchorLastYear(lastYearInitial);
    setAnchorLastYearInitial(lastYearInitial);
    setAnchorReason("Bổ sung số liệu lịch sử để so sánh");
    setAnchorsOpen(true);
  }

  async function saveAnchors() {
    if (!tax) return;
    const requests: Promise<Response>[] = [];
    const reason = anchorReason.trim() || "Bổ sung số liệu lịch sử để so sánh";
    for (const item of classes) {
      const key = item.classificationId || "";
      const currentRaw = (anchorCurrent[key] || "").trim();
      if (!currentRaw) continue;
      let value = currentRaw;
      if (anchorMode === "YTD") {
        const openingRaw = (anchorOpening[key] || "").trim();
        if (!openingRaw) continue;
        const current = Number(digitsOnly(currentRaw) || "0");
        const opening = Number(digitsOnly(openingRaw) || "0");
        if (current < opening) continue;
        value = String(current - opening);
      } else if (value === (anchorInitial[key] || "").trim()) {
        continue;
      }
      requests.push(
        fetch("/api/metrics/comparison-anchors", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            metricId: tax.id,
            classificationId: item.classificationId || "",
            period: "CURRENT_MONTH",
            value,
            reason,
            anchorDate,
          }),
        })
      );
    }
    if (anchorPrev.trim() && anchorPrev.trim() !== anchorPrevInitial.trim()) {
      requests.push(
        fetch("/api/metrics/comparison-anchors", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            metricId: tax.id,
            classificationId: "",
            period: "PREV_MONTH",
            value: anchorPrev,
            reason,
            anchorDate,
          }),
        })
      );
    }
    if (anchorLastYear.trim() && anchorLastYear.trim() !== anchorLastYearInitial.trim()) {
      requests.push(
        fetch("/api/metrics/comparison-anchors", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            metricId: tax.id,
            classificationId: "",
            period: "LAST_YEAR",
            value: anchorLastYear,
            reason,
            anchorDate,
          }),
        })
      );
    }
    if (currentMissing) {
      toast.error("Nhập đủ số lũy kế cho từng loại trước khi lưu.");
      return;
    }
    if (openingMissing) {
      toast.error("Nhập đủ lũy kế năm đầu tháng cho từng loại trước khi lưu.");
      return;
    }
    if (ytdInvalid) {
      toast.error("Lũy kế đầu tháng không được lớn hơn lũy kế đến hôm nay.");
      return;
    }
    if (requests.length === 0) {
      toast.error("Chưa có số liệu nào để lưu.");
      return;
    }
    if (
      currentLooksLikeYear &&
      !window.confirm(
        "Các số lũy kế tháng đang trùng với lũy kế năm. Nếu đang nhập số tháng, hãy sửa theo cột Lũy kế tháng trước khi lưu. Vẫn tiếp tục lưu?"
      )
    ) {
      return;
    }
    setSavingAnchors(true);
    try {
      const responses = await Promise.all(requests);
      let allConfirmed = true;
      for (const response of responses) {
        const json = await response.json().catch(() => ({}));
        if (!response.ok || !json.success) {
          throw new Error(json.error || "Không lưu được số liệu so sánh.");
        }
        if (json.confirmed === false) allConfirmed = false;
      }
      toast.success(
        allConfirmed
          ? "Đã cập nhật số liệu lũy kế."
          : "Đã ghi nhận số liệu, đang chờ người có quyền xác nhận."
      );
      setAnchorsOpen(false);
      onSaved?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không lưu được số liệu so sánh.");
    } finally {
      setSavingAnchors(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-start justify-between gap-3 border-b border-v5-line/70 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-v5-accent-soft text-v5-accent">
              <CircleDollarSign className="h-3.5 w-3.5" />
            </span>
            <CardTitle className="text-[15px]">
              {period === "year"
                ? "Tổng hợp số thu năm"
                : period === "week"
                  ? "Tổng hợp số thu tuần"
                  : "Tổng hợp số thu ngày"}
            </CardTitle>
          </div>
          <p className="mt-1 text-[11px] text-v5-muted">
            {periodLabel ? `${periodLabel} · ` : ""}
            {latestDate ? `Số liệu đến ${fmtDate(latestDate)}` : "Số liệu kỳ hiện tại"} · đơn vị: đồng / USD / xe
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Dữ liệu thật</Badge>
          <Button variant="outline" size="sm" onClick={openAnchorEditor}>
            <Pencil className="h-3 w-3" /> Nhập lũy kế
          </Button>
          <Link href="/v5/giao-ban" className="inline-flex items-center gap-1 text-[11px] font-medium text-v5-accent hover:underline">
            Chi tiết <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div
          className={`grid grid-cols-2 divide-x divide-y divide-v5-line/70 border-b border-v5-line/70 ${
            period === "year" ? "md:grid-cols-2" : "md:grid-cols-5 md:divide-y-0"
          }`}
        >
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

        {period === "year" ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-[11px]" data-testid="v5-revenue-summary-table">
              <thead>
                <tr className="border-b border-v5-line/70 bg-v5-bg/60 text-[10px] text-v5-muted">
                  <th className="border-r border-v5-line/60 px-3 py-2 text-left font-semibold">Chỉ tiêu</th>
                  <th className="border-r border-v5-line/60 px-3 py-2 text-right font-semibold text-v5-accent">
                    Lũy kế năm — Số tiền thuế
                  </th>
                  <th className="border-r border-v5-line/60 px-3 py-2 text-right font-semibold text-v5-accent">
                    Lượng xe năm
                  </th>
                  <th className="px-3 py-2 text-right font-semibold text-v5-accent">Trị giá USD năm</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.key} className="border-b border-v5-line/50 hover:bg-v5-bg/40">
                    <td className="border-r border-v5-line/40 px-3 py-2 font-medium text-v5-ink">
                      {item.label}
                      {item.isOther && <span className="ml-1 text-[9px] text-v5-muted"> (than cốc; VPHC)</span>}
                    </td>
                    <td className="border-r border-v5-line/40 px-3 py-2 text-right font-semibold tabular-nums text-v5-ink">
                      {formatValue(item.yearTax, tax)}
                    </td>
                    <td className="border-r border-v5-line/40 px-3 py-2 text-right tabular-nums text-v5-muted">
                      {formatValue(item.yearVehicle, vehicle)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-v5-muted">
                      {formatValue(item.yearUsd, usd)}
                    </td>
                  </tr>
                ))}
                <tr className="border-b border-v5-line/70 bg-v5-gold-soft/50 font-semibold">
                  <td className="border-r border-v5-line/40 px-3 py-2 text-v5-ink">TỔNG CỘNG</td>
                  <td className="border-r border-v5-line/40 px-3 py-2 text-right tabular-nums text-v5-ink">
                    {formatValue(totalYearTax, tax)}
                  </td>
                  <td className="border-r border-v5-line/40 px-3 py-2 text-right tabular-nums text-v5-muted">
                    {formatValue(vehicle?.cols.year, vehicle)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-v5-muted">
                    {formatValue(usd?.cols.year, usd)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse text-[11px]" data-testid="v5-revenue-summary-table">
              <thead>
                <tr className="border-b border-v5-line/70 bg-v5-bg/60 text-[10px] text-v5-muted">
                  <th rowSpan={2} className="border-r border-v5-line/60 px-3 py-2 text-left font-semibold">
                    Chỉ tiêu
                  </th>
                  <th rowSpan={2} className="border-r border-v5-line/60 px-3 py-2 text-right font-semibold">
                    {period === "week" ? "Số thuế phát sinh trong tuần" : "Số thuế phát sinh trong ngày"}
                  </th>
                  <th colSpan={2} className="border-r border-v5-line/60 px-3 py-1.5 text-center font-semibold text-v5-accent">
                    Lũy kế tháng
                  </th>
                  <th colSpan={3} className="px-3 py-1.5 text-center font-semibold text-v5-accent">
                    Lũy kế năm
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
                    <td className="border-r border-v5-line/40 px-3 py-2 text-right tabular-nums text-v5-ink">
                      {formatValue(period === "week" ? item.weekTax : item.day, tax)}
                    </td>
                    <td className="border-r border-v5-line/40 px-3 py-2 text-right tabular-nums text-v5-ink">{formatValue(item.monthTax, tax)}</td>
                    <td className="border-r border-v5-line/40 px-3 py-2 text-right tabular-nums text-v5-muted">{formatValue(item.monthVehicle, vehicle)}</td>
                    <td className="border-r border-v5-line/40 px-3 py-2 text-right tabular-nums text-v5-muted">{formatValue(item.yearVehicle, vehicle)}</td>
                    <td className="border-r border-v5-line/40 px-3 py-2 text-right tabular-nums text-v5-muted">{formatValue(item.yearUsd, usd)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-v5-ink">{formatValue(item.yearTax, tax)}</td>
                  </tr>
                ))}
                <tr className="border-b border-v5-line/70 bg-v5-gold-soft/50 font-semibold">
                  <td className="border-r border-v5-line/40 px-3 py-2 text-v5-ink">TỔNG CỘNG</td>
                  <td className="border-r border-v5-line/40 px-3 py-2 text-right tabular-nums text-v5-ink">
                    {formatValue(period === "week" ? totalWeekTax : totalDay, tax)}
                  </td>
                  <td className="border-r border-v5-line/40 px-3 py-2 text-right tabular-nums text-v5-ink">{formatValue(totalMonthTax, tax)}</td>
                  <td className="border-r border-v5-line/40 px-3 py-2 text-right tabular-nums text-v5-muted">—</td>
                  <td className="border-r border-v5-line/40 px-3 py-2 text-right tabular-nums text-v5-muted">{formatValue(vehicle?.cols.year, vehicle)}</td>
                  <td className="border-r border-v5-line/40 px-3 py-2 text-right tabular-nums text-v5-muted">{formatValue(usd?.cols.year, usd)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-v5-ink">{formatValue(totalYearTax, tax)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {noTax && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-v5-line/70 bg-v5-gold-soft/30 px-3 py-2.5 text-[11px]">
            <div className="min-w-0">
              <span className="font-medium text-v5-gold-ink">Đã mở TK chưa nộp thuế</span>
              {noTax.latest?.note ? (
                <span className="ml-2 text-v5-muted">Ghi chú: {noTax.latest.note}</span>
              ) : (
                <span className="ml-2 text-v5-muted">Chưa có nội dung</span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="font-semibold tabular-nums text-v5-ink">
                {noTaxValue !== null && noTaxValue !== undefined ? formatValue(noTaxValue, noTax) : "Chưa nhập"}
              </span>
              <Button variant="ghost" size="sm" onClick={openNoTaxEditor}>
                <Pencil className="h-3 w-3" /> Sửa
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      {noTaxOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md overflow-hidden rounded-xl border border-v5-line bg-v5-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-v5-line bg-v5-gold-soft/40 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-v5-ink">Đã mở TK chưa nộp thuế</h3>
                <p className="mt-0.5 text-[11px] text-v5-muted">Sửa nội dung ghi chú và số tiền thuế.</p>
              </div>
              <button type="button" onClick={() => setNoTaxOpen(false)} aria-label="Đóng">
                <X className="h-4 w-4 text-v5-muted" />
              </button>
            </div>
            <div className="space-y-3 p-4">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-v5-ink">Số tiền thuế</span>
                <FormattedNumberInput
                  value={noTaxAmount}
                  onValueChange={setNoTaxAmount}
                  className="h-10 w-full rounded-lg border border-v5-line bg-v5-surface px-3 text-right text-sm font-semibold tabular-nums text-v5-ink outline-none focus:border-v5-accent"
                  placeholder="Nhập số tiền"
                />
                <span className="text-[10px] text-v5-muted">{noTax?.unitLabel || "đồng"}</span>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-v5-ink">Nội dung / ghi chú</span>
                <textarea
                  value={noTaxNote}
                  onChange={(event) => setNoTaxNote(event.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Ví dụ: Kết nối Việt 01 xe; Newsing 01 xe; TM Vĩnh Phát 01 xe..."
                  className="w-full resize-none rounded-lg border border-v5-line bg-v5-surface px-3 py-2 text-sm text-v5-ink outline-none focus:border-v5-accent"
                />
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => setNoTaxOpen(false)} disabled={savingNoTax}>
                  Hủy
                </Button>
                <Button size="sm" onClick={saveNoTax} disabled={savingNoTax}>
                  <Save className="h-3.5 w-3.5" /> {savingNoTax ? "Đang lưu..." : "Lưu"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {anchorsOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-v5-line bg-v5-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-v5-line bg-v5-bg px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-v5-ink">Nhập số liệu lũy kế</h3>
                <p className="mt-0.5 text-[11px] text-v5-muted">
                  Dùng khi hệ thống mới triển khai, chưa có đủ dữ liệu ngày của tháng trước.
                  Tháng trước/cùng kỳ chỉ cần nhập một lần; từ tháng sau, số liệu ngày sẽ tự đủ.
                </p>
              </div>
              <button type="button" onClick={() => setAnchorsOpen(false)} aria-label="Đóng">
                <X className="h-4 w-4 text-v5-muted" />
              </button>
            </div>
            <div className="space-y-4 p-4">
              <section className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wide text-v5-muted">
                      Số liệu tháng hiện tại
                    </h4>
                    <p className="text-[11px] text-v5-muted">
                      {anchorMode === "YTD"
                        ? "Các số dưới đây là lũy kế năm. Nhập thêm lũy kế năm đầu tháng; hệ thống tự trừ ra số tháng, không cần xóa số năm."
                        : "Nhập số lũy kế tháng. Chỉ áp dụng cho tháng đang xem; sang tháng sau nhập theo ngày."}
                    </p>
                  </div>
                  <div className="inline-flex rounded-lg border border-v5-line bg-v5-bg p-0.5">
                    <button
                      type="button"
                      onClick={() => setAnchorMode("MONTH")}
                      className={`rounded px-2.5 py-1 text-[11px] font-semibold ${
                        anchorMode === "MONTH" ? "bg-v5-surface text-v5-accent shadow-sm" : "text-v5-muted"
                      }`}
                    >
                      Nhập số tháng
                    </button>
                    <button
                      type="button"
                      onClick={() => setAnchorMode("YTD")}
                      className={`rounded px-2.5 py-1 text-[11px] font-semibold ${
                        anchorMode === "YTD" ? "bg-v5-surface text-v5-accent shadow-sm" : "text-v5-muted"
                      }`}
                    >
                      Nhập lũy kế năm
                    </button>
                  </div>
                </div>

                {anchorMode === "YTD" ? (
                  <>
                    <div className="rounded-lg border border-v5-accent/20 bg-v5-accent-soft px-3 py-2 text-[11px] text-v5-accent">
                      Lũy kế đầu tháng là số lũy kế năm tại ngày cuối tháng trước (hoặc 0 nếu là tháng đầu năm).
                      Hệ thống tính: <b>tháng = lũy kế đến hôm nay − lũy kế đầu tháng</b>.
                    </div>
                    {classes.map((item) => {
                      const key = item.classificationId || "";
                      const currentDigits = digitsOnly(anchorCurrent[key] || "");
                      const openingDigits = digitsOnly(anchorOpening[key] || "");
                      const currentValue = Number(currentDigits || "0");
                      const openingValue = Number(openingDigits || "0");
                      const monthValue =
                        currentDigits && openingDigits && currentValue >= openingValue
                          ? currentValue - openingValue
                          : null;
                      return (
                        <div
                          key={key || "total"}
                          className="grid gap-2 rounded-lg border border-v5-line/70 p-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
                        >
                          <div className="text-xs font-semibold text-v5-ink sm:col-span-3">
                            {item.label || "Tổng Thu NSNN"}
                          </div>
                          <label className="flex flex-col gap-1">
                            <span className="text-[10px] text-v5-muted">Lũy kế năm đến hôm nay</span>
                            <FormattedNumberInput
                              value={anchorCurrent[key] || ""}
                              onValueChange={(value) =>
                                setAnchorCurrent((prev) => ({ ...prev, [key]: value }))
                              }
                              onFocus={(event) => event.currentTarget.select()}
                              className="h-9 w-full rounded-lg border border-v5-line bg-v5-surface px-2.5 text-right text-xs tabular-nums text-v5-ink outline-none focus:border-v5-accent"
                              placeholder="Lũy kế năm hiện tại"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[10px] text-v5-muted">Lũy kế năm đầu tháng</span>
                            <FormattedNumberInput
                              value={anchorOpening[key] || ""}
                              onValueChange={(value) =>
                                setAnchorOpening((prev) => ({ ...prev, [key]: value }))
                              }
                              onFocus={(event) => event.currentTarget.select()}
                              className={cn(
                                "h-9 w-full rounded-lg border border-v5-line bg-v5-surface px-2.5 text-right text-xs tabular-nums text-v5-ink outline-none focus:border-v5-accent",
                                openingDigits && currentValue < openingValue && "border-v5-danger bg-v5-danger-soft"
                              )}
                              placeholder="Lũy kế đầu tháng"
                            />
                          </label>
                          <div className="flex min-w-[150px] flex-col items-end rounded-lg bg-v5-bg px-3 py-1.5">
                            <span className="text-[10px] text-v5-muted">Số tháng tự tính</span>
                            <span className="text-sm font-semibold tabular-nums text-v5-ink">
                              {monthValue !== null ? monthValue.toLocaleString("vi-VN") : "—"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    {ytdInvalid && (
                      <div className="rounded-lg border border-v5-danger/30 bg-v5-danger-soft px-3 py-2 text-[11px] text-v5-danger">
                        Lũy kế đầu tháng đang lớn hơn lũy kế đến hôm nay. Kiểm tra lại ngày chốt đầu tháng.
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {classes.map((item) => (
                      <label
                        key={item.classificationId || "total"}
                        className="grid gap-1 sm:grid-cols-[1fr_220px] sm:items-center"
                      >
                        <span className="text-xs text-v5-ink">{item.label || "Tổng Thu NSNN"}</span>
                        <FormattedNumberInput
                          value={anchorCurrent[item.classificationId || ""] || ""}
                          onValueChange={(value) =>
                            setAnchorCurrent((prev) => ({ ...prev, [item.classificationId || ""]: value }))
                          }
                          onFocus={(event) => event.currentTarget.select()}
                          className={cn(
                            "h-9 w-full rounded-lg border border-v5-line bg-v5-surface px-2.5 text-right text-xs tabular-nums text-v5-ink outline-none focus:border-v5-accent",
                            isYearLikeInput(item) && "border-v5-danger bg-v5-danger-soft"
                          )}
                          placeholder="Nhập lũy kế tháng"
                        />
                      </label>
                    ))}
                    {currentLooksLikeYear && (
                      <div className="rounded-lg border border-v5-danger/30 bg-v5-danger-soft px-3 py-2 text-[11px] text-v5-danger">
                        Ô đỏ đang là lũy kế năm. Nếu có số năm, chuyển sang tab <b>Nhập lũy kế năm</b> để hệ
                        thống tự trừ đầu tháng. Nếu nhập tháng, sửa theo cột “Lũy kế tháng”.
                      </div>
                    )}
                  </>
                )}
              </section>

              <section className="grid gap-3 border-t border-v5-line/70 pt-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-v5-ink">
                    {row?.prevMonth?.label || "Tháng trước"}
                  </span>
                  <FormattedNumberInput
                    value={anchorPrev}
                    onValueChange={setAnchorPrev}
                    className="h-9 w-full rounded-lg border border-v5-line bg-v5-surface px-2.5 text-right text-xs tabular-nums text-v5-ink outline-none focus:border-v5-accent"
                    placeholder="Tổng cả tháng trước"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-v5-ink">
                    {row?.samePeriodLastYear?.label || "Cùng kỳ năm trước"}
                  </span>
                  <FormattedNumberInput
                    value={anchorLastYear}
                    onValueChange={setAnchorLastYear}
                    className="h-9 w-full rounded-lg border border-v5-line bg-v5-surface px-2.5 text-right text-xs tabular-nums text-v5-ink outline-none focus:border-v5-accent"
                    placeholder="Tổng cả tháng cùng kỳ"
                  />
                  <span className="text-[10px] text-v5-muted">
                    Nhập tổng tháng cùng kỳ năm trước, không nhập tổng tháng hiện tại.
                  </span>
                </label>
              </section>

              <label className="flex flex-col gap-1 border-t border-v5-line/70 pt-3">
                <span className="text-xs font-semibold text-v5-ink">Lý do</span>
                <input
                  value={anchorReason}
                  onChange={(event) => setAnchorReason(event.target.value)}
                  className="h-9 w-full rounded-lg border border-v5-line bg-v5-surface px-2.5 text-xs text-v5-ink outline-none focus:border-v5-accent"
                />
              </label>

              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setAnchorsOpen(false)} disabled={savingAnchors}>
                  Hủy
                </Button>
                <Button size="sm" onClick={saveAnchors} disabled={savingAnchors || blockAnchorsSave}>
                  <Save className="h-3.5 w-3.5" />{" "}
                  {savingAnchors
                    ? "Đang lưu..."
                    : currentLooksLikeYear
                      ? "Chuyển sang nhập lũy kế năm"
                      : openingMissing
                        ? "Nhập lũy kế đầu tháng"
                        : ytdInvalid
                          ? "Kiểm tra lũy kế đầu tháng"
                          : currentMissing
                            ? "Nhập đủ số liệu"
                            : "Lưu số liệu"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
