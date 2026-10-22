/**
 * reset-and-init.mjs — RESET & KHỞI TẠO HỆ THỐNG V3 (chuẩn bị vận hành thật).
 *
 *   # 1) rehearsal trên bản sao local
 *   node scripts/reset-and-init.mjs --db=<db đích> --source-db=<db nguồn cho danh mục> --mode=rehearsal
 *   # 2) Production (CHỈ KHI CHỦ DỰ ÁN PHÊ DUYỆT) — script có chốt an toàn
 *   node scripts/reset-and-init.mjs --db=<db đích> --source-db=<db nguồn> --mode=production --confirm=RESET-2026-10-22
 *
 * NGUYÊN TẮC:
 *  - KHÔNG dùng TRUNCATE CASCADE, KHÔNG DROP schema. Xoá theo MA TRẬN bảng (con trước, cha sau).
 *  - Chỉ xoá bảng nghiệp vụ/dữ liệu thử; GIỮ bảng cấu hình (roles, permissions, role_permissions,
 *    organizations, positions, reporting_periods, activity_groups, form_templates(+versions),
 *    system_configs, metric_* định nghĩa, product_catalog_versions/groups/items).
 *  - Nhập lại: cơ cấu tổ chức + nhân sự + 348 TX từ FILE Excel chính thức.
 *  - Danh mục QĐ1277: trích xuất từ DB nguồn (đã kiểm chứng), ghi nguồn vào manifest.
 *  - Tạo DUY NHẤT 1 tài khoản Super Admin kỹ thuật, mật khẩu ngẫu nhiên, ghi ra file ngoài git
 *    (KHÔNG in ra log, KHÔNG gắn lãnh đạo, KHÔNG có quyền duyệt nghiệp vụ).
 *  - Idempotent: chạy lại không sinh bản ghi trùng, không lỗi.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createRequire } from "node:module";
const creq = createRequire("D:/thanhnx/OpenCode/talung-cus-work/package.json");
const ExcelJS = creq("exceljs");
const { PrismaClient } = creq("@prisma/client");
const bcrypt = creq("bcryptjs");

const REPO = "D:/thanhnx/OpenCode/talung-cus-work/";
const XLSX = path.join(REPO, "docs", "Dữ liệu-file-hai-quan-gui", "Danh sách.xlsx");
const arg = (k, d = null) => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.slice(k.length + 3) : d;
};
const TARGET = arg("db");
const SOURCE = arg("source-db");
const MODE = arg("mode", "rehearsal");
const CONFIRM = arg("confirm", "");
const OUT_DIR = path.join(REPO, "demo-ops", "reset");

if (!TARGET) {
  console.error("Thiếu --db=<db đích>");
  process.exit(2);
}
if (MODE === "production" && CONFIRM !== "RESET-2026-10-22") {
  console.error("CHẾ ĐỘ PRODUCTION: cần --confirm=RESET-2026-10-22 (lệnh của chủ dự án).");
  process.exit(2);
}

const prisma = new PrismaClient({ datasources: { db: { url: TARGET } } });
const src = SOURCE ? new PrismaClient({ datasources: { db: { url: SOURCE } } }) : null;

/* ============ MA TRẬN BẢNG ============ */
// Nhom 1: du lieu nghiep vu (XOA toan bo)
const DELETE_TABLES = [
  // --- ho so phe duyet / de nghi ---
  "approval_decisions", "approval_cases", "evaluation_assessments", "evidence_adjustments",
  "work_item_reviews", "score_run_items", "score_runs", "feedback", "official_docs",
  // --- bang diem / tong hop ---
  "metric_daily_entries", "metric_entry_revisions", "metric_baselines", "metric_plan_targets",
  "metric_entry_assignments", "report_blocks", "report_snapshots",
  "briefing_report_versions", "briefing_narratives", "narrative_sections",
  // --- cong viec / nhiem vu ---
  "work_item_products", "work_item_assignments", "work_item_series", "plan_task_links",
  "plan_item_work_links", "plan_items", "plans", "task_counters",
  "task_updates", "task_assignees", "task_attachments", "task_comments", "comment_reactions",
  "tasks", "personal_work_items",
  // --- nhat ky ---
  "submission_values", "result_submissions", "routine_entries",
  // --- ket qua thang ---
  "monthly_work_results",
  // --- thong bao ---
  "notifications", "push_subscriptions",
  // --- linh tuc / nghi p vu khac ---
  "deadline_requests", "leave_requests", "meetings", "department_work_items",
  "duty_day_infos", "duty_rosters",
  // --- mau nghiep vu cu (khong dung lam danh muc chinh thuc) ---
  "activity_templates",
];
// Nhom 2: danh muc TX (XOA roi nhap lai tu file Excel chinh thuc)
const REBUILD_TX = ["work_catalog_entries"];
// Nhom 3: to chuc / nhan su / tai khoan (XOA roi nhap lai)
const REBUILD_ORG = ["org_units", "person_assignments", "people", "role_grants", "accounts"];
// Nhom 4: GIU (cau hinh)
const KEEP_TABLES = [
  "organizations", "roles", "permissions", "role_permissions", "positions", "reporting_periods",
  "activity_groups", "form_templates", "form_template_versions", "system_configs",
  "metric_groups", "metric_definitions", "metric_classifications",
  "product_catalog_versions", "product_groups", "product_items",
  "work_catalog_versions", "work_catalog_department_mappings", "audit_events",
];

