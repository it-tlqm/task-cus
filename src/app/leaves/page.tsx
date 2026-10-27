"use client";

import React, { useState, useEffect, useCallback } from "react";
import { toast } from "@/components/ui/Toast";
import { usePermissions } from "@/hooks/usePermissions";

const LEAVE_LABELS: Record<string, string> = {
  NGHI_PHEP: "Nghỉ phép",
  NGHI_BU: "Nghỉ bù",
  CONG_TAC: "Công tác",
  NGHI_CUOI_TUAN: "Nghỉ cuối tuần",
};

const STATUS_LABELS: Record<string, { text: string; cls: string }> = {
  PENDING: { text: "Chờ duyệt", cls: "bg-status-warning-bg text-status-warning" },
  APPROVED: { text: "Đã duyệt", cls: "bg-status-success-bg text-status-success" },
  REJECTED: { text: "Từ chối", cls: "bg-status-danger-bg text-status-danger" },
  CANCELED: { text: "Đã hủy", cls: "bg-v5-bg text-v5-muted" },
};

interface LeaveRow {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  reason: string;
  handoverNotes: string | null;
  status: string;
  reviewNotes: string | null;
  reviewedAt: string | null;
  person: { id: string; fullName: string };
  handoverTo: { id: string; fullName: string } | null;
}

/**
 * Đợt B v1 — Ai nghỉ vào báo trên hệ thống: phép/bù/công tác/cuối tuần,
 * lãnh đạo duyệt theo phạm vi, có người bàn giao. Chưa trừ hạn mức phép năm.
 */
