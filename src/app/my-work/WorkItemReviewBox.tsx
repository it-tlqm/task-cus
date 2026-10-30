"use client";

import { V5Icon } from "@/components/v5/ui/lucide-icon";

/**
 * WorkItemReviewBox — V3.0.1 (phía cán bộ)
 * Nút báo hoàn thành & gửi lãnh đạo trực tiếp + nhãn trạng thái hồ sơ.
 * Không hiển thị thuật ngữ kỹ thuật; mọi kiểm tra quyền vẫn thực hiện ở máy chủ.
 */
import { useState } from "react";
import { toast } from "@/components/ui/Toast";

export type ReviewStateUi = "DRAFT" | "SUBMITTED" | "RETURNED" | "CONFIRMED";

const STATE_META: Record<
  ReviewStateUi,
  { label: string; cls: string; icon: string }
> = {
  DRAFT: {
    label: "Chưa gửi lãnh đạo",
    cls: "bg-v5-bg text-v5-muted border-v5-line",
    icon: "edit_note",
  },
  SUBMITTED: {
    label: "Đã gửi — chờ lãnh đạo xác nhận",
    cls: "bg-v5-gold-soft text-v5-gold-ink border-v5-gold/30",
    icon: "hourglass_top",
  },
  RETURNED: {
    label: "Lãnh đạo trả lại — cần chỉnh sửa và gửi lại",
    cls: "bg-v5-danger-soft text-v5-danger border-v5-danger/30",
    icon: "assignment_return",
  },
  CONFIRMED: {
    label: "Đã được lãnh đạo xác nhận",
    cls: "bg-v5-success-soft text-v5-success border-v5-success/30",
    icon: "verified",
  },
};

function todayInput(): string {
  // Ngày theo giờ Việt Nam (không lệch múi giờ máy)
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parts;
}

