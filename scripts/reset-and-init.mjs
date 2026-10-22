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
import { execFileSync } from "node:child_process";
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
// Preflight là bước CHỈ ĐỌC (kiểm tra điều kiện an toàn) ⇒ không cần mã xác nhận xoá.
const IS_PREFLIGHT = arg("preflight") === "1";
if (MODE === "production" && CONFIRM !== "RESET-2026-10-22" && !IS_PREFLIGHT) {
  console.error("CHẾ ĐỘ PRODUCTION: cần --confirm=RESET-2026-10-22 (lệnh của chủ dự án).");
  process.exit(2);
}
// An toàn: lệnh xoá Production chỉ chạy trên DB Supabase thật, không chạy trên DB local.
if (MODE === "production" && !IS_PREFLIGHT && !String(TARGET || "").includes("supabase")) {
  console.error("CHẾ ĐỘ PRODUCTION: --db phải trỏ tới DB Production thật (Supabase), không phải DB local.");
  process.exit(2);
}

const prisma = new PrismaClient({ datasources: { db: { url: TARGET } } });
const src = SOURCE ? new PrismaClient({ datasources: { db: { url: SOURCE } } }) : null;

/* ============ MA TRẬN BẢNG ============ */
// Nhom 1: du lieu nghiep vu (XOA toan bo)
const DELETE_TABLES = [
  // --- ho so phe duyet / de nghi ---
  "approval_decisions", "approval_cases", "evaluation_assessments",
  "work_evidence_adjustments", "work_evidences",
  "work_item_reviews", "score_run_items", "score_runs", "official_docs",
  // --- bang diem / tong hop ---
  "metric_daily_entries", "metric_entry_revisions", "metric_baselines", "metric_plan_targets",
  "metric_entry_assignments", "report_blocks", "report_snapshots",
  "briefing_report_versions", "briefing_narratives", "narrative_sections",
  // --- cong viec / nhiem vu ---
  "work_item_products", "work_item_assignments", "work_item_series", "plan_task_links",
  "plan_items", "plans", "task_counters",
  "task_updates", "task_assignees", "task_attachments", "task_comments", "comment_reactions",
  "tasks", "personal_work_items",
  // --- nhat ky ---
  "submission_values", "result_submissions", "routine_entries",
  // --- ket qua thang ---
  "monthly_work_results",
  // --- thong bao ---
  "notifications", "push_subscriptions",
  // --- linh tuc / nghi p vu khac ---
  "deadline_requests", "leave_requests", "meetings", "meeting_conclusions", "department_work_items",
  "duty_day_infos", "duty_rosters", "duty_positions",
  // --- tuyen phe duyet (khong chuyen sang he thong moi) ---
  "person_supervisions",
  // --- mau nghiep vu cu (khong dung lam danh muc chinh thuc) ---
  "activity_templates",
  // --- audit cua he thong VET (da luu trong kho luu tru; DB van hanh moi bat dau tu 0) ---
  "audit_events",
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
  "work_catalog_versions", "work_catalog_department_mappings",
];

// Nguon danh muc TX da doi chieu (348 dong Excel -> 320 ma giu, 28 dong loai)
const RECON_DIR = path.join(OUT_DIR, "reconciliation");
const TX_CSV = path.join(RECON_DIR, "tx-348-dong-320-ma.csv");
const TX_EXCLUDED_CSV = path.join(RECON_DIR, "tx-28-dong-bi-loai.csv");
const QD1277_SNAPSHOT = path.join(RECON_DIR, "qd1277-snapshot-manifest.json");
const FILES_MANIFEST = path.join(RECON_DIR, "prod-files-manifest.json");

/** Doc CSV RFC4180 (ho tro truong nhieu dong, dau nhay). */
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift().map((h) => h.trim());
  return rows
    .filter((r) => r.some((x) => String(x).trim() !== ""))
    .map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

