/**
 * Utility chuẩn hóa Kỳ Báo Cáo Tuần (ISO 8601) theo Múi giờ Việt Nam (Asia/Ho_Chi_Minh, GMT+7)
 * Tuân thủ quy ước:
 * - Tuần bắt đầu từ Thứ Hai (00:00:00 GMT+7) và kết thúc hết Chủ Nhật (23:59:59 GMT+7).
 * - Lưu trữ trong CSDL: startAt bao gồm (inclusive), endExclusive loại trừ (exclusive)
 *   hoặc endInclusive là 23:59:59.999.
 * - Ví dụ Tuần 41/2026:
 *   + Thứ Hai: 05/10/2026 00:00:00 GMT+7 => UTC: 2026-10-04T17:00:00.000Z
 *   + Chủ Nhật: 11/10/2026 23:59:59.999 GMT+7 => UTC: 2026-10-11T16:59:59.999Z
 *   + Cuối kỳ exclusive (00:00:00 Thứ Hai tuần sau): 2026-10-11T17:00:00.000Z
 *   + Chuỗi hiển thị: "05/10/2026 - 11/10/2026"
 */

export interface IsoWeekInfo {
  year: number;
  weekNumber: number;
  /** Thời điểm bắt đầu kỳ (Thứ Hai 00:00:00 GMT+7) tính theo UTC */
  startAt: Date;
  /** Thời điểm kết thúc kỳ (Chủ Nhật 23:59:59.999 GMT+7) tính theo UTC */
  endInclusive: Date;
  /** Thời điểm mốc chuyển sang tuần tiếp theo (Thứ Hai 00:00:00 GMT+7 tuần sau) tính theo UTC */
  endExclusive: Date;
  /** Chuỗi ngày bắt đầu (DD/MM/YYYY) theo giờ Việt Nam */
  startDateStr: string;
  /** Chuỗi ngày kết thúc (DD/MM/YYYY) theo giờ Việt Nam */
  endDateStr: string;
  /** Chuỗi khoảng ngày hiển thị chuẩn: "DD/MM/YYYY - DD/MM/YYYY" */
  displayRange: string;
  /** Tiêu đề chuẩn của kỳ: "Tuần WW/YYYY (DD/MM/YYYY - DD/MM/YYYY)" */
  standardTitle: string;
}

const VN_OFFSET_HOURS = 7;
const VN_OFFSET_MS = VN_OFFSET_HOURS * 60 * 60 * 1000;

/**
 * Chuyển đổi một mốc thời gian UTC sang các thành phần lịch tại GMT+7
 */
export function getVnDateParts(date: Date): { year: number; month: number; day: number; dayOfWeek: number } {
  const vnTime = new Date(date.getTime() + VN_OFFSET_MS);
  return {
    year: vnTime.getUTCFullYear(),
    month: vnTime.getUTCMonth() + 1, // 1-12
    day: vnTime.getUTCDate(),
    dayOfWeek: vnTime.getUTCDay(), // 0 = CN, 1 = T2, ..., 6 = T7
  };
}

/**
 * Tạo đối tượng Date UTC từ ngày tháng năm tại múi giờ GMT+7 lúc 00:00:00
 */
export function createVnDate(year: number, month: number, day: number, hour = 0, minute = 0, second = 0, ms = 0): Date {
  const utcMs = Date.UTC(year, month - 1, day, hour, minute, second, ms) - VN_OFFSET_MS;
  return new Date(utcMs);
}

/**
 * Tính toán mốc tuần ISO 8601 theo năm và số thứ tự tuần
 */
