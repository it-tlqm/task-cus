/**
 * lib/datetime.ts — Xử lý ngày giờ theo múi giờ nghiệp vụ Việt Nam.
 *
 * MỤC TIÊU (YC-38 UAT fix — lỗi lệch +7 giờ):
 *  1. Ngày giờ NGƯỜI DÙNG NHẬP luôn được hiểu là giờ Việt Nam (Asia/Ho_Chi_Minh).
 *     Nhập 30/10/2026 17:00 → lưu `2026-10-30T10:00:00.000Z` → hiển thị lại 30/10/2026 17:00.
 *  2. Mọi thao tác KHÔNG phụ thuộc múi giờ của thiết bị/máy chủ
 *     (không dùng `getHours()`, `toLocaleString()` không chỉ định timeZone).
 *  3. Phân biệt rõ:
 *     - DATETIME  (có giờ): `tasks.original_deadline`, `tasks.current_deadline`, …
 *     - DATE-ONLY (chỉ ngày): `personal_work_items.due_date`, `monthly_work_results.due_date`…
 *       → các trường DATE-ONLY KHÔNG quy đổi múi giờ, giữ nguyên ngày đã nhập.
 *
 * Ghi chú: Việt Nam không áp dụng DST ⇒ UTC+7 cố định (420 phút).
 */

export const VN_TIMEZONE = "Asia/Ho_Chi_Minh";
export const VN_OFFSET_MINUTES = 420;
const VN_OFFSET_MS = VN_OFFSET_MINUTES * 60 * 1000;

/** Giờ kết thúc mặc định trong nghiệp vụ (form nhập hạn). */
export const DEFAULT_DEADLINE_TIME = "17:00";

