import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";
import { MISSING_TEXT } from "./person-assignment";

export interface ExportResultRow {
  title: string;
  outputText: string | null;
  evidenceRef: string | null;
  factor: number | null;
  assignedQty: number | null;
  completedQty: number | null;
  dueDate: Date | null;
  completedDate: Date | null;
  lateCount: number;
  reworkCount: number;
}

export interface ExportPerson {
  fullName: string;
  /** Chức vụ, chức danh (Position.title). */
  positionTitle?: string | null;
  /**
   * Vị trí việc làm/nhiệm vụ chuyên trách — chỉ điền khi có nguồn riêng.
   * Hệ thống hiện chưa có danh mục này nên thường để trống.
   */
  jobPositionTitle?: string | null;
  unitName?: string | null;
}

/** Giá trị hiển thị: không bịa dữ liệu, thiếu thì dùng dấu gạch ngang. */
function displayValue(value: string | null | undefined): string {
  const text = value?.trim();
  return text ? text : MISSING_TEXT;
}

const TEMPLATE_REL = ["public", "templates", "bang1-01a-template.xlsx"];
const BAND_CAP = 60;

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}

/**
 * GĐ3 — Điền dữ liệu thật vào bản sao template Bảng 1 + 01A.
 * GIỮ NGUYÊN toàn bộ công thức/mẹrge/định dạng mẫu gốc; ô trống để trống.
 * Excel tự tính lại khi mở (fullCalcOnLoad).
 */
export async function buildMonthlyWorkbook(
  items: ExportResultRow[],
  person: ExportPerson,
  year: number,
  month: number
): Promise<Buffer> {
  if (items.length > BAND_CAP) {
    throw new Error(`Tháng này có ${items.length} đầu việc, vượt quá sức chứa mẫu (${BAND_CAP}). Liên hệ quản trị để tách đợt.`);
  }
  const tplPath = path.join(process.cwd(), ...TEMPLATE_REL);
  if (!fs.existsSync(tplPath)) throw new Error("Thiếu file mẫu xuất: public/templates/bang1-01a-template.xlsx");

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(tplPath);
  const b1 = wb.getWorksheet("Bảng 1 (tính điểm CC)");
  if (!b1) throw new Error("Template thiếu sheet Bảng 1");

  // Định vị dải dữ liệu + hàng tổng (theo nhãn, không hardcode số hàng)
  let headRow = 0, tongRow = 0;
  for (let r = 1; r <= b1.rowCount; r++) {
    const a = String(b1.getRow(r).getCell(1).value ?? "").trim();
    if (a === "(1)") headRow = r;
    if (/TỔNG/.test(a.toUpperCase()) && !tongRow) tongRow = r;
  }
  if (!headRow || !tongRow) throw new Error("Template Bảng 1 không đúng cấu trúc");
  const d0 = headRow + 1;

  items.forEach((it, idx) => {
    const r = d0 + idx;
    const row = b1.getRow(r);
    const E = it.factor ?? null;
    const F = it.assignedQty ?? null;
    const H = it.completedQty ?? null;
    const G = E !== null && F !== null ? E * F : 0;
    const I = E !== null && H !== null ? E * H : 0;
    const K = it.dueDate && it.completedDate ? Math.max(0, daysBetween(it.dueDate, it.completedDate)) : it.lateCount || 0;
    const M = it.reworkCount || 0;
    const L = I - K * 0.25 * I;
    const N = I - M * 0.25 * I;

    row.getCell(1).value = idx + 1;
    row.getCell(2).value = it.title;
    row.getCell(3).value = it.dueDate;
    const dParts = [it.outputText?.trim(), it.evidenceRef?.trim() ? `(${it.evidenceRef.trim()})` : ""].filter(Boolean);
    row.getCell(4).value = dParts.join(" ") || null;
    row.getCell(5).value = E;
    row.getCell(6).value = F;
    row.getCell(7).value = { formula: `E${r}*F${r}`, result: Math.round(G * 100) / 100 } as any;
    row.getCell(8).value = H;
    row.getCell(9).value = { formula: `E${r}*H${r}`, result: Math.round(I * 100) / 100 } as any;
    row.getCell(10).value = it.completedDate;
    row.getCell(11).value = { formula: `IF(J${r}-C${r}>0,J${r}-C${r},0)`, result: K } as any;
    row.getCell(12).value = { formula: `I${r}-K${r}*25%*I${r}`, result: Math.round(L * 100) / 100 } as any;
    row.getCell(13).value = M;
    row.getCell(14).value = { formula: `I${r}-M${r}*25%*I${r}`, result: Math.round(N * 100) / 100 } as any;
  });

  // Thông tin cán bộ (01A tham chiếu A4/A5 qua công thức)
  const setA = (r: number, v: string) => { b1.getRow(r).getCell(1).value = v; };
  setA(4, `Họ và tên: ${person.fullName}`);
  setA(5, `Vị trí việc làm/nhiệm vụ được phân công chuyên trách: ${displayValue(person.jobPositionTitle || person.positionTitle)}`);
  setA(6, `Đơn vị công tác: ${displayValue(person.unitName)}`);

  // 01A: tháng + thông tin cán bộ + chữ ký (giữ nguyên công thức điểm)
  const a01 = wb.getWorksheet("Biểu 01A (CC)");
  if (a01) {
    // Ghi trực tiếp B8/B9/B10: không phụ thuộc formula/cache mẫu cũ
    // (B8/B9 trong mẫu trỏ sang Bảng 1, B10 là text mẫu tĩnh).
    a01.getCell("B8").value = `Họ và tên: ${person.fullName}`;
    a01.getCell("B9").value = `Vị trí việc làm/nhiệm vụ được phân công chuyên trách: ${displayValue(person.jobPositionTitle || person.positionTitle)}`;
    a01.getCell("B10").value = `Đơn vị công tác: ${displayValue(person.unitName)}`;

    for (let r = 1; r <= 12; r++) {
      const c = a01.getRow(r).getCell(1);
      if (/Tháng\s*\d/.test(String(c.value ?? ""))) {
        c.value = `Tháng ${month}/${year}`;
        break;
      }
    }
    let signRow = 0;
    for (let r = 1; r <= a01.rowCount; r++) {
      if (/CÔNG CHỨC TỰ ĐÁNH GIÁ/.test(String(a01.getRow(r).getCell(1).value ?? ""))) { signRow = r; break; }
    }
    if (signRow > 0) {
      const cell = a01.getRow(signRow + 7).getCell(1);
      if (String(cell.value ?? "").trim() === "") cell.value = person.fullName;
    }
  }

  wb.calcProperties.fullCalcOnLoad = true;
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