export function getIsoWeekBounds(year: number, weekNumber: number): IsoWeekInfo {
  // ISO 8601: Tuần 1 là tuần chứa ngày Thứ Năm đầu tiên của năm, hoặc chứa ngày 4 tháng 1.
  // Ngày 4/1 luôn thuộc Tuần 1.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4DayOfWeek = jan4.getUTCDay() || 7; // Chuyển 0 (CN) thành 7 (1 = T2, ..., 7 = CN)
  
  // Thứ Hai của Tuần 1
  const week1MondayUtc = new Date(jan4.getTime() - (jan4DayOfWeek - 1) * 86400000);
  
  // Thứ Hai của Tuần cần tìm
  const targetMondayUtc = new Date(week1MondayUtc.getTime() + (weekNumber - 1) * 7 * 86400000);
  
  const y = targetMondayUtc.getUTCFullYear();
  const m = targetMondayUtc.getUTCMonth() + 1;
  const d = targetMondayUtc.getUTCDate();
  
  // Thứ Hai 00:00:00 GMT+7
  const startAt = createVnDate(y, m, d, 0, 0, 0, 0);
  // Chủ Nhật 23:59:59.999 GMT+7 (sau đó 6 ngày + 23h:59m:59s.999ms)
  const endInclusive = new Date(startAt.getTime() + 7 * 86400000 - 1);
  // Thứ Hai tuần sau 00:00:00 GMT+7 (endExclusive)
  const endExclusive = new Date(startAt.getTime() + 7 * 86400000);

  const startParts = getVnDateParts(startAt);
  const endParts = getVnDateParts(endInclusive);

  const pad = (n: number) => String(n).padStart(2, "0");
  const startDateStr = `${pad(startParts.day)}/${pad(startParts.month)}/${startParts.year}`;
  const endDateStr = `${pad(endParts.day)}/${pad(endParts.month)}/${endParts.year}`;
  const displayRange = `${startDateStr} - ${endDateStr}`;
  const standardTitle = `Tuần ${weekNumber}/${year} (${displayRange})`;

  return {
    year,
    weekNumber,
    startAt,
    endInclusive,
    endExclusive,
    startDateStr,
    endDateStr,
    displayRange,
    standardTitle,
  };
}

/**
 * Xác định tuần ISO 8601 từ một mốc ngày bất kỳ (tính theo GMT+7)
 */
export function getIsoWeekFromDate(date: Date): IsoWeekInfo {
  const vnParts = getVnDateParts(date);
  // Tạo ngày tương đương tại UTC để dùng thuật toán ISO
  const target = new Date(Date.UTC(vnParts.year, vnParts.month - 1, vnParts.day));
  const dayNumber = target.getUTCDay() || 7;
  
  // Đưa về Thứ Năm của tuần đó
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
  const year = target.getUTCFullYear();
  
  // Thứ Năm của tuần 1 năm đó
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const firstThursdayDayNumber = firstThursday.getUTCDay() || 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() + 4 - firstThursdayDayNumber);
  
  const weekNumber = 1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86400000) / 7);
  return getIsoWeekBounds(year, weekNumber);
}

/**
 * Nhãn kỳ hiện tại theo lịch (GMT+7) — dùng cho UI thay vì hardcode "Tuần 41", "Tháng 10".
 */
export function getCurrentPeriodLabels(): {
  weekNumber: number;
  year: number;
  month: number;
  weekShort: string;
  monthShort: string;
} {
  const now = new Date();
  const vn = getVnDateParts(now);
  const iso = getIsoWeekFromDate(now);
  return {
    weekNumber: iso.weekNumber,
    year: vn.year,
    month: vn.month,
    weekShort: `Tuần ${iso.weekNumber}`,
    monthShort: `Tháng ${vn.month}/${vn.year}`,
  };
}
/**
 * Format chuỗi khoảng ngày từ cặp startAt và endAt bất kỳ trong CSDL
 */
export function formatPeriodRangeFromDates(startAt: Date, endAt: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const sParts = getVnDateParts(startAt);
  
  // Nếu endAt là exclusive (chẵn 00:00:00), ta lùi 1ms để lấy ngày kết thúc thực tế
  let effectiveEnd = endAt;
  if (endAt.getTime() > startAt.getTime()) {
    const endVn = new Date(endAt.getTime() + VN_OFFSET_MS);
    if (endVn.getUTCHours() === 0 && endVn.getUTCMinutes() === 0 && endVn.getUTCSeconds() === 0) {
      effectiveEnd = new Date(endAt.getTime() - 1000);
    }
  }
  const eParts = getVnDateParts(effectiveEnd);

  return `${pad(sParts.day)}/${pad(sParts.month)}/${sParts.year} - ${pad(eParts.day)}/${pad(eParts.month)}/${eParts.year}`;
}

