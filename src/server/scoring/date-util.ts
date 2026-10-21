/**
 * YC-33 — Tiện ích ngày theo lịch Việt Nam (GMT+7).
 *
 * Bảng 1 gốc tính số ngày chậm tiến độ theo SỐ NGÀY LỊCH:
 *   K = IF(J − C > 0; J − C; 0)      (J, C là ô ngày — chỉ khác nhau ở mức ngày)
 *
 * Rủi ro: nếu một ngày được lưu theo giờ 00:00 giờ địa phương (ICT) nhưng đọc lại
 * ra 17:00 UTC hôm trước, phép trừ theo millisecond sẽ lệch 1 ngày
 * (2,958… ngày → làm tròn xuống còn 2 thay vì 3).
 *
 * → Mọi phép so sánh ngày trong bộ tính điểm đều quy về NGÀY LỊCH GMT+7.
 */

import { getVnDateParts } from "@/lib/period-helper";

/** Số ngày lịch (GMT+7) giữa hai mốc thời gian; dương = later > earlier. */
export function vnCalendarDayDiff(later: Date, earlier: Date): number {
  const a = getVnDateParts(later);
  const b = getVnDateParts(earlier);
  const aSerial = Date.UTC(a.year, a.month - 1, a.day);
  const bSerial = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((aSerial - bSerial) / 86400000);
}

/** Ngày lịch (GMT+7) dưới dạng "YYYY-MM-DD". */
export function vnCalendarDateKey(d: Date): string {
  const p = getVnDateParts(d);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Ngày lịch (GMT+7) hiển thị kiểu Việt Nam — dùng cho bảng in. */
export function vnCalendarDateLabel(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  const p = getVnDateParts(date);
  return `${String(p.day).padStart(2, "0")}/${String(p.month).padStart(2, "0")}/${p.year}`;
}
