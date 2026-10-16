import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";

export interface Plan02CRow {
  title: string;
  outputText: string | null;
  evidenceRef: string | null;
  dueDate: Date | null;
  completedDate: Date | null;
  notes: string | null;
}

const TEMPLATE_REL = ["public", "templates", "kehoach-thang-02c-template.xlsx"];
const BAND_CAP = 25;

/**
 * Điền Kế hoạch tháng (Mẫu 02C): STT, Nội dung, Sản phẩm, Thời gian, Ghi chú.
 * Cột Chỉ tiêu/KPI để trống (hệ thống chưa có nguồn số này).
 * Toàn bộ dữ liệu nằm dưới mục I (nhiệm vụ được phân công).
 */
export async function buildMonthlyPlan02C(
  items: Plan02CRow[],
  person: { fullName: string; positionTitle?: string | null; unitName?: string | null },
  year: number,
  month: number
): Promise<Buffer> {
  if (items.length > BAND_CAP) {
    throw new Error(`Tháng này có ${items.length} đầu việc, vượt quá sức chứa mẫu 02C (${BAND_CAP}). Liên hệ quản trị để tách đợt.`);
  }
  const tplPath = path.join(process.cwd(), ...TEMPLATE_REL);
  if (!fs.existsSync(tplPath)) throw new Error("Thiếu file mẫu 02C: public/templates/kehoach-thang-02c-template.xlsx");

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(tplPath);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("Template 02C trống");

  const textOf = (r: number, c: number) => String(ws.getRow(r).getCell(c).value ?? "");

  // Định vị: hàng tháng (merge chứa "Tháng"), hàng tiêu đề lá "(1)", section I
  let monthRow = 0, headRow = 0;
  for (let r = 1; r <= Math.min(15, ws.rowCount); r++) {
    const rowText = [1, 2, 3, 4, 5, 6].map((c) => textOf(r, c)).join(" ");
    if (/Tháng\s*\d/.test(rowText) && !monthRow) monthRow = r;
    if (textOf(r, 1).trim() === "(1)") headRow = r;
  }
  if (!headRow) throw new Error("Template 02C không đúng cấu trúc (thiếu hàng (1)-(6))");
  const d0 = headRow + 2; // bỏ qua hàng "I. Nhiệm vụ được phân công"

  if (monthRow > 0) ws.getRow(monthRow).getCell(1).value = `Tháng ${month} năm ${year}`;

  // Thông tin cán bộ: null mọi công thức sang Bảng1 (file xuất độc lập),
  // rồi điền giá trị thuần. Template cố định: R8 = họ tên.
  for (let r = 1; r <= 12; r++) {
    const cell = ws.getRow(r).getCell(1);
    const v: any = cell.value;
    if (v && typeof v === "object" && "formula" in v) cell.value = null;
  }
  ws.getRow(8).getCell(1).value = `Họ và tên: ${person.fullName}`;
  // R9/R10/R11: chức vụ + đơn vị (ghi đè nhãn kèm giá trị để không lẫn mẫu cũ)
  const setInfo = (match: RegExp, value: string) => {
    for (let r = 1; r <= 12; r++) {
      if (match.test(textOf(r, 1))) {
        const label = textOf(r, 1).split(":")[0];
        ws.getRow(r).getCell(1).value = value ? `${label}: ${value}` : label;
      }
    }
  };
  setInfo(/Chức vụ/, person.positionTitle || "");
  setInfo(/Đơn vị công tác/, person.unitName || "");
  setInfo(/Vị trí việc làm/, person.positionTitle || "");

  items.forEach((it, idx) => {
    const r = d0 + idx;
    const row = ws.getRow(r);
    row.getCell(1).value = idx + 1;
    row.getCell(2).value = it.title;
    const cParts = [it.outputText?.trim(), it.evidenceRef?.trim() ? `(${it.evidenceRef.trim()})` : ""].filter(Boolean);
    row.getCell(3).value = cParts.join(" ") || null;
    row.getCell(4).value = it.completedDate || it.dueDate;
    row.getCell(5).value = null; // Chỉ tiêu/KPI: chưa có nguồn số liệu
    row.getCell(6).value = it.notes?.trim() || null;
  });

  // Chữ ký: phải = người lập (in tên), trái để trống cho lãnh đạo ký tay
  ws.eachRow((row) => {
    [1, 4].forEach((c) => {
      const cell = row.getCell(c);
      if (cell.value === "{{SIGN_RIGHT}}") cell.value = person.fullName;
      if (cell.value === "{{SIGN_LEFT}}") cell.value = null;
    });
  });

  wb.calcProperties.fullCalcOnLoad = true;
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
