"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Gauge,
  ListFilter,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";
import { fmtMetric, fmtMetricCompact } from "@/lib/metric-format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/v5/ui/card";
import { Badge } from "@/components/v5/ui/badge";
import { Button } from "@/components/v5/ui/button";
import { Progress } from "@/components/v5/ui/progress";
import { RevenueSummaryTable } from "@/components/v5/RevenueSummaryTable";

type PeriodKey = "week" | "month" | "year";

const PERIOD_LABEL: Record<PeriodKey, string> = {
  week: "Tuần này",
  month: "Tháng này",
  year: "Năm nay",
};

const PERIOD_COL: Record<PeriodKey, "week" | "month" | "year"> = {
  week: "week",
  month: "month",
  year: "year",
};

interface MetricRow {
  id: string;
  code: string;
  name: string;
  unitLabel: string;
  displayScale?: number;
  decimals: number;
  cols: Record<string, number | null>;
  classCols?: Array<{
    classificationId: string;
    label: string;
    cols: Record<string, number | null>;
  }>;
  latestDate?: string | null;
  status?: { monthState?: string };
  targets?: Array<{
    periodType: string;
    targetValue: number;
    percent: number | null;
    percentText: string | null;
  }>;
}

interface SummaryGroup {
  id: string;
  name: string;
  metrics: MetricRow[];
}

interface ComparisonRow {
  code?: string;
  name?: string;
  monthCum?: number | null;
  btc?: { targetValue?: number | null; percent?: number | null; percentText?: string | null };
  ubnd?: { targetValue?: number | null; percent?: number | null; percentText?: string | null };
  monthPlan?: { targetValue?: number | null; percent?: number | null; percentText?: string | null };
  prevMonth?: { value?: number | null; label?: string };
  samePeriodLastYear?: { value?: number | null; label?: string };
}

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
  departmentBreakdown?: Array<{ id: string; name: string; totalTasks: number }>;
  hotAlerts?: Array<{ id: string; code: string; title: string; severity: string; type: string }>;
  selectedPeriod?: { title?: string };
}

interface SummaryResponse {
  groups: SummaryGroup[];
  range?: {
    month?: { label?: string };
    week?: { label?: string };
    year?: { label?: string };
  };
  comparison?: { rows?: ComparisonRow[]; anchors?: Record<string, string | number> };
}

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

function MiniBars({ metric, period }: { metric: MetricRow; period: PeriodKey }) {
  const keys = ["week", "month", "year"] as const;
  const values = keys.map((key) => Math.max(0, Number(metric.cols?.[key] ?? 0)));
  const max = Math.max(...values, 1);
  return (
    <div className="flex h-7 items-end gap-1" aria-hidden="true">
      {keys.map((key, i) => (
        <span
          key={key}
          className={`w-1.5 rounded-sm ${PERIOD_COL[period] === key ? "bg-v5-accent" : "bg-v5-accent/20"}`}
          style={{ height: `${Math.max(10, Math.round((values[i] / max) * 100))}%` }}
        />
      ))}
    </div>
  );
}

function MetricWidget({ metric, period }: { metric: MetricRow; period: PeriodKey }) {
  const style = {
    displayScale: metric.displayScale || 1,
    decimals: metric.decimals ?? 0,
    unitLabel: metric.unitLabel,
  };
  const value = metric.cols?.[PERIOD_COL[period]] ?? null;
  return (
    <div className="flex min-w-0 flex-col justify-between gap-2 rounded-lg border border-v5-line/70 bg-v5-surface p-3 transition-colors hover:border-v5-accent/35">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[12px] font-semibold text-v5-ink" title={metric.name}>
            {metric.name}
          </div>
          <div className="mt-0.5 text-[9px] text-v5-muted">
            {metric.code}
            {metric.unitLabel ? ` · ${metric.unitLabel}` : ""}
          </div>
        </div>
        <Badge variant={statusVariant(metric.status?.monthState)} className="shrink-0">
          {statusLabel(metric.status?.monthState)}
        </Badge>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-lg font-bold tabular-nums text-v5-ink" title={fmtMetric(value, style)}>
            {fmtMetricCompact(value, style, { withUnit: false })}
          </div>
          <div className="text-[9px] text-v5-muted">{PERIOD_LABEL[period]}</div>
        </div>
        <MiniBars metric={metric} period={period} />
      </div>
    </div>
  );
}

