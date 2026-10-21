"use client";

/**
 * /work-item-reviews — V3.0.1 (phía lãnh đạo)
 * Danh sách công việc cán bộ gửi lên chờ xác nhận; lãnh đạo xác nhận hoặc trả lại.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/Toast";
import { usePermissions } from "@/hooks/usePermissions";
import WorkItemProductsPanel from "@/app/my-work/WorkItemProductsPanel";
import EvidenceAdjustmentsPanel from "@/app/my-work/EvidenceAdjustmentsPanel";

interface QueueItem {
  id: string;
  title: string;
  reviewState: string;
  resultText?: string | null;
  completedDate?: string | null;
  submittedAt?: string | null;
  submitCount?: number | null;
  person: { id: string; code: string; fullName: string };
  period?: { id: string; title?: string | null } | null;
  product?: { id: string; code: string; taskName: string } | null;
  catalogEntry?: { id: string; code: string; title: string } | null;
  evidenceCount: number;
}

function fmtDate(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

function fmtTime(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export default function WorkItemReviewsPage() {
  const router = useRouter();
  const { user, loading: permLoading } = usePermissions();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [returning, setReturning] = useState<QueueItem | null>(null);
  const [returnNote, setReturnNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/personal-work-items/review-queue");
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (res.ok) setItems(json.data || []);
    } catch {
      /* im lặng — hiển thị trạng thái rỗng */
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (item: QueueItem, action: "CONFIRM" | "RETURN", note?: string) => {
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/personal-work-items/${item.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: note || "" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error || "Không xử lý được hồ sơ.");
        return;
      }
      toast.success(
        action === "CONFIRM"
          ? "Đã xác nhận công việc và khóa kết quả."
          : "Đã trả lại công việc để cán bộ chỉnh sửa."
      );
      setReturning(null);
      setReturnNote("");
      await load();
    } catch {
      toast.error("Không xử lý được hồ sơ. Vui lòng thử lại.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="p-4 md:p-6 space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-on-surface">Công việc chờ bạn xác nhận</h1>
          <p className="text-xs text-on-surface-variant mt-1">
            Công việc cán bộ gửi lên kèm nội dung kết quả và ngày hoàn thành thực tế. Xác nhận thì
            kết quả được khóa; trả lại thì cán bộ sửa và gửi lại.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border-default bg-surface-container-lowest hover:bg-surface-container"
        >
          <span className="material-symbols-outlined text-[16px]">refresh</span>
          Tải lại
        </button>
      </header>

      {loading || permLoading ? (
        <div className="rounded-xl border border-border-subtle bg-surface-container-lowest p-6 text-sm text-on-surface-variant">
          Đang tải danh sách công việc…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-border-subtle bg-surface-container-lowest p-8 text-center">
          <span className="material-symbols-outlined text-[32px] text-on-surface-variant">task_alt</span>
          <p className="mt-2 text-sm font-semibold text-on-surface">
            Không có công việc nào đang chờ bạn xác nhận
          </p>
          <p className="mt-1 text-xs text-on-surface-variant">
            Khi cán bộ gửi công việc lên, hồ sơ sẽ xuất hiện tại đây.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map((it) => (
            <article
              key={it.id}
              data-testid={`review-item-${it.id}`}
              className="rounded-xl border border-border-subtle bg-surface-container-lowest p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-on-surface truncate">{it.title}</p>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    {it.person.fullName} ·{" "}
                    {it.catalogEntry?.code || it.product?.code || "Công việc tự ghi nhận"} · gửi lúc{" "}
                    {fmtTime(it.submittedAt)}
                    {it.submitCount && it.submitCount > 1 ? ` (lần ${it.submitCount})` : ""}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold border border-status-warning/30 bg-status-warning-bg text-status-warning">
                  <span className="material-symbols-outlined text-[14px]">hourglass_top</span>
                  Chờ xác nhận
                </span>
              </div>

              <div className="mt-3 rounded-lg bg-surface-container p-3">
                <p className="text-[11px] font-semibold text-on-surface-variant mb-1">
                  Nội dung kết quả công việc
                </p>
                <p className="text-sm text-on-surface whitespace-pre-wrap">
                  {it.resultText || "(không có nội dung)"}
                </p>
                <p className="text-[11px] text-on-surface-variant mt-2">
                  Ngày hoàn thành thực tế: <b>{fmtDate(it.completedDate)}</b> · Minh chứng đính kèm:{" "}
                  <b>{it.evidenceCount}</b> tệp
                </p>
              </div>

              <WorkItemProductsPanel workItemId={it.id} canPropose={false} />

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  data-testid={`review-confirm-${it.id}`}
                  disabled={busyId === it.id}
                  onClick={() => decide(it, "CONFIRM")}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-status-success bg-status-success text-on-error hover:opacity-90 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[16px]">verified</span>
                  Xác nhận hoàn thành
                </button>
                <button
                  type="button"
                  data-testid={`review-return-${it.id}`}
                  disabled={busyId === it.id}
                  onClick={() => {
                    setReturning(it);
                    setReturnNote("");
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border-default bg-surface-container-lowest hover:bg-surface-container disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[16px]">assignment_return</span>
                  Trả lại để chỉnh sửa
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Đề nghị điều chỉnh minh chứng chờ xử lý (R3-C) */}
      <EvidenceAdjustmentsPanel mode="leader" />

      {/* Hộp thoại trả lại — bắt buộc ghi rõ lý do */}
      {returning && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
          <div
            data-testid="review-return-modal"
            className="w-full max-w-lg bg-surface-container-lowest rounded-2xl shadow-xl border border-border-subtle p-5"
          >
            <h3 className="text-base font-bold text-on-surface mb-1">Trả lại công việc</h3>
            <p className="text-xs text-on-surface-variant mb-4">{returning.title}</p>
            <label className="block text-xs font-semibold text-on-surface mb-1">
              Lý do trả lại <span className="text-status-danger">*</span>
            </label>
            <textarea
              data-testid="review-return-note"
              value={returnNote}
              onChange={(e) => setReturnNote(e.target.value)}
              rows={4}
              placeholder="Nêu rõ nội dung cần chỉnh sửa"
              className="w-full rounded-lg border border-border-default bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-status-primary"
            />
            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setReturning(null)}
                className="px-4 py-2 rounded-lg text-xs font-semibold border border-border-default bg-surface-container text-on-surface hover:bg-surface-container-low"
              >
                Huỷ
              </button>
              <button
                type="button"
                data-testid="review-return-confirm"
                disabled={busyId === returning.id}
                onClick={() => decide(returning, "RETURN", returnNote)}
                className="px-4 py-2 rounded-lg text-xs font-semibold border border-status-danger bg-status-danger text-on-error hover:opacity-90 disabled:opacity-50"
              >
                Trả lại
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
