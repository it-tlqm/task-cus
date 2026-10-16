/**
 * GĐ3b (one-off) — Tách template Kế hoạch tháng (Mẫu 02C) từ workbook T9.
 * - Chỉ giữ sheet "Kế hoạch tháng 9". Không có công thức trong dải dữ liệu.
 * - Xóa dữ liệu cá nhân (tên, ngày, KPI, chữ ký); công thức tham chiếu Bảng1
 *   được chuyển thành ô trống để exporter điền giá trị thuần (file xuất độc lập).
 * - Mở rộng dải I lên 25 dòng (R16-R40), giữ nguyên II + chữ ký (dời merge).
 * Dùng: npx tsx scripts/make-02c-template.ts --in "<xlsx>" --out public/templates/kehoach-thang-02c-template.xlsx
 */
import ExcelJS from "exceljs";
import fs from "fs";

const PERSONAL = ["Nguyễn Hải Yên", "NGUYỄN HẢI YÊN", "Hoàng Văn Bằng", "HOÀNG VĂN BẰNG"];

function parseMerge(s: string) {
  const c2n = (c: string) => [...c].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0);
  const m = s.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/)!;
  return { sc: c2n(m[1]), sr: parseInt(m[2], 10), ec: c2n(m[3]), er: parseInt(m[4], 10) };
}
function mergeStr(o: { sc: number; sr: number; ec: number; er: number }): string {
  const n2c = (n: number): string => {
    let s = "";
    let x = n;
    while (x > 0) {
      s = String.fromCharCode(64 + (((x - 1) % 26) + 1)) + s;
      x = Math.floor((x - 1) / 26);
    }
    return s;
  };
  return `${n2c(o.sc)}${o.sr}:${n2c(o.ec)}${o.er}`;
}

async function main() {
  const inIdx = process.argv.indexOf("--in");
  const outIdx = process.argv.indexOf("--out");
  const inFile = inIdx >= 0 ? process.argv[inIdx + 1] : "";
  const outFile = outIdx >= 0 ? process.argv[outIdx + 1] : "";
  if (!inFile || !outFile) throw new Error("Thieu --in/--out");

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(inFile);
  for (const ws of [...wb.worksheets]) {
    if (ws.name !== "Kế hoạch tháng 9") wb.removeWorksheet(ws.id);
  }
  const ws = wb.getWorksheet("Kế hoạch tháng 9")!;

  // Tìm hàng section II và hàng chữ ký (quét mọi cột vì ô đã merge)
  let iiRow = 0, signRow = 0, nameRow = 0;
  for (let r = 1; r <= ws.rowCount; r++) {
    const rowVals = [1, 2, 3, 4, 5, 6].map((c) => String(ws.getRow(r).getCell(c).value ?? ""));
    if (rowVals.some((v) => /^II\b/.test(v.trim()))) iiRow = r;
    if (rowVals.some((v) => /Người lập kế hoạch/.test(v))) signRow = r;
  }
  // Hàng tên ký: sau signRow, có merge A:B / D:F
  const merges: string[] = [...((ws as any).model.merges || [])];
  for (const m of merges) {
    const o = parseMerge(m);
    if (o.sc === 1 && signRow > 0 && o.sr > signRow && !nameRow) nameRow = o.sr;
  }
  if (!iiRow || !signRow || !nameRow) throw new Error(`Khong dinh vi duoc cau truc (ii=${iiRow} sign=${signRow} name=${nameRow})`);
  console.log(`STRUCT ii=${iiRow} sign=${signRow} name=${nameRow}`);

  let cleared = 0;
  ws.eachRow((row) => {
    row.eachCell((cell) => {
      const v: any = cell.value;
      const s = v === null || v === undefined ? "" : typeof v === "string" ? v : v instanceof Date ? "DATE" : "";
      if (s === "" && !(v instanceof Date)) return;
      const hitPersonal = PERSONAL.some((t) => typeof v === "string" && v.includes(t));
      const inDataBand = row.number >= 16 && row.number < iiRow;
      if (v instanceof Date || hitPersonal || (inDataBand && typeof v === "string")) {
        // Giữ lại tiêu đề phần (I./II.) — nhận diện bằng A ngắn
        const a = String(row.getCell(1).value ?? "");
        if (inDataBand && /^[IVX]+\.?$|^II?\s*$/.test(a.trim()) && cell.col === 1) return;
        cell.value = null;
        cleared++;
      } else if (v && typeof v === "object" && "formula" in v) {
        cell.value = null; // công thức sang Bảng1 — file xuất độc lập nên để trống
        cleared++;
      }
    });
  });

  // Đánh dấu ô ký để exporter điền (tránh hardcode số hàng)
  ws.getRow(nameRow).getCell(1).value = "{{SIGN_LEFT}}";
  ws.getRow(nameRow).getCell(4).value = "{{SIGN_RIGHT}}";

  // Mở rộng dải I: hiện có (iiRow-16) dòng → 25 dòng
  const have = iiRow - 16;
  const need = 25 - have;
  const donor = ws.getRow(16);
  const donorStyle: any[] = [];
  for (let c = 1; c <= 6; c++) donorStyle[c] = JSON.parse(JSON.stringify(donor.getCell(c).style || {}));
  const donorHeight = donor.height || 15;
  if (need > 0) {
    for (const m of merges) { try { ws.unMergeCells(m); } catch {} }
    ws.spliceRows(iiRow, 0, ...Array(need).fill([]));
    for (const m of merges) {
      const o = parseMerge(m);
      if (o.er < iiRow) { ws.mergeCells(m); continue; }
      if (o.sr < iiRow) throw new Error(`Merge cat ngang: ${m}`);
      ws.mergeCells(mergeStr({ sc: o.sc, sr: o.sr + need, ec: o.ec, er: o.er + need }));
    }
    for (let r = 16; r < 16 + 25; r++) {
      const row = ws.getRow(r);
      row.height = donorHeight;
      for (let c = 1; c <= 6; c++) row.getCell(c).style = JSON.parse(JSON.stringify(donorStyle[c] || {}));
    }
    console.log(`EXPANDED +${need} rows`);
  }

  fs.mkdirSync(outFile.split(/[/\\]/).slice(0, -1).join("/") || ".", { recursive: true });
  await wb.xlsx.writeFile(outFile);

  // Kiểm chứng
  const check = new ExcelJS.Workbook();
  await check.xlsx.readFile(outFile);
  let hits = 0, dates = 0;
  check.eachSheet((s) => {
    s.eachRow((row) => {
      row.eachCell((cell) => {
        const v: any = cell.value;
        if (typeof v === "string" && PERSONAL.some((t) => v.includes(t))) { hits++; console.log(`HIT ${s.name}!R${row.number}C${cell.col}`); }
        if (v instanceof Date) { dates++; console.log(`DATELEFT ${s.name}!R${row.number}C${cell.col}`); }
      });
    });
  });
  console.log(`TEMPLATE-02C-OK cleared=${cleared} verify hits=${hits} dates=${dates}`);
}

main().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
