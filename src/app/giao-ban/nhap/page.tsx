"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/Toast";
import BackButton from "@/components/ui/BackButton";
import FormattedNumberInput from "@/components/ui/FormattedNumberInput";
import { baseToInput, fmtDate, STATUS_LABELS, STATUS_STYLES } from "@/lib/metric-format";
import { MetricCumulativeAdjustmentPanel } from "@/components/metrics/MetricCumulativeAdjustmentPanel";
import { getVnDateParts } from "@/lib/period-helper";
import {
  ENTRY_PERIODS,
  ENTRY_PERIOD_HINTS,
  ENTRY_PERIOD_LABELS,
  shiftPeriodAnchor,
  type EntryPeriod,
} from "@/lib/metric-entry-period";

interface EntryValue {
  classificationId: string;
  label: string;
  entryId: string | null;
  valueBase: number | null;
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
interface Revision {
  id: string;
  action: string;
  oldValue: number | null;
  newValue: number | null;
  oldStatus: string | null;
  newStatus: string | null;
  reason: string | null;
  editedByName: string | null;
  editedAt: string;
}

const ACTION_LABELS: Record<string, string> = {
  CREATE: "Tạo mới",
  UPDATE: "Sửa giá trị",
  DELETE: "Xóa",
  SUBMIT: "Gửi kiểm tra",
  CONFIRM: "Xác nhận",
  NEEDS_FIX: "Yêu cầu sửa",
};

function todayVnStr(): string {
  const p = getVnDateParts(new Date());
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
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

export default function NhapSoLieuPage() {
  const [date, setDate] = useState<string>(todayVnStr());
  const [entryPeriod, setEntryPeriod] = useState<EntryPeriod>("DAY");
  const [focusMetric, setFocusMetric] = useState("");
  const [data, setData] = useState<EntryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState<Record<string, string>>({});
  const [initial, setInitial] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [saveWarnings, setSaveWarnings] = useState<{ metricCode: string; metricName: string; message: string }[] | null>(null);
  const [historyFor, setHistoryFor] = useState<{ entryId: string; metricName: string } | null>(null);
  const [history, setHistory] = useState<Revision[] | null>(null);
  const [cumulativeHelper, setCumulativeHelper] = useState<{
    key: string;
    label: string;
    current: string;
    entryPeriod: EntryPeriod;
    periodLabel: string;
    periodEnd: string;
  } | null>(null);
  const [cumulativeToday, setCumulativeToday] = useState("");
  const [cumulativePrevious, setCumulativePrevious] = useState("");
  const [cumulativeLoading, setCumulativeLoading] = useState(false);
  const [cumulativeError, setCumulativeError] = useState<string | null>(null);
  const [cumulativePreviousDate, setCumulativePreviousDate] = useState("");
  const [cumulativeEntryCount, setCumulativeEntryCount] = useState<number | null>(null);

  const load = useCallback((d: string, period: EntryPeriod) => {
    setLoading(true);
    fetch(`/api/metrics/entries?date=${d}&entryPeriod=${period}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.success) {
          setData(json);
          const vals: Record<string, string> = {};
          for (const g of json.groups as EntryGroup[]) {
            for (const m of g.metrics) {
              for (const v of m.values) {
                vals[`${m.id}|${v.classificationId}`] = baseToInput(v.valueBase, m);
              }
            }
          }
          setValues(vals);
          setInitial(vals);
        } else {
          toast.error("Không tải được màn hình nhập liệu");
        }
      })
      .catch(() => toast.error("Lỗi kết nối"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedDate = params.get("date") || "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
      setDate(requestedDate);
    }
    const requestedMetric = (params.get("metric") || "").toUpperCase();
    if (/^[A-Z0-9_]+$/.test(requestedMetric)) {
      setFocusMetric(requestedMetric);
    }
  }, []);

  useEffect(() => {
    load(date, entryPeriod);
  }, [date, entryPeriod, load]);

  useEffect(() => {
    if (!focusMetric || !data) return;
    const timer = window.setTimeout(() => {
      document
        .querySelector(`[data-metric-code="${focusMetric}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [focusMetric, data]);

  const changedCount = useMemo(() => {
    let n = 0;
    for (const k of Object.keys(values)) {
      const v = (values[k] || "").trim();
      const i = (initial[k] || "").trim();
      if (v === i) continue;
      if (v !== "" && Number.isFinite(Number(v.replace(/\./g, "").replace(",", ".")))) n++;
    }
    return n;
  }, [values, initial]);

  const save = async () => {
    if (!data) return;
    const entries: { metricId: string; classificationId: string; entryDate: string; value: string }[] = [];
    for (const g of data.groups) {
      for (const m of g.metrics) {
        for (const v of m.values) {
          const key = `${m.id}|${v.classificationId}`;
          const val = (values[key] || "").trim();
          const ini = (initial[key] || "").trim();
          if (val === ini || val === "") continue;
          entries.push({ metricId: m.id, classificationId: v.classificationId, entryDate: data.date, value: val });
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
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success(
          `Đã lưu ${json.saved} ô số liệu cho ${data.period?.label || fmtDate(data.date)}`
        );
        // P0: cảnh báo mềm giá trị bất thường (không chặn lưu) — người nhập tự kiểm tra lại
        setSaveWarnings(Array.isArray(json.warnings) && json.warnings.length > 0 ? json.warnings : null);
        load(date, entryPeriod);
      } else {
        const first = json?.errors?.[0]?.message;
        toast.error(first || json?.error || "Không lưu được số liệu");
      }
    } catch {
      toast.error("Lỗi kết nối khi lưu");
    } finally {
      setSaving(false);
    }
  };

  const doAction = async (entryId: string, action: string, reason?: string) => {
    setBusyKey(entryId);
    try {
      const res = await fetch("/api/metrics/entries", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: entryId, action, reason }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success(ACTION_LABELS[action.toUpperCase()] ? `Đã ${ACTION_LABELS[action.toUpperCase()].toLowerCase()}` : "Đã cập nhật trạng thái");
        load(date, entryPeriod);
      } else {
        toast.error(json.error || "Không thực hiện được");
      }
    } catch {
      toast.error("Lỗi kết nối");
    } finally {
      setBusyKey(null);
    }
  };

  const openHistory = async (entryId: string, metricName: string) => {
    setHistoryFor({ entryId, metricName });
    setHistory(null);
    const res = await fetch(`/api/metrics/entries?history=${entryId}`);
    const json = await res.json();
    if (res.ok && json.success) setHistory(json.revisions);
    else setHistory([]);
  };

  const openCumulativeHelper = async (key: string, label: string) => {
    const [metricId, classificationId = ""] = key.split("|");
    const periodLabel = data?.period?.label || `Ngày ${fmtDate(data?.date || date)}`;
    const periodEnd = data?.date || date;
    setCumulativeHelper({
      key,
      label,
      current: values[key] || "",
      entryPeriod,
      periodLabel,
      periodEnd,
    });
    setCumulativeToday("");
    setCumulativePrevious("");
    setCumulativeError(null);
    setCumulativePreviousDate("");
    setCumulativeEntryCount(null);
    setCumulativeLoading(true);
    try {
      const params = new URLSearchParams({
        metricId,
        classificationId,
        asOf: periodEnd,
      });
      if (entryPeriod !== "DAY") params.set("entryPeriod", entryPeriod);
      const res = await fetch(`/api/metrics/entries/cumulative?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          json?.error ||
            (entryPeriod === "DAY"
              ? "Không lấy được lũy kế hôm trước"
              : "Không lấy được lũy kế kỳ trước")
        );
      }
      setCumulativePrevious(String(json.cumulativePrevious ?? "0"));
      setCumulativePreviousDate(String(json.previousDate || ""));
      setCumulativeEntryCount(Number(json.entryCount) || 0);
    } catch (error) {
      setCumulativeError(
        error instanceof Error
          ? error.message
          : entryPeriod === "DAY"
            ? "Không lấy được lũy kế hôm trước"
            : "Không lấy được lũy kế kỳ trước"
      );
    } finally {
      setCumulativeLoading(false);
    }
  };

  const cumulativeDelta = useMemo(() => {
    const today = parseRawNumber(cumulativeToday);
    const previous = parseRawNumber(cumulativePrevious);
    if (today === null || previous === null) return null;
    return today - previous;
  }, [cumulativeToday, cumulativePrevious]);

  const applyCumulativeDelta = () => {
    if (!cumulativeHelper || cumulativeDelta === null) {
      toast.error(
        cumulativeHelper?.entryPeriod === "DAY"
          ? "Nhập đủ lũy kế hôm nay và hôm trước."
          : "Nhập đủ lũy kế cuối kỳ và cuối kỳ trước."
      );
      return;
    }
    setValues((prev) => ({ ...prev, [cumulativeHelper.key]: rawFromNumber(cumulativeDelta) }));
    toast.success(
      cumulativeHelper.entryPeriod === "DAY"
        ? "Đã điền số phát sinh ngày. Kiểm tra lại rồi bấm Lưu số liệu."
        : "Đã điền số phát sinh trong kỳ. Kiểm tra lại rồi bấm Lưu số liệu."
    );
    setCumulativeHelper(null);
    setCumulativeToday("");
    setCumulativePrevious("");
    setCumulativeError(null);
    setCumulativePreviousDate("");
    setCumulativeEntryCount(null);
  };

  return (
    <div className="flex flex-col min-h-screen bg-v5-bg pb-24">
      <div className="px-margin pt-space-md pb-space-sm flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="font-headline-sm text-headline-sm text-primary font-bold">Nhập số liệu</h1>
            <p className="text-body-sm text-v5-muted">
              Thuế nhập theo ngày; các chỉ tiêu khác nhập theo tuần/tháng/quý/năm theo cấu hình. Chỉ hiện các chỉ tiêu bạn được phân công.
            </p>
            <p className="text-body-xs text-v5-muted">
              Số nhập theo kỳ là <b>tổng phát sinh trong kỳ</b>, lưu tại ngày cuối kỳ; có thể nhập ngay cả khi kỳ chưa kết thúc.
            </p>
          </div>
          <BackButton href="/giao-ban" label="Tổng hợp giao ban" />
        </div>

        <div
          className="grid w-full max-w-2xl grid-cols-5 gap-1 rounded-lg border border-v5-line/40 bg-v5-surface p-1 shadow-sm"
          data-testid="entry-period-tabs"
        >
          {ENTRY_PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setEntryPeriod(p)}
              aria-pressed={entryPeriod === p}
              className={`min-w-0 rounded-lg px-2 py-1.5 text-label-md font-label-md leading-tight transition-fast ${
                entryPeriod === p
                  ? "bg-primary text-on-primary shadow-sm font-semibold"
                  : "text-v5-muted hover:text-primary"
              }`}
              title={ENTRY_PERIOD_HINTS[p]}
            >
              {ENTRY_PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        {entryPeriod === "DAY" && data && data.groups.length > 0 && (
          <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-body-xs text-sky-800">
            Thu NSNN nhập theo ngày. Các chỉ tiêu khác chọn tab Tuần/Tháng/Quý/Năm ở trên.
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setDate(shiftPeriodAnchor(entryPeriod, date, -1))}
            className="p-2 rounded-lg border border-v5-line bg-v5-surface hover:bg-v5-bg"
            title={`${ENTRY_PERIOD_LABELS[entryPeriod]} trước`}
          >
            <span className="material-symbols-outlined text-[18px]">chevron_left</span>
          </button>
          <input
            type="date"
            value={date}
            max={data?.today || todayVnStr()}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-2 rounded-lg border border-v5-line bg-v5-surface text-body-sm"
            title={entryPeriod === "DAY" ? "Chọn ngày" : "Chọn một ngày trong kỳ cần nhập"}
          />
          <button
            onClick={() => setDate(shiftPeriodAnchor(entryPeriod, date, 1))}
            disabled={shiftPeriodAnchor(entryPeriod, date, 1) > (data?.today || todayVnStr())}
            className="p-2 rounded-lg border border-v5-line bg-v5-surface hover:bg-v5-bg disabled:opacity-40"
            title={`${ENTRY_PERIOD_LABELS[entryPeriod]} sau`}
          >
            <span className="material-symbols-outlined text-[18px]">chevron_right</span>
          </button>
          <button
            onClick={() => setDate(todayVnStr())}
            className="px-3 py-2 rounded-lg border border-v5-line bg-v5-surface text-label-sm font-semibold hover:bg-v5-bg"
          >
            Kỳ hiện tại
          </button>
          {entryPeriod !== "DAY" && data?.period && (
            <span className="rounded border border-sky-200 bg-sky-50 px-2 py-1 text-body-xs text-sky-800">
              {data.period.label} · lưu tại {fmtDate(data.period.end)}
            </span>
          )}
          {data && !data.isToday && (
            <span className="rounded border border-v5-gold/50 bg-v5-gold-soft px-2 py-1 text-body-xs text-v5-gold-ink">
              Đang nhập cho {data.period?.label || `ngày ${fmtDate(date)}`} — kiểm tra phạm vi được phân công
            </span>
          )}
        </div>
      </div>

      <div className="px-margin flex flex-col gap-4">
        {saveWarnings && saveWarnings.length > 0 && (
          <div className="rounded-xl border border-v5-gold/50 bg-v5-gold-soft p-3 flex flex-col gap-1.5" data-testid="save-warnings">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-v5-gold-ink text-body-sm flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[18px]">warning</span>
                Cảnh báo giá trị bất thường ({saveWarnings.length}) — số liệu VẪN ĐÃ LƯU, hãy kiểm tra lại
              </span>
              <button onClick={() => setSaveWarnings(null)} className="text-v5-gold-ink hover:bg-v5-gold-soft rounded p-1" title="Đóng">
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>
            <ul className="text-body-xs text-v5-gold-ink list-disc pl-5 flex flex-col gap-0.5">
              {saveWarnings.map((w, i) => (
                <li key={i}>
                  <b>{w.metricName}</b> ({w.metricCode}): {w.message}
                </li>
              ))}
            </ul>
          </div>
        )}
        {loading && <div className="text-body-sm text-v5-muted py-8 text-center">Đang tải…</div>}

        {!loading && data && data.groups.length === 0 && (
          <div className="bg-v5-surface rounded-xl border border-v5-line/50 p-6 text-center">
            <span className="material-symbols-outlined text-[40px] text-v5-muted">event_note</span>
            <p className="text-body-md text-v5-ink mt-2 font-medium">
              Chưa có chỉ tiêu nào cấu hình nhập theo {ENTRY_PERIOD_LABELS[entryPeriod].toLowerCase()}
            </p>
            <p className="text-body-sm text-v5-muted mt-1">
              Vào “Cấu hình số liệu → Nhóm &amp; chỉ tiêu” để đổi Kỳ nhập, hoặc chọn kỳ khác ở trên.
            </p>
          </div>
        )}

        {!loading && data && data.groups.length > 0 && !data.anyEditable && (
          <div className="bg-v5-surface rounded-xl border border-v5-line/50 p-6 text-center">
            <span className="material-symbols-outlined text-[40px] text-v5-muted">lock_person</span>
            <p className="text-body-md text-v5-ink mt-2 font-medium">Bạn chưa được phân công nhập chỉ tiêu nào</p>
            <p className="text-body-sm text-v5-muted mt-1">
              Liên hệ lãnh đạo để được phân công tại mục “Cấu hình số liệu → Phân công”.
            </p>
          </div>
        )}

        {!loading &&
          data?.groups.map((g) => (
            <div key={g.id} className="bg-v5-surface rounded-xl shadow-sm border border-v5-line/50 overflow-hidden">
              <div className="px-4 py-3 bg-v5-bg border-b border-v5-line/40">
                <span className="font-label-lg text-label-lg text-primary font-bold uppercase tracking-wide">{g.name}</span>
              </div>
              <div className="divide-y divide-border-default/20">
                {g.metrics.map((m) => (
                  <div
                    key={m.id}
                    data-metric-code={m.code}
                    className={`px-4 py-3 ${
                      focusMetric === m.code ? "bg-primary/5 ring-1 ring-inset ring-primary/20" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-body-md text-v5-ink">{m.name}</span>
                      {m.valueKind === "BALANCE" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-sky-200 bg-sky-50 text-sky-700 font-semibold" title="Nhập số dư tại thời điểm — hệ thống lấy giá trị mới nhất">
                          SỐ DƯ
                        </span>
                      )}
                      {m.requireConfirm && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-v5-gold/50 bg-v5-gold-soft text-v5-gold-ink font-semibold">
                          CẦN KIỂM TRA
                        </span>
                      )}
                      {!m.canEnter && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-v5-line text-v5-muted font-semibold" title="Bạn chỉ được xem/kiểm tra chỉ tiêu này">
                          CHỈ KIỂM TRA
                        </span>
                      )}
                    </div>
                    {m.note && <div className="text-body-xs text-v5-muted mt-0.5">{m.note}</div>}

                    <div className="mt-2 flex flex-col gap-2">
                      {m.values.map((v) => {
                        const key = `${m.id}|${v.classificationId}`;
                        const status = v.status || "";
                        return (
                          <div key={key} className="flex items-center gap-2 flex-wrap">
                            <span className="text-body-sm text-v5-muted w-40 shrink-0 truncate" title={v.label}>
                              {v.label || "—"}
                            </span>
                            <FormattedNumberInput
                              value={values[key] ?? ""}
                              onValueChange={(raw) => setValues((p) => ({ ...p, [key]: raw }))}
                              disabled={!v.canEdit}
                              placeholder={v.canEdit ? "Nhập số…" : "—"}
                              className="w-44 px-3 py-1.5 rounded-lg border border-v5-line bg-v5-surface text-body-sm text-right tabular-nums focus:outline-none focus:border-primary disabled:bg-v5-bg disabled:text-v5-muted"
                            />
                            <span className="text-body-xs text-v5-muted w-24">{m.unitLabel}</span>

                            {v.canEdit && m.valueKind !== "BALANCE" && (
                              <button
                                type="button"
                                onClick={() =>
                                  openCumulativeHelper(
                                    key,
                                    `${m.name}${v.label ? ` · ${v.label}` : ""}`
                                  )
                                }
                                className="inline-flex items-center gap-1 rounded border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] font-semibold text-sky-800 hover:bg-sky-100"
                                title={
                                  entryPeriod === "DAY"
                                    ? "Tính số phát sinh ngày từ lũy kế hôm nay và hôm trước"
                                    : `Tính số phát sinh ${ENTRY_PERIOD_LABELS[entryPeriod].toLowerCase()} từ lũy kế cuối kỳ`
                                }
                              >
                                <span className="material-symbols-outlined text-[14px]">calculate</span>
                                Tính từ lũy kế
                              </button>
                            )}

                            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${STATUS_STYLES[status] || "border-v5-line text-v5-muted"}`}>
                              {STATUS_LABELS[status] || "Chưa nhập"}
                            </span>

                            {v.entryId && (
                              <button
                                onClick={() => openHistory(v.entryId!, m.name)}
                                className="p-1 rounded text-v5-muted hover:bg-v5-bg"
                                title="Lịch sử sửa"
                              >
                                <span className="material-symbols-outlined text-[16px]">history</span>
                              </button>
                            )}

                            {v.canSubmit && v.entryId && (
                              <button
                                onClick={() => doAction(v.entryId!, "submit")}
                                disabled={busyKey === v.entryId}
                                className="px-2 py-1 rounded border border-v5-gold/50 bg-v5-gold-soft text-v5-gold-ink text-[11px] font-semibold hover:bg-v5-gold-soft disabled:opacity-40"
                              >
                                Gửi kiểm tra
                              </button>
                            )}
                            {v.canConfirm && v.entryId && (
                              <button
                                onClick={() => doAction(v.entryId!, "confirm")}
                                disabled={busyKey === v.entryId}
                                className="px-2 py-1 rounded border border-v5-success/30 bg-v5-success-soft text-v5-success text-[11px] font-semibold hover:bg-v5-success-soft disabled:opacity-40"
                              >
                                Xác nhận
                              </button>
                            )}
                            {v.canFix && v.entryId && (
                              <button
                                onClick={() => {
                                  const reason = window.prompt("Lý do cần điều chỉnh (ghi vào lịch sử):");
                                  if (reason === null) return;
                                  doAction(v.entryId!, "needs_fix", reason);
                                }}
                                disabled={busyKey === v.entryId}
                                className="px-2 py-1 rounded border border-v5-danger/30 bg-v5-danger-soft text-v5-danger text-[11px] font-semibold hover:bg-v5-danger-soft disabled:opacity-40"
                              >
                                Cần điều chỉnh
                              </button>
                            )}
                            {v.enteredByName && (
                              <span className="text-body-xs text-v5-muted">{v.enteredByName}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

        {!loading && data && entryPeriod === "DAY" && (
          <MetricCumulativeAdjustmentPanel
            metrics={data.groups.flatMap((g) =>
              g.metrics.map((m) => ({
                id: m.id,
                code: m.code,
                name: m.name,
                unitLabel: m.unitLabel,
                displayScale: m.displayScale,
                decimals: m.decimals,
                canEnter: m.canEnter,
                canConfirm: m.canConfirm,
                values: m.values.map((v) => ({ classificationId: v.classificationId, label: v.label })),
              }))
            )}
          />
        )}
      </div>

      {/* Thanh lưu */}
      {!loading && data?.anyEditable && (
        <div className="fixed bottom-20 lg:bottom-6 left-0 lg:left-[264px] right-0 lg:right-6 px-margin z-40">
          <div className="bg-primary text-on-primary rounded-xl shadow-2xl px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-label-md font-semibold">
              {changedCount > 0
                ? `${changedCount} ô đã thay đổi · ${data.period?.label || `ngày ${fmtDate(date)}`}`
                : "Chưa có thay đổi"}
            </span>
            <button
              onClick={save}
              disabled={saving || changedCount === 0}
              className="px-5 py-2 rounded-lg bg-on-primary text-primary text-label-md font-bold hover:opacity-90 disabled:opacity-40"
            >
              {saving ? "Đang lưu…" : "Lưu số liệu"}
            </button>
          </div>
        </div>
      )}

      {/* Lịch sử sửa */}
      {cumulativeHelper && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCumulativeHelper(null);
          }}
        >
          <div className="absolute inset-0 bg-black/40" />
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Tính từ lũy kế"
            className="relative w-full max-w-lg rounded-2xl border border-v5-line bg-v5-surface p-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-title-md font-bold text-v5-ink">Tính từ lũy kế</h2>
                <p className="mt-0.5 text-body-xs text-v5-muted">
                  {cumulativeHelper.label}
                  {cumulativeHelper.entryPeriod !== "DAY" ? ` · ${cumulativeHelper.periodLabel}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCumulativeHelper(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-v5-muted hover:bg-v5-bg"
                aria-label="Đóng"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-body-xs font-semibold text-v5-muted">
                {cumulativeHelper.entryPeriod === "DAY"
                  ? "Lũy kế hôm nay"
                  : `Lũy kế đến cuối kỳ (${fmtDate(cumulativeHelper.periodEnd)})`}
                <FormattedNumberInput
                  value={cumulativeToday}
                  onValueChange={setCumulativeToday}
                  placeholder="VD: 1.334.441.535.806"
                  className="w-full rounded-lg border border-v5-line bg-v5-surface px-3 py-2 text-body-sm tabular-nums text-v5-ink focus:border-primary focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-body-xs font-semibold text-v5-muted">
                <span className="flex items-center gap-1.5">
                  {cumulativeHelper.entryPeriod === "DAY"
                    ? `Lũy kế đến ${cumulativePreviousDate || "hôm trước"}`
                    : `Lũy kế cuối kỳ trước${cumulativePreviousDate ? ` (${fmtDate(cumulativePreviousDate)})` : ""}`}
                  <span className="rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[9px] font-bold text-sky-700">
                    TỰ LẤY
                  </span>
                </span>
                <FormattedNumberInput
                  value={cumulativePrevious}
                  onValueChange={setCumulativePrevious}
                  readOnly={!cumulativeError}
                  disabled={cumulativeLoading}
                  placeholder={cumulativeLoading ? "Đang tính..." : "Chưa có dữ liệu"}
                  className="w-full rounded-lg border border-v5-line bg-v5-surface px-3 py-2 text-body-sm tabular-nums text-v5-ink focus:border-primary focus:outline-none read-only:bg-v5-bg disabled:opacity-60"
                />
              </label>
            </div>

            {cumulativeError && (
              <div className="mt-2 rounded-lg border border-status-danger/30 bg-status-danger-bg/40 p-2 text-[11px] text-status-danger">
                {cumulativeError}. Có thể nhập tay lũy kế{" "}
                {cumulativeHelper.entryPeriod === "DAY" ? "hôm trước" : "cuối kỳ trước"}.
              </div>
            )}
            {!cumulativeError && cumulativePreviousDate && (
              <div className="mt-2 text-[11px] text-v5-muted">
                Đã lấy lũy kế từ {cumulativeEntryCount || 0} bản ghi trước ngày {cumulativePreviousDate}.
              </div>
            )}

            <div className="mt-3 rounded-lg border border-v5-line bg-v5-bg p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-v5-muted">
                {cumulativeHelper.entryPeriod === "DAY"
                  ? "Số phát sinh ngày = lũy kế hôm nay − lũy kế hôm trước"
                  : "Số phát sinh trong kỳ = lũy kế cuối kỳ − lũy kế cuối kỳ trước"}
              </div>
              <div
                className={`mt-1 text-xl font-bold tabular-nums ${
                  cumulativeDelta !== null && cumulativeDelta < 0 ? "text-status-danger" : "text-primary"
                }`}
              >
                {cumulativeDelta === null
                  ? "—"
                  : cumulativeDelta.toLocaleString("vi-VN", { maximumFractionDigits: 6 })}
              </div>
            </div>

            <p className="mt-2 text-[11px] text-v5-muted">
              Hệ thống chỉ điền vào ô nhập; chưa lưu. Kiểm tra lại rồi bấm <b>Lưu số liệu</b>.
            </p>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCumulativeHelper(null)}
                className="rounded-lg border border-v5-line px-3 py-2 text-body-sm font-semibold text-v5-muted hover:bg-v5-bg"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={applyCumulativeDelta}
                disabled={cumulativeDelta === null}
                className="rounded-lg bg-primary px-4 py-2 text-body-sm font-semibold text-on-primary disabled:opacity-40"
              >
                Điền số phát sinh
              </button>
            </div>
          </section>
        </div>
      )}

      {historyFor && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" onClick={() => setHistoryFor(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative bg-v5-surface rounded-xl shadow-2xl w-full max-w-lg max-h-[75vh] overflow-y-auto p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="font-label-md text-label-md text-primary font-bold">Lịch sử sửa — {historyFor.metricName}</span>
              <button onClick={() => setHistoryFor(null)} className="p-1 rounded hover:bg-v5-bg">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            {history === null && <div className="text-body-sm text-v5-muted py-4 text-center">Đang tải…</div>}
            {history !== null && history.length === 0 && (
              <div className="text-body-sm text-v5-muted py-4 text-center">Chưa có lịch sử</div>
            )}
            <div className="flex flex-col gap-2">
              {history?.map((r) => (
                <div key={r.id} className="border border-v5-line/40 rounded-lg px-3 py-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-label-sm font-semibold text-v5-ink">{ACTION_LABELS[r.action] || r.action}</span>
                    <span className="text-body-xs text-v5-muted">
                      {new Date(r.editedAt).toLocaleString("vi-VN")} {r.editedByName ? `· ${r.editedByName}` : ""}
                    </span>
                  </div>
                  {(r.oldValue !== null || r.newValue !== null) && (
                    <div className="text-body-xs text-v5-muted mt-0.5 tabular-nums">
                      {r.oldValue !== null ? r.oldValue.toLocaleString("vi-VN") : "—"} → {r.newValue !== null ? r.newValue.toLocaleString("vi-VN") : "—"}
                    </div>
                  )}
                  {r.oldStatus !== r.newStatus && r.newStatus && (
                    <div className="text-body-xs text-v5-muted mt-0.5">
                      {STATUS_LABELS[r.oldStatus || ""] || r.oldStatus || "—"} → {STATUS_LABELS[r.newStatus] || r.newStatus}
                    </div>
                  )}
                  {r.reason && <div className="text-body-xs text-v5-ink mt-0.5">Lý do: {r.reason}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
