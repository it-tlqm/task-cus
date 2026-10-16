/**
 * GĐ3 — Tách template xuất Bảng 1 + 01A từ workbook mẫu T9 (one-off, chạy local).
 * - Chỉ giữ 2 sheet: "Bảng 1 (tính điểm CC)" và "Biểu 01A (CC)".
 * - Xóa mọi số liệu/điểm/nhận xét CÁ NHÂN (ô nhập), GIỮ NGUYÊN công thức, merge, định dạng.
 * - Exporter sẽ điền dữ liệu thật + tính lại công thức khi mở file.
 * Dùng: npx tsx scripts/make-export-template.ts --in "<xlsx>" --out public/templates/bang1-01a-template.xlsx
 */
import ExcelJS from "exceljs";
import fs from "fs";

function isFormula(v: any): boolean {
  return !!v && typeof v === "object" && "formula" in v;
}
function str(v: any): string {
  if (v === null || v === undefined) return "";
  if (isFormula(v)) return "";
  if (typeof v === "object" && "richText" in v) return (v.richText as any[]).map((r) => r.text).join("");
  if (typeof v === "object" && "text" in v) return String((v as any).text);
  if (v instanceof Date) return "";
  return String(v);
}

const PERSONAL_TOKENS = ["Nguyễn Hải Yên", "NGUYỄN HẢI YÊN"];

async function main() {
  const inIdx = process.argv.indexOf("--in");
  const outIdx = process.argv.indexOf("--out");
  const inFile = inIdx >= 0 ? process.argv[inIdx + 1] : "";
  const outFile = outIdx >= 0 ? process.argv[outIdx + 1] : "";
  if (!inFile || !outFile) throw new Error("Thieu --in/--out");

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(inFile);

  // Chỉ giữ 2 sheet mẫu công chức
  for (const ws of [...wb.worksheets]) {
    if (ws.name !== "Bảng 1 (tính điểm CC)" && ws.name !== "Biểu 01A (CC)") wb.removeWorksheet(ws.id);
  }

  let cleared = 0;
  const scrubText = (s: string): string => {
    let out = s;
    for (const t of PERSONAL_TOKENS) out = out.split(t).join("");
    return out;
  };

  // --- Sheet Bảng 1 ---
  const b1 = wb.getWorksheet("Bảng 1 (tính điểm CC)")!;
  // Tìm hàng tiêu đề lá (A="(1)") và hàng TỔNG
  let headRow = 0, tongRow = 0;
  for (let r = 1; r <= b1.rowCount; r++) {
    const a = str(b1.getRow(r).getCell(1).value).trim();
    if (a === "(1)") headRow = r;
    if (/TỔNG/.test(a.toUpperCase()) && !tongRow) tongRow = r;
  }
  if (!headRow || !tongRow) throw new Error("Khong xac dinh duoc vung du lieu Bang 1");
  // Ô nhập: B,C,D,E,F,H,J,M — xóa; giữ A và các ô công thức
  for (let r = headRow + 1; r < tongRow; r++) {
    for (const c of [2, 3, 4, 5, 6, 8, 10, 13]) {
      const cell = b1.getRow(r).getCell(c);
      const v: any = cell.value;
      if (!isFormula(v) && v !== null && v !== undefined && String(v instanceof Date ? "x" : v).trim() !== "") {
        cell.value = null;
        cleared++;
      }
    }
  }
  // Vùng thông tin + ghi chú + khối c/d/e: gỡ tên cá nhân, giữ công thức
  b1.eachRow((row) => {
    row.eachCell((cell) => {
      const v: any = cell.value;
      if (typeof v === "string") {
        const next = scrubText(v);
        if (next !== v) { cell.value = next || null; cleared++; }
      } else if (v && typeof v === "object" && "richText" in v) {
        const s = (v.richText as any[]).map((x) => x.text).join("");
        const next = scrubText(s);
        if (next !== s) {
          cell.value = next ? { richText: [{ text: next }] } : null;
          cleared++;
        }
      } else if (!isFormula(v) && typeof v === "number") {
        // Điểm/số liệu cá nhân gõ tay ngoài vùng dữ liệu → xóa
        const r = row.number, c = Number(cell.col);
        const inDataBand = r > headRow && r < tongRow;
        if (!inDataBand) { cell.value = null; cleared++; }
      }
    });
  });

  // --- Sheet 01A ---
  const a01 = wb.getWorksheet("Biểu 01A (CC)")!;
  a01.eachRow((row) => {
    row.eachCell((cell) => {
      const v: any = cell.value;
      if (typeof v === "string") {
        const next = scrubText(v);
        if (next !== v) { cell.value = next || null; cleared++; }
      } else if (v && typeof v === "object" && "richText" in v) {
        const s = (v.richText as any[]).map((x) => x.text).join("");
        const next = scrubText(s);
        if (next !== s) {
          cell.value = next ? { richText: [{ text: next }] } : null;
          cleared++;
        }
      } else if (!isFormula(v) && typeof v === "number") {
        cell.value = null; // điểm tự chấm cá nhân
        cleared++;
      }
    });
  });

  fs.mkdirSync(outFile.split(/[/\\]/).slice(0, -1).join("/") || ".", { recursive: true });
  await wb.xlsx.writeFile(outFile);
  console.log(`TEMPLATE-OK: ${outFile} (cleared ${cleared} o ca nhan)`);

  // Kiểm chứng: quét lại file đã ghi (tên + richText + ngày tháng trong vùng dữ liệu)
  const check = new ExcelJS.Workbook();
  await check.xlsx.readFile(outFile);
  const hits: string[] = [];
  const flat = (v: any): string => {
    if (v === null || v === undefined) return "";
    if (isFormula(v)) return "";
    if (typeof v === "object" && "richText" in v) return (v.richText as any[]).map((x) => x.text).join("");
    if (typeof v === "object" && "text" in v) return String((v as any).text);
    if (v instanceof Date) return "DATE";
    return String(v);
  };
  check.eachSheet((ws) => {
    ws.eachRow((row) => {
      row.eachCell((cell) => {
        const s = flat(cell.value as any);
        for (const t of PERSONAL_TOKENS) if (s.includes(t)) hits.push(`${ws.name}!R${row.number}C${cell.col}`);
      });
    });
  });
  // Quét số liệu: không còn số thô nào trong vùng dữ liệu Bảng 1
  const cb = check.getWorksheet("Bảng 1 (tính điểm CC)")!;
  let rawNums = 0;
  for (let r = headRow + 1; r < tongRow; r++) {
    for (const c of [2, 3, 4, 5, 6, 8, 10, 13]) {
      const v: any = cb.getRow(r).getCell(c).value;
      if (!isFormula(v) && v !== null && v !== undefined && String(v instanceof Date ? "x" : v).trim() !== "") rawNums++;
    }
  }
  console.log(`VERIFY: personal-name-hits=${hits.length} data-raw-remaining=${rawNums}`);
  if (hits.length > 0) console.log(hits.slice(0, 10).join(" | "));
}

main().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
