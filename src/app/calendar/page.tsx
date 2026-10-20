"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { toast } from "@/components/ui/Toast";

interface CalTask {
  id: string;
  code: string;
  title: string;
  status: string;
  currentDeadline: string;
  owner?: { fullName: string } | null;
}

interface CalLeave {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  status: string;
  person: { fullName: string };
}

const LEAVE_LABELS: Record<string, string> = {
  NGHI_PHEP: "Nghỉ phép",
  NGHI_BU: "Nghỉ bù",
  CONG_TAC: "Công tác",
  NGHI_CUOI_TUAN: "Nghỉ cuối tuần",
};

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/**
 * Lịch chung đơn vị (chỉ đọc): hạn nhiệm vụ + đơn nghỉ đã duyệt theo phạm vi
 * phân quyền hiện có. Lãnh đạo nhìn 1 màn hình biết ai vắng, việc nào sắp hạn.
 */
export default function CalendarPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [tasks, setTasks] = useState<CalTask[]>([]);
  const [leaves, setLeaves] = useState<CalLeave[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(dayKey(now));

  const fetchData = useCallback(async (y: number, m: number) => {
    setLoading(true);
    try {
      const from = new Date(y, m, 1).toISOString();
      const to = new Date(y, m + 1, 1).toISOString();
      const [tRes, lRes] = await Promise.all([
        fetch(`/api/tasks?deadlineFrom=${encodeURIComponent(from)}&deadlineTo=${encodeURIComponent(to)}&pageSize=100`),
        fetch("/api/leaves"),
      ]);
      const tJson = await tRes.json().catch(() => ({}));
      const lJson = await lRes.json().catch(() => ({}));
      if (tRes.ok) setTasks(tJson.data || []);
      if (lRes.ok) {
        setLeaves(
          (lJson.data || []).filter(
            (l: CalLeave) => l.status === "APPROVED" && new Date(l.endDate) >= new Date(y, m, 1) && new Date(l.startDate) < new Date(y, m + 1, 1)
          )
        );
      }
    } catch (err: any) {
      toast.error("Lỗi tải lịch: " + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(year, month); }, [fetchData, year, month]);

  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<Date | null> = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const tasksOn = (d: Date) => {
    const k = dayKey(d);
    return tasks.filter((t) => {
      const dl = new Date(t.currentDeadline);
      return !isNaN(dl.getTime()) && dayKey(dl) === k;
    });
  };
  const leavesOn = (d: Date) => {
    return leaves.filter((l) => {
      const s = new Date(l.startDate); s.setHours(0, 0, 0, 0);
      const e = new Date(l.endDate); e.setHours(23, 59, 59, 999);
      return d >= s && d <= e;
    });
  };

  const selDate = selectedDay
    ? (() => { const [y, m, dd] = selectedDay.split("-").map(Number); return new Date(y, m, dd); })()
    : null;
  const selTasks = selDate ? tasksOn(selDate) : [];
  const selLeaves = selDate ? leavesOn(selDate) : [];
  const isToday = (d: Date) => dayKey(d) === dayKey(new Date());

  return (
    <div className="flex flex-col w-full p-4 lg:p-6 space-y-4 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <span className="px-2 py-0.5 text-xs font-semibold rounded bg-teal-100 text-teal-900 border border-teal-200">
            Lịch chung (chỉ xem)
          </span>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">Lịch công tác đơn vị</h1>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => { const d = new Date(year, month - 1, 1); setYear(d.getFullYear()); setMonth(d.getMonth()); }}
            className="w-9 h-9 rounded-lg bg-white border border-slate-300 text-lg">‹</button>
          <span className="px-2 text-sm font-bold min-w-[110px] text-center">Tháng {month + 1}/{year}</span>
          <button
            onClick={() => { const d = new Date(year, month + 1, 1); setYear(d.getFullYear()); setMonth(d.getMonth()); }}
            className="w-9 h-9 rounded-lg bg-white border border-slate-300 text-lg">›</button>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" /> Hạn nhiệm vụ</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> Nghỉ đã duyệt</span>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500 text-center py-8">Đang tải lịch...</p>
      ) : (
        <div data-tour="month-grid" className="bg-white rounded-xl border border-slate-200 shadow-sm p-2">
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-slate-500 pb-1">
            {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((d) => <span key={d}>{d}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (!d) return <span key={i} />;
              const t = tasksOn(d);
              const l = leavesOn(d);
              const sel = selectedDay === dayKey(d);
              return (
                <button
                  key={i}
                  onClick={() => setSelectedDay(dayKey(d))}
                  className={`min-h-[52px] rounded-lg border text-left p-1 flex flex-col justify-between transition-all ${
                    sel ? "border-teal-700 bg-teal-50 ring-1 ring-teal-600" : "border-slate-100 hover:border-slate-300"
                  } ${isToday(d) ? "font-bold" : ""}`}
                >
                  <span className={`text-xs ${isToday(d) ? "w-5 h-5 rounded-full bg-teal-800 text-white flex items-center justify-center" : "text-slate-700"}`}>
                    {d.getDate()}
                  </span>
                  <span className="flex gap-0.5 flex-wrap">
                    {t.length > 0 && <span className="text-[10px] px-1 rounded bg-blue-100 text-blue-800 font-bold">{t.length} việc</span>}
                    {l.length > 0 && <span className="text-[10px] px-1 rounded bg-amber-100 text-amber-800 font-bold">{l.length} nghỉ</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {selDate && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col gap-2">
          <h2 className="font-bold text-slate-900" suppressHydrationWarning>
            {selDate.toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "numeric" })}
          </h2>
          {selLeaves.map((l) => (
            <div key={l.id} className="text-sm p-2 rounded-lg bg-amber-50 border border-amber-200">
              <strong>{l.person.fullName}</strong> — {LEAVE_LABELS[l.type] || l.type}
              <span className="text-slate-500"> ({new Date(l.startDate).toLocaleDateString("vi-VN")} → {new Date(l.endDate).toLocaleDateString("vi-VN")})</span>
            </div>
          ))}
          {selTasks.map((t) => (
            <Link key={t.id} href={`/tasks/${t.id}`} className="text-sm p-2 rounded-lg bg-blue-50 border border-blue-200 block hover:bg-blue-100">
              <span className="font-mono text-xs font-bold text-blue-900">{t.code}</span>
              <span className="font-semibold"> {t.title}</span>
              <span className="block text-xs text-slate-500">{t.owner?.fullName || ""} · {t.status === "COMPLETED" ? "Đã xong" : "Chưa xong"}</span>
            </Link>
          ))}
          {selTasks.length === 0 && selLeaves.length === 0 && (
            <p className="text-sm text-slate-400">Không có việc đến hạn hay lịch nghỉ trong ngày này.</p>
          )}
        </div>
      )}
    </div>
  );
}