const norm = (v) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const cellv = (v) => {
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

let manifest = { notes: [] };

async function tableExists(t) {
  const r = await prisma.$queryRawUnsafe(
    `SELECT 1 AS x FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`, t);
  return r.length > 0;
}

/** Các cột FK trỏ tới bảng sẽ bị xoá & dựng lại (people, org_units, accounts...) → đặt NULL khi copy. */
async function columnsToNull() {
  const rebuilt = ["people", "org_units", "accounts", "person_assignments", "role_grants"];
  const rows = await prisma.$queryRawUnsafe(
    `SELECT tc.table_name AS tbl, kcu.column_name AS col
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON kcu.constraint_name = tc.constraint_name
       JOIN information_schema.constraint_column_usage ccu
         ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = ANY($1)`, rebuilt);
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.tbl)) map.set(r.tbl, new Set());
    map.get(r.tbl).add(r.col);
  }
  return map;
}

/** Copy mot bang tu DB nguon sang DB dich (chi cot dung chung, bo qua rong). */
async function copyTable(srcClient, table, nullCols) {
  if (!(await tableExists(table))) return 0;
  const dstCols = await prisma.$queryRawUnsafe(
    `SELECT column_name AS name FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, table);
  const dstSet = new Set(dstCols.map((c) => c.name));
  const rows = await srcClient.$queryRawUnsafe(`SELECT * FROM "${table}"`);
  if (!rows.length) return 0;
  const cols = Object.keys(rows[0]).filter((c) => dstSet.has(c));
  if (!cols.length) return 0;
  let n = 0;
  for (const row of rows) {
    const skip = nullCols && nullCols.get(table) ? nullCols.get(table) : new Set();
    const use = cols.filter((c) => row[c] !== undefined && row[c] !== null && !skip.has(c));
    if (!use.length) continue;
    const vals = use.map((c) => {
      const v = row[c];
      if (v !== null && typeof v === "object" && !(v instanceof Date) && !Buffer.isBuffer(v)) return JSON.stringify(v);
      return v;
    });
    const ph = use.map((_, i) => "$" + (i + 1)).join(",");
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "${table}" (${use.map((c) => `"${c}"`).join(",")}) VALUES (${ph}) ON CONFLICT DO NOTHING`,
        ...vals
      );
      n++;
    } catch (e) {
      manifest.notes.push(`copy ${table} loi: ${String(e.message).slice(0, 90)}`);
      console.log(`  !! copy ${table}: ${String(e.message).slice(0, 100)}`);
    }
  }
  return n;
}

async function deleteRows(table, where = {}) {
  const cols = Object.keys(where);
  let sql = `DELETE FROM "${table}"`;
  const vals = [];
  if (cols.length) {
    sql += " WHERE " + cols.map((c, i) => `"${c}" = $${i + 1}`).join(" AND ");
    vals.push(...cols.map((c) => where[c]));
  }
  const res = await prisma.$executeRawUnsafe(sql, ...vals);
  return res;
}