function KpiTile({
  label,
  value,
  note,
  icon: Icon,
  tone = "accent",
}: {
  label: string;
  value: string;
  note: string;
  icon: React.ElementType;
  tone?: "accent" | "warning" | "danger" | "success";
}) {
  const tones = {
    accent: "bg-v5-accent-soft text-v5-accent",
    warning: "bg-v5-gold-soft text-v5-gold-ink",
    danger: "bg-v5-danger-soft text-v5-danger",
    success: "bg-v5-success-soft text-v5-success",
  };
  return (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-v5-muted">{label}</div>
        <div className={`grid h-7 w-7 place-items-center rounded-lg ${tones[tone]}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <div className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-v5-ink">{value}</div>
      <div className="mt-1 text-[10px] text-v5-muted">{note}</div>
    </Card>
  );
}

export default function V5DashboardPage() {
  const { user } = usePermissions();
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [tab, setTab] = useState<"overview" | "data" | "work" | "report">("overview");
  const [kpi, setKpi] = useState<KpiResponse | null>(null);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function load(showSpinner = true) {
    if (showSpinner) setLoading(true);
    setRefreshing(true);
    setError(null);
    try {
      const [kpiRes, summaryRes] = await Promise.all([
        fetch(`/api/dashboard/kpi?unitId=ALL&period=${period}`, { cache: "no-store" }),
        fetch("/api/metrics/summary?comparison=1", { cache: "no-store" }),
      ]);
      const kpiJson = await kpiRes.json().catch(() => ({}));
      const summaryJson = await summaryRes.json().catch(() => ({}));
      if (!kpiRes.ok) throw new Error(kpiJson.error || "Không tải được KPI");
      if (!summaryRes.ok) throw new Error(summaryJson.error || "Không tải được số liệu giao ban");
      setKpi(kpiJson);
      setSummary(summaryJson);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được bảng điều hành");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const metrics = useMemo(
    () => (summary?.groups || []).flatMap((group) => group.metrics),
    [summary]
  );
  const revenueMetric = useMemo(
    () => metrics.find((m) => m.code === "THU_NSNN") || metrics.find((m) => m.name.toLowerCase().includes("thu nsnn")),
    [metrics]
  );
  const revenueValue = revenueMetric?.cols?.[PERIOD_COL[period]] ?? null;
  const comparisonRow = summary?.comparison?.rows?.[0];
  const matchingTarget = revenueMetric?.targets?.find((t) => t.periodType === period.toUpperCase());
  const revenueTarget = matchingTarget?.targetValue ?? comparisonRow?.monthPlan?.targetValue ?? null;
  const rawPercent =
    matchingTarget?.percent ??
    comparisonRow?.monthPlan?.percent ??
    (revenueValue !== null && revenueTarget ? (revenueValue / revenueTarget) * 100 : null);
  const displayPercent = rawPercent;
  const revenueTone: "success" | "danger" =
    displayPercent !== null && displayPercent >= 100 ? "success" : "danger";
  const revenuePercentTone = revenueTone === "success" ? "text-v5-success" : "text-v5-danger";

  const latestMetrics = useMemo(
    () => (summary?.groups || []).flatMap((g) => g.metrics).slice(0, 12),
    [summary]
  );

  const dataDate = summary?.range?.month?.label || kpi?.selectedPeriod?.title || "kỳ hiện tại";

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-v5-muted">
        <Loader2 className="h-6 w-6 animate-spin text-v5-accent" />
        <div className="text-sm">Đang tải không gian điều hành…</div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-v5-danger/30 bg-v5-danger-soft p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-v5-danger" />
          <div>
            <h1 className="text-base font-semibold text-v5-danger">Không tải được bảng điều hành</h1>
            <p className="mt-1 text-sm text-v5-danger/80">{error}</p>
            <Button variant="outline" className="mt-3" onClick={() => load()}>
              <RefreshCw className="h-3.5 w-3.5" /> Thử lại
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-v5-ink">Tổng quan điều hành</h1>
            <Badge variant="outline">Dữ liệu thật</Badge>
          </div>
          <p className="mt-1 text-sm text-v5-muted">
            {user?.unitName || "Hải quan cửa khẩu Quốc tế Tà Lùng"} · {dataDate} · dữ liệu trực tiếp
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-v5-line bg-v5-surface p-0.5">
            {(Object.keys(PERIOD_LABEL) as PeriodKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setPeriod(key)}
                className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                  period === key ? "bg-v5-accent text-white" : "text-v5-muted hover:text-v5-ink"
                }`}
              >
                {PERIOD_LABEL[key]}
              </button>
            ))}
          </div>
          <Button variant="outline" size="icon" onClick={() => load(false)} disabled={refreshing} aria-label="Làm mới">
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-v5-line">
        <nav className="flex gap-5">
          {[
            { key: "overview" as const, label: "Tổng quan" },
            { key: "data" as const, label: "Số liệu" },
            { key: "work" as const, label: "Công việc" },
            { key: "report" as const, label: "Báo cáo" },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setTab(item.key);
                if (item.key === "report") {
                  window.location.href = "/v5/giao-ban";
                  return;
                }
                if (item.key === "overview") {
                  window.scrollTo({ top: 0, behavior: "smooth" });
                  return;
                }
                document.getElementById(item.key === "data" ? "v5-data" : "v5-work")?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                });
              }}
              className={cn(
                "border-b-2 pb-2 text-[12px] font-medium transition-colors",
                tab === item.key
                  ? "border-v5-accent text-v5-ink"
                  : "border-transparent text-v5-muted hover:text-v5-ink"
              )}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-2 pb-2">
          <Button variant="outline" size="sm">
            <ListFilter className="h-3.5 w-3.5" /> Bộ lọc
          </Button>
          <Button size="sm" asChild>
            <Link href="/v5/giao-ban/nhap">
              <Plus className="h-3.5 w-3.5" /> Nhập số liệu
            </Link>
          </Button>
        </div>
      </div>

      <div id="v5-data" className="scroll-mt-16">
        <RevenueSummaryTable
          groups={summary?.groups || []}
          comparison={summary?.comparison}
          latestDate={revenueMetric?.latestDate}
        />
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          label="Thu NSNN"
          value={fmtMetricCompact(revenueValue, { displayScale: 1, decimals: 0, unitLabel: "đồng" }, { withUnit: false })}
          note={`${PERIOD_LABEL[period]} · lũy kế`}
          icon={CircleDollarSign}
          tone={revenueTone}
        />
        <KpiTile
          label="Đang thực hiện"
          value={String(kpi?.kpis.inProgress ?? 0)}
          note={`${kpi?.kpis.totalTasks ?? 0} nhiệm vụ trong kỳ`}
          icon={ClipboardList}
          tone="accent"
        />
        <KpiTile
          label="Chờ duyệt / quá hạn"
          value={String((kpi?.kpis.waitingReview ?? 0) + (kpi?.kpis.overdue ?? 0))}
          note={`${kpi?.kpis.waitingReview ?? 0} chờ duyệt · ${kpi?.kpis.overdue ?? 0} quá hạn`}
          icon={CalendarClock}
          tone="warning"
        />
        <KpiTile
          label="Hoàn thành"
          value={kpi?.kpis.completionRate === null || kpi?.kpis.completionRate === undefined ? "—" : `${kpi.kpis.completionRate}%`}
          note={`${kpi?.kpis.completed ?? 0} nhiệm vụ đã xong`}
          icon={BadgeCheck}
          tone="success"
        />
      </div>

      <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-12">
        <Card className="overflow-hidden xl:col-span-7">
          <div className="border-b border-v5-line/70 bg-gradient-to-br from-v5-accent-soft/70 via-v5-surface to-v5-surface px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-v5-accent text-white">
                    <CircleDollarSign className="h-4 w-4" />
                  </span>
                  <div>
                    <h2 className="text-sm font-semibold text-v5-ink">Thu NSNN</h2>
                    <p className="text-[10px] text-v5-muted">{PERIOD_LABEL[period]} · số thuế phát sinh</p>
                  </div>
                </div>
                <div className="mt-4 text-[40px] font-bold leading-none tracking-[-0.04em] tabular-nums text-v5-ink">
                  {fmtMetricCompact(revenueValue, { displayScale: 1, decimals: 0, unitLabel: "đồng" }, { withUnit: false })}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-v5-muted">
                  <span className={`font-semibold ${revenuePercentTone}`}>
                    {displayPercent === null ? "Chưa tính %" : `${displayPercent.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`}
                  </span>
                  <span>so với chỉ tiêu</span>
                  <Badge variant={revenueTone === "success" ? "success" : "danger"}>
                    {revenueTone === "success" ? "Đạt chỉ tiêu" : "Chưa đạt"}
                  </Badge>
                  <span className="text-v5-line">·</span>
                  <span>
                    Chỉ tiêu:{" "}
                    <b className="font-semibold text-v5-ink">
                      {fmtMetricCompact(revenueTarget, { displayScale: 1, decimals: 0, unitLabel: "đồng" }, { withUnit: false })}
                    </b>
                  </span>
                </div>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/v5/giao-ban">
                  Chi tiết <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 divide-x divide-v5-line/70 sm:grid-cols-4">
            {[
              { label: "Kỳ này", value: revenueValue },
              { label: comparisonRow?.prevMonth?.label || "Tháng trước", value: comparisonRow?.prevMonth?.value ?? null },
              { label: comparisonRow?.samePeriodLastYear?.label || "Cùng kỳ", value: comparisonRow?.samePeriodLastYear?.value ?? null },
              { label: "Chỉ tiêu", value: revenueTarget },
            ].map((item) => (
              <div key={item.label} className="px-4 py-3">
                <div className="text-[9px] font-semibold uppercase tracking-wide text-v5-muted">{item.label}</div>
                <div className="mt-1 truncate text-sm font-semibold tabular-nums text-v5-ink">
                  {fmtMetricCompact(item.value, { displayScale: 1, decimals: 0, unitLabel: "đồng" }, { withUnit: false })}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="xl:col-span-5">
          <CardHeader className="flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>Tiến độ điều hành</CardTitle>
              <CardDescription>{kpi?.selectedPeriod?.title || PERIOD_LABEL[period]}</CardDescription>
            </div>
            <Badge variant="success">
              <TrendingUp className="mr-1 h-3 w-3" /> {kpi?.kpis.completionRate ?? 0}%
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="mb-1 flex items-center justify-between text-[11px]">
                <span className="text-v5-muted">Tỷ lệ hoàn thành</span>
                <span className="font-semibold text-v5-ink">{kpi?.kpis.completionRate ?? 0}%</span>
              </div>
              <Progress value={kpi?.kpis.completionRate ?? 0} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                ["Đang làm", kpi?.kpis.inProgress ?? 0, "accent"],
                ["Chờ duyệt", kpi?.kpis.waitingReview ?? 0, "warning"],
                ["Quá hạn", kpi?.kpis.overdue ?? 0, "danger"],
                ["Hoàn thành", kpi?.kpis.completed ?? 0, "success"],
              ].map(([label, value, tone]) => (
                <div key={String(label)} className="rounded-lg border border-v5-line/70 bg-v5-bg/40 p-2.5">
                  <div className="text-[9px] uppercase tracking-wide text-v5-muted">{label}</div>
                  <div className={`mt-1 text-xl font-bold tabular-nums ${tone === "danger" ? "text-v5-danger" : tone === "warning" ? "text-v5-warning" : tone === "success" ? "text-v5-success" : "text-v5-ink"}`}>
                    {value}
                  </div>
                </div>
              ))}
            </div>
            <Button variant="secondary" className="w-full" asChild>
              <Link href="/tasks">
                Mở danh sách công việc <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-end justify-between gap-2">
          <div>
            <CardTitle>Số liệu giao ban</CardTitle>
            <CardDescription>Theo chỉ tiêu · {PERIOD_LABEL[period].toLowerCase()}</CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/v5/giao-ban">
              Mở toàn bộ <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {latestMetrics.map((metric) => (
              <MetricWidget key={metric.id} metric={metric} period={period} />
            ))}
            {latestMetrics.length === 0 && (
              <div className="col-span-full rounded-lg border border-dashed border-v5-line p-6 text-center text-sm text-v5-muted">
                Chưa có chỉ tiêu hiển thị trên dashboard.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div id="v5-work" className="grid scroll-mt-16 grid-cols-1 gap-2.5 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Cảnh báo cần xử lý</CardTitle>
              <CardDescription>{kpi?.hotAlerts?.length || 0} cảnh báo ưu tiên</CardDescription>
            </div>
            <Gauge className="h-4 w-4 text-v5-warning" />
          </CardHeader>
          <CardContent className="space-y-2">
            {(kpi?.hotAlerts || []).slice(0, 5).map((alert) => (
              <Link
                key={alert.id}
                href={`/tasks/${alert.id}`}
                className="flex items-start gap-2 rounded-lg border border-v5-line/70 bg-v5-bg/40 px-3 py-2 transition-colors hover:border-v5-warning/30 hover:bg-v5-warning-soft/40"
              >
                <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${alert.severity === "DANGER" ? "bg-v5-danger" : "bg-v5-gold"}`} />
                <div className="min-w-0">
                  <div className="truncate text-[11px] font-semibold text-v5-ink">
                    {alert.type}: [{alert.code}]
                  </div>
                  <div className="line-clamp-1 text-[10px] text-v5-muted">{alert.title}</div>
                </div>
                <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 text-v5-muted" />
              </Link>
            ))}
            {(kpi?.hotAlerts || []).length === 0 && (
              <div className="flex items-center gap-2 rounded-lg bg-v5-success-soft px-3 py-4 text-sm text-v5-success">
                <CheckCircle2 className="h-4 w-4" /> Không có cảnh báo ưu tiên
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Tải công việc theo bộ phận</CardTitle>
              <CardDescription>Top bộ phận theo số nhiệm vụ</CardDescription>
            </div>
            <ClipboardList className="h-4 w-4 text-v5-accent" />
          </CardHeader>
          <CardContent className="space-y-3">
            {(kpi?.departmentBreakdown || [])
              .slice()
              .sort((a, b) => b.totalTasks - a.totalTasks)
              .slice(0, 6)
              .map((dept) => {
                const max = Math.max(...(kpi?.departmentBreakdown || []).map((d) => d.totalTasks), 1);
                return (
                  <div key={dept.id}>
                    <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
                      <span className="truncate text-v5-ink">{dept.name}</span>
                      <span className="font-semibold tabular-nums text-v5-muted">{dept.totalTasks}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-v5-line/60">
                      <div className="h-full rounded-full bg-v5-accent/70" style={{ width: `${(dept.totalTasks / max) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-v5-line px-4 py-3 text-[10px] text-v5-muted">
        <span className="inline-flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-v5-gold-ink" /> V5 preview · shadcn/ui · không ảnh hưởng production
        </span>
        <Link href="/dashboard" className="font-semibold text-v5-accent hover:underline">
          Quay lại bản hiện tại
        </Link>
      </div>
    </div>
  );
}
