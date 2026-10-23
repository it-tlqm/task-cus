/**
 * Định dạng số liệu chỉ tiêu (dùng chung cho các trang Số liệu giao ban).
 * Giá trị lưu trong CSDL là ĐƠN VỊ GỐC; hiển thị chia theo displayScale.
 */

export interface MetricStyle {
  displayScale: number;
  decimals: number;
  unitLabel?: string | null;
}

export function fmtMetric(value: number | null | undefined, style: MetricStyle, opts?: { withUnit?: boolean }): string {
  if (value === null || value === undefined) return "—";
  const v = value / (style.displayScale || 1);
  const s = v.toLocaleString("vi-VN", {
    minimumFractionDigits: style.decimals || 0,
    maximumFractionDigits: style.decimals || 0,
  });
  if (opts?.withUnit === false || !style.unitLabel) return s;
  return `${s} ${style.unitLabel}`;
}

/** Đổi giá trị gốc -> chuỗi để đưa vào ô nhập (theo đơn vị hiển thị). */
export function baseToInput(value: number | null | undefined, style: MetricStyle): string {
  if (value === null || value === undefined) return "";
  const v = value / (style.displayScale || 1);
  if (style.decimals === 0) return String(Math.round(v));
  return String(Number(v.toFixed(style.decimals)));
}

/** B-C-2/Q11: tỷ lệ 2 chữ số thập phân, dấu phẩy vi-VN; thiếu dữ liệu -> gạch dài. */
export function fmtPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${value.toLocaleString("vi-VN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export const STATUS_LABELS: Record<string, string> = {
  RECORDED: "Đã nhập",
  DRAFT: "Nháp",
  SUBMITTED: "Chờ kiểm tra",
  CONFIRMED: "Đã xác nhận",
  NEEDS_FIX: "Cần sửa",
  "": "Chưa nhập",
};

export const STATUS_STYLES: Record<string, string> = {
  RECORDED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  DRAFT: "bg-sky-50 text-sky-700 border-sky-200",
  SUBMITTED: "bg-amber-50 text-amber-700 border-amber-200",
  CONFIRMED: "bg-emerald-100 text-emerald-800 border-emerald-300",
  NEEDS_FIX: "bg-rose-50 text-rose-700 border-rose-200",
};