async function main() {
  const stamp = new Date().toISOString();
  const manifest = {
    tool: "reset-and-init.mjs", mode: MODE, startedAt: stamp,
    target: String(TARGET).replace(/:[^:@/]*@/, ":***@"),
    source: SOURCE ? String(SOURCE).replace(/:[^:@/]*@/, ":***@") : null,
    xlsx: fs.existsSync(XLSX) ? path.basename(XLSX) : null,
    xlsxSha256: fs.existsSync(XLSX) ? crypto.createHash("sha256").update(fs.readFileSync(XLSX)).digest("hex") : null,
    deleted: {}, created: {}, notes: [],
  };
  console.log(`CHẾ ĐỘ: ${MODE} | ${stamp}`);

  /* ---------- 0. Kiểm tra nguồn ---------- */
  if (!fs.existsSync(XLSX)) {
    console.error("THIẾU FILE NGUỒN:", XLSX);
    process.exit(2);
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX);

  // Sheet: Danh muc cong viec
  const wsW = wb.getWorksheet("Danh mục công việc ");
  const txRows = [];
  let curDept = cellv(wsW.getRow(1).getCell(1).value) || null;
  for (let r = 2; r <= wsW.rowCount; r++) {
    const d = cellv(wsW.getRow(r).getCell(1).value);
    if (d) curDept = d;
    const title = cellv(wsW.getRow(r).getCell(2).value);
    if (!title) continue;
    const f = wsW.getRow(r).getCell(3).value;
    const factor = typeof f === "number" ? f : (f === null || f === undefined || String(f).trim() === "" ? null : Number(f));
    txRows.push({ dept: curDept, title, factor: Number.isFinite(factor) ? factor : null });
  }

  // Sheet: Co cau to chuc
  const wsO = wb.getWorksheet("Cơ cấu tổ chức");
  const orgRows = [];
  for (let r = 1; r <= wsO.rowCount; r++) {
    const a = cellv(wsO.getRow(r).getCell(1).value);
    const b = cellv(wsO.getRow(r).getCell(2).value);
    if (!a) continue;
    if (/^\d{2}\s/.test(a)) continue; // "01 Truong HQCK" - vi tri, khong phai don vi
    orgRows.push({ name: a, count: Number(b) || null });
  }

  // Sheet: Danh sach nhan su
  const wsP = wb.getWorksheet("Danh sách");
  const staffRows = [];
  let curGroup = null;
  for (let r = 3; r <= wsP.rowCount; r++) {
    const row = wsP.getRow(r);
    const stt = cellv(row.getCell(1).value);
    const name = cellv(row.getCell(2).value);
    const role = cellv(row.getCell(3).value);
    const phone = cellv(row.getCell(4).value).replace(/\s+/g, " ");
    const email = cellv(row.getCell(5).value);
    if (!stt && name) { curGroup = name; continue; }
    if (!name) continue;
    staffRows.push({ stt, name, role, phone, email, group: curGroup });
  }
  // gom theo nguoi (kiem nhiem)
  const peopleMap = new Map();
  for (const s of staffRows) {
    const k = norm(s.name);
    if (!peopleMap.has(k)) peopleMap.set(k, { name: s.name, role: s.role, phone: s.phone, email: s.email, groups: [] });
    const p = peopleMap.get(k);
    if (s.group) p.groups.push(s.group);
    else if (/cua khau/.test(norm(s.role)) && !/khu vuc/.test(norm(s.role))) p.groups.push("Lãnh đạo đơn vị");
  }
  console.log(`  Excel: ${txRows.length} dong TX | ${orgRows.length} don vi | ${peopleMap.size} nguoi (${staffRows.length} luot)`);

  /* ---------- 0. COPY CAU HINH NEN TANG tu DB nguon (da kiem chung) ---------- */
  if (src) {
    const nullCols = await columnsToNull();
    for (const t of KEEP_TABLES) {
      if (t === "audit_events") continue;                 // giu audit cua DB dich
      const n = await copyTable(src, t, nullCols);
      if (n > 0) {
        manifest.created["config:" + t] = n;
        console.log(`  COPY ${t}: ${n}`);
      }
    }
  } else {
    manifest.notes.push("khong co --source-db: BO SUNG CAU HINH NEN TANG (roles/permissions/forms/QD1277) khong duoc");
  }

  /* ---------- 1. XOA du lieu nghiep vu (theo ma tran) ---------- */
  for (const t of [...DELETE_TABLES, ...REBUILD_TX, ...REBUILD_ORG]) {
    if (!(await tableExists(t))) continue;
    try {
      const n = await deleteRows(t);
      manifest.deleted[t] = n;
      if (n > 0) console.log(`  XOA ${t}: ${n}`);
    } catch (e) {
      manifest.notes.push(`khong xoa duoc ${t}: ${String(e.message).slice(0, 120)}`);
      console.log(`  !! ${t}: ${String(e.message).slice(0, 110)}`);
    }
  }
  console.log("  (audit_events GIU nguyen - nhung ghi de trong nhat ky moi)");

  /* ---------- 2. DON VI ---------- */
  const org = await prisma.organization.findFirst();
  if (!org) throw new Error("Khong tim thay organization nen tang");
  const unitByName = new Map();
  const rootUnit = await prisma.orgUnit.findFirst({ where: { code: "HQCK_TALUNG" } });
  for (const o of orgRows) {
    const code = "HQCB-" + norm(o.name).split(" ").join("-").toUpperCase();
    const u = await prisma.orgUnit.upsert({
      where: { code },
      create: { code, name: o.name, orgId: org.id, parentId: rootUnit?.id || null, status: "ACTIVE" },
      update: { name: o.name, orgId: org.id, status: "ACTIVE" },
    });
    unitByName.set(norm(o.name), u.id);
    manifest.created["org_units:" + code] = 1;
  }
  console.log(`  don vi: ${unitByName.size}`);

  /* ---------- 3. NHAN SU (35 nguoi, KHONG tao tai khoan) ---------- */
  const personByName = new Map();
  let seq = 1;
  for (const [key, p] of peopleMap) {
    const code = "HQ-" + norm(p.name).replace(/[^a-z0-9]/g, "").toUpperCase().slice(0, 24);
    const finalCode = code + (seq > 1 && code.length > 3 ? "" : "");
    const rec = await prisma.person.upsert({
      where: { code: finalCode },
      create: {
        code: finalCode, fullName: p.name,
        email: p.email && p.email.includes("@") ? p.email : null,
        phone: p.phone || null, status: "ACTIVE",
        notes: `Nguon: ${path.basename(XLSX)} | Chuc danh: ${p.role}`,
      },
      update: {
        fullName: p.name,
        email: p.email && p.email.includes("@") ? p.email : null,
        phone: p.phone || null, status: "ACTIVE",
        notes: `Nguon: ${path.basename(XLSX)} | Chuc danh: ${p.role}`,
      },
    });
    personByName.set(key, rec.id);
    manifest.created["people:" + finalCode] = 1;
    for (let i = 0; i < p.groups.length; i++) {
      const uid = unitByName.get(norm(p.groups[i]));
      if (!uid) { manifest.notes.push(`khong gan don vi cho ${p.name}: ${p.groups[i]}`); continue; }
      const eff = new Date("2026-01-01T00:00:00.000Z");
      const exist = await prisma.personAssignment.findFirst({ where: { personId: rec.id, unitId: uid } });
      if (exist) {
        await prisma.personAssignment.update({ where: { id: exist.id }, data: { effectiveFrom: eff, effectiveTo: null, isPrimary: i === 0 } });
      } else {
        await prisma.personAssignment.create({ data: { personId: rec.id, unitId: uid, isPrimary: i === 0, effectiveFrom: eff } });
      }
      manifest.created["person_assignments:" + p.name] = (manifest.created["person_assignments:" + p.name] || 0) + 1;
    }
    seq++;
  }
  console.log(`  nhan su: ${personByName.size} (khong tao tai khoan)`);

  /* ---------- 4. DANH MUC TX (348) ---------- */
  // Lay ma/group/thu tu cua danh muc cu (nguon da kiem chung) de giu dung dinh danh
  const oldTx = src ? await src.workCatalogEntry.findMany() : [];
  const oldByKey = new Map(oldTx.map((t) => [norm(t.department) + "||" + norm(t.title), t]));
  let version = await prisma.workCatalogVersion.findFirst({ where: { status: "ACTIVE" } });
  if (!version) {
    version = await prisma.workCatalogVersion.create({
      data: { code: "TX-" + new Date().toISOString().slice(0, 10).replace(/-/g, ""), title: "Danh mục công việc thường xuyên", status: "ACTIVE", entryCount: 0, selectionMode: "ALL" },
    });
    console.log("  tao phien ban danh muc moi:", version.code);
  }
  let txCreated = 0, txFactorChanged = 0;
  const seenTx = new Set();
  for (const r of txRows) {
    const key = norm(r.dept) + "||" + norm(r.title);
    if (seenTx.has(key)) { manifest.notes.push(`TX trung trong file Excel: ${r.title}`); continue; }
    seenTx.add(key);
    const old = oldByKey.get(key);
    const data = {
      versionId: version.id,
      code: old?.code || "IMP-" + String(txCreated + 1).padStart(3, "0"),
      title: r.title,
      department: r.dept || "Bộ phân Nghiệp vụ Hải quan",
      departmentOrder: old?.departmentOrder ?? 0,
      groupCode: old?.groupCode || "IMP",
      sortOrder: old?.sortOrder ?? txCreated + 1,
      sourceRow: old?.sourceRow ?? 0,
      status: "ACTIVE",
      // He so: Excel la nguon chinh thuc. 0 khac NULL (Excel de trong => NULL).
      convertFactor: r.factor,
    };
    await prisma.workCatalogEntry.create({ data });
    txCreated++;
    if (old && old.convertFactor !== null && r.factor !== null && Number(old.convertFactor) !== r.factor) {
      txFactorChanged++;
      manifest.notes.push(`he so TX ${data.code} doi: cu ${old.convertFactor} -> Excel ${r.factor}`);
    }
  }
  manifest.created["work_catalog_entries"] = txCreated;
  console.log(`  TX: ${txCreated} muc (${txFactorChanged} doi he so so voi he thong cu)`);

  /* ---------- 5. DANH MUC QD1277 (trich xuat tu DB nguon da kiem chung) ---------- */
  if (src) {
    const v = await src.productCatalogVersion.findFirst({ where: { status: "ACTIVE" } });
    const groups = await src.productGroup.findMany();
    const items = await src.productItem.findMany();
    console.log(`  QD1277 nguon: ${groups.length} nhom / ${items.length} san pham (version ${v?.code})`);
    manifest.qd1277 = { source: "db nguon", version: v?.code, groups: groups.length, items: items.length };
  } else {
    manifest.notes.push("KHONG co --source-db: danh muc QD1277 phai trich xuat tu DB nguon truoc khi reset Production");
  }

  /* ---------- 6. SUPER ADMIN KY THUAT (duy nhat) ---------- */
  const adminRole = await prisma.role.findFirst({ where: { code: "SYSTEM_ADMIN" } });
  if (!adminRole) throw new Error("Khong tim thay role SYSTEM_ADMIN");
  const adminPerson = await prisma.person.create({
    data: {
      code: "ADMIN-TK", fullName: "Quản trị hệ thống (kỹ thuật)", status: "ACTIVE",
      notes: "Tai khoan quan tri ky thuat duy nhat khoi tao moi. Khong gan don vi, khong duyet nghiep vu.",
    },
  });
  const pwd = crypto.randomBytes(18).toString("base64url");
  const adminAcc = await prisma.account.create({
    data: {
      username: "admin.tk",
      passwordHash: await bcrypt.hash(pwd, 12),
      personId: adminPerson.id,
      status: "ACTIVE",
      roleGrants: { create: [{ roleId: adminRole.id, scopeType: "ORGANIZATION" }] },
    },
  });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const secretFile = path.join(OUT_DIR, `super-admin-credentials-${stamp.slice(0, 10)}.txt`);
  fs.writeFileSync(
    secretFile,
    `TALUNG-CUS-WORK — TAI KHOAN SUPER ADMIN KY THUAT (khoi tao moi)\n` +
    `Sinh luc: ${stamp}\nUsername: admin.tk\nMat khau: ${pwd}\n\n` +
    `LUU Y: file nay KHONG duoc commit va KHONG duoc gui qua email/chat.\n` +
    `Doi mat khau ngay sau lan dang nhap dau tien.\n`
  );
  manifest.created["accounts:admin.tk"] = 1;
  manifest.superAdmin = { username: "admin.tk", personCode: "ADMIN-TK", credentialFile: path.relative(REPO, secretFile) };
  console.log("  Super Admin: admin.tk (mat khau: xem file credential, KHONG in ra log)");

  /* ---------- 7. DOI CHIEU ---------- */
  const counts = {};
  for (const t of [...KEEP_TABLES, ...DELETE_TABLES]) {
    if (await tableExists(t)) {
      const r = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}"`);
      counts[t] = r[0].n;
    }
  }
  manifest.after = counts;
  const mustBeZero = ["plans", "plan_items", "tasks", "task_updates", "personal_work_items", "routine_entries", "monthly_work_results", "result_submissions", "submission_values", "work_item_products", "notifications", "approval_cases", "activity_templates", "metric_daily_entries"];
  const notClean = mustBeZero.filter((t) => (counts[t] || 0) > 0);
  manifest.cleanCheck = { mustBeZero, notClean, ok: notClean.length === 0 };
  console.log(`  doi chieu: ${notClean.length === 0 ? "SACH" : "CON " + notClean.join(", ")}`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const mf = path.join(OUT_DIR, `reset-manifest-${MODE}-${stamp.slice(0, 19).replace(/[:T]/g, "-")}.json`);
  fs.writeFileSync(mf, JSON.stringify(manifest, null, 2));
  console.log("MANIFEST:", path.relative(REPO, mf));
  console.log("KET QUA:", manifest.cleanCheck.ok ? "PASS" : "FAIL");
  await prisma.$disconnect();
  if (src) await src.$disconnect();
}

main().catch(async (e) => { console.error("LOI:", String(e.stack || e.message).slice(0, 500)); await prisma.$disconnect(); if (src) await src.$disconnect(); process.exit(1); });
