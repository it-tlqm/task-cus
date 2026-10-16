"use client";

import React, { useState, useEffect, useCallback } from "react";
import { toast } from "@/components/ui/Toast";
import { usePermissions } from "@/hooks/usePermissions";

const SHIFT_LABELS: Record<string, string> = { SANG: "Sáng", CHIEU: "Chiều", CA_NGAY: "Cả ngày" };

interface RosterRow {
  id: string;
  date: string;
  shift: string;
  post: string | null;
  notes: string | null;
  person: { id: string; fullName: string };
  unit: { id: string; name: string } | null;
  leaveClash: { type: string } | null;
}

/**
 * Lịch trực ca — gọn cho end user: xem theo tuần, lãnh đạo xếp/sửa/xóa,
 * tự cảnh báo khi người trực có đơn nghỉ đã duyệt trùng ngày.
 */
export default function RosterPage() {
  const monday = (() => {
    const n = new Date();
    const d = (n.getDay() + 6) % 7;
    n.setDate(n.getDate() - d);
    n.setHours(0, 0, 0, 0);
    return n;
  })();
  const [weekStart, setWeekStart] = useState(monday);
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { canApprove } = usePermissions();

  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fDate, setFDate] = useState("");
  const [fShift, setFShift] = useState("CA_NGAY");
  const [fPost, setFPost] = useState("");
  const [fPersonId, setFPersonId] = useState("");
  const [fNotes, setFNotes] = useState("");
  const [people, setPeople] = useState<Array<{ id: string; fullName: string }>>([]);

  const toISODate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const fetchWeek = useCallback(async (start: Date) => {
    setLoading(true);
    try {
      const from = toISODate(start);
      const end = new Date(start); end.setDate(end.getDate() + 6);
      const res = await fetch(`/api/rosters?from=${from}&to=${toISODate(end)}`);
      const json = await res.json();
      if (res.ok) setRows(json.data || []);
      else toast.error(json.error || "Không thể tải lịch trực");
    } catch (err: any) {
      toast.error("Lỗi kết nối: " + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchWeek(weekStart); }, [fetchWeek, weekStart]);
  useEffect(() => {
    fetch("/api/people?pageSize=100")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const list = Array.isArray(json) ? json : json?.data || [];
        setPeople(list.map((p: any) => ({ id: p.id, fullName: p.fullName })));
      })
      .catch(() => {});
  }, []);

  const openAdd = (dayISO: string) => {
    setFDate(dayISO); setFShift("CA_NGAY"); setFPost(""); setFPersonId(""); setFNotes("");
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || !fDate || !fPersonId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/rosters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: fDate, shift: fShift, post: fPost, personId: fPersonId, notes: fNotes }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("Đã xếp lịch trực!");
        if (json.warning) toast.warning(json.warning);
        setShowModal(false);
        fetchWeek(weekStart);
      } else {
        toast.error(json.error || "Không thể xếp lịch");
      }
    } catch (err: any) {
      toast.error("Lỗi: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Xóa ${name} khỏi lịch trực?`)) return;
    try {
      const res = await fetch(`/api/rosters?id=${id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (res.ok) { toast.success("Đã xóa."); fetchWeek(weekStart); }
      else toast.error(json.error || "Không thể xóa");
    } catch (err: any) {
      toast.error("Lỗi: " + err.message);
    }
  };

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
  const rowsOn = (d: Date) => {
    const k = toISODate(d);
    // So sánh theo ngày địa phương (tránh lệch múi giờ UTC)
    return rows.filter((r) => toISODate(new Date(r.date)) === k);
  };

  return (
    <div className="flex flex-col w-full p-4 lg:p-6 space-y-4 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <span className="px-2 py-0.5 text-xs font-semibold rounded bg-teal-100 text-teal-900 border border-teal-200">
            Phân công trực
          </span>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">Lịch trực ca</h1>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d); }}
            className="w-9 h-9 rounded-lg bg-white border border-slate-300 text-lg">‹</button>
          <span className="px-1 text-xs font-bold text-center">Tuần {weekStart.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}</span>
          <button onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d); }}
            className="w-9 h-9 rounded-lg bg-white border border-slate-300 text-lg">›</button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500 text-center py-8">Đang tải lịch trực...</p>
      ) : (
        <div data-tour="week-list" className="flex flex-col gap-2">
          {days.map((d) => {
            const list = rowsOn(d);
            const isToday = toISODate(d) === toISODate(new Date());
            return (
              <div key={toISODate(d)} className={`bg-white rounded-xl border shadow-sm p-3 ${isToday ? "border-teal-600 ring-1 ring-teal-600" : "border-slate-200"}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-sm text-slate-900">
                    {d.toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit" })}
                    {isToday && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-teal-800 text-white">HÔM NAY</span>}
                  </span>
                  {canApprove && (
                    <button onClick={() => openAdd(toISODate(d))} className="text-xs font-bold text-teal-800 px-2 py-1 rounded bg-teal-50">
                      + Xếp trực
                    </button>
                  )}
                </div>
                {list.length === 0 && <p className="text-xs text-slate-400">Chưa phân trực.</p>}
                {list.map((r) => (
                  <div key={r.id} className="flex items-center justify-between py-1.5 border-t border-slate-100">
                    <div className="text-sm">
                      <strong>{r.person.fullName}</strong>
                      <span className="text-slate-500"> · {SHIFT_LABELS[r.shift] || r.shift}{r.post ? ` · ${r.post}` : ""}</span>
                      {r.leaveClash && (
                        <span className="ml-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[11px] font-bold">
                          Trùng nghỉ đã duyệt!
                        </span>
                      )}
                    </div>
                    {canApprove && (
                      <button onClick={() => handleDelete(r.id, r.person.fullName)} className="text-xs text-rose-600 px-2 py-1">
                        Xóa
                      </button>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden">
            <div className="p-4 bg-teal-900 text-white flex items-center justify-between">
              <h3 className="font-semibold">Xếp lịch trực</h3>
              <button onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSave}>
              <div className="p-4 flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-700">Ngày *</label>
                    <input type="date" required value={fDate} onChange={(e) => setFDate(e.target.value)}
                      className="h-10 px-3 rounded-lg border border-slate-300 text-sm" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-700">Ca *</label>
                    <select value={fShift} onChange={(e) => setFShift(e.target.value)}
                      className="h-10 px-2 rounded-lg border border-slate-300 text-sm">
                      <option value="CA_NGAY">Cả ngày</option>
                      <option value="SANG">Sáng</option>
                      <option value="CHIEU">Chiều</option>
                    </select>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-700">Người trực *</label>
                  <select value={fPersonId} onChange={(e) => setFPersonId(e.target.value)}
                    className="h-10 px-2 rounded-lg border border-slate-300 text-sm">
                    <option value="">— Chọn cán bộ —</option>
                    {people.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-700">Điểm trực</label>
                  <input value={fPost} onChange={(e) => setFPost(e.target.value)}
                    placeholder="Barie, kho bãi, quầy thủ tục..."
                    className="h-10 px-3 rounded-lg border border-slate-300 text-sm" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-700">Ghi chú</label>
                  <input value={fNotes} onChange={(e) => setFNotes(e.target.value)}
                    placeholder="Ghi chú thêm..."
                    className="h-10 px-3 rounded-lg border border-slate-300 text-sm" />
                </div>
                <p className="text-[11px] text-slate-500">
                  Nếu người này có đơn nghỉ đã duyệt trùng ngày, hệ thống sẽ báo ngay sau khi lưu để đổi ca.
                </p>
              </div>
              <div className="p-4 bg-slate-50 flex items-center justify-end gap-2 border-t">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg text-sm">Hủy</button>
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-teal-800 text-white text-sm font-semibold disabled:opacity-50">
                  {saving ? "Đang lưu..." : "Lưu lịch trực"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
