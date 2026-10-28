"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Loader2,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "@/components/ui/Toast";
import FormattedNumberInput from "@/components/ui/FormattedNumberInput";
import { baseToInput, fmtDate } from "@/lib/metric-format";
import { getVnDateParts } from "@/lib/period-helper";
import {
  ENTRY_PERIODS,
  ENTRY_PERIOD_LABELS,
  shiftPeriodAnchor,
  type EntryPeriod,
} from "@/lib/metric-entry-period";
import { Badge } from "@/components/v5/ui/badge";
import { Button } from "@/components/v5/ui/button";
import { Card } from "@/components/v5/ui/card";

interface EntryValue {
  classificationId: string;
  label: string;
  entryId: string | null;
  valueBase: number | null;
  enteredValueBase?: number | null;
  openingBalanceBase?: number | null;
  inputMode?: "INCREMENTAL" | "CUMULATIVE";
  status: string;
  note: string | null;
  enteredByName: string | null;
  canEdit: boolean;
  canSubmit: boolean;
  canConfirm: boolean;
  canFix: boolean;
}

interface EntryMetric {
  id: string;
  code: string;
  name: string;
  unitLabel: string;
  displayScale: number;
  decimals: number;
  valueKind: "FLOW" | "BALANCE";
  requireConfirm: boolean;
  note: string | null;
  canEnter: boolean;
  canConfirm: boolean;
  backdateDays: number;
  entryPeriod: EntryPeriod;
  inputMode?: "INCREMENTAL" | "CUMULATIVE";
  values: EntryValue[];
}

interface EntryGroup {
  id: string;
  code: string;
  name: string;
  metrics: EntryMetric[];
}

interface EntryData {
  date: string;
  selectedDate?: string;
  today: string;
  isToday: boolean;
  entryPeriod: EntryPeriod | null;
  period: { type: EntryPeriod; start: string; end: string; key: string; label: string } | null;
  anyEditable: boolean;
  groups: EntryGroup[];
}

interface HelperState {
  key: string;
  label: string;
  metricName: string;
  periodType: EntryPeriod;
  periodLabel: string;
  periodEnd: string;
}