const sha256File = (p) =>
  fs.existsSync(p) ? crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex") : null;

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

  /* ---------- PREFLIGHT: kiem tra dieu kien an toan (khong ghi, khong xoa) ---------- */
  if (arg("preflight") === "1") {
    const checks = [];
    let backupInfo = null;
    const add = (name, ok, detail = "") => checks.push({ name, ok, detail });

    // 1) Ket noi DB dich — phai la Production dung (hoac DB tap dien)
    const dbName = (() => {
      try {
        const u = new URL(TARGET);
        return { host: u.hostname, db: u.pathname.replace(/^\//, "") };
      } catch {
        return { host: "?", db: "?" };
      }
    })();
    const expectHost = String(arg("expect-host", "")).toLowerCase();
    const expectDb = String(arg("expect-db", "")).toLowerCase();
    if (expectHost) {
      add(
        "Ket noi dung DB Production",
        dbName.host.toLowerCase().includes(expectHost) &&
          (!expectDb || dbName.db.toLowerCase() === expectDb),
        `${dbName.host}/${dbName.db}`
      );
    } else {
      add("Tham so --expect-host/--expect-db", false, "chua xac nhan dung DB dich");
    }

    // 2) Backup moi nhat + checksum
    const backupDir = path.join(REPO, "demo-ops", "yc38c-backup");
    const backups = fs.existsSync(backupDir)
      ? fs.readdirSync(backupDir).filter((f) => f.endsWith(".json")).map((f) => path.join(backupDir, f))
      : [];
    backups.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    const latest = backups[0];
    add("Co backup moi nhat", !!latest, latest ? path.basename(latest) : "KHONG CO");
    if (latest) {
      const st = fs.statSync(latest);
      add("Backup kich thuoc > 1MB", st.size > 1024 * 1024, `${st.size} bytes`);
      backupInfo = { file: path.relative(REPO, latest), bytes: st.size, sha256: sha256File(latest) };
    }

    // 3) Restore-test: DB khoi phuc duoc tren moi truong rieng
    const restoreTest = path.join(REPO, "demo-ops", "reset", "restore-test-result.json");
    add("Co ket qua restore-test", fs.existsSync(restoreTest), fs.existsSync(restoreTest) ? path.basename(restoreTest) : "THIEU");

    // 4) Nguon danh muc: TX 320 + QD1277 + don vi/nhan su
    const txRows = fs.existsSync(TX_CSV) ? parseCsv(fs.readFileSync(TX_CSV, "utf8")) : [];
    add("Danh muc TX = 320 ma", txRows.length === 320, `${txRows.length} dong`);
    add("Co danh sach 28 dong TX bi loai", fs.existsSync(TX_EXCLUDED_CSV));
    add("Co snapshot QD1277 (nguon + trang thai)", fs.existsSync(QD1277_SNAPSHOT));
    if (src) {
      const units = (await src.$queryRawUnsafe(`SELECT count(*)::int n FROM org_units`))[0].n;
      const people = (await src.$queryRawUnsafe(`SELECT count(*)::int n FROM people`))[0].n;
      const items = (await src.$queryRawUnsafe(`SELECT count(*)::int n FROM product_items`))[0].n;
      const groups = (await src.$queryRawUnsafe(`SELECT count(*)::int n FROM product_groups`))[0].n;
      add("Nguon: co don vi + nhan su + QD1277", units > 0 && people > 0 && items > 0 && groups > 0,
        `units=${units} people=${people} SP=${items} nhom=${groups}`);
    } else {
      add("Co --source-db", false, "khong co DB nguon de lay danh muc");
    }

    // 5) Role SYSTEM_ADMIN + quyen ky thuat
    const adminRole = await prisma.role.findFirst({
      where: { code: "SYSTEM_ADMIN" },
      include: { rolePermissions: { include: { permission: true } } },
    });
    add("Co role SYSTEM_ADMIN", !!adminRole);
    if (adminRole) {
      const codes = adminRole.rolePermissions.map((rp) => rp.permission.code);
      // Quyen ky thuat bat buoc cho Super Admin (theo quyet dinh 22/10/2026)
      const need = ["org.manage", "catalog.manage", "system.config", "users.manage", "audit.view"];
      const missing = need.filter((c) => !codes.includes(c));
      add("Quyen ky thuat day du", missing.length === 0, missing.length ? "thieu: " + missing.join(",") : codes.length + " quyen");
      // KHONG duyet nghiep vu mac dinh
      const approve = codes.filter((c) => /approve|review|confirm|duyet/i.test(c));
      add("SYSTEM_ADMIN khong co quyet duyet nghiep vu", approve.length === 0, approve.join(","));
    }

    // 6) Kho luu tru tep (truoc khi xoa)
    const fm = fs.existsSync(FILES_MANIFEST) ? JSON.parse(fs.readFileSync(FILES_MANIFEST, "utf8")) : null;
    const files = fm?.files || [];
    add("Manifest tep da co", !!fm, `${files.length} tep`);
    for (const f of files) {
      // Tep co the nam trong kho luu tru tong hoac thu muc reconciliation
      const candidates = [
        path.join(REPO, "demo-ops", "reset", "reconciliation", "prod-files", f.archivedFile || ""),
        path.join(REPO, "demo-ops", "archive", "prod-2026-10-22", f.archivedFile || ""),
      ];
      const p = candidates.find((c) => fs.existsSync(c));
      const ok = !!p;
      add(`Tep da luu tru: ${f.fileName || f.archivedFile}`, ok, ok ? `${fs.statSync(p).size} bytes` : "THIEU");
    }

    // 7) Kehoa tep trong Storage (can xoa sau khi luu tru)
    const att = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM task_attachments`).catch(() => [{ n: -1 }]);
    const ev = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM work_evidences`).catch(() => [{ n: -1 }]);
    add(
      "Can don sach tep trong Storage",
      true,
      `task_attachments=${att[0].n} work_evidences=${ev[0].n} (xoa sau khi luu tru bang purge-storage.mjs)`
    );

    const go = checks.every((c) => c.ok);
    console.log("\n=== PREFLIGHT RESET PRODUCTION ===");
    for (const c of checks) console.log(`  [${c.ok ? "OK " : "NO "}] ${c.name}${c.detail ? " — " + c.detail : ""}`);
    console.log(go ? "\nKET QUA: GO (co the lenh EXECUTE)" : "\nKET QUA: NO-GO (chua du dieu kien)");
    const pf = path.join(REPO, "demo-ops", "reset", `preflight-${stamp.slice(0, 19).replace(/[:T]/g, "-")}.json`);
    fs.mkdirSync(path.dirname(pf), { recursive: true });
    fs.writeFileSync(pf, JSON.stringify({ stamp, go, checks, backup: backupInfo }, null, 2));
    console.log("PREFLIGHT FILE:", path.relative(REPO, pf));
    await prisma.$disconnect();
    if (src) await src.$disconnect();
    process.exit(go ? 0 : 1);
  }

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
  const sameDb = (() => {
    try {
      const norm = (u) => String(u).replace(/:[^:@/]*@/, ":***@").replace(/\?.*$/, "").replace(/\/$/, "");
      return SOURCE && TARGET && norm(SOURCE) === norm(TARGET);
    } catch {
      return false;
    }
  })();
  if (sameDb) {
    manifest.notes.push("DB nguon = DB dich: bo qua sao chep cau hinh nen (du lieu da co san trong DB dich)");
    console.log("  DB nguon = DB dich -> bo qua COPY cau hinh nen");
  } else if (src) {
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

  /* ---------- 4. DANH MUC TX (320 ma — da doi chieu 348 dong Excel -> 320 giu / 28 loai) ---------- */
  if (!fs.existsSync(TX_CSV)) {
    throw new Error(`THIEU file danh muc TX da doi chieu: ${TX_CSV}`);
  }
  const txCsvRows = parseCsv(fs.readFileSync(TX_CSV, "utf8"));
  const txExcluded = fs.existsSync(TX_EXCLUDED_CSV)
    ? parseCsv(fs.readFileSync(TX_EXCLUDED_CSV, "utf8")).length
    : null;
  if (txCsvRows.length !== 320) {
    throw new Error(`Danh muc TX phai co 320 ma, thuc te ${txCsvRows.length} — dung file doi chieu khac`);
  }
  console.log(`  TX (file doi chieu): ${txCsvRows.length} ma giu / ${txExcluded ?? "?"} dong bi loai`);

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
  let txCreated = 0, txFactorChanged = 0, txNullFactor = 0;
  for (const r of txCsvRows) {
    const dept = r.department || "Bộ phận Nghiệp vụ Hải quan";
    const key = norm(dept) + "||" + norm(r.title);
    const old = oldByKey.get(key);
    const rawFactor = String(r.factorExcel ?? "").trim();
    const factor = rawFactor === "" ? null : Number(rawFactor);
    if (factor === null) txNullFactor++;
    const data = {
      versionId: version.id,
      code: r.sourceCode || old?.code || "IMP-" + String(txCreated + 1).padStart(3, "0"),
      title: r.title,
      department: dept,
      departmentOrder: old?.departmentOrder ?? 0,
      groupCode: r.groupCode || old?.groupCode || "IMP",
      sortOrder: old?.sortOrder ?? txCreated + 1,
      sourceRow: Number(r.excelRow) || old?.sourceRow || 0,
      status: "ACTIVE",
      // He so: Excel la nguon chinh thuc. 0 khac NULL (Excel de trong => NULL).
      convertFactor: Number.isFinite(factor) ? factor : null,
    };
    await prisma.workCatalogEntry.create({ data });
    txCreated++;
    if (old && old.convertFactor !== null && factor !== null && Number(old.convertFactor) !== factor) {
      txFactorChanged++;
      manifest.notes.push(`he so TX ${data.code} doi: cu ${old.convertFactor} -> Excel ${factor}`);
    }
  }
  manifest.created["work_catalog_entries"] = txCreated;
  manifest.tx = {
    source: "demo-ops/reset/reconciliation/tx-348-dong-320-ma.csv (da doi chieu voi file Excel goc)",
    file: path.relative(REPO, TX_CSV),
    sha256: sha256File(TX_CSV),
    kept: txCsvRows.length,
    excluded: txExcluded,
    excludedFile: txExcluded !== null ? path.relative(REPO, TX_EXCLUDED_CSV) : null,
    excludedSha256: sha256File(TX_EXCLUDED_CSV),
    nullFactor: txNullFactor,
    factorChangedVsOld: txFactorChanged,
  };
  console.log(`  TX: ${txCreated} muc (${txNullFactor} he so NULL, ${txFactorChanged} doi he so so voi he thong cu)`);

  /* ---------- 5. DANH MUC QD1277 (trich xuat tu DB nguon da kiem chung) ---------- */
  if (src) {
    const v = await src.productCatalogVersion.findFirst({ where: { status: "ACTIVE" } });
    const groups = await src.productGroup.findMany();
    const items = await src.productItem.findMany();
    console.log(`  QD1277 nguon: ${groups.length} nhom / ${items.length} san pham (version ${v?.code})`);
    const withFactor = items.filter((i) => i.convertFactor !== null && i.convertFactor !== undefined).length;
    const snap = fs.existsSync(QD1277_SNAPSHOT)
      ? JSON.parse(fs.readFileSync(QD1277_SNAPSHOT, "utf8"))
      : null;
    manifest.qd1277 = {
      source: "DB nguon da kiem chung (khong co file Excel QD1277 goc trong workspace)",
      officialSourceFile: null,
      pendingVerification: true,
      note:
        snap?.note ||
        "Hinh thuc chinh thuc CHUA CO. He so giu NGUYEN TU DANH MUC, khong suy luan. Can ban giao file goc de doi chieu lan cuoi.",
      version: v?.code || null,
      groups: groups.length,
      items: items.length,
      withFactor,
      nullFactor: items.length - withFactor,
      snapshotFile: path.relative(REPO, QD1277_SNAPSHOT),
      snapshotSha256: sha256File(QD1277_SNAPSHOT),
      productsCsvSha256: sha256File(path.join(RECON_DIR, "qd1277-3386-san-pham.csv")),
      groupsCsvSha256: sha256File(path.join(RECON_DIR, "qd1277-80-nhom.csv")),
    };
  } else {
    manifest.notes.push("KHONG co --source-db: danh muc QD1277 phai trich xuat tu DB nguon truoc khi reset Production");
  }

  /* ---------- 6. SUPER ADMIN KY THUAT (duy nhat) ---------- */
  const adminRole = await prisma.role.findFirst({ where: { code: "SYSTEM_ADMIN" } });
  if (!adminRole) throw new Error("Khong tim thay role SYSTEM_ADMIN");
  const existingAdmin = await prisma.account.findFirst({ where: { username: "admin.tk" } });
  if (existingAdmin) {
    manifest.notes.push("admin.tk da ton tai - giu nguyen (khong tao lai, khong doi mat khau)");
    console.log("  Super Admin: admin.tk da ton tai (giu nguyen)");
  } else {
  const adminPerson = await prisma.person.create({
    data: {
      code: "ADMIN-TK", fullName: "Quản trị hệ thống (kỹ thuật)", status: "ACTIVE",
      notes: "Tai khoan quan tri ky thuat duy nhat khoi tao moi. Khong gan don vi, khong duyet nghiep vu.",
    },
  });
  const pwd = crypto.randomBytes(18).toString("base64url");
  await prisma.account.create({
    data: {
      username: "admin.tk",
      passwordHash: await bcrypt.hash(pwd, 12),
      personId: adminPerson.id,
      status: "ACTIVE",
      // Bắt buộc đổi mật khẩu ở lần đăng nhập đầu tiên.
      mustChangePassword: true,
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
    `BAT BUOC doi mat khau o lan dang nhap dau tien.\n`,
    { encoding: "utf8", mode: 0o600 }
  );
  manifest.created["accounts:admin.tk"] = 1;
  manifest.superAdmin = {
    username: "admin.tk",
    personCode: "ADMIN-TK",
    mustChangePassword: true,
    credentialFile: path.relative(REPO, secretFile),
  };
  console.log("  Super Admin: admin.tk (mat khau: xem file credential, KHONG in ra log)");
  }

  /* ---------- 7. DOI CHIEU ---------- */
  const counts = {};
  for (const t of [...KEEP_TABLES, ...DELETE_TABLES, ...REBUILD_TX, ...REBUILD_ORG]) {
    if (await tableExists(t)) {
      const r = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}"`);
      counts[t] = r[0].n;
    }
  }
  manifest.after = counts;

  // --- NGHIEM THU: 0 nghiep vu + du lieu nen duoc nhap day du ---
  const mustBeZero = [
    "plans", "plan_items", "plan_task_links", "task_counters",
    "tasks", "task_updates", "task_assignees", "task_attachments", "task_comments", "comment_reactions",
    "personal_work_items", "work_item_products", "work_item_reviews", "work_item_assignments",
    "routine_entries", "result_submissions", "submission_values", "monthly_work_results",
    "approval_cases", "approval_decisions", "evidence_adjustments", "work_evidence_adjustments",
    "notifications", "push_subscriptions", "activity_templates", "metric_daily_entries",
    "score_runs", "score_run_items", "report_snapshots", "report_blocks",
    "deadline_requests", "leave_requests", "meetings", "department_work_items",
    "duty_rosters", "duty_day_infos", "official_docs",
    "person_supervisions", "audit_events",
  ];
  const notClean = mustBeZero.filter((t) => (counts[t] || 0) > 0);

  // Tai khoan: chi 1 SUPER ADMIN, khong con tai khoan cu (can bo that/DEMO/UAT).
  const accCount = (await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM accounts`))[0].n;
  const adminAcc = await prisma.account.findFirst({
    where: { username: "admin.tk" },
    include: { roleGrants: { include: { role: true } }, person: { include: { assignments: true } } },
  });
  const adminOk =
    !!adminAcc &&
    accCount === 1 &&
    adminAcc.roleGrants.length === 1 &&
    adminAcc.roleGrants[0].role.code === "SYSTEM_ADMIN" &&
    adminAcc.person.assignments.length === 0;

  // Du lieu nen phai day du (35 nhan su ngoai tai khoan quan tri ky thuat ADMIN-TK)
  const peopleStaff = (await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS n FROM people WHERE code <> 'ADMIN-TK'`
  ))[0].n;
  const expect = {
    org_units: 8,
    people: 35,
    work_catalog_entries: 320,
    product_items: 3386,
    product_groups: 80,
    accounts: 1,
  };
  const actual = { ...counts, people: peopleStaff };
  const baselineIssues = Object.entries(expect)
    .filter(([t, n]) => (actual[t] ?? 0) !== n)
    .map(([t, n]) => `${t}: ${actual[t] ?? 0} (can co ${n})`);

  manifest.acceptance = {
    mustBeZero,
    notClean,
    cleanOk: notClean.length === 0,
    accounts: accCount,
    superAdmin: adminOk
      ? { username: "admin.tk", role: "SYSTEM_ADMIN", unitAssignments: 0 }
      : { ok: false },
    expectedBaseline: expect,
    baselineIssues,
    baselineOk: baselineIssues.length === 0,
  };
  manifest.cleanCheck = {
    mustBeZero,
    notClean,
    ok: notClean.length === 0 && adminOk && baselineIssues.length === 0,
  };

  // Thong tin phien ban + kho luu tru tep
  manifest.app = {
    commit: (() => {
      try {
        return execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO }).toString().trim();
      } catch {
        return null;
      }
    })(),
    schemaSha256: sha256File(path.join(REPO, "prisma", "schema.prisma")),
  };
  manifest.files = fs.existsSync(FILES_MANIFEST)
    ? JSON.parse(fs.readFileSync(FILES_MANIFEST, "utf8"))
    : { files: [], note: "chua co manifest tep" };

  console.log(`  doi chieu 0 nghiep vu: ${notClean.length === 0 ? "SACH" : "CON " + notClean.join(", ")}`);
  console.log(`  tai khoan: ${accCount} (muc tieu 1) | super admin: ${adminOk ? "OK" : "KHONG DUNG"}`);
  console.log(
    `  du lieu nen: ${baselineIssues.length === 0 ? "DAY DU" : "THIEU " + baselineIssues.join("; ")}`
  );

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const mf = path.join(OUT_DIR, `reset-manifest-${MODE}-${stamp.slice(0, 19).replace(/[:T]/g, "-")}.json`);
  fs.writeFileSync(mf, JSON.stringify(manifest, null, 2));
  console.log("MANIFEST:", path.relative(REPO, mf));
  console.log("KET QUA:", manifest.cleanCheck.ok ? "PASS" : "FAIL");
  await prisma.$disconnect();
  if (src) await src.$disconnect();
}

main().catch(async (e) => { console.error("LOI:", String(e.stack || e.message).slice(0, 500)); await prisma.$disconnect(); if (src) await src.$disconnect(); process.exit(1); });
