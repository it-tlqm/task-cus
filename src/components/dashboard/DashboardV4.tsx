"use client";

import { V5Icon } from "@/components/v5/ui/lucide-icon";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatVnDate } from "@/lib/datetime";
import { fmtMetric, fmtMetricCompact } from "@/lib/metric-format";
import { usePermissions } from "@/hooks/usePermissions";
import { RevenueComparisonSection, type ComparisonData } from "@/components/dashboard/RevenueComparisonSection";

type PeriodKey = "today" | "week" | "month" | "year";
type ViewKey = "overview" | "charts" | "table" | "compare";

interface KpiResponse {
  kpis: {
    totalTasks: number;
    inProgress: number;
    waitingReview: number;
    completed: number;
    overdue: number;
    notStarted: number;
    completionRate: number | null;
    averageProgress: number | null;
  };
  departmentBreakdown: Array<{ id: string; name: string; totalTasks: number }>;
  hotAlerts: Array<{ id: string; code: string; title: string; type: string; severity: string; ownerName: string; message: string }>;
  selectedPeriod?: { title?: string };
}

interface MetricRow {
  id: string;
  code: string;
  name: string;
  unitLabel: string;
  displayScale?: number;
  decimals: number;
  cols: Record<string, number | null>;
  latestDate?: string | null;
  status?: { monthState?: string };
  targets?: Array<{
    periodType: string;
    targetValue: number;
    percent: number | null;
    percentText: string | null;
    status: string;
    isOfficial: boolean;
  }>;
}

interface SummaryResponse {
  groups: Array<{ id: string; code: string; name: string; metrics: MetricRow[] }>;
  dataQuality?: { demoPresent?: boolean; mixedWithReal?: boolean };
  comparison?: {
    rows?: Array<{
      code: string;
      name: string;
      unitLabel: string;
      monthCum: number | null;
      yearCum: number | null;
      prevMonth?: { value: number | null; label?: string; periodComplete?: boolean };
      samePeriodLastYear?: { value: number | null; label?: string; periodComplete?: boolean };
      monthPlan?: { targetValue: number | null; label?: string; status?: string };
    }>;
    anchors?: { monthLabel?: string; prevMonthLabel?: string; lastYearLabel?: string };
  };
}

interface QualityResponse {
  data: Array<{ approval?: { quality?: { effective: number | null } | null } }>;
  qualityEnabled?: boolean;
}

const PERIOD_LABEL: Record<PeriodKey, string> = {
  today: "Hôm nay",
  week: "Tuần này",
  month: "Tháng này",
  year: "Năm nay",
};

const PERIOD_COL: Record<PeriodKey, string> = {
  today: "day",
  week: "week",
  month: "month",
  year: "year",
};

const COLORS = ["#1E40AF", "#3B82F6", "#D97706", "#059669", "#94A3B8"];

function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (Math.abs(value) >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} tỷ`;
  }
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tr`;
  }
  return value.toLocaleString("vi-VN");
}

