/**
 * GĐ3 (one-off) — Mở rộng dải dữ liệu Bảng 1 trong template từ 7 → 60 dòng,
 * GIỮ NGUYÊN mọi công thức bằng cách dời tham chiếu hàng loạt có kiểm chứng.
 * Chạy 1 lần duy nhất trên public/templates/bang1-01a-template.xlsx
 */
import ExcelJS from "exceljs";

const CAP = 60;
const FN_DENY = new Set(["SUM", "IF", "AND", "OR", "NOT", "ROUND", "INT", "ABS", "MAX", "MIN", "AVERAGE", "COUNT", "TODAY", "NOW", "DATE", "YEAR", "MONTH", "DAY", "LOG"]);

// Dời mọi tham chiếu có số hàng >= cut trong công thức lên delta (bỏ qua tên hàm)
function shiftFormula(f: string, cut: number, delta: number): string {
  return f.replace(/(\$?)([A-Z]{1,3})(\$?)(\d+)/g, (m, d1, col, d2, num, off, whole) => {
    if (FN_DENY.has(col)) return m;
    const prev = off > 0 ? whole[off - 1] : "";
    if (prev && /[A-Z0-9_.!]/.test(prev)) return m;
    const row = parseInt(num, 10);
    if (row < cut) return m;
    return `${d1}${col}${d2}${row + delta}`;
  });
}

function parseMerge(s: string): { sc: number; sr: number; ec: number; er: number } {
  const col2n = (c: string) => [...c].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0);
  const m = s.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/)!;
  return { sc: col2n(m[1]), sr: parseInt(m[2], 10), ec: col2n(m[3]), er: parseInt(m[4], 10) };
}
function mergeStr(o: { sc: number; sr: number; ec: number; er: number }): string {
  const n2c = (n: number): string => (n <= 26 ? String.fromCharCode(64 + n) : n2c(Math.floor((n - 1) / 26)) + n2c(((n - 1) % 26) + 1));
  return `${n2c(o.sc)}${o.sr}:${n2c(o.ec)}${o.er}`;
}