/**
 * Kiểm tra xem một ngày làm việc có nằm trong khoảng thời gian của kỳ hay không
 */
export function isDateWithinPeriod(workDate: Date, startAt: Date, endAt: Date): boolean {
  const t = workDate.getTime();
  // Bao gồm đầu kỳ, nếu endAt là exclusive
  return t >= startAt.getTime() && t <= endAt.getTime();
}

/**
 * Sinh danh sách 7 ngày trong tuần cho giao diện lập kế hoạch từ startAt của kỳ
 */
export function getDaysOfWeekFromStart(startAt: Date): Array<{
  value: string;
  label: string;
  dayLabel: string;
  dateStr: string;
}> {
  const dayNames = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"];
  const list = [];
  const pad = (n: number) => String(n).padStart(2, "0");

  for (let i = 0; i < 7; i++) {
    const current = new Date(startAt.getTime() + i * 86400000);
    const p = getVnDateParts(current);
    // Tính dayName theo VN (getUTCDay: 0=CN, 1=T2, ..., 6=T7)
    const vnDayIdx = p.dayOfWeek === 0 ? 6 : p.dayOfWeek - 1; // 0=T2, ..., 6=CN
    const dayLabel = dayNames[vnDayIdx] || "Ngày";
    const dateStr = `${pad(p.day)}/${pad(p.month)}/${p.year}`;
    const value = `${p.year}-${pad(p.month)}-${pad(p.day)}`;
    list.push({
      value,
      label: `${dayLabel} (${dateStr})`,
      dayLabel,
      dateStr,
    });
  }
  return list;
}

/**
 * Đánh giá độ chuẩn xác ISO 8601 của một bản ghi ReportingPeriod có sẵn trong CSDL
 */
export function evaluatePeriodIsoCompliance(period: {
  title: string;
  startAt: Date;
  endAt: Date;
}): {
  isCompliant: boolean;
  expectedBounds?: IsoWeekInfo;
  currentDisplay: string;
  expectedDisplay?: string;
  warningMessage?: string;
} {
  const currentDisplay = formatPeriodRangeFromDates(period.startAt, period.endAt);
  // Trích xuất số tuần từ title nếu có (ví dụ: "Tuần 41/2026" hoặc "Tuần 41")
  const match = period.title.match(/Tuần\s+(\d+)(?:\/(\d+)|[^\d]+(\d{4}))?/i);
  if (!match) {
    return {
      isCompliant: true,
      currentDisplay,
    };
  }

  const weekNum = parseInt(match[1], 10);
  const year = match[2] || match[3] ? parseInt(match[2] || match[3], 10) : getVnDateParts(period.startAt).year;
  const isoBounds = getIsoWeekBounds(year, weekNum);

  // So sánh startAt (cho phép chênh lệch do giây/milis)
  const isStartMatch = Math.abs(period.startAt.getTime() - isoBounds.startAt.getTime()) < 60000;
  const isEndMatch =
    Math.abs(period.endAt.getTime() - isoBounds.endExclusive.getTime()) < 60000 ||
    Math.abs(period.endAt.getTime() - isoBounds.endInclusive.getTime()) < 60000;

  const isCompliant = isStartMatch && isEndMatch;
  return {
    isCompliant,
    expectedBounds: isoBounds,
    currentDisplay,
    expectedDisplay: isoBounds.displayRange,
    warningMessage: isCompliant
      ? undefined
      : `Bản ghi "${period.title}" không khớp lịch ISO 8601: Hiện tại (${currentDisplay}) vs Chuẩn ISO (${isoBounds.displayRange})`,
  };
}
