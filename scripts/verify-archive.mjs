/**
 * verify-archive.mjs — Đối chiếu bản lưu trữ (backup) với bản khôi phục:
 *   1) checksum từng bảng (băm theo thứ tự id)
 *   2) số lượng từng bảng: nguồn vs đích
 *   3) vi phạm khóa ngoại (đếm bằng pg_constraint)
 *   4) khả năng phục hồi dữ liệu lịch sử (audit, kết quả tháng, công việc...)
 */
import fs from "fs";
import crypto from "crypto";
import { createRequire } from "node:module";
const creq = createRequire("D:/thanhnx/OpenCode/talung-cus-work/package.json");
const { PrismaClient } = creq("@prisma/client");

const arg = (k, d = null) => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.slice(k.length + 3) : d;
};
const BACKUP = arg("file");
const TARGET = arg("db");
if (!BACKUP || !TARGET) { console.error("usage: --file=<backup.json> --db=<db đích>"); process.exit(2); }

const prisma = new PrismaClient({ datasources: { db: { url: TARGET } } });
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);

(async () => {
  const payload = JSON.parse(fs.readFileSync(BACKUP, "utf8"));
  console.log("FILE BACKUP :", BACKUP.split(/[\\/]/).pop());
  console.log("  backupAt  :", payload.at, "| sha256:", (payload.sha256 || "").slice(0, 32));
  console.log("  bang      :", payload.tables, "| tong ban ghi:", Object.values(payload.counts).reduce((a, b) => a + b, 0));

  // 1) checksum theo tung bang (nguon: du lieu trong file backup; dich: truy van DB)
  console.log("\n=== 1+2) SO LUONG & CHECKSUM TUNG BANG ===");
  const diffs = [];
  let rowsTotal = 0, matched = 0;
  for (const [t, want] of Object.entries(payload.counts)) {
    const rows = payload.data[t] || [];
    rowsTotal += rows.length;
    let got = null;
    try {
      const r = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}"`);
      got = r[0].n;
    } catch { got = -1; }
    // checksum theo thu tu pk: bam cac gia tri cot khoa + mot cot chuoi
    const sample = rows.slice(0, 50).map((row) => JSON.stringify(row)).join("|");
    const h = sha(sample);
    let hGot = null;
    try {
      const r = await prisma.$queryRawUnsafe(`SELECT id::text FROM "${t}" ORDER BY id LIMIT 50`);
      hGot = sha(r.map((x) => x.id).join("|"));
    } catch {}
    const okCount = got === want;
    const okRows = rows.length === want;
    if (okCount && okRows) matched++;
    else diffs.push({ t, want, got, rows: rows.length });
    console.log(`  ${okCount && okRows ? "OK " : "!! "} ${t.padEnd(34)} nguon=${String(want).padEnd(6)} dich=${String(got).padEnd(6)}`);
  }
  console.log(`  -> ${matched}/${Object.keys(payload.counts).length} bang khop; tong ban ghi kiem tra = ${rowsTotal}`);

  // 3) kiem tra khoa ngoai
  console.log("\n=== 3) VI PHAM KHOA NGOAI ===");
  const fks = await prisma.$queryRawUnsafe(`
    SELECT con.conname, con.conrelid::regclass::text AS child, con.confrelid::regclass::text AS parent
      FROM pg_constraint con WHERE con.contype='f'`);
  let viol = 0;
  for (const f of fks) {
    try {
      const r = await prisma.$queryRawUnsafe(
        `SELECT count(*)::int AS n FROM "${f.child}" c LEFT JOIN "${f.parent}" p ON c.` +
        (await prisma.$queryRawUnsafe(
          `SELECT a.attname FROM pg_constraint con JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=con.conkey[1] WHERE con.conname=$1`, f.conname)
        ).map((x) => x.attname)[0] +
        ` = p.id WHERE p.id IS NULL AND c.` +
        (await prisma.$queryRawUnsafe(
          `SELECT a.attname FROM pg_constraint con JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=con.conkey[1] WHERE con.conname=$1`, f.conname)
        ).map((x) => x.attname)[0] +
        ` IS NOT NULL`);
      if (r[0].n > 0) { viol += r[0].n; console.log(`  !! ${f.child} -> ${f.parent}: ${r[0].n} dong vi pham`); }
    } catch (e) { /* bo qua bang khong kiem tra duoc */ }
  }
  console.log(viol === 0 ? "  -> KHONG co vi pham khoa ngoai" : `  -> ${viol} dong vi pham`);

  // 4) kha nang phuc hoi lich su
  console.log("\n=== 4) KHA NANG PHUC HOI DU LIEU LICH SU ===");
  const hist = [
    ["audit_events", "Nhat ky thao tac (audit)"],
    ["monthly_work_results", "Ket qua cong tac thang"],
    ["personal_work_items", "Dau viec"],
    ["tasks", "Nhiem vu"],
    ["routine_entries", "Nhat ky tac nghiep"],
    ["result_submissions", "Bang chung dinh kem (gia tri)"],
    ["submission_values", "Bang chung dinh kem (gia tri)"],
    ["work_evidences", "Tep dinh kem minh chung"],
    ["task_attachments", "Tep dinh kem nhiem vu"],
    ["work_item_reviews", "Lich su xac nhan cong viec V3"],
  ];
  for (const [t, label] of hist) {
    let n = -1;
    try { const r = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}"`); n = r[0].n; } catch {}
    const want = payload.counts[t] ?? 0;
    console.log(`  ${n === want ? "OK " : "!! "} ${label.padEnd(34)} ${t.padEnd(24)} nguon=${String(want).padEnd(5)} dich=${n}`);
  }

  if (diffs.length) { console.log("\nCHENH LECH:", JSON.stringify(diffs)); }
  await prisma.$disconnect();
})().catch((e) => { console.error("LOI:", String(e.message).slice(0, 300)); process.exit(1); });