/** Chuỗi ngày (YYYY-MM-DD) — trường DATE-ONLY, không quy đổi múi giờ. */
export function isDateOnlyString(value: unknown): boolean {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

/**
 * Chuẩn hóa DATE-ONLY về đúng định dạng YYYY-MM-DD.
 * Không dùng `new Date()` (sẽ theo múi giờ thiết bị) — giữ nguyên ngày đã nhập.
 */
export function parseDateOnly(value: unknown): string | null {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (isDateOnlyString(s)) return s;
  // ISO đầy đủ → lấy phần ngày theo giờ Việt Nam
  const parts = formatVnDateTimeParts(s);
  return parts ? parts.date : null;
}

/**
 * Ngày giờ NGƯỜI DÙNG NHẬP (giờ Việt Nam) → chuỗi ISO UTC.
 * `dateStr`: "YYYY-MM-DD" hoặc "YYYY-MM-DDTHH:mm" (datetime-local).
 * `timeStr`: "HH:mm" (tuỳ chọn — bỏ trống thì lấy giờ trong dateStr, mặc định 00:00).
 */
export function vnLocalToUtcIso(dateStr: string, timeStr?: string | null): string {
  const raw = String(dateStr || "").trim();
  if (!raw) throw new Error("Thiếu ngày giờ");

  const [datePart, timePart] = raw.split("T");
  const [y, m, d] = datePart.split("-").map((v) => Number(v));
  if (!y || !m || !d) throw new Error(`Ngày không hợp lệ: ${dateStr}`);

  const hhmm = (timeStr && String(timeStr).trim()) || timePart || "00:00";
  const [hh, mm] = hhmm.split(":").map((v) => Number(v || 0));
  const utcMs = Date.UTC(y, m - 1, d, hh || 0, mm || 0, 0, 0) - VN_OFFSET_MS;
  return new Date(utcMs).toISOString();
}

/**
 * Ngày (DATE-ONLY do người dùng nhập) → thời điểm hết ngày theo giờ Việt Nam.
 * Dùng cho các trường DATE-ONLY nhưng nguồn nhập là hộp chọn ngày.
 */
export function vnDateToDeadlineIso(dateStr: string, time = DEFAULT_DEADLINE_TIME): string {
  return vnLocalToUtcIso(dateStr, time);
}

function formatter(opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("vi-VN", { timeZone: VN_TIMEZONE, hourCycle: "h23", ...opts });
}

const dtFormatter = formatter({
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const dFormatter = formatter({ day: "2-digit", month: "2-digit", year: "numeric" });

/** Tách thời điểm UTC thành ngày/giờ theo giờ Việt Nam. */
export function formatVnDateTimeParts(
  value: string | number | Date | null | undefined
): { date: string; time: string; isoDate: string } | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const p: Record<string, string> = {};
  for (const part of dtFormatter.formatToParts(d)) p[part.type] = part.value;
  if (!p.day || !p.month || !p.year) return null;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}`,
    isoDate: `${p.day}/${p.month}/${p.year}`,
  };
}

/** Hiển thị thời điểm theo giờ Việt Nam — luôn giống nhau dù thiết bị ở múi giờ nào. */
export function formatVnDateTime(value: string | number | Date | null | undefined): string {
  const parts = formatVnDateTimeParts(value);
  if (!parts) return "—";
  return `${parts.isoDate} ${parts.time}`;
}

/** Hiển thị ngày theo giờ Việt Nam (DD/MM/YYYY). */
export function formatVnDate(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  // DATE-ONLY: giữ nguyên ngày đã lưu, KHÔNG quy đổi múi giờ
  if (isDateOnlyString(value)) {
    const [y, m, d] = String(value).split("-");
    return `${d}/${m}/${y}`;
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const p: Record<string, string> = {};
  for (const part of dFormatter.formatToParts(d)) p[part.type] = part.value;
  if (!p.day) return "—";
  return `${p.day}/${p.month}/${p.year}`;
}

/** Giá trị cho ô nhập `datetime-local` (giờ Việt Nam) — "YYYY-MM-DDTHH:mm". */
export function utcIsoToVnInputValue(value: string | number | Date | null | undefined): string {
  const parts = formatVnDateTimeParts(value);
  return parts ? `${parts.date}T${parts.time}` : "";
}

/**
 * Ngày (YYYY-MM-DD) của một thời điểm bất kỳ, theo giờ Việt Nam.
 * Dùng cho các trường DATE-ONLY nghiệp vụ (ngày hoàn thành, hạn xử lý) để
 * KHÔNG phụ thuộc múi giờ của thiết bị.
 */
export function vnDateOnly(value: Date | string | number = new Date()): string {
  const parts = formatVnDateTimeParts(value);
  return parts ? parts.date : "";
}

/**
 * Lấy NGÀY LỊCH (YYYY-MM-DD) từ một giá trị ngày / ngày-giờ mà **không dịch múi giờ**.
 *
 * Vì sao cần (YC-38 D6-F12):
 *  - API trả các cột DATE-ONLY dưới dạng chuỗi ISO đầy đủ (VD "2026-10-23T00:00:00.000Z").
 *  - `<input type="date">` **bắt buộc** đúng 10 ký tự "YYYY-MM-DD"; nếu đưa chuỗi 16 ký tự
 *    ("2026-10-23T00:00") thì trình duyệt hiển thị ô TRỐNG (giá trị không hợp lệ).
 *  - Lấy **10 ký tự đầu** ⇒ giữ đúng ngày lịch đã khai, không lệch theo múi giờ máy/trình duyệt.
 */
export function toCalendarDate(value?: string | Date | null): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "string") {
    const m = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  }
  const d = value;
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

/**
 * Chuyển ngày lịch ("YYYY-MM-DD") thành ISO **UTC nửa đêm** — không phụ thuộc múi giờ.
 * Dùng khi gửi giá trị của `<input type="date">` lên API.
 */
export function calendarDateToIso(dateOnly: string): string {
  const clean = toCalendarDate(dateOnly);
  if (!clean) return "";
  return new Date(`${clean}T00:00:00.000Z`).toISOString();
}

/**
 * Ngày/giờ hiện tại theo giờ Việt Nam (dùng làm giá trị mặc định của form).
 */
export function vnNowLocalParts(now: Date = new Date()): { date: string; time: string } {
  const parts = formatVnDateTimeParts(now);
  return parts ? { date: parts.date, time: parts.time } : { date: "", time: "" };
}

/** Số ngày lệch giữa hai mốc (theo ngày lịch Việt Nam). */
export function diffDaysVn(from: string | Date, to: string | Date): number {
  const a = new Date(from);
  const b = new Date(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  const da = Date.UTC(
    a.getUTCFullYear(),
    a.getUTCMonth(),
    a.getUTCDate(),
    a.getUTCHours() - Math.floor(VN_OFFSET_MINUTES / 60),
    a.getUTCMinutes()
  );
  const db = Date.UTC(
    b.getUTCFullYear(),
    b.getUTCMonth(),
    b.getUTCDate(),
    b.getUTCHours() - Math.floor(VN_OFFSET_MINUTES / 60),
    b.getUTCMinutes()
  );
  return Math.round((db - da) / 86400000);
}
