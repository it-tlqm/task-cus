"use client";

/**
 * S3 — Phase C: manager target-only (D7=A).
 *
 * Gọi `/api/metrics/targets/*`; không sửa `/api/metrics/admin`.
 * D5 đang DEFERRED_B_C_3: UI hiển thị “chưa có quy tắc”; không tính % chính thức.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/components/ui/Toast";
import type { MetricOption, MetricRuleOption, TargetDraftInput, TargetLabelCode } from "../../lib/metrics-contract";
import { metricRuleFor } from "../../lib/metrics-contract";
import {
  mapBc2TargetToTargetDraft,
  mapTargetDraftToBc2CreateInput,
  type Bc2TargetDto,
} from "../../lib/metrics-bc2-mapping";
import { MetricTargetDraftEditor } from "./MetricTargetDraftEditor";

interface ConfigMetric {
  id: string;
  code: string;
  name: string;
  unitType: string;
  unitLabel?: string | null;
  unitLabelEffective?: string | null;
  displayScale?: number | null;
  decimals?: number | null;
  classifications?: { id: string; code: string; label: string }[];
  targetRules?: MetricRuleOption[];
}

interface ConfigGroup {
  id: string;
  name: string;
  metrics: ConfigMetric[];
}

export interface MetricTargetManagerProps {
  groups: ConfigGroup[];
  /** Mã chỉ tiêu cần chọn sẵn khi mở từ link "Nhập chỉ tiêu đối chiếu". */
  initialMetricCode?: string;
}

interface RevisionView {
  id: string;
  action: string;
  oldValue: number | null;
  newValue: number | null;
  oldStatus: string | null;
  newStatus: string | null;
  oldSourceNote: string | null;
  newSourceNote: string | null;
  reason: string | null;
  editedByName: string | null;
  editedAt: string;
}

const TARGET_LABEL_CODES_BC2: TargetLabelCode[] = ["BTC", "UBND", "KH_THANG", "KHAC"];

function formatValue(v: number | null): string {
  if (v === null) return "-";
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(v);
}

const TARGET_ACTION_LABELS: Record<string, string> = {
  CREATE: "Tạo",
  UPDATE: "Cập nhật",
  CONFIRM: "Xác nhận",
  LOCK: "Chốt",
  DELETE: "Xóa",
  CORRECT: "Điều chỉnh",
};

const TARGET_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Nháp",
  PROPOSED: "Đề xuất",
  CONFIRMED: "Đã xác nhận",
  LOCKED: "Đã chốt",
  VOID: "Đã hủy",
  SUPERSEDED: "Thay thế",
};

