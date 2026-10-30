"use client";

import React, { useEffect, useMemo, useState } from "react";
import { V5Icon } from "@/components/v5/ui/icon";
import { toast } from "@/components/ui/Toast";

export interface CompletionSourceLine {
  key: string;
  kind: "TX" | "QD1277";
  code: string;
  title: string;
  assignedQty: number | null;
  quantityUnit: string | null;
  factor: number | null;
}

interface Props {
  open: boolean;
  title: string;
  sources: CompletionSourceLine[];
  initialCompletedQty?: number | null;
  initialCompletedDate?: string;
  initialResultText?: string;
  initialEvidence?: string;
  onClose: () => void;
  onSubmit: (payload: {
    completedQty: number | null;
    completedDate: string;
    resultText: string;
    evidence: string;
  }) => Promise<void>;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/**
 * Cửa duy nhất để báo hoàn thành. Bắt buộc nhập số lượng hoàn thành khi có
 * nguồn TX/QĐ1277 để KQ tháng có dữ liệu, không phải nhập lại sau.
 */
export function TaskCompletionModal({
  open,
  title,
  sources,
  initialCompletedQty,
  initialCompletedDate,
  initialResultText,
  initialEvidence,
  onClose,
  onSubmit,
}: Props) {
  const defaultQty = useMemo(() => {
    if (initialCompletedQty != null) return String(initialCompletedQty);
    const total = sources.reduce((sum, s) => sum + (s.assignedQty || 0), 0);
    return total > 0 ? String(total) : sources.length === 0 ? "1" : "";
  }, [initialCompletedQty, sources]);

  const [completedQty, setCompletedQty] = useState(defaultQty);
  const [completedDate, setCompletedDate] = useState(initialCompletedDate || today());
  const [resultText, setResultText] = useState(initialResultText || "");
  const [evidence, setEvidence] = useState(initialEvidence || "");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCompletedQty(defaultQty);
    setCompletedDate(initialCompletedDate || today());
    setResultText(initialResultText || "");
    setEvidence(initialEvidence || "");
    setSubmitting(false);
  }, [open, defaultQty, initialCompletedDate, initialResultText, initialEvidence]);

  const hasSource = sources.length > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!completedDate) {
      toast.warning("Chọn ngày hoàn thành.");
      return;
    }
    if (hasSource && completedQty.trim() === "") {
      toast.warning("Nhập số lượng hoàn thành cho nguồn TX/QĐ1277.");
      return;
    }
    const qty =
      completedQty.trim() === "" ? null : Number(completedQty);
    if (qty !== null && (!Number.isFinite(qty) || qty < 0)) {
      toast.warning("Số lượng hoàn thành không hợp lệ.");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        completedQty: qty,
        completedDate,
        resultText: resultText.trim(),
        evidence: evidence.trim(),
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-space-md">
      <div className="w-full max-w-lg bg-v5-surface rounded-xl shadow-xl overflow-hidden flex flex-col border border-v5-line">
        <div className="flex items-center justify-between gap-3 border-b border-v5-line bg-v5-surface px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-v5-success-soft text-v5-success">
              <V5Icon name="task_alt" className="text-[20px]" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-v5-ink">Xác nhận hoàn thành</h3>
              <p className="mt-0.5 line-clamp-1 text-[11px] text-v5-muted">{title}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-v5-muted transition-colors hover:bg-v5-bg hover:text-v5-ink"
            aria-label="Đóng"
          >
            <V5Icon name="close" className="text-[20px]" />
          </button>
        </div>

        <form onSubmit={submit}>
          <div className="p-4 flex flex-col gap-3 max-h-[70vh] overflow-y-auto">
            {hasSource && (
              <div className="overflow-hidden rounded-lg border border-v5-line">
                <table className="w-full table-fixed text-[11px]">
                  <thead className="bg-v5-bg text-v5-muted">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-semibold">Nguồn</th>
                      <th className="w-[80px] px-2 py-1.5 text-right font-semibold">SL giao</th>
                      <th className="w-[90px] px-2 py-1.5 text-left font-semibold">ĐVT</th>
                      <th className="w-[48px] px-2 py-1.5 text-right font-semibold">Hệ số</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sources.map((s) => (
                      <tr key={s.key} className="border-t border-v5-line/60 align-top">
                        <td className="px-2 py-1.5">
                          <div
                            className={`font-mono text-[10px] font-semibold ${
                              s.kind === "TX" ? "text-teal-700" : "text-indigo-700"
                            }`}
                          >
                            {s.kind === "TX" ? "TX" : "QĐ1277"} · {s.code}
                          </div>
                          <div className="line-clamp-2 text-v5-ink">{s.title}</div>
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-v5-ink">
                          {s.assignedQty ?? "—"}
                        </td>
                        <td className="px-2 py-1.5 text-v5-ink">{s.quantityUnit || "—"}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-v5-ink">
                          {s.factor ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-v5-ink">
                  Số lượng hoàn thành {hasSource ? "*" : ""}
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={completedQty}
                  onChange={(e) => setCompletedQty(e.target.value)}
                  placeholder={hasSource ? "Nhập số thực tế..." : "Mặc định 1 việc"}
                  className="h-9 rounded-lg border border-v5-line bg-v5-surface px-3 text-right text-[12px] tabular-nums text-v5-ink focus:outline-none focus:ring-2 focus:ring-v5-accent/10"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-v5-ink">Ngày hoàn thành *</label>
                <input
                  type="date"
                  value={completedDate}
                  onChange={(e) => setCompletedDate(e.target.value)}
                  className="h-9 rounded-lg border border-v5-line bg-v5-surface px-2 text-[12px] text-v5-ink focus:outline-none focus:ring-2 focus:ring-v5-accent/10"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-v5-ink">Kết quả thực tế</label>
              <textarea
                rows={2}
                value={resultText}
                onChange={(e) => setResultText(e.target.value)}
                placeholder="Mô tả ngắn kết quả đã thực hiện..."
                className="rounded-lg border border-v5-line bg-v5-surface p-2.5 text-[12px] text-v5-ink focus:outline-none focus:ring-2 focus:ring-v5-accent/10 resize-none"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-v5-ink">
                Minh chứng / số hiệu văn bản
              </label>
              <input
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
                placeholder="Số hiệu văn bản, hồ sơ liên quan..."
                className="h-9 rounded-lg border border-v5-line bg-v5-surface px-3 text-[12px] text-v5-ink focus:outline-none focus:ring-2 focus:ring-v5-accent/10"
              />
            </div>

            <p className="text-[10px] text-v5-muted">
              Số liệu này được đưa thẳng vào KQ tháng. Không cần nhập lại ở trang Kết quả tháng.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-v5-line bg-v5-bg px-4 py-3">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-lg border border-v5-line bg-v5-surface px-4 text-[12px] font-semibold text-v5-ink hover:bg-v5-bg transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="h-9 rounded-lg bg-v5-success px-4 text-[12px] font-semibold text-white hover:bg-v5-success/90 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            >
              {submitting ? "Đang lưu..." : "Xác nhận hoàn thành"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
