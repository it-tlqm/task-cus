/**
 * YC-31 + YC-32 — Áp DDL additive lên CSDL (idempotent, an toàn chạy lại).
 * Nguồn: prisma/migrations/20261021100000_yc31_yc32_work_catalog_evidence/migration.sql
 *
 * BẮT BUỘC: Production KHÔNG có bảng `_prisma_migrations` (đã kiểm tra độc lập 19/10/2026)
 * => KHÔNG chạy `prisma migrate deploy`; dùng script này theo quy ước apply-script của dự án.
 *
 * Chạy trên DB test/clone cục bộ:
 *   $env:DATABASE_URL="postgresql://postgres:postgres@localhost:54329/talung_prodclone"; $env:DIRECT_URL=$env:DATABASE_URL; npx tsx scripts/apply-yc31-32-ddl.ts
 * Chạy trên Production (CHỈ SAU KHI có phê duyệt deploy + backup mới + storage đạt):
 *   npx tsx scripts/apply-yc31-32-ddl.ts
 *
 * Idempotency: CREATE TABLE/INDEX -> IF NOT EXISTS; ADD COLUMN -> IF NOT EXISTS; ADD CONSTRAINT -> kiểm tra pg_constraint.
 * An toàn dữ liệu: toàn bộ thay đổi additive + nullable; không DROP, không UPDATE dữ liệu hiện có.
 * Rollback: ưu tiên code-first (deploy lại commit cũ) — schema additive/nullable tương thích code cũ;
 *           KHÔNG tự DROP bảng/cột hay xóa file minh chứng.
 */
import { prisma } from "../src/server/db";
import fs from "fs";

function maskedTarget(): string {
  const url = process.env.DATABASE_URL || "";
  try {
    const u = new URL(url);
    return `${u.hostname}${u.port ? ":" + u.port : ""}/${u.pathname.replace(/^\//, "")}`;
  } catch {
    return "(khong doc duoc)";
  }
}

async function main() {
  console.log(`DB dich: ${maskedTarget()}`);
  const file = "prisma/migrations/20261021100000_yc31_yc32_work_catalog_evidence/migration.sql";
  let sql = fs.readFileSync(file, "utf8");
  // Idempotent: chỉ tạo khi chưa có
  sql = sql.replace(/CREATE TABLE "/g, 'CREATE TABLE IF NOT EXISTS "');
  sql = sql.replace(/CREATE UNIQUE INDEX "/g, 'CREATE UNIQUE INDEX IF NOT EXISTS "');
  sql = sql.replace(/CREATE INDEX "/g, 'CREATE INDEX IF NOT EXISTS "');
  sql = sql.replace(/ADD COLUMN\s+"/g, 'ADD COLUMN IF NOT EXISTS "');
  // Bỏ toàn bộ dòng chỉ có comment (tránh tách nhầm câu lệnh khi comment chứa dấu ';')
  const codeOnly = sql
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");
  const statements = codeOnly
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  let applied = 0;
  let skipped = 0;
  for (const st of statements) {
    // Bỏ qua ADD CONSTRAINT trùng (chạy lại sẽ lỗi) — kiểm tra pg_constraint trước
    if (/ADD CONSTRAINT/.test(st)) {
      const m = st.match(/ADD CONSTRAINT "([^"]+)"/);
      const name = m?.[1] || "";
      const exists: Array<{ c: bigint }> = await prisma.$queryRawUnsafe(
        `SELECT count(*)::int AS c FROM pg_constraint WHERE conname = '${name}'`
      );
      if (Number(exists[0]?.c || 0) > 0) {
        console.log(`SKIP constraint ${name} (da ton tai)`);
        skipped++;
        continue;
      }
    }
    await prisma.$executeRawUnsafe(st);
    applied++;
  }

  // Hậu kiểm: object YC-31/32 phải tồn tại sau khi áp
  const checks: Array<{ label: string; sql: string }> = [
    { label: "table work_catalog_versions", sql: "SELECT count(*)::int AS c FROM information_schema.tables WHERE table_schema='public' AND table_name='work_catalog_versions'" },
    { label: "table work_catalog_entries", sql: "SELECT count(*)::int AS c FROM information_schema.tables WHERE table_schema='public' AND table_name='work_catalog_entries'" },
    { label: "table work_evidences", sql: "SELECT count(*)::int AS c FROM information_schema.tables WHERE table_schema='public' AND table_name='work_evidences'" },
    { label: "personal_work_items.catalog_entry_id", sql: "SELECT count(*)::int AS c FROM information_schema.columns WHERE table_schema='public' AND table_name='personal_work_items' AND column_name='catalog_entry_id'" },
    { label: "personal_work_items.due_date", sql: "SELECT count(*)::int AS c FROM information_schema.columns WHERE table_schema='public' AND table_name='personal_work_items' AND column_name='due_date'" },
    { label: "personal_work_items.completed_date", sql: "SELECT count(*)::int AS c FROM information_schema.columns WHERE table_schema='public' AND table_name='personal_work_items' AND column_name='completed_date'" },
    { label: "personal_work_items.task_id", sql: "SELECT count(*)::int AS c FROM information_schema.columns WHERE table_schema='public' AND table_name='personal_work_items' AND column_name='task_id'" },
    { label: "unique monthly(person,work_item)", sql: "SELECT count(*)::int AS c FROM pg_indexes WHERE schemaname='public' AND indexname='monthly_work_results_person_id_work_item_id_key'" },
  ];
  let failed = 0;
  for (const ch of checks) {
    const rows: Array<{ c: bigint }> = await prisma.$queryRawUnsafe(ch.sql);
    const ok = Number(rows[0]?.c || 0) > 0;
    console.log(`${ok ? "OK  " : "MISS"} ${ch.label}`);
    if (!ok) failed++;
  }
  console.log(`DDL-OK (applied=${applied}, skipped=${skipped}, checks_failed=${failed})`);
  if (failed > 0) process.exitCode = 2;
}

main()
  .catch((e) => {
    console.error("ERR:", e.message);
    process.exit(1);
  })
  .finally(() => process.exit(process.exitCode ?? 0));
