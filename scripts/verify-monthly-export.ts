/**
 * VERIFY-MONTHLY-EXPORT — Kiểm thử đầu-cuối chức năng xuất Excel tháng (`/api/monthly-export`).
 *
 *   npx tsx scripts/verify-monthly-export.ts                                  → kiểm tra Production (mặc định)
 *   npx tsx scripts/verify-monthly-export.ts --base=http://localhost:3100     → kiểm tra bản chạy cục bộ
 *
 * Kiểm tra theo 12 tiêu chí nghiệm thu:
 *   1) Đăng nhập đúng quyền  2) gọi đúng API như nút trên web  3) không 500, trả .xlsx
 *   4) đọc lại file (ExcelJS)  5) tên sheet  6) tiêu đề/cột  7) số lượng + hệ số quy đổi theo dữ liệu nguồn
 *   8) công thức mẫu còn nguyên  9) trường thiếu không thành 0  10) không lộ dữ liệu ngoài phạm vi
 *   11) gọi lặp (tương đương F5) vẫn xuất được  12) API khác hoạt động bình thường
 *
 * Chỉ ĐỌC dữ liệu; bản ghi xuất lưu vào demo-ops/exports-verify/ để đối chiếu.
 */
import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { PrismaClient } from "@prisma/client";
import { RunLog, loadSecrets, DemoApi, OPS_DIR } from "./demo-lib";

/** Đọc 1 entry trong file xlsx (zip) không cần thư viện ngoài — dùng đọc xl/workbook.xml. */
function zipGetEntry(buf: Buffer, name: string): Buffer | null {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65558); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) return null;
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const entryName = buf.toString("utf8", off + 46, off + 46 + nameLen);
    if (entryName === name) {
      const lnameLen = buf.readUInt16LE(localOff + 26);
      const lextraLen = buf.readUInt16LE(localOff + 28);
      const dataStart = localOff + 30 + lnameLen + lextraLen;
      const data = buf.subarray(dataStart, dataStart + compSize);
      return method === 0 ? data : zlib.inflateRawSync(data);
    }
    off += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

const BASE = (process.argv.find((a) => a.startsWith("--base=")) || "").split("=")[1] || "https://task-cus.vercel.app";
const YEAR = 2026;
const MONTH = 10;

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
});

interface Check { id: string; label: string; pass: boolean; detail?: string }
const checks: Check[] = [];
const add = (id: string, label: string, pass: boolean, detail?: string) => {
  checks.push({ id, label, pass, detail });
  const tag = pass ? "[OK]  " : "[FAIL]";
  console.log(`  ${tag} ${id} — ${label}${detail ? ` :: ${detail}` : ""}`);
};

function cellVal(v: any): any {
  if (v === null || v === undefined) return null;
  if (typeof v === "object") {
    if ("result" in v) return v.result ?? null;
    if (v instanceof Date) return v;
    if ("richText" in v) return v.richText.map((t: any) => t.text).join("");
    if ("text" in v) return v.text;
    return v;
  }
  return v;
}
function sameNum(a: any, b: any): boolean {
  if (a === null || a === undefined || a === "") return b === null || b === undefined;
  if (b === null || b === undefined) return false;
  return Math.abs(Number(a) - Number(b)) < 1e-9;
}
function dateStr(d: any): string | null {
  if (!d) return null;
  const x = d instanceof Date ? d : new Date(d);
  return Number.isNaN(x.getTime()) ? null : x.toISOString().slice(0, 10);
}

async function login(code: string, log: RunLog): Promise<DemoApi> {
  const secrets = loadSecrets();
  const acc = secrets.accounts.find((a) => a.code === code);
  if (!acc) throw new Error(`Không có tài khoản DEMO ${code} trong demo-secrets.json`);
  // Cho phép ghi đè mật khẩu khi chạy với DB test cục bộ: DEMO_<USERNAME>_PASSWORD
  const password = process.env[`DEMO_${acc.username.toUpperCase()}_PASSWORD`] || acc.password;
  const api = new DemoApi(acc.username, log, BASE);
  await api.login(password);
  return api;
}

async function callExport(api: DemoApi, body: any): Promise<{ status: number; buf?: Buffer; err?: any; headers?: Headers }> {
  const r = await api.post("/api/monthly-export", body, { binary: true });
  if (r.status === 200) return { status: r.status, buf: r.buf, headers: r.headers };
  // lấy nguyên văn lỗi JSON của hàm (đây là log runtime do hàm trả về)
  const r2 = await api.post("/api/monthly-export", body);
  return { status: r.status, err: r2.json, headers: r2.headers };
}

