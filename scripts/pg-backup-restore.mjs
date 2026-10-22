/**
 * pg-backup-restore.mjs — Backup/Restore theo SQL thuần, KHÔNG phụ thuộc phiên bản schema.
 *
 *   node scripts/pg-backup-restore.mjs backup --db=<url> --out=<file>
 *   node scripts/pg-backup-restore.mjs restore --db=<url> --file=<backup.json>
 *
 * Vì sao cần: Prisma client của nhánh V3 có các cột mới (work_evidences.status...) mà
 * Production chưa có => dùng client V3 để backup Production sẽ lỗi. Công cụ này đọc
 * information_schema nên chạy được trên mọi phiên bản schema.
 */
import fs from "fs";
import { createRequire } from "node:module";
const require2 = createRequire("D:/thanhnx/OpenCode/talung-cus-work/package.json");
const { PrismaClient } = require2("@prisma/client");
const crypto = require2("node:crypto");

const arg = (k, d = null) => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.slice(k.length + 3) : d;
};
const mode = process.argv[2];
const DB = arg("db") || process.env.DIRECT_URL || process.env.DATABASE_URL;
const prisma = new PrismaClient({ datasources: { db: { url: DB } } });

async function listTables() {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT table_name AS name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name`
  );
  return rows.map((r) => r.name);
}
async function listColumns(table) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT column_name AS name, data_type AS type, udt_name AS udt
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
    table
  );
  return rows.map((r) => ({ name: r.name, type: r.type, udt: r.udt }));
}

async function backup() {
  const out = arg("out");
  const tables = await listTables();
  const data = {};
  const counts = {};
  for (const t of tables) {
    const rows = await prisma.$queryRawUnsafe(`SELECT * FROM "${t}"`);
    data[t] = rows;
    counts[t] = rows.length;
  }
  const payload = {
    tool: "pg-backup-restore.mjs",
    at: new Date().toISOString(),
    db: String(DB).replace(/:[^:@/]*@/, ":***@"),
    tables: tables.length,
    counts,
    data,
  };
  const json = JSON.stringify(payload);
  const sha = crypto.createHash("sha256").update(json).digest("hex");
  payload.sha256 = sha;
  fs.writeFileSync(out, JSON.stringify(payload));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`BACKUP OK -> ${out}`);
  console.log(`  bảng=${tables.length} bản ghi=${total} bytes=${fs.statSync(out).size} sha256=${sha}`);
  return payload;
}

/** Thu tu chèn theo phu thuoc khoa ngoai (cha truoc, con sau). */
async function orderByForeignKeys(tables) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT c.relname AS child, c2.relname AS parent
       FROM pg_constraint con
       JOIN pg_class c ON c.oid = con.conrelid
       JOIN pg_class c2 ON c2.oid = con.confrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE con.contype = 'f' AND n.nspname = 'public'`);
  const deps = new Map();
  for (const r of rows) {
    if (!deps.has(r.child)) deps.set(r.child, new Set());
    deps.get(r.child).add(r.parent);
  }
  const out = [];
  const seen = new Set();
  const visit = (t, stack = new Set()) => {
    if (seen.has(t) || stack.has(t)) return;
    stack.add(t);
    for (const parent of deps.get(t) || []) if (tables.includes(parent)) visit(parent, stack);
    stack.delete(t);
    if (!seen.has(t)) { seen.add(t); out.push(t); }
  };
  for (const t of tables) visit(t);
  return out;
}

