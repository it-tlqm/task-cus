"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  FileBarChart2,
  FileDown,
  Loader2,
  Plus,
  RefreshCw,
  Settings2,
  Target,
  UserPlus,
} from "lucide-react";
import { getIsoWeekFromDate, getVnDateParts } from "@/lib/period-helper";
import { usePermissions } from "@/hooks/usePermissions";
import { Badge } from "@/components/v5/ui/badge";
import { Button } from "@/components/v5/ui/button";
import { Card } from "@/components/v5/ui/card";
import { RevenueSummaryTable } from "@/components/v5/RevenueSummaryTable";
import { MetricsSummaryTable } from "@/components/v5/MetricsSummaryTable";
import { RevenueCharts } from "@/components/v5/RevenueCharts";
import { GiaoBanNarrativePanel } from "@/components/v5/GiaoBanNarrativePanel";

type PeriodKey = "week" | "month" | "quarter" | "year";

const PERIODS: Array<{ key: PeriodKey; label: string }> = [
  { key: "week", label: "Tuần" },
  { key: "month", label: "Tháng" },
  { key: "quarter", label: "Quý" },
  { key: "year", label: "Năm" },
];

interface Summary {
  groups: Array<{
    id: string;
    name: string;
    metrics: Array<{
      id: string;
      code: string;
      name: string;
      unitLabel?: string;
      displayScale?: number;
      decimals?: number;
      cols: Record<string, number | null>;
      classCols?: Array<{ classificationId: string; label: string; cols: Record<string, number | null> }>;
      latestDate?: string | null;
      status?: { monthState?: string };
    }>;
  }>;
  comparison?: { rows?: any[] };
  range?: {
    week?: { label?: string };
    month?: { label?: string };
    quarter?: { label?: string };
    year?: { label?: string };
  };
}