export default function LeavesPage() {
  const [rows, setRows] = useState<LeaveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const { canApprove } = usePermissions();

  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fType, setFType] = useState("NGHI_PHEP");
  const [fStart, setFStart] = useState("");
  const [fEnd, setFEnd] = useState("");
  const [fReason, setFReason] = useState("");
  const [fHandoverId, setFHandoverId] = useState("");
  const [fHandoverNotes, setFHandoverNotes] = useState("");
  const [people, setPeople] = useState<Array<{ id: string; fullName: string }>>([]);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewing, setReviewing] = useState(false);

  const fetchLeaves = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/leaves?${params.toString()}`);
      const json = await res.json();
      if (res.ok) setRows(json.data || []);
      else toast.error(json.error || "Không thể tải danh sách nghỉ");
    } catch (err: any) {
      toast.error("Lỗi kết nối: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchLeaves(); }, [fetchLeaves]);
  useEffect(() => {
    fetch("/api/people?pageSize=100")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const list = Array.isArray(json) ? json : json?.data || [];
        setPeople(list.map((p: any) => ({ id: p.id, fullName: p.fullName })));
      })
      .catch(() => {});
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/leaves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: fType, startDate: fStart, endDate: fEnd, reason: fReason,
          handoverToId: fHandoverId || undefined, handoverNotes: fHandoverNotes,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(json.deduplicated ? "Đơn vừa được gửi (chặn gửi trùng)" : "Đã gửi đơn, chờ lãnh đạo duyệt!");
        setShowModal(false);
        setFReason(""); setFHandoverId(""); setFHandoverNotes("");
        fetchLeaves();
      } else {
        toast.error(json.error || "Không thể gửi đơn");
      }
    } catch (err: any) {
      toast.error("Lỗi: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReview = async (id: string, action: "APPROVE" | "REJECT") => {
    if (reviewing) return;
    if (action === "REJECT" && !reviewNotes.trim()) {
      toast.warning("Từ chối phải ghi rõ lý do");
      return;
    }
    setReviewing(true);
    try {
      const res = await fetch("/api/leaves", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, reviewNotes }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(json.message || "Đã xử lý đơn!");
        setReviewId(null);
        setReviewNotes("");
        fetchLeaves();
      } else {
        toast.error(json.error || "Không thể xử lý đơn");
      }
    } catch (err: any) {
      toast.error("Lỗi: " + err.message);
    } finally {
      setReviewing(false);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm("Hủy đơn nghỉ này?")) return;
    try {
      const res = await fetch("/api/leaves", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "CANCEL" }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) { toast.success("Đã hủy đơn."); fetchLeaves(); }
      else toast.error(json.error || "Không thể hủy đơn");
    } catch (err: any) {
      toast.error("Lỗi: " + err.message);
    }
  };

  const fmtDate = (iso: string) => {
    try { return new Date(iso).toLocaleDateString("vi-VN"); } catch { return iso; }
  };

  return (
    <div className="flex w-full flex-col gap-3 pb-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <span className="px-2 py-0.5 text-xs font-semibold rounded bg-v5-accent-soft text-v5-accent border border-v5-line">
            Nghỉ phép · Bù · Công tác
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-v5-ink mt-1">Quản lý nghỉ & công tác</h1>
          <p className="text-sm text-v5-muted">Ai nghỉ vào báo trên hệ thống — lãnh đạo duyệt theo phạm vi</p>
        </div>
        <button data-tour="add-btn" onClick={() => setShowModal(true)} className="px-4 py-2 rounded-lg bg-v5-accent text-white text-sm font-semibold hover:bg-v5-accent">
          + Báo nghỉ / công tác
        </button>
      </div>

      <div className="flex items-center gap-2 bg-v5-surface p-3 rounded-xl border border-v5-line shadow-sm">
        <label className="text-sm text-v5-muted">Trạng thái</label>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="h-10 px-2 rounded-lg bg-v5-bg border border-v5-line text-sm">
          <option value="">Tất cả</option>
          <option value="PENDING">Chờ duyệt</option>
          <option value="APPROVED">Đã duyệt</option>
          <option value="REJECTED">Từ chối</option>
          <option value="CANCELED">Đã hủy</option>
        </select>
      </div>

      <div data-tour="leave-list" className="flex flex-col gap-2">
        {loading && <p className="text-sm text-v5-muted text-center py-8">Đang tải...</p>}
        {!loading && rows.length === 0 && (
          <p className="text-sm text-v5-muted text-center py-8">Chưa có đơn nghỉ nào</p>
        )}
        {rows.map((r) => {
          const st = STATUS_LABELS[r.status] || STATUS_LABELS.PENDING;
          return (
            <div key={r.id} className="bg-v5-surface rounded-xl border border-v5-line shadow-sm p-3.5 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-bold text-v5-ink">{r.person.fullName} <span className="font-normal text-v5-muted">· {LEAVE_LABELS[r.type] || r.type}</span></div>
                  <div className="text-xs text-v5-muted mt-0.5">
                    {fmtDate(r.startDate)} → {fmtDate(r.endDate)} · Lý do: {r.reason}
                  </div>
                  {r.handoverTo && (
                    <div className="text-xs text-v5-accent mt-0.5">
                      Bàn giao: {r.handoverTo.fullName}{r.handoverNotes ? ` — ${r.handoverNotes}` : ""}
                    </div>
                  )}
                  {r.reviewNotes && <div className="text-xs text-v5-muted mt-0.5">Ý kiến lãnh đạo: {r.reviewNotes}</div>}
                </div>
                <span className={`px-2 py-0.5 rounded text-[11px] font-bold shrink-0 ${st.cls}`}>{st.text}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {r.status === "PENDING" && canApprove && (
                  <>
                    <button onClick={() => handleReview(r.id, "APPROVE")} disabled={reviewing}
                      className="h-10 px-4 rounded-lg bg-status-success text-white text-sm font-semibold disabled:opacity-50">
                      Duyệt
                    </button>
                    <button onClick={() => setReviewId(reviewId === r.id ? null : r.id)}
                      className="h-10 px-4 rounded-lg bg-v5-surface border border-v5-line text-sm font-semibold">
                      Từ chối
                    </button>
                  </>
                )}
                {r.status === "PENDING" && (
                  <button onClick={() => handleCancel(r.id)}
                    className="h-10 px-4 rounded-lg bg-v5-bg text-sm font-semibold">
                    Hủy đơn
                  </button>
                )}
              </div>
              {reviewId === r.id && (
                <div className="flex flex-col gap-2 pt-1">
                  <textarea rows={2} value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)}
                    placeholder="Nhập lý do từ chối..."
                    className="p-2.5 rounded-lg border border-v5-line text-sm" />
                  <button onClick={() => handleReview(r.id, "REJECT")} disabled={reviewing}
                    className="h-10 px-4 rounded-lg bg-status-danger text-white text-sm font-semibold disabled:opacity-50 self-start">
                    {reviewing ? "Đang xử lý..." : "Xác nhận từ chối"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-v5-surface rounded-xl shadow-2xl overflow-hidden">
            <div className="p-4 bg-v5-accent text-white flex items-center justify-between">
              <h3 className="font-semibold">Báo nghỉ / công tác</h3>
              <button onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSave}>
              <div className="p-4 flex flex-col gap-3 max-h-[70vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-v5-ink">Loại *</label>
                    <select value={fType} onChange={(e) => setFType(e.target.value)}
                      className="h-10 px-2 rounded-lg border border-v5-line text-sm">
                      {Object.entries(LEAVE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-v5-ink">Từ ngày *</label>
                    <input type="date" required value={fStart} onChange={(e) => setFStart(e.target.value)}
                      className="h-10 px-3 rounded-lg border border-v5-line text-sm" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-v5-ink">Đến ngày *</label>
                    <input type="date" required value={fEnd} onChange={(e) => setFEnd(e.target.value)}
                      className="h-10 px-3 rounded-lg border border-v5-line text-sm" />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-v5-ink">Lý do *</label>
                  <textarea rows={2} required value={fReason} onChange={(e) => setFReason(e.target.value)}
                    placeholder="Nhập lý do nghỉ, nội dung công tác..."
                    className="p-2.5 rounded-lg border border-v5-line text-sm" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-v5-ink">Người bàn giao (nếu có)</label>
                  <select value={fHandoverId} onChange={(e) => setFHandoverId(e.target.value)}
                    className="h-10 px-2 rounded-lg border border-v5-line text-sm">
                    <option value="">— Không bàn giao —</option>
                    {people.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-v5-ink">Nội dung bàn giao</label>
                  <input value={fHandoverNotes} onChange={(e) => setFHandoverNotes(e.target.value)}
                    placeholder="Nhập việc cần tiếp nhận khi vắng mặt..."
                    className="h-10 px-3 rounded-lg border border-v5-line text-sm" />
                </div>
                <p className="text-[11px] text-v5-muted">
                  Gửi xong lãnh đạo và người bàn giao đều nhận tin ngay. Đơn đang chờ thì tự hủy được.
                </p>
              </div>
              <div className="p-4 bg-v5-bg flex items-center justify-end gap-2 border-t">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg text-sm">Hủy</button>
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-v5-accent text-white text-sm font-semibold disabled:opacity-50">
                  {saving ? "Đang gửi..." : "Gửi đơn"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
