"use client";

/**
 * S3 — Phase C: target UI draft độc lập (MOCK).
 *
 * - Không gọi API/DB; không được nối vào `/giao-ban/cau-hinh` trong đợt này.
 * - Dùng pure helper `src/lib/metrics-contract.ts` (APPROVED Q1–Q12).
 * - Chờ S2 công bố schema target; sau đó mới thay mock bằng API target-only.
 */

import React, { useEffect, useMemo, useState } from "react";
import FormattedNumberInput from "@/components/ui/FormattedNumberInput";
import {
  BASELINE_SCOPE_LABELS,
  DIRECTION_LABELS,
  MEASURE_MODE_LABELS,
  OFFICIAL_PERCENT_POLICY,
  PERCENT_REASON_LABELS,
  TARGET_LABEL_CODES,
  TARGET_STATE_LABELS,
  canConfirmTarget,
  computePercent,
  deriveActualState,
  deriveTargetState,
  formatNumberVi,
  metricRuleFor,
  nextTargetStatus,
  parseMetricInput,
  targetDraftErrors,
  validateTargetDraft,
  type Direction,
  type ExistingTargetKey,
  type MetricOption,
  type TargetDraftInput,
  type TargetLabelCode,
  type TargetStatus,
} from "../../lib/metrics-contract";
import { MOCK_METRICS, MOCK_TARGETS } from "./target-draft-mock";

export interface MetricTargetDraftEditorProps {
  metrics?: MetricOption[];
  initialTargets?: TargetDraftInput[];
  /** Callback API target-only; trả false để báo lỗi, undefined/true để thành công. */
  onSaveDraft?: (draft: TargetDraftInput) => Promise<boolean | void> | boolean | void;
  onConfirm?: (draft: TargetDraftInput) => Promise<boolean | void> | boolean | void;
  onLock?: (target: TargetDraftInput) => Promise<boolean | void> | boolean | void;
  onVoid?: (target: TargetDraftInput) => Promise<boolean | void> | boolean | void;
  onHistory?: (target: TargetDraftInput) => void;
  /** true khi component đã nối API target-only. */
  apiMode?: boolean;
  showMetricSelect?: boolean;
  labelCodes?: readonly TargetLabelCode[];
  /** D5 chưa có: ẩn preview %, chỉ hiển thị “chưa có quy tắc”. */
  rulesPending?: boolean;
}

function emptyDraft(metric: MetricOption | undefined): TargetDraftInput {
  return {
    metricId: metric?.id ?? "",
    classificationId: "",
    labelCode: "",
    label: "",
    periodType: "YEAR",
    year: 2026,
    periodNo: null,
    value: "",
    unitType: metric?.unitType ?? "",
    direction: metric?.direction ?? "NOT_SET",
    sourceNote: "",
    note: "",
    status: "DRAFT",
    isOfficial: true,
  };
}

function periodLabel(draft: Pick<TargetDraftInput, "periodType" | "year" | "periodNo">): string {
  if (draft.periodType === "YEAR") return `Năm ${draft.year ?? "—"}`;
  if (draft.periodType === "MONTH") return `Tháng ${draft.periodNo ?? "—"}/${draft.year ?? "—"}`;
  return `Quý ${draft.periodNo ?? "—"}/${draft.year ?? "—"}`;
}

const STATUS_STYLE: Record<TargetStatus, string> = {
  DRAFT: "border-amber-300 bg-amber-50 text-amber-800",
  CONFIRMED: "border-emerald-300 bg-emerald-50 text-emerald-800",
  LOCKED: "border-violet-300 bg-violet-50 text-violet-800",
  VOID: "border-rose-300 bg-rose-50 text-rose-800",
  SUPERSEDED: "border-slate-300 bg-slate-50 text-slate-700",
};

