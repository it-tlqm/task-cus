"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "@/components/ui/Toast";
import { usePermissions } from "@/hooks/usePermissions";
import { isNoonDutyTitle, MAX_EXTRA_SLOTS_PER_POSITION, NOTES_REQUIRE_PERSON_MESSAGE, hasAssignedPerson } from "@/lib/duty-roster";

/**
 * YC-24 — Phân công nhiệm vụ & lịch trực theo biểu mẫu
 * "Sổ phân công nhiệm vụ công tác giám sát quản lý" (Hải quan cửa khẩu Quốc tế Tà Lùng).
 *
 * - Desktop: bảng ma trận Vị trí × Ngày; bấm ô để mở phiếu phân công của ngày.
 * - Mobile: thẻ theo ngày, không tràn ngang; lãnh đạo vẫn phân công được trong quyền.
 * - Cảnh báo mềm: trùng đơn nghỉ đã duyệt, một cán bộ bị phân công nhiều vị trí trong ngày.
 * - Ghi chú per-person trên DutyRoster.notes (lưu/sửa/xem, audit old/new); “Đổi người” tách riêng, bắt buộc lý do.
 * - Xuất Excel theo kỳ/ngày đúng cấu trúc biểu mẫu; sửa danh mục không đổi lịch sử phân công.
 */

const SHIFT_LABELS: Record<string, string> = { SANG: "Sáng", CHIEU: "Chiều", CA_NGAY: "Cả ngày" };
const WEEKDAYS = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"];

interface DutySlotDef {
  k: string;
  l: string | null;
}

interface DutyRow {
  id: string;
  date: string;
  shift: string;
  post: string | null;
  notes: string | null;
  reason: string | null;
  personId: string;
  person: { id: string; fullName: string };
  unitId: string | null;
  unit: { id: string; name: string; code: string } | null;
  positionId: string | null;
  positionTitle: string | null;
  positionDetail: string | null;
  positionOrder: number | null;
  slotLabel: string | null;
  slotOrder: number | null;
  leaveClash: { type: string } | null;
  overlapCount: number;
  /** Số phân công của cán bộ NGOÀI bảng này trong cùng ngày (chỉ số lượng — không lộ chi tiết ngoài quyền). */
  overlapOutsideCount: number;
}

interface CatalogPosition {
  id: string;
  code: string;
  title: string;
  detail: string | null;
  slots: DutySlotDef[];
  sortOrder: number;
  status: string;
}

interface DayInfoRow {
  id: string;
  date: string;
  totalStaff: number | null;
  presentStaff: number | null;
  absentCount: number | null;
  absentReason: string | null;
  notes: string | null;
}

interface UnitLite {
  id: string;
  code: string;
  name: string;
}

interface PersonLite {
  id: string;
  fullName: string;
  /** Lãnh đạo đơn vị — được phép kiêm nhiệm nhiều vị trí trực. */
  isLeader?: boolean;
}

interface LeaveLite {
  personId: string;
  type: string;
  startDate: string;
  endDate: string;
}

/** Trạng thái lập bảng phân công của một bộ phận trong kỳ đang xem. */
interface BoardStatusRow {
  unitId: string;
  assignments: number;
  dayInfos: number;
  /** Số vị trí/nhiệm vụ đang hoạt động của bộ phận (0 = chưa thiết lập danh mục). */
  catalog?: number;
}

/** Bản ghi lịch trực cũ chưa xác định được bộ phận — chỉ Lãnh đạo đơn vị thấy, để đối chiếu (không tự gán). */
interface LegacyUnassignedRow {
  id: string;
  date: string;
  shift: string;
  post: string | null;
  person: { id: string; fullName: string };
}

interface MatrixGroup {
  kind: "catalog" | "orphan" | "legacy";
  /** Mã hiển thị/test: YC24-01..., X1 (ngoài danh mục), CU (dữ liệu cũ) */
  code: string;
  positionId: string | null;
  title: string;
  detail: string | null;
  slots: DutySlotDef[];
  sortOrder: number;
}

/** Một dòng hiển thị trong nhóm vị trí: ô danh mục hoặc dòng bổ sung riêng của ngày. */
interface SlotLine {
  key: string;
  label: string | null;
  row: DutyRow | null;
  /** true = dòng bổ sung ngoài số ô danh mục (chỉ áp dụng cho ngày đang xem). */
  isExtra?: boolean;
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dateKey(v: Date | string): string {
  const d = new Date(v);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  x.setHours(0, 0, 0, 0);
  return x;
}

function mondayOf(d: Date): Date {
  const x = new Date(d);
  const shift = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - shift);
  x.setHours(0, 0, 0, 0);
  return x;
}

