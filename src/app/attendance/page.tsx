"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Handshake,
  Info,
  Loader2,
  Save,
} from "lucide-react";
import { toast } from "@/components/ui/Toast";
import { usePermissions } from "@/hooks/usePermissions";

interface AttendancePerson {
  id: string;
  code: string;
  fullName: string;
  positionTitle?: string;
}

interface AttendanceEntry {
  id: string;
  personId: string;
  date: string;
  symbol: string;
  note?: string | null;
}

interface AttendanceGrade {
  personId: string;
  grade: string;
  reason?: string | null;
}

interface AttendanceHandover {
  id: string;
  date: string;
  fromPersonId: string;
  toPersonId: string;
  note?: string | null;
}

interface AttendanceData {
  unit: { id: string; name: string; code?: string };
  month: number;
  year: number;
  sheet: { id: string; status: string } | null;
  people: AttendancePerson[];
  entries: AttendanceEntry[];
  grades: AttendanceGrade[];
  handovers: AttendanceHandover[];
  canEdit: boolean;
}

const SYMBOLS = ["X", "1/2", "P", "KP", "CT", "OFF"] as const;
const SYMBOL_LABEL: Record<string, string> = {
  X: "Có mặt",
  "1/2": "Nửa ngày",
  P: "Phép",
  KP: "Không phép",
  CT: "Công tác",
  OFF: "Nghỉ",
};

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function dayLabel(year: number, month: number, day: number) {
  const d = new Date(year, month - 1, day);
  return ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][d.getDay()];
}