async function main() {
  const file = process.argv[2] || "public/templates/bang1-01a-template.xlsx";
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const b1 = wb.getWorksheet("Bảng 1 (tính điểm CC)")!;

  let headRow = 0, tongRow = 0;
  for (let r = 1; r <= b1.rowCount; r++) {
    const a = String(b1.getRow(r).getCell(1).value ?? "").trim();
    if (a === "(1)") headRow = r;
    if (/TỔNG/.test(a.toUpperCase()) && !tongRow) tongRow = r;
  }
  const d0 = headRow + 1;
  const oldCount = tongRow - d0;
  const need = CAP - oldCount;
  if (need <= 0) { console.log("NO-EXPAND-NEEDED"); return; }
  const insertAt = tongRow; // chèn ngay trước hàng TỔNG
  const newTong = tongRow + need;
  const newPct = newTong + 1;
  const d1 = newTong - 1;
  console.log(`BAND rows ${d0}..${tongRow - 1} (${oldCount}) -> ${d0}..${d1} (${CAP}); TONG ${tongRow}->${newTong}`);

  // Mẫu style + công thức từ hàng dữ liệu có đủ công thức (d0+1)
  const donorStyle: any[] = [];
  const donorFormula: (string | null)[] = [];
  const donorRow = b1.getRow(d0 + 1);
  for (let c = 1; c <= 14; c++) {
    const cell = donorRow.getCell(c);
    donorStyle[c] = JSON.parse(JSON.stringify(cell.style || {}));
    const v: any = cell.value;
    donorFormula[c] = v && typeof v === "object" && "formula" in v ? String(v.formula).replaceAll(String(d0 + 1), "{R}") : null;
  }
  const donorHeight = donorRow.height || 15;

  // 1. Gỡ merge, chèn hàng, gắn lại merge đã dời
  const merges: string[] = [...((b1 as any).model.merges || [])];
  for (const m of merges) { try { b1.unMergeCells(m); } catch {} }
  b1.spliceRows(insertAt, 0, ...Array(need).fill([]));
  for (const m of merges) {
    const o = parseMerge(m);
    if (o.er < insertAt) { b1.mergeCells(m); continue; }
    if (o.sr < insertAt) throw new Error(`Merge cat ngang diem chen: ${m}`);
    b1.mergeCells(mergeStr({ sc: o.sc, sr: o.sr + need, ec: o.ec, er: o.er + need }));
  }

  // 2. Điền dải dữ liệu: style + STT + công thức theo hàng
  for (let r = d0; r <= d1; r++) {
    const row = b1.getRow(r);
    row.height = donorHeight;
    for (let c = 1; c <= 14; c++) {
      const cell = row.getCell(c);
      cell.style = JSON.parse(JSON.stringify(donorStyle[c] || {}));
    }
    row.getCell(1).value = r - d0 + 1;
    for (let c = 1; c <= 14; c++) {
      if (donorFormula[c]) {
        const f = donorFormula[c]!.replaceAll("{R}", String(r));
        row.getCell(c).value = { formula: f, result: 0 } as any;
      } else if (c !== 1) {
        row.getCell(c).value = null;
      }
    }
  }

  // 3. Viết lại hàng TỔNG + hàng % theo dải mới (giữ style đã dời theo splice)
  const setF = (r: number, c: number, f: string) => {
    b1.getRow(r).getCell(c).value = { formula: f, result: 0 } as any;
  };
  setF(newTong, 7, `SUM(G${d0}:G${d1})`);
  setF(newTong, 8, `SUM(H${d0}:H${d1})`);
  setF(newTong, 9, `SUM(I${d0}:I${d1})`);
  setF(newTong, 12, `SUM(L${d0}:L${d1})`);
  setF(newTong, 13, `SUM(M${d0}:M${d1})`);
  setF(newTong, 14, `SUM(N${d0}:N${d1})`);
  setF(newPct, 9, `+I${newTong}/G${newTong}*100`);
  setF(newPct, 12, `(L${newTong}/G${newTong})*100`);
  setF(newPct, 14, `N${newTong}/G${newTong}*100`);

  // 4. Dời tham chiếu NGOÀI dải:
  // - Bảng1: chỉ các hàng ngoài [d0..newPct] (khối c/d/e đã dời theo splice).
  // - 01A: KHÔNG dời tham chiếu nội sheet; chỉ remap tham chiếu sang Bảng1
  //   trỏ vào vùng đã dời (I20/L20/N20 -> hàng % mới).
  let adjusted = 0;
  const adjustSheet = (ws: ExcelJS.Worksheet, skipRows: (r: number) => boolean) => {
    ws.eachRow((row) => {
      if (skipRows(row.number)) return;
      row.eachCell((cell) => {
        const v: any = cell.value;
        if (v && typeof v === "object" && "formula" in v) {
          const next = shiftFormula(String(v.formula), insertAt, need);
          if (next !== v.formula) {
            cell.value = { formula: next, result: v.result } as any;
            adjusted++;
          }
        }
      });
    });
  };
  adjustSheet(b1, (r) => r >= d0 && r <= newPct);
  // 01A: chỉ remap cross-sheet sang Bảng1 (so sánh NFC vì Excel lưu dạng tách dấu)
  const a01 = wb.getWorksheet("Biểu 01A (CC)")!;
  const BANG_NFC = "Bảng 1 (tính điểm CC)".normalize("NFC");
  a01.eachRow((row) => {
    row.eachCell((cell) => {
      const v: any = cell.value;
      if (v && typeof v === "object" && "formula" in v) {
        const next = String(v.formula).replace(
          /'([^']+)'!([A-Z]{1,3})(\d+)/g,
          (m, sheet, col, num) => {
            if (String(sheet).normalize("NFC") !== BANG_NFC) return m;
            const r = parseInt(num, 10);
            return r >= insertAt ? `'${sheet}'!${col}${r + need}` : m;
          }
        );
        if (next !== v.formula) {
          cell.value = { formula: next, result: v.result } as any;
          adjusted++;
        }
      }
    });
  });

  wb.calcProperties.fullCalcOnLoad = true;
  await wb.xlsx.writeFile(file);
  console.log(`EXPANDED-OK adjusted=${adjusted}`);

  // 5. Kiểm chứng: in mọi công thức còn lại
  const verify = new ExcelJS.Workbook();
  await verify.xlsx.readFile(file);
  console.log("=== FORMULAS-POST ===");
  verify.eachSheet((ws) => {
    ws.eachRow((row) => {
      row.eachCell((cell) => {
        const v: any = cell.value;
        if (v && typeof v === "object" && "formula" in v) {
          console.log(`${ws.name}!${cell.address} = ${v.formula}`);
        }
      });
    });
  });
}

main().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