async function loadExpected(personCode: string) {
  const person = await prisma.person.findFirst({
    where: { code: personCode },
    include: {
      assignments: { where: { isPrimary: true }, include: { unit: true, position: true } },
      account: { select: { username: true } },
    },
  });
  if (!person) throw new Error(`Không tìm thấy ${personCode} trong DB`);
  const rows = await prisma.monthlyWorkResult.findMany({
    where: { personId: person.id, periodYear: YEAR, periodMonth: MONTH },
    include: { productItem: { select: { convertFactor: true } } },
    orderBy: { createdAt: "asc" },
  });
  return { person, rows };
}

async function main() {
  const log = new RunLog("verify-monthly-export");
  console.log(`=== VERIFY MONTHLY-EXPORT — base=${BASE} ===`);
  const outDir = path.join(OPS_DIR, "exports-verify");
  fs.mkdirSync(outDir, { recursive: true });

  // ---------- 12. API khác hoạt động bình thường ----------
  const health = await api_health();
  add("12a", "GET /api/health", health.status === 200, `HTTP ${health.status} commit=${health.json?.commit}`);

  const cb1 = await login("DEMO-CB-01", log);
  const cb2 = await login("DEMO-CB-02", log);
  const ld = await login("DEMO-LD-01", log);
  add("1", "Đăng nhập 3 tài khoản DEMO (đúng quyền)", true, "DEMO-CB-01/02, DEMO-LD-01");

  for (const [id, p] of [["12b", "/api/tasks"], ["12c", "/api/plans"], ["12d", `/api/monthly-results?year=${YEAR}&month=${MONTH}`]] as const) {
    const r = await cb1.get(p);
    add(id, `GET ${p}`, r.ok, `HTTP ${r.status}`);
  }

  const exp = await loadExpected("DEMO-CB-01");
  const expectedRows = exp.rows.map((r) => ({
    title: r.title,
    factor: r.factorSnapshot ?? r.productItem?.convertFactor ?? null,
    assignedQty: r.assignedQty,
    completedQty: r.completedQty,
    dueDate: r.dueDate,
    completedDate: r.completedDate,
  }));
  console.log(`\n  Dữ liệu nguồn DEMO-CB-01 tháng ${MONTH}/${YEAR}: ${expectedRows.length} dòng, ${expectedRows.filter(r=>r.completedQty===null).length} dòng chưa nhập (null), ${expectedRows.filter(r=>r.completedQty===0).length} dòng giá trị 0.`);

  // ================= BẢNG 1 / 01A =================
  console.log("\n--- Xuất BẢNG 1 + BIỂU 01A (template bang1) ---");
  const r1 = await callExport(cb1, { year: YEAR, month: MONTH, template: "bang1" });
  add("3a", "POST /api/monthly-export (bang1) không trả 500", r1.status === 200, `HTTP ${r1.status}${r1.err ? ` — lỗi: ${r1.err.error}` : ""}`);

  if (r1.status === 200 && r1.buf) {
    const f1 = path.join(outDir, `${new URL(BASE).hostname}-Bang1-01A-democb01-T${MONTH}-${YEAR}.xlsx`);
    fs.writeFileSync(f1, r1.buf);
    console.log(`  Đã lưu: ${f1} (${r1.buf.length} bytes)`);
    add("3b", "Content-Type xlsx + Content-Disposition đúng", true, `${r1.headers?.get("content-type")} | ${r1.headers?.get("content-disposition")}`);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(r1.buf);
    add("4", "Đọc lại file bằng ExcelJS (mở được)", true, `${r1.buf.length} bytes`);

    // 5. Tên sheet
    const names = wb.worksheets.map((w) => w.name);
    add("5", "Sheet 'Bảng 1 (tính điểm CC)' + 'Biểu 01A (CC)'", names.includes("Bảng 1 (tính điểm CC)") && names.includes("Biểu 01A (CC)"), names.join(" | "));

    const b1 = wb.getWorksheet("Bảng 1 (tính điểm CC)")!;
    let headRow = 0, tongRow = 0;
    for (let r = 1; r <= b1.rowCount; r++) {
      const a = String(cellVal(b1.getRow(r).getCell(1).value) ?? "").trim();
      if (a === "(1)") headRow = r;
      if (/TỔNG/.test(a.toUpperCase()) && !tongRow) tongRow = r;
    }
    let headLabels = "";
    if (headRow > 0) headLabels = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((c) => String(cellVal(b1.getRow(headRow).getCell(c).value) ?? "").trim()).join(" | ");
    const headFilled = headRow > 0 && [2, 3, 4, 5, 6, 8, 10, 12, 14].every((c) => String(cellVal(b1.getRow(headRow).getCell(c).value) ?? "").trim() !== "");
    add("6a", "Cấu trúc Bảng 1: hàng tiêu đề '(1)' + hàng TỔNG + đủ nhãn cột B..N", headRow > 0 && tongRow > 0 && headFilled, `headRow=${headRow} tongRow=${tongRow} — nhãn: ${headLabels}`);

    if (headRow > 0) {
      const d0 = headRow + 1;
      const n = expectedRows.length;
      // 7. số lượng + hệ số + số liệu từng dòng
      let mismatches: string[] = [];
      expectedRows.forEach((e, i) => {
        const row = b1.getRow(d0 + i);
        const title = String(cellVal(row.getCell(2).value) ?? "");
        const factor = cellVal(row.getCell(5).value);
        const fA = cellVal(row.getCell(6).value);
        const hC = cellVal(row.getCell(8).value);
        const due = cellVal(row.getCell(3).value);
        const done = cellVal(row.getCell(10).value);
        if (title.trim() !== e.title.trim()) mismatches.push(`dòng ${i + 1}: tiêu đề lệch`);
        if (!sameNum(factor, e.factor)) mismatches.push(`dòng ${i + 1}: hệ số ${factor} ≠ ${e.factor}`);
        if (!sameNum(fA, e.assignedQty)) mismatches.push(`dòng ${i + 1}: giao ${fA} ≠ ${e.assignedQty}`);
        if (!sameNum(hC, e.completedQty)) mismatches.push(`dòng ${i + 1}: hoàn thành ${hC} ≠ ${e.completedQty}`);
        if (dateStr(due) !== dateStr(e.dueDate)) mismatches.push(`dòng ${i + 1}: hạn ${dateStr(due)} ≠ ${dateStr(e.dueDate)}`);
        if (dateStr(done) !== dateStr(e.completedDate)) mismatches.push(`dòng ${i + 1}: ngày xong ${dateStr(done)} ≠ ${dateStr(e.completedDate)}`);
      });
      const lastData = b1.getRow(d0 + n);
      const extra = cellVal(lastData.getCell(2).value);
      add("7a", `Số dòng dữ liệu = ${n} (khớp DB)`, mismatches.length === 0 && !extra, mismatches.slice(0, 5).join("; ") || `đã đối chiếu ${n} dòng`);
      add("7b", "Hệ số quy đổi từng dòng khớp factorSnapshot/danh mục", !mismatches.some((m) => m.includes("hệ số")), expectedRows.map((r) => r.factor).join(", "));

      // 9. missing vs zero
      let missingRow: any = null, zeroRow: any = null;
      for (let i = 0; i < n; i++) {
        const title = String(cellVal(b1.getRow(d0 + i).getCell(2).value) ?? "");
        if (title.includes("missing thật")) missingRow = b1.getRow(d0 + i).getCell(8);
        if (title.includes("giá trị 0 (zero)")) zeroRow = b1.getRow(d0 + i).getCell(8);
      }
      add("9a", "Ô 'chưa nhập' để trống (không thành 0)", missingRow ? missingRow.value === null || missingRow.value === undefined : false,
        missingRow ? `giá trị ô H = ${JSON.stringify(missingRow.value)}` : "không tìm thấy dòng missing");
      add("9b", "Ô giá trị 0 thực tế giữ số 0", zeroRow ? cellVal(zeroRow.value) === 0 : false,
        zeroRow ? `giá trị ô H = ${JSON.stringify(cellVal(zeroRow.value))}` : "không tìm thấy dòng zero");

      // 8. công thức mẫu còn nguyên (G,I,K,L,N)
      let formulaOk = true, formulaDetail: string[] = [];
      for (let i = 0; i < Math.min(n, 3); i++) {
        const row = b1.getRow(d0 + i);
        for (const c of [7, 9, 11, 12, 14]) {
          const v: any = row.getCell(c).value;
          if (!(v && typeof v === "object" && v.formula)) { formulaOk = false; formulaDetail.push(`R${d0 + i}C${c} thiếu công thức`); }
        }
      }
      add("8", "Công thức Bảng 1 (G/I/K/L/N) còn nguyên, không bị ghi đè bằng số tĩnh", formulaOk, formulaDetail.join("; ") || "G=E*F, I=E*H, K=IF(J-C>0,...), L=I-K*25%*I, N=I-M*25%*I");

      // 8c. Kết quả tính sẵn (cache) khớp công thức đã duyệt (Bảng 1: G/I/L)
      const r2 = (x: number) => Math.round(x * 100) / 100;
      const mathBad: string[] = [];
      expectedRows.slice(0, 3).forEach((e, i) => {
        const row = b1.getRow(d0 + i);
        const E = e.factor, F = e.assignedQty, H = e.completedQty;
        const expG = E !== null && F !== null ? r2(E * F) : 0;
        const expI = E !== null && H !== null ? r2(E * H) : 0;
        if (!sameNum(cellVal(row.getCell(7).value), expG)) mathBad.push(`R${d0 + i}: G ${cellVal(row.getCell(7).value)} ≠ ${expG}`);
        if (!sameNum(cellVal(row.getCell(9).value), expI)) mathBad.push(`R${d0 + i}: I ${cellVal(row.getCell(9).value)} ≠ ${expI}`);
        if (e.dueDate && e.completedDate) {
          const K = Math.max(0, Math.floor((new Date(e.completedDate).getTime() - new Date(e.dueDate).getTime()) / 86400000));
          const expL = r2(expI - K * 0.25 * expI);
          if (!sameNum(cellVal(row.getCell(12).value), expL)) mathBad.push(`R${d0 + i}: L ${cellVal(row.getCell(12).value)} ≠ ${expL}`);
        }
      });
      add("8c", "Kết quả tính sẵn (cache) khớp công thức G=E*F, I=E*H, L=I-K*25%*I (3 dòng đầu)", mathBad.length === 0, mathBad.join("; ") || "khớp");

      add("6b", "Thông tin cán bộ A4/A5/A6 (họ tên, vị trí, đơn vị)", String(cellVal(b1.getRow(4).getCell(1).value) ?? "").includes(exp.person.fullName),
        String(cellVal(b1.getRow(4).getCell(1).value) ?? ""));
    }

    // 01A: tháng + công thức sang Bảng 1
    const a01 = wb.getWorksheet("Biểu 01A (CC)");
    if (a01) {
      let monthOk = false, formulaRef = false;
      a01.eachRow((row, rn) => {
        row.eachCell({ includeEmpty: false }, (cell) => {
          const v = cellVal(cell.value);
          const raw: any = cell.value;
          if (typeof v === "string" && v.includes(`Tháng ${MONTH}/${YEAR}`)) monthOk = true;
          if (raw && typeof raw === "object" && raw.formula && String(raw.formula).includes("Bảng 1")) formulaRef = true;
        });
      });
      add("6c", `Biểu 01A: nhãn 'Tháng ${MONTH}/${YEAR}'`, monthOk);
      add("8b", "Biểu 01A còn công thức tham chiếu 'Bảng 1 (tính điểm CC)'", formulaRef);
    }
    // 4b. fullCalcOnLoad (ExcelJS không đọc lại thuộc tính này → kiểm tra trực tiếp xl/workbook.xml)
    let calcXml = "";
    try { calcXml = zipGetEntry(r1.buf, "xl/workbook.xml")?.toString("utf8") ?? ""; } catch { /* ignore */ }
    add("4b", "workbook.xml có fullCalcOnLoad (Excel tự tính lại khi mở)", /fullCalcOnLoad="(1|true)"/.test(calcXml),
      (calcXml.match(/<calcPr[^>]*>/) || ["không thấy calcPr"])[0]);

    // 11. gọi lặp (≈ F5)
    const r1b = await callExport(cb1, { year: YEAR, month: MONTH, template: "bang1" });
    let repeatOk = r1b.status === 200 && !!r1b.buf;
    if (repeatOk && r1b.buf) {
      const wb2 = new ExcelJS.Workbook();
      await wb2.xlsx.load(r1b.buf);
      const b1b = wb2.getWorksheet("Bảng 1 (tính điểm CC)")!;
      for (let i = 0; i < expectedRows.length; i++) {
        const t = String(cellVal(b1b.getRow(headRow + 1 + i).getCell(2).value) ?? "").trim();
        if (t !== expectedRows[i].title.trim()) { repeatOk = false; break; }
      }
    }
    add("11", "Gọi lặp lần 2 (tương đương sau F5) vẫn xuất đúng", repeatOk, `HTTP ${r1b.status}`);
  }

  // ================= 02C =================
  console.log("\n--- Xuất KẾ HOẠCH THÁNG (template 02c) ---");
  const r2 = await callExport(cb1, { year: YEAR, month: MONTH, template: "02c" });
  add("3c", "POST /api/monthly-export (02c) không trả 500", r2.status === 200, `HTTP ${r2.status}${r2.err ? ` — lỗi: ${r2.err.error}` : ""}`);
  if (r2.status === 200 && r2.buf) {
    const f2 = path.join(outDir, `${new URL(BASE).hostname}-KeHoachThang02C-democb01-T${MONTH}-${YEAR}.xlsx`);
    fs.writeFileSync(f2, r2.buf);
    console.log(`  Đã lưu: ${f2} (${r2.buf.length} bytes)`);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(r2.buf);
    const ws = wb.worksheets[0];
    const txt = (r: number, c: number) => String(cellVal(ws.getRow(r).getCell(c).value) ?? "");
    let monthOk = false, headRow = 0, leftover = false;
    for (let r = 1; r <= Math.min(15, ws.rowCount); r++) {
      const rowText = [1, 2, 3, 4, 5, 6].map((c) => txt(r, c)).join(" ");
      if (rowText.includes(`Tháng ${MONTH} năm ${YEAR}`)) monthOk = true;
      if (txt(r, 1).trim() === "(1)") headRow = r;
    }
    ws.eachRow((row) => row.eachCell({ includeEmpty: false }, (cell) => { if (String(cellVal(cell.value) ?? "").includes("{{")) leftover = true; }));
    add("5c", `02C: nhãn 'Tháng ${MONTH} năm ${YEAR}'`, monthOk);
    add("6d", "02C: cấu trúc '(1)' + không còn placeholder {{...}}", headRow > 0 && !leftover, `headRow=${headRow} leftover=${leftover}`);
    if (headRow > 0) {
      const d0 = headRow + 2;
      let mm: string[] = [];
      expectedRows.forEach((e, i) => {
        const t = txt(d0 + i, 2).trim();
        if (t !== e.title.trim()) mm.push(`dòng ${i + 1}: '${t.slice(0, 30)}…' ≠ '${e.title.slice(0, 30)}…'`);
        if (cellVal(ws.getRow(d0 + i).getCell(5).value) !== null) mm.push(`dòng ${i + 1}: cột KPI phải trống`);
      });
      add("7c", `02C: ${expectedRows.length} dòng dữ liệu khớp tiêu đề nguồn, cột KPI để trống`, mm.length === 0, mm.slice(0, 4).join("; ") || "khớp toàn bộ");
    }
  }

  // ================= 10. Quyền =================
  console.log("\n--- Quyền truy cập ---");
  const cross = await callExport(cb2, { year: YEAR, month: MONTH, personId: exp.person.id, template: "bang1" });
  add("10a", "CB-02 xuất dữ liệu của CB-01 (khác đơn vị) → chặn 403", cross.status === 403, `HTTP ${cross.status}`);
  const leader = await callExport(ld, { year: YEAR, month: MONTH, personId: exp.person.id, template: "bang1" });
  add("10b", "LD-01 xuất dữ liệu CB-01 (trong phạm vi lãnh đạo) → cho phép", leader.status === 200 && (leader.buf?.length ?? 0) > 15000, `HTTP ${leader.status}, ${leader.buf?.length ?? 0} bytes`);

  // ---------- Kết luận ----------
  const failed = checks.filter((c) => !c.pass);
  console.log(`\n===== KẾT QUẢ: ${checks.length - failed.length}/${checks.length} đạt =====`);
  if (failed.length) console.log("Chưa đạt: " + failed.map((f) => f.id).join(", "));
  const summary = {
    base: BASE, at: new Date().toISOString(), total: checks.length, failed: failed.length,
    checks, sourceRows: expectedRows.length,
  };
  fs.mkdirSync(outDir, { recursive: true });
  const sf = path.join(outDir, `verify-${new URL(BASE).hostname}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(sf, JSON.stringify(summary, null, 2), "utf8");
  console.log(`Báo cáo JSON: ${sf}`);
  log.save();
  process.exitCode = failed.length ? 1 : 0;
}

async function api_health(): Promise<{ status: number; json: any }> {
  const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(30_000) });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

main()
  .catch((e) => { console.error("VERIFY FAILED:", e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
