/**
 * YC-33 — Số học cố định (fixed-point) để tính điểm chính xác, lặp lại cho kết quả giống nhau.
 *
 * Dùng BigInt với SCALE chữ số thập phân → không có lỗi nhị phân của Number
 * (ví dụ 0.1 + 0.2 !== 0.3), làm tròn kiểu "round half up" như Excel.
 */

export const SCALE_DECIMALS = 6;
export const SCALE = 10n ** BigInt(SCALE_DECIMALS);

/** Chuyển số (hoặc chuỗi) thành fixed-point. null/undefined/NaN → null. */
export function toFixed(value: number | string | null | undefined): bigint | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(n)) return null;
  const negative = n < 0;
  const abs = Math.abs(n);
  // Nhân 10^SCALE rồi làm tròn half-up (tránh lỗi float của Math.round(x*1e6)).
  const scaled = abs * Number(SCALE);
  const rounded = BigInt(Math.floor(scaled + 0.5));
  return negative ? -rounded : rounded;
}

/** Số thực từ fixed-point. */
export function fromFixed(value: bigint | null): number | null {
  if (value === null) return null;
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / SCALE;
  const frac = (abs % SCALE).toString().padStart(SCALE_DECIMALS, "0");
  const out = Number(`${whole}.${frac}`);
  return negative ? -out : out;
}

/** Nhân hai fixed-point. */
export function mulFixed(a: bigint, b: bigint): bigint {
  return (a * b) / SCALE;
}

/** Chia hai fixed-point (làm tròn half-up về phía dương). */
export function divFixed(a: bigint, b: bigint): bigint {
  if (b === 0n) throw new Error("Chia cho 0");
  const negative = (a < 0n) !== (b < 0n);
  const num = a < 0n ? -a : a;
  const den = b < 0n ? -b : b;
  const result = (num * SCALE + den / 2n) / den;
  return negative ? -result : result;
}

/** Cộng/từ một fixed-point. */
export function addFixed(a: bigint, b: bigint): bigint {
  return a + b;
}

export function subFixed(a: bigint, b: bigint): bigint {
  return a - b;
}

/**
 * Nhân với hệ số phần trăm (ví dụ 25% = 25, 70% = 70).
 * `a` là fixed-point, `percent` là số nguyên → kết quả vẫn ở thang fixed-point.
 */
export function mulPercent(a: bigint, percent: bigint): bigint {
  return (a * percent) / 100n;
}

/** Nhân với một SỐ ĐẾM nguyên (ví dụ số ngày chậm tiến độ) — giữ nguyên thang fixed-point. */
export function mulCount(a: bigint, count: bigint): bigint {
  return a * count;
}
