import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import type { SessionUser } from "./auth";
import { checkPermission } from "./guard";
import { getIsoWeekBounds, getVnDateParts } from "@/lib/period-helper";

const D = Prisma.Decimal;
export type Dec = Prisma.Decimal;

// ============================================================
// Ngày (date-only, mốc UTC 00:00 — khớp cột DATE trong Postgres)
// ============================================================

export function dateOnly(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

export function dateOnlyFromStr(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return dateOnly(y, mo, d);
}

export function dateOnlyToStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function dateOnlyVnFromInstant(d: Date): Date {
  const p = getVnDateParts(d);
  return dateOnly(p.year, p.month, p.day);
}

export function todayVnDateOnly(): Date {
  return dateOnlyVnFromInstant(new Date());
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// ============================================================
// Quyền cấu hình & nhập liệu
// ============================================================

export function isMetricsAdmin(user: SessionUser): boolean {
  return user.role === "UNIT_LEADER" || checkPermission(user, "system.config");
}

export interface ResolvedAssignment {
  groupId: string | null;
  metricId: string | null;
  canEnter: boolean;
  canConfirm: boolean;
  allowBackdateDays: number | null;
  validFrom: Date | null;
  validTo: Date | null;
}

export interface ResolvedEntryPerms {
  all: boolean; // lãnh đạo: mọi chỉ tiêu
  assignments: ResolvedAssignment[];
  allowBackdateDays: number; // -1 = không giới hạn (của lãnh đạo)
}

export async function resolveEntryPerms(user: SessionUser): Promise<ResolvedEntryPerms> {
  if (isMetricsAdmin(user)) {
    return { all: true, assignments: [], allowBackdateDays: -1 };
  }
  const rows = await prisma.metricEntryAssignment.findMany({
    where: { personId: user.personId, active: true },
  });
  const today = todayVnDateOnly().getTime();
  const assignments: ResolvedAssignment[] = rows
    .filter((r) => {
      if (r.validFrom && r.validFrom.getTime() > today) return false;
      if (r.validTo && r.validTo.getTime() < today) return false;
      return true;
    })
    .map((r) => ({
      groupId: r.groupId,
      metricId: r.metricId,
      canEnter: r.canEnter,
      canConfirm: r.canConfirm,
      allowBackdateDays: r.allowBackdateDays,
      validFrom: r.validFrom,
      validTo: r.validTo,
    }));
  return { all: false, assignments, allowBackdateDays: 0 };
}

export function permForMetric(
  perms: ResolvedEntryPerms,
  metric: { id: string; groupId: string; allowBackdateDays: number }
): { canEnter: boolean; canConfirm: boolean; backdateDays: number } {
  if (perms.all) return { canEnter: true, canConfirm: true, backdateDays: -1 };
  let canEnter = false;
  let canConfirm = false;
  let backdate = metric.allowBackdateDays;
  for (const a of perms.assignments) {
    const match = a.metricId ? a.metricId === metric.id : a.groupId === metric.groupId;
    if (!match) continue;
    if (a.canEnter) canEnter = true;
    if (a.canConfirm) canConfirm = true;
    if (a.allowBackdateDays !== null && a.allowBackdateDays > backdate) backdate = a.allowBackdateDays;
  }
  return { canEnter, canConfirm, backdateDays: backdate };
}

/** Kiểm tra ngày nhập có nằm trong phạm vi được phép (theo backdateDays / validFrom-validTo). */
export function isEntryDateAllowed(
  entryDate: Date,
  today: Date,
  backdateDays: number,
  perms: ResolvedEntryPerms,
  metric: { id: string; groupId: string }
): { ok: boolean; reason?: string } {
  const t = today.getTime();
  const e = entryDate.getTime();
  if (e > t) return { ok: false, reason: "Không được nhập số liệu cho ngày trong tương lai" };
  if (perms.all) return { ok: true };
  if (backdateDays >= 0) {
    const min = t - backdateDays * 86400000;
    if (e < min)
      return {
        ok: false,
        reason: `Chỉ được nhập/sửa trong ${backdateDays} ngày gần nhất (cấu hình ở mục Phân công / Chỉ tiêu)`,
      };
  }
  for (const a of perms.assignments) {
    const match = a.metricId ? a.metricId === metric.id : a.groupId === metric.groupId;
    if (!match) continue;
    if (a.validFrom && e < a.validFrom.getTime()) continue;
    if (a.validTo && e > a.validTo.getTime()) continue;
    return { ok: true };
  }
  return { ok: false, reason: "Bạn không được phân công nhập chỉ tiêu này trong khoảng ngày đã chọn" };
}

// ============================================================
// Kiểu cấu hình
// ============================================================

export type ValueKind = "FLOW" | "BALANCE" | "DERIVED";

export interface MetricDerivation {
  terms: { metricId: string; sign: number }[];
  includeBaseline: boolean;
}

export function parseDerivation(json: unknown): MetricDerivation {
  const empty: MetricDerivation = { terms: [], includeBaseline: false };
  if (!json || typeof json !== "object") return empty;
  const obj = json as any;
  const terms: { metricId: string; sign: number }[] = [];
  if (Array.isArray(obj.terms)) {
    for (const t of obj.terms) {
      if (t && typeof t.metricId === "string") {
        terms.push({ metricId: t.metricId, sign: t.sign === -1 ? -1 : 1 });
      }
    }
  }
  return { terms, includeBaseline: obj.includeBaseline === true };
}

export function defaultUnitLabel(unitType: string, displayScale: number, unitLabel: string | null): string {
  if (unitLabel && unitLabel.trim()) return unitLabel.trim();
  if (unitType === "USD") return "USD";
  if (unitType === "VND") {
    if (displayScale >= 1000000000) return "tỷ đồng";
    if (displayScale >= 1000000) return "triệu đồng";
    return "đồng";
  }
  return "";
}

// ============================================================
// Tổng hợp số liệu (Tuần / Tháng / Quý / Năm) + mốc lũy kế
// ============================================================

export interface SummaryAnchors {
  year: number;
  weekNumber: number;
  month: number; // 1-12
  quarter: number; // 1-4
}

interface EntryRow {
  id: string;
  metricId: string;
  classificationId: string;
  entryDate: Date;
  valueNumeric: Prisma.Decimal;
  status: string;
  enteredById: string;
  updatedAt: Date;
}

interface BaselineRow {
  metricId: string;
  classificationId: string;
  cumKind: string;
  asOfDate: Date;
  valueNumeric: Prisma.Decimal;
  status: string;
}

export interface MetricSummaryRow {
  id: string;
  code: string;
  name: string;
  unitType: string;
  unitLabel: string;
  displayScale: number;
  decimals: number;
  valueKind: ValueKind;
  requireConfirm: boolean;
  expectDaily: boolean;
  note: string | null;
  cols: { week: number | null; month: number | null; quarter: number | null; year: number | null };
  classCols: {
    classificationId: string;
    label: string;
    cols: { week: number | null; month: number | null; quarter: number | null; year: number | null };
    latestDate: string | null;
  }[];
  targets: { label: string; periodType: string; periodNo: number | null; targetValue: number; percent: number | null }[];
  latest: { date: string; value: number; status: string; byName: string | null } | null;
  missingDates: string[];
  latestDate: string | null;
}

export interface MetricSummaryGroup {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  metrics: MetricSummaryRow[];
}

export interface MetricSummaryResult {
  range: {
    week: { year: number; weekNumber: number; label: string; startDate: string; endDate: string };
    month: { year: number; month: number; label: string };
    quarter: { year: number; quarter: number; label: string };
    year: { year: number; label: string };
  };
  groups: MetricSummaryGroup[];
}

interface RangePair {
  start: Date;
  end: Date;
}

export async function computeMetricSummary(
  anchors: SummaryAnchors,
  scope: "full" | "dashboard" = "full"
): Promise<MetricSummaryResult> {
  const { year, weekNumber, month, quarter } = anchors;

  const weekInfo = getIsoWeekBounds(year, weekNumber);
  const weekRange: RangePair = {
    start: dateOnlyVnFromInstant(weekInfo.startAt),
    end: dateOnlyVnFromInstant(weekInfo.endInclusive),
  };
  const monthRange: RangePair = {
    start: dateOnly(year, month, 1),
    end: dateOnly(year, month, daysInMonth(year, month)),
  };
  const qStartMonth = (quarter - 1) * 3 + 1;
  const quarterRange: RangePair = {
    start: dateOnly(year, qStartMonth, 1),
    end: dateOnly(year, qStartMonth + 2, daysInMonth(year, qStartMonth + 2)),
  };
  const yearRange: RangePair = { start: dateOnly(year, 1, 1), end: dateOnly(year, 12, 31) };

  // --- 1. Cấu hình ---
  const groups = await prisma.metricGroup.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  const metrics = await prisma.metricDefinition.findMany({
    where: {
      active: true,
      group: { active: true },
      ...(scope === "dashboard" ? { showOnDashboard: true } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  const metricIds = metrics.map((m) => m.id);

  const [classifications, targets, baselines] = await Promise.all([
    prisma.metricClassification.findMany({
      where: { metricId: { in: metricIds }, active: true },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    }),
    prisma.metricPlanTarget.findMany({ where: { metricId: { in: metricIds } } }),
    prisma.metricBaseline.findMany({
      where: { metricId: { in: metricIds }, status: "CONFIRMED" },
    }),
  ]);

  // --- 2. Tải bản ghi một lần ---
  const minLedgerAsOf = baselines
    .filter((b) => b.cumKind === "LEDGER")
    .reduce<Date | null>((acc, b) => (!acc || b.asOfDate.getTime() < acc.getTime() ? b.asOfDate : acc), null);
  let minNeeded = new Date(Math.min(yearRange.start.getTime(), weekRange.start.getTime()));
  if (minLedgerAsOf && minLedgerAsOf.getTime() < minNeeded.getTime()) minNeeded = minLedgerAsOf;
  const maxNeeded = new Date(Math.max(yearRange.end.getTime(), weekRange.end.getTime()));

  const entries = metricIds.length
    ? await prisma.metricDailyEntry.findMany({
        where: { metricId: { in: metricIds }, entryDate: { gte: minNeeded, lte: maxNeeded } },
        orderBy: { entryDate: "asc" },
        select: {
          id: true,
          metricId: true,
          classificationId: true,
          entryDate: true,
          valueNumeric: true,
          status: true,
          enteredById: true,
          updatedAt: true,
        },
      })
    : [];

  // Gộp theo metricId (mọi phân loại)
  const entriesByMetric = new Map<string, EntryRow[]>();
  for (const e of entries) {
    const arr = entriesByMetric.get(e.metricId) || [];
    arr.push(e);
    entriesByMetric.set(e.metricId, arr);
  }
  const baselinesByMetric = new Map<string, BaselineRow[]>();
  for (const b of baselines) {
    const arr = baselinesByMetric.get(b.metricId) || [];
    arr.push(b);
    baselinesByMetric.set(b.metricId, arr);
  }

  // Tên người nhập cho "latest"
  const personIds = Array.from(new Set(entries.map((e) => e.enteredById)));
  const persons = personIds.length
    ? await prisma.person.findMany({ where: { id: { in: personIds } }, select: { id: true, fullName: true } })
    : [];
  const personName = new Map(persons.map((p) => [p.id, p.fullName]));

  const today = todayVnDateOnly();

  // --- 3. Hàm tính ---
  const sumBetween = (list: EntryRow[], from: Date, to: Date): Dec => {
    let acc = new D(0);
    for (const e of list) {
      const t = e.entryDate.getTime();
      if (t >= from.getTime() && t <= to.getTime()) acc = acc.add(e.valueNumeric);
    }
    return acc;
  };
  const latestUpTo = (list: EntryRow[], to: Date): EntryRow | null => {
    let found: EntryRow | null = null;
    for (const e of list) {
      if (e.entryDate.getTime() <= to.getTime()) {
        if (!found || e.entryDate.getTime() >= found.entryDate.getTime()) found = e;
      }
    }
    return found;
  };

  const baselineFor = (
    metricId: string,
    classificationId: string,
    cumKind: string,
    periodStart: Date,
    periodEnd: Date,
    to: Date
  ): BaselineRow | null => {
    const list = baselinesByMetric.get(metricId) || [];
    let found: BaselineRow | null = null;
    for (const b of list) {
      if (b.cumKind !== cumKind) continue;
      if (b.classificationId !== classificationId) continue;
      const t = b.asOfDate.getTime();
      if (t > to.getTime()) continue;
      if (cumKind !== "LEDGER" && (t < periodStart.getTime() || t > periodEnd.getTime())) continue;
      if (!found || t > found.asOfDate.getTime()) found = b;
    }
    return found;
  };

  const metricById = new Map(metrics.map((m) => [m.id, m]));

  /** Giá trị của 1 chỉ tiêu / 1 phân loại cho một khoảng (kỳ). depth để chặn vòng lặp công thức. */
  const valueOf = (
    metricId: string,
    classificationId: string,
    range: RangePair,
    cumKind: "WEEK" | "MONTH" | "QUARTER" | "YEAR",
    depth: number
  ): Dec | null => {
    if (depth > 4) return null;
    const metric = metricById.get(metricId);
    if (!metric) return null;
    const list = (entriesByMetric.get(metricId) || []).filter((e) => e.classificationId === classificationId);

    if (metric.valueKind === "FLOW") {
      if (cumKind !== "WEEK") {
        const b = baselineFor(metricId, classificationId, cumKind, range.start, range.end, range.end);
        if (b) {
          const from = new Date(b.asOfDate.getTime() + 86400000);
          return b.valueNumeric.add(sumBetween(list, from, range.end));
        }
      }
      const hasInRange = list.some(
        (e) => e.entryDate.getTime() >= range.start.getTime() && e.entryDate.getTime() <= range.end.getTime()
      );
      return hasInRange ? sumBetween(list, range.start, range.end) : null;
    }

    if (metric.valueKind === "BALANCE") {
      const latest = latestUpTo(list, range.end);
      return latest ? latest.valueNumeric : null;
    }

    // DERIVED
    const deriv = parseDerivation(metric.derivation);
    if (deriv.terms.length === 0) return null;
    const ledger = baselineFor(metricId, classificationId, "LEDGER", range.start, range.end, range.end);
    let acc = new D(0);
    let any = false;
    if (deriv.includeBaseline && ledger) {
      acc = acc.add(ledger.valueNumeric);
      any = true;
      const from = new Date(ledger.asOfDate.getTime() + 86400000);
      for (const t of deriv.terms) {
        const termMetric = metricById.get(t.metricId);
        if (!termMetric) continue;
        const termList = (entriesByMetric.get(t.metricId) || []).filter(
          (e) => e.classificationId === classificationId
        );
        if (termMetric.valueKind === "BALANCE") {
          const latest = latestUpTo(termList, range.end);
          if (latest) {
            acc = acc.add(latest.valueNumeric.mul(t.sign));
            any = true;
          }
        } else if (termMetric.valueKind === "DERIVED") {
          const v = valueOf(t.metricId, classificationId, { start: from, end: range.end }, "YEAR", depth + 1);
          if (v !== null) {
            acc = acc.add(v.mul(t.sign));
            any = true;
          }
        } else {
          acc = acc.add(sumBetween(termList, from, range.end).mul(t.sign));
          any = true;
        }
      }
      return any ? acc : null;
    }
    for (const t of deriv.terms) {
      const v = valueOf(t.metricId, classificationId, range, cumKind, depth + 1);
      if (v !== null) {
        acc = acc.add(v.mul(t.sign));
        any = true;
      }
    }
    return any ? acc : null;
  };

  const num = (d: Dec | null): number | null => (d === null ? null : Number(d));

  const calcCols = (
    metricId: string,
    classificationId: string
  ): { week: number | null; month: number | null; quarter: number | null; year: number | null } => ({
    week: num(valueOf(metricId, classificationId, weekRange, "WEEK", 0)),
    month: num(valueOf(metricId, classificationId, monthRange, "MONTH", 0)),
    quarter: num(valueOf(metricId, classificationId, quarterRange, "QUARTER", 0)),
    year: num(valueOf(metricId, classificationId, yearRange, "YEAR", 0)),
  });

  const addCols = (
    a: { week: number | null; month: number | null; quarter: number | null; year: number | null },
    b: { week: number | null; month: number | null; quarter: number | null; year: number | null }
  ) => ({
    week: sumNullable(a.week, b.week),
    month: sumNullable(a.month, b.month),
    quarter: sumNullable(a.quarter, b.quarter),
    year: sumNullable(a.year, b.year),
  });

  const classesByMetric = new Map<string, { id: string; label: string }[]>();
  for (const c of classifications) {
    const arr = classesByMetric.get(c.metricId) || [];
    arr.push({ id: c.id, label: c.label });
    classesByMetric.set(c.metricId, arr);
  }
  const targetsByMetric = new Map<string, typeof targets>();
  for (const t of targets) {
    const arr = targetsByMetric.get(t.metricId) || [];
    arr.push(t);
    targetsByMetric.set(t.metricId, arr);
  }

  const resultGroups: MetricSummaryGroup[] = [];
  for (const g of groups) {
    const gMetrics = metrics.filter((m) => m.groupId === g.id);
    if (gMetrics.length === 0) continue;
    const rows: MetricSummaryRow[] = [];

    for (const m of gMetrics) {
      const classes = classesByMetric.get(m.id) || [];
      const list = entriesByMetric.get(m.id) || [];

      let cols = { week: null, month: null, quarter: null, year: null } as MetricSummaryRow["cols"];
      let classCols: MetricSummaryRow["classCols"] = [];
      if (classes.length > 0) {
        for (const c of classes) {
          const cc = calcCols(m.id, c.id);
          cols = addCols(cols, cc);
          const cl = list.filter((e) => e.classificationId === c.id);
          const latest = latestUpTo(cl, yearRange.end);
          classCols.push({
            classificationId: c.id,
            label: c.label,
            cols: cc,
            latestDate: latest ? dateOnlyToStr(latest.entryDate) : null,
          });
        }
      } else {
        cols = calcCols(m.id, "");
      }

      // % chỉ tiêu giao
      const metricTargets = (targetsByMetric.get(m.id) || []).map((t) => {
        const base =
          t.classificationId && t.classificationId !== ""
            ? calcCols(m.id, t.classificationId)
            : cols;
        const col =
          t.periodType === "YEAR" ? base.year : t.periodType === "MONTH" ? base.month : base.quarter;
        const targetValue = Number(t.valueNumeric);
        const percent =
          col !== null && targetValue > 0 ? Math.round((col / targetValue) * 1000) / 10 : null;
        return { label: t.label, periodType: t.periodType, periodNo: t.periodNo, targetValue, percent };
      });

      // Lần nhập gần nhất
      const latest = latestUpTo(list, yearRange.end);
      const latestMeta = latest
        ? {
            date: dateOnlyToStr(latest.entryDate),
            value: Number(latest.valueNumeric),
            status: latest.status,
            byName: personName.get(latest.enteredById) || null,
          }
        : null;

      // Ngày thiếu (chỉ cảnh báo với chỉ tiêu phát sinh hằng ngày, trong phạm vi tuần đã chọn)
      let missingDates: string[] = [];
      if (m.valueKind === "FLOW" && m.expectDaily) {
        const datesSet = new Set(list.map((e) => dateOnlyToStr(e.entryDate)));
        let cursor = weekRange.start;
        while (cursor.getTime() <= weekRange.end.getTime()) {
          if (cursor.getTime() > today.getTime()) break;
          if (!datesSet.has(dateOnlyToStr(cursor))) missingDates.push(dateOnlyToStr(cursor));
          cursor = new Date(cursor.getTime() + 86400000);
        }
      }

      rows.push({
        id: m.id,
        code: m.code,
        name: m.name,
        unitType: m.unitType,
        unitLabel: defaultUnitLabel(m.unitType, m.displayScale, m.unitLabel),
        displayScale: m.displayScale || 1,
        decimals: m.decimals,
        valueKind: m.valueKind as ValueKind,
        requireConfirm: m.requireConfirm,
        expectDaily: m.expectDaily,
        note: m.note,
        cols,
        classCols,
        targets: metricTargets,
        latest: latestMeta,
        missingDates,
        latestDate: latest ? dateOnlyToStr(latest.entryDate) : null,
      });
    }
    resultGroups.push({ id: g.id, code: g.code, name: g.name, sortOrder: g.sortOrder, metrics: rows });
  }

  return {
    range: {
      week: {
        year: weekInfo.year,
        weekNumber: weekInfo.weekNumber,
        label: weekInfo.standardTitle,
        startDate: weekInfo.startDateStr,
        endDate: weekInfo.endDateStr,
      },
      month: { year, month, label: `Tháng ${month}/${year}` },
      quarter: { year, quarter, label: `Quý ${quarter}/${year}` },
      year: { year, label: `Năm ${year}` },
    },
    groups: resultGroups,
  };
}

function sumNullable(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a || 0) + (b || 0);
}

/**
 * Chuẩn hóa số người dùng nhập (chấp nhận "1.234.567", "1234567,5", "1234.5", âm).
 * Trả về chuỗi số thập phân chuẩn (dùng dấu ".") hoặc null nếu không hợp lệ.
 */
export function parseNumberInput(input: string | number): string | null {
  let t = typeof input === "number" ? String(input) : input;
  if (typeof t !== "string") return null;
  t = t.trim().replace(/\s+/g, "");
  if (!t) return null;
  t = t.replace(/[₫đ]/gi, "");
  if (t.includes(",")) {
    t = t.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, "");
  }
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  try {
    const d = new Prisma.Decimal(t);
    if (!d.isFinite()) return null;
    if (d.abs().gte(new Prisma.Decimal("1e18"))) return null;
    return t;
  } catch {
    return null;
  }
}