export default function AttendancePage() {
  const { user, canApprove, loading: userLoading } = usePermissions();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState<AttendanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [handoverFrom, setHandoverFrom] = useState("");
  const [handoverTo, setHandoverTo] = useState("");
  const [handoverNote, setHandoverNote] = useState("");
  const [handoverBusy, setHandoverBusy] = useState(false);

  const canEdit = !!data?.canEdit;

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        month: String(month),
        year: String(year),
        ...(user.unitId ? { unitId: user.unitId } : {}),
      });
      const res = await fetch(`/api/attendance?${params.toString()}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Không tải được bảng chấm công");
      setData(json);
    } catch (err: any) {
      toast.error(err.message || "Không tải được bảng chấm công");
    } finally {
      setLoading(false);
    }
  }, [month, year, user]);

  useEffect(() => {
    if (!userLoading) load();
  }, [load, userLoading]);

  const entryMap = useMemo(() => {
    const map = new Map<string, AttendanceEntry>();
    for (const entry of data?.entries || []) map.set(`${entry.personId}|${entry.date}`, entry);
    return map;
  }, [data]);

  const gradeMap = useMemo(() => {
    const map = new Map<string, AttendanceGrade>();
    for (const grade of data?.grades || []) map.set(grade.personId, grade);
    return map;
  }, [data]);

  const today = isoDate(now);
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = isoDate(tomorrowDate);
  const todayHandover = data?.handovers.find((h) => h.date === today);
  const tomorrowHandover = data?.handovers.find((h) => h.date === tomorrow);

  useEffect(() => {
    if (!data?.people.length) return;
    setHandoverFrom(todayHandover?.fromPersonId || data.people[0]?.id || "");
    setHandoverTo(tomorrowHandover?.toPersonId || data.people[1]?.id || data.people[0]?.id || "");
    setHandoverNote(todayHandover?.note || "");
  }, [data?.people, todayHandover?.fromPersonId, todayHandover?.note, tomorrowHandover?.toPersonId]);

  const mark = async (personId: string, date: string, current: string) => {
    if (!canEdit || !data) return;
    const index = SYMBOLS.indexOf(current as any);
    const next = index === -1 ? "X" : index === SYMBOLS.length - 1 ? "" : SYMBOLS[index + 1];
    const key = `${personId}|${date}`;
    setSavingCell(key);
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "mark",
          unitId: data.unit.id,
          month,
          year,
          personId,
          date,
          symbol: next,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Không lưu được chấm công");
      await load();
    } catch (err: any) {
      toast.error(err.message || "Không lưu được chấm công");
    } finally {
      setSavingCell(null);
    }
  };

  const saveGrade = async (personId: string, grade: string, reason: string) => {
    if (!canEdit || !data) return;
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "grade",
          unitId: data.unit.id,
          month,
          year,
          personId,
          grade,
          reason,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Không lưu được xếp loại");
      await load();
    } catch (err: any) {
      toast.error(err.message || "Không lưu được xếp loại");
    }
  };

  const saveHandover = async () => {
    if (!canEdit || !data) return;
    if (!handoverFrom || !handoverTo) {
      toast.warning("Chọn người bàn giao và người nhận bàn giao");
      return;
    }
    setHandoverBusy(true);
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "handover",
          unitId: data.unit.id,
          month,
          year,
          date: today,
          fromPersonId: handoverFrom,
          toPersonId: handoverTo,
          note: handoverNote,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Không lưu được bàn giao");
      toast.success("Đã lưu bàn giao người trực");
      await load();
    } catch (err: any) {
      toast.error(err.message || "Không lưu được bàn giao");
    } finally {
      setHandoverBusy(false);
    }
  };

  const exportCsv = () => {
    if (!data) return;
    const days = daysInMonth(year, month);
    const header = ["STT", "Họ và tên", ...Array.from({ length: days }, (_, i) => `${i + 1} (${dayLabel(year, month, i + 1)})`), "TS ngày công", "Xếp loại", "Lý do"];
    const rows = data.people.map((person, index) => {
      let total = 0;
      const cells = Array.from({ length: days }, (_, i) => {
        const date = `${year}-${String(month).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
        const symbol = entryMap.get(`${person.id}|${date}`)?.symbol || "";
        if (symbol === "X") total += 1;
        if (symbol === "1/2") total += 0.5;
        return symbol;
      });
      const grade = gradeMap.get(person.id);
      return [index + 1, person.fullName, ...cells, total, grade?.grade || "", grade?.reason || ""];
    });
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cham-cong-${month}-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const days = daysInMonth(year, month);
  const dayNumbers = Array.from({ length: days }, (_, i) => i + 1);

  return (
    <div className="flex min-h-screen flex-col gap-4 bg-transparent p-4 lg:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-v5-muted">Lịch, trực &amp; báo cáo</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-v5-ink">Chấm công tháng</h1>
          <p className="mt-1 text-[12px] text-v5-muted">
            Người phụ trách trực chấm công cho cán bộ; cuối ngày bàn giao người trực cho ngày mai.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-v5-line bg-v5-surface px-3 text-[12px] font-semibold text-v5-ink hover:bg-v5-bg"
          >
            <Download className="h-4 w-4" /> Xuất Excel (CSV)
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-v5-line bg-v5-surface p-3">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-v5-ink">
          <CalendarDays className="h-4 w-4 text-v5-accent" /> {data?.unit.name || user?.unitName || "Đơn vị"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              if (month === 1) { setMonth(12); setYear((y) => y - 1); } else setMonth((m) => m - 1);
            }}
            className="rounded-md border border-v5-line p-1.5 text-v5-muted hover:bg-v5-bg"
            aria-label="Tháng trước"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[120px] text-center text-[13px] font-semibold text-v5-ink">
            Tháng {month}/{year}
          </span>
          <button
            type="button"
            onClick={() => {
              if (month === 12) { setMonth(1); setYear((y) => y + 1); } else setMonth((m) => m + 1);
            }}
            className="rounded-md border border-v5-line p-1.5 text-v5-muted hover:bg-v5-bg"
            aria-label="Tháng sau"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-v5-line bg-v5-surface p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold text-v5-ink">
            <Handshake className="h-4 w-4 text-v5-accent" /> Bàn giao người trực
          </h2>
          <span className="text-[11px] text-v5-muted">
            Hôm nay: {today} {todayHandover ? `· ${data?.people.find((p) => p.id === todayHandover.fromPersonId)?.fullName || ""} → ${data?.people.find((p) => p.id === todayHandover.toPersonId)?.fullName || ""}` : "· chưa bàn giao"}
          </span>
        </div>
        <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-4">
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-v5-muted">
            Người trực hôm nay
            <select
              value={handoverFrom}
              onChange={(e) => setHandoverFrom(e.target.value)}
              disabled={!canEdit}
              className="h-9 rounded-lg border border-v5-line bg-v5-surface px-2 text-[12px] font-normal text-v5-ink"
            >
              {data?.people.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-v5-muted">
            Bàn giao cho ngày mai
            <select
              value={handoverTo}
              onChange={(e) => setHandoverTo(e.target.value)}
              disabled={!canEdit}
              className="h-9 rounded-lg border border-v5-line bg-v5-surface px-2 text-[12px] font-normal text-v5-ink"
            >
              {data?.people.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-v5-muted md:col-span-2">
            Ghi chú bàn giao
            <input
              value={handoverNote}
              onChange={(e) => setHandoverNote(e.target.value)}
              disabled={!canEdit}
              placeholder="Tình hình ca trực, việc cần theo dõi..."
              className="h-9 rounded-lg border border-v5-line bg-v5-surface px-3 text-[12px] font-normal text-v5-ink"
            />
          </label>
        </div>
        {canEdit && (
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={saveHandover}
              disabled={handoverBusy}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-v5-accent px-3 text-[12px] font-semibold text-white hover:bg-v5-accent/90 disabled:opacity-50"
            >
              {handoverBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Lưu bàn giao
            </button>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-v5-line bg-v5-surface">
        <div className="flex flex-wrap items-center gap-2 border-b border-v5-line px-3 py-2">
          <span className="text-[12px] font-semibold text-v5-ink">Bảng chấm công</span>
          <span className="text-[11px] text-v5-muted">
            {canEdit ? "Bấm vào ô để đổi ký hiệu: X → 1/2 → P → KP → CT → OFF → trống" : "Chế độ xem"}
          </span>
          <div className="ml-auto flex flex-wrap gap-1.5 text-[10px] text-v5-muted">
            {SYMBOLS.map((s) => (
              <span key={s} className="rounded border border-v5-line bg-v5-bg px-1.5 py-0.5">
                <strong className="text-v5-ink">{s}</strong> {SYMBOL_LABEL[s]}
              </span>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-[12px] text-v5-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Đang tải bảng chấm công...
          </div>
        ) : !data?.people.length ? (
          <div className="py-16 text-center text-[12px] text-v5-muted">
            <Info className="mx-auto mb-2 h-5 w-5" />
            Đơn vị chưa có cán bộ đang hoạt động.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1450px] border-collapse text-left">
              <thead>
                <tr className="border-b border-v5-line bg-v5-bg text-[11px] font-semibold uppercase tracking-wide text-v5-muted">
                  <th className="sticky left-0 z-10 w-10 bg-v5-bg px-2 py-2 text-center">STT</th>
                  <th className="sticky left-10 z-10 w-56 bg-v5-bg px-2 py-2">Họ và tên</th>
                  {dayNumbers.map((day) => {
                    const label = dayLabel(year, month, day);
                    const weekend = label === "CN" || label === "T7";
                    return (
                      <th
                        key={day}
                        className={`w-9 px-0.5 py-1 text-center ${weekend ? "bg-v5-gold-soft/70 text-v5-gold-ink" : ""}`}
                      >
                        <div className="text-[9px]">{label}</div>
                        <div className="text-[10px]">{day}</div>
                      </th>
                    );
                  })}
                  <th className="w-16 px-1 py-2 text-center">TS công</th>
                  <th className="w-20 px-1 py-2 text-center">Xếp loại</th>
                  <th className="w-40 px-2 py-2">Lý do</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-v5-line">
                {data.people.map((person, index) => {
                  const grade = gradeMap.get(person.id);
                  let total = 0;
                  return (
                    <tr key={person.id} className="hover:bg-v5-bg/60">
                      <td className="sticky left-0 z-10 bg-v5-surface px-2 py-1.5 text-center text-[11px] text-v5-muted">{index + 1}</td>
                      <td className="sticky left-10 z-10 bg-v5-surface px-2 py-1.5">
                        <div className="text-[12px] font-semibold text-v5-ink">{person.fullName}</div>
                        <div className="text-[10px] text-v5-muted">{person.code}{person.positionTitle ? ` · ${person.positionTitle}` : ""}</div>
                      </td>
                      {dayNumbers.map((day) => {
                        const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                        const entry = entryMap.get(`${person.id}|${date}`);
                        const symbol = entry?.symbol || "";
                        if (symbol === "X") total += 1;
                        if (symbol === "1/2") total += 0.5;
                        const label = dayLabel(year, month, day);
                        const weekend = label === "CN" || label === "T7";
                        const key = `${person.id}|${date}`;
                        return (
                          <td key={day} className={`p-0.5 text-center ${weekend ? "bg-v5-gold-soft/25" : ""}`}>
                            <button
                              type="button"
                              disabled={!canEdit || savingCell === key}
                              onClick={() => mark(person.id, date, symbol)}
                              title={entry ? `${SYMBOL_LABEL[symbol] || symbol}${entry.note ? ` · ${entry.note}` : ""}` : "Chưa chấm công"}
                              className={`h-7 w-8 rounded border text-[10px] font-semibold transition-fast ${
                                symbol
                                  ? symbol === "X"
                                    ? "border-v5-success/40 bg-v5-success-soft text-v5-success"
                                    : symbol === "1/2"
                                      ? "border-v5-gold/50 bg-v5-gold-soft text-v5-gold-ink"
                                      : symbol === "P" || symbol === "CT"
                                        ? "border-v5-accent/30 bg-v5-accent-soft text-v5-accent"
                                        : "border-v5-danger/30 bg-v5-danger-soft text-v5-danger"
                                  : "border-v5-line bg-v5-surface text-v5-muted hover:bg-v5-bg"
                              } disabled:cursor-default`}
                            >
                              {savingCell === key ? "…" : symbol || "·"}
                            </button>
                          </td>
                        );
                      })}
                      <td className="px-1 py-1.5 text-center text-[12px] font-bold text-v5-ink">{total}</td>
                      <td className="px-1 py-1.5 text-center">
                        {canEdit ? (
                          <select
                            value={grade?.grade || ""}
                            onChange={(e) => saveGrade(person.id, e.target.value, grade?.reason || "")}
                            className="h-7 rounded border border-v5-line bg-v5-surface px-1 text-[11px] font-semibold text-v5-ink"
                          >
                            <option value="">—</option>
                            <option value="A">A</option>
                            <option value="B">B</option>
                            <option value="C">C</option>
                          </select>
                        ) : (
                          <span className="text-[11px] font-semibold text-v5-ink">{grade?.grade || "—"}</span>
                        )}
                      </td>
                      <td className="px-1 py-1.5">
                        {canEdit ? (
                          <input
                            defaultValue={grade?.reason || ""}
                            onBlur={(e) => {
                              if (e.target.value !== (grade?.reason || "")) {
                                saveGrade(person.id, grade?.grade || "", e.target.value);
                              }
                            }}
                            placeholder="Lý do xếp loại..."
                            className="h-7 w-full rounded border border-v5-line bg-v5-surface px-1.5 text-[11px] text-v5-ink"
                          />
                        ) : (
                          <span className="text-[11px] text-v5-muted">{grade?.reason || "—"}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-v5-accent/20 bg-v5-accent-soft px-3 py-2 text-[11px] text-v5-muted">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-v5-accent" />
        <span>
          Người phụ trách trực chấm công hằng ngày. Cuối ngày lưu bàn giao cho người trực ngày mai; dữ liệu chấm công
          được giữ theo tháng và xuất được Excel (CSV).
        </span>
      </div>
    </div>
  );
}
