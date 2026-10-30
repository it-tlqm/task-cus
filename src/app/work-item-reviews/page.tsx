"use client";

import { V5Icon } from "@/components/v5/ui/lucide-icon";

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
  canDecide?: boolean;
  resultText?: string | null;
  completedDate?: string | null;
  submittedAt?: string | null;
  submitCount?: number | null;
  person: { id: string; code: string; fullName: string };
  period?: { id: string; title?: string | null } | null;
  product?: { id: string; code: string; taskName: string } | null;
  catalogEntry?: { id: string; code: string; title: string } | null;
  evidenceCount: number;
  reviewNote?: string | null;
  reviewedAt?: string | null;
  reviewedById?: string | null;
  reviewedBy?: { id: string; code: string; fullName: string } | null;
  products?: Array<{ id: string; code: string; taskName: string; factor: number | null; factorSnapshot: number | null; quantity: number | null; quantityUnit: string | null; reviewState: string | null }>;
  history?: Array<{ id: string; action: string; note: string | null; actor: { fullName: string }; createdAt: string }>;
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
  // P1: lịch sử phê duyệt — lãnh đạo tìm lại được hồ sơ đã xử lý.
  const [tab, setTab] = useState<"pending" | "confirmed" | "returned" | "all">("pending");
  const [staffFilter, setStaffFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [yearFilter, setYearFilter] = useState(String(new Date().getFullYear()));
  const [expanded, setExpanded] = useState<string | null>(null);
  const [lastDecided, setLastDecided] = useState<{ id: string; title: string; action: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [returning, setReturning] = useState<QueueItem | null>(null);
  const [returnNote, setReturnNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: tab });
      if (staffFilter) params.set("person", staffFilter);
      if (monthFilter) params.set("month", monthFilter);
      if (yearFilter) params.set("year", yearFilter);
      const res = await fetch("/api/personal-work-items/review-queue?" + params.toString(), {
        cache: "no-store",
      });
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
  }, [router, tab, staffFilter, monthFilter, yearFilter]);

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
      setLastDecided({ id: item.id, title: item.title, action });
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
          <h1 className="text-xl font-bold text-v5-ink">Công việc chờ bạn xác nhận</h1>
          <p className="text-xs text-v5-muted mt-1">
            Công việc cán bộ gửi lên kèm nội dung kết quả và ngày hoàn thành thực tế. Xác nhận thì
            kết quả được khóa; trả lại thì cán bộ sửa và gửi lại.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-v5-line bg-v5-surface hover:bg-v5-bg"
        >
          <V5Icon name="refresh" className="text-[16px]" />
          Tải lại
        </button>
      </header>

      {/* P1: các tab lịch sử phê duyệt */}
      <div className="flex flex-wrap items-center gap-1 border-b border-v5-line">
        {([
          ["pending", "Chờ xác nhận"],
          ["confirmed", "Đã xác nhận"],
          ["returned", "Đã trả lại"],
          ["all", "Tất cả / Lịch sử"],
        ] as const).map(([k, l]) => (
          <button
            key={k}
            type="button"
            data-testid={"review-tab-" + k}
            onClick={() => setTab(k)}
            className={"px-3 py-2 text-xs font-semibold rounded-t-lg " + (tab === k
              ? "bg-v5-bg text-v5-ink border border-b-0 border-v5-line"
              : "text-v5-muted hover:bg-v5-bg")}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          data-testid="review-staff-filter"
          value={staffFilter}
          onChange={(e) => setStaffFilter(e.target.value)}
          placeholder="Mã hoặc tên cán bộ (lọc)"
          className="h-9 rounded-lg border border-v5-line bg-v5-surface px-3 text-xs"
        />
        <input
          data-testid="review-month-filter"
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value.replace(/\D/g, "").slice(0, 2))}
          placeholder="Tháng (1-12)"
          className="h-9 w-28 rounded-lg border border-v5-line bg-v5-surface px-3 text-xs"
        />
        <input
          data-testid="review-year-filter"
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="Năm"
          className="h-9 w-24 rounded-lg border border-v5-line bg-v5-surface px-3 text-xs"
        />
        {(staffFilter || monthFilter || yearFilter) && (
          <button
            type="button"
            onClick={() => {
              setStaffFilter("");
              setMonthFilter("");
              setYearFilter("");
            }}
            className="text-[11px] font-semibold text-v5-accent hover:underline"
          >
            Xoá lọc
          </button>
        )}
      </div>
      {lastDecided && (
        <div
          data-testid="review-last-decided"
          className="rounded-lg border border-v5-success/30 bg-v5-success-soft px-3 py-2 text-xs text-v5-ink"
        >
          <b>{lastDecided.action === "CONFIRM" ? "Đã xác nhận" : "Đã trả lại"}</b> hồ sơ “{lastDecided.title}”.{" "}
          <button
            type="button"
            onClick={() => setExpanded(lastDecided.id)}
            className="font-semibold text-v5-accent hover:underline"
          >
            Xem hồ sơ vừa xử lý
          </button>
        </div>
      )}
      {loading || permLoading ? (
        <div className="rounded-xl border border-v5-line bg-v5-surface p-6 text-sm text-v5-muted">
          Đang tải danh sách công việc…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-v5-line bg-v5-surface p-8 text-center">
          <V5Icon name="task_alt" className="text-[32px] text-v5-muted" />
          <p className="mt-2 text-sm font-semibold text-v5-ink">
            {tab === "pending"
              ? "Không có công việc nào đang chờ bạn xác nhận"
              : tab === "confirmed"
                ? "Chưa có hồ sơ nào đã xác nhận"
                : tab === "returned"
                  ? "Chưa có hồ sơ nào bị trả lại"
                  : "Chưa có lịch sử xử lý"}
          </p>
          <p className="mt-1 text-xs text-v5-muted">
            {tab === "pending"
              ? "Khi cán bộ gửi công việc lên, hồ sơ sẽ xuất hiện tại đây."
              : "Lịch sử chỉ hiển thị hồ sơ bạn có quyền xem hoặc đã trực tiếp xử lý."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map((it) => (
            <article
              key={it.id}
              data-testid={`review-item-${it.id}`}
              className="rounded-xl border border-v5-line bg-v5-surface p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-v5-ink truncate">{it.title}</p>
                  <p className="text-xs text-v5-muted mt-0.5">
                    {it.person.fullName} ·{" "}
                    {it.catalogEntry?.code || it.product?.code || "Công việc tự ghi nhận"} · gửi lúc{" "}
                    {fmtTime(it.submittedAt)}
                    {it.submitCount && it.submitCount > 1 ? ` (lần ${it.submitCount})` : ""}
                  </p>
                </div>
                {it.reviewState === "CONFIRMED" ? (
                  <span
                    data-testid={"review-badge-" + it.id}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold border border-v5-success/30 bg-v5-success-soft text-v5-success"
                  >
                    <V5Icon name="verified" className="text-[14px]" />
                    Đã xác nhận
                  </span>
                ) : it.reviewState === "RETURNED" ? (
                  <span
                    data-testid={"review-badge-" + it.id}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold border border-v5-danger/30 bg-v5-danger-soft text-v5-danger"
                  >
                    <V5Icon name="undo" className="text-[14px]" />
                    Đã trả lại
                  </span>
                ) : (
                  <span
                    data-testid={"review-badge-" + it.id}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold border border-v5-gold/30 bg-v5-gold-soft text-v5-gold-ink"
                  >
                    <V5Icon name="hourglass_top" className="text-[14px]" />
                    Chờ xác nhận
                  </span>
                )}
              </div>
              {(it.reviewState === "CONFIRMED" || it.reviewState === "RETURNED") && it.reviewedBy && (
                <p className="text-[11px] text-v5-muted mt-1">
                  Người xử lý: <b className="text-v5-ink">{it.reviewedBy.fullName}</b>
                  {it.reviewedAt ? ` · ${fmtTime(it.reviewedAt)}` : ""}
                  {it.reviewNote ? ` · Lý do: ${it.reviewNote}` : ""}
                </p>
              )}

              <div className="mt-3 rounded-lg bg-v5-bg p-3">
                <p className="text-[11px] font-semibold text-v5-muted mb-1">
                  Nội dung kết quả công việc
                </p>
                <p className="text-sm text-v5-ink whitespace-pre-wrap">
                  {it.resultText || "(không có nội dung)"}
                </p>
                <p className="text-[11px] text-v5-muted mt-2">
                  Ngày hoàn thành thực tế: <b>{fmtDate(it.completedDate)}</b> · Minh chứng đính kèm:{" "}
                  <b>{it.evidenceCount}</b> tệp
                </p>
              </div>

              {/* P1: lịch sử gửi → trả lại → gửi lại → xác nhận */}
              <button
                type="button"
                data-testid={"review-history-toggle-" + it.id}
                onClick={() => setExpanded(expanded === it.id ? null : it.id)}
                className="text-[11px] font-semibold text-v5-accent hover:underline"
              >
                {expanded === it.id ? "Ẩn lịch sử xử lý" : "Xem lịch sử xử lý"}
              </button>
              {expanded === it.id && (
                <div
                  data-testid={"review-history-" + it.id}
                  className="mt-1 rounded-lg border border-v5-line bg-v5-bg p-2 space-y-1"
                >
                  {(it.history || []).map((h) => (
                    <div key={h.id} className="text-[11px] text-v5-ink">
                      <b>
                        {h.action === "SUBMITTED"
                          ? "Gửi lãnh đạo"
                          : h.action === "RETURNED"
                            ? "Bị trả lại"
                            : h.action === "CONFIRMED"
                              ? "Đã xác nhận"
                              : h.action === "SP_CONFIRMED"
                                ? "Xác nhận sản phẩm"
                                : h.action === "SP_REJECTED"
                                  ? "Từ chối sản phẩm"
                                  : h.action}
                      </b>{" "}
                      — {h.actor?.fullName || "—"}
                      {h.note ? " · " + h.note : ""}
                    </div>
                  ))}
                  {(it.history || []).length === 0 && (
                    <div className="text-[11px] text-v5-muted">Chưa có thao tác xử lý nào.</div>
                  )}
                </div>
              )}

              <WorkItemProductsPanel workItemId={it.id} canPropose={false} />

              {it.reviewState === "SUBMITTED" && it.canDecide !== false ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    data-testid={`review-confirm-${it.id}`}
                    disabled={busyId === it.id}
                    onClick={() => decide(it, "CONFIRM")}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-v5-success bg-v5-success text-white hover:opacity-90 disabled:opacity-50"
                  >
                    <V5Icon name="verified" className="text-[16px]" />
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
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-v5-line bg-v5-surface hover:bg-v5-bg disabled:opacity-50"
                  >
                    <V5Icon name="assignment_return" className="text-[16px]" />
                    Trả lại để chỉnh sửa
                  </button>
                </div>
              ) : (
                <div className="mt-3 rounded-lg bg-v5-bg px-3 py-2 text-[11px] text-v5-muted">
                  {it.reviewState === "CONFIRMED"
                    ? "Hồ sơ đã được xác nhận — chỉ xem lịch sử, không còn thao tác duyệt."
                    : it.reviewState === "RETURNED"
                      ? "Hồ sơ đã bị trả lại — cán bộ cần chỉnh sửa và gửi lại trước khi xác nhận."
                      : "Bạn không có thẩm quyền xử lý hồ sơ này."}
                </div>
              )}
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
            className="w-full max-w-lg bg-v5-surface rounded-2xl shadow-xl border border-v5-line p-5"
          >
            <h3 className="text-base font-bold text-v5-ink mb-1">Trả lại công việc</h3>
            <p className="text-xs text-v5-muted mb-4">{returning.title}</p>
            <label className="block text-xs font-semibold text-v5-ink mb-1">
              Lý do trả lại <span className="text-v5-danger">*</span>
            </label>
            <textarea
              data-testid="review-return-note"
              value={returnNote}
              onChange={(e) => setReturnNote(e.target.value)}
              rows={4}
              placeholder="Nêu rõ nội dung cần chỉnh sửa"
              className="w-full rounded-lg border border-v5-line bg-v5-surface px-3 py-2 text-sm text-v5-ink focus:outline-none focus:border-v5-accent"
            />
            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setReturning(null)}
                className="px-4 py-2 rounded-lg text-xs font-semibold border border-v5-line bg-v5-bg text-v5-ink hover:bg-v5-bg"
              >
                Huỷ
              </button>
              <button
                type="button"
                data-testid="review-return-confirm"
                disabled={busyId === returning.id}
                onClick={() => decide(returning, "RETURN", returnNote)}
                className="px-4 py-2 rounded-lg text-xs font-semibold border border-v5-danger bg-v5-danger text-white hover:opacity-90 disabled:opacity-50"
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