export function MetricTargetDraftEditor({
  metrics = MOCK_METRICS,
  initialTargets = MOCK_TARGETS,
  onSaveDraft,
  onConfirm,
  onLock,
  onVoid,
  onHistory,
  apiMode = false,
  showMetricSelect = true,
  labelCodes = TARGET_LABEL_CODES,
  rulesPending = false,
}: MetricTargetDraftEditorProps) {
  const [targets, setTargets] = useState<TargetDraftInput[]>(initialTargets);
  const [draft, setDraft] = useState<TargetDraftInput>(emptyDraft(metrics[0]));
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedMetric = metrics.find((m) => m.id === draft.metricId) ?? metrics[0];
  const selectedRule = metricRuleFor(selectedMetric, draft.periodType);
  const existingKeys: ExistingTargetKey[] = targets.map((t) => ({
    id: t.id,
    labelCode: t.labelCode,
    classificationId: t.classificationId,
    periodType: t.periodType,
    year: t.year ?? 0,
    periodNo: t.periodNo,
    status: t.status,
  }));

  const issues = useMemo(
    () => validateTargetDraft(draft, selectedMetric, existingKeys),
    [draft, selectedMetric, existingKeys]
  );
  const errors = targetDraftErrors(issues);
  const warnings = issues.filter((i) => i.severity === "warning");

  // V3.2/D5-A: direction lấy từ quy tắc đã duyệt, không cho người dùng tự đổi.
  useEffect(() => {
    setDraft((current) =>
      current.direction === selectedRule.direction ? current : { ...current, direction: selectedRule.direction }
    );
  }, [selectedRule.direction]);

  const preview = useMemo(() => {
    const value = parseMetricInput(draft.value);
    if (!selectedMetric || value === null || value <= 0 || !draft.year) return null;
    if (!selectedRule.officialPercentAllowed) return null;
    const mockActualValue = value * 0.8;
    const actual = deriveActualState({
      applicable: true,
      value: mockActualValue,
      valueSource: "ENTRY",
      unitType: selectedMetric.unitType,
      measureMode: selectedRule.measureMode,
      locked: false,
      noActivityConfirmed: false,
      expectedSlots: 1,
      coveredSlots: 1,
      entries: [{ value: mockActualValue, status: "CONFIRMED" }],
      classificationComplete: true,
    });
    const target = deriveTargetState(
      {
        exists: true,
        applicable: true,
        status: draft.status,
        isOfficial: draft.isOfficial,
        year: draft.year,
        periodType: draft.periodType,
        periodNo: draft.periodNo,
        value,
        unitType: draft.unitType,
        direction: selectedRule.direction,
        measureMode: selectedRule.measureMode,
        baselineScope: selectedRule.baselineScope,
      },
      { year: draft.year, periodType: draft.periodType, periodNo: draft.periodNo }
    );
    return computePercent({
      actual,
      target,
      targetValue: value,
      targetUnitType: draft.unitType,
      actualUnitType: selectedMetric.unitType,
      direction: selectedRule.direction,
      measureMode: selectedRule.measureMode,
      baselineScope: selectedRule.baselineScope,
      policy: { ...OFFICIAL_PERCENT_POLICY, metricRequiresConfirm: false },
      mode: "PREVIEW",
    });
  }, [draft, selectedMetric, selectedRule]);

  const parsedTargetValue = parseMetricInput(draft.value);
  const vndTargetLooksTooSmall =
    selectedMetric?.code === "THU_NSNN" &&
    selectedMetric.unitType === "VND" &&
    parsedTargetValue !== null &&
    parsedTargetValue > 0 &&
    parsedTargetValue < 1_000_000_000_000;

  function patch(patchValue: Partial<TargetDraftInput>) {
    setDraft((current) => ({ ...current, ...patchValue }));
  }

  function handleMetricChange(metricId: string) {
    const metric = metrics.find((m) => m.id === metricId);
    setDraft((current) => ({
      ...current,
      metricId,
      classificationId: "",
      unitType: metric?.unitType ?? "",
      direction: metric?.direction ?? "NOT_SET",
    }));
    setMessage(null);
  }

  async function save(status: TargetStatus) {
    if (busy) return;
    if (!selectedRule.officialPercentAllowed) {
      setMessage("Chưa có quy tắc đánh giá cho chỉ tiêu và kỳ này — không thể lưu chỉ tiêu.");
      return;
    }
    const next: TargetDraftInput = {
      ...draft,
      status,
      id: draft.id ?? (apiMode ? `temp-${Date.now()}` : `mock-target-${Date.now()}`),
    };
    if (status === "CONFIRMED" && !canConfirmTarget(next, selectedMetric, existingKeys)) {
      setMessage("Không thể xác nhận: còn lỗi validation. Xem danh sách bên dưới.");
      return;
    }
    const callback = status === "CONFIRMED" ? onConfirm : onSaveDraft;
    setBusy(true);
    try {
      const result = await callback?.(next);
      if (result === false) {
        setMessage("API target-only từ chối thao tác. Kiểm tra lỗi/validation.");
        return;
      }
      setTargets((current) => {
        const exists = current.some((t) => t.id === next.id);
        return exists ? current.map((t) => (t.id === next.id ? next : t)) : [next, ...current];
      });
      setDraft(next);
      setMessage(
        status === "CONFIRMED"
          ? apiMode
            ? "Đã gửi xác nhận chỉ tiêu. Tỷ lệ chính thức chỉ tính khi đủ quy tắc đánh giá."
            : "Đã xác nhận. Chỉ chỉ tiêu đã xác nhận mới đủ điều kiện tính tỷ lệ chính thức."
          : apiMode
            ? "Đã lưu đề xuất. Chỉ hiển thị tạm tính."
            : "Đã lưu nháp. Chỉ hiển thị tạm tính, không dùng báo cáo."
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Lỗi khi gọi API target-only.");
    } finally {
      setBusy(false);
    }
  }

  async function runAction(action: "confirm" | "lock" | "void" | "history", target: TargetDraftInput) {
    if (!target.id || busy) return;
    if (action === "history") {
      onHistory?.(target);
      return;
    }
    const callback = action === "confirm" ? onConfirm : action === "lock" ? onLock : onVoid;
    if (!callback) return;
    setBusy(true);
    try {
      const result = await callback(target);
      if (result === false) {
        setMessage("Hệ thống từ chối thao tác.");
        return;
      }
      setTargets((current) =>
        action === "void"
          ? current.filter((t) => t.id !== target.id)
          : current.map((t) =>
              t.id === target.id
                ? { ...t, status: action === "confirm" ? "CONFIRMED" : "LOCKED" }
                : t
            )
      );
      setMessage(
        action === "confirm"
          ? "Đã xác nhận chỉ tiêu. Chưa tính % chính thức cho tới B-C-3."
          : action === "lock"
            ? "Đã chốt chỉ tiêu giao."
            : "Đã hủy chỉ tiêu giao (chỉ áp dụng cho PROPOSED)."
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Lỗi khi gọi API target-only.");
    } finally {
      setBusy(false);
    }
  }

  const nextConfirm = nextTargetStatus(draft.status, "CONFIRM");

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border-default bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-headline-sm text-headline-sm text-primary">Chỉ tiêu giao</h2>
            <span className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${apiMode ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-sky-300 bg-sky-50 text-sky-800"}`}>
              {apiMode ? "Đã kết nối" : "Bản nháp"}
            </span>
          </div>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            Chỉ tiêu cấp Cục. Bản nháp chỉ tạm tính; chiều đánh giá, cách đo và mốc so sánh lấy từ quy tắc đã duyệt.
          </p>
        </div>
        <span className="rounded border border-border-default bg-surface-container-low px-2 py-1 text-[11px] font-semibold text-on-surface-variant">
          {draft.isOfficial ? "Chính thức" : "Không chính thức"}
        </span>
      </div>

      <div className={`rounded-lg border px-3 py-2 text-body-xs ${selectedRule.officialPercentAllowed ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}>
        {apiMode ? "Đã kết nối hệ thống. " : "Bản nháp: dữ liệu dưới đây chỉ để tham khảo. "}
        {selectedRule.officialPercentAllowed ? (
          <>
            <b>Quy tắc đánh giá đã duyệt:</b> {DIRECTION_LABELS[selectedRule.direction]} · {MEASURE_MODE_LABELS[selectedRule.measureMode]} · {BASELINE_SCOPE_LABELS[selectedRule.baselineScope]}.
          </>
        ) : (
          <>
            <b>Chưa có quy tắc gán/đánh giá chỉ tiêu</b> cho {draft.periodType === "YEAR" ? "kỳ năm" : draft.periodType === "MONTH" ? "kỳ tháng" : "kỳ quý"} — không lưu chỉ tiêu, không tính %, không tô đạt/vượt.
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {showMetricSelect && (
          <label className="flex flex-col gap-1 text-body-xs font-semibold text-on-surface-variant">
            Chỉ tiêu
            <select
              className="rounded border border-border-default bg-surface px-2 py-1.5 text-body-sm font-normal text-on-surface"
              value={draft.metricId}
              onChange={(e) => handleMetricChange(e.target.value)}
            >
              {metrics.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code} — {m.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="flex flex-col gap-1 text-body-xs font-semibold text-on-surface-variant">
          Loại chỉ tiêu giao
          <select
            className="rounded border border-border-default bg-surface px-2 py-1.5 text-body-sm font-normal text-on-surface"
            value={draft.labelCode}
            onChange={(e) => patch({ labelCode: e.target.value as TargetLabelCode | "" })}
          >
            <option value="">— chọn loại —</option>
            {labelCodes.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-body-xs font-semibold text-on-surface-variant">
          Tên hiển thị
          <input
            className="rounded border border-border-default bg-surface px-2 py-1.5 text-body-sm font-normal text-on-surface"
            value={draft.label}
            onChange={(e) => patch({ label: e.target.value })}
            placeholder="VD: Chỉ tiêu BTC năm 2026"
          />
        </label>

        <label className="flex flex-col gap-1 text-body-xs font-semibold text-on-surface-variant">
          Kỳ
          <select
            className="rounded border border-border-default bg-surface px-2 py-1.5 text-body-sm font-normal text-on-surface"
            value={draft.periodType}
            onChange={(e) =>
              patch({
                periodType: e.target.value as TargetDraftInput["periodType"],
                periodNo: e.target.value === "YEAR" ? null : draft.periodNo,
              })
            }
          >
            <option value="YEAR">Cả năm</option>
            <option value="QUARTER">Quý</option>
            <option value="MONTH">Tháng</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-body-xs font-semibold text-on-surface-variant">
          Năm
          <input
            type="number"
            className="rounded border border-border-default bg-surface px-2 py-1.5 text-body-sm font-normal text-on-surface"
            value={draft.year ?? ""}
            onChange={(e) => patch({ year: e.target.value ? Number(e.target.value) : null })}
          />
        </label>

        {draft.periodType !== "YEAR" && (
          <label className="flex flex-col gap-1 text-body-xs font-semibold text-on-surface-variant">
            {draft.periodType === "MONTH" ? "Tháng (1–12)" : "Quý (1–4)"}
            <input
              type="number"
              className="rounded border border-border-default bg-surface px-2 py-1.5 text-body-sm font-normal text-on-surface"
              value={draft.periodNo ?? ""}
              onChange={(e) => patch({ periodNo: e.target.value ? Number(e.target.value) : null })}
            />
          </label>
        )}

        <label className="flex flex-col gap-1 text-body-xs font-semibold text-on-surface-variant">
          Giá trị chỉ tiêu ({selectedMetric?.unitLabel || selectedMetric?.unitType || "đơn vị"})
          <FormattedNumberInput
            className="rounded border border-border-default bg-surface px-2 py-1.5 text-body-sm font-normal tabular-nums text-on-surface"
            value={draft.value}
            onValueChange={(raw) => patch({ value: raw })}
            placeholder="VD: 1.685.000.000.000"
          />
        </label>

        {vndTargetLooksTooSmall && (
          <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-body-xs text-amber-900">
            <div className="font-semibold">Kiểm tra đơn vị: giá trị đang nhỏ hơn 1.000 tỷ đồng.</div>
            <div className="mt-0.5">
              Nếu Quyết định ghi <b>1.685 tỷ</b>, phải nhập <b>1.685.000.000.000</b> (đồng).
            </div>
            <button
              type="button"
              onClick={() => patch({ value: String(Math.round((parsedTargetValue || 0) * 1000)) })}
              className="mt-1.5 rounded border border-amber-400 bg-white px-2 py-1 font-semibold text-amber-900 hover:bg-amber-100"
            >
              Nhân 1.000 (đổi tỷ → đồng)
            </button>
          </div>
        )}

        <label className="flex flex-col gap-1 text-body-xs font-semibold text-on-surface-variant">
          Chiều đánh giá
          <div className="rounded border border-border-default bg-surface-container-low px-2 py-1.5 text-body-sm font-normal text-on-surface">
            {DIRECTION_LABELS[selectedRule.direction]}
            <span className="ml-1 text-[10px] text-on-surface-variant">(theo quy tắc đã duyệt — không sửa tại đây)</span>
          </div>
        </label>

        {selectedMetric && selectedMetric.classifications.length > 0 && (
          <label className="flex flex-col gap-1 text-body-xs font-semibold text-on-surface-variant">
            Phân loại
            <select
              className="rounded border border-border-default bg-surface px-2 py-1.5 text-body-sm font-normal text-on-surface"
              value={draft.classificationId}
              onChange={(e) => patch({ classificationId: e.target.value })}
            >
              <option value="">Tổng (không phân loại)</option>
              {selectedMetric.classifications.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-body-xs font-semibold text-on-surface-variant">
          Nguồn / căn cứ (bắt buộc khi xác nhận)
          <textarea
            className="min-h-20 rounded border border-border-default bg-surface px-2 py-1.5 text-body-sm font-normal text-on-surface"
            value={draft.sourceNote}
            onChange={(e) => patch({ sourceNote: e.target.value })}
            placeholder="VD: Quyết định giao chỉ tiêu số ... (mock)"
          />
        </label>
        <label className="flex flex-col gap-1 text-body-xs font-semibold text-on-surface-variant">
          Ghi chú
          <textarea
            className="min-h-20 rounded border border-border-default bg-surface px-2 py-1.5 text-body-sm font-normal text-on-surface"
            value={draft.note}
            onChange={(e) => patch({ note: e.target.value })}
            placeholder="Ghi chú điều chỉnh / lý do"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[draft.status]}`}>
          {TARGET_STATE_LABELS[draft.status === "DRAFT" ? "DRAFT" : draft.status === "CONFIRMED" ? "CONFIRMED" : draft.status === "LOCKED" ? "LOCKED" : draft.status === "VOID" ? "VOID" : "SUPERSEDED"]}
        </span>
        <span className="text-body-xs text-on-surface-variant">
          {periodLabel(draft)} · {draft.classificationId ? "theo phân loại" : "tổng"} · {draft.labelCode || "chưa chọn loại"}
        </span>
        {nextConfirm && (
          <span className="text-body-xs text-on-surface-variant">
            Có thể xác nhận từ trạng thái nháp.
          </span>
        )}
      </div>

      {rulesPending || !selectedRule.officialPercentAllowed ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-body-sm text-amber-900">
          <b>Chưa có quy tắc đánh giá (D5-A):</b> chưa đủ direction/measureMode/baselineScope cho chỉ tiêu/kỳ này. Không tính % chính thức.
        </div>
      ) : (
        preview && (
          <div className="rounded-lg border border-border-default bg-surface-container-low px-3 py-2 text-body-sm">
            <b>Tạm tính (mock):</b>{" "}
            {preview.state === "COMPUTED" ? (
              <span className="font-semibold tabular-nums text-primary">{preview.displayValue}</span>
            ) : (
              <span className="text-on-surface-variant">
                {preview.reason ? PERCENT_REASON_LABELS[preview.reason] : "Không tính"}
              </span>
            )}
            <span className="ml-2 text-body-xs text-on-surface-variant">
              (số thực hiện giả lập = 80% chỉ tiêu; target DRAFT/DEMO không dùng báo cáo)
            </span>
          </div>
        )
      )}

      {(errors.length > 0 || warnings.length > 0) && (
        <div className="flex flex-col gap-1 rounded-lg border border-border-default bg-surface-container-lowest p-3">
          {errors.length > 0 && (
            <div className="text-body-xs font-semibold text-rose-700">Lỗi cần sửa trước khi xác nhận</div>
          )}
          {errors.map((e) => (
            <div key={`${e.field}-${e.code}`} className="text-body-xs text-rose-700">
              • {e.message}
            </div>
          ))}
          {warnings.map((w) => (
            <div key={`${w.field}-${w.code}`} className="text-body-xs text-amber-800">
              • {w.message}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          className="rounded-lg border border-border-default bg-surface px-3 py-1.5 text-body-sm font-semibold text-on-surface hover:bg-surface-container-low disabled:opacity-50"
          onClick={() => save("DRAFT")}
        >
          {apiMode ? "Lưu nháp (PROPOSED)" : "Lưu nháp (mock)"}
        </button>
        <button
          type="button"
          className="rounded-lg bg-primary px-3 py-1.5 text-body-sm font-semibold text-on-primary disabled:cursor-not-allowed disabled:opacity-50"
          disabled={busy || errors.length > 0 || draft.status !== "DRAFT"}
          onClick={() => save("CONFIRMED")}
        >
          {apiMode ? "Xác nhận chỉ tiêu" : "Xác nhận (mock)"}
        </button>
        <button
          type="button"
          disabled={busy}
          className="rounded-lg border border-border-default bg-surface px-3 py-1.5 text-body-sm font-semibold text-on-surface hover:bg-surface-container-low disabled:opacity-50"
          onClick={() => setDraft(emptyDraft(selectedMetric))}
        >
          Tạo mới
        </button>
      </div>

      {message && <div className="text-body-xs text-on-surface-variant">{message}</div>}

      <div className="overflow-x-auto rounded-lg border border-border-default">
        <table className="w-full min-w-[900px] border-collapse text-body-xs">
          <thead className="bg-surface-container-low text-left text-on-surface-variant">
            <tr>
              <th className="px-2 py-1.5">Chỉ tiêu</th>
              <th className="px-2 py-1.5">Loại</th>
              <th className="px-2 py-1.5">Kỳ</th>
              <th className="px-2 py-1.5 text-right">Giá trị</th>
              <th className="px-2 py-1.5">Nguồn</th>
              <th className="px-2 py-1.5">Trạng thái</th>
              <th className="px-2 py-1.5">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {targets.map((t) => {
              const metric = metrics.find((m) => m.id === t.metricId);
              const value = parseMetricInput(t.value);
              return (
                <tr key={t.id} className="border-t border-border-default/40">
                  <td className="px-2 py-1.5">
                    <div className="font-medium">{t.label}</div>
                    <div className="text-[10px] text-on-surface-variant">
                      {metric ? `${metric.code} — ${metric.name}` : t.metricId}
                    </div>
                  </td>
                  <td className="px-2 py-1.5">{t.labelCode || "—"}</td>
                  <td className="px-2 py-1.5">{periodLabel(t)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {value === null ? "—" : formatNumberVi(value, 2)} {metric?.unitLabel || ""}
                  </td>
                  <td className="max-w-[220px] truncate px-2 py-1.5" title={t.sourceNote}>
                    {t.sourceNote || "—"}
                  </td>
                  <td className="px-2 py-1.5">
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[t.status]}`}>
                      {TARGET_STATE_LABELS[t.status === "DRAFT" ? "DRAFT" : t.status === "CONFIRMED" ? "CONFIRMED" : t.status === "LOCKED" ? "LOCKED" : t.status === "VOID" ? "VOID" : "SUPERSEDED"]}
                    </span>
                    <span className="ml-1 text-[10px] text-on-surface-variant">{t.isOfficial ? "official" : "DEMO"}</span>
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex flex-wrap items-center gap-1">
                      {t.status !== "LOCKED" && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setDraft({ ...t })}
                          className="rounded border border-border-default px-1.5 py-0.5 text-[10px] font-semibold disabled:opacity-50"
                        >
                          Sửa
                        </button>
                      )}
                      {t.status === "DRAFT" && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => runAction("confirm", t)}
                          className="rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 disabled:opacity-50"
                        >
                          Xác nhận
                        </button>
                      )}
                      {t.status === "CONFIRMED" && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => runAction("lock", t)}
                          className="rounded border border-violet-300 bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800 disabled:opacity-50"
                        >
                          Chốt
                        </button>
                      )}
                      {t.status === "DRAFT" && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => runAction("void", t)}
                          className="rounded border border-rose-300 bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800 disabled:opacity-50"
                        >
                          Hủy
                        </button>
                      )}
                      {onHistory && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => runAction("history", t)}
                          className="rounded border border-border-default px-1.5 py-0.5 text-[10px] font-semibold disabled:opacity-50"
                        >
                          Lịch sử
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
    </section>
  );
}
