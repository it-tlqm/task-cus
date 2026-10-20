/**
 * Chuẩn hóa ngày dạng DATE (không kèm giờ) cho hạn xử lý / ngày hoàn thành.
 * - undefined: không cung cấp (giữ nguyên khi PATCH)
 * - null / "": xóa giá trị
 * - "YYYY-MM-DD" hoặc ISO: lưu mốc 00:00 UTC của đúng ngày
 */

export type ParsedDateOnly =
  | { ok: true; value: Date | null | undefined }
  | { ok: false; message: string };

export function parseDateOnly(value: unknown): ParsedDateOnly {
  if (value === undefined) return { ok: true, value: undefined };
  if (value === null || value === "") return { ok: true, value: null };

  let date: Date;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return { ok: false, message: "Ngày không hợp lệ" };
    date = value;
  } else if (typeof value === "string") {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
    if (!match) return { ok: false, message: "Ngày phải có định dạng YYYY-MM-DD" };
    const y = Number(match[1]);
    const m = Number(match[2]);
    const d = Number(match[3]);
    date = new Date(Date.UTC(y, m - 1, d));
    // Chặn ngày không tồn tại (31/02…)
    if (
      date.getUTCFullYear() !== y ||
      date.getUTCMonth() !== m - 1 ||
      date.getUTCDate() !== d
    ) {
      return { ok: false, message: "Ngày không tồn tại" };
    }
  } else {
    return { ok: false, message: "Ngày không hợp lệ" };
  }

  return {
    ok: true,
    value: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())),
  };
}

/** Chuỗi YYYY-MM-DD để hiển thị/so sánh ổn định theo múi giờ Việt Nam. */
export function dateOnlyToInput(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

/** Ngày hôm nay theo múi giờ Việt Nam (UTC+7), dạng YYYY-MM-DD. */
export function todayInVietnam(): string {
  const now = new Date();
  const vn = new Date(now.getTime() + 7 * 3600_000);
  return vn.toISOString().slice(0, 10);
}
