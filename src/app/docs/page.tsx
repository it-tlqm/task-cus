"use client";

import React, { useState, useEffect, useCallback } from "react";
import { vnDateToDeadlineIso } from "@/lib/datetime";
import Link from "next/link";
import { toast } from "@/components/ui/Toast";
import { usePermissions } from "@/hooks/usePermissions";

interface DocRow {
  id: string;
  direction: string;
  number: string;
  title: string;
  fromTo: string | null;
  docDate: string | null;
  deadline: string | null;
  status: string;
  notes: string | null;
  taskId: string | null;
  handler: { id: string; fullName: string } | null;
  task: { id: string; code: string; status: string } | null;
}

const STATUS_LABELS: Record<string, { text: string; cls: string }> = {
  DANG_XU_LY: { text: "Đang xử lý", cls: "bg-status-warning-bg text-status-warning" },
  HOAN_THANH: { text: "Xong", cls: "bg-status-success-bg text-status-success" },
  LUU_TRU: { text: "Lưu", cls: "bg-v5-bg text-v5-muted" },
};

/** Sổ văn bản đến/đi gọn: tra số hiệu, ai đang giữ, hạn nào — chuyển thành việc khi cần. */
export default function DocsPage() {
  const [rows, setRows] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [direction, setDirection] = useState("");
  const [search, setSearch] = useState("");
  const { canApprove } = usePermissions();

  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fDirection, setFDirection] = useState("DEN");
  const [fNumber, setFNumber] = useState("");
  const [fTitle, setFTitle] = useState("");
  const [fFromTo, setFFromTo] = useState("");
  const [fDocDate, setFDocDate] = useState("");
  const [fHandlerId, setFHandlerId] = useState("");
  const [fDeadline, setFDeadline] = useState("");
  const [fNotes, setFNotes] = useState("");
  const [people, setPeople] = useState<Array<{ id: string; fullName: string }>>([]);
  const [convertingId, setConvertingId] = useState<string | null>(null);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (direction) params.set("direction", direction);
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/docs?${params.toString()}`);
      const json = await res.json();
      if (res.ok) setRows(json.data || []);
      else toast.error(json.error || "Không thể tải sổ văn bản");
    } catch (err: any) {
      toast.error("Lỗi kết nối: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [direction, search]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);
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
      const res = await fetch("/api/docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction: fDirection, number: fNumber, title: fTitle, fromTo: fFromTo,
          docDate: fDocDate || undefined, handlerId: fHandlerId || undefined,
          deadline: fDeadline ? vnDateToDeadlineIso(fDeadline) : undefined, notes: fNotes,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(json.deduplicated ? "Văn bản vừa được ghi (chặn ghi trùng)" : "Đã vào sổ văn bản!");
        setShowModal(false);
        setFNumber(""); setFTitle(""); setFFromTo(""); setFDocDate("");
        setFHandlerId(""); setFDeadline(""); setFNotes("");
        fetchDocs();
      } else {
        toast.error(json.error || "Không thể ghi sổ");
      }
    } catch (err: any) {
      toast.error("Lỗi: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleStatus = async (id: string, status: string) => {
    try {
      const res = await fetch("/api/docs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "status", status }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) { toast.success("Đã cập nhật!"); fetchDocs(); }
      else toast.error(json.error || "Không thể cập nhật");
    } catch (err: any) {
      toast.error("Lỗi: " + err.message);
    }
  };

  const handleConvert = async (id: string) => {
    if (convertingId) return;
    setConvertingId(id);
    try {
      const res = await fetch("/api/docs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "convert" }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(json.message || "Đã chuyển thành nhiệm vụ!");
        fetchDocs();
      } else {
        toast.error(json.error || "Không thể chuyển");
      }
    } catch (err: any) {
      toast.error("Lỗi: " + err.message);
    } finally {
      setConvertingId(null);
    }
  };

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchDocs();
  };

  return (
    <div className="flex w-full flex-col gap-3 pb-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <span className="px-2 py-0.5 text-xs font-semibold rounded bg-v5-accent-soft text-v5-accent border border-v5-line">
            Văn bản đến · đi
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-v5-ink mt-1">Sổ văn bản</h1>
          <p className="text-sm text-v5-muted">Tra số hiệu, ai đang giữ, hạn nào — cần thì chuyển thành việc</p>
        </div>
        <button data-tour="add-btn" onClick={() => setShowModal(true)} className="px-4 py-2 rounded-lg bg-v5-accent text-white text-sm font-semibold hover:bg-v5-accent">
          + Vào sổ văn bản
        </button>
      </div>

      <form onSubmit={onSearch} className="flex flex-col md:flex-row gap-2 bg-v5-surface p-3 rounded-xl border border-v5-line shadow-sm">
        <div className="flex gap-1">
          {["", "DEN", "DI"].map((d) => (
            <button key={d} type="button" onClick={() => setDirection(d)}
              className={`h-10 px-4 rounded-lg text-sm font-semibold ${direction === d ? "bg-v5-accent text-white" : "bg-v5-bg text-v5-muted"}`}>
              {d === "" ? "Tất cả" : d === "DEN" ? "Đến" : "Đi"}
            </button>
          ))}
        </div>
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm số hiệu, trích yếu, nơi gửi..."
          className="flex-1 h-10 px-3 rounded-lg bg-v5-bg border border-v5-line text-sm" />
        <button type="submit" className="h-10 px-5 rounded-lg bg-v5-accent text-white text-sm font-semibold">Tìm</button>
      </form>

      {loading ? (
        <p className="text-sm text-v5-muted text-center py-8">Đang tải...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-v5-muted text-center py-8">Chưa có văn bản nào</p>
      ) : (
        <div data-tour="doc-list" className="flex flex-col gap-2">
          {rows.map((r) => {
            const st = STATUS_LABELS[r.status] || STATUS_LABELS.DANG_XU_LY;
            const overdue = r.deadline && r.status === "DANG_XU_LY" && new Date(r.deadline) < new Date();
            return (
              <div key={r.id} className="bg-v5-surface rounded-xl border border-v5-line shadow-sm p-3.5 flex flex-col gap-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded mr-1.5 ${r.direction === "DEN" ? "bg-v5-accent-soft text-v5-accent" : "bg-purple-100 text-purple-800"}`}>
                      {r.direction === "DEN" ? "ĐẾN" : "ĐI"}
                    </span>
                    <span className="font-mono text-xs font-bold text-v5-ink">{r.number}</span>
                    <div className="font-semibold text-v5-ink text-sm mt-0.5">{r.title}</div>
                    <div className="text-xs text-v5-muted mt-0.5">
                      {r.fromTo || ""}{r.docDate ? ` · ${new Date(r.docDate).toLocaleDateString("vi-VN")}` : ""}
                      {r.handler ? ` · Giữ: ${r.handler.fullName}` : ""}
                      {r.deadline && (
                        <span className={overdue ? "text-v5-danger font-bold" : ""}>
                          {` · Hạn: ${new Date(r.deadline).toLocaleDateString("vi-VN")}${overdue ? " (TRỄ!)" : ""}`}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[11px] font-bold shrink-0 ${st.cls}`}>{st.text}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {r.status === "DANG_XU_LY" && (
                    <button onClick={() => handleStatus(r.id, "HOAN_THANH")}
                      className="h-9 px-3 rounded-lg bg-v5-accent-soft border border-v5-line text-v5-accent text-xs font-bold">
                      Xong
                    </button>
                  )}
                  {r.status !== "LUU_TRU" && (
                    <button onClick={() => handleStatus(r.id, "LUU_TRU")}
                      className="h-9 px-3 rounded-lg bg-v5-bg text-xs font-semibold">
                      Lưu trữ
                    </button>
                  )}
                  {r.task ? (
                    <Link href={`/tasks/${r.task.id}`}
                      className="h-9 px-3 rounded-lg bg-v5-accent-soft border border-v5-line text-v5-accent text-xs font-bold flex items-center">
                      Việc [{r.task.code}] ›
                    </Link>
                  ) : canApprove ? (
                    <button onClick={() => handleConvert(r.id)} disabled={convertingId === r.id}
                      className="h-9 px-3 rounded-lg bg-secondary text-on-secondary text-xs font-bold disabled:opacity-50">
                      {convertingId === r.id ? "Đang chuyển..." : "Chuyển thành việc"}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-v5-surface rounded-xl shadow-2xl overflow-hidden">
            <div className="p-4 bg-v5-accent text-white flex items-center justify-between">
              <h3 className="font-semibold">Vào sổ văn bản</h3>
              <button onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSave}>
              <div className="p-4 flex flex-col gap-3 max-h-[70vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-v5-ink">Sổ *</label>
                    <select value={fDirection} onChange={(e) => setFDirection(e.target.value)}
                      className="h-10 px-2 rounded-lg border border-v5-line text-sm">
                      <option value="DEN">Văn bản đến</option>
                      <option value="DI">Văn bản đi</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-v5-ink">Số hiệu *</label>
                    <input required value={fNumber} onChange={(e) => setFNumber(e.target.value)}
                      placeholder="123/HQTL..."
                      className="h-10 px-3 rounded-lg border border-v5-line text-sm" />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-v5-ink">Trích yếu *</label>
                  <input required value={fTitle} onChange={(e) => setFTitle(e.target.value)}
                    placeholder="Nhập trích yếu văn bản..."
                    className="h-10 px-3 rounded-lg border border-v5-line text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-v5-ink">Nơi gửi/nhận</label>
                    <input value={fFromTo} onChange={(e) => setFFromTo(e.target.value)}
                      placeholder="Nhập đơn vị gửi/nhận..."
                      className="h-10 px-3 rounded-lg border border-v5-line text-sm" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-v5-ink">Ngày văn bản</label>
                    <input type="date" value={fDocDate} onChange={(e) => setFDocDate(e.target.value)}
                      className="h-10 px-3 rounded-lg border border-v5-line text-sm" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-v5-ink">Người xử lý</label>
                    <select value={fHandlerId} onChange={(e) => setFHandlerId(e.target.value)}
                      className="h-10 px-2 rounded-lg border border-v5-line text-sm">
                      <option value="">— Chưa phân —</option>
                      {people.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-v5-ink">Hạn xử lý</label>
                    <input type="date" value={fDeadline} onChange={(e) => setFDeadline(e.target.value)}
                      className="h-10 px-3 rounded-lg border border-v5-line text-sm" />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-v5-ink">Ghi chú</label>
                  <input value={fNotes} onChange={(e) => setFNotes(e.target.value)}
                    className="h-10 px-3 rounded-lg border border-v5-line text-sm" />
                </div>
              </div>
              <div className="p-4 bg-v5-bg flex items-center justify-end gap-2 border-t">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg text-sm">Hủy</button>
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-v5-accent text-white text-sm font-semibold disabled:opacity-50">
                  {saving ? "Đang ghi..." : "Ghi vào sổ"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
