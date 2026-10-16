"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { toast } from "@/components/ui/Toast";
import { usePermissions } from "@/hooks/usePermissions";

interface MeetingRow {
  id: string;
  title: string;
  meetingAt: string;
  chair: string | null;
  conclusionsCount?: number;
  _count?: { conclusions: number };
  convertedCount?: number;
}

/** Biên bản giao ban — họp xong nhập kết luận, bấm là thành việc, khỏi nhập lại. */
export default function MeetingsPage() {
  const [rows, setRows] = useState<MeetingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { canApprove } = usePermissions();
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fTitle, setFTitle] = useState("");
  const [fDate, setFDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [fChair, setFChair] = useState("");

  const fetchMeetings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/meetings");
      const json = await res.json();
      if (res.ok) setRows(json.data || []);
      else toast.error(json.error || "Không thể tải biên bản");
    } catch (err: any) {
      toast.error("Lỗi kết nối: " + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMeetings(); }, [fetchMeetings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || !fTitle.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: fTitle.trim(), meetingAt: fDate, chair: fChair }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("Đã lập biên bản!");
        setShowModal(false);
        setFTitle(""); setFChair("");
        fetchMeetings();
      } else {
        toast.error(json.error || "Không thể lập biên bản");
      }
    } catch (err: any) {
      toast.error("Lỗi: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col w-full p-4 lg:p-6 space-y-4 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <span className="px-2 py-0.5 text-xs font-semibold rounded bg-teal-100 text-teal-900 border border-teal-200">
            Họp → Việc
          </span>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">Biên bản giao ban</h1>
          <p className="text-sm text-slate-600">Nhập kết luận họp, bấm chuyển là thành nhiệm vụ — không nhập lại</p>
        </div>
        {canApprove && (
          <button onClick={() => setShowModal(true)} className="px-4 py-2 rounded-lg bg-teal-800 text-white text-sm font-semibold hover:bg-teal-700">
            + Lập biên bản
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500 text-center py-8">Đang tải...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-8">Chưa có biên bản giao ban nào</p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((m) => {
            const total = m._count?.conclusions ?? m.conclusionsCount ?? 0;
            return (
              <Link key={m.id} href={`/meetings/${m.id}`}
                className="bg-white rounded-xl border border-slate-200 shadow-sm p-3.5 block hover:border-teal-400">
                <div className="font-bold text-slate-900">{m.title}</div>
                <div className="text-xs text-slate-500 mt-1">
                  {new Date(m.meetingAt).toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })}
                  {m.chair ? ` · Chủ trì: ${m.chair}` : ""}
                </div>
                <div className="text-xs mt-1 font-semibold text-teal-800">
                  {total} kết luận · {m.convertedCount || 0} đã thành việc
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden">
            <div className="p-4 bg-teal-900 text-white flex items-center justify-between">
              <h3 className="font-semibold">Lập biên bản giao ban</h3>
              <button onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSave}>
              <div className="p-4 flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-700">Tiêu đề *</label>
                  <input required value={fTitle} onChange={(e) => setFTitle(e.target.value)}
                    placeholder="Giao ban tuần 42..."
                    className="h-10 px-3 rounded-lg border border-slate-300 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-700">Ngày họp *</label>
                    <input type="date" required value={fDate} onChange={(e) => setFDate(e.target.value)}
                      className="h-10 px-3 rounded-lg border border-slate-300 text-sm" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-700">Chủ trì</label>
                    <input value={fChair} onChange={(e) => setFChair(e.target.value)}
                      placeholder="Nhập tên chủ trì..."
                      className="h-10 px-3 rounded-lg border border-slate-300 text-sm" />
                  </div>
                </div>
              </div>
              <div className="p-4 bg-slate-50 flex items-center justify-end gap-2 border-t">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg text-sm">Hủy</button>
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-teal-800 text-white text-sm font-semibold disabled:opacity-50">
                  {saving ? "Đang lưu..." : "Lập biên bản"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