export function MetricTargetManager({ groups, initialMetricCode = "" }: MetricTargetManagerProps) {
  const metricOptions: MetricOption[] = useMemo(
    () =>
      groups.flatMap((g) =>
        g.metrics.map((m) => {
          const rule =
            m.targetRules?.find((r) => r.targetApplicable) ??
            m.targetRules?.find((r) => r.configured) ??
            metricRuleFor(undefined, "YEAR");
          return {
            id: m.id,
            code: m.code,
            name: m.name,
            unitType: m.unitType,
            unitLabel: m.unitLabelEffective || m.unitLabel || m.unitType,
            measureMode: rule.measureMode,
            direction: rule.direction,
            baselineScope: rule.baselineScope,
            targetRules: m.targetRules,
            classifications: m.classifications || [],
          };
        })
      ),
    [groups]
  );
  const metricById = useMemo(() => new Map(metricOptions.map((m) => [m.id, m])), [metricOptions]);

  const [selectedMetricId, setSelectedMetricId] = useState(() => {
    const matched = initialMetricCode
      ? metricOptions.find((m) => m.code === initialMetricCode)
      : null;
    return matched?.id ?? metricOptions[0]?.id ?? "";
  });
  const [targets, setTargets] = useState<TargetDraftInput[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [history, setHistory] = useState<{ target: TargetDraftInput; revisions: RevisionView[] } | null>(null);
  const initialMetricApplied = useRef(false);

  useEffect(() => {
    if (!selectedMetricId && metricOptions[0]) setSelectedMetricId(metricOptions[0].id);
  }, [metricOptions, selectedMetricId]);

  useEffect(() => {
    if (initialMetricApplied.current || !initialMetricCode || metricOptions.length === 0) return;
    const matched = metricOptions.find((m) => m.code === initialMetricCode);
    if (matched) setSelectedMetricId(matched.id);
    initialMetricApplied.current = true;
  }, [initialMetricCode, metricOptions]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    if (!selectedMetricId) {
      setTargets([]);
      return;
    }
    setLoading(true);
    setError(null);
    fetch(`/api/metrics/targets?metricId=${encodeURIComponent(selectedMetricId)}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.success) throw new Error(json.error || "Không tải được chỉ tiêu giao.");
        const mapped = (json.targets || []).flatMap((t: Bc2TargetDto) => {
          const result = mapBc2TargetToTargetDraft(t);
          return result.value ? [result.value] : [];
        });
        if (!cancelled) setTargets(mapped);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Lỗi tải chỉ tiêu giao.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedMetricId, refreshKey]);

  const selectedMetric = metricById.get(selectedMetricId);
  const targetsKey = targets
    .map((t) => [t.id || t.label, t.status, t.isOfficial ? "official" : "demo", t.value, t.sourceNote].join(":"))
    .join("|");

  async function request(path: string, method: string, body?: unknown): Promise<any> {
    const res = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) throw new Error(json.error || "API target-only từ chối thao tác.");
    return json;
  }

  async function handleSaveDraft(draft: TargetDraftInput): Promise<boolean> {
    if (!selectedMetric) return false;
    const mapped = mapTargetDraftToBc2CreateInput(draft, {
      unitType: selectedMetric.unitType,
      measureMode: "PENDING_BUSINESS_INPUT",
      baselineScope: "PENDING_BUSINESS_INPUT",
    });
    if (!mapped.value) {
      toast.error(mapped.issues[0]?.message || "Dữ liệu chỉ tiêu giao không hợp lệ.");
      return false;
    }
    const payload = {
      metricId: mapped.value.metricId,
      classificationId: mapped.value.classificationId,
      label: draft.label,
      periodType: mapped.value.periodType,
      year: mapped.value.year,
      periodNo: mapped.value.periodNo,
      value: String(mapped.value.valueBase),
      comparisonKind: mapped.value.comparisonKind,
      dataSource: mapped.value.dataSource,
      sourceNote: mapped.value.sourceNote,
      note: mapped.value.note,
    };
    try {
      const realId = draft.id && !draft.id.startsWith("temp-") ? draft.id : null;
      if (realId) await request(`/api/metrics/targets/${realId}`, "PATCH", payload);
      else await request("/api/metrics/targets", "POST", payload);
      toast.success(realId ? "Đã lưu đề xuất chỉ tiêu giao." : "Đã tạo chỉ tiêu giao.");
      refresh();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi lưu chỉ tiêu giao.");
      return false;
    }
  }

  async function handleConfirm(draft: TargetDraftInput): Promise<boolean> {
    if (!draft.id) return false;
    try {
      await request(`/api/metrics/targets/${draft.id}`, "POST", {
        action: "confirm",
        sourceNote: draft.sourceNote,
        reason: "Xác nhận từ giao diện",
      });
      toast.success("Đã xác nhận chỉ tiêu giao.");
      refresh();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi xác nhận chỉ tiêu giao.");
      return false;
    }
  }

  async function handleLock(draft: TargetDraftInput): Promise<boolean> {
    if (!draft.id) return false;
    try {
      await request(`/api/metrics/targets/${draft.id}`, "POST", {
        action: "lock",
        reason: "Chốt từ giao diện",
      });
      toast.success("Đã chốt chỉ tiêu giao.");
      refresh();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi chốt chỉ tiêu giao.");
      return false;
    }
  }

  async function handleVoid(draft: TargetDraftInput): Promise<boolean> {
    if (!draft.id) return false;
    try {
      await request(`/api/metrics/targets/${draft.id}`, "POST", {
        action: "void",
        reason: "Hủy từ giao diện",
      });
      toast.success("Đã hủy chỉ tiêu giao.");
      refresh();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi hủy chỉ tiêu giao.");
      return false;
    }
  }

  async function handleHistory(draft: TargetDraftInput) {
    if (!draft.id) return;
    try {
      const json = await request(`/api/metrics/targets/${draft.id}/revisions`, "GET");
      setHistory({ target: draft, revisions: json.revisions || [] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi tải lịch sử chỉ tiêu giao.");
    }
  }

  async function handleCorrect(
    draft: TargetDraftInput,
    input: { value: string; reason: string; sourceNote: string }
  ): Promise<boolean> {
    if (!draft.id) return false;
    try {
      await request(`/api/metrics/targets/${draft.id}`, "POST", {
        action: "correct",
        value: input.value,
        reason: input.reason,
        sourceNote: input.sourceNote,
      });
      toast.success("Đã điều chỉnh chỉ tiêu đã chốt; lịch sử đã được ghi.");
      refresh();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi điều chỉnh chỉ tiêu đã chốt.");
      return false;
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-v5-line/50 bg-v5-surface p-4 flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-label-md text-label-md text-primary font-bold">Chỉ tiêu giao</div>
            <div className="text-body-xs text-v5-muted">
              Cấu hình chỉ tiêu theo năm, quý, tháng và xác nhận trước khi dùng tính tỷ lệ.
            </div>
          </div>
          <button
            type="button"
            onClick={refresh}
            className="rounded-lg border border-v5-line px-3 py-1.5 text-body-sm font-semibold hover:bg-v5-bg"
          >
            Tải lại
          </button>
        </div>
        <label className="flex flex-col gap-1 text-body-xs font-semibold text-v5-muted max-w-xl">
          Chọn chỉ tiêu
          <select
            value={selectedMetricId}
            onChange={(e) => setSelectedMetricId(e.target.value)}
            className="rounded border border-v5-line bg-surface px-2 py-1.5 text-body-sm font-normal text-v5-ink"
          >
            {groups.map((g) => (
              <optgroup key={g.id} label={g.name}>
                {g.metrics.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code} — {m.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-body-xs text-amber-900">
          Chỉ tính % chính thức khi chỉ tiêu/kỳ có quy tắc đánh giá đã duyệt (hiện chỉ <b>THU_NSNN</b>);
          chỉ tiêu khác hiển thị “Chưa có quy tắc gán chỉ tiêu” và không tô đạt/vượt.
        </div>
        {error && <div className="rounded border border-rose-300 bg-rose-50 px-3 py-2 text-body-xs text-rose-800">{error}</div>}
        {loading && <div className="text-body-xs text-v5-muted">Đang tải chỉ tiêu giao…</div>}
      </div>

      {selectedMetric && (
        <MetricTargetDraftEditor
          key={`${selectedMetricId}-${refreshKey}-${targetsKey}`}
          metrics={[selectedMetric]}
          initialTargets={targets}
          apiMode
          showMetricSelect={false}
          labelCodes={TARGET_LABEL_CODES_BC2}
          onSaveDraft={handleSaveDraft}
          onConfirm={handleConfirm}
          onLock={handleLock}
          onVoid={handleVoid}
          onHistory={handleHistory}
          onCorrect={handleCorrect}
        />
      )}

      {history && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[85vh] w-full max-w-4xl overflow-auto rounded-xl border border-v5-line bg-surface p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <div className="font-label-md text-label-md text-primary font-bold">Lịch sử chỉ tiêu giao</div>
                <div className="text-body-xs text-v5-muted">{history.target.label}</div>
              </div>
              <button
                type="button"
                onClick={() => setHistory(null)}
                className="rounded border border-v5-line px-2 py-1 text-body-sm font-semibold"
              >
                Đóng
              </button>
            </div>
            {history.revisions.length === 0 ? (
              <div className="text-body-sm text-v5-muted italic">Chưa có lịch sử.</div>
            ) : (
              <table className="w-full min-w-[700px] border-collapse text-body-xs">
                <thead className="bg-v5-bg text-left text-v5-muted">
                  <tr>
                    <th className="px-2 py-1.5">Hành động</th>
                    <th className="px-2 py-1.5 text-right">Giá trị cũ</th>
                    <th className="px-2 py-1.5 text-right">Giá trị mới</th>
                    <th className="px-2 py-1.5">Trạng thái</th>
                    <th className="px-2 py-1.5">Nguồn</th>
                    <th className="px-2 py-1.5">Lý do</th>
                    <th className="px-2 py-1.5">Người/thời điểm</th>
                  </tr>
                </thead>
                <tbody>
                  {history.revisions.map((r) => (
                    <tr key={r.id} className="border-t border-v5-line/40">
                      <td className="px-2 py-1.5 font-semibold">{TARGET_ACTION_LABELS[r.action] || r.action}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{formatValue(r.oldValue)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{formatValue(r.newValue)}</td>
                      <td className="px-2 py-1.5">
                        {TARGET_STATUS_LABELS[r.oldStatus || ""] || r.oldStatus || "-"} →{" "}
                        {TARGET_STATUS_LABELS[r.newStatus || ""] || r.newStatus || "-"}
                      </td>
                      <td className="max-w-[220px] truncate px-2 py-1.5" title={r.newSourceNote || r.oldSourceNote || ""}>
                        {r.newSourceNote || r.oldSourceNote || "—"}
                      </td>
                      <td className="max-w-[180px] truncate px-2 py-1.5" title={r.reason || ""}>{r.reason || "—"}</td>
                      <td className="px-2 py-1.5">
                        {r.editedByName || "—"}
                        <div className="text-[10px] text-v5-muted">
                          {new Date(r.editedAt).toLocaleString("vi-VN")}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
