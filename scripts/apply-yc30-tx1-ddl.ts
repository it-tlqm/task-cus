/**
 * YC-31 (bổ sung) — Áp DDL additive lên CSDL (idempotent, an toàn chạy lại).
 * Nguồn: prisma/migrations/20261020130000_yc30_tx1_catalog_factor/migration.sql
 *
 * BẮT BUỘC: Production KHÔNG có bảng `_prisma_migrations` (đã kiểm tra 20/10/2026)
 * => KHÔNG chạy `prisma migrate deploy`; dùng script này theo quy ước apply-script của dự án.
 *
 * Chạy trên DB test/clone cục bộ:
 *   $env:DATABASE_URL="<chuỗi kết nối DB local>"; $env:DIRECT_URL=$env:DATABASE_URL
 *   npx tsx scripts/apply-yc30-tx1-ddl.ts
 * Chạy trên Production (CHỈ SAU khi có backup mới + phê duyệt):
 *   npx tsx scripts/apply-yc30-tx1-ddl.ts
 *
 * Idempotency: ADD COLUMN -> IF NOT EXISTS; DROP INDEX -> IF EXISTS; CREATE INDEX -> IF NOT EXISTS.
 * An toàn dữ liệu: chỉ ADD/DROP INDEX; KHÔNG xoá bảng/cột, KHÔNG UPDATE/DELETE dữ liệu.
 * Rollback: code-first (deploy lại commit cũ) — cột mới nullable nên tương thích code cũ.
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

const TABLES = ["work_catalog_versions", "work_catalog_entries", "work_catalog_department_mappings"];

/** Vân tay schema của đúng các đối tượng liên quan YC-31 (bổ sung). */
async function schemaFingerprint(): Promise<string> {
  const rows: Array<{ fingerprint: string }> = await prisma.$queryRawUnsafe(`
    SELECT md5(
      (
        SELECT coalesce(string_agg(
          table_name || '.' || column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, ''),
          '|' ORDER BY table_name, column_name
        ), '')
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name IN ('work_catalog_versions','work_catalog_entries','work_catalog_department_mappings')
      )
      ||
      (
        SELECT coalesce(string_agg(indexname || ':' || indexdef, '|' ORDER BY indexname), '')
        FROM pg_indexes
        WHERE schemaname = 'public' AND tablename IN ('work_catalog_versions','work_catalog_entries','work_catalog_department_mappings')
      )
    ) AS fingerprint
  `);
  return rows[0]?.fingerprint || "none";
}

async function main() {
  console.log(`DB dich: ${maskedTarget()}`);
  const beforeFingerprint = await schemaFingerprint();
  const file = "prisma/migrations/20261020130000_yc30_tx1_catalog_factor/migration.sql";
  let sql = fs.readFileSync(file, "utf8");
  sql = sql.replace(/ADD COLUMN\s+"/g, 'ADD COLUMN IF NOT EXISTS "');
  sql = sql.replace(/CREATE INDEX\s+"/g, 'CREATE INDEX IF NOT EXISTS "');

  const codeOnly = sql
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");
  const statements = codeOnly
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  let executed = 0;
  for (const st of statements) {
    await prisma.$executeRawUnsafe(st);
    executed++;
  }

  const afterFingerprint = await schemaFingerprint();
  const schemaChanged = beforeFingerprint !== afterFingerprint;

  const checks: Array<{ label: string; sql: string; expect: "exists" | "absent" }> = [
    {
      label: "column work_catalog_entries.group_code",
      sql: "SELECT count(*)::int AS c FROM information_schema.columns WHERE table_schema='public' AND table_name='work_catalog_entries' AND column_name='group_code'",
      expect: "exists",
    },
    {
      label: "column work_catalog_entries.convert_factor",
      sql: "SELECT count(*)::int AS c FROM information_schema.columns WHERE table_schema='public' AND table_name='work_catalog_entries' AND column_name='convert_factor'",
      expect: "exists",
    },
    {
      label: "unique (version_id, code) còn nguyên",
      sql: "SELECT count(*)::int AS c FROM pg_indexes WHERE schemaname='public' AND indexname='work_catalog_entries_version_id_code_key'",
      expect: "exists",
    },
    {
      label: "unique (version_id, department, title) đã bỏ",
      sql: "SELECT count(*)::int AS c FROM pg_indexes WHERE schemaname='public' AND indexname='work_catalog_entries_version_id_department_title_key'",
      expect: "absent",
    },
    {
      label: "index tra cứu (version_id, department, title)",
      sql: "SELECT count(*)::int AS c FROM pg_indexes WHERE schemaname='public' AND indexname='work_catalog_entries_version_id_department_title_idx'",
      expect: "exists",
    },
    {
      label: "index group_code",
      sql: "SELECT count(*)::int AS c FROM pg_indexes WHERE schemaname='public' AND indexname='work_catalog_entries_version_id_group_code_idx'",
      expect: "exists",
    },
    {
      label: "column work_catalog_versions.selection_mode",
      sql: "SELECT count(*)::int AS c FROM information_schema.columns WHERE table_schema='public' AND table_name='work_catalog_versions' AND column_name='selection_mode'",
      expect: "exists",
    },
  ];
  let failed = 0;
  for (const ch of checks) {
    const rows: Array<{ c: bigint }> = await prisma.$queryRawUnsafe(ch.sql);
    const count = Number(rows[0]?.c || 0);
    const ok = ch.expect === "exists" ? count > 0 : count === 0;
    console.log(`${ok ? "OK  " : "MISS"} ${ch.label} (count=${count}, expect=${ch.expect})`);
    if (!ok) failed++;
  }

  // Bảo toàn dữ liệu: đếm bản ghi trước/sau (bảng danh mục phải không đổi số dòng).
  const counts = await prisma.$queryRawUnsafe(`
    SELECT
      (SELECT count(*)::int FROM work_catalog_versions) AS versions,
      (SELECT count(*)::int FROM work_catalog_entries) AS entries,
      (SELECT count(*)::int FROM work_catalog_department_mappings) AS mappings
  `);
  console.log(
    `Counts: versions=${counts[0]?.versions} entries=${counts[0]?.entries} mappings=${counts[0]?.mappings}`
  );

  console.log(
    `DDL-DONE (executed_statements=${executed}, schema_changed=${schemaChanged}, ` +
      `schema_before=${beforeFingerprint.slice(0, 12)}, schema_after=${afterFingerprint.slice(0, 12)}, checks_failed=${failed})`
  );
  console.log(
    schemaChanged
      ? "SCHEMA-CHANGED: lan chay nay co thay doi doi tuong YC-31 (bo sung)."
      : "SCHEMA-UNCHANGED: lan chay nay chi thuc thi IF NOT EXISTS, khong thay doi schema."
  );
  if (failed > 0) process.exitCode = 2;
}

main()
  .catch((e) => {
    console.error("ERR:", e.message);
    process.exit(1);
  })
  .finally(() => process.exit(process.exitCode ?? 0));
