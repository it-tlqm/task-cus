/**
 * YC-04 — Tiện ích chống gửi trùng (idempotency) dùng chung cho API nhiệm vụ.
 * Nguyên tắc: UI disabled chỉ là lớp đầu; backend phải tự bảo vệ bằng
 * khóa tư vấn Postgres (chặn race đồng thời) + cửa sổ trùng lặp theo thời gian.
 */

/** Tiến độ hợp lệ: 0–100, bước 5% (YC-09). */
export function isValidProgressStep(v: unknown): boolean {
  if (typeof v !== "number" || !Number.isFinite(v)) return false;
  if (v < 0 || v > 100) return false;
  return v % 5 === 0;
}

/** Chuẩn hóa tiêu đề để so trùng: trim + gộp khoảng trắng + lowercase. */
export function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Khóa tư vấn trong transaction hiện tại. Hai request cùng key sẽ xếp hàng
 * tuần tự — request sau thấy bản ghi request trước vừa tạo và tái sử dụng.
 */
export async function advisoryLock(tx: any, key: string): Promise<void> {
  await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, key);
}
