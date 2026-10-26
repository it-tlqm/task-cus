/**
 * Kỳ nhập số liệu theo từng chỉ tiêu.
 *
 * - Mặc định: Thu NSNN nhập theo ngày; chỉ tiêu số dư nhập theo tháng;
 *   các chỉ tiêu còn lại nhập theo tuần (phù hợp giao ban tuần).
 * - Quản trị có thể đổi kỳ nhập từng chỉ tiêu trong Cấu hình số liệu.
 * - Kỳ nhập được lưu tạm trong `MetricDefinition.derivation.entryPeriod`
 *   để không phải migration khi chưa có backup Production.
 */

export type EntryPeriod = "DAY" | "WEEK" | "MONTH" | "QUARTER" | "YEAR";

export const ENTRY_PERIODS: EntryPeriod[] = ["DAY", "WEEK", "MONTH", "QUARTER", "YEAR"];

export const ENTRY_PERIOD_LABELS: Record<EntryPeriod, string> = {
  DAY: "Ngày",
  WEEK: "Tuần",
  MONTH: "Tháng",
  QUARTER: "Quý",
  YEAR: "Năm",
};

export const ENTRY_PERIOD_HINTS: Record<EntryPeriod, string> = {
  DAY: "Nhập số phát sinh của ngày",
  WEEK: "Nhập tổng phát sinh của tuần",
  MONTH: "Nhập tổng phát sinh của tháng",
  QUARTER: "Nhập tổng phát sinh của quý",
  YEAR: "Nhập tổng phát sinh của năm",
};

export interface EntryPeriodBounds {
  type: EntryPeriod;
  start: string;
  end: string;
  key: string;
  label: string;
}

export function parseEntryPeriod(value: unknown): EntryPeriod | null {
  const raw = String(value || "").toUpperCase();
  return ENTRY_PERIODS.includes(raw as EntryPeriod) ? (raw as EntryPeriod) : null;
}

export function metricEntryPeriod(metric: {
  code?: string | null;
  valueKind?: string | null;
  derivation?: unknown;
}): EntryPeriod {
  const derivation =
    metric.derivation && typeof metric.derivation === "object"
      ? (metric.derivation as Record<string, unknown>)
      : null;
  const configured = parseEntryPeriod(derivation?.entryPeriod);
  if (configured) return configured;

  // Fallback an toàn khi chỉ tiêu chưa được cấu hình kỳ nhập.
  if ((metric.code || "").toUpperCase() === "THU_NSNN") return "DAY";
  if (metric.valueKind === "BALANCE") return "MONTH";
  return "WEEK";
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function dateOnly(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function parseDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86400000);
}

function addMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function lastDayOfMonth(year: number, monthIndex: number): Date {
  return new Date(Date.UTC(year, monthIndex + 1, 0));
}

function isoWeekInfo(date: Date): { year: number; week: number; monday: Date } {
  const day = date.getUTCDay() || 7;
  const thursday = addDays(date, 4 - day);
  const isoYear = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDay = firstThursday.getUTCDay() || 7;
  const firstThursdayMonday = addDays(firstThursday, 1 - firstDay);
  const monday = addDays(date, 1 - day);
  const week = 1 + Math.round((monday.getTime() - firstThursdayMonday.getTime()) / (7 * 86400000));
  return { year: isoYear, week, monday };
}

function ddmm(date: Date): string {
  return `${pad2(date.getUTCDate())}/${pad2(date.getUTCMonth() + 1)}`;
}

function ddmmyyyy(date: Date): string {
  return `${ddmm(date)}/${date.getUTCFullYear()}`;
}

export function entryPeriodBounds(type: EntryPeriod, anchorDate: string): EntryPeriodBounds {
  const anchor = parseDateOnly(anchorDate);
  if (!anchor) throw new Error("Ngày neo không hợp lệ (YYYY-MM-DD)");

  if (type === "DAY") {
    const value = dateOnly(anchor);
    return {
      type,
      start: value,
      end: value,
      key: value,
      label: `Ngày ${ddmmyyyy(anchor)}`,
    };
  }

  if (type === "WEEK") {
    const info = isoWeekInfo(anchor);
    const end = addDays(info.monday, 6);
    return {
      type,
      start: dateOnly(info.monday),
      end: dateOnly(end),
      key: `${info.year}-W${pad2(info.week)}`,
      label: `Tuần ${info.week}/${info.year} (${ddmm(info.monday)}–${ddmmyyyy(end)})`,
    };
  }

  if (type === "MONTH") {
    const year = anchor.getUTCFullYear();
    const monthIndex = anchor.getUTCMonth();
    const start = new Date(Date.UTC(year, monthIndex, 1));
    const end = lastDayOfMonth(year, monthIndex);
    return {
      type,
      start: dateOnly(start),
      end: dateOnly(end),
      key: `${year}-${pad2(monthIndex + 1)}`,
      label: `Tháng ${monthIndex + 1}/${year}`,
    };
  }

  if (type === "QUARTER") {
    const year = anchor.getUTCFullYear();
    const quarter = Math.floor(anchor.getUTCMonth() / 3) + 1;
    const startMonthIndex = (quarter - 1) * 3;
    const start = new Date(Date.UTC(year, startMonthIndex, 1));
    const end = lastDayOfMonth(year, startMonthIndex + 2);
    return {
      type,
      start: dateOnly(start),
      end: dateOnly(end),
      key: `${year}-Q${quarter}`,
      label: `Quý ${quarter}/${year}`,
    };
  }

  const year = anchor.getUTCFullYear();
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year, 11, 31));
  return {
    type,
    start: dateOnly(start),
    end: dateOnly(end),
    key: String(year),
    label: `Năm ${year}`,
  };
}

/** Dịch ngày neo sang kỳ trước/sau; dùng cho nút chuyển kỳ. */
export function shiftPeriodAnchor(type: EntryPeriod, anchorDate: string, delta: number): string {
  const anchor = parseDateOnly(anchorDate);
  if (!anchor) return anchorDate;
  if (type === "DAY") return dateOnly(addDays(anchor, delta));
  if (type === "WEEK") return dateOnly(addDays(anchor, delta * 7));
  if (type === "MONTH") return dateOnly(addMonths(anchor, delta));
  if (type === "QUARTER") return dateOnly(addMonths(anchor, delta * 3));
  return dateOnly(new Date(Date.UTC(anchor.getUTCFullYear() + delta, 0, 1)));
}

export function isDateInEntryPeriod(date: string, bounds: EntryPeriodBounds): boolean {
  return date >= bounds.start && date <= bounds.end;
}