function fmtDM(v: Date | string): string {
  const d = new Date(v);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmtDMY(v: Date | string): string {
  const d = new Date(v);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/** Dựng các nhóm hiển thị: vị trí danh mục (đang dùng) + vị trí ngoài danh mục + dữ liệu cũ. */
function buildMatrixGroups(rows: DutyRow[], positions: CatalogPosition[]): MatrixGroup[] {
  const groups: MatrixGroup[] = [];
  const usedIds = new Set<string>();
  const activeCatalog = positions
    .filter((p) => p.status === "ACTIVE")
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);
  for (const p of activeCatalog) {
    groups.push({
      kind: "catalog",
      code: p.code,
      positionId: p.id,
      title: p.title,
      detail: p.detail,
      slots: p.slots,
      sortOrder: p.sortOrder,
    });
    usedIds.add(p.id);
  }
  // Vị trí không còn hiệu lực nhưng có phân công trong kỳ — hiển thị để không mất dấu dữ liệu
  const orphanIds = [...new Set(rows.map((r) => r.positionId).filter((x): x is string => !!x && !usedIds.has(x)))];
  let orphanIdx = 0;
  for (const pid of orphanIds) {
    const rs = rows.filter((r) => r.positionId === pid);
    const maxSlot = Math.max(0, ...rs.map((r) => r.slotOrder ?? 0));
    const slots: DutySlotDef[] = Array.from({ length: maxSlot + 1 }, (_, idx) => {
      const row = rs.find((r) => r.slotOrder === idx);
      return { k: `s${idx + 1}`, l: row?.slotLabel ?? null };
    });
    orphanIdx++;
    groups.push({
      kind: "orphan",
      code: `X${orphanIdx}`,
      positionId: pid,
      title: rs[0]?.positionTitle || "(vị trí ngoài danh mục)",
      detail: rs[0]?.positionDetail || null,
      slots,
      sortOrder: rs[0]?.positionOrder ?? 900 + orphanIdx,
    });
  }
  // Dữ liệu cũ (không gắn vị trí)
  if (rows.some((r) => !r.positionId)) {
    groups.push({
      kind: "legacy",
      code: "CU",
      positionId: null,
      title: "Dữ liệu cũ (trước nâng cấp)",
      detail: null,
      slots: [],
      sortOrder: 999,
    });
  }
  return groups.sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Các dòng hiển thị của một nhóm trong một ngày: mỗi ô một dòng + dòng bổ sung ngoài danh mục. */
function slotLinesFor(group: MatrixGroup, dayRows: DutyRow[]): SlotLine[] {
  if (group.kind === "legacy") {
    return dayRows
      .filter((r) => !r.positionId)
      .map((r) => ({ key: r.id, label: r.post?.trim() || SHIFT_LABELS[r.shift] || r.shift, row: r }));
  }
  if (!group.positionId) return [];
  const lines: SlotLine[] = group.slots.map((s, idx) => {
    const row = dayRows.find((r) => r.positionId === group.positionId && r.slotOrder === idx) || null;
    return { key: `${idx}`, label: s.l, row };
  });
  // Các dòng bổ sung riêng của ngày (slotOrder vượt số ô danh mục) — kể cả dữ liệu cũ
  // còn lại sau khi danh mục bị rút bớt ô. Không để mất phân công đã ghi.
  const matched = new Set(lines.filter((l) => l.row).map((l) => l.row!.id));
  const extras = dayRows
    .filter((r) => r.positionId === group.positionId && !matched.has(r.id))
    .sort((a, b) => (a.slotOrder ?? 9999) - (b.slotOrder ?? 9999) || a.id.localeCompare(b.id))
    .map((r) => ({ key: `x-${r.id}`, label: r.slotLabel, row: r, isExtra: true }));
  return [...lines, ...extras];
}

/**
 * Gợi ý cảnh báo trước khi lưu: nghỉ phép trùng ngày / đã phân công CÙNG NHÓM TRỰC trong ngày.
 * Trực thường và trực trưa là hai nhóm riêng — 1 thường + 1 trưa không phải trùng phân công.
 */
function prewarnFor(
  personId: string,
  dateISO: string,
  dayRows: DutyRow[],
  leaves: LeaveLite[],
  positionTitle?: string | null,
  ignoreOverlap = false
): string[] {
  const out: string[] = [];
  const d = new Date(dateISO);
  const hit = leaves.find((l) => {
    if (l.personId !== personId) return false;
    const s = new Date(l.startDate);
    const e = new Date(l.endDate);
    s.setHours(0, 0, 0, 0);
    e.setHours(23, 59, 59, 999);
    return d >= s && d <= e;
  });
  if (hit) out.push(`Cán bộ có đơn nghỉ đã duyệt (${hit.type}) trùng ngày — cân nhắc lại.`);
  if (!ignoreOverlap) {
    const targetNoon = isNoonDutyTitle(positionTitle);
    const sameCategory = dayRows.filter(
      (r) => r.personId === personId && isNoonDutyTitle(r.positionTitle) === targetNoon
    );
    if (sameCategory.length > 0) {
      out.push(
        targetNoon
          ? "Cán bộ đã được phân công trực trưa ở vị trí khác trong ngày (trùng nhóm trực trưa)."
          : "Cán bộ đã được phân công trực thường ở vị trí khác trong ngày (trùng nhóm trực thường)."
      );
    }
  }
  return out;
}

export default function RosterPage() {
  const { canApprove, canExport, isUnitLeader } = usePermissions();
  const [view, setView] = useState<"week" | "day">("week");
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()));
  const [selDay, setSelDay] = useState<string>(() => toISODate(new Date()));
  const [rows, setRows] = useState<DutyRow[]>([]);
  const [positions, setPositions] = useState<CatalogPosition[]>([]);
  const [dayInfos, setDayInfos] = useState<DayInfoRow[]>([]);
  const [units, setUnits] = useState<UnitLite[]>([]);
  const [boardStatus, setBoardStatus] = useState<BoardStatusRow[]>([]);
  const [legacyUnassigned, setLegacyUnassigned] = useState<LegacyUnassignedRow[]>([]);
  const [leaves, setLeaves] = useState<LeaveLite[]>([]);
  const [people, setPeople] = useState<PersonLite[]>([]);
  const leaderIds = useMemo(
    () => new Set(people.filter((p) => p.isLeader).map((p) => p.id)),
    [people]
  );
  const [selUnitId, setSelUnitId] = useState("");
  const [fPersonId, setFPersonId] = useState("");
  const [fPositionId, setFPositionId] = useState("");
  const [loading, setLoading] = useState(true);
  const [editorDate, setEditorDate] = useState<string | null>(null);
  const [editorFocus, setEditorFocus] = useState<string | null>(null);
  const [showCatalog, setShowCatalog] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [showWarnings, setShowWarnings] = useState(false);

  const todayISO = toISODate(new Date());
  const openEditor = useCallback((iso: string, groupCode?: string) => {
    setEditorFocus(groupCode || null);
    setEditorDate(iso);
  }, []);

  const rangeFrom = view === "week" ? toISODate(weekStart) : selDay;
  const rangeTo = view === "week" ? toISODate(addDays(weekStart, 6)) : selDay;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from: rangeFrom, to: rangeTo });
      if (selUnitId) params.set("unitId", selUnitId);
      const res = await fetch(`/api/rosters?${params.toString()}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error || "Không thể tải phân công nhiệm vụ");
        return;
      }
      setRows(json.data || []);
      setPositions(json.positions || []);
      setDayInfos(json.dayInfos || []);
      setUnits(json.units || []);
      setLeaves(json.leaves || []);
      setBoardStatus(json.boardStatus || []);
      setLegacyUnassigned(json.legacyUnassigned || []);
      // Backend xác định bộ phận mặc định (trưởng bộ phận / cán bộ 1 bộ phận) — đồng bộ lại selector.
      if (json.selectedUnitId && json.selectedUnitId !== selUnitId) setSelUnitId(json.selectedUnitId);
    } catch (err: any) {
      toast.error("Lỗi kết nối: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [rangeFrom, rangeTo, selUnitId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetch("/api/people?pageSize=100&status=ACTIVE&includeLeaders=1")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const list = Array.isArray(json) ? json : json?.data || [];
        setPeople(
          list
            .map((p: any) => ({ id: p.id, fullName: p.fullName, isLeader: !!p.isLeader }))
            .sort((a: PersonLite, b: PersonLite) => a.fullName.localeCompare(b.fullName, "vi"))
        );
      })
      .catch(() => {});
  }, []);

  const days = useMemo(() => {
    if (view === "day") return [new Date(selDay)];
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [view, selDay, weekStart]);

  const displayRows = useMemo(
    () =>
      rows.filter(
        (r) => (!fPersonId || r.personId === fPersonId) && (!fPositionId || r.positionId === fPositionId)
      ),
    [rows, fPersonId, fPositionId]
  );

  const selUnit = useMemo(() => units.find((u) => u.id === selUnitId) || null, [units, selUnitId]);
  const boardFor = useCallback((unitId: string) => boardStatus.find((b) => b.unitId === unitId), [boardStatus]);
  /** Bộ phận đã thiết lập danh mục vị trí — dùng cho empty-state và dải trạng thái. */
  const unitsWithCatalog = useMemo(
    () => units.filter((u) => (boardFor(u.id)?.catalog || 0) > 0),
    [units, boardFor]
  );
  /** Bộ phận có dữ liệu trong kỳ hoặc đã có danh mục — chỉ hiện các chip này để đỡ rối. */
  const unitsWithBoard = useMemo(
    () =>
      units.filter((u) => {
        const b = boardFor(u.id);
        return (b?.catalog || 0) > 0 || (b?.assignments || 0) > 0 || (b?.dayInfos || 0) > 0;
      }),
    [units, boardFor]
  );

  const groups = useMemo(() => buildMatrixGroups(displayRows, positions), [displayRows, positions]);

  const infoByDay = useMemo(() => {
    const m = new Map<string, DayInfoRow>();
    for (const i of dayInfos) m.set(dateKey(i.date), i);
    return m;
  }, [dayInfos]);

  const rowsOnDay = useCallback(
    (iso: string, source?: DutyRow[]) => (source || displayRows).filter((r) => dateKey(r.date) === iso),
    [displayRows]
  );

  const warnings = useMemo(() => {
    const list: string[] = [];
    const leaveSeen = new Set<string>();
    for (const r of rows) {
      if (r.leaveClash) {
        const k = `${r.personId}|${dateKey(r.date)}`;
        if (!leaveSeen.has(k)) {
          leaveSeen.add(k);
          list.push(
            `${r.person.fullName} — ngày ${fmtDM(r.date)}: trùng đơn nghỉ đã duyệt (${r.leaveClash.type}).`
          );
        }
      }
    }
    const byPersonDay = new Map<string, DutyRow[]>();
    for (const r of rows) {
      const k = `${r.personId}|${dateKey(r.date)}`;
      const arr = byPersonDay.get(k) || [];
      arr.push(r);
      byPersonDay.set(k, arr);
    }
    for (const [personId, arr] of byPersonDay) {
      // Lãnh đạo đơn vị được kiêm nhiệm nhiều vị trí trực: không cảnh báo trùng.
      // Vẫn giữ cảnh báo trùng đơn nghỉ ở vòng lặp phía trên.
      if (leaderIds.has(personId)) continue;
      // Trực thường và trực trưa là hai nhóm riêng: chỉ cảnh báo khi CÙNG NHÓM có từ 2 phân công.
      const normalCount = arr.filter((r) => !isNoonDutyTitle(r.positionTitle)).length;
      const noonCount = arr.filter((r) => isNoonDutyTitle(r.positionTitle)).length;
      const conflicts: string[] = [];
      if (normalCount > 1) conflicts.push(`${normalCount} trực thường`);
      if (noonCount > 1) conflicts.push(`${noonCount} trực trưa`);
      if (conflicts.length > 0) {
        list.push(
          `${arr[0].person.fullName} — ngày ${fmtDM(arr[0].date)}: trùng phân công trong ngày (${conflicts.join(", ")}).`
        );
      }
      if (arr.some((r) => (r.overlapOutsideCount || 0) > 0)) {
        list.push(
          `${arr[0].person.fullName} — ngày ${fmtDM(arr[0].date)}: có phân công cùng nhóm trực ở bộ phận khác trong cùng ngày — kiểm tra lại (chỉ cảnh báo, không chặn).`
        );
      }
    }
    return list;
  }, [rows, leaderIds]);

  const prevPeriod = () => {
    if (view === "week") setWeekStart((w) => addDays(w, -7));
    else setSelDay((d) => toISODate(addDays(new Date(d), -1)));
  };
  const nextPeriod = () => {
    if (view === "week") setWeekStart((w) => addDays(w, 7));
    else setSelDay((d) => toISODate(addDays(new Date(d), 1)));
  };
  const goToday = () => {
    const t = new Date();
    setWeekStart(mondayOf(t));
    setSelDay(toISODate(t));
  };

  return (
    <div className="flex flex-col w-full p-4 lg:p-6 space-y-4 pb-24" data-testid="roster-page">
      {/* Tiêu đề + hành động chính */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-gradient-to-r from-teal-50/80 via-white to-white p-3 lg:flex-row lg:items-center lg:justify-between lg:p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-white shadow-sm lg:h-10 lg:w-10">
            <span className="material-symbols-outlined text-[20px] lg:text-[22px]">assignment</span>
          </span>
          <div className="min-w-0">
            <h1 className="text-base font-bold text-slate-800 lg:text-xl">Phân công nhiệm vụ &amp; lịch trực</h1>
            <p className="hidden text-xs text-slate-500 sm:block">
              Bám biểu mẫu “Sổ phân công nhiệm vụ công tác giám sát quản lý” — Hải quan cửa khẩu Quốc tế Tà Lùng
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
              <span className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-teal-50 px-2 py-0.5 font-semibold text-teal-800">
                <span className="material-symbols-outlined text-[13px]">apartment</span>
                {selUnit?.name || "Chưa chọn bộ phận"}
              </span>
              <span className="hidden items-center gap-1 sm:inline-flex">
                <span className="material-symbols-outlined text-[13px]">event</span>
                {view === "week" ? "Bảng tuần" : fmtDMY(selDay)}
              </span>
            </div>
          </div>
        </div>
        {canApprove && (
          <button
            data-testid="roster-btn-assign"
            onClick={() => openEditor(view === "day" ? selDay : todayISO)}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-800 lg:w-auto lg:py-2.5"
          >
            <span className="material-symbols-outlined text-[18px]">add_task</span>
            Phân công
          </button>
        )}
      </div>

      {/* Thanh điều khiển */}
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-2.5" data-tour="roster-toolbar">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
            <button
              data-testid="roster-view-week"
              onClick={() => setView("week")}
              className={`px-3 py-1.5 text-xs font-semibold ${view === "week" ? "bg-teal-700 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
            >
              Theo tuần
            </button>
            <button
              data-testid="roster-view-day"
              onClick={() => setView("day")}
              className={`border-l border-slate-200 px-3 py-1.5 text-xs font-semibold ${view === "day" ? "bg-teal-700 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
            >
              Theo ngày
            </button>
          </div>

          <div className="inline-flex items-center gap-1">
            <button
              data-testid="roster-prev"
              onClick={prevPeriod}
              className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50"
              aria-label="Kỳ trước"
            >
              <span className="material-symbols-outlined text-[18px]">chevron_left</span>
            </button>
            {view === "week" ? (
              <span className="min-w-[150px] px-2 text-center text-xs font-semibold text-slate-700">
                Tuần {fmtDM(weekStart)} – {fmtDM(addDays(weekStart, 6))}/{addDays(weekStart, 6).getFullYear()}
              </span>
            ) : (
              <input
                data-testid="roster-day-input"
                type="date"
                value={selDay}
                onChange={(e) => e.target.value && setSelDay(e.target.value)}
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
              />
            )}
            <button
              data-testid="roster-next"
              onClick={nextPeriod}
              className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50"
              aria-label="Kỳ sau"
            >
              <span className="material-symbols-outlined text-[18px]">chevron_right</span>
            </button>
            <button
              data-testid="roster-today"
              onClick={goToday}
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold hover:bg-slate-50"
            >
              Hôm nay
            </button>
          </div>

          <div className="flex-1" />

          <div className="w-full sm:w-auto">
            {units.length > 1 ? (
              <select
                data-testid="roster-unit-select"
                value={selUnitId}
                onChange={(e) => setSelUnitId(e.target.value)}
                className="w-full max-w-full rounded-lg border border-teal-300 bg-teal-50/60 px-2 py-1.5 text-xs font-semibold text-teal-900 sm:max-w-[270px]"
                title="Chọn bộ phận để xem/lập bảng phân công (mỗi bộ phận có bảng riêng)"
              >
                {units.map((u) => {
                  const st = boardFor(u.id);
                  const ready = (st?.catalog || 0) > 0;
                  return (
                    <option key={u.id} value={u.id}>
                      {u.name}
                      {ready ? "" : " — chưa thiết lập"}
                    </option>
                  );
                })}
              </select>
            ) : (
              selUnit && (
                <span
                  data-testid="roster-unit-static"
                  className="block max-w-full truncate rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-700 sm:max-w-[270px]"
                  title="Bộ phận đang xem"
                >
                  {selUnit.name}
                </span>
              )
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowTools((v) => !v)}
          className="flex w-full items-center justify-between border-t border-slate-100 pt-2 text-[11px] font-semibold text-slate-600 lg:hidden"
          aria-expanded={showTools}
        >
          <span className="inline-flex items-center gap-1">
            <span className="material-symbols-outlined text-[15px]">tune</span>
            Bộ lọc &amp; công cụ
          </span>
          <span className="material-symbols-outlined text-[16px]">{showTools ? "expand_less" : "expand_more"}</span>
        </button>
        <div
          className={`${showTools ? "flex" : "hidden"} flex-wrap items-center gap-2 lg:flex lg:border-t lg:border-slate-100 lg:pt-2`}
        >
          <span className="hidden text-[10px] font-bold uppercase tracking-wide text-slate-400 sm:inline">Lọc</span>
          <select
            data-testid="roster-filter-person"
            value={fPersonId}
            onChange={(e) => setFPersonId(e.target.value)}
            className="max-w-[170px] rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
            title="Lọc theo cán bộ"
          >
            <option value="">Tất cả cán bộ</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName}
              </option>
            ))}
          </select>
          <select
            data-testid="roster-filter-position"
            value={fPositionId}
            onChange={(e) => setFPositionId(e.target.value)}
            className="max-w-[210px] rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
            title="Lọc theo vị trí/nhiệm vụ"
          >
            <option value="">Tất cả vị trí</option>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sortOrder}. {p.title}
              </option>
            ))}
          </select>

          <div className="flex-1" />

          <div className="flex flex-wrap items-center gap-2">
            {canExport && (
              <button
                data-testid="roster-btn-export"
                onClick={() => setShowExport(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
              >
                <span className="material-symbols-outlined text-[16px]">download</span>
                Xuất Excel
              </button>
            )}
            {canApprove && (
              <button
                data-testid="roster-btn-catalog"
                onClick={() => setShowCatalog(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                title="Danh mục vị trí/nhiệm vụ của bộ phận đang xem"
              >
                <span className="material-symbols-outlined text-[16px]">list_alt</span>
                Danh mục vị trí
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Cảnh báo — mặc định thu gọn, chỉ mở khi bấm */}
      {warnings.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3" data-testid="roster-warnings">
          <button
            type="button"
            data-testid="roster-warnings-toggle"
            onClick={() => setShowWarnings((v) => !v)}
            aria-expanded={showWarnings}
            aria-controls="roster-warnings-list"
            className="flex min-h-6 w-full items-center justify-between gap-2 rounded-lg py-1 text-left text-xs font-bold uppercase tracking-wide text-amber-800 transition-colors hover:text-amber-900"
          >
            <span className="inline-flex items-center gap-2">
              <span aria-hidden="true" className="material-symbols-outlined text-[16px]">warning</span>
              Cảnh báo phân công ({warnings.length})
            </span>
            <span className="inline-flex items-center gap-1 normal-case tracking-normal">
              <span className="text-[11px] font-semibold text-amber-700">
                {showWarnings ? "Ẩn chi tiết" : "Xem chi tiết"}
              </span>
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                {showWarnings ? "expand_less" : "expand_more"}
              </span>
            </span>
          </button>
          <ul id="roster-warnings-list" hidden={!showWarnings} className="mt-1.5 space-y-1">
            {warnings.slice(0, 8).map((w, i) => (
              <li key={i} className="text-xs text-amber-800">
                • {w}
              </li>
            ))}
            {warnings.length > 8 && (
              <li className="text-xs text-amber-700 italic">… và {warnings.length - 8} cảnh báo khác</li>
            )}
          </ul>
        </div>
      )}

      {/* Quy ước nhóm trực: trực trưa không tính trùng với trực thường */}
      <div className="flex items-start gap-1.5 text-[11px] leading-snug text-slate-500" data-testid="roster-noon-note">
        <span className="material-symbols-outlined text-[14px] text-slate-400">info</span>
        <span>
          Trực trưa là nhóm riêng: một cán bộ có thể vừa trực thường vừa trực trưa trong ngày. Hệ thống chỉ cảnh báo khi
          trùng phân công trong <strong>cùng nhóm trực</strong>.
        </span>
      </div>

      {/* Bộ phận đang xem + trạng thái thiết lập của các bộ phận trong phạm vi (Lãnh đạo chuyển nhanh) */}
      <div className="flex flex-wrap items-center gap-1.5" data-testid="roster-unit-strip">
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Đang xem</span>
        <span
          data-testid="roster-unit-label"
          className="max-w-[280px] truncate rounded-full bg-teal-700 px-2.5 py-0.5 text-[11px] font-semibold text-white"
        >
          {selUnit?.name || "—"}
        </span>
        {units.length > 1 && (
          <div className="hidden flex-wrap items-center gap-1 lg:flex" data-testid="roster-unit-status">
            {unitsWithBoard.length === 0 ? (
              <span className="text-[11px] italic text-slate-400">Chưa bộ phận nào thiết lập danh mục trong kỳ này.</span>
            ) : (
              unitsWithBoard.map((u) => {
                const st = boardFor(u.id);
                const active = selUnitId === u.id;
                const assignments = st?.assignments || 0;
                const catalog = st?.catalog || 0;
                const has = assignments > 0 || (st?.dayInfos || 0) > 0;
                const stateText = has ? `đã phân công ${assignments}` : catalog > 0 ? `danh mục ${catalog}` : "chưa thiết lập";
                return (
                  <button
                    key={u.id}
                    data-testid={`roster-unit-chip-${u.code}`}
                    onClick={() => setSelUnitId(u.id)}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
                      active
                        ? "border-teal-300 bg-teal-50 font-semibold text-teal-800"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                    title={`${u.name} — ${stateText}`}
                  >
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${has ? "bg-emerald-500" : catalog > 0 ? "bg-sky-400" : "bg-slate-300"}`} />
                    {/* Bộ phận đang xem đã có nhãn riêng phía trên — chỉ hiện trạng thái để không lặp tên. */}
                    {active ? (
                      <span className="text-[10px]">{catalog > 0 ? `đã có ${catalog} vị trí` : "chưa thiết lập"}</span>
                    ) : (
                      <>
                        {u.name}
                        <span className="text-[10px] text-slate-400">{stateText}</span>
                      </>
                    )}
                  </button>
                );
              })
            )}
            {unitsWithBoard.length < units.length && (
              <span className="text-[11px] text-slate-400">· {units.length - unitsWithBoard.length} bộ phận chưa thiết lập</span>
            )}
          </div>
        )}
      </div>

      {/* Dữ liệu lịch trực cũ CHƯA xác định được bộ phận — chỉ Lãnh đạo đơn vị thấy, để đối chiếu; không tự gán bộ phận */}
      {legacyUnassigned.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50/70 p-3" data-testid="roster-legacy-unassigned">
          <div className="flex items-center gap-2 text-amber-800 text-xs font-bold uppercase tracking-wide">
            <span className="material-symbols-outlined text-[16px]">help</span>
            Dữ liệu lịch trực cũ chưa xác định bộ phận cần đối chiếu ({legacyUnassigned.length})
          </div>
          <ul className="mt-1.5 space-y-0.5">
            {legacyUnassigned.slice(0, 10).map((r) => (
              <li key={r.id} className="text-xs text-amber-800">
                • {fmtDMY(r.date)} — {r.person.fullName} — {r.post?.trim() || SHIFT_LABELS[r.shift] || r.shift}
              </li>
            ))}
            {legacyUnassigned.length > 10 && (
              <li className="text-xs italic text-amber-700">… và {legacyUnassigned.length - 10} bản ghi khác</li>
            )}
          </ul>
          <div className="mt-1 text-[11px] text-amber-700">
            Hệ thống không tự suy đoán bộ phận cho các bản ghi này — đề nghị rà soát dữ liệu gốc trước khi gán.
          </div>
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Đang tải phân công…
        </div>
      ) : view === "week" ? (
        <>
          {/* Desktop: ma trận Vị trí × Ngày */}
          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white lg:block" data-testid="roster-matrix" data-tour="roster-week">
            {positions.length === 0 ? (
              <div className="px-6 py-10 text-center" data-testid="roster-empty-catalog">
                <span className="material-symbols-outlined text-[40px] text-slate-300">assignment_late</span>
                <div className="mt-2 text-base font-semibold text-slate-700">Bộ phận này chưa có danh mục vị trí/nhiệm vụ</div>
                <p className="mx-auto mt-1 max-w-xl text-sm text-slate-500">
                  Mỗi bộ phận có bảng phân công riêng. Trưởng bộ phận hoặc Lãnh đạo đơn vị vào “Danh mục vị trí” để thiết lập
                  (có thể khôi phục 8 vị trí mẫu của biểu mẫu).
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  {canApprove && (
                    <button
                      onClick={() => setShowCatalog(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800"
                    >
                      <span className="material-symbols-outlined text-[16px]">list_alt</span>
                      Thiết lập danh mục
                    </button>
                  )}
                  {unitsWithCatalog.some((u) => u.id !== selUnitId) && (
                    <select
                      value=""
                      onChange={(e) => e.target.value && setSelUnitId(e.target.value)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                      title="Chuyển sang bộ phận đã có danh mục"
                    >
                      <option value="" disabled>
                        Chuyển sang bộ phận đã có danh mục…
                      </option>
                      {unitsWithCatalog
                        .filter((u) => u.id !== selUnitId)
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                    </select>
                  )}
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-10 min-w-[210px] border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-left font-bold text-slate-700">
                        Nhiệm vụ được phân công
                      </th>
                      {days.map((d, i) => {
                        const iso = toISODate(d);
                        const info = infoByDay.get(iso);
                        const isToday = iso === todayISO;
                        const isWeekend = i >= 5;
                        return (
                          <th
                            key={iso}
                            className={`min-w-[124px] border-b border-l border-slate-200 px-2 py-2 text-center ${
                              isToday ? "bg-teal-50" : isWeekend ? "bg-slate-100/80" : "bg-slate-50"
                            }`}
                          >
                            <div className={`font-bold ${isToday ? "text-teal-800" : "text-slate-700"}`}>{WEEKDAYS[i]}</div>
                            <div className="text-[11px] text-slate-500">
                              {fmtDM(d)}
                              {isToday && (
                                <span className="ml-1 rounded bg-teal-600 px-1 py-0.5 text-[9px] font-semibold uppercase text-white">
                                  hôm nay
                                </span>
                              )}
                            </div>
                            {info && (info.presentStaff !== null || info.absentCount !== null) && (
                              <div className="mt-0.5 text-[10px] text-teal-700">
                                Có mặt {info.presentStaff ?? "…"} / Vắng {info.absentCount ?? "…"}
                              </div>
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g) => (
                      <tr key={`${g.kind}-${g.code}`} className="align-top">
                        <td className="sticky left-0 z-10 border-b border-slate-100 bg-white px-3 py-2.5">
                          <div className="font-semibold leading-snug text-slate-800">
                            {g.kind === "legacy" ? g.title : `${g.sortOrder}. ${g.title}`}
                          </div>
                          {g.detail && <div className="mt-0.5 text-[11px] leading-snug text-slate-500">{g.detail}</div>}
                          {g.kind === "orphan" && <div className="text-[10px] italic text-amber-600">Ngoài danh mục hiện hành</div>}
                        </td>
                        {days.map((d) => {
                          const iso = toISODate(d);
                          const dayRows = rowsOnDay(iso);
                          const lines = slotLinesFor(g, dayRows);
                          const isToday = iso === todayISO;
                          return (
                            <td
                              key={iso}
                              data-testid={`roster-cell-${iso}-${g.code}`}
                              onClick={canApprove ? () => openEditor(iso, g.code) : undefined}
                              title={canApprove ? `Bấm để phân công ngày ${fmtDMY(iso)}` : undefined}
                              className={`border-b border-l border-slate-100 px-2 py-2 align-top ${
                                isToday ? "bg-teal-50/40" : ""
                              } ${canApprove ? "cursor-pointer hover:bg-teal-100/40" : ""}`}
                            >
                              {(() => {
                                const filled = lines.filter((l) => l.row);
                                if (filled.length === 0) {
                                  return <span className="block text-center text-slate-200">—</span>;
                                }
                                return (
                                  <div className="space-y-1">
                                    {lines.map((ln) => (
                                      <div key={ln.key} className="flex flex-wrap items-start gap-1">
                                        <span className={ln.row ? "font-medium leading-snug text-slate-800" : "text-slate-300"}>
                                          {ln.label && (ln.label.length <= 3 || g.kind === "legacy") ? `${ln.label}: ` : ""}
                                          {ln.row ? ln.row.person.fullName : "—"}
                                        </span>
                                        {ln.row?.leaveClash && (
                                          <span
                                            className="material-symbols-outlined text-[13px] text-amber-500"
                                            title={`Trùng đơn nghỉ đã duyệt (${ln.row.leaveClash.type})`}
                                          >
                                            warning
                                          </span>
                                        )}
                                        {ln.row && ln.row.overlapCount > 1 && !leaderIds.has(ln.row.personId) && (
                                          <span
                                            className="text-[10px] font-semibold leading-tight text-amber-700"
                                            title="Trùng phân công cùng nhóm trực trong ngày (chỉ cảnh báo, không chặn)"
                                          >
                                            Trùng phân công
                                          </span>
                                        )}
                                        {ln.row?.notes && (
                                          <span
                                            className="block w-full truncate text-[10px] italic text-slate-500"
                                            title={`Ghi chú: ${ln.row.notes}`}
                                          >
                                            Ghi chú: {ln.row.notes}
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                );
                              })()}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Mobile: thẻ theo ngày */}
          <div className="space-y-3 lg:hidden" data-testid="roster-mobile" data-tour="roster-week">
            {positions.length === 0 ? (
              <div
                className="rounded-xl border border-dashed border-slate-200 bg-white p-5 text-center"
                data-testid="roster-mobile-empty-catalog"
              >
                <span className="material-symbols-outlined text-[32px] text-slate-300">assignment_late</span>
                <div className="mt-1 text-sm font-semibold text-slate-700">Bộ phận này chưa có danh mục vị trí/nhiệm vụ</div>
                <p className="mx-auto mt-1 max-w-xs text-xs text-slate-500">
                  Mỗi bộ phận có bảng phân công riêng. Chọn bộ phận khác ở trên hoặc thiết lập danh mục cho bộ phận này.
                </p>
                {canApprove && (
                  <button
                    onClick={() => setShowCatalog(true)}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800"
                  >
                    <span className="material-symbols-outlined text-[16px]">list_alt</span>
                    Thiết lập danh mục
                  </button>
                )}
              </div>
            ) : (
              days.map((d, i) => {
              const iso = toISODate(d);
              const dayRows = rowsOnDay(iso, rows);
              const isToday = iso === todayISO;
              const dayGroups = positions.length > 0 ? buildMatrixGroups(dayRows, positions) : [];
              const filledGroups = dayGroups
                .map((g) => ({ g, filled: slotLinesFor(g, dayRows).filter((l) => l.row) }))
                .filter((x) => x.filled.length > 0);
              const assignmentCount = filledGroups.reduce((n, x) => n + x.filled.length, 0);
              const personCount = new Set(filledGroups.flatMap((x) => x.filled.map((l) => l.row!.person.id))).size;
              return (
                <div
                  key={iso}
                  className={`overflow-hidden rounded-xl border bg-white ${isToday ? "border-teal-300 ring-1 ring-teal-100" : "border-slate-200"}`}
                  data-testid={`roster-day-card-${iso}`}
                >
                  <div className={`flex items-center justify-between gap-2 border-b px-3 py-2 ${isToday ? "border-teal-200 bg-teal-50" : "border-slate-200 bg-slate-50"}`}>
                    <button
                      className="min-w-0 text-left"
                      onClick={() => {
                        setSelDay(iso);
                        setView("day");
                      }}
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`text-sm font-bold ${isToday ? "text-teal-800" : "text-slate-700"}`}>{WEEKDAYS[i]}</span>
                        <span className="text-xs text-slate-500">{fmtDM(d)}</span>
                        {isToday && <span className="rounded-full bg-teal-700 px-1.5 py-0.5 text-[10px] font-semibold text-white">Hôm nay</span>}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500">
                        {positions.length === 0
                          ? "Chưa có danh mục vị trí"
                          : assignmentCount > 0
                            ? `${assignmentCount} lượt phân công · ${personCount} cán bộ`
                            : "Chưa phân công"}
                      </div>
                    </button>
                    {canApprove && (
                      <button
                        data-testid={`roster-day-assign-${iso}`}
                        onClick={() => openEditor(iso)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-teal-200 bg-white px-2 py-1 text-[11px] font-semibold text-teal-700"
                      >
                        <span className="material-symbols-outlined text-[14px]">add</span>
                        Phân công
                      </button>
                    )}
                  </div>
                  {filledGroups.length > 0 && (
                    <div className="space-y-2 px-3 py-2">
                      {filledGroups.map(({ g, filled }) => (
                        <div key={g.code}>
                          <div className="text-[11px] font-semibold text-slate-600">
                            {g.kind === "legacy" ? g.title : `${g.sortOrder}. ${g.title}`}
                          </div>
                          <div className="mt-0.5 space-y-0.5">
                            {filled.map((ln) => (
                              <div key={ln.key} className="flex flex-wrap items-center gap-1 text-xs text-slate-700">
                                <span className="truncate">
                                  {(ln.label && ln.label.length <= 3 ? `${ln.label}: ` : "") + (ln.row?.person.fullName || "")}
                                </span>
                                {ln.row?.leaveClash && (
                                  <span className="material-symbols-outlined text-[13px] text-amber-500" title="Trùng đơn nghỉ đã duyệt">
                                    warning
                                  </span>
                                )}
                                {ln.row && ln.row.overlapCount > 1 && !leaderIds.has(ln.row.personId) && (
                                  <span className="text-[10px] font-semibold text-amber-700" title="Trùng phân công cùng nhóm trực trong ngày (chỉ cảnh báo, không chặn)">
                                    Trùng phân công
                                  </span>
                                )}
                                {ln.row?.notes && (
                                  <span className="w-full break-words text-[10px] italic leading-snug text-slate-500">
                                    Ghi chú: {ln.row.notes}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
              })
            )}
          </div>
        </>
      ) : (
        <DayFormView
          dateISO={selDay}
          unitId={selUnitId}
          unitName={selUnit?.name || ""}
          rows={rows}
          groups={buildMatrixGroups(rows, positions)}
          info={infoByDay.get(selDay)}
          warnings={warnings.filter((w) => w.includes(fmtDM(selDay)))}
          leaderIds={leaderIds}
          canApprove={canApprove}
          canExport={canExport}
          onEdit={() => setEditorDate(selDay)}
          onInfoSaved={fetchData}
          onQuickExport={async () => {
            if (!selUnitId) {
              toast.error("Chưa xác định bộ phận để xuất — chọn bộ phận trước.");
              return;
            }
            const url = `/api/rosters/export?from=${selDay}&to=${selDay}&unitId=${selUnitId}`;
            await downloadExcel(url, `so-phan-cong_${selUnit?.code || ""}_${selDay}.xlsx`);
          }}
        />
      )}

      {/* Modal phiếu phân công */}
      {editorDate && (
        <DayEditorModal
          key="editor"
          dateISO={editorDate}
          unitId={selUnitId}
          unitName={selUnit?.name || ""}
          onDateChange={(d) => {
            setEditorFocus(null);
            setEditorDate(d);
          }}
          focusCode={editorFocus}
          rows={rows}
          groups={buildMatrixGroups(rows, positions)}
          info={infoByDay.get(editorDate)}
          people={people}
          leaves={leaves}
          canAssign={canApprove}
          onClose={() => {
            setEditorDate(null);
            setEditorFocus(null);
          }}
          onChanged={fetchData}
        />
      )}

      {/* Modal danh mục vị trí (theo bộ phận đang xem) */}
      {showCatalog && (
        <CatalogModal
          unitId={selUnitId}
          unitName={selUnit?.name || ""}
          isUnitLeader={isUnitLeader}
          positions={positions}
          onClose={() => setShowCatalog(false)}
          onChanged={fetchData}
        />
      )}

      {/* Modal xuất Excel (theo bộ phận đang xem) */}
      {showExport && (
        <ExportModal
          defaultFrom={rangeFrom}
          defaultTo={rangeTo}
          unitId={selUnitId}
          unitName={selUnit?.name || ""}
          unitCode={selUnit?.code || ""}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}

/** Tải file Excel qua fetch (giữ phiên đăng nhập) rồi kích hoạt tải xuống. */
async function downloadExcel(url: string, fallbackName: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      toast.error(json.error || "Không thể xuất Excel");
      return false;
    }
    const blob = await res.blob();
    const dispo = res.headers.get("Content-Disposition") || "";
    const m = dispo.match(/filename="([^"]+)"/);
    const name = m?.[1] || fallbackName;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
    toast.success("Đã tạo file Excel phân công.");
    return true;
  } catch (err: any) {
    toast.error("Lỗi xuất Excel: " + err.message);
    return false;
  }
}

/** Chế độ xem theo ngày: bảng đúng cấu trúc biểu mẫu + ô tổng hợp + cảnh báo. */
function DayFormView({
  dateISO,
  unitId,
  unitName,
  rows,
  groups,
  info,
  warnings,
  leaderIds,
  canApprove,
  canExport,
  onEdit,
  onInfoSaved,
  onQuickExport,
}: {
  dateISO: string;
  unitId: string;
  unitName: string;
  rows: DutyRow[];
  groups: MatrixGroup[];
  info: DayInfoRow | undefined;
  warnings: string[];
  leaderIds: Set<string>;
  canApprove: boolean;
  canExport: boolean;
  onEdit: () => void;
  onInfoSaved: () => void;
  onQuickExport: () => Promise<void>;
}) {
  const dayRows = rows.filter((r) => dateKey(r.date) === dateISO);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {canApprove && (
          <button
            data-testid="roster-btn-edit-day"
            onClick={onEdit}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-700 text-white hover:bg-teal-800"
          >
            <span className="material-symbols-outlined text-[16px]">edit</span>
            Phân công ngày này
          </button>
        )}
        {canExport && (
          <button
            data-testid="roster-btn-export-day"
            onClick={() => onQuickExport()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 hover:bg-slate-50"
          >
            <span className="material-symbols-outlined text-[16px]">download</span>
            Xuất Excel ngày này
          </button>
        )}
        {warnings.length > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-amber-700">
            <span className="material-symbols-outlined text-[15px]">warning</span>
            {warnings.length} cảnh báo trong ngày
          </span>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 overflow-x-auto" data-testid="roster-day-form">
        <div className="text-center min-w-[520px]">
          <div className="text-sm font-bold text-slate-800 uppercase">Hải quan cửa khẩu Quốc tế Tà Lùng</div>
          <div className="text-sm font-bold text-slate-800 uppercase mt-0.5" data-testid="roster-day-form-title">
            Phân công nhiệm vụ {unitName || "bộ phận"}
          </div>
          <div className="text-xs italic text-slate-600 mt-0.5 underline underline-offset-4">
            Ngày {String(new Date(dateISO).getDate()).padStart(2, "0")} tháng {new Date(dateISO).getMonth() + 1} năm{" "}
            {new Date(dateISO).getFullYear()}
          </div>
        </div>
        {groups.length === 0 && (
          <div className="mt-2 text-xs text-slate-500 border border-dashed border-slate-300 rounded-lg p-2" data-testid="dayform-empty-catalog">
            Bộ phận đang chọn chưa có danh mục vị trí/nhiệm vụ — vào “Danh mục vị trí” để thiết lập.
          </div>
        )}
        <table className="w-full mt-3 text-xs border-collapse min-w-[520px]">
          <thead>
            <tr>
              <th className="border border-slate-400 px-1 py-1 w-8 font-bold">TT</th>
              <th className="border border-slate-400 px-2 py-1 font-bold text-left">Nhiệm vụ được phân công</th>
              <th className="border border-slate-400 px-2 py-1 font-bold text-left w-[38%]">Người thực hiện</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g, gi) => {
              const lines = slotLinesFor(g, dayRows);
              if (g.kind !== "legacy" && lines.length === 0) {
                return (
                  <tr key={g.code}>
                    <td className="border border-slate-400 px-1 py-1 text-center align-top">{gi + 1}</td>
                    <td className="border border-slate-400 px-2 py-1 align-top">
                      <div className="font-semibold">{g.title}</div>
                      {g.detail && <div className="text-[11px] text-slate-600">{g.detail}</div>}
                    </td>
                    <td className="border border-slate-400 px-2 py-1 align-top text-slate-400">—</td>
                  </tr>
                );
              }
              const taskLines = [g.title];
              if (g.detail) taskLines.push(g.detail);
              for (const s of g.slots) {
                if (s.l && /^vị\s*trí/i.test(s.l)) taskLines.push(s.l);
              }
              return (
                <tr key={g.code}>
                  <td className="border border-slate-400 px-1 py-1 text-center align-top font-bold">{gi + 1}</td>
                  <td className="border border-slate-400 px-2 py-1 align-top">
                    {taskLines.map((t, i) => (
                      <div key={i} className={i === 0 ? "font-semibold" : "text-[11px] text-slate-600"}>
                        {t}
                      </div>
                    ))}
                  </td>
                  <td className="border border-slate-400 px-2 py-1 align-top">
                    {lines.length === 0 ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      lines.map((ln) => (
                        <div key={ln.key} className={`flex flex-wrap items-center gap-1 ${ln.row ? "text-slate-800" : "text-slate-300"}`}>
                          <span>
                            {ln.row
                              ? `${ln.label && ln.label.length <= 3 ? ln.label + " " : ""}đ/c ${ln.row.person.fullName}`
                              : ln.label && ln.label.length <= 3
                                ? `${ln.label} đ/c………`
                                : "đ/c………"}
                          </span>
                          {ln.row?.leaveClash && (
                            <span className="material-symbols-outlined text-[12px] text-amber-500" title="Trùng đơn nghỉ đã duyệt">
                              warning
                            </span>
                          )}
                          {ln.row && ln.row.overlapCount > 1 && !leaderIds.has(ln.row.personId) && (
                            <span className="text-[10px] font-semibold text-amber-700" title="Trùng phân công cùng nhóm trực trong ngày (chỉ cảnh báo, không chặn)">
                              Trùng phân công
                            </span>
                          )}
                          {ln.row?.notes && (
                            <span className="w-full text-[10px] font-normal italic text-slate-600">
                              Ghi chú: {ln.row.notes}
                            </span>
                          )}
                        </div>
                      ))
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="mt-3 text-xs text-slate-700 min-w-[520px]">
          <div className="font-semibold">
            Tổng số công chức: {info?.totalStaff ?? "………"} — Có mặt: {info?.presentStaff ?? "……"} — Vắng:{" "}
            {info?.absentCount ?? "……………"}
          </div>
          <div className="mt-1">Lý do: {info?.absentReason || "……………………………………………………"}</div>
          <div className="mt-1 text-center font-bold mt-4">LÃNH ĐẠO ĐỘI</div>
        </div>
      </div>

      <DayInfoPanel key={dateISO} dateISO={dateISO} unitId={unitId} unitName={unitName} info={info} canAssign={canApprove} onSaved={onInfoSaved} />
    </div>
  );
}

/** Ô tổng hợp theo ngày CỦA TỪNG BỘ PHẬN: Tổng số công chức / Có mặt / Vắng / Lý do (lãnh đạo nhập, biểu in giữ nguyên). */
function DayInfoPanel({
  dateISO,
  unitId,
  unitName,
  info,
  canAssign,
  compact,
  onSaved,
}: {
  dateISO: string;
  unitId: string;
  unitName?: string;
  info: DayInfoRow | undefined;
  canAssign: boolean;
  compact?: boolean;
  onSaved?: () => void;
}) {
  const [total, setTotal] = useState<string>(info?.totalStaff !== null && info?.totalStaff !== undefined ? String(info.totalStaff) : "");
  const [present, setPresent] = useState<string>(info?.presentStaff !== null && info?.presentStaff !== undefined ? String(info.presentStaff) : "");
  const [absent, setAbsent] = useState<string>(info?.absentCount !== null && info?.absentCount !== undefined ? String(info.absentCount) : "");
  const [reason, setReason] = useState<string>(info?.absentReason || "");
  const [busy, setBusy] = useState(false);

  const toIntOrNull = (v: string): number | null | undefined => {
    const t = v.trim();
    if (t === "") return null;
    const n = Number(t);
    if (!Number.isInteger(n) || n < 0 || n > 9999) return undefined;
    return n;
  };

  const save = async () => {
    const t = toIntOrNull(total);
    const p = toIntOrNull(present);
    const a = toIntOrNull(absent);
    if (t === undefined || p === undefined || a === undefined) {
      toast.error("Số liệu phải là số nguyên từ 0 đến 9999");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/rosters/day-info", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitId, date: dateISO, totalStaff: t, presentStaff: p, absentCount: a, absentReason: reason }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("Đã lưu thông tin tổng hợp ngày.");
        onSaved?.();
      } else toast.error(json.error || "Không thể lưu thông tin ngày");
    } catch (err: any) {
      toast.error("Lỗi: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`rounded-xl border border-slate-200 bg-white ${compact ? "p-3" : "p-4"}`}>
      <div className="text-xs font-bold text-slate-700 uppercase">
        Thông tin tổng hợp ngày {fmtDMY(dateISO)}{unitName ? ` — ${unitName}` : ""}
      </div>
      {canAssign ? (
        <div className="mt-2 grid grid-cols-2 lg:grid-cols-5 gap-2 items-end">
          <label className="text-[11px] text-slate-500">
            Tổng số công chức
            <input
              data-testid="dayinfo-total"
              type="number"
              min={0}
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
            />
          </label>
          <label className="text-[11px] text-slate-500">
            Có mặt
            <input
              data-testid="dayinfo-present"
              type="number"
              min={0}
              value={present}
              onChange={(e) => setPresent(e.target.value)}
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
            />
          </label>
          <label className="text-[11px] text-slate-500">
            Vắng
            <input
              data-testid="dayinfo-absent"
              type="number"
              min={0}
              value={absent}
              onChange={(e) => setAbsent(e.target.value)}
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
            />
          </label>
          <label className="text-[11px] text-slate-500 col-span-2 lg:col-span-1">
            Lý do vắng
            <input
              data-testid="dayinfo-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="VD: nghỉ phép, đi công tác…"
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
            />
          </label>
          <button
            data-testid="dayinfo-save"
            onClick={save}
            disabled={busy}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-50"
          >
            {busy ? "Đang lưu…" : "Lưu tổng hợp"}
          </button>
        </div>
      ) : (
        <div className="mt-1 text-xs text-slate-700">
          Tổng số công chức: {info?.totalStaff ?? "—"} · Có mặt: {info?.presentStaff ?? "—"} · Vắng: {info?.absentCount ?? "—"}
          {info?.absentReason ? ` · Lý do: ${info.absentReason}` : ""}
        </div>
      )}
    </div>
  );
}

/** Modal phiếu phân công của một ngày: theo từng vị trí/ô, chọn cán bộ, đổi người kèm lý do. */
function DayEditorModal({
  dateISO,
  unitId,
  unitName,
  onDateChange,
  focusCode,
  rows,
  groups,
  info,
  people,
  leaves,
  canAssign,
  onClose,
  onChanged,
}: {
  dateISO: string;
  unitId: string;
  unitName: string;
  onDateChange: (d: string) => void;
  focusCode?: string | null;
  rows: DutyRow[];
  groups: MatrixGroup[];
  info: DayInfoRow | undefined;
  people: PersonLite[];
  leaves: LeaveLite[];
  canAssign: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [sel, setSel] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  /** Các dòng bổ sung chưa lưu, khóa theo positionId → danh sách slotOrder. */
  const [extraLines, setExtraLines] = useState<Record<string, number[]>>({});

  const dayRows = rows.filter((r) => dateKey(r.date) === dateISO);
  const activeGroups = groups.filter((g) => g.kind !== "legacy" || dayRows.some((r) => !r.positionId));

  // Đổi ngày thì bỏ lựa chọn/nháp của ngày cũ, tránh mang nhầm người sang ngày mới.
  useEffect(() => {
    setSel({});
    setReasons({});
    setExtraLines({});
  }, [dateISO]);

  /** Thêm một dòng trống bổ sung cho vị trí, chỉ áp dụng cho ngày đang xem. */
  const addExtraLine = (g: MatrixGroup) => {
    const pid = g.positionId;
    if (!pid) return;
    const current = extraLines[pid] || [];
    const realExtras = dayRows.filter(
      (r) => r.positionId === pid && typeof r.slotOrder === "number" && r.slotOrder >= g.slots.length
    ).length;
    if (realExtras + current.length >= MAX_EXTRA_SLOTS_PER_POSITION) {
      toast.error(`Mỗi vị trí chỉ được thêm tối đa ${MAX_EXTRA_SLOTS_PER_POSITION} người cho một ngày.`);
      return;
    }
    const used = new Set<number>();
    for (const r of dayRows) {
      if (r.positionId === pid && typeof r.slotOrder === "number") used.add(r.slotOrder);
    }
    for (const n of current) used.add(n);
    let idx = g.slots.length;
    while (used.has(idx)) idx++;
    setExtraLines((prev) => ({ ...prev, [pid]: [...(prev[pid] || []), idx] }));
  };

  // Bấm một ô trên ma trận → mở phiếu và cuộn tới đúng nhóm nhiệm vụ vừa chọn.
  useEffect(() => {
    if (!focusCode) return;
    const t = setTimeout(() => {
      const el = document.querySelector(`[data-testid="editor-pos-${focusCode}"]`);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 120);
    return () => clearTimeout(t);
  }, [focusCode, dateISO]);

  const handleAssign = async (g: MatrixGroup, idx: number, key: string) => {
    const personId = sel[key];
    if (!personId) {
      toast.error("Hãy chọn cán bộ trước khi phân công.");
      return;
    }
    if (!unitId) {
      toast.error("Chưa xác định bộ phận của bảng phân công — chọn bộ phận trước.");
      return;
    }
    const isLeaderPerson = people.find((p) => p.id === personId)?.isLeader === true;
    setBusyKey(key);
    try {
      const res = await fetch("/api/rosters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitId, date: dateISO, personId, positionId: g.positionId, slotOrder: idx }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("Đã phân công nhiệm vụ.");
        if (json.warning) toast.warning(json.warning);
        if (json.crossWarning && !(isLeaderPerson && json.crossWarning.includes("cùng nhóm trực"))) {
          toast.warning(json.crossWarning);
        }
        setSel((s) => ({ ...s, [key]: "" }));
        const pid = g.positionId;
        if (pid) {
          setExtraLines((prev) => {
            const cur = prev[pid];
            if (!cur?.includes(idx)) return prev;
            return { ...prev, [pid]: cur.filter((n) => n !== idx) };
          });
        }
        onChanged();
      } else {
        toast.error(json.error || "Không thể phân công");
      }
    } catch (err: any) {
      toast.error("Lỗi: " + err.message);
    } finally {
      setBusyKey(null);
    }
  };

  const handleChange = async (row: DutyRow, key: string): Promise<boolean> => {
    const personId = sel[key];
    if (!personId || personId === row.personId) {
      toast.error("Chọn cán bộ khác để thay đổi người thực hiện.");
      return false;
    }
    const reason = (reasons[key] || "").trim();
    if (reason.length < 3) {
      toast.error("Đổi người thực hiện phải ghi lý do (tối thiểu 3 ký tự).");
      return false;
    }
    const isLeaderPerson = people.find((p) => p.id === personId)?.isLeader === true;
    setBusyKey(key);
    try {
      const res = await fetch("/api/rosters", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, personId, reason }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("Đã đổi người thực hiện (có lưu vết).");
        if (json.warning) toast.warning(json.warning);
        if (json.crossWarning && !(isLeaderPerson && json.crossWarning.includes("cùng nhóm trực"))) {
          toast.warning(json.crossWarning);
        }
        setSel((s) => ({ ...s, [key]: "" }));
        setReasons((s) => ({ ...s, [key]: "" }));
        onChanged();
        return true;
      }
      toast.error(json.error || "Không thể đổi người thực hiện");
      return false;
    } catch (err: any) {
      toast.error("Lỗi: " + err.message);
      return false;
    } finally {
      setBusyKey(null);
    }
  };

  const handleRemove = async (row: DutyRow, key: string) => {
    if (!confirm(`Gỡ ${row.person.fullName} khỏi vị trí này?`)) return;
    setBusyKey(key);
    try {
      const reason = (reasons[key] || "").trim();
      const res = await fetch(`/api/rosters?id=${row.id}${reason ? `&reason=${encodeURIComponent(reason)}` : ""}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("Đã gỡ phân công.");
        setSel((s) => ({ ...s, [key]: "" }));
        setReasons((s) => ({ ...s, [key]: "" }));
        onChanged();
      } else {
        toast.error(json.error || "Không thể gỡ phân công");
      }
    } catch (err: any) {
      toast.error("Lỗi: " + err.message);
    } finally {
      setBusyKey(null);
    }
  };

  /** Ghi chú per-person nằm trên chính dòng phân công (DutyRoster.notes) — lưu là audit old/new. */
  const handleSaveNotes = async (row: DutyRow, key: string, notes: string): Promise<boolean> => {
    // E13 / A0: ô chưa có người thì không có ghi chú — không gửi request "ghi chú mồ côi".
    if (!row || !hasAssignedPerson(row.personId)) {
      toast.error(NOTES_REQUIRE_PERSON_MESSAGE);
      return false;
    }
    setBusyKey(key);
    try {
      const res = await fetch("/api/rosters", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, notes }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("Đã lưu ghi chú cho người được phân công.");
        onChanged();
        return true;
      }
      toast.error(json.error || "Không thể lưu ghi chú");
      return false;
    } catch (err: any) {
      toast.error("Lỗi: " + err.message);
      return false;
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start lg:items-center justify-center bg-slate-900/50 p-0 lg:p-4">
      <div
        className="w-full lg:max-w-3xl max-h-full lg:max-h-[90vh] overflow-y-auto bg-white rounded-none lg:rounded-2xl shadow-xl"
        data-testid="editor-modal"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 px-4 py-3 bg-white border-b border-slate-200">
          <div>
            <div className="text-sm font-bold text-slate-800" data-testid="editor-title">
              Phiếu phân công ngày {fmtDMY(dateISO)}{unitName ? ` — ${unitName}` : ""}
            </div>
            <div className="text-[11px] text-slate-500">
              Chọn cán bộ cho từng ô; trực trưa tính riêng, không trùng với trực thường. Ghi chú chỉ lưu cho ô đã có người; “Đổi người” phải ghi lý do (lưu vết).
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              data-testid="editor-date-input"
              type="date"
              value={dateISO}
              onChange={(e) => e.target.value && onDateChange(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
            />
            <button
              data-testid="editor-close"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-100"
              aria-label="Đóng"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {activeGroups.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500" data-testid="editor-empty-catalog">
              Bộ phận đang chọn chưa có danh mục vị trí/nhiệm vụ — vào “Danh mục vị trí” trên thanh công cụ để thiết lập trước khi phân công.
            </div>
          )}
          {activeGroups.map((g) => {
            const lines = slotLinesFor(g, dayRows);
            const extraOrders = g.positionId ? extraLines[g.positionId] || [] : [];
            const realExtras = g.positionId
              ? dayRows.filter(
                  (r) => r.positionId === g.positionId && typeof r.slotOrder === "number" && r.slotOrder >= g.slots.length
                ).length
              : 0;
            const atExtraLimit = realExtras + extraOrders.length >= MAX_EXTRA_SLOTS_PER_POSITION;
            return (
              <div
                key={g.code}
                className={`overflow-hidden rounded-xl border ${
                  g.code === focusCode ? "border-teal-400 ring-2 ring-teal-100" : "border-slate-200"
                }`}
                data-testid={`editor-pos-${g.code}`}
              >
                <div className="px-3 py-2 bg-slate-50 border-b border-slate-200">
                  <span className="text-xs font-bold text-slate-700">
                    {g.kind === "legacy" ? g.title : `${g.sortOrder}. ${g.title}`}
                  </span>
                  {g.detail && <span className="text-[11px] text-slate-500"> — {g.detail}</span>}
                  {g.kind === "orphan" && <span className="text-[10px] text-amber-600 italic"> (ngoài danh mục hiện hành)</span>}
                </div>
                <div className="divide-y divide-slate-100">
                  {g.kind === "legacy"
                    ? lines.map((ln, idx) => (
                        <SlotRow
                          key={ln.key}
                          testKey={`CU-${idx}`}
                          label={ln.label}
                          positionTitle={ln.row?.positionTitle ?? g.title}
                          row={ln.row}
                          people={people}
                          dateISO={dateISO}
                          dayRows={dayRows}
                          leaves={leaves}
                          sel={sel}
                          reasons={reasons}
                          busyKey={busyKey}
                          setSel={setSel}
                          setReasons={setReasons}
                          onAssign={() => {}}
                          onChange={handleChange}
                          onRemove={handleRemove}
                          onSaveNotes={handleSaveNotes}
                        />
                      ))
                    : (
                        <>
                          {lines.map((ln, idx) => {
                            const slotIdx = ln.isExtra ? ln.row?.slotOrder ?? null : idx;
                            const key = `${g.positionId}#${ln.isExtra ? `extra-${ln.row?.id ?? idx}` : idx}`;
                            return (
                              <SlotRow
                                key={key}
                                testKey={`${g.code}-${idx}`}
                                label={ln.label ?? (ln.isExtra ? "Bổ sung" : `Người ${idx + 1}`)}
                                positionTitle={ln.row?.positionTitle ?? g.title}
                                row={ln.row}
                                people={people}
                                dateISO={dateISO}
                                dayRows={dayRows}
                                leaves={leaves}
                                sel={sel}
                                reasons={reasons}
                                busyKey={busyKey}
                                setSel={setSel}
                                setReasons={setReasons}
                                onAssign={() => {
                                  if (slotIdx !== null) handleAssign(g, slotIdx, key);
                                }}
                                onChange={handleChange}
                                onRemove={handleRemove}
                                onSaveNotes={handleSaveNotes}
                                selectKey={key}
                              />
                            );
                          })}
                          {extraOrders.map((ord) => {
                            const key = `${g.positionId}#local-${ord}`;
                            return (
                              <SlotRow
                                key={key}
                                testKey={`${g.code}-local-${ord}`}
                                label="Bổ sung"
                                positionTitle={g.title}
                                row={null}
                                people={people}
                                dateISO={dateISO}
                                dayRows={dayRows}
                                leaves={leaves}
                                sel={sel}
                                reasons={reasons}
                                busyKey={busyKey}
                                setSel={setSel}
                                setReasons={setReasons}
                                onAssign={() => handleAssign(g, ord, key)}
                                onChange={handleChange}
                                onRemove={handleRemove}
                                onSaveNotes={handleSaveNotes}
                                selectKey={key}
                              />
                            );
                          })}
                        </>
                      )}
                </div>
                {canAssign && g.kind === "catalog" && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-teal-50/30 px-3 py-2">
                    <button
                      type="button"
                      data-testid={`editor-add-person-${g.code}`}
                      onClick={() => addExtraLine(g)}
                      disabled={atExtraLimit}
                      className="inline-flex items-center gap-1 rounded-lg border border-teal-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-teal-700 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
                      title={`Thêm một người vào vị trí này, chỉ áp dụng cho ngày ${fmtDMY(dateISO)}`}
                    >
                      <span className="material-symbols-outlined text-[15px]">person_add</span>
                      Thêm người cho ngày này
                    </button>
                    <span className="text-[10px] text-slate-500">
                      {atExtraLimit
                        ? `Đã đạt tối đa ${MAX_EXTRA_SLOTS_PER_POSITION} dòng bổ sung.`
                        : "Chỉ áp dụng ngày đang xem; muốn cố định, dùng “Danh mục vị trí”."}
                    </span>
                  </div>
                )}
              </div>
            );
          })}

          {canAssign && (
            <DayInfoPanel
              key={`${dateISO}-info`}
              dateISO={dateISO}
              unitId={unitId}
              unitName={unitName}
              info={info}
              canAssign={canAssign}
              compact
              onSaved={onChanged}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** Một ô phân công trong phiếu: xem/sửa ghi chú, đổi người kèm lý do, gỡ ô. */
function SlotRow({
  testKey,
  label,
  positionTitle,
  row,
  people,
  dateISO,
  dayRows,
  leaves,
  sel,
  reasons,
  busyKey,
  setSel,
  setReasons,
  onAssign,
  onChange,
  onRemove,
  onSaveNotes,
  selectKey,
}: {
  testKey: string;
  label: string | null;
  positionTitle?: string | null;
  row: DutyRow | null;
  people: PersonLite[];
  dateISO: string;
  dayRows: DutyRow[];
  leaves: LeaveLite[];
  sel: Record<string, string>;
  reasons: Record<string, string>;
  busyKey: string | null;
  setSel: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setReasons: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onAssign: () => void;
  onChange: (row: DutyRow, key: string) => Promise<boolean>;
  onRemove: (row: DutyRow, key: string) => void;
  onSaveNotes: (row: DutyRow, key: string, notes: string) => Promise<boolean>;
  selectKey?: string;
}) {
  const key = selectKey || testKey;
  const selected = sel[key] ?? "";
  const busy = busyKey === key;
  const occupied = !!row;
  const changed = occupied && !!selected && selected !== row!.personId;
  const selectedPerson = selected ? people.find((p) => p.id === selected) : undefined;
  const rowPersonIsLeader = row ? people.find((p) => p.id === row.personId)?.isLeader === true : false;
  const prewarns = selected
    ? prewarnFor(
        selected,
        dateISO,
        dayRows.filter((r) => r.id !== row?.id),
        leaves,
        positionTitle,
        selectedPerson?.isLeader === true
      )
    : [];

  /** "note" = mở ô ghi chú; "change" = mở thao tác đổi người tách riêng. */
  const [panel, setPanel] = useState<"note" | "change" | null>(null);
  const [noteDraft, setNoteDraft] = useState(row?.notes || "");

  useEffect(() => {
    setNoteDraft(row?.notes || "");
    setPanel(null);
    // Đổi ngày/đổi dòng phân công thì đóng nháp ghi chú của dòng cũ.
  }, [dateISO, row?.id]);

  const noteChanged = (noteDraft.trim() || "") !== (row?.notes?.trim() || "");

  const saveNotes = async () => {
    // E13 / A0: chỉ ô ĐÃ CÓ NGƯỜI mới có ghi chú; ô trống không mở được panel này.
    if (!row || !hasAssignedPerson(row.personId)) {
      toast.error(NOTES_REQUIRE_PERSON_MESSAGE);
      return;
    }
    if (!noteChanged) {
      setPanel(null);
      return;
    }
    const ok = await onSaveNotes(row, key, noteDraft);
    if (ok) setPanel(null);
  };

  const saveChange = async () => {
    if (!row) return;
    const ok = await onChange(row, key);
    if (ok) setPanel(null);
  };

  const options = useMemo(() => {
    const list = people.slice();
    if (row && !list.some((p) => p.id === row.person.id)) {
      list.push({ id: row.person.id, fullName: row.person.fullName, isLeader: false });
    }
    return list;
  }, [people, row]);

  return (
    <div className="px-3 py-2" data-testid={`slot-row-${testKey}`}>
      <div className="flex flex-col lg:flex-row lg:items-start gap-2">
        <div className="lg:w-[24%] text-[11px] font-semibold text-slate-600">
          {label || "—"}
          {occupied && row!.reason && (
            <span className="block text-[10px] text-slate-400 font-normal">Lý do đổi gần nhất: {row!.reason}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          {occupied ? (
            <>
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="font-semibold text-slate-800 truncate">{row!.person.fullName}</span>
                {row!.leaveClash && (
                  <span className="material-symbols-outlined text-[14px] text-amber-500" title="Trùng đơn nghỉ đã duyệt">
                    warning
                  </span>
                )}
                {row!.overlapCount > 1 && !rowPersonIsLeader && (
                  <span
                    className="text-[10px] font-semibold text-amber-700"
                    title="Trùng phân công cùng nhóm trực trong ngày (chỉ cảnh báo, không chặn)"
                  >
                    Trùng phân công
                  </span>
                )}
              </div>
              {row!.notes ? (
                <div className="mt-0.5 text-[10px] italic leading-snug text-slate-500" data-testid={`slot-notes-view-${testKey}`}>
                  Ghi chú: {row!.notes}
                </div>
              ) : (
                <div className="mt-0.5 text-[10px] italic text-slate-400" data-testid={`slot-notes-view-${testKey}`}>
                  Chưa có ghi chú
                </div>
              )}
            </>
          ) : (
            <span className="text-xs text-slate-400 italic">— trống —</span>
          )}
          {prewarns.length > 0 && (
            <div className="mt-0.5 text-[10px] text-amber-700" data-testid={`slot-warn-${testKey}`}>
              {prewarns.map((w, i) => (
                <div key={i}>⚠ {w}</div>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1.5 lg:w-[54%]">
          {occupied ? (
            <>
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  data-testid={`slot-notes-${testKey}`}
                  disabled={busy}
                  onClick={() => setPanel(panel === "note" ? null : "note")}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  <span className="material-symbols-outlined text-[14px]">sticky_note_2</span>
                  {row!.notes ? "Sửa ghi chú" : "Ghi chú"}
                </button>
                <button
                  type="button"
                  data-testid={`slot-change-${testKey}`}
                  disabled={busy}
                  onClick={() => setPanel(panel === "change" ? null : "change")}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  <span className="material-symbols-outlined text-[14px]">swap_horiz</span>
                  Đổi người
                </button>
                <button
                  type="button"
                  data-testid={`slot-remove-${testKey}`}
                  disabled={busy}
                  onClick={() => onRemove(row!, key)}
                  className="px-2 py-1.5 text-[11px] font-semibold rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-40"
                >
                  Gỡ
                </button>
              </div>

              {panel === "note" && (
                <div className="rounded-lg border border-teal-200 bg-teal-50/30 p-2">
                  <textarea
                    data-testid={`slot-notes-input-${testKey}`}
                    value={noteDraft}
                    maxLength={1000}
                    rows={2}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder="Ghi chú cho người/vị trí này (VD: bàn giao ca, kiêm nhiệm…)"
                    className="w-full resize-y rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
                  />
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-1">
                    <span className="text-[10px] text-slate-400">{noteDraft.trim().length}/1000 ký tự</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        data-testid={`slot-notes-save-${testKey}`}
                        disabled={!noteChanged || busy}
                        onClick={saveNotes}
                        className="px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-40"
                      >
                        {busy ? "…" : "Lưu ghi chú"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNoteDraft(row!.notes || "");
                          setPanel(null);
                        }}
                        className="px-2 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                      >
                        Hủy
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {panel === "change" && (
                <div className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50/30 p-2">
                  <select
                    data-testid={`slot-select-${testKey}`}
                    value={selected}
                    onChange={(e) => setSel((s) => ({ ...s, [key]: e.target.value }))}
                    className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
                  >
                    <option value="">Chọn người thay thế…</option>
                    {options.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.fullName}
                      </option>
                    ))}
                  </select>
                  {changed && (
                    <input
                      data-testid={`slot-reason-${testKey}`}
                      value={reasons[key] || ""}
                      onChange={(e) => setReasons((s) => ({ ...s, [key]: e.target.value }))}
                      placeholder="Lý do thay đổi (bắt buộc, tối thiểu 3 ký tự)"
                      className="w-full min-w-0 rounded-lg border border-amber-300 bg-white px-2 py-1.5 text-xs"
                    />
                  )}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      data-testid={`slot-save-${testKey}`}
                      disabled={!changed || busy}
                      onClick={saveChange}
                      className="px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-40"
                    >
                      {busy ? "…" : "Lưu đổi người"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSel((s) => ({ ...s, [key]: "" }));
                        setReasons((s) => ({ ...s, [key]: "" }));
                        setPanel(null);
                      }}
                      className="px-2 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                    >
                      Hủy
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5">
              <select
                data-testid={`slot-select-${testKey}`}
                value={selected}
                onChange={(e) => setSel((s) => ({ ...s, [key]: e.target.value }))}
                className="flex-1 min-w-0 rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
              >
                <option value="">Chọn cán bộ…</option>
                {options.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName}
                  </option>
                ))}
              </select>
              <button
                type="button"
                data-testid={`slot-save-${testKey}`}
                disabled={!selected || busy}
                onClick={onAssign}
                className="px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-40"
              >
                {busy ? "…" : "Phân công"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Modal quản lý danh mục vị trí CỦA BỘ PHẬN ĐANG XEM: sửa không làm thay đổi phân công đã ghi. */
function CatalogModal({
  unitId,
  unitName,
  isUnitLeader,
  positions,
  onClose,
  onChanged,
}: {
  unitId: string;
  unitName: string;
  isUnitLeader: boolean;
  positions: CatalogPosition[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, { title: string; detail: string; sortOrder: number; status: string; slots: DutySlotDef[] }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newDetail, setNewDetail] = useState("");

  const draftOf = (p: CatalogPosition) =>
    drafts[p.id] || { title: p.title, detail: p.detail || "", sortOrder: p.sortOrder, status: p.status, slots: p.slots.map((s) => ({ ...s })) };

  const patchDraft = (p: CatalogPosition, patch: Partial<{ title: string; detail: string; sortOrder: number; status: string; slots: DutySlotDef[] }>) => {
    setDrafts((d) => ({ ...d, [p.id]: { ...draftOf(p), ...patch } }));
  };

  const save = async (p: CatalogPosition) => {
    const d = draftOf(p);
    setBusy(p.id);
    try {
      const res = await fetch("/api/rosters/positions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id, title: d.title, detail: d.detail || null, sortOrder: d.sortOrder, status: d.status, slots: d.slots }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(`Đã lưu vị trí ${p.code}. (Phân công cũ giữ nguyên nội dung đã ghi.)`);
        setDrafts((d) => {
          const c = { ...d };
          delete c[p.id];
          return c;
        });
        onChanged();
      } else {
        toast.error(json.error || "Không thể lưu vị trí");
      }
    } catch (err: any) {
      toast.error("Lỗi: " + err.message);
    } finally {
      setBusy(null);
    }
  };

  const seedDefaults = async () => {
    if (!unitId) {
      toast.error("Chưa xác định bộ phận — chọn bộ phận trước.");
      return;
    }
    setBusy("seed");
    try {
      const res = await fetch("/api/rosters/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "seed-defaults", unitId }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(json.message || "Đã khôi phục danh mục mẫu.");
        onChanged();
      } else {
        toast.error(json.error || "Không thể khôi phục danh mục mẫu");
      }
    } finally {
      setBusy(null);
    }
  };

  const createNew = async () => {
    if (!newTitle.trim()) {
      toast.error("Nhập tên vị trí/nhiệm vụ mới.");
      return;
    }
    if (!unitId) {
      toast.error("Chưa xác định bộ phận — chọn bộ phận trước.");
      return;
    }
    setBusy("new");
    try {
      const res = await fetch("/api/rosters/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitId, title: newTitle.trim(), detail: newDetail.trim() || null, slots: [{ k: "s1", l: null }] }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("Đã thêm vị trí mới.");
        setNewTitle("");
        setNewDetail("");
        onChanged();
      } else {
        toast.error(json.error || "Không thể thêm vị trí");
      }
    } finally {
      setBusy(null);
    }
  };

  const nextSlotKey = (slots: DutySlotDef[]): string => {
    for (let i = 1; i <= 12; i++) {
      const k = `s${i}`;
      if (!slots.some((s) => s.k === k)) return k;
    }
    return `s${slots.length + 1}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start lg:items-center justify-center bg-slate-900/50 p-0 lg:p-4">
      <div className="w-full lg:max-w-3xl max-h-full lg:max-h-[90vh] overflow-y-auto bg-white rounded-none lg:rounded-2xl shadow-xl" data-testid="catalog-modal">
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200">
          <div>
            <div className="text-sm font-bold text-slate-800">Danh mục vị trí/nhiệm vụ phân công</div>
            <div className="text-[11px] text-slate-500">
              Bộ phận: <span className="font-semibold text-slate-700">{unitName || "—"}</span>. Sửa/xếp lại danh mục không làm thay đổi phân công đã ghi.
              Muốn thêm người riêng cho một ngày, dùng “Thêm người cho ngày này” trong phiếu phân công.
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100" aria-label="Đóng" data-testid="catalog-close">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="p-4 space-y-4">
          {isUnitLeader && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                data-testid="catalog-seed-btn"
                onClick={seedDefaults}
                disabled={busy === "seed"}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
              >
                Khôi phục 8 vị trí mẫu còn thiếu (cho bộ phận đang xem)
              </button>
              <span className="text-[11px] text-slate-500">
                Danh mục mẫu gắn với ĐÚNG bộ phận đang chọn — không tự áp dụng cho bộ phận khác; phân công đã ghi giữ nguyên.
              </span>
            </div>
          )}

          {positions.map((p) => {
            const d = draftOf(p);
            return (
              <div key={p.id} className="rounded-xl border border-slate-200 p-3 space-y-2" data-testid={`catalog-pos-${p.code}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-500">{p.code}</span>
                  <input
                    data-testid={`catalog-title-${p.code}`}
                    value={d.title}
                    onChange={(e) => patchDraft(p, { title: e.target.value })}
                    className="flex-1 min-w-[200px] rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold"
                    placeholder="Tên nhiệm vụ (dòng 1)"
                  />
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={d.sortOrder}
                    onChange={(e) => patchDraft(p, { sortOrder: Number(e.target.value) || 1 })}
                    className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                    title="Số TT trên biểu"
                  />
                  <button
                    data-testid={`catalog-toggle-${p.code}`}
                    onClick={() => patchDraft(p, { status: d.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" })}
                    className={`px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border ${d.status === "ACTIVE" ? "border-emerald-200 text-emerald-700 bg-emerald-50" : "border-slate-200 text-slate-500 bg-slate-50"}`}
                  >
                    {d.status === "ACTIVE" ? "Đang dùng" : "Ngừng dùng"}
                  </button>
                </div>
                <input
                  data-testid={`catalog-detail-${p.code}`}
                  value={d.detail}
                  onChange={(e) => patchDraft(p, { detail: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                  placeholder="Dòng phụ (nếu mẫu có) — VD: Kiểm tra Thuế, lệ phí HQ & Đối chiếu phí cơ sở hạ tầng"
                />
                <div className="space-y-1.5">
                  {d.slots.map((s, idx) => (
                    <div key={s.k} className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 w-8">Ô {idx + 1}</span>
                      <input
                        data-testid={`catalog-slot-${p.code}-${idx}`}
                        value={s.l ?? ""}
                        onChange={(e) => {
                          const slots = d.slots.map((x, i) => (i === idx ? { ...x, l: e.target.value.trim() === "" ? null : e.target.value } : x));
                          patchDraft(p, { slots });
                        }}
                        className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs"
                        placeholder="Nhãn ô (VD: NC, XC, Vị trí bãi Phú Anh) — để trống nếu ô không nhãn"
                      />
                      <button
                        onClick={() => patchDraft(p, { slots: d.slots.filter((_, i) => i !== idx) })}
                        disabled={d.slots.length <= 1}
                        className="px-2 py-1 text-[11px] rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-40"
                      >
                        Bỏ
                      </button>
                    </div>
                  ))}
                  <button
                    data-testid={`catalog-slot-add-${p.code}`}
                    onClick={() => patchDraft(p, { slots: [...d.slots, { k: nextSlotKey(d.slots), l: null }] })}
                    disabled={d.slots.length >= 12}
                    className="px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                  >
                    + Thêm ô
                  </button>
                </div>
                <div className="flex justify-end">
                  <button
                    data-testid={`catalog-save-${p.code}`}
                    onClick={() => save(p)}
                    disabled={busy === p.id}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-50"
                  >
                    Lưu {p.code}
                  </button>
                </div>
              </div>
            );
          })}

          <div className="rounded-xl border border-dashed border-slate-300 p-3 space-y-2">
            <div className="text-xs font-bold text-slate-600">Thêm vị trí mới</div>
            <input
              data-testid="catalog-new-title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
              placeholder="Tên vị trí/nhiệm vụ"
            />
            <input
              data-testid="catalog-new-detail"
              value={newDetail}
              onChange={(e) => setNewDetail(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
              placeholder="Dòng phụ (không bắt buộc)"
            />
            <div className="flex justify-end">
              <button
                data-testid="catalog-add-btn"
                onClick={createNew}
                disabled={busy === "new"}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-teal-200 text-teal-700 hover:bg-teal-50 disabled:opacity-50"
              >
                Thêm vị trí
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Modal xuất Excel theo kỳ/ngày CỦA BỘ PHẬN ĐANG XEM (không trộn dữ liệu giữa các bộ phận). */
function ExportModal({
  defaultFrom,
  defaultTo,
  unitId,
  unitName,
  unitCode,
  onClose,
}: {
  defaultFrom: string;
  defaultTo: string;
  unitId: string;
  unitName: string;
  unitCode: string;
  onClose: () => void;
}) {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [skipEmpty, setSkipEmpty] = useState(false);
  const [cover, setCover] = useState(true);
  const [busy, setBusy] = useState(false);

  const download = async () => {
    if (!unitId) {
      toast.error("Chưa xác định bộ phận cần xuất — chọn bộ phận trước.");
      return;
    }
    if (!from || !to) {
      toast.error("Chọn khoảng ngày cần xuất.");
      return;
    }
    const span = (new Date(to).getTime() - new Date(from).getTime()) / 86400000;
    if (span < 0) {
      toast.error("Khoảng ngày không hợp lệ.");
      return;
    }
    if (span > 31) {
      toast.error("Mỗi lần xuất tối đa 31 ngày — hãy tách thành nhiều kỳ.");
      return;
    }
    setBusy(true);
    const params = new URLSearchParams({ from, to, unitId });
    if (skipEmpty) params.set("skipEmpty", "1");
    if (!cover) params.set("cover", "0");
    const ok = await downloadExcel(`/api/rosters/export?${params.toString()}`, `so-phan-cong_${unitCode}_${from}_${to}.xlsx`);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl" data-testid="export-dialog">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <div>
            <div className="text-sm font-bold text-slate-800">Xuất Excel phân công nhiệm vụ</div>
            <div className="text-[11px] text-slate-500">
              Bộ phận xuất: <span className="font-semibold text-slate-700">{unitName || "—"}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100" aria-label="Đóng">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-slate-500">
              Từ ngày
              <input
                data-testid="export-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
              />
            </label>
            <label className="text-[11px] text-slate-500">
              Đến ngày
              <input
                data-testid="export-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input data-testid="export-skip-empty" type="checkbox" checked={skipEmpty} onChange={(e) => setSkipEmpty(e.target.checked)} />
            Bỏ qua ngày chưa có phân công (không in khối trống)
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input data-testid="export-cover" type="checkbox" checked={cover} onChange={(e) => setCover(e.target.checked)} />
            Kèm trang bìa “Sổ phân công nhiệm vụ”
          </label>
          <div className="text-[11px] text-slate-500 bg-slate-50 rounded-lg p-2">
            File giữ cấu trúc mẫu: mỗi ngày một khối, 4 khối/trang in A4 ngang; tiêu đề &amp; trang bìa thể hiện đúng bộ phận được
            xuất; ô tổng hợp chỉ điền khi đã nhập.
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 hover:bg-slate-50">
              Hủy
            </button>
            <button
              data-testid="export-download"
              onClick={download}
              disabled={busy || !unitId}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-50"
            >
              {busy ? "Đang tạo file…" : "Tải xuống .xlsx"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