async function restore() {
  const file = arg("file");
  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  const srcTables = Object.keys(payload.data);
  const dstTables = new Set(await listTables());
  let inserted = 0;
  let skipped = 0;
  // TẮT trigger khoá ngoại trong lúc nạp (DB scratch, tài khoản superuser) => không phụ thuộc thứ tự chèn
  for (const t of srcTables) {
    if (dstTables.has(t)) {
      try { await prisma.$executeRawUnsafe(`ALTER TABLE "${t}" DISABLE TRIGGER ALL`); } catch {}
    }
  }
  for (const t of await orderByForeignKeys(srcTables)) {
    if (!dstTables.has(t)) { console.log(`  [SKIP] bảng không có trong đích: ${t}`); skipped++; continue; }
    const colInfo = await listColumns(t);
    const dstCols = new Map(colInfo.map((c) => [c.name, c]));
    const rows = payload.data[t];
    if (!rows.length) continue;
    let pending = rows.slice();
    let pass = 0;
    while (pending.length && pass < 8) {
      const deferred = [];
      for (const row of pending) {
      const cols = Object.keys(row).filter((c) => dstCols.has(c) && row[c] !== undefined);
      if (!cols.length) continue;
      const vals = [];
      let i = 0;
      const ph = cols.map((c) => {
        const meta = dstCols.get(c);
        let v = row[c];
        if (v !== null && typeof v === "object" && !(v instanceof Date) && !Buffer.isBuffer(v)) v = JSON.stringify(v);
        i += 1;
        if (meta.udt === "jsonb" || meta.udt === "json") {
          vals.push(typeof v === "string" ? v : JSON.stringify(v ?? null));
          return "CAST($" + i + " AS jsonb)";
        }
        if (meta.udt === "bytea") {
          vals.push(Buffer.isBuffer(v) ? v : Buffer.from(String(v), "base64"));
          return "$" + i;
        }
        const CASTS = { timestamp: "TIMESTAMP", timestamptz: "TIMESTAMPTZ", date: "DATE", time: "TIME", numeric: "NUMERIC", decimal: "NUMERIC", int4: "INT", int8: "BIGINT", int2: "SMALLINT", float4: "REAL", float8: "DOUBLE PRECISION", bool: "BOOLEAN" };
        if (CASTS[meta.udt]) {
          vals.push(v);
          return "CAST($" + i + " AS " + CASTS[meta.udt] + ")";
        }
        vals.push(v);
        return "$" + i;
      }).join(",");
      try {
        await prisma.$executeRawUnsafe(
          `INSERT INTO "${t}" (${cols.map((c) => `"${c}"`).join(",")}) VALUES (${ph}) ON CONFLICT DO NOTHING`,
          ...vals
        );
        inserted++;
      } catch (e) {
        const code = String(e?.code || e?.message || "");
        if (/23503|foreign key/i.test(code)) { deferred.push(row); continue; }
        throw e;
      }
      }
      pending = deferred;
      pass += 1;
      if (pending.length && pass >= 8) {
        console.log(`  [WARN] ${t}: còn ${pending.length} dòng chưa chèn được (quan hệ cha-con trong cùng bảng)`);
      }
    }
    console.log(`  [OK] ${t}: ${rows.length} dòng (đã chèn ${rows.length - pending.length})`);
  }
  // BẬT lại trigger
  for (const t of srcTables) {
    if (dstTables.has(t)) {
      try { await prisma.$executeRawUnsafe(`ALTER TABLE "${t}" ENABLE TRIGGER ALL`); } catch {}
    }
  }
  // kiểm tra số lượng sau restore
  let mismatch = 0;
  for (const t of srcTables) {
    if (!dstTables.has(t)) continue;
    const n = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}"`);
    const want = payload.counts[t];
    if (n[0].n < want) { console.log(`  [WARN] ${t}: đích ${n[0].n} < nguồn ${want}`); mismatch++; }
  }
  console.log(`RESTORE xong: ${inserted} dòng, ${skipped} bảng bỏ qua, ${mismatch} bảng thiếu.`);
  if (mismatch) process.exitCode = 1;
}

(async () => {
  if (mode === "backup") await backup();
  else if (mode === "restore") await restore();
  else { console.error("usage: pg-backup-restore.mjs backup|restore --db=... --out/--file=..."); process.exit(2); }
  await prisma.$disconnect();
})().catch(async (e) => { console.error("LỖI:", String(e.message).slice(0, 400)); await prisma.$disconnect(); process.exit(1); });