function todayVnStr(): string {
  const p = getVnDateParts(new Date());
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function statusLabel(status: string) {
  switch (status) {
    case "CONFIRMED":
      return "Đã xác nhận";
    case "SUBMITTED":
      return "Chờ kiểm tra";
    case "RECORDED":
      return "Đã nhập";
    case "DRAFT":
      return "Nháp";
    case "NEEDS_FIX":
      return "Cần sửa";
    default:
      return "Chưa nhập";
  }
}

function statusVariant(status: string): "success" | "warning" | "danger" | "default" | "accent" {
  if (status === "CONFIRMED") return "success";
  if (status === "SUBMITTED") return "warning";
  if (status === "RECORDED" || status === "DRAFT") return "accent";
  if (status === "NEEDS_FIX") return "danger";
  return "default";
}

function parseRawNumber(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;
  const normalized = text.replace(/\./g, "").replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function rawFromNumber(value: number): string {
  return String(Number(value.toFixed(6))).replace(".", ",");
}

export default function V5EntryPage() {
  const [date, setDate] = useState(todayVnStr());
  const [entryPeriod, setEntryPeriod] = useState<EntryPeriod>("DAY");
  const [data, setData] = useState<EntryData | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [initial, setInitial] = useState<Record<string, string>>({});
  const [modes, setModes] = useState<Record<string, "INCREMENTAL" | "CUMULATIVE">>({});
  const [initialModes, setInitialModes] = useState<Record<string, "INCREMENTAL" | "CUMULATIVE">>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [onlyTodo, setOnlyTodo] = useState(false);
  const [search, setSearch] = useState("");
  const [helper, setHelper] = useState<HelperState | null>(null);
  const [helperLoading, setHelperLoading] = useState(false);
  const [helperError, setHelperError] = useState<string | null>(null);
  const [helperPrevious, setHelperPrevious] = useState("");
  const [helperPreviousDate, setHelperPreviousDate] = useState("");
  const [helperToday, setHelperToday] = useState("");

  const load = useCallback(async (period: EntryPeriod, day: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/metrics/entries?date=${day}&entryPeriod=${period}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || "Không tải được số liệu");
      setData(json);
      const next: Record<string, string> = {};
      const nextModes: Record<string, "INCREMENTAL" | "CUMULATIVE"> = {};
      for (const group of json.groups as EntryGroup[]) {
        for (const metric of group.metrics) {
          for (const value of metric.values) {
            const key = `${metric.id}|${value.classificationId}`;
            next[key] = baseToInput(value.enteredValueBase ?? value.valueBase, metric);
            nextModes[key] =
              value.inputMode ||
              (metric.inputMode === "CUMULATIVE" ? "CUMULATIVE" : "INCREMENTAL");
          }
        }
      }
      setValues(next);
      setInitial(next);
      setModes(nextModes);
      setInitialModes(nextModes);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không tải được số liệu");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(entryPeriod, date);
  }, [entryPeriod, date, load]);

  const allValues = useMemo(
    () => (data?.groups || []).flatMap((group) => group.metrics.flatMap((metric) => metric.values.map((value) => ({ metric, value })))),
    [data]
  );
  const total = allValues.length;
  const filled = allValues.filter(({ metric, value }) => {
    const raw = values[`${metric.id}|${value.classificationId}`] || "";
    return raw.trim() !== "";
  }).length;
  const progress = total ? Math.round((filled / total) * 100) : 0;

  const changedCount = useMemo(() => {
    let count = 0;
    for (const key of Object.keys(values)) {
      const current = (values[key] || "").trim();
      if (current === "") continue;
      const before = (initial[key] || "").trim();
      const modeChanged = modes[key] !== initialModes[key];
      if (current !== before || modeChanged) count += 1;
    }
    return count;
  }, [values, initial, modes, initialModes]);

  const guardUnsaved = useCallback(() => {
    if (changedCount === 0) return true;
    return window.confirm(
      `Bạn có ${changedCount} thay đổi chưa lưu. Chuyển kỳ sẽ bỏ các thay đổi này. Tiếp tục?`
    );
  }, [changedCount]);

  useEffect(() => {
    if (changedCount === 0) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [changedCount]);

  const missingMetrics = useMemo(
    () =>
      (data?.groups || [])
        .flatMap((group) => group.metrics)
        .filter((metric) =>
          metric.values.some((value) => {
            const raw = values[`${metric.id}|${value.classificationId}`] || "";
            return value.canEdit && raw.trim() === "";
          })
        ).length,
    [data, values]
  );

  const save = async () => {
    if (!data) return;
    const entries: Array<{
      metricId: string;
      classificationId: string;
      entryDate: string;
      value: string;
      inputMode: "INCREMENTAL" | "CUMULATIVE";
    }> = [];
    for (const group of data.groups) {
      for (const metric of group.metrics) {
        for (const value of metric.values) {
          const key = `${metric.id}|${value.classificationId}`;
          const current = (values[key] || "").trim();
          if (current === "") continue;
          const before = (initial[key] || "").trim();
          const mode = modes[key] || "INCREMENTAL";
          if (current === before && mode === initialModes[key]) continue;
          entries.push({
            metricId: metric.id,
            classificationId: value.classificationId,
            entryDate: data.date,
            value: current,
            inputMode: mode,
          });
        }
      }
    }
    if (entries.length === 0) {
      toast.error("Chưa có ô nào thay đổi");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/metrics/entries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entries, entryPeriod, periodDate: date }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        throw new Error(json?.errors?.[0]?.message || json.error || "Không lưu được số liệu");
      }
      toast.success(`Đã lưu ${json.saved} ô · ${data.period?.label || fmtDate(data.date)}`);
      await load(entryPeriod, date);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không lưu được số liệu");
    } finally {
      setSaving(false);
    }
  };

  const openHelper = async (metric: EntryMetric, value: EntryValue) => {
    if (!data) return;
    const key = `${metric.id}|${value.classificationId}`;
    setHelper({
      key,
      label: value.label || metric.name,
      metricName: metric.name,
      periodType: entryPeriod,
      periodLabel: data.period?.label || fmtDate(data.date),
      periodEnd: data.date,
    });
    setHelperPrevious("");
    setHelperPreviousDate("");
    setHelperToday("");
    setHelperError(null);
    setHelperLoading(true);
    try {
      const params = new URLSearchParams({
        metricId: metric.id,
        classificationId: value.classificationId,
        asOf: data.date,
      });
      if (entryPeriod !== "DAY") params.set("entryPeriod", entryPeriod);
      const res = await fetch(`/api/metrics/entries/cumulative?${params.toString()}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Không lấy được lũy kế kỳ trước");
      setHelperPrevious(String(json.cumulativePrevious ?? "0"));
      setHelperPreviousDate(String(json.previousDate || ""));
    } catch (error) {
      setHelperError(error instanceof Error ? error.message : "Không lấy được lũy kế kỳ trước");
    } finally {
      setHelperLoading(false);
    }
  };

  const helperDelta = useMemo(() => {
    const todayValue = parseRawNumber(helperToday);
    const previousValue = parseRawNumber(helperPrevious);
    if (todayValue === null || previousValue === null) return null;
    return todayValue - previousValue;
  }, [helperToday, helperPrevious]);

  const applyHelper = () => {
    if (!helper || helperDelta === null) {
      toast.error("Nhập đủ lũy kế kỳ này và kỳ trước");
      return;
    }
    setValues((prev) => ({ ...prev, [helper.key]: rawFromNumber(helperDelta) }));
    setModes((prev) => ({ ...prev, [helper.key]: "INCREMENTAL" }));
    setHelper(null);
    toast.success("Đã điền số phát sinh. Kiểm tra lại rồi bấm Lưu số liệu.");
  };

  const groups = useMemo(() => {
    if (!data) return [];
    const query = search.trim().toLowerCase();
    return data.groups
      .map((group) => ({
        ...group,
        metrics: group.metrics.filter((metric) => {
          if (onlyTodo) {
            const hasMissing = metric.values.some((value) => {
              const raw = values[`${metric.id}|${value.classificationId}`] || "";
              return value.canEdit && raw.trim() === "";
            });
            if (!hasMissing) return false;
          }
          if (!query) return true;
          return (
            metric.name.toLowerCase().includes(query) ||
            metric.code.toLowerCase().includes(query) ||
            metric.values.some((value) => (value.label || "").toLowerCase().includes(query))
          );
        }),
      }))
      .filter((group) => group.metrics.length > 0);
  }, [data, onlyTodo, values, search]);

  return (
    <div className="space-y-3 pb-24 lg:pb-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/v5/giao-ban"
              onClick={(event) => {
                if (!guardUnsaved()) event.preventDefault();
              }}
              className="inline-flex items-center gap-1 text-[11px] text-v5-muted hover:text-v5-ink"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Số liệu giao ban
            </Link>
          </div>
          <div className="mt-1">
            <h1 className="text-2xl font-semibold tracking-tight text-v5-ink">Nhập số liệu</h1>
          </div>
          <p className="mt-1 text-sm text-v5-muted">
            Chỉ hiện chỉ tiêu bạn được phân công. Số theo kỳ là tổng phát sinh trong kỳ, lưu tại ngày cuối kỳ.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              if (guardUnsaved()) load(entryPeriod, date);
            }}
            aria-label="Làm mới"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link
              href="/huong-dan"
              onClick={(event) => {
                if (!guardUnsaved()) event.preventDefault();
              }}
            >
              <CircleHelp className="h-3.5 w-3.5" /> Hướng dẫn
            </Link>
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-v5-line pb-2">
        <div className="flex rounded-md border border-v5-line bg-v5-surface p-0.5">
          {ENTRY_PERIODS.map((period) => (
            <button
              key={period}
              type="button"
              onClick={() => {
                if (guardUnsaved()) setEntryPeriod(period);
              }}
              className={`rounded px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                entryPeriod === period ? "bg-v5-accent text-white" : "text-v5-muted hover:text-v5-ink"
              }`}
            >
              {ENTRY_PERIOD_LABELS[period]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-md border border-v5-line bg-v5-surface px-1">
            <button
              type="button"
              onClick={() => {
                const next = shiftPeriodAnchor(entryPeriod, date, -1);
                if (guardUnsaved()) setDate(next);
              }}
              className="p-1.5 text-v5-muted hover:text-v5-ink"
              aria-label="Kỳ trước"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <input
              type="date"
              value={date}
              max={data?.today || todayVnStr()}
              onChange={(event) => {
                if (guardUnsaved()) setDate(event.target.value);
                else event.currentTarget.value = date;
              }}
              className="h-8 border-0 bg-transparent px-1 text-[11px] text-v5-ink focus:ring-0"
            />
            <button
              type="button"
              onClick={() => {
                const next = shiftPeriodAnchor(entryPeriod, date, 1);
                if (guardUnsaved()) setDate(next);
              }}
              disabled={shiftPeriodAnchor(entryPeriod, date, 1) > (data?.today || todayVnStr())}
              className="p-1.5 text-v5-muted hover:text-v5-ink disabled:opacity-30"
              aria-label="Kỳ sau"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          {data?.period && (
            <Badge variant="accent">
              {data.period.label} · lưu tại {fmtDate(data.period.end)}
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_264px]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-v5-line bg-v5-surface px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setOnlyTodo(false)}
                aria-pressed={!onlyTodo}
                title="Hiện cả chỉ tiêu đã nhập đủ"
                className={`rounded px-2 py-1 text-[11px] font-semibold ${!onlyTodo ? "bg-v5-accent-soft text-v5-accent" : "text-v5-muted"}`}
              >
                Tất cả
              </button>
              <button
                type="button"
                onClick={() => setOnlyTodo(true)}
                aria-pressed={onlyTodo}
                title="Ẩn chỉ tiêu đã nhập đủ"
                className={`rounded px-2 py-1 text-[11px] font-semibold ${onlyTodo ? "bg-v5-accent-soft text-v5-accent" : "text-v5-muted"}`}
              >
                Cần nhập ({missingMetrics})
              </button>
              {onlyTodo && (
                <span className="text-[10px] text-v5-muted">Đang ẩn chỉ tiêu đã nhập đủ</span>
              )}
              {changedCount > 0 && <Badge variant="warning">{changedCount} chưa lưu</Badge>}
            </div>
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <div className="relative min-w-0 flex-1 sm:w-56">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-v5-muted" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Tìm chỉ tiêu..."
                  aria-label="Tìm chỉ tiêu"
                  className="h-8 w-full rounded-md border border-v5-line bg-v5-surface pl-7 pr-2 text-[11px] text-v5-ink outline-none focus:border-v5-accent"
                />
              </div>
              <span className="shrink-0 text-[11px] text-v5-muted">
                Đã nhập {filled}/{total} ô
              </span>
            </div>
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-v5-line bg-v5-surface py-16 text-sm text-v5-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Đang tải số liệu…
            </div>
          )}

          {!loading && data && groups.length === 0 && (
            <div className="rounded-xl border border-dashed border-v5-line bg-v5-surface p-10 text-center">
              <CheckCircle2 className="mx-auto h-7 w-7 text-v5-success" />
              <div className="mt-2 text-sm font-semibold text-v5-ink">
                {search.trim()
                  ? "Không tìm thấy chỉ tiêu phù hợp"
                  : onlyTodo
                    ? "Đã nhập đủ các chỉ tiêu được giao"
                    : "Chưa có chỉ tiêu phù hợp"}
              </div>
              <div className="mt-1 text-[11px] text-v5-muted">
                {search.trim()
                  ? "Thử từ khóa khác hoặc chuyển sang tab Tất cả."
                  : onlyTodo
                    ? "Bạn có thể chuyển sang tab Tất cả để kiểm tra lại."
                    : "Kiểm tra phân công hoặc cấu hình kỳ nhập."}
              </div>
            </div>
          )}

          {!loading &&
            groups.map((group) => (
              <section key={group.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-[11px] font-bold uppercase tracking-wide text-v5-muted">{group.name}</h2>
                  <span className="text-[10px] text-v5-muted">{group.metrics.length} chỉ tiêu</span>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {group.metrics.map((metric) => (
                    <Card key={metric.id} className="overflow-hidden">
                      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-v5-line/70 px-4 py-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold text-v5-ink">{metric.name}</span>
                            {metric.requireConfirm && <Badge variant="warning">Cần kiểm tra</Badge>}
                            {metric.valueKind === "BALANCE" && <Badge variant="accent">Số dư</Badge>}
                            {metric.valueKind === "FLOW" && (
                              <Badge variant="outline">Phát sinh / Lũy kế</Badge>
                            )}
                          </div>
                          <div className="mt-0.5 text-[10px] text-v5-muted">
                            {metric.unitLabel}
                            {metric.note ? ` · ${metric.note}` : ""}
                            {metric.valueKind === "FLOW"
                              ? " · Có thể nhập số phát sinh hoặc tổng lũy kế; hệ thống tự quy đổi."
                              : ""}
                          </div>
                        </div>
                        {metric.entryPeriod !== "DAY" && (
                          <Badge variant="outline">Kỳ {ENTRY_PERIOD_LABELS[metric.entryPeriod].toLowerCase()}</Badge>
                        )}
                      </div>
                      <div className="space-y-2 px-4 py-3">
                        {metric.values.map((value) => {
                          const key = `${metric.id}|${value.classificationId}`;
                          const status = value.status || "";
                          const rowMode = modes[key] || "INCREMENTAL";
                          const canChooseMode = metric.valueKind === "FLOW";
                          const storageMode =
                            metric.inputMode === "CUMULATIVE" ? "CUMULATIVE" : "INCREMENTAL";
                          const openingDisplay =
                            value.openingBalanceBase != null
                              ? Number(value.openingBalanceBase / (metric.displayScale || 1)).toLocaleString(
                                  "vi-VN",
                                  { maximumFractionDigits: metric.decimals ?? 2 }
                                )
                              : "0";
                          const canUseHelper = value.canEdit && metric.valueKind !== "BALANCE";
                          return (
                            <div key={key} className="grid gap-2 sm:grid-cols-[minmax(110px,1fr)_180px_auto] sm:items-center">
                              <div className="min-w-0 text-[12px] text-v5-muted">
                                <div className="flex flex-wrap items-center gap-1">
                                  <span className="truncate">{value.label || "—"}</span>
                                  <Badge variant={statusVariant(status)}>{statusLabel(status)}</Badge>
                                </div>
                                {canChooseMode && value.canEdit && (
                                  <div
                                    role="group"
                                    aria-label="Kiểu nhập số liệu"
                                    data-tour="entry-modes"
                                    className="mt-1 inline-flex rounded-md border border-v5-line bg-v5-bg p-0.5"
                                  >
                                    <button
                                      type="button"
                                      aria-pressed={rowMode === "INCREMENTAL"}
                                      onClick={() => {
                                        if (rowMode === "INCREMENTAL") return;
                                        setModes((prev) => ({ ...prev, [key]: "INCREMENTAL" }));
                                        setValues((prev) => ({
                                          ...prev,
                                          [key]: baseToInput(
                                            storageMode === "CUMULATIVE"
                                              ? value.enteredValueBase ?? value.valueBase
                                              : value.valueBase,
                                            metric
                                          ),
                                        }));
                                      }}
                                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
                                        rowMode === "INCREMENTAL"
                                          ? "bg-v5-accent text-white shadow-sm"
                                          : "text-v5-muted hover:text-v5-ink"
                                      }`}
                                    >
                                      Phát sinh
                                    </button>
                                    <button
                                      type="button"
                                      aria-pressed={rowMode === "CUMULATIVE"}
                                      onClick={() => {
                                        if (rowMode === "CUMULATIVE") return;
                                        setModes((prev) => ({ ...prev, [key]: "CUMULATIVE" }));
                                        setValues((prev) => ({
                                          ...prev,
                                          [key]: baseToInput(
                                            storageMode === "CUMULATIVE"
                                              ? value.valueBase
                                              : value.valueBase != null
                                                ? (value.openingBalanceBase ?? 0) + value.valueBase
                                                : null,
                                            metric
                                          ),
                                        }));
                                      }}
                                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
                                        rowMode === "CUMULATIVE"
                                          ? "bg-v5-gold text-v5-ink shadow-sm"
                                          : "text-v5-muted hover:text-v5-ink"
                                      }`}
                                    >
                                      Lũy kế
                                    </button>
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0">
                                <FormattedNumberInput
                                  value={values[key] ?? ""}
                                  onValueChange={(raw) => setValues((prev) => ({ ...prev, [key]: raw }))}
                                  disabled={!value.canEdit || saving}
                                  placeholder={
                                    value.canEdit
                                      ? rowMode === "CUMULATIVE"
                                        ? "Nhập tổng lũy kế…"
                                        : canChooseMode
                                          ? "Nhập số phát sinh…"
                                          : "Nhập số…"
                                      : "—"
                                  }
                                  className="h-9 w-full border border-v5-line bg-v5-surface px-2.5 text-right text-[12px] tabular-nums text-v5-ink outline-none focus:border-v5-accent focus:ring-2 focus:ring-v5-accent/10 disabled:bg-v5-bg disabled:text-v5-muted"
                                />
                                {rowMode === "CUMULATIVE" && canChooseMode && (
                                  <div className="mt-0.5 text-right text-[10px] text-v5-muted">
                                    <div title={`Đơn vị: ${metric.unitLabel}`}>
                                      Lũy kế trước kỳ:{" "}
                                      <span className="font-semibold tabular-nums text-v5-ink">
                                        {openingDisplay}
                                      </span>
                                    </div>
                                    {(value.openingBalanceBase == null || value.openingBalanceBase === 0) && (
                                      <div className="text-[9px] text-v5-gold-ink">
                                        Chưa có lũy kế trước kỳ — kiểm tra mốc YEAR/OPENING.
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center justify-end gap-1">
                                {canUseHelper && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openHelper(metric, value)}
                                    title="Tính số phát sinh từ lũy kế"
                                  >
                                    <Sparkles className="h-3.5 w-3.5" /> Tính
                                  </Button>
                                )}
                                {value.enteredByName && (
                                  <span className="hidden text-[9px] text-v5-muted lg:inline">{value.enteredByName}</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            ))}
        </div>

        <aside className="space-y-3">
          <Card className="sticky top-[64px] p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-v5-ink">Tiến độ nhập</div>
              <span className="text-xs font-semibold text-v5-accent">{progress}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-v5-line/60">
              <div className="h-full rounded-full bg-v5-accent transition-all" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
              <div className="rounded-md bg-v5-bg p-2">
                <div className="text-v5-muted">Đã nhập</div>
                <div className="mt-0.5 text-base font-bold text-v5-ink">{filled}</div>
              </div>
              <div className="rounded-md bg-v5-bg p-2">
                <div className="text-v5-muted">Còn thiếu</div>
                <div className="mt-0.5 text-base font-bold text-v5-gold-ink">{Math.max(0, total - filled)}</div>
              </div>
            </div>
            <div className="mt-3 rounded-md border border-v5-gold/50 bg-v5-gold-soft p-2 text-[10px] text-v5-gold-ink">
              <div className="flex items-center gap-1 font-semibold">
                <CalendarDays className="h-3 w-3" /> {data?.period?.label || "Kỳ hiện tại"}
              </div>
              <div className="mt-1">Số liệu lưu tại ngày cuối kỳ. Có thể nhập trước khi kỳ kết thúc.</div>
            </div>
            <Button className="mt-3 w-full" onClick={save} disabled={saving || changedCount === 0}>
              <Save className="h-3.5 w-3.5" /> {saving ? "Đang lưu…" : `Lưu ${changedCount || ""} thay đổi`}
            </Button>
          </Card>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-v5-line bg-v5-surface/95 p-2 shadow-[0_-4px_16px_rgba(16,24,40,0.08)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-[1760px] items-center gap-2">
          <div className="min-w-0 flex-1 text-[10px] text-v5-muted">
            {changedCount > 0 ? `${changedCount} thay đổi chưa lưu` : "Chưa có thay đổi"}
          </div>
          <Button size="sm" onClick={save} disabled={saving || changedCount === 0}>
            <Save className="h-3.5 w-3.5" /> {saving ? "Đang lưu…" : "Lưu thay đổi"}
          </Button>
        </div>
      </div>

      {helper && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/35 backdrop-blur-[1px]"
            onClick={() => setHelper(null)}
            aria-label="Đóng"
          />
          <Card className="relative w-full max-w-lg p-0">
            <div className="flex items-start justify-between gap-3 border-b border-v5-line px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-v5-ink">Tính từ lũy kế</div>
                <div className="mt-0.5 text-[11px] text-v5-muted">
                  {helper.metricName}
                  {helper.label && helper.label !== helper.metricName ? ` · ${helper.label}` : ""} · {helper.periodLabel}
                </div>
              </div>
              <button type="button" onClick={() => setHelper(null)} className="rounded p-1 text-v5-muted hover:bg-v5-bg">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-v5-muted">
                {helper.periodType === "DAY" ? "Lũy kế hôm nay" : `Lũy kế đến cuối kỳ (${fmtDate(helper.periodEnd)})`}
                <FormattedNumberInput
                  value={helperToday}
                  onValueChange={setHelperToday}
                  className="h-9 w-full rounded-md border border-v5-line bg-v5-surface px-2.5 text-right text-[12px] tabular-nums outline-none focus:border-v5-accent"
                  placeholder="Nhập lũy kế…"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-v5-muted">
                {helper.periodType === "DAY" ? `Lũy kế hôm trước${helperPreviousDate ? ` (${fmtDate(helperPreviousDate)})` : ""}` : `Lũy kế cuối kỳ trước${helperPreviousDate ? ` (${fmtDate(helperPreviousDate)})` : ""}`}
                <FormattedNumberInput
                  value={helperPrevious}
                  onValueChange={setHelperPrevious}
                  readOnly={!helperError}
                  disabled={helperLoading}
                  className="h-9 w-full rounded-md border border-v5-line bg-v5-bg px-2.5 text-right text-[12px] tabular-nums outline-none"
                  placeholder={helperLoading ? "Đang tính…" : "Chưa có dữ liệu"}
                />
              </label>
            </div>
            {helperError && <div className="mx-4 rounded-md bg-v5-danger-soft p-2 text-[10px] text-v5-danger">{helperError}</div>}
            <div className="mx-4 rounded-md border border-v5-line bg-v5-bg p-3">
              <div className="text-[10px] text-v5-muted">
                {helper.periodType === "DAY" ? "Số phát sinh ngày" : "Số phát sinh trong kỳ"} = lũy kế kỳ này − lũy kế kỳ trước
              </div>
              <div className={`mt-1 text-xl font-bold tabular-nums ${helperDelta !== null && helperDelta < 0 ? "text-v5-danger" : "text-v5-ink"}`}>
                {helperDelta === null ? "—" : helperDelta.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 pt-3">
              <Button variant="outline" onClick={() => setHelper(null)}>Hủy</Button>
              <Button onClick={applyHelper} disabled={helperDelta === null}>Điền số phát sinh</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
