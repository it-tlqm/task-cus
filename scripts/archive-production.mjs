/**
 * archive-production.mjs — LƯU TRỮ ĐỘC LẬP toàn bộ trạng thái Production trước khi làm sạch.
 *
 * Thu thập:
 *   1. Schema (DDL) của toàn bộ bảng + danh sách bảng/số dòng.
 *   2. Xuất dữ liệu (JSON) — dùng pg-backup-restore.mjs để đồng bộ định dạng restore.
 *   3. Tệp đính kèm trong Supabase Storage (tải qua publishable key, checksum sha256).
 *   4. Cấu hình & phiên bản ứng dụng (commit Git, schema hash, biến môi trường TÊN + giá trị
 *      đã che, KHÔNG ghi khoá/secret).
 *   5. Manifest + checksum kiểm chứng.
 *
 * Dùng:
 *   node scripts/archive-production.mjs --db=<url> --out=<thu muc> [--files]
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const REPO = "D:/thanhnx/OpenCode/talung-cus-work/";
const creq = createRequire(path.join(REPO, "package.json"));
const { PrismaClient } = creq("@prisma/client");

const arg = (k, d = null) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};
const DB = arg("db");
const OUT = arg("out", path.join(REPO, "demo-ops", "archive"));
const WITH_FILES = process.argv.includes("--files");

if (!DB) {
  console.error("Thiếu --db=<url>");
  process.exit(2);
}

const sha256File = (p) =>
  fs.existsSync(p) ? crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex") : null;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const stamp = new Date().toISOString();
  const prisma = new PrismaClient({ datasources: { db: { url: DB } } });

  // 1) Schema DDL + danh sach bang
  const tables = await prisma.$queryRawUnsafe(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`
  );
  const ddl = [];
  const counts = {};
  for (const t of tables) {
    const name = t.table_name;
    const c = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${name}"`);
    counts[name] = c[0].n;
    const d = await prisma.$queryRawUnsafe(
      `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='${name}' ORDER BY ordinal_position`
    );
    ddl.push({ table: name, rows: c[0].n, columns: d });
  }
  const schemaFile = path.join(OUT, "schema-snapshot.json");
  fs.writeFileSync(
    schemaFile,
    JSON.stringify({ generatedAt: stamp, database: String(DB).replace(/:[^:@/]*@/, ":***@"), tables: ddl }, null, 2)
  );

  // 2) Xuất du lieu (dung pg-backup-restore.mjs)
  const dataFile = path.join(OUT, "data-export.json");
  execFileSync(
    "node",
    [path.join(REPO, "scripts", "pg-backup-restore.mjs"), "backup", `--out=${dataFile}`],
    { cwd: REPO, env: { ...process.env, DATABASE_URL: DB, DIRECT_URL: DB }, stdio: "inherit" }
  );

  // 3) Tep dinh kem trong Storage
  const files = [];
  if (WITH_FILES) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const pk = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || "task-attachments";
    const att = await prisma.$queryRawUnsafe(
      `SELECT id, task_id, file_name, storage_key, file_size, mime_type FROM task_attachments`
    );
    const dir = path.join(OUT, "files");
    fs.mkdirSync(dir, { recursive: true });
    for (const a of att) {
      const r = await fetch(`${url}/storage/v1/object/${bucket}/${a.storage_key}`, {
        headers: { apikey: pk, Authorization: "Bearer " + pk },
      });
      if (!r.ok) {
        files.push({ type: "taskAttachment", id: a.id, storageKey: a.storage_key, ok: false, status: r.status });
        continue;
      }
      const buf = Buffer.from(await r.arrayBuffer());
      const safe = `taskAttachment-${a.id}-${String(a.file_name).replace(/[^\w.\-]/g, "_")}`;
      fs.writeFileSync(path.join(dir, safe), buf);
      files.push({
        type: "taskAttachment",
        id: a.id,
        taskId: a.task_id,
        fileName: a.file_name,
        storageKey: a.storage_key,
        bucket,
        dbFileSize: a.file_size,
        bytes: buf.length,
        sha256: crypto.createHash("sha256").update(buf).digest("hex"),
        archivedFile: path.join("files", safe),
        ok: true,
      });
    }
  }

  // 4) Cau hinh + phien ban ung dung (TEN bien moi truong; KHONG ghi khoa/secret)
  const envNames = Object.keys(process.env)
    .filter((k) => /^(DATABASE_URL|DIRECT_URL|STORAGE|SUPABASE|NEXT_PUBLIC|JWT|ALLOW_LOCAL|TEST_)/.test(k))
    .filter((k) => !/KEY|SECRET|PASSWORD|TOKEN/i.test(k))
    .sort();
  const app = {
    commit: (() => {
      try {
        return execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO }).toString().trim();
      } catch {
        return null;
      }
    })(),
    branch: (() => {
      try {
        return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: REPO }).toString().trim();
      } catch {
        return null;
      }
    })(),
    schemaSha256: sha256File(path.join(REPO, "prisma", "schema.prisma")),
    envNames,
  };

  // 5) Manifest + checksum
  const manifest = {
    generatedAt: stamp,
    tool: "archive-production.mjs",
    database: String(DB).replace(/:[^:@/]*@/, ":***@"),
    tables: tables.length,
    totalRows: Object.values(counts).reduce((a, b) => a + b, 0),
    counts,
    files,
    app,
    sha256: {
      schema: sha256File(schemaFile),
      data: sha256File(dataFile),
    },
  };
  const mf = path.join(OUT, "archive-manifest.json");
  fs.writeFileSync(mf, JSON.stringify(manifest, null, 2));

  console.log("\n=== KHO LUU TRU ===");
  console.log(`  thu muc: ${path.relative(REPO, OUT)}`);
  console.log(`  bang: ${tables.length} | tong dong: ${manifest.totalRows}`);
  console.log(`  tep: ${files.length} (luu tru: ${files.filter((f) => f.ok).length})`);
  console.log(`  schema sha256: ${manifest.sha256.schema}`);
  console.log(`  data   sha256: ${manifest.sha256.data}`);
  console.log(`  MANIFEST: ${path.relative(REPO, mf)}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("LỖI:", String(e.stack || e.message).slice(0, 400));
  process.exit(1);
});