export default function V5GiaoBanPage() {
  const { user } = usePermissions();
  const now = useMemo(() => new Date(), []);
  const vn = getVnDateParts(now);
  const iso = getIsoWeekFromDate(now);
  const quarter = Math.floor(vn.month / 3) + 1;
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [tab, setTab] = useState<"tonghop" | "chitiet" | "sohieu" | "nhanxet">("tonghop");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(showSpinner = true) {
    if (showSpinner) setLoading(true);
    setRefreshing(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        year: String(vn.year),
        week: String(iso.weekNumber),
        month: String(vn.month),
        quarter: String(quarter),
        comparison: "1",
      });
      const res = await fetch(`/api/metrics/summary?${params.toString()}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || "Không tải được số liệu giao ban");
      setSummary(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được số liệu giao ban");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const metrics = useMemo(
    () => (summary?.groups || []).flatMap((group) => group.metrics),
    [summary]
  );
  const taxMetric = metrics.find((metric) => metric.code === "THU_NSNN");
  const periodLabel =
    period === "week"
      ? summary?.range?.week?.label || `Tuần ${iso.weekNumber}/${vn.year}`
      : period === "quarter"
        ? summary?.range?.quarter?.label || `Quý ${quarter}/${vn.year}`
        : period === "year"
          ? summary?.range?.year?.label || `Năm ${vn.year}`
          : summary?.range?.month?.label || `Tháng ${vn.month}/${vn.year}`;
  const periodKey =
    period === "week"
      ? `${iso.year}-W${String(iso.weekNumber).padStart(2, "0")}`
      : period === "month"
        ? `${vn.year}-${String(vn.month).padStart(2, "0")}`
        : period === "quarter"
          ? `${vn.year}-Q${quarter}`
          : String(vn.year);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-v5-muted">
        <Loader2 className="h-6 w-6 animate-spin text-v5-accent" />
        <div className="text-sm">Đang tải số liệu giao ban…</div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-v5-danger/30 bg-v5-danger-soft p-5">
        <div className="flex items-start gap-3">
          <FileBarChart2 className="mt-0.5 h-5 w-5 text-v5-danger" />
          <div>
            <h1 className="text-base font-semibold text-v5-danger">Không tải được số liệu giao ban</h1>
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
            <h1 className="text-2xl font-semibold tracking-tight text-v5-ink">Số liệu giao ban</h1>
            <Badge variant="outline">Dữ liệu thật</Badge>
          </div>
          <p className="mt-1 text-sm text-v5-muted">
            {user?.unitName || "Hải quan cửa khẩu Quốc tế Tà Lùng"} · {periodLabel} · dữ liệu trực tiếp
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/giao-ban/cau-hinh?tab=TARGET">
              <Target className="h-3.5 w-3.5" /> Chỉ tiêu giao
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/giao-ban/cau-hinh?tab=ASSIGN">
              <UserPlus className="h-3.5 w-3.5" /> Phân công nhập
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/giao-ban/cau-hinh">
              <Settings2 className="h-3.5 w-3.5" /> Cấu hình
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/giao-ban/bao-cao">
              <FileDown className="h-3.5 w-3.5" /> Báo cáo
            </Link>
          </Button>
          <Button variant="outline" size="icon" onClick={() => load(false)} disabled={refreshing} aria-label="Làm mới">
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" asChild>
            <Link href="/v5/giao-ban/nhap">
              <Plus className="h-3.5 w-3.5" /> Nhập số liệu
            </Link>
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-v5-line">
        <nav className="flex gap-5">
          {[
            { key: "tonghop" as const, label: "Tổng hợp" },
            { key: "chitiet" as const, label: "Theo chỉ tiêu" },
            { key: "sohieu" as const, label: "So sánh" },
            { key: "nhanxet" as const, label: "Nhận xét" },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`border-b-2 pb-2 text-[12px] font-medium transition-colors ${
                tab === item.key
                  ? "border-v5-accent text-v5-ink"
                  : "border-transparent text-v5-muted hover:text-v5-ink"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-2 pb-2">
          <div className="flex rounded-md border border-v5-line bg-v5-surface p-0.5">
            {PERIODS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setPeriod(item.key)}
                className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  period === item.key ? "bg-v5-accent text-white" : "text-v5-muted hover:text-v5-ink"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === "tonghop" && (
        <>
          <RevenueSummaryTable
            groups={summary?.groups || []}
            comparison={summary?.comparison}
            latestDate={taxMetric?.latestDate}
          />
          <Card className="p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[11px] text-v5-muted">
                Bảng tổng hợp đặt trên cùng. Chuyển tab <b className="text-v5-ink">Theo chỉ tiêu</b> để xem toàn bộ chỉ tiêu, hoặc{" "}
                <b className="text-v5-ink">So sánh</b> để xem biểu đồ.
              </div>
              <Button variant="ghost" size="sm" onClick={() => setTab("sohieu")}>
                Xem biểu đồ <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </Card>
        </>
      )}

      {tab === "chitiet" && (
        <section className="space-y-2">
          <div>
            <h2 className="text-sm font-semibold text-v5-ink">Bảng số liệu theo chỉ tiêu</h2>
            <p className="text-[11px] text-v5-muted">Ngày · Tuần · Tháng · Quý · Năm · trạng thái nhập liệu</p>
          </div>
          <MetricsSummaryTable groups={summary?.groups || []} />
        </section>
      )}

      {tab === "sohieu" && (
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-v5-ink">Biểu đồ so sánh</h2>
            <p className="text-[11px] text-v5-muted">Số thu theo kỳ và theo phân loại · đơn vị tỷ đồng</p>
          </div>
          <RevenueCharts metrics={metrics} comparison={summary?.comparison} />
          <RevenueSummaryTable
            groups={summary?.groups || []}
            comparison={summary?.comparison}
            latestDate={taxMetric?.latestDate}
          />
        </section>
      )}

      {tab === "nhanxet" && (
        <GiaoBanNarrativePanel
          periodType={period.toUpperCase() as "WEEK" | "MONTH" | "QUARTER" | "YEAR"}
          periodKey={periodKey}
          periodLabel={periodLabel}
        />
      )}

      <div className="flex justify-end">
        <Link href="/v5" className="text-[11px] font-semibold text-v5-accent hover:underline">
          Về Bảng điều hành
        </Link>
      </div>
    </div>
  );
}
