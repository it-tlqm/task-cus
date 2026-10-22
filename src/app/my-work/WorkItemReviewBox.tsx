"use client";

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
    cls: "bg-surface-container text-on-surface-variant border-border-subtle",
    icon: "edit_note",
  },
  SUBMITTED: {
    label: "Đã gửi — chờ lãnh đạo xác nhận",
    cls: "bg-status-warning-bg text-status-warning border-status-warning/30",
    icon: "hourglass_top",
  },
  RETURNED: {
    label: "Lãnh đạo trả lại — cần chỉnh sửa và gửi lại",
    cls: "bg-status-danger-bg text-status-danger border-status-danger/30",
    icon: "assignment_return",
  },
  CONFIRMED: {
    label: "Đã được lãnh đạo xác nhận",
    cls: "bg-status-success-bg text-status-success border-status-success/30",
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
  };
  onChanged?: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [resultText, setResultText] = useState(item.resultText || "");
  const [completedOn, setCompletedOn] = useState(
    item.completedDate ? String(item.completedDate).slice(0, 10) : todayInput()
  );
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
        body: JSON.stringify({ action: "SUBMIT", resultText, completedOn }),
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
          <span className="material-symbols-outlined text-[16px]">{meta.icon}</span>
          {meta.label}
        </span>
      )}

      {/* Lý do lãnh đạo trả lại */}
      {state === "RETURNED" && item.reviewNote && (
        <span
          data-testid={`work-item-review-note-${item.id}`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-status-danger/30 bg-status-danger-bg text-status-danger max-w-full"
          title={item.reviewNote}
        >
          <span className="material-symbols-outlined text-[16px]">feedback</span>
          Lãnh đạo trả lại: {item.reviewNote}
        </span>
      )}

      {/* Nút gửi lãnh đạo */}
      {canSubmit && (
        <button
          type="button"
          data-testid={`work-item-submit-review-${item.id}`}
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-status-primary bg-status-primary text-on-primary hover:opacity-90 active-press"
        >
          <span className="material-symbols-outlined text-[16px]">send</span>
          {state === "RETURNED" ? "Sửa kết quả & gửi lại" : "Báo hoàn thành & gửi lãnh đạo"}
        </button>
      )}

      {handledByTask && state === "DRAFT" && (
        <span
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border-subtle bg-surface-container text-on-surface-variant"
          title="Công việc này đã gắn với một nhiệm vụ nên được duyệt theo quy trình của nhiệm vụ."
        >
          <span className="material-symbols-outlined text-[16px]">info</span>
          Thuộc quy trình duyệt của nhiệm vụ
        </span>
      )}

      {/* Hộp thoại báo hoàn thành & gửi lãnh đạo */}
      {open && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
          <div
            data-testid={`work-item-submit-modal-${item.id}`}
            className="w-full max-w-xl bg-surface-container-lowest rounded-2xl shadow-xl border border-border-subtle p-5 max-h-[90vh] overflow-y-auto"
          >
            <h3 className="text-base font-bold text-on-surface mb-1">Báo hoàn thành công việc</h3>
            <p className="text-xs text-on-surface-variant mb-4">{item.title}</p>

            <label className="block text-xs font-semibold text-on-surface mb-1">
              Nội dung kết quả công việc <span className="text-status-danger">*</span>
            </label>
            <textarea
              data-testid={`work-item-result-text-${item.id}`}
              value={resultText}
              onChange={(e) => setResultText(e.target.value)}
              rows={5}
              placeholder="Mô tả kết quả đã đạt được của công việc"
              className="w-full rounded-lg border border-border-default bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-status-primary"
            />
            <p className="text-[11px] text-on-surface-variant mt-1">
              Bắt buộc có nội dung kết quả để lãnh đạo xem xét.
            </p>

            <label className="block text-xs font-semibold text-on-surface mt-4 mb-1">
              Ngày hoàn thành thực tế <span className="text-status-danger">*</span>
            </label>
            <input
              data-testid={`work-item-completed-on-${item.id}`}
              type="date"
              value={completedOn}
              onChange={(e) => setCompletedOn(e.target.value)}
              className="w-full rounded-lg border border-border-default bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-status-primary"
            />

            <p className="text-[11px] text-on-surface-variant mt-3">
              Minh chứng (tệp đính kèm) là linh hoạt — bạn có thể tải lên ở mục “Kết quả &amp; minh
              chứng” trước khi gửi. Sau khi gửi, bộ minh chứng được giữ nguyên trong lúc chờ xác
              nhận.
            </p>

            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold border border-border-default bg-surface-container text-on-surface hover:bg-surface-container-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-surface/40 focus-visible:ring-offset-1 active-press disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-surface/40 focus-visible:ring-offset-1 active-press disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Huỷ
              </button>
              <button
                type="button"
                data-testid={`work-item-submit-confirm-${item.id}`}
                disabled={busy}
                onClick={submit}
                className="px-4 py-2 rounded-lg text-xs font-semibold border border-status-primary bg-status-primary text-on-primary hover:bg-status-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-surface/40 focus-visible:ring-offset-1 active-press disabled:opacity-50 disabled:cursor-not-allowed"
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