function formatPercent(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toLocaleString("vi-VN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
}

function metricStatusLabel(status?: string): string {
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

function metricStatusTone(status?: string): string {
  switch (status) {
    case "LOCKED":
      return "border-emerald-300 bg-emerald-50 text-emerald-700";
    case "CONFIRMED":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "RECORDED":
      return "border-sky-200 bg-sky-50 text-sky-700";
    default:
      return "border-v5-line bg-v5-bg text-v5-muted";
  }
}

function MetricMiniBars({
  metric,
  period,
}: {
  metric: MetricRow;
  period: PeriodKey;
}) {
  const keys = ["day", "week", "month", "year"] as const;
  const values = keys.map((key) => Math.max(0, Number(metric.cols?.[key] ?? 0)));
  const max = Math.max(...values, 1);
  return (
    <div className="flex h-7 items-end gap-0.5" aria-hidden="true">
      {keys.map((key, index) => {
        const height = Math.max(10, Math.round((values[index] / max) * 100));
        const active = PERIOD_COL[period] === key;
        return (
          <span
            key={key}
            title={`${key}: ${fmtMetricCompact(metric.cols?.[key] ?? null, {
              displayScale: metric.displayScale || 1,
              decimals: metric.decimals ?? 0,
              unitLabel: metric.unitLabel,
            })}`}
            className={`w-1.5 rounded-sm ${active ? "bg-v5-accent" : "bg-v5-accent/20"}`}
            style={{ height: `${height}%` }}
          />
        );
      })}
    </div>
  );
}

function MetricWidgetBoard({
  groups,
  period,
  periodLabel,
  maxMetrics = 12,
}: {
  groups: SummaryResponse["groups"];
  period: PeriodKey;
  periodLabel: string;
  maxMetrics?: number;
}) {
  const totalMetrics = groups.reduce((total, group) => total + group.metrics.length, 0);
  let remaining = maxMetrics;
  const visibleGroups = groups
    .map((group) => {
      const metrics = group.metrics.slice(0, Math.max(0, remaining));
      remaining -= metrics.length;
      return { ...group, metrics };
    })
    .filter((group) => group.metrics.length > 0);
  const shownMetrics = visibleGroups.reduce((total, group) => total + group.metrics.length, 0);

  return (
    <section className="space-y-3" data-testid="dashboard-v4-widgets">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-semibold text-sm text-v5-ink">Số liệu giao ban</h2>
          <p className="text-[11px] text-v5-muted">
            {shownMetrics < totalMetrics ? `${shownMetrics}/${totalMetrics}` : totalMetrics} chỉ tiêu · widget theo nhóm ·{" "}
            {periodLabel.toLowerCase()}
          </p>
        </div>
        <Link href="/giao-ban" className="text-[11px] font-semibold text-v5-accent hover:underline">
          Mở toàn bộ →
        </Link>
      </div>

      {totalMetrics === 0 && (
        <div className="rounded-xl border border-dashed border-v5-line/60 bg-v5-surface p-6 text-center text-[12px] text-v5-muted">
          Chưa có chỉ tiêu hiển thị trên dashboard.
        </div>
      )}

      {visibleGroups.map((group) => (
        <div key={group.id} className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-[11px] font-bold uppercase tracking-wide text-v5-muted">
              {group.name}
            </h3>
            <span className="text-[10px] text-v5-muted">{group.metrics.length} chỉ tiêu</span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {group.metrics.map((metric) => {
              const value = metric.cols?.[PERIOD_COL[period]] ?? null;
              const style = {
                displayScale: metric.displayScale || 1,
                decimals: metric.decimals ?? 0,
                unitLabel: metric.unitLabel,
              };
              return (
                <article
                  key={metric.id}
                  className="flex min-w-0 flex-col justify-between gap-2 rounded-xl border border-v5-line/60 bg-v5-surface p-3 shadow-sm transition-fast hover:border-v5-accent/30 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-[12px] text-v5-ink" title={metric.name}>
                        {metric.name}
                      </div>
                      <div className="mt-0.5 text-[10px] text-v5-muted">
                        {metric.code}
                        {metric.unitLabel ? ` · ${metric.unitLabel}` : ""}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold ${metricStatusTone(
                        metric.status?.monthState
                      )}`}
                    >
                      {metricStatusLabel(metric.status?.monthState)}
                    </span>
                  </div>

                  <div className="flex items-end justify-between gap-2">
                    <div className="min-w-0">
                      <div
                        className="truncate text-sm font-bold tabular-nums text-v5-ink"
                        title={fmtMetric(value, style)}
                      >
                        {fmtMetricCompact(value, style, { withUnit: false })}
                      </div>
                      <div className="text-[10px] text-v5-muted">{periodLabel}</div>
                    </div>
                    <MetricMiniBars metric={metric} period={period} />
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}

export default function DashboardV4() {
  const { can } = usePermissions();
  const canConfigureMetrics = can("metrics.config");
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [view, setView] = useState<ViewKey>("overview");
  const [kpi, setKpi] = useState<KpiResponse | null>(null);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [quality, setQuality] = useState<QualityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [kpiRes, summaryRes, qualityRes] = await Promise.all([
          fetch(`/api/dashboard/kpi?unitId=ALL&period=${period}`),
          fetch("/api/metrics/summary?scope=dashboard&comparison=1"),
          fetch("/api/tasks?status=COMPLETED&pageSize=50"),
        ]);
        const kpiJson = await kpiRes.json().catch(() => ({}));
        const summaryJson = await summaryRes.json().catch(() => ({}));
        const qualityJson = await qualityRes.json().catch(() => ({}));
        if (!kpiRes.ok) throw new Error(kpiJson.error || "Không tải được KPI");
        if (!summaryRes.ok) throw new Error(summaryJson.error || "Không tải được số liệu");
        if (cancelled) return;
        setKpi(kpiJson);
        setSummary(summaryJson);
        setQuality(qualityJson);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Không tải được bảng điều hành");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [period]);

  const metrics = useMemo(
    () => (summary?.groups || []).flatMap((group) => group.metrics),
    [summary]
  );
  const revenueMetric = useMemo(
    () =>
      metrics.find((m) => m.code === "THU_NSNN") ||
      metrics.find((m) => m.name.toLowerCase().includes("thu nsnn")) ||
      null,
    [metrics]
  );
  const revenueValue = revenueMetric?.cols?.[PERIOD_COL[period]] ?? null;
  const revenueTarget = useMemo(() => {
    const periodType = period === "today" ? "DAY" : period.toUpperCase();
    return revenueMetric?.targets?.find((t) => t.periodType === periodType) || null;
  }, [period, revenueMetric]);
  const revenuePercent =
    revenueTarget?.percent ??
    (revenueValue !== null && revenueTarget?.targetValue
      ? (revenueValue / revenueTarget.targetValue) * 100
      : null);

  const qualityValues = useMemo(
    () =>
      (quality?.data || [])
        .map((t) => t.approval?.quality?.effective)
        .filter((v): v is number => typeof v === "number"),
    [quality]
  );
  const qualityAverage = qualityValues.length
    ? qualityValues.reduce((a, b) => a + b, 0) / qualityValues.length
    : null;

  const taskChartData = kpi
    ? [
        { name: "Đang làm", value: kpi.kpis.inProgress, color: "#1E40AF" },
        { name: "Chờ duyệt", value: kpi.kpis.waitingReview, color: "#3B82F6" },
        { name: "Quá hạn", value: kpi.kpis.overdue, color: "#D97706" },
        { name: "Hoàn thành", value: kpi.kpis.completed, color: "#059669" },
        { name: "Chưa bắt đầu", value: kpi.kpis.notStarted, color: "#CBD5E1" },
      ].filter((x) => x.value > 0)
    : [];

  const comparisonRow = summary?.comparison?.rows?.[0];
  const comparisonData = comparisonRow
    ? [
        { name: "Kỳ này", value: comparisonRow.monthCum ?? null },
        { name: "Tháng trước", value: comparisonRow.prevMonth?.value ?? null },
        { name: "Cùng kỳ", value: comparisonRow.samePeriodLastYear?.value ?? null },
        { name: "Chỉ tiêu tháng", value: comparisonRow.monthPlan?.targetValue ?? null },
      ]
    : [];
  const hasComparisonData = comparisonData.some((d) => typeof d.value === "number");

  const departments = (kpi?.departmentBreakdown || [])
    .slice()
    .sort((a, b) => b.totalTasks - a.totalTasks)
    .slice(0, 6);

  const alerts = kpi?.hotAlerts || [];
  const periodTitle = kpi?.selectedPeriod?.title || PERIOD_LABEL[period];
  const latestDate = revenueMetric?.latestDate ?? null;

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-[1500px] mx-auto space-y-4">
        <div className="h-8 w-64 rounded bg-v5-bg animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-36 rounded-xl bg-v5-bg animate-pulse" />
          ))}
        </div>
        <div className="h-80 rounded-xl bg-v5-bg animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 lg:p-8 max-w-3xl mx-auto">
        <div className="bg-v5-danger-soft border border-v5-danger/30 rounded-xl p-5">
          <h1 className="text-sm text-v5-ink font-bold">Không tải được bảng điều hành</h1>
          <p className="mt-2 text-[12px] text-v5-muted">{error}</p>
          <Link className="inline-flex mt-4 text-v5-accent font-semibold" href="/dashboard">
            Về giao diện hiện tại
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-app-bg pb-12">
      <div className="max-w-[1500px] mx-auto px-4 lg:px-8 pt-5 lg:pt-6 space-y-4">
        <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-headline-md text-v5-ink font-bold">Bảng điều hành</h1>
              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full bg-v5-accent/10 text-v5-accent">
                V4
              </span>
            </div>
            <p className="text-v5-muted mt-1">
              Hải quan cửa khẩu Quốc tế Tà Lùng · {periodTitle}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="h-10 px-3 inline-flex items-center gap-1.5 rounded-lg bg-v5-surface border border-v5-line text-v5-ink font-semibold text-[12px] hover:bg-v5-bg"
            >
              <V5Icon name="arrow_back" className="text-[18px]" />
              Giao diện cũ
            </Link>
            <button
              type="button"
              onClick={() => window.print()}
              className="h-10 px-3 inline-flex items-center gap-1.5 rounded-lg bg-v5-accent text-white font-semibold text-[12px] hover:bg-v5-accent/90"
            >
              <V5Icon name="print" className="text-[18px]" />
              In / PDF
            </button>
          </div>
        </header>

        <section className="bg-v5-surface border border-v5-line/60 rounded-xl p-2.5 shadow-sm flex flex-col xl:flex-row xl:items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-9 items-center gap-1.5 px-3 rounded-lg bg-v5-bg text-v5-ink font-semibold text-[12px]">
              <V5Icon name="account_balance" className="text-[17px]" />
              HQCK Quốc tế Tà Lùng
            </span>
            <div className="grid grid-cols-4 gap-1 bg-v5-bg rounded-lg p-1 min-w-[340px] sm:min-w-[420px]">
              {(Object.keys(PERIOD_LABEL) as PeriodKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPeriod(key)}
                  aria-pressed={period === key}
                  className={`h-8 px-2 rounded-md font-semibold text-[11px] transition-fast ${
                    period === key ? "bg-v5-accent text-white shadow-sm" : "text-v5-muted hover:bg-v5-surface"
                  }`}
                >
                  {PERIOD_LABEL[key]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                ["overview", "Tổng quan"],
                ["charts", "Biểu đồ"],
                ["table", "Chỉ tiêu"],
                ["compare", "So sánh"],
              ] as Array<[ViewKey, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                aria-pressed={view === key}
                className={`h-9 px-3 rounded-lg font-semibold text-[12px] transition-fast ${
                  view === key
                    ? "bg-v5-accent/10 text-v5-accent border border-v5-accent/20"
                    : "text-v5-muted hover:bg-v5-bg"
                }`}
              >
                {label}
              </button>
            ))}
            <Link
              href="/giao-ban"
              className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg bg-v5-accent text-white font-semibold text-[12px] hover:bg-v5-accent/90"
            >
              <V5Icon name="table_view" className="text-[17px]" />
              Số liệu giao ban
            </Link>
            <Link
              href="/v5"
              className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border border-v5-accent/20 bg-v5-accent/5 text-v5-ink font-semibold text-[12px] hover:bg-v5-accent/10"
            >
              <V5Icon name="auto_awesome" className="text-[17px]" />
              Bảng điều hành mới
            </Link>
          </div>
        </section>

        {(view === "overview" || view === "table" || view === "compare") && summary && (
          <MetricWidgetBoard
            groups={summary.groups}
            period={period}
            periodLabel={PERIOD_LABEL[period]}
            maxMetrics={view === "table" ? 1000 : 12}
          />
        )}

        {(view === "overview" || view === "table" || view === "compare") && summary?.comparison && (
          <RevenueComparisonSection
            comparison={summary.comparison as unknown as ComparisonData}
          />
        )}

        {(view === "overview" || view === "charts") && (
          <section className="grid grid-cols-1 xl:grid-cols-3 gap-3">
            <Panel
              className="xl:col-span-2"
              title="So sánh thu NSNN"
              subtitle={`${comparisonRow?.name || "Thu NSNN"} · tháng hiện tại, tháng trước, cùng kỳ và chỉ tiêu`}
              action={
                <div className="flex items-center gap-2">
                  {canConfigureMetrics && (
                    <Link
                      href="/giao-ban/cau-hinh?tab=TARGET&metric=THU_NSNN"
                      className="text-[11px] font-semibold text-v5-ink bg-v5-accent/5 border border-v5-accent/20 rounded-md px-2 py-1 hover:bg-v5-accent/10"
                    >
                      Nhập chỉ tiêu →
                    </Link>
                  )}
                  <Link href="/giao-ban/bao-cao" className="text-[11px] font-semibold text-v5-accent">Chi tiết →</Link>
                </div>
              }
            >
              <div className="h-[280px] px-1">
                {hasComparisonData ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={comparisonData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                      <YAxis
                        tick={{ fontSize: 10, fill: "#64748b" }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => `${Math.round(Number(v) / 1_000_000_000)}`}
                        width={38}
                      />
                      <Tooltip formatter={(v: any) => formatMoney(Number(v))} />
                      <Bar dataKey="value" name="Giá trị" radius={[5, 5, 0, 0]}>
                        {comparisonData.map((_, i) => (
                          <Cell key={i} fill={i === 0 ? "#1E40AF" : i === 3 ? "#D97706" : "#93C5FD"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart text="Chưa có dữ liệu đối chiếu" />
                )}
              </div>
            </Panel>

            <Panel
              title="Tiến độ chỉ tiêu"
              subtitle={comparisonRow?.monthPlan?.label || `Kế hoạch ${PERIOD_LABEL[period].toLowerCase()}`}
            >
              <div className="flex flex-col items-center justify-center h-[280px] gap-3">
                <div
                  className="relative w-[180px] h-[180px] rounded-full grid place-items-center"
                  style={{
                    background: `conic-gradient(#1E40AF 0 ${Math.max(0, Math.min(100, revenuePercent ?? 0))}%, #e2e8f0 ${Math.max(0, Math.min(100, revenuePercent ?? 0))}% 100%)`,
                  }}
                  role="img"
                  aria-label={`Tiến độ chỉ tiêu ${formatPercent(revenuePercent ?? 0)}`}
                >
                  <div className="absolute inset-[14px] rounded-full bg-v5-surface grid place-items-center text-center">
                    <div>
                      <div className="font-headline-md text-v5-ink font-bold tabular-nums">
                        {revenuePercent === null ? "—" : formatPercent(revenuePercent)}
                      </div>
                      <div className="text-[11px] text-v5-muted">hoàn thành</div>
                    </div>
                  </div>
                </div>
                <p className="text-v5-muted text-center max-w-[220px]">
                  {revenueTarget
                    ? `Chỉ tiêu: ${formatMoney(revenueTarget.targetValue)}`
                    : "Chưa cấu hình chỉ tiêu cho kỳ này."}
                </p>
              </div>
            </Panel>
          </section>
        )}

        {(view === "overview" || view === "charts") && (
          <>
            {view === "overview" && (
              <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                <KpiCard
                  label="Thu NSNN / chỉ tiêu"
                  value={revenueValue === null ? "—" : formatMoney(revenueValue)}
                  note={
                    revenueTarget && revenuePercent !== null
                      ? `${formatPercent(revenuePercent)} kế hoạch ${PERIOD_LABEL[period].toLowerCase()}`
                      : revenueTarget
                      ? "Chưa tính được %"
                      : "Chưa cấu hình chỉ tiêu"
                  }
                  tone="primary"
                  icon="payments"
                  progress={revenuePercent}
                  href="/giao-ban"
                />
                <KpiCard
                  label="Nhiệm vụ đang thực hiện"
                  value={String(kpi?.kpis.inProgress ?? 0)}
                  note={`${kpi?.kpis.totalTasks ?? 0} nhiệm vụ trong kỳ · ${kpi?.kpis.completionRate ?? 0}% hoàn thành`}
                  tone="blue"
                  icon="assignment"
                  progress={kpi?.kpis.completionRate ?? undefined}
                  href="/tasks"
                />
                <KpiCard
                  label="Chờ duyệt / quá hạn"
                  value={String((kpi?.kpis.waitingReview ?? 0) + (kpi?.kpis.overdue ?? 0))}
                  note={`${kpi?.kpis.overdue ?? 0} quá hạn · ${kpi?.kpis.waitingReview ?? 0} chờ duyệt`}
                  tone="warning"
                  icon="schedule"
                  progress={
                    kpi?.kpis.totalTasks
                      ? ((kpi?.kpis.waitingReview ?? 0) + (kpi?.kpis.overdue ?? 0)) / kpi.kpis.totalTasks * 100
                      : undefined
                  }
                  href="/approvals"
                />
                <KpiCard
                  label="Chất lượng kết quả (YC-10)"
                  value={qualityAverage === null ? "—" : formatPercent(qualityAverage, 0)}
                  note={
                    !quality?.qualityEnabled
                      ? "YC-10 chưa bật"
                      : qualityValues.length
                      ? `${qualityValues.length} lượt đánh giá`
                      : "Chưa có đánh giá"
                  }
                  tone="success"
                  icon="verified"
                  progress={qualityAverage ?? undefined}
                  href="/approvals"
                />
              </section>
            )}

            <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <Panel title="Nhiệm vụ theo trạng thái" subtitle={`${kpi?.kpis.totalTasks ?? 0} nhiệm vụ trong kỳ`}>
                <div className="h-[255px] px-1">
                  {taskChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={taskChartData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={3}>
                          {taskChartData.map((entry, i) => (
                            <Cell key={entry.name} fill={entry.color || COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: any) => `${v} nhiệm vụ`} />
                        <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart text="Chưa có nhiệm vụ trong kỳ" />
                  )}
                </div>
              </Panel>

              <Panel
                title="Cảnh báo cần xử lý"
                subtitle={`${alerts.length} cảnh báo ưu tiên`}
                action={<Link href="/notifications" className="text-[11px] font-semibold text-v5-accent">Tất cả →</Link>}
              >
                <div className="h-[255px] overflow-y-auto space-y-2 px-4 pb-4">
                  {alerts.length === 0 ? (
                    <div className="h-full grid place-items-center text-[12px] text-v5-muted">Không có cảnh báo</div>
                  ) : (
                    alerts.map((a) => (
                      <Link
                        key={a.id}
                        href={`/tasks/${a.id}`}
                        className="flex items-start gap-2 rounded-lg border border-v5-line/60 bg-v5-bg/40 px-2.5 py-2 hover:bg-v5-bg"
                      >
                        <span
                          className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                            a.severity === "DANGER" ? "bg-v5-danger" : a.severity === "WARNING" ? "bg-v5-gold" : "bg-v5-accent"
                          }`}
                        />
                        <div className="min-w-0">
                          <div className="font-semibold text-[12px] text-v5-ink truncate">{a.type}: [{a.code}]</div>
                          <div className="text-[11px] text-v5-muted line-clamp-2">{a.title}</div>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </Panel>

              <Panel title="Tải công việc theo bộ phận" subtitle="Số nhiệm vụ trong kỳ">
                <div className="h-[255px] px-2">
                  {departments.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={departments} layout="vertical" margin={{ top: 8, right: 20, left: 4, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="name" width={82} tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                        <Tooltip formatter={(v: any) => `${v} nhiệm vụ`} />
                        <Bar dataKey="totalTasks" fill="#3B82F6" radius={[0, 4, 4, 0]} barSize={12} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart text="Chưa có dữ liệu bộ phận" />
                  )}
                </div>
              </Panel>
            </section>
          </>
        )}

        {view === "compare" && (
          <section className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <Panel
              title="So sánh thu NSNN"
              subtitle={comparisonRow?.name || "Thu NSNN"}
              action={
                canConfigureMetrics ? (
                  <Link
                    href="/giao-ban/cau-hinh?tab=TARGET&metric=THU_NSNN"
                    className="text-[11px] font-semibold text-v5-ink bg-v5-accent/5 border border-v5-accent/20 rounded-md px-2 py-1 hover:bg-v5-accent/10"
                  >
                    Nhập chỉ tiêu →
                  </Link>
                ) : null
              }
            >
              <div className="h-[320px] px-1">
                {hasComparisonData ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={comparisonData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={(v) => `${Math.round(Number(v) / 1_000_000_000)}`} tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} width={38} />
                      <Tooltip formatter={(v: any) => formatMoney(Number(v))} />
                      <Bar dataKey="value" radius={[5, 5, 0, 0]}>
                        {comparisonData.map((_, i) => (
                          <Cell key={i} fill={i === 0 ? "#1E40AF" : i === 3 ? "#D97706" : "#93C5FD"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart text="Chưa có dữ liệu đối chiếu" />
                )}
              </div>
            </Panel>
            <Panel title="Đối chiếu nhanh" subtitle="Nguồn số liệu hiện tại">
              <div className="px-5 py-4 space-y-3">
                {comparisonRow ? (
                  <>
                    <CompareLine label="Kỳ này" value={comparisonRow.monthCum} />
                    <CompareLine label={comparisonRow.prevMonth?.label || "Tháng trước"} value={comparisonRow.prevMonth?.value} />
                    <CompareLine label={comparisonRow.samePeriodLastYear?.label || "Cùng kỳ"} value={comparisonRow.samePeriodLastYear?.value} />
                    <CompareLine label={comparisonRow.monthPlan?.label || "Chỉ tiêu tháng"} value={comparisonRow.monthPlan?.targetValue} accent />
                    <p className="text-[11px] text-v5-muted pt-2 border-t border-v5-line/50">
                      Tỷ lệ chính thức chỉ hiển thị khi chỉ tiêu có nguồn REAL và đã xác nhận/chốt. Thiếu dữ liệu hiển thị “Chưa xác định”, không tự hiện 0%.
                    </p>
                  </>
                ) : (
                  <EmptyChart text="Chưa có dữ liệu đối chiếu" />
                )}
              </div>
            </Panel>
          </section>
        )}

        <p className="text-[10px] text-v5-muted px-1">
          Dashboard V4 · Dữ liệu đọc từ API hiện có · {latestDate ? `Số liệu đến ${formatVnDate(latestDate)}` : "Số liệu theo kỳ đang chọn"}
        </p>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  note,
  tone,
  icon,
  progress,
  href,
}: {
  label: string;
  value: string;
  note: string;
  tone: "primary" | "blue" | "warning" | "success";
  icon: string;
  progress?: number | null;
  href: string;
}) {
  const toneClass = {
    primary: "bg-v5-accent text-white",
    blue: "bg-v5-accent/15 text-v5-accent",
    warning: "bg-v5-gold-soft text-v5-gold-ink",
    success: "bg-v5-success-soft text-v5-success",
  }[tone];
  const barClass = {
    primary: "bg-v5-accent",
    blue: "bg-v5-accent",
    warning: "bg-v5-gold",
    success: "bg-v5-success",
  }[tone];
  return (
    <Link href={href} className="bg-v5-surface rounded-xl border border-v5-line/60 p-4 shadow-sm hover:shadow-md transition-fast block">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] text-v5-muted font-semibold">{label}</div>
        <span className={`w-8 h-8 rounded-lg grid place-items-center ${toneClass}`}>
          <V5Icon name={icon} className="text-[18px]" />
        </span>
      </div>
      <div className="mt-2.5 font-headline-md text-v5-ink font-bold tabular-nums">{value}</div>
      <div className="mt-1 text-[11px] text-v5-muted">{note}</div>
      <div className="mt-3 h-1.5 rounded-full bg-v5-bg overflow-hidden">
        <div
          className={`h-full rounded-full ${barClass}`}
          style={{ width: `${Math.max(0, Math.min(100, progress ?? 0))}%` }}
        />
      </div>
    </Link>
  );
}

function Panel({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`bg-v5-surface rounded-xl border border-v5-line/60 shadow-sm overflow-hidden ${className}`}>
      <div className="flex items-start justify-between gap-2 px-4 pt-3.5 pb-1">
        <div>
          <h2 className="text-sm text-v5-ink font-bold">{title}</h2>
          {subtitle ? <p className="text-[11px] text-v5-muted mt-0.5">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function CompareLine({ label, value, accent = false }: { label: string; value: number | null | undefined; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-v5-line/40 pb-2 last:border-0">
      <span className="text-v5-muted">{label}</span>
      <span className={`font-semibold tabular-nums ${accent ? "text-v5-gold-ink" : "text-v5-ink"}`}>
        {formatMoney(value)}
      </span>
    </div>
  );
}

function EmptyChart({ text }: { text: string }) {
  return (
    <div className="h-full grid place-items-center text-[12px] text-v5-muted text-center px-4">{text}</div>
  );
}