export default function WorkItemReviewBox({
  item,
  onChanged,
}: {
  item: {
    id: string;
    title: string;
    taskId?: string | null;
    reviewState?: string | null;
    resultText?: string | null;
    reviewNote?: string | null;
    submitCount?: number | null;
    submittedAt?: string | null;
    completedDate?: string | null;
    catalogEntryId?: string | null;
    productItemId?: string | null;
    assignedQty?: number | null;
    completedQty?: number | null;
    quantityUnit?: string | null;
  };
  onChanged?: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [resultText, setResultText] = useState(item.resultText || "");
  const [completedOn, setCompletedOn] = useState(
    item.completedDate ? String(item.completedDate).slice(0, 10) : todayInput()
  );
  const [completedQty, setCompletedQty] = useState(
    item.completedQty != null
      ? String(item.completedQty)
      : item.assignedQty != null
        ? String(item.assignedQty)
        : ""
  );
  const hasSource = !!(item.catalogEntryId || item.productItemId);
  const [busy, setBusy] = useState(false);

  const state = (item.reviewState || "DRAFT") as ReviewStateUi;
  const meta = STATE_META[state] || STATE_META.DRAFT;
  // Công việc đã gắn nhiệm vụ thì do quy trình của nhiệm vụ xử lý (không tạo 2 luồng).
  const handledByTask = !!item.taskId;
  const canSubmit = !handledByTask && (state === "DRAFT" || state === "RETURNED");

  const submit = async () => {
    if (resultText.trim().length < 5) {
      toast.error("Vui lòng nhập nội dung kết quả công việc.");
      return;
    }
    if (!completedOn) {
      toast.error("Vui lòng chọn ngày hoàn thành thực tế.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/personal-work-items/${item.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "SUBMIT",
          resultText,
          completedOn,
          ...(hasSource
            ? {
                completedQty:
                  completedQty === "" ? null : Number(completedQty),
              }
            : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error || "Không gửi được lên lãnh đạo.");
        return;
      }
      toast.success("Đã gửi lãnh đạo xác nhận. Công việc được khóa chỉnh sửa khi chờ xác nhận.");
      setOpen(false);
      await onChanged?.();
    } catch {
      toast.error("Không gửi được lên lãnh đạo. Vui lòng thử lại.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* Nhãn trạng thái hồ sơ */}
      {state !== "DRAFT" && (
        <span
          data-testid={`work-item-review-state-${item.id}`}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${meta.cls}`}
        >
          <V5Icon name={meta.icon} className="text-[16px]" />
          {meta.label}
        </span>
      )}

      {/* Lý do lãnh đạo trả lại */}
      {state === "RETURNED" && item.reviewNote && (
        <span
          data-testid={`work-item-review-note-${item.id}`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-v5-danger/30 bg-v5-danger-soft text-v5-danger max-w-full"
          title={item.reviewNote}
        >
          <V5Icon name="feedback" className="text-[16px]" />
          Lãnh đạo trả lại: {item.reviewNote}
        </span>
      )}

      {/* Nút gửi lãnh đạo */}
      {canSubmit && (
        <button
          type="button"
          data-testid={`work-item-submit-review-${item.id}`}
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-v5-accent bg-v5-accent text-white hover:opacity-90 active-press"
        >
          <V5Icon name="send" className="text-[16px]" />
          {state === "RETURNED" ? "Sửa kết quả & gửi lại" : "Báo hoàn thành & gửi lãnh đạo"}
        </button>
      )}

      {handledByTask && state === "DRAFT" && (
        <span
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-v5-line bg-v5-bg text-v5-muted"
          title="Công việc này đã gắn với một nhiệm vụ nên được duyệt theo quy trình của nhiệm vụ."
        >
          <V5Icon name="info" className="text-[16px]" />
          Thuộc quy trình duyệt của nhiệm vụ
        </span>
      )}

      {/* Hộp thoại báo hoàn thành & gửi lãnh đạo */}
      {open && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
          <div
            data-testid={`work-item-submit-modal-${item.id}`}
            className="w-full max-w-xl bg-v5-surface rounded-2xl shadow-sm border border-v5-line p-5 max-h-[90vh] overflow-y-auto"
          >
            <h3 className="text-base font-bold text-v5-ink mb-1">Báo hoàn thành công việc</h3>
            <p className="text-xs text-v5-muted mb-4">{item.title}</p>

            <label className="block text-xs font-semibold text-v5-ink mb-1">
              Nội dung kết quả công việc <span className="text-v5-danger">*</span>
            </label>
            <textarea
              data-testid={`work-item-result-text-${item.id}`}
              value={resultText}
              onChange={(e) => setResultText(e.target.value)}
              rows={5}
              placeholder="Mô tả kết quả đã đạt được của công việc"
              className="w-full rounded-lg border border-v5-line bg-v5-surface px-3 py-2 text-sm text-v5-ink focus:outline-none focus:border-v5-accent"
            />
            <p className="text-[11px] text-v5-muted mt-1">
              Bắt buộc có nội dung kết quả để lãnh đạo xem xét.
            </p>

            {hasSource && (
              <div className="mt-4">
                <label className="block text-xs font-semibold text-v5-ink mb-1">
                  Số lượng hoàn thành <span className="text-v5-danger">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={completedQty}
                    onChange={(e) => setCompletedQty(e.target.value)}
                    placeholder="Nhập số thực tế..."
                    className="h-9 w-full rounded-lg border border-v5-line bg-v5-surface px-3 text-right text-sm tabular-nums text-v5-ink focus:outline-none focus:border-v5-accent"
                  />
                  <span className="shrink-0 text-xs text-v5-muted">
                    {item.quantityUnit || "—"}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-v5-muted">
                  SL giao: {item.assignedQty ?? "—"} {item.quantityUnit || ""}. Số liệu này đi thẳng
                  vào KQ tháng.
                </p>
              </div>
            )}

            <label className="block text-xs font-semibold text-v5-ink mt-4 mb-1">
              Ngày hoàn thành thực tế <span className="text-v5-danger">*</span>
            </label>
            <input
              data-testid={`work-item-completed-on-${item.id}`}
              type="date"
              value={completedOn}
              onChange={(e) => setCompletedOn(e.target.value)}
              className="w-full rounded-lg border border-v5-line bg-v5-surface px-3 py-2 text-sm text-v5-ink focus:outline-none focus:border-v5-accent"
            />

            <p className="text-[11px] text-v5-muted mt-3">
              Minh chứng (tệp đính kèm) là linh hoạt — bạn có thể tải lên ở mục “Kết quả &amp; minh
              chứng” trước khi gửi. Sau khi gửi, bộ minh chứng được giữ nguyên trong lúc chờ xác
              nhận.
            </p>

            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold border border-v5-line bg-v5-bg text-v5-ink hover:bg-v5-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v5-muted/40 focus-visible:ring-offset-1 active-press disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v5-muted/40 focus-visible:ring-offset-1 active-press disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Huỷ
              </button>
              <button
                type="button"
                data-testid={`work-item-submit-confirm-${item.id}`}
                disabled={busy}
                onClick={submit}
                className="px-4 py-2 rounded-lg text-xs font-semibold border border-v5-accent bg-v5-accent text-white hover:bg-v5-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v5-muted/40 focus-visible:ring-offset-1 active-press disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy ? "Đang gửi…" : "Gửi lãnh đạo xác nhận"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
