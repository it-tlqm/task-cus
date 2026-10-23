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

/**
 * YC-02/B-C-1 — tách quyền nghiệp vụ khỏi đặc quyền kỹ thuật `system.config`.
 * `metrics.config`: cấu hình chỉ tiêu/chỉ tiêu giao/mốc/phân công.
 * `metrics.entry_all`: nhập mọi chỉ tiêu không cần từng assignment.
 * UNIT_LEADER được hưởng theo vai trò điều hành (checkPermission xử lý);
 * SYSTEM_ADMIN chỉ có khi được cấp tường minh.
 */
export function isMetricsConfigurator(user: SessionUser): boolean {
  return checkPermission(user, "metrics.config");
}

export function isMetricsEntryAdmin(user: SessionUser): boolean {
  return checkPermission(user, "metrics.entry_all");
}

/** Giữ tên cũ cho các call-site cấu hình; KHÔNG còn phụ thuộc system.config. */
export function isMetricsAdmin(user: SessionUser): boolean {
  return isMetricsConfigurator(user);
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
  if (isMetricsEntryAdmin(user)) {
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

export interface MetricCols {
  day: number | null; // "Trong ngày" — tổng bản ghi đúng ngày hôm nay (null = chưa nhập, khác 0)
  week: number | null;
  month: number | null;
  quarter: number | null;
  year: number | null;
}

/** Trạng thái kỳ tháng của một chỉ tiêu trên bảng giao ban (YC-29). */
export type MetricMonthState = "NONE" | "RECORDED" | "CONFIRMED" | "LOCKED";

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
  showOnDashboard: boolean;
  note: string | null;
  cols: MetricCols;
  classCols: {
    classificationId: string;
    label: string;
    cols: MetricCols;
    latestDate: string | null;
  }[];
  targets: {
    id: string;
    label: string;
    classificationId: string;
    periodType: string;
    year: number;
    periodNo: number | null;
    targetValue: number;
    percent: number | null;
    comparisonKind: string;
    status: string;
    sourceNote: string | null;
    confirmedAt: string | null;
  }[];
  latest: { date: string; value: number; status: string; byName: string | null } | null;
  missingDates: string[];
  latestDate: string | null;
  /** YC-29: trạng thái theo kỳ tháng đang xem — Chưa nhập / Đã nhập / Đã xác nhận / Đã chốt báo cáo. */
  status: { monthState: MetricMonthState; monthLocked: boolean; monthPeriodKey: string };
}

export interface MetricSummaryGroup {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  metrics: MetricSummaryRow[];
}

/**
 * YC-26 — cờ chất lượng dữ liệu: nhận diện dữ liệu DEMO (mô phỏng) đang trộn
 * trong cùng kỳ với bản ghi do cán bộ nhập thật. Dùng để hiện cảnh báo rõ ràng
 * tại khu vực số liệu, tránh hiển thị số liệu dùng thử như số liệu chính thức.
 */
export interface MetricDataQuality {
  /** Số mốc lũy kế đã xác nhận có ghi chú [DEMO... */
  demoBaselines: number;
  /** Số bản ghi nhập trong kỳ do tài khoản DEMO nhập (mã người bắt đầu bằng "DEMO") */
  demoEntries: number;
  /** Số bản ghi nhập trong kỳ do người thật nhập */
  realEntries: number;
  /** Số chỉ tiêu giao gắn nhãn [DEMO... */
  demoTargets: number;
  /** Có thành phần DEMO trong nguồn số liệu đang hiển thị */
  demoPresent: boolean;
  /** Có trộn DEMO với bản ghi người thật trong cùng kỳ */
  mixedWithReal: boolean;
}

export interface MetricSummaryResult {
  range: {
    week: { year: number; weekNumber: number; label: string; startDate: string; endDate: string };
    month: { year: number; month: number; label: string };
    quarter: { year: number; quarter: number; label: string };
    year: { year: number; label: string };
  };
  groups: MetricSummaryGroup[];
  /** YC-26 — cờ chất lượng dữ liệu (DEMO lẫn số thật). */
  dataQuality: MetricDataQuality;
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
      // B-C-1: mốc đã xác nhận hoặc đã chốt đều được dùng; PROPOSED thì không.
      where: { metricId: { in: metricIds }, status: { in: ["CONFIRMED", "LOCKED"] } },
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

  // Tên người nhập cho "latest" + mã người (YC-26: nhận diện DEMO)
  const personIds = Array.from(new Set(entries.map((e) => e.enteredById)));
  const persons = personIds.length
    ? await prisma.person.findMany({ where: { id: { in: personIds } }, select: { id: true, fullName: true, code: true } })
    : [];
  const personName = new Map(persons.map((p) => [p.id, p.fullName]));
  const personCode = new Map(persons.map((p) => [p.id, p.code]));

  // --- YC-26: cờ chất lượng dữ liệu — phát hiện DEMO lẫn trong nguồn số liệu ---
  const demoBaselines = baselines.filter((b) => /\[DEMO/i.test(b.sourceNote || "")).length;
  const demoEntries = entries.filter((e) => (personCode.get(e.enteredById) || "").toUpperCase().startsWith("DEMO")).length;
  const realEntries = entries.length - demoEntries;
  const demoTargets = targets.filter((t) => /^\s*\[DEMO/i.test(t.label)).length;
  const dataQuality: MetricDataQuality = {
    demoBaselines,
    demoEntries,
    realEntries,
    demoTargets,
    demoPresent: demoBaselines + demoEntries + demoTargets > 0,
    mixedWithReal: (demoBaselines > 0 || demoEntries > 0) && realEntries > 0,
  };

  const today = todayVnDateOnly();

  // --- 2b. Trạng thái "Đã chốt báo cáo" theo kỳ tháng đang xem (YC-29) ---
  const monthPeriodKey = `${year}-${String(month).padStart(2, "0")}`;
  const monthLockVersions = await prisma.briefingReportVersion.findMany({
    where: { periodType: "MONTH", periodKey: monthPeriodKey },
    select: { id: true },
    take: 1,
  });
  const monthLocked = monthLockVersions.length > 0;

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

  const dayRange: RangePair = { start: today, end: today };
  const calcCols = (metricId: string, classificationId: string): MetricCols => ({
    day: num(valueOf(metricId, classificationId, dayRange, "WEEK", 0)),
    week: num(valueOf(metricId, classificationId, weekRange, "WEEK", 0)),
    month: num(valueOf(metricId, classificationId, monthRange, "MONTH", 0)),
    quarter: num(valueOf(metricId, classificationId, quarterRange, "QUARTER", 0)),
    year: num(valueOf(metricId, classificationId, yearRange, "YEAR", 0)),
  });

  const addCols = (a: MetricCols, b: MetricCols): MetricCols => ({
    day: sumNullable(a.day, b.day),
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

      let cols = { day: null, week: null, month: null, quarter: null, year: null } as MetricSummaryRow["cols"];
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

      // % chỉ tiêu giao — chỉ lấy chỉ tiêu áp dụng đúng kỳ đang xem, không trộn năm/kỳ khác.
      const metricTargets = (targetsByMetric.get(m.id) || [])
        .filter(
          (t) =>
            t.year === year &&
            ((t.periodType === "YEAR") ||
              (t.periodType === "QUARTER" && t.periodNo === quarter) ||
              (t.periodType === "MONTH" && t.periodNo === month))
        )
        .map((t) => {
          const base =
            t.classificationId && t.classificationId !== ""
              ? calcCols(m.id, t.classificationId)
              : cols;
          const col =
            t.periodType === "YEAR" ? base.year : t.periodType === "MONTH" ? base.month : base.quarter;
          const targetValue = Number(t.valueNumeric);
          // Chỉ tiêu chưa xác nhận/chốt vẫn hiển thị số gốc nhưng không công bố % chính thức.
          const official = t.status === "CONFIRMED" || t.status === "LOCKED";
          const percent =
            official && col !== null && targetValue > 0
              ? Math.round((col / targetValue) * 1000) / 10
              : null;
          return {
            id: t.id,
            label: t.label,
            classificationId: t.classificationId,
            periodType: t.periodType,
            year: t.year,
            periodNo: t.periodNo,
            targetValue,
            percent,
            comparisonKind: t.comparisonKind,
            status: t.status,
            sourceNote: t.sourceNote,
            confirmedAt: t.confirmedAt ? t.confirmedAt.toISOString() : null,
          };
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

      // Trạng thái kỳ tháng (YC-29): Chưa nhập / Đã nhập / Đã xác nhận / Đã chốt báo cáo
      const monthEntries = list.filter(
        (e) => e.entryDate.getTime() >= monthRange.start.getTime() && e.entryDate.getTime() <= monthRange.end.getTime()
      );
      const monthState: MetricMonthState =
        monthEntries.length === 0 ? "NONE" : monthLocked ? "LOCKED" : monthEntries.some((e) => e.status === "CONFIRMED") ? "CONFIRMED" : "RECORDED";

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
        showOnDashboard: m.showOnDashboard,
        note: m.note,
        cols,
        classCols,
        targets: metricTargets,
        latest: latestMeta,
        missingDates,
        latestDate: latest ? dateOnlyToStr(latest.entryDate) : null,
        status: { monthState, monthLocked, monthPeriodKey },
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
    dataQuality,
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

// ============================================================
// YC-01/B-C-1 — Bảng so sánh kết quả thu NSNN:
//   Chỉ tiêu BTC năm · Chỉ tiêu UBND năm · Kế hoạch tháng HQTL ·
//   So với tháng trước · So với cùng kỳ năm trước
//
// Quy ước:
//   - BTC/UBND/KH tháng chỉ lấy target có `comparisonKind` tường minh, đúng kỳ/năm,
//     status CONFIRMED/LOCKED, không mang nhãn [DEMO]. KHÔNG dò chuỗi nhãn.
//   - Tháng trước / cùng kỳ: B1 CHƯA CHỐT. API trả giá trị kỳ đối chiếu (nếu có)
//     nhưng percent luôn null và ruleState=PENDING_B1 — không công bố % thiếu căn cứ.
//   - Tỷ lệ chỉ tính khi đủ tử số, mẫu số > 0; thiếu -> null (UI "Chưa xác định").
// ============================================================

export const COMPARISON_CONTRACT_VERSION = "B-C-1";

export type ComparisonRuleState = "OFFICIAL" | "PROPOSED" | "AMBIGUOUS" | "NO_TARGET";
export type ComparisonDiffRuleState = "PENDING_B1";

export interface ComparisonTargetBlock {
  targetId: string | null;
  label: string | null;
  comparisonKind: string | null;
  targetValue: number | null;
  percent: number | null;
  periodLabel: string;
  basis: "YEAR_CUM" | "MONTH_CUM";
  ruleState: ComparisonRuleState;
  ambiguous: boolean;
  status: string | null;
  sourceNote: string | null;
  confirmedAt: string | null;
}

export interface ComparisonDiffBlock {
  value: number | null;
  percent: null;
  label: string;
  basis: "FULL_PREVIOUS_MONTH_CUM" | "FULL_MONTH_LAST_YEAR_CUM";
  ruleState: ComparisonDiffRuleState;
}

export interface MetricComparisonRow {
  metricId: string;
  code: string;
  name: string;
  unitType: string;
  unitLabel: string;
  displayScale: number;
  decimals: number;
  yearCum: number | null;
  monthCum: number | null;
  latestDate: string | null;
  btc: ComparisonTargetBlock;
  ubnd: ComparisonTargetBlock;
  monthPlan: ComparisonTargetBlock;
  prevMonth: ComparisonDiffBlock;
  samePeriodLastYear: ComparisonDiffBlock;
}

export interface MetricComparisonResult {
  version: string;
  rule: {
    targetSource: "EXPLICIT_COMPARISON_KIND";
    prevMonth: "PENDING_B1";
    samePeriodLastYear: "PENDING_B1";
    notes: string;
  };
  anchors: { year: number; month: number; monthLabel: string; prevMonthLabel: string; lastYearLabel: string };
  rows: MetricComparisonRow[];
}

const ratioPercent = (num: number | null, den: number | null): number | null =>
  num !== null && den !== null && den > 0 ? Math.round((num / den) * 1000) / 10 : null;

type TargetRow = MetricSummaryRow["targets"][number];

function comparisonTargetBlock(
  candidates: TargetRow[],
  num: number | null,
  periodLabel: string,
  kind: string,
  basis: "YEAR_CUM" | "MONTH_CUM"
): ComparisonTargetBlock {
  if (candidates.length === 0) {
    return {
      targetId: null,
      label: null,
      comparisonKind: kind,
      targetValue: null,
      percent: null,
      periodLabel,
      basis,
      ruleState: "NO_TARGET",
      ambiguous: false,
      status: null,
      sourceNote: null,
      confirmedAt: null,
    };
  }
  if (candidates.length > 1) {
    return {
      targetId: null,
      label: null,
      comparisonKind: kind,
      targetValue: null,
      percent: null,
      periodLabel,
      basis,
      ruleState: "AMBIGUOUS",
      ambiguous: true,
      status: null,
      sourceNote: null,
      confirmedAt: null,
    };
  }
  const t = candidates[0];
  const official = t.status === "CONFIRMED" || t.status === "LOCKED";
  return {
    targetId: t.id,
    label: t.label,
    comparisonKind: kind,
    targetValue: t.targetValue,
    percent: official ? ratioPercent(num, t.targetValue) : null,
    periodLabel,
    basis,
    ruleState: official ? "OFFICIAL" : "PROPOSED",
    ambiguous: false,
    status: t.status,
    sourceNote: t.sourceNote,
    confirmedAt: t.confirmedAt,
  };
}

export async function computeMetricComparison(
  anchors: SummaryAnchors,
  base?: MetricSummaryResult
): Promise<MetricComparisonResult> {
  const { year, month } = anchors;
  const baseSummary = base || (await computeMetricSummary(anchors, "full"));

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevSummary = await computeMetricSummary(
    { year: prevYear, weekNumber: anchors.weekNumber, month: prevMonth, quarter: Math.ceil(prevMonth / 3) },
    "full"
  );
  const lastYearSummary = await computeMetricSummary({ ...anchors, year: year - 1 }, "full");
  const prevById = new Map<string, MetricSummaryRow>();
  for (const g of prevSummary.groups) for (const m of g.metrics) prevById.set(m.id, m);
  const lyById = new Map<string, MetricSummaryRow>();
  for (const g of lastYearSummary.groups) for (const m of g.metrics) lyById.set(m.id, m);

  const rows: MetricComparisonRow[] = [];
  for (const g of baseSummary.groups) {
    for (const m of g.metrics) {
      // KHÔNG dùng chỉ tiêu giao gắn nhãn [DEMO...] làm nguồn đối chiếu chính thức
      // (tránh hiển thị dữ liệu DEMO như số liệu thật — quy ước YC-24).
      // Chỉ so sánh ở phạm vi TỔNG (classificationId rỗng) để khớp cột lũy kế tổng.
      const officialTargets = m.targets.filter(
        (t) => !/^\s*\[DEMO/i.test(t.label) && !t.classificationId
      );
      // Chỉ lấy chỉ tiêu có nguồn đối chiếu chính thức hoặc đang hiển thị trên Trang chủ.
      if (officialTargets.length === 0 && !m.showOnDashboard) continue;

      const btcT = officialTargets.filter((t) => t.comparisonKind === "BTC_YEAR");
      const ubndT = officialTargets.filter((t) => t.comparisonKind === "UBND_YEAR");
      const monthT = officialTargets.filter((t) => t.comparisonKind === "MONTH_PLAN");

      const prevM = prevById.get(m.id);
      const lyM = lyById.get(m.id);
      const prevValue = prevM?.cols.month ?? null;
      const lyValue = lyM?.cols.month ?? null;

      rows.push({
        metricId: m.id,
        code: m.code,
        name: m.name,
        unitType: m.unitType,
        unitLabel: m.unitLabel,
        displayScale: m.displayScale,
        decimals: m.decimals,
        yearCum: m.cols.year,
        monthCum: m.cols.month,
        latestDate: m.latestDate,
        btc: comparisonTargetBlock(btcT, m.cols.year, `Năm ${year}`, "BTC_YEAR", "YEAR_CUM"),
        ubnd: comparisonTargetBlock(ubndT, m.cols.year, `Năm ${year}`, "UBND_YEAR", "YEAR_CUM"),
        monthPlan: comparisonTargetBlock(monthT, m.cols.month, `Tháng ${month}/${year}`, "MONTH_PLAN", "MONTH_CUM"),
        // B1 CHƯA CHỐT: chỉ trả giá trị đối chiếu, KHÔNG trả phần trăm.
        prevMonth: {
          value: prevValue,
          percent: null,
          label: `Tháng ${prevMonth}/${prevYear}`,
          basis: "FULL_PREVIOUS_MONTH_CUM",
          ruleState: "PENDING_B1",
        },
        samePeriodLastYear: {
          value: lyValue,
          percent: null,
          label: `Tháng ${month}/${year - 1}`,
          basis: "FULL_MONTH_LAST_YEAR_CUM",
          ruleState: "PENDING_B1",
        },
      });
    }
  }

  return {
    version: COMPARISON_CONTRACT_VERSION,
    rule: {
      targetSource: "EXPLICIT_COMPARISON_KIND",
      prevMonth: "PENDING_B1",
      samePeriodLastYear: "PENDING_B1",
      notes: "Chưa chốt so cùng số ngày hay cả tháng; API không trả % cho 2 dòng này.",
    },
    anchors: {
      year,
      month,
      monthLabel: `Tháng ${month}/${year}`,
      prevMonthLabel: `Tháng ${prevMonth}/${prevYear}`,
      lastYearLabel: `Tháng ${month}/${year - 1}`,
    },
    rows,
  };
}

// ============================================================
// P0 (YC-26→29) — Cảnh báo mềm giá trị nhập bất thường:
// phát hiện khả năng nhập SỐ LŨY KẾ vào ô số phát sinh trong ngày.
// KHÔNG chặn lưu, KHÔNG sửa dữ liệu — chỉ trả cảnh báo cho giao diện.
// ============================================================

export interface SuspiciousEntryInput {
  metric: { id: string; code: string; name: string; valueKind: string };
  classificationId: string;
  entryDate: Date;
  valueBase: Prisma.Decimal;
}

export interface SuspiciousEntryWarning {
  index: number;
  metricCode: string;
  metricName: string;
  message: string;
}

const fmtNum = (v: number) => v.toLocaleString("vi-VN", { maximumFractionDigits: 2 });

export async function detectSuspiciousEntryValues(items: SuspiciousEntryInput[]): Promise<SuspiciousEntryWarning[]> {
  const flowItems = items
    .map((it, index) => ({ it, index }))
    .filter(({ it }) => it.metric.valueKind === "FLOW" && Number(it.valueBase) > 0);
  if (flowItems.length === 0) return [];

  const metricIds = Array.from(new Set(flowItems.map(({ it }) => it.metric.id)));
  const minYear = Math.min(...flowItems.map(({ it }) => it.entryDate.getUTCFullYear()));
  const maxDate = new Date(Math.max(...flowItems.map(({ it }) => it.entryDate.getTime())));
  const history = await prisma.metricDailyEntry.findMany({
    where: {
      metricId: { in: metricIds },
      entryDate: { gte: dateOnly(minYear, 1, 1), lt: maxDate },
    },
    select: { metricId: true, classificationId: true, entryDate: true, valueNumeric: true },
  });

  const warnings: SuspiciousEntryWarning[] = [];
  for (const { it, index } of flowItems) {
    const value = Number(it.valueBase);
    const yearStart = dateOnly(it.entryDate.getUTCFullYear(), 1, 1).getTime();
    const prior = history.filter(
      (h) =>
        h.metricId === it.metric.id &&
        h.classificationId === it.classificationId &&
        h.entryDate.getTime() < it.entryDate.getTime()
    );
    const priorYear = prior.filter((h) => h.entryDate.getTime() >= yearStart);
    const yearSum = priorYear.reduce((a, h) => a + Number(h.valueNumeric), 0);
    const last30 = prior.filter((h) => h.entryDate.getTime() >= it.entryDate.getTime() - 30 * 86400000).map((h) => Number(h.valueNumeric));
    if (last30.length < 3) continue;
    const sorted = [...last30].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    if (!(median > 0)) continue;

    const multiple = value / median;
    const looksCumulative = yearSum > 0 && value >= yearSum * 0.3 && multiple > 5;
    if (looksCumulative) {
      warnings.push({
        index,
        metricCode: it.metric.code,
        metricName: it.metric.name,
        message: `Giá trị ${fmtNum(value)} lớn gấp ${Math.round(multiple)} lần trung vị 30 ngày (${fmtNum(
          median
        )}) và tương đương ${Math.round((value / yearSum) * 100)}% tổng lũy kế đã nhập từ đầu năm — có dấu hiệu bạn đang nhập SỐ LŨY KẾ thay vì số phát sinh trong ngày. Đề nghị kiểm tra lại.`,
      });
    } else if (multiple > 20) {
      warnings.push({
        index,
        metricCode: it.metric.code,
        metricName: it.metric.name,
        message: `Giá trị ${fmtNum(value)} lớn bất thường so với 30 ngày gần đây (trung vị ${fmtNum(
          median
        )}, gấp ${Math.round(multiple)} lần). Đề nghị kiểm tra lại trước khi chốt số liệu.`,
      });
    }
  }
  return warnings;
}
