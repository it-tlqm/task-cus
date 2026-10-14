/**
 * Formula Sanitizer Utility
 * Hải quan Cửa khẩu Quốc tế Tà Lùng (talung-cus-work)
 * 
 * Mục tiêu: Triệt tiêu hoàn toàn lỗ hổng CSV / Formula Injection (CWE-1236)
 * khi người dùng nhập dữ liệu độc hại bắt đầu bằng '=', '+', '-', '@', '\t', '\r', '\n'
 * nhằm thực thi mã lệnh hoặc macro khi file Excel được mở trên Microsoft Excel/LibreOffice.
 */

const DANGEROUS_PREFIXES = ['=', '+', '-', '@', '\t', '\r', '\n'];

/**
 * Làm sạch chuỗi ký tự trước khi đưa vào ô bảng tính Excel.
 * Nếu chuỗi bắt đầu bằng các ký tự công thức nguy hiểm hoặc ký tự điều khiển,
 * thêm tiền tố dấu nháy đơn (') để Excel hiểu và hiển thị đây là chuỗi văn bản thuần túy (Text/Literal).
 */
export function sanitizeFormula(value: string): string;
export function sanitizeFormula(value: unknown): unknown;
export function sanitizeFormula(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  if (value.length === 0) {
    return value;
  }

  // 1. Kiểm tra trực tiếp ký tự đầu tiên
  const firstRaw = value[0];
  if (DANGEROUS_PREFIXES.includes(firstRaw)) {
    return `'${value}`;
  }

  // 2. Kiểm tra ký tự đầu tiên sau khi loại bỏ khoảng trắng dẫn đầu
  const trimmed = value.trimStart();
  if (trimmed.length > 0 && DANGEROUS_PREFIXES.includes(trimmed[0])) {
    return `'${value}`;
  }

  return value;
}

/**
 * Đệ quy làm sạch toàn bộ các trường chuỗi trong một object hoặc array
 */
export function sanitizeData<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    return sanitizeFormula(data) as unknown as T;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeData(item)) as unknown as T;
  }

  if (typeof data === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
      result[key] = sanitizeData(val);
    }
    return result as T;
  }

  return data;
}
