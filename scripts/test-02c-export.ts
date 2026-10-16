import ExcelJS from "exceljs";
import { buildMonthlyPlan02C } from "../src/server/monthly-plan-02c";

async function main() {
  const buf = await buildMonthlyPlan02C(
    [
      { title: "Sinh hoạt chi bộ", outputText: "Tham gia sinh hoạt chi bộ", evidenceRef: null, dueDate: new Date("2026-10-03"), completedDate: new Date("2026-10-03"), notes: null },
      { title: "Xử lý văn bản CCES", outputText: "Đã xử lý 50 văn bản", evidenceRef: "CCES-T10", dueDate: new Date("2026-10-25"), completedDate: null, notes: "Đang tiếp tục" },
    ],
    { fullName: "NGƯỜI KIỂM THỬ", positionTitle: "Công chức", unitName: "Hải quan cửa khẩu Quốc tế Tà Lùng" },
    2026, 10
  );
  const out = "C:\\Users\\thanhnx\\AppData\\Local\\Temp\\opencode\\test-02c-export.xlsx";
  require("fs").writeFileSync(out, buf);
  console.log(`WROTE ${buf.length} bytes -> ${out}`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(out);
  const ws = wb.worksheets[0];
  const t = (r: number, c: number) => {
    const v: any = ws.getRow(r).getCell(c).value;
    return v instanceof Date ? "DATE" : JSON.stringify(v);
  };
  console.log("MONTH:", t(6, 1));
  console.log("R8:", t(8, 1));
  console.log("R16:", [1, 2, 3, 4, 5, 6].map((c) => t(16, c)).join(" | "));
  console.log("R17:", [1, 2, 3, 4, 5, 6].map((c) => t(17, c)).join(" | "));
  console.log("R18-empty:", t(18, 2));
  let markers = 0;
  ws.eachRow((row) => row.eachCell((cell) => {
    if (cell.value === "{{SIGN_LEFT}}" || cell.value === "{{SIGN_RIGHT}}") { markers++; console.log(`MARKER-LEFT R${row.number}C${cell.col}`); }
  }));
  console.log(`SHEETS=${wb.worksheets.length} MARKERS_LEFT=${markers}`);
}

main().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
