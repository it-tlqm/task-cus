/**
 * import-hai-quan-data.mjs — ĐỒNG BỘ DỮ LIỆU THẬT (Hải quan cửa khẩu Tà Lùng) vào DB.
 *
 *   node scripts/import-hai-quan-data.mjs --dry-run
 *   node scripts/import-hai-quan-data.mjs --apply --db=<url>
 *
 * Nguồn: docs/Dữ liệu-file-hai-quan-gui/Danh sách.xlsx (3 sheet: Danh sách, Danh mục công việc , Cơ cấu tổ chức)
 *
 * AN TOÀN:
 *  - Idempotent: upsert theo định danh ổn định (mã đơn vị / mã nhân sự / (bộ phận + nội dung công việc)).
 *  - KHÔNG tạo tài khoản đăng nhập, KHÔNG đổi/reset mật khẩu, KHÔNG cấp role, KHÔNG xoá bản ghi nào.
 *  - Hệ số: lấy đúng Excel; ô trống => NULL (không điền 0); hệ số đang vận hành khác Excel => GIỮ NGUYÊN + đưa vào danh sách cần quyết định.
 *  - Ghi nhật ký import vào audit_events (nguồn file + checksum + thay đổi trước/sau).
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createRequire } from "node:module";
const require2 = createRequire("D:/thanhnx/OpenCode/talung-cus-work/package.json");
const ExcelJS = require2("exceljs");
const { PrismaClient } = require2("@prisma/client");

const REPO = "D:/thanhnx/OpenCode/talung-cus-work/";
const FILE = path.join(REPO, "docs", "Dữ liệu-file-hai-quan-gui", "Danh sách.xlsx");
const DRY = !process.argv.includes("--apply");
const dbArg = (process.argv.find((a) => a.startsWith("--db=")) || "").slice(5);
const DB_URL = dbArg || process.env.DIRECT_URL || process.env.DATABASE_URL;

const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });

/* ---------------- helpers ---------------- */
const norm = (v) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const slug = (v) => norm(v).replace(/[^a-z0-9]/g, "").toUpperCase();
const cell = (v) => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if (v.text) return String(v.text).trim();
    if (v.richText) return v.richText.map((t) => t.text).join("").trim();
    if (v.result !== undefined) return String(v.result).trim();
    if (v.hyperlink) return String(v.hyperlink).trim();
    return "";
  }
  return String(v).trim();
};
/** levenshtein dạng gọn */
function lev(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}
const sim = (a, b) => {
  if (!a || !b) return 0;
  return 1 - lev(a, b) / Math.max(a.length, b.length);
};
const TOKEN_GENERIC = new Set(["bo", "phan", "phap", "don", "vi", "to", "chuc", "nang"]);

