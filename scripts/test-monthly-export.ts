import ExcelJS from "exceljs";
import { buildMonthlyWorkbook } from "../src/server/monthly-export";

async function main() {
  const buf = await buildMonthlyWorkbook(
    [
      { title: "Kiểm tra PTVT xuất cảnh", outputText: "3 PTVT", evidenceRef: "BB-01", factor: 5.4, assignedQty: 3, completedQty: 3, dueDate: new Date("2026-10-25"), completedDate: new Date("2026-10-25"), lateCount: 0, reworkCount: 0 },
      { title: "Xử lý văn bản CCES", outputText: "Đã xử lý 100 văn bản", evidenceRef: null, factor: 2.3, assignedQty: 100, completedQty: 95, dueDate: new Date("2026-10-25"), completedDate: new Date("2026-10-26"), lateCount: 0, reworkCount: 0 },
      { title: "Việc chưa có mã SP", outputText: null, evidenceRef: null, factor: null, assignedQty: null, completedQty: 1, dueDate: null, completedDate: null, lateCount: 0, reworkCount: 1 },
    ],
    { fullName: "NGƯỜI KIỂM THỬ", positionTitle: "Công chức", unitName: "Hải quan cửa khẩu Quốc tế Tà Lùng" },
    2026, 10
  );
  const out = "C:\\Users\\thanhnx\\AppData\\Local\\Temp\\opencode\\test-monthly-export.xlsx";
  require("fs").writeFileSync(out, buf);
  console.log(`WROTE ${buf.length} bytes -> ${out}`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(out);
  const b1 = wb.getWorksheet("Bảng 1 (tính điểm CC)")!;
  const f = (r: number, c: number) => {
    const v: any = b1.getRow(r).getCell(c).value;
    return v && typeof v === "object" && "formula" in v ? `[F:${v.formula}]=${v.result}` : JSON.stringify(v);
  };
  console.log("A4:", JSON.stringify(String(b1.getRow(4).getCell(1).value)));
  console.log("R12:", [1, 2, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((c) => f(12, c)).join(" | "));
  console.log("R14-KLMN:", [11, 12, 13, 14].map((c) => f(14, c)).join(" | "));
  console.log("TOT72:", [7, 8, 9, 12, 14].map((c) => f(72, c)).join(" | "));
  console.log("PCT73:", [9, 12, 14].map((c) => f(73, c)).join(" | "));
  console.log("R15-A(empty check):", JSON.stringify(b1.getRow(15).getCell(2).value));
  const a01 = wb.getWorksheet("Biểu 01A (CC)")!;
  console.log("01A-R7:", JSON.stringify(String(a01.getRow(7).getCell(1).value)));
  console.log("01A-R57:", JSON.stringify(String(a01.getRow(57).getCell(1).value)));
  const d34: any = a01.getRow(34).getCell(4).value;
  console.log("01A-D34 kept formula:", d34 && typeof d34 === "object" && "formula" in d34 ? d34.formula : "LOST!");
}

main().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
