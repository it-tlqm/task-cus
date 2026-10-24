"use client";

/**
 * V3.2 (B2-A) — nhập bổ sung/điều chỉnh mốc lũy kế từ màn hình nhập liệu.
 *
 * Dùng lại quyền `canEnter`/`canConfirm` của phân công hiện có (không thêm quyền).
 * Mọi thao tác bắt buộc lý do; API ghi revision old/new + audit old/new.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/Toast";
import { fmtDate, fmtMetric } from "@/lib/metric-format";
import { getVnDateParts } from "@/lib/period-helper";

export interface AdjustmentMetricOption {
  id: string;
  code: string;
  name: string;
  unitLabel: string;
  displayScale: number;
  decimals: number;
  canEnter: boolean;
  canConfirm: boolean;
  values: { classificationId: string; label: string }[];
}

interface AdjustmentRow {
  id: string;
  metricId: string;
  metricCode: string;
  metricName: string;
  classificationId: string;
  classificationLabel: string | null;
  cumKind: string;
  asOfDate: string;
  valueBase: number;
  status: string;
  dataSource: string;
  isOfficial: boolean;
  sourceNote: string | null;
  reason: string | null;
  confirmedByName: string | null;
  confirmedAt: string | null;
  canEdit: boolean;
  canConfirm: boolean;
}

const CUM_LABELS: Record<string, string> = {
  MONTH: "Lũy kế tháng",
  QUARTER: "Lũy kế quý",
  YEAR: "Lũy kế năm",
  LEDGER: "Số dư liên tục",
};

function todayVnStr(): string {
  const p = getVnDateParts(new Date());
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function emptyDraft(metricId = "") {
  return {
    metricId,
    classificationId: "",
    cumKind: "YEAR",
    asOfDate: todayVnStr(),
    value: "",
    reason: "",
    sourceNote: "",
  };
}

export function MetricCumulativeAdjustmentPanel({ metrics }: { metrics: AdjustmentMetricOption[] }) {
  const enterable = useMemo(() => metrics.filter((m) => m.canEnter || m.canConfirm), [metrics]);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<AdjustmentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft(enterable[0]?.id ?? ""));
  const selected = enterable.find((m) => m.id === draft.metricId);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/metrics/baseline-adjustments", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || "Không tải được điều chỉnh lũy kế.");
      setRows(json.adjustments || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi tải điều chỉnh lũy kế.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  async function submit() {
    if (!selected) {
      toast.error("Chưa chọn chỉ tiêu.");
      return;
    }
    if (!draft.reason.trim()) {
      toast.error("Bắt buộc nhập lý do điều chỉnh lũy kế.");
      return;
    }
    if (!draft.asOfDate || !draft.value.trim()) {
      toast.error("Phải nhập ngày mốc và giá trị.");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        metricId: draft.metricId,
        classificationId: draft.classificationId,
        cumKind: draft.cumKind,
        asOfDate: draft.asOfDate,
        value: draft.value,
        reason: draft.reason,
        sourceNote: draft.sourceNote,
      };
      const res = await fetch(
        editId ? `/api/metrics/baseline-adjustments/${editId}` : "/api/metrics/baseline-adjustments",
        {
          method: editId ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || "Không lưu được điều chỉnh lũy kế.");
      toast.success(editId ? "Đã điều chỉnh mốc lũy kế (cần xác nhận lại)." : "Đã tạo mốc điều chỉnh (Đề xuất).");
      setEditId(null);
      setDraft(emptyDraft(draft.metricId));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi lưu điều chỉnh lũy kế.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(row: AdjustmentRow) {
    const reason = window.prompt("Lý do xác nhận mốc điều chỉnh (bắt buộc):");
    if (!reason?.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/metrics/baseline-adjustments/${row.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "confirm", reason }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || "Không xác nhận được mốc.");
      toast.success("Đã xác nhận mốc điều chỉnh.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi xác nhận mốc.");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(row: AdjustmentRow) {
    setEditId(row.id);
    setDraft({
      metricId: row.metricId,
      classificationId: row.classificationId,
      cumKind: row.cumKind,
      asOfDate: row.asOfDate,
      value: String(row.valueBase / (metrics.find((m) => m.id === row.metricId)?.displayScale || 1)),
      reason: "",
      sourceNote: row.sourceNote || "",
    });
  }

  if (enterable.length === 0) return null;

  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-border-default/50 overflow-hidden" data-testid="cumulative-adjustment-panel">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-3 bg-surface-container-low border-b border-border-default/40 flex items-center justify-between gap-2"
      >
        <span className="font-label-lg text-label-lg text-primary font-bold uppercase tracking-wide text-left">
          Điều chỉnh lũy kế (B2-A)
        </span>
        <span className="text-body-xs text-on-surface-variant">
          Bắt buộc lý do · lưu old/new · dùng quyền nhập/xác nhận hiện có
        </span>
        <span className="material-symbols-outlined text-[20px] text-on-surface-variant">{open ? "expand_less" : "expand_more"}</span>
      </button>

      {open && (
        <div className="p-4 flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <select
              value={draft.metricId}
              onChange={(e) => setDraft({ ...emptyDraft(e.target.value), metricId: e.target.value })}
              disabled={Boolean(editId)}
              className="px-2 py-1.5 rounded border border-border-default text-body-sm"
            >
              {enterable.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code} — {m.name}
                </option>
              ))}
            </select>
            <select
              value={draft.classificationId}
              onChange={(e) => setDraft({ ...draft, classificationId: e.target.value })}
              disabled={Boolean(editId)}
              className="px-2 py-1.5 rounded border border-border-default text-body-sm"
            >
              <option value="">Tổng (không phân loại)</option>
              {(selected?.values || [])
                .filter((v) => v.classificationId)
                .map((v) => (
                  <option key={v.classificationId} value={v.classificationId}>
                    {v.label}
                  </option>
                ))}
            </select>
            <select
              value={draft.cumKind}
              onChange={(e) => setDraft({ ...draft, cumKind: e.target.value })}
              disabled={Boolean(editId)}
              className="px-2 py-1.5 rounded border border-border-default text-body-sm"
            >
              {Object.entries(CUM_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={draft.asOfDate}
              max={todayVnStr()}
              onChange={(e) => setDraft({ ...draft, asOfDate: e.target.value })}
              className="px-2 py-1.5 rounded border border-border-default text-body-sm"
            />
            <input
              value={draft.value}
              onChange={(e) => setDraft({ ...draft, value: e.target.value })}
              inputMode="decimal"
              placeholder={`Giá trị đến ngày mốc (${selected?.unitLabel || "số"})`}
              className="px-2 py-1.5 rounded border border-border-default text-body-sm text-right tabular-nums"
            />
            <input
              value={draft.reason}
              onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
              placeholder="Lý do điều chỉnh (bắt buộc)"
              className="px-2 py-1.5 rounded border border-border-default text-body-sm sm:col-span-2"
            />
            <input
              value={draft.sourceNote}
              onChange={(e) => setDraft({ ...draft, sourceNote: e.target.value })}
              placeholder="Nguồn/căn cứ (không bắt buộc)"
              className="px-2 py-1.5 rounded border border-border-default text-body-sm"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="px-3 py-1.5 rounded-lg bg-primary text-on-primary text-label-sm font-semibold disabled:opacity-40"
            >
              {busy ? "Đang lưu…" : editId ? "Lưu điều chỉnh" : "Tạo mốc điều chỉnh"}
            </button>
            {editId && (
              <button
                type="button"
                onClick={() => {
                  setEditId(null);
                  setDraft(emptyDraft(draft.metricId));
                }}
                className="px-3 py-1.5 rounded-lg border border-border-default text-label-sm font-semibold"
              >
                Hủy sửa
              </button>
            )}
            <span className="text-body-xs text-on-surface-variant">
              Sửa mốc đã xác nhận cần quyền xác nhận; mốc đã chốt không sửa trực tiếp.
            </span>
          </div>

          {loading && <div className="text-body-sm text-on-surface-variant">Đang tải mốc điều chỉnh…</div>}
          {!loading && rows.length === 0 && (
            <div className="text-body-sm text-on-surface-variant italic">Chưa có mốc điều chỉnh nào bạn được xem.</div>
          )}
          {!loading && rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-body-xs border-collapse">
                <thead className="bg-surface-container-low text-left text-on-surface-variant">
                  <tr>
                    <th className="px-2 py-1.5">Chỉ tiêu</th>
                    <th className="px-2 py-1.5">Loại / ngày mốc</th>
                    <th className="px-2 py-1.5 text-right">Giá trị</th>
                    <th className="px-2 py-1.5">Trạng thái</th>
                    <th className="px-2 py-1.5">Lý do</th>
                    <th className="px-2 py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const metric = metrics.find((m) => m.id === row.metricId);
                    const style = {
                      displayScale: metric?.displayScale || 1,
                      decimals: metric?.decimals || 0,
                      unitLabel: metric?.unitLabel || "",
                    };
                    return (
                      <tr key={row.id} className="border-t border-border-default/40 align-top">
                        <td className="px-2 py-1.5">
                          <div className="font-semibold">{row.metricCode}</div>
                          <div className="text-on-surface-variant">{row.classificationLabel || "Tổng"}</div>
                        </td>
                        <td className="px-2 py-1.5">
                          {CUM_LABELS[row.cumKind] || row.cumKind} · {fmtDate(row.asOfDate)}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmtMetric(row.valueBase, style)}</td>
                        <td className="px-2 py-1.5">
                          <span className="text-[10px] px-1.5 py-0.5 rounded border border-border-default font-semibold">
                            {row.status === "LOCKED" ? "Đã chốt" : row.status === "CONFIRMED" ? "Đã xác nhận" : "Đề xuất"}
                          </span>
                          {row.dataSource === "DEMO" ? <span className="ml-1 text-[10px] text-slate-500">DEMO</span> : null}
                          {row.confirmedByName ? (
                            <div className="text-[10px] text-on-surface-variant">{row.confirmedByName}</div>
                          ) : null}
                        </td>
                        <td className="px-2 py-1.5 max-w-[220px] truncate" title={row.reason || ""}>
                          {row.reason || "—"}
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-1 justify-end">
                            {row.canEdit && row.status !== "LOCKED" && (
                              <button
                                type="button"
                                onClick={() => startEdit(row)}
                                className="px-2 py-1 rounded border border-border-default font-semibold hover:bg-surface-container"
                              >
                                Sửa
                              </button>
                            )}
                            {row.canConfirm && row.status === "PROPOSED" && (
                              <button
                                type="button"
                                onClick={() => confirm(row)}
                                disabled={busy}
                                className="px-2 py-1 rounded border border-emerald-300 bg-emerald-50 text-emerald-800 font-semibold hover:bg-emerald-100 disabled:opacity-40"
                              >
                                Xác nhận
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