async function main() {
  const fileBuf = fs.readFileSync(FILE);
  const checksum = crypto.createHash("sha256").update(fileBuf).digest("hex");
  console.log(`Nguồn: ${FILE}`);
  console.log(`Checksum SHA-256: ${checksum}`);
  console.log(`Chế độ: ${DRY ? "DRY-RUN (không ghi)" : "APPLY"}`);
  console.log(`DB: ${DB_URL.replace(/:[^:@/]*@/, ":***@")}`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(fileBuf);

  /* ---------- đọc sheet "Danh sách" ---------- */
  const wsP = wb.getWorksheet("Danh sách");
  const staffRows = [];
  let currentGroup = null;
  for (let r = 3; r <= wsP.rowCount; r++) {
    const row = wsP.getRow(r);
    const stt = cell(row.getCell(1).value);
    const name = cell(row.getCell(2).value);
    const role = cell(row.getCell(3).value);
    const phone = cell(row.getCell(4).value).replace(/\s+/g, " ");
    const email = cell(row.getCell(5).value);
    if (!stt && name) { currentGroup = name; continue; }   // dòng tiêu đề nhóm
    if (!name) continue;
    staffRows.push({ stt, name, role, phone, email, group: currentGroup });
  }

  /* ---------- đọc sheet "Cơ cấu tổ chức" ---------- */
  const wsO = wb.getWorksheet("Cơ cấu tổ chức");
  const orgRows = [];
  for (let r = 1; r <= wsO.rowCount; r++) {
    const a = cell(wsO.getRow(r).getCell(1).value);
    const b = cell(wsO.getRow(r).getCell(2).value);
    const c = cell(wsO.getRow(r).getCell(3).value);
    if (!a && !b && !c) continue;
    orgRows.push({ a, b, c });
  }

  /* ---------- đọc sheet "Danh mục công việc " ---------- */
  const wsW = wb.getWorksheet("Danh mục công việc ");
  const txRows = [];
  let curDept = cell(wsW.getRow(1).getCell(1).value) || null;   // nhom dau tien = tieu de cot
  for (let r = 2; r <= wsW.rowCount; r++) {
    const row = wsW.getRow(r);
    const deptCell = cell(row.getCell(1).value);
    const title = cell(row.getCell(2).value);
    const fRaw = row.getCell(3).value;
    if (deptCell) curDept = deptCell;
    if (!title) continue;
    const factor = typeof fRaw === "number" ? fRaw : (fRaw === null || fRaw === undefined || String(fRaw).trim() === "" ? null : Number(fRaw));
    txRows.push({ dept: curDept, title, factor: Number.isFinite(factor) ? factor : null, row: r });
  }

  console.log(`\nĐọc Excel: ${staffRows.length} lượt nhân sự / ${new Set(staffRows.map(s => norm(s.name))).size} người / ${orgRows.length} dòng cơ cấu / ${txRows.length} dòng TX`);

  /* ================= đối soát Production ================= */
  const report = { units: [], persons: [], assignments: [], tx: [], needsDecision: [], stats: {} };

  const prodUnits = await prisma.orgUnit.findMany({ select: { id: true, code: true, name: true, parentId: true, orgId: true, _count: { select: { assignments: true } } } });
  const prodPersons = await prisma.person.findMany({ select: { id: true, code: true, fullName: true, email: true, phone: true, status: true, assignments: { select: { unitId: true, isPrimary: true } }, account: { select: { username: true, status: true } } } });
  const prodTx = await prisma.workCatalogEntry.findMany({ select: { id: true, code: true, title: true, department: true, convertFactor: true, status: true, version: { select: { code: true, status: true } } } });
  const activeVersion = await prisma.workCatalogVersion.findFirst({ where: { status: "ACTIVE" }, select: { id: true, code: true, title: true } });

  console.log(`\n=== PRODUCTION ===`);
  console.log(`  org_units=${prodUnits.length} persons=${prodPersons.length} accounts=${prodPersons.filter(p => p.account).length} tx_entries=${prodTx.length} (version ${activeVersion?.code})`);
  console.log(`  personal_work_items=${await prisma.personalWorkItem.count()} tasks=${await prisma.task.count()} monthly_results=${await prisma.monthlyWorkResult.count()} audit=${await prisma.auditEvent.count()}`);

  /* ---------- ĐƠN VỊ: map tên Excel → org_unit Production ---------- */
  const excelUnits = [];
  for (const o of orgRows) {
    if (!o.a) continue;
    if (/^\d{2}\s/.test(o.a)) continue;             // "01 Trưởng HQCK" — vị trí, không phải đơn vị
    if (o.a === "Lãnh đạo đơn vị") { excelUnits.push({ name: o.a, count: Number(o.b) || null, kind: "LEADERSHIP" }); continue; }
    excelUnits.push({ name: o.a, count: Number(o.b) || null, kind: "UNIT" });
  }
  console.log(`\n=== ĐỐI CHIẾU ĐƠN VỊ (${excelUnits.length} từ Excel) ===`);
  for (const u of excelUnits) {
    const n = norm(u.name);
    let match = prodUnits.find((p) => norm(p.name) === n);
    let how = "exact";
    if (!match) {
      // MA don vi co the goc ten cu (vd "BỘ PHẬN PHÚC TẬP _ KTSTQ" -> ten "Tổng hợp")
      const byCode = prodUnits.find((p) => norm(p.code) === n);
      if (byCode) { match = byCode; how = "exact-code"; }
    }
    if (!match) {
      for (const p of prodUnits) {
        if (sim(n.replace(/[^a-z0-9]/g, ""), norm(p.code).replace(/[^a-z0-9]/g, "")) >= 0.85) { match = p; how = "fuzzy-code"; break; }
      }
    }
    if (!match) {
      // khớp theo tập từ (bộ phận chứa các từ riêng của đơn vị)
      const toks = n.split(" ").filter((t) => !TOKEN_GENERIC.has(t));
      for (const p of prodUnits) {
        const pt = new Set(norm(p.name).split(" "));
        if (toks.length >= 2 && toks.every((t) => pt.has(t))) { match = p; how = "token-subset"; break; }
      }
    }
    if (!match) {
      for (const p of prodUnits) {
        if (sim(n.replace(/[^a-z0-9]/g, ""), norm(p.name).replace(/[^a-z0-9]/g, "")) >= 0.85) { match = p; how = "fuzzy"; break; }
      }
    }
    if (match) {
      const rename = norm(match.name) !== n;
      report.units.push({ excel: u.name, action: "MATCH", prodId: match.id, prodCode: match.code, prodName: match.name, how, renameTo: rename ? u.name : null, staffCount: match._count.assignments });
      console.log(`  MATCH  "${u.name}" → ${match.code} "${match.name}" (${how})${rename ? " [ĐỔI TÊN]" : ""}`);
    } else {
      const near = prodUnits.filter((p) => !report.units.some((u) => u.prodId === p.id));
      const excelToks = new Set(n.split(" ").filter((t) => !TOKEN_GENERIC.has(t)));
      const similar = near
        .map((p) => {
          const pt = new Set(norm(p.name).split(" "));
          const shared = [...excelToks].filter((t) => pt.has(t)).length;
          const s = sim(n.replace(/[^a-z0-9]/g, ""), norm(p.name).replace(/[^a-z0-9]/g, ""));
          const sCode = sim(n.replace(/[^a-z0-9]/g, ""), norm(p.code).replace(/[^a-z0-9]/g, ""));
          return { p, s: Math.max(s, sCode), shared, sCode };
        })
        .filter((x) => x.shared >= 2 || x.s >= 0.85 || x.sCode >= 0.85)
        .sort((a, b) => b.s - a.s)[0];
      if (similar) {
        report.units.push({ excel: u.name, action: "NEEDS_DECISION", prodId: null, prodCode: similar.p.code, prodName: similar.p.name, how: "similar-" + similar.s.toFixed(2), renameTo: null, staffCount: similar.p._count.assignments });
        report.needsDecision.push({ type: "UNIT_POSSIBLE_DUPLICATE", excel: u.name, prodCode: similar.p.code, prodName: similar.p.name, similarity: Number(similar.s.toFixed(2)) });
        console.log(`  NEEDS  "${u.name}" — CÓ THỂ trùng "${similar.p.name}" (${similar.p.code}, tương đồng ${(similar.s * 100).toFixed(0)}%) — KHÔNG tạo, chờ quyết định`);
      } else {
        report.units.push({ excel: u.name, action: "CREATE", prodId: null, prodCode: null, prodName: null, how: null, renameTo: null, staffCount: 0 });
        console.log(`  CREATE "${u.name}" (chưa có trong Production)`);
      }
    }
  }
  for (const p of prodUnits) {
    if (!report.units.some((u) => u.prodId === p.id)) {
      report.units.push({ excel: null, action: "KEEP_UNMATCHED", prodId: p.id, prodCode: p.code, prodName: p.name, how: null, renameTo: null, staffCount: p._count.assignments });
      console.log(`  KEEP   "${p.name}" (${p.code}) — không có trong Excel, GIỮ NGUYÊN (lịch sử)`);
    }
  }

  /* ---------- NHÂN SỰ ---------- */
  console.log(`\n=== ĐỐI CHIẾU NHÂN SỰ ===`);
  const unitByName = new Map();
  for (const u of report.units) if (u.excel) unitByName.set(norm(u.excel), u);
  const seenPeople = new Map();
  for (const s of staffRows) {
    const key = norm(s.name);
    if (!seenPeople.has(key)) seenPeople.set(key, { ...s, groups: [] });
    seenPeople.get(key).groups.push({ group: s.group, role: s.role, stt: s.stt, phone: s.phone, email: s.email });
  }
  // Khoi dau danh sach (khong thuoc bo phan nao) = Lanh dao don vi.
  // Chi gan nguoi co chuc danh "... cua khau"; nguoi "... khu vuc" (cap tren) KHONG gan.
  for (const p of seenPeople.values()) {
    if (p.groups.some((g) => g.group)) continue;
    if (/cua khau/.test(norm(p.role)) && !/khu vuc/.test(norm(p.role))) {
      p.groups.push({ group: "Lãnh đạo đơn vị", role: p.role, stt: p.stt, phone: p.phone, email: p.email });
      p.topBlock = true;
    } else {
      p.topBlockOutside = true;
    }
  }
  let nMatch = 0, nCreate = 0, nDemo = 0;
  for (const [key, p] of seenPeople) {
    const prod = prodPersons.find((x) => norm(x.fullName) === key);
    const isDemo = prod ? /^DEMO/i.test(prod.code) : false;
    const plan = { name: p.name, code: prod?.code || null, prodId: prod?.id || null, action: prod ? (isDemo ? "DEMO_EXISTS" : "MATCH") : "CREATE", email: p.email || null, phone: p.phone || null, groups: p.groups.map((g) => g.group), roles: [...new Set(p.groups.map((g) => g.role))], account: prod?.account?.username || null };
    if (plan.action === "MATCH") { nMatch++; console.log(`  MATCH  ${p.name} → ${prod.code} (${prod.account ? "có tài khoản " + prod.account.username : "chưa có tài khoản"})`); }
    else if (plan.action === "DEMO_EXISTS") { nDemo++; console.log(`  DEMO   ${p.name} → ${prod.code} (tài khoản ${prod.account?.username}) — CẦN QUYẾT ĐỊNH: có dùng lại tài khoản demo này không`); }
    else { nCreate++; console.log(`  CREATE ${p.name} (${plan.roles.join(", ")}) — sẽ tạo hồ sơ, KHÔNG tạo tài khoản`); }
    report.persons.push(plan);
  }
  for (const p of seenPeople.values()) {
    if (p.topBlockOutside) {
      report.needsDecision.push({ type: "PERSON_OUTSIDE_BRANCH", person: p.name, role: p.role, note: "Cấp trên Hải quan khu vực — không gán đơn vị cửa khẩu" });
    }
  }
  report.stats.persons = { match: nMatch, create: nCreate, demo: nDemo, total: seenPeople.size };

  /* ---------- DANH MỤC TX ---------- */
  console.log(`\n=== ĐỐI CHIẾU DANH MỤC TX (${txRows.length} dòng) ===`);
  const prodTxKey = new Map();
  for (const t of prodTx) prodTxKey.set(norm(t.department) + "||" + norm(t.title), t);
  const txSeen = new Set();
  let txSame = 0, txFactorNull = 0, txFactorKeep = 0, txFactorSet = 0, txFactorConflict = 0, txCreate = 0;
  for (const r of txRows) {
    const key = norm(r.dept) + "||" + norm(r.title);
    if (txSeen.has(key)) { report.tx.push({ dept: r.dept, title: r.title, action: "DUPLICATE_IN_FILE" }); continue; }
    txSeen.add(key);
    const prod = prodTxKey.get(key);
    if (!prod) {
      txCreate++;
      report.tx.push({ dept: r.dept, title: r.title, excelFactor: r.factor, action: "CREATE" });
      continue;
    }
    const pF = prod.convertFactor === null || prod.convertFactor === undefined ? null : Number(prod.convertFactor);
    if (r.factor === null && pF === null) { txSame++; report.tx.push({ dept: r.dept, title: r.title, prodId: prod.id, prodCode: prod.code, action: "SAME", factor: null }); continue; }
    if (r.factor !== null && pF !== null && Math.abs(r.factor - pF) < 1e-9) { txSame++; report.tx.push({ dept: r.dept, title: r.title, prodId: prod.id, prodCode: prod.code, action: "SAME", factor: pF }); continue; }
    if (r.factor !== null && pF === null) {
      txFactorSet++;
      report.tx.push({ dept: r.dept, title: r.title, prodId: prod.id, prodCode: prod.code, action: "SET_FACTOR", from: null, to: r.factor });
      console.log(`  SET    ${prod.code}: NULL → ${r.factor}  "${r.title.slice(0, 46)}"`);
      continue;
    }
    if (r.factor === null && pF !== null) {
      if (pF === 0) {
        // Excel để trống => NULL; giá trị 0 ở Production là do điền 0, không phải hệ số thật.
        txFactorNull++;
        report.tx.push({ dept: r.dept, title: r.title, prodId: prod.id, prodCode: prod.code, action: "SET_FACTOR", from: 0, to: null });
        console.log(`  NULLIFY ${prod.code}: 0 → NULL (Excel để trống)`);
        continue;
      }
      txFactorKeep++;
      report.tx.push({ dept: r.dept, title: r.title, prodId: prod.id, prodCode: prod.code, action: "KEEP_FACTOR", from: pF, to: null });
      console.log(`  KEEP   ${prod.code}: giữ hệ số ${pF} (Excel để trống) — CẦN QUYẾT ĐỊNH`);
      continue;
    }
    txFactorConflict++;
    report.tx.push({ dept: r.dept, title: r.title, prodId: prod.id, prodCode: prod.code, action: "CONFLICT", from: pF, to: r.factor });
    console.log(`  CONFLICT ${prod.code}: Production ${pF} ≠ Excel ${r.factor} — GIỮ Production, CẦN QUYẾT ĐỊNH`);
  }
  for (const t of prodTx) {
    const key = norm(t.department) + "||" + norm(t.title);
    if (!txSeen.has(key)) {
      report.tx.push({ dept: t.department, title: t.title, prodId: t.id, prodCode: t.code, action: "KEEP_UNMATCHED", factor: t.convertFactor });
    }
  }
  report.stats.tx = { same: txSame, setFactor: txFactorSet, nullify: txFactorNull, keepFactor: txFactorKeep, conflict: txFactorConflict, create: txCreate, total: txRows.length };

  /* ---------- ghi báo cáo dry-run ---------- */
  const outDir = path.join(REPO, "docs", "V3");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "import-hai-quan-dryrun.json");
  fs.writeFileSync(outFile, JSON.stringify({ generatedAt: new Date().toISOString(), source: FILE, checksum, dryRun: DRY, db: DB_URL.replace(/:[^:@/]*@/, ":***@"), report }, null, 2));
  console.log(`\nBáo cáo dry-run: ${outFile}`);
  console.log(`  Đơn vị: ${report.units.filter(u => u.action === "MATCH").length} khớp / ${report.units.filter(u => u.action === "CREATE").length} tạo mới / ${report.units.filter(u => u.action === "KEEP_UNMATCHED").length} giữ nguyên`);
  console.log(`  Nhân sự: ${nMatch} khớp / ${nCreate} tạo mới / ${nDemo} trùng demo / ${seenPeople.size} tổng`);
  console.log(`  TX: ${txSame} giống / ${txFactorSet} đặt hệ số / ${txFactorNull} giữ hệ số / ${txFactorConflict} xung đột / ${txCreate} tạo mới`);

  if (DRY) {
    console.log("\nDRY-RUN: KHÔNG ghi gì vào DB.");
    await prisma.$disconnect();
    return;
  }

  /* ================= APPLY ================= */
  console.log("\n=== BẮT ĐẦU GHI (chỉ phạm vi an toàn) ===");
  const created = { units: [], persons: [], assignments: [], txFactors: [], txNew: [], supervisions: [] };
  const now = new Date();
  const EFFECTIVE = new Date("2026-01-01T00:00:00.000Z");

  // 1) Đơn vị
  const unitIdByExcelName = new Map();
  for (const u of report.units) {
    if (u.action === "MATCH") {
      unitIdByExcelName.set(norm(u.excel), u.prodId);
      if (u.renameTo) {
        await prisma.orgUnit.update({ where: { id: u.prodId }, data: { name: u.renameTo } });
        console.log(`  ĐỔI TÊN đơn vị ${u.prodCode}: "${u.prodName}" → "${u.renameTo}"`);
      }
    } else if (u.action === "CREATE") {
      const rootUnit = prodUnits.find((p) => norm(p.name) === norm("Hải quan cửa khẩu Quốc tế Tà Lùng"));
      const organizationId = rootUnit?.orgId || null;
      if (!organizationId) {
        report.needsDecision.push({ type: "UNIT_NO_ORGANIZATION", excel: u.name });
        console.log(`  SKIP   "${u.name}" — không xác định được tổ chức cha`);
        continue;
      }
      const code = "HQCB-" + norm(u.excel).split(" ").join("-").toUpperCase();
      const parentId = rootUnit?.id || null;
      const nu = await prisma.orgUnit.create({ data: { code, name: u.excel, parentId, orgId: organizationId } });
      unitIdByExcelName.set(norm(u.excel), nu.id);
      created.units.push({ code: nu.code, name: nu.name });
      console.log(`  TẠO đơn vị: ${nu.code} "${nu.name}"`);
    }
  }

  // 2) Nhân sự
  const personIdByName = new Map();
  for (const p of report.persons) {
    if (p.action === "DEMO_EXISTS") { personIdByName.set(norm(p.name), p.prodId); continue; }
    if (p.action === "MATCH" && p.prodId) {
      personIdByName.set(norm(p.name), p.prodId);
      const upd = {};
      if (p.email && p.email.includes("@")) upd.email = p.email;
      if (p.phone) upd.phone = p.phone;
      if (Object.keys(upd).length) {
        await prisma.person.update({ where: { id: p.prodId }, data: upd });
        console.log(`  CẬP NHẬT hồ sơ ${p.code} (${p.name}): ${Object.keys(upd).join(", ")}`);
      }
      continue;
    }
    // CREATE: mã ổn định
    let code = "HQ-" + slug(p.name);
    if (await prisma.person.findUnique({ where: { code } })) code = code + "-" + Math.random().toString(36).slice(2, 5);
    const np = await prisma.person.create({
      data: {
        code,
        fullName: p.name,
        email: p.email && p.email.includes("@") ? p.email : null,
        phone: p.phone || null,
        status: "ACTIVE",
        notes: `Nguồn: ${path.basename(FILE)} (${p.roles.join(" / ")})`,
      },
    });
    personIdByName.set(norm(p.name), np.id);
    created.persons.push({ code: np.code, name: np.fullName, roles: p.roles, groups: p.groups });
    console.log(`  TẠO hồ sơ nhân sự: ${np.code} "${np.fullName}" (${p.roles.join("/")})`);
  }

  // 3) Phân công (kiêm nhiệm)
  for (const p of report.persons) {
    const pid = personIdByName.get(norm(p.name));
    if (!pid) continue;
    const groups = [...new Set(p.groups.filter(Boolean))];
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const unitId = unitIdByExcelName.get(norm(g));
      if (!unitId) { report.needsDecision.push({ type: "ASSIGNMENT_NO_UNIT", person: p.name, group: g }); continue; }
      const exist = await prisma.personAssignment.findFirst({ where: { personId: pid, unitId, effectiveFrom: EFFECTIVE } });
      if (exist) {
        if (i === 0 && !exist.isPrimary) { await prisma.personAssignment.update({ where: { id: exist.id }, data: { isPrimary: true } }); }
        continue;
      }
      const existingOther = await prisma.personAssignment.findFirst({ where: { personId: pid, unitId } });
      if (existingOther) {
        await prisma.personAssignment.update({ where: { id: existingOther.id }, data: { effectiveFrom: EFFECTIVE, effectiveTo: null, isPrimary: i === 0 ? existingOther.isPrimary : false } });
        created.assignments.push({ person: p.name, unit: g, action: "REOPEN" });
        console.log(`  MỞ LẠI phân công: ${p.name} → ${g}`);
        continue;
      }
      const pa = await prisma.personAssignment.create({ data: { personId: pid, unitId, isPrimary: i === 0, effectiveFrom: EFFECTIVE } });
      created.assignments.push({ person: p.name, unit: g, action: "CREATE" });
      console.log(`  Phân công: ${p.name} → ${g}${i > 0 ? " (KIÊM NHIỆM)" : ""}`);
    }
  }

  // 4) Danh mục TX: đặt hệ số (NULL/0 → giá trị Excel) + tạo mục còn thiếu
  for (const t of report.tx) {
    if (t.action === "SET_FACTOR" && t.prodId) {
      const before = await prisma.workCatalogEntry.findUnique({ where: { id: t.prodId } });
      await prisma.workCatalogEntry.update({ where: { id: t.prodId }, data: { convertFactor: t.to } });
      created.txFactors.push({ code: t.prodCode, title: t.title, from: before?.convertFactor ?? null, to: t.to });
      console.log(`  ${t.to === null ? "NULLIFY" : "SET"} ${t.prodCode}: ${before?.convertFactor ?? "NULL"} → ${t.to}`);
    } else if (t.action === "CREATE") {
      const version = activeVersion;
      if (!version) continue;
      const deptOrder = ["Bộ phân Nghiệp vụ Hải quan", "Bộ phận CNTT", "Bộ phận điều tra CBL", "Bộ phận Phúc tập & KT STQ", "Bộ phận TH & Báo cáo", "Bộ phận công tác Đảng"].indexOf(t.dept);
      const next = await prisma.workCatalogEntry.count({ where: { versionId: version.id } });
      const ne = await prisma.workCatalogEntry.create({
        data: {
          versionId: version.id,
          code: "IMP-" + String(next + 1).padStart(3, "0"),
          title: t.title,
          department: t.dept,
          departmentOrder: deptOrder >= 0 ? deptOrder : 0,
          groupCode: "IMP",
          sortOrder: next + 1,
          sourceRow: 0,
          status: "ACTIVE",
          convertFactor: t.excelFactor ?? null,
        },
      });
      created.txNew.push({ code: ne.code, title: t.title, department: t.dept, factor: t.excelFactor ?? null });
    }
  }

  // 5) Nhật ký import
  const manifest = {
    source: path.basename(FILE),
    checksum,
    at: new Date().toISOString(),
    db: DB_URL.replace(/:[^:@/]*@/, ":***@"),
    created,
  };
  fs.writeFileSync(path.join(REPO, "docs", "V3", `import-hai-quan-manifest-${Date.now()}.json`), JSON.stringify(manifest, null, 2));
  await prisma.auditEvent.create({
    data: {
      actorId: null,
      action: "DATA_IMPORT_HAI_QUAN",
      resourceType: "System",
      resourceId: "import-" + Date.now(),
      newData: { source: path.basename(FILE), checksum, counts: { units: created.units.length, persons: created.persons.length, assignments: created.assignments.length, txFactors: created.txFactors.length, txNew: created.txNew.length } },
    },
  });
  console.log(`\nĐÃ GHI: đơn vị=${created.units.length} nhân sự=${created.persons.length} phân công=${created.assignments.length} hệ số TX=${created.txFactors.length} TX mới=${created.txNew.length}`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error("LỖI:", String(e.stack || e.message).slice(0, 600)); await prisma.$disconnect(); process.exit(1); });
