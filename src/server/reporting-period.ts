/**
 * Phân giải kỳ báo cáo (Ngày/Tuần/Tháng) theo lịch Việt Nam (GMT+7).
 *
 * Nguyên tắc:
 * - Không tạo kỳ trùng: nếu đã có kỳ cùng loại chồng lấn khoảng ngày thì dùng lại.
 * - Tiêu đề mới dùng định dạng chuẩn, nhưng dữ liệu cũ (tuần 41, tháng 10/2026...)
 *   vẫn được tái sử dụng thay vì sinh bản ghi song song.
 * - Không suy diễn số liệu nghiệp vụ; module này chỉ xử lý khoảng thời gian.
 */
import { prisma } from "@/server/db";
import {
  createVnDate,
  getIsoWeekBounds,
  getIsoWeekFromDate,
  getVnDateParts,
} from "@/lib/period-helper";
import { parseDateOnly } from "@/server/work-dates";

export type ReportingPeriodType = "DAY" | "WEEK" | "MONTH";

export interface ResolveReportingPeriodInput {
  type: string;
  date?: string | null;
  year?: number | null;
  monthNumber?: number | null;
  weekNumber?: number | null;
}

export class ReportingPeriodError extends Error {
  statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = "ReportingPeriodError";
  }
}

function normalizeType(type: string): ReportingPeriodType {
  const raw = String(type || "").trim().toUpperCase();
  if (raw === "DAY" || raw === "DAILY" || raw === "NGAY") return "DAY";
  if (raw === "MONTH" || raw === "MONTHLY" || raw === "THANG") return "MONTH";
  if (raw === "WEEK" || raw === "WEEKLY" || raw === "TUAN") return "WEEK";
  throw new ReportingPeriodError("Loại kỳ phải là Ngày, Tuần hoặc Tháng");
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function vnDateIso(parts: { year: number; month: number; day: number }) {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

/**
 * Xác định khoảng thời gian chuẩn của kỳ, không phụ thuộc timezone của máy chủ.
 */
function resolveWindow(input: ResolveReportingPeriodInput) {
  const type = normalizeType(input.type);
  const nowParts = getVnDateParts(new Date());

  let baseYear = Number(input.year) || nowParts.year;
  let month = Number(input.monthNumber) || nowParts.month;
  let day = nowParts.day;
  let weekNumber = Number(input.weekNumber) || 0;

  if (input.date) {
    const parsed = parseDateOnly(input.date);
    if (!parsed.ok || !parsed.value) {
      throw new ReportingPeriodError(
        parsed.ok ? "Ngày tạo kỳ không hợp lệ" : parsed.message
      );
    }
    const parts = getVnDateParts(parsed.value);
    baseYear = parts.year;
    month = parts.month;
    day = parts.day;
  }

  if (type === "DAY") {
    return {
      type,
      year: baseYear,
      month,
      day,
      weekNumber: 0,
      startAt: createVnDate(baseYear, month, day, 0, 0, 0, 0),
      endAt: new Date(createVnDate(baseYear, month, day + 1, 0, 0, 0, 0).getTime() - 1),
      title: `Ngày ${pad(day)}/${pad(month)}/${baseYear}`,
    };
  }

  if (type === "MONTH") {
    if (month < 1 || month > 12) {
      throw new ReportingPeriodError("Tháng phải nằm trong khoảng 1-12");
    }
    const startAt = createVnDate(baseYear, month, 1, 0, 0, 0, 0);
    const endAt = new Date(createVnDate(baseYear, month + 1, 1, 0, 0, 0, 0).getTime() - 1);
    return {
      type,
      year: baseYear,
      month,
      day: 1,
      weekNumber: 0,
      startAt,
      endAt,
      title: `Tháng ${pad(month)}/${baseYear}`,
    };
  }

  if (!weekNumber && input.date) {
    weekNumber = getIsoWeekFromDate(
      createVnDate(baseYear, month, day, 12, 0, 0, 0)
    ).weekNumber;
    baseYear = getIsoWeekFromDate(
      createVnDate(baseYear, month, day, 12, 0, 0, 0)
    ).year;
  }
  if (!weekNumber) {
    const current = getIsoWeekFromDate(new Date());
    weekNumber = current.weekNumber;
    baseYear = current.year;
  }
  if (weekNumber < 1 || weekNumber > 53) {
    throw new ReportingPeriodError("Tuần phải nằm trong khoảng 1-53");
  }

  const bounds = getIsoWeekBounds(baseYear, weekNumber);
  return {
    type,
    year: bounds.year,
    month: getVnDateParts(bounds.startAt).month,
    day: getVnDateParts(bounds.startAt).day,
    weekNumber: bounds.weekNumber,
    startAt: bounds.startAt,
    endAt: bounds.endInclusive,
    title: bounds.standardTitle,
  };
}

/**
 * Tìm kỳ đã có cùng loại, chồng lấn khoảng ngày cần dùng; nếu chưa có thì tạo mới.
 */
export async function resolveReportingPeriod(input: ResolveReportingPeriodInput) {
  const window = resolveWindow(input);

  const overlapping = await prisma.reportingPeriod.findMany({
    where: {
      type: window.type,
      startAt: { lte: window.endAt },
      endAt: { gte: window.startAt },
    },
    orderBy: { startAt: "asc" },
  });

  if (overlapping.length > 0) {
    // Nếu có nhiều kỳ chồng lấn (dữ liệu lịch sử), chọn kỳ gần nhất với ngày bắt đầu chuẩn.
    const target = window.startAt.getTime();
    return [...overlapping].sort((a, b) => {
      const da = Math.abs(a.startAt.getTime() - target);
      const db = Math.abs(b.startAt.getTime() - target);
      return da - db || a.startAt.getTime() - b.startAt.getTime();
    })[0];
  }

  try {
    return await prisma.reportingPeriod.create({
      data: {
        type: window.type,
        title: window.title,
        startAt: window.startAt,
        endAt: window.endAt,
      },
    });
  } catch (error: any) {
    // Hai request đồng thời: unique (type, title) bảo vệ khỏi tạo trùng.
    if (error?.code === "P2002") {
      const existing = await prisma.reportingPeriod.findUnique({
        where: { type_title: { type: window.type, title: window.title } },
      });
      if (existing) return existing;
    }
    throw error;
  }
}

const VN_OFFSET_MS = 7 * 3600_000;

function vnDateIsoFromInstant(date: Date): string {
  return vnDateIso(getVnDateParts(date));
}

function isoWeekForVnDate(dateIso: string) {
  const parsed = parseDateOnly(dateIso);
  if (!parsed.ok || !parsed.value) {
    throw new ReportingPeriodError(parsed.ok ? "Ngày làm việc không hợp lệ" : parsed.message);
  }
  const parts = getVnDateParts(parsed.value);
  return getIsoWeekFromDate(createVnDate(parts.year, parts.month, parts.day, 12, 0, 0, 0));
}

/**
 * Khoảng NGÀY LỊCH Việt Nam của một kỳ.
 * - `endAt` exclusive đúng 00:00 VN được lùi 1ms để lấy ngày Chủ nhật cuối kỳ.
 * - Dữ liệu cũ lưu endAt lệch múi giờ (VD Chủ nhật 23:59Z) vẫn được quy đổi
 *   trung thực sang ngày VN; caller phải kiểm tra thêm alignment nếu là kỳ tuần.
 */
export function getReportingPeriodVnDateRange(period: { startAt: Date; endAt: Date }): {
  startDate: string;
  endDate: string;
} {
  let effectiveEnd = period.endAt;
  const endVn = new Date(period.endAt.getTime() + VN_OFFSET_MS);
  const isVnMidnight =
    endVn.getUTCHours() === 0 &&
    endVn.getUTCMinutes() === 0 &&
    endVn.getUTCSeconds() === 0 &&
    endVn.getUTCMilliseconds() === 0;
  if (isVnMidnight && period.endAt.getTime() > period.startAt.getTime()) {
    effectiveEnd = new Date(period.endAt.getTime() - 1);
  }
  return {
    startDate: vnDateIsoFromInstant(period.startAt),
    endDate: vnDateIsoFromInstant(effectiveEnd),
  };
}

/** Kỳ có đúng khoảng ngày VN của tuần ISO chứa `dateIso` hay không. */
export function isPeriodAlignedToIsoWeek(
  period: { startAt: Date; endAt: Date },
  week: { startAt: Date; endInclusive: Date }
): boolean {
  const range = getReportingPeriodVnDateRange(period);
  return (
    range.startDate === vnDateIsoFromInstant(week.startAt) &&
    range.endDate === vnDateIsoFromInstant(week.endInclusive)
  );
}

/**
 * Ngày làm việc có thực sự thuộc kỳ theo LỊCH VN hay không.
 * Với kỳ WEEK, yêu cầu thêm khoảng ngày khớp tuần ISO của ngày đó — chặn dữ liệu
 * cũ có endAt lệch múi giờ (Chủ nhật 23:59Z) nuốt sang Thứ Hai tuần sau.
 */
export function isVnDateWithinReportingPeriod(
  period: { type: string; startAt: Date; endAt: Date },
  dateIso: string
): boolean {
  const parsed = parseDateOnly(dateIso);
  if (!parsed.ok || !parsed.value) return false;
  const normalized = parsed.value.toISOString().slice(0, 10);
  const range = getReportingPeriodVnDateRange(period);
  if (normalized < range.startDate || normalized > range.endDate) return false;
  if (period.type === "WEEK") {
    return isPeriodAlignedToIsoWeek(period, isoWeekForVnDate(dateIso));
  }
  return true;
}

/**
 * Phân giải kỳ TUẦN chứa đúng ngày VN.
 *
 * `resolveReportingPeriod` chọn kỳ chồng lấn gần nhất — với dữ liệu cũ có endAt
 * lệch múi giờ, kỳ tuần trước có thể chồng lấn 7 giờ sang Thứ Hai. Helper này xác
 * thực lại khoảng ngày VN và tạo kỳ tuần ISO đúng nếu dữ liệu cũ không khớp.
 * Chỉ dùng cho gán nhật ký; không thay đổi công thức/kỳ của module khác.
 */
export async function resolveReportingWeekContainingVnDate(dateIso: string) {
  const expected = isoWeekForVnDate(dateIso);
  const resolved = await resolveReportingPeriod({ type: "WEEK", date: dateIso });
  if (isPeriodAlignedToIsoWeek(resolved, expected)) return resolved;

  const candidates = await prisma.reportingPeriod.findMany({
    where: {
      type: "WEEK",
      startAt: { lte: expected.endInclusive },
      endAt: { gte: expected.startAt },
    },
    orderBy: { startAt: "asc" },
  });
  const matched = candidates.find((candidate) =>
    isPeriodAlignedToIsoWeek(candidate, expected)
  );
  if (matched) return matched;

  try {
    return await prisma.reportingPeriod.create({
      data: {
        type: "WEEK",
        title: expected.standardTitle,
        startAt: expected.startAt,
        endAt: expected.endInclusive,
        dueAt: new Date(expected.endInclusive.getTime() - 4 * 3600000),
      },
    });
  } catch (error: any) {
    if (error?.code === "P2002") {
      throw new ReportingPeriodError(
        `Kỳ tuần ${expected.standardTitle} đã tồn tại nhưng khoảng ngày không khớp lịch VN — cần quản trị sửa kỳ trước khi ghi nhật ký.`
      );
    }
    throw error;
  }
}

export function currentVnDateIso(): string {
  return vnDateIso(getVnDateParts(new Date()));
}

export function suggestedPlanTitle(
  type: string,
  dateIso: string,
  fallbackTitle?: string
): string {
  const typeNorm = normalizeType(type);
  const parsed = parseDateOnly(dateIso);
  if (!parsed.ok || !parsed.value) return fallbackTitle || "";
  const parts = getVnDateParts(parsed.value);
  if (typeNorm === "DAY") {
    return `Kế hoạch ngày ${pad(parts.day)}/${pad(parts.month)}/${parts.year}`;
  }
  if (typeNorm === "MONTH") {
    return `Kế hoạch tháng ${pad(parts.month)}/${parts.year}`;
  }
  const week = getIsoWeekFromDate(
    createVnDate(parts.year, parts.month, parts.day, 12, 0, 0, 0)
  );
  return `Kế hoạch tuần ${week.weekNumber}/${week.year} (${week.displayRange})`;
}
