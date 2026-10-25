"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/Toast";
import BackButton from "@/components/ui/BackButton";
import FormattedNumberInput from "@/components/ui/FormattedNumberInput";
import { baseToInput, fmtDate, STATUS_LABELS, STATUS_STYLES } from "@/lib/metric-format";
import { MetricCumulativeAdjustmentPanel } from "@/components/metrics/MetricCumulativeAdjustmentPanel";
import { getVnDateParts } from "@/lib/period-helper";

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
  today: string;
  isToday: boolean;
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

function shiftDate(dateStr: string, deltaDays: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

export default function NhapSoLieuPage() {
  const [date, setDate] = useState<string>(todayVnStr());
  const [data, setData] = useState<EntryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState<Record<string, string>>({});
  const [initial, setInitial] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [saveWarnings, setSaveWarnings] = useState<{ metricCode: string; metricName: string; message: string }[] | null>(null);
  const [historyFor, setHistoryFor] = useState<{ entryId: string; metricName: string } | null>(null);
  const [history, setHistory] = useState<Revision[] | null>(null);

  const load = useCallback((d: string) => {
    setLoading(true);
    fetch(`/api/metrics/entries?date=${d}`)
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
    load(date);
  }, [date, load]);

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
          entries.push({ metricId: m.id, classificationId: v.classificationId, entryDate: date, value: val });
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
        body: JSON.stringify({ entries }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success(`Đã lưu ${json.saved} ô số liệu cho ${fmtDate(date)}`);
        // P0: cảnh báo mềm giá trị bất thường (không chặn lưu) — người nhập tự kiểm tra lại
        setSaveWarnings(Array.isArray(json.warnings) && json.warnings.length > 0 ? json.warnings : null);
        load(date);
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
        load(date);
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

  return (
    <div className="flex flex-col min-h-screen bg-surface-container-low pb-24">
      <div className="px-margin pt-space-md pb-space-sm flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="font-headline-sm text-headline-sm text-primary font-bold">Nhập số liệu</h1>
            <p className="text-body-sm text-on-surface-variant">
              Nhập số liệu theo ngày — chỉ hiện các chỉ tiêu bạn được phân công. Số đã gửi/xác nhận chỉ lãnh đạo sửa được.
            </p>
          </div>
          <BackButton href="/giao-ban" label="Tổng hợp giao ban" />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setDate(shiftDate(date, -1))}
            className="p-2 rounded-lg border border-border-default bg-surface-container-lowest hover:bg-surface-container"
            title="Ngày trước"
          >
            <span className="material-symbols-outlined text-[18px]">chevron_left</span>
          </button>
          <input
            type="date"
            value={date}
            max={data?.today || todayVnStr()}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-2 rounded-lg border border-border-default bg-surface-container-lowest text-body-sm"
          />
          <button
            onClick={() => setDate(shiftDate(date, 1))}
            disabled={date >= (data?.today || todayVnStr())}
            className="p-2 rounded-lg border border-border-default bg-surface-container-lowest hover:bg-surface-container disabled:opacity-40"
            title="Ngày sau"
          >
            <span className="material-symbols-outlined text-[18px]">chevron_right</span>
          </button>
          <button
            onClick={() => setDate(todayVnStr())}
            className="px-3 py-2 rounded-lg border border-border-default bg-surface-container-lowest text-label-sm font-semibold hover:bg-surface-container"
          >
            Hôm nay
          </button>
          {data && !data.isToday && (
            <span className="text-body-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              Đang nhập cho ngày {fmtDate(date)} — kiểm tra phạm vi ngày được phân công
            </span>
          )}
        </div>
      </div>

      <div className="px-margin flex flex-col gap-4">
        {saveWarnings && saveWarnings.length > 0 && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 flex flex-col gap-1.5" data-testid="save-warnings">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-amber-800 text-body-sm flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[18px]">warning</span>
                Cảnh báo giá trị bất thường ({saveWarnings.length}) — số liệu VẪN ĐÃ LƯU, hãy kiểm tra lại
              </span>
              <button onClick={() => setSaveWarnings(null)} className="text-amber-800 hover:bg-amber-100 rounded p-1" title="Đóng">
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>
            <ul className="text-body-xs text-amber-900 list-disc pl-5 flex flex-col gap-0.5">
              {saveWarnings.map((w, i) => (
                <li key={i}>
                  <b>{w.metricName}</b> ({w.metricCode}): {w.message}
                </li>
              ))}
            </ul>
          </div>
        )}
        {loading && <div className="text-body-sm text-on-surface-variant py-8 text-center">Đang tải…</div>}

        {!loading && data && !data.anyEditable && (
          <div className="bg-surface-container-lowest rounded-xl border border-border-default/50 p-6 text-center">
            <span className="material-symbols-outlined text-[40px] text-on-surface-variant">lock_person</span>
            <p className="text-body-md text-on-surface mt-2 font-medium">Bạn chưa được phân công nhập chỉ tiêu nào</p>
            <p className="text-body-sm text-on-surface-variant mt-1">
              Liên hệ lãnh đạo để được phân công tại mục “Cấu hình số liệu → Phân công”.
            </p>
          </div>
        )}

        {!loading &&
          data?.groups.map((g) => (
            <div key={g.id} className="bg-surface-container-lowest rounded-xl shadow-sm border border-border-default/50 overflow-hidden">
              <div className="px-4 py-3 bg-surface-container-low border-b border-border-default/40">
                <span className="font-label-lg text-label-lg text-primary font-bold uppercase tracking-wide">{g.name}</span>
              </div>
              <div className="divide-y divide-border-default/20">
                {g.metrics.map((m) => (
                  <div key={m.id} className="px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-body-md text-on-surface">{m.name}</span>
                      {m.valueKind === "BALANCE" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-sky-200 bg-sky-50 text-sky-700 font-semibold" title="Nhập số dư tại thời điểm — hệ thống lấy giá trị mới nhất">
                          SỐ DƯ
                        </span>
                      )}
                      {m.requireConfirm && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700 font-semibold">
                          CẦN KIỂM TRA
                        </span>
                      )}
                      {!m.canEnter && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-border-default text-on-surface-variant font-semibold" title="Bạn chỉ được xem/kiểm tra chỉ tiêu này">
                          CHỈ KIỂM TRA
                        </span>
                      )}
                    </div>
                    {m.note && <div className="text-body-xs text-on-surface-variant mt-0.5">{m.note}</div>}

                    <div className="mt-2 flex flex-col gap-2">
                      {m.values.map((v) => {
                        const key = `${m.id}|${v.classificationId}`;
                        const status = v.status || "";
                        return (
                          <div key={key} className="flex items-center gap-2 flex-wrap">
                            <span className="text-body-sm text-on-surface-variant w-40 shrink-0 truncate" title={v.label}>
                              {v.label || "—"}
                            </span>
                            <FormattedNumberInput
                              value={values[key] ?? ""}
                              onValueChange={(raw) => setValues((p) => ({ ...p, [key]: raw }))}
                              disabled={!v.canEdit}
                              placeholder={v.canEdit ? "Nhập số…" : "—"}
                              className="w-44 px-3 py-1.5 rounded-lg border border-border-default bg-surface-container-lowest text-body-sm text-right tabular-nums focus:outline-none focus:border-primary disabled:bg-surface-container disabled:text-on-surface-variant"
                            />
                            <span className="text-body-xs text-on-surface-variant w-24">{m.unitLabel}</span>

                            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${STATUS_STYLES[status] || "border-border-default text-on-surface-variant"}`}>
                              {STATUS_LABELS[status] || "Chưa nhập"}
                            </span>

                            {v.entryId && (
                              <button
                                onClick={() => openHistory(v.entryId!, m.name)}
                                className="p-1 rounded text-on-surface-variant hover:bg-surface-container"
                                title="Lịch sử sửa"
                              >
                                <span className="material-symbols-outlined text-[16px]">history</span>
                              </button>
                            )}

                            {v.canSubmit && v.entryId && (
                              <button
                                onClick={() => doAction(v.entryId!, "submit")}
                                disabled={busyKey === v.entryId}
                                className="px-2 py-1 rounded border border-amber-300 bg-amber-50 text-amber-800 text-[11px] font-semibold hover:bg-amber-100 disabled:opacity-40"
                              >
                                Gửi kiểm tra
                              </button>
                            )}
                            {v.canConfirm && v.entryId && (
                              <button
                                onClick={() => doAction(v.entryId!, "confirm")}
                                disabled={busyKey === v.entryId}
                                className="px-2 py-1 rounded border border-emerald-300 bg-emerald-50 text-emerald-800 text-[11px] font-semibold hover:bg-emerald-100 disabled:opacity-40"
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
                                className="px-2 py-1 rounded border border-rose-300 bg-rose-50 text-rose-800 text-[11px] font-semibold hover:bg-rose-100 disabled:opacity-40"
                              >
                                Cần điều chỉnh
                              </button>
                            )}
                            {v.enteredByName && (
                              <span className="text-body-xs text-on-surface-variant">{v.enteredByName}</span>
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

        {!loading && data && (
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
        <div className="fixed bottom-20 lg:bottom-6 left-0 lg:left-[276px] right-0 lg:right-6 px-margin z-40">
          <div className="bg-primary text-on-primary rounded-xl shadow-2xl px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-label-md font-semibold">
              {changedCount > 0 ? `${changedCount} ô đã thay đổi · ngày ${fmtDate(date)}` : "Chưa có thay đổi"}
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
      {historyFor && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" onClick={() => setHistoryFor(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative bg-surface-container-lowest rounded-xl shadow-2xl w-full max-w-lg max-h-[75vh] overflow-y-auto p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="font-label-md text-label-md text-primary font-bold">Lịch sử sửa — {historyFor.metricName}</span>
              <button onClick={() => setHistoryFor(null)} className="p-1 rounded hover:bg-surface-container">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            {history === null && <div className="text-body-sm text-on-surface-variant py-4 text-center">Đang tải…</div>}
            {history !== null && history.length === 0 && (
              <div className="text-body-sm text-on-surface-variant py-4 text-center">Chưa có lịch sử</div>
            )}
            <div className="flex flex-col gap-2">
              {history?.map((r) => (
                <div key={r.id} className="border border-border-default/40 rounded-lg px-3 py-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-label-sm font-semibold text-on-surface">{ACTION_LABELS[r.action] || r.action}</span>
                    <span className="text-body-xs text-on-surface-variant">
                      {new Date(r.editedAt).toLocaleString("vi-VN")} {r.editedByName ? `· ${r.editedByName}` : ""}
                    </span>
                  </div>
                  {(r.oldValue !== null || r.newValue !== null) && (
                    <div className="text-body-xs text-on-surface-variant mt-0.5 tabular-nums">
                      {r.oldValue !== null ? r.oldValue.toLocaleString("vi-VN") : "—"} → {r.newValue !== null ? r.newValue.toLocaleString("vi-VN") : "—"}
                    </div>
                  )}
                  {r.oldStatus !== r.newStatus && r.newStatus && (
                    <div className="text-body-xs text-on-surface-variant mt-0.5">
                      {STATUS_LABELS[r.oldStatus || ""] || r.oldStatus || "—"} → {STATUS_LABELS[r.newStatus] || r.newStatus}
                    </div>
                  )}
                  {r.reason && <div className="text-body-xs text-on-surface mt-0.5">Lý do: {r.reason}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
