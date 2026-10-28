/**
 * Nhập số liệu giao ban từ Excel — phần thuần (không phụ thuộc React/trình duyệt)
 * để dùng lại ở màn hình nhập và trong test.
 */

export interface ImportMetricOption {
  id: string;
  code: string;
  name: string;
  canEnter: boolean;
  values: Array<{ classificationId: string; label: string }>;
}

export interface ImportRow {
  metricId: string;
  classificationId: string;
  value: string;
  note: string;
  code: string;
  metricName: string;
  classLabel: string;
}

export interface ImportParseResult {
  rows: ImportRow[];
  errors: string[];
  skipped: number;
}

export function normalizeKey(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function pickColumn(row: Record<string, unknown>, ...names: string[]): string {
  const wanted = names.map(normalizeKey);
  for (const [key, value] of Object.entries(row)) {
    if (wanted.includes(normalizeKey(key))) return String(value ?? "").trim();
  }
  return "";
}

/** Nhận cả "1.234,56", "1234.56", "1 234" — trả về chuỗi số đã chuẩn hoá cho API. */
export function parseImportNumber(raw: string): string | null {
  let text = raw.replace(/[^\d.,-]/g, "").trim();
  if (!text) return null;
  const negative = text.startsWith("-");
  text = text.replace(/-/g, "");
  if (text.includes(",") && text.includes(".")) {
    // Dấu chấm là phân cách hàng nghìn, dấu phẩy là thập phân.
    text = text.replace(/\./g, "").replace(",", ".");
  } else if (text.includes(",")) {
    text = text.replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(text)) {
    text = text.replace(/\./g, "");
  }
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  return (negative ? "-" : "") + text;
}

/**
 * Đọc các dòng Excel (đã chuyển thành object theo tiêu đề cột) và ánh xạ sang
 * chỉ tiêu/phân loại người dùng được nhập. Dòng không có giá trị được bỏ qua.
 */
export function parseImportRows(
  raw: Array<Record<string, unknown>>,
  metrics: ImportMetricOption[]
): ImportParseResult {
  const editable = metrics.filter((m) => m.canEnter);
  const byCode = new Map<string, ImportMetricOption>();
  for (const metric of editable) byCode.set(normalizeKey(metric.code), metric);

  const rows: ImportRow[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  let skipped = 0;

  raw.forEach((row, index) => {
    const line = index + 2; // dòng 1 là tiêu đề
    const code = pickColumn(row, "Mã chỉ tiêu", "Ma chi tieu", "Mã", "Code");
    if (!code) {
      skipped += 1;
      return;
    }
    const rawValue = pickColumn(row, "Giá trị", "Gia tri", "Value");
    if (!rawValue) {
      skipped += 1;
      return;
    }
    const metric = byCode.get(normalizeKey(code));
    if (!metric) {
      errors.push(`Dòng ${line}: mã "${code}" không thuộc chỉ tiêu bạn được nhập trong kỳ này`);
      return;
    }
    const label = pickColumn(row, "Phân loại", "Phan loai");
    let target: { classificationId: string; label: string } | undefined;
    if (label) {
      target = metric.values.find((v) => normalizeKey(v.label) === normalizeKey(label));
      if (!target) {
        errors.push(`Dòng ${line}: phân loại "${label}" không thuộc chỉ tiêu ${metric.code}`);
        return;
      }
    } else if (metric.values.length === 1) {
      target = metric.values[0];
    } else {
      target = metric.values.find((v) => !v.label);
    }
    if (!target) {
      errors.push(`Dòng ${line}: chỉ tiêu ${metric.code} có nhiều phân loại, cần ghi rõ cột "Phân loại"`);
      return;
    }
    const key = `${metric.id}|${target.classificationId}`;
    if (seen.has(key)) {
      errors.push(`Dòng ${line}: ${metric.code}${target.label ? ` · ${target.label}` : ""} bị trùng, chỉ nhận dòng đầu`);
      return;
    }
    const value = parseImportNumber(rawValue);
    if (value === null) {
      errors.push(`Dòng ${line}: giá trị "${rawValue}" không phải số hợp lệ`);
      return;
    }
    seen.add(key);
    rows.push({
      metricId: metric.id,
      classificationId: target.classificationId,
      value,
      note: pickColumn(row, "Ghi chú", "Ghi chu", "Note"),
      code: metric.code,
      metricName: metric.name,
      classLabel: target.label,
    });
  });

  return { rows, errors, skipped };
}

/** Sinh danh sách dòng cho file mẫu Excel. */
export function buildImportTemplateRows(metrics: ImportMetricOption[], unitOf: (id: string) => string) {
  return metrics
    .filter((m) => m.canEnter)
    .flatMap((metric) =>
      metric.values.map((value) => ({
        "Mã chỉ tiêu": metric.code,
        "Tên chỉ tiêu": metric.name,
        "Phân loại": value.label,
        "Đơn vị": unitOf(metric.id),
        "Giá trị": "",
        "Ghi chú": "",
      }))
    );
}
