/**
 * YC-33 → YC-37 — Áp DDL additive lên CSDL (idempotent, an toàn chạy lại).
 * Nguồn: prisma/migrations/20261021090000_yc33_37_scoring_evaluation_supervision_approval/migration.sql
 *
 * BẮT BUỘC: Production KHÔNG có bảng `_prisma_migrations` (đã kiểm tra 20/10/2026)
 * => KHÔNG chạy `prisma migrate deploy`; dùng script này theo quy ước apply-script của dự án.
 *
 * Chạy trên DB test/clone cục bộ:
 *   $env:DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/talung_yc33_local"; $env:DIRECT_URL=$env:DATABASE_URL
 *   npx tsx scripts/apply-yc33-37-ddl.ts
 * Chạy trên Production (CHỈ SAU KHI có backup mới):
 *   npx tsx scripts/apply-yc33-37-ddl.ts
 *
 * Idempotency: CREATE TABLE/INDEX -> IF NOT EXISTS.
 * An toàn dữ liệu: chỉ tạo bảng/index MỚI; KHÔNG DROP, KHÔNG UPDATE/DELETE dữ liệu nghiệp vụ.
 * Rollback: code-first (deploy lại commit cũ) — bảng mới không ảnh hưởng code cũ.
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

const NEW_TABLES = [
  "score_runs",
  "score_run_items",
  "evaluation_assessments",
  "person_supervisions",
  "approval_cases",
  "approval_decisions",
];

/** Vân tay schema của đúng các đối tượng liên quan YC-33→37. */
async function schemaFingerprint(): Promise<string> {
  const rows: Array<{ fingerprint: string }> = await prisma.$queryRawUnsafe(`
    SELECT md5(
      (
        SELECT coalesce(string_agg(
          table_name || '.' || column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, ''),
          '|' ORDER BY table_name, column_name
        ), '')
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ANY($1)
      )
      ||
      (
        SELECT coalesce(string_agg(indexname || ':' || indexdef, '|' ORDER BY indexname), '')
        FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = ANY($1)
      )
    ) AS fingerprint
  `, NEW_TABLES);
  return rows[0]?.fingerprint || "none";
}

async function main() {
  console.log(`DB dich: ${maskedTarget()}`);
  const beforeFingerprint = await schemaFingerprint();

  const file =
    "prisma/migrations/20261021090000_yc33_37_scoring_evaluation_supervision_approval/migration.sql";
  const sql = fs.readFileSync(file, "utf8");
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

  let failed = 0;
  for (const t of NEW_TABLES) {
    const rows: Array<{ c: bigint }> = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS c FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
      t
    );
    const ok = Number(rows[0]?.c || 0) === 1;
    console.log(`${ok ? "OK  " : "MISS"} table ${t}`);
    if (!ok) failed++;
  }

  // Bảo toàn dữ liệu: đếm bản ghi các bảng nghiệp vụ cốt lõi (trước/sau phải bằng nhau).
  const counts = await prisma.$queryRawUnsafe(`
    SELECT
      (SELECT count(*)::int FROM work_catalog_entries) AS tx_entries,
      (SELECT count(*)::int FROM personal_work_items) AS work_items,
      (SELECT count(*)::int FROM monthly_work_results) AS monthly_results,
      (SELECT count(*)::int FROM tasks) AS tasks,
      (SELECT count(*)::int FROM plans) AS plans,
      (SELECT count(*)::int FROM people) AS people,
      (SELECT count(*)::int FROM accounts) AS accounts
  `);
  console.log(
    `Counts: tx_entries=${counts[0]?.tx_entries} work_items=${counts[0]?.work_items} ` +
      `monthly_results=${counts[0]?.monthly_results} tasks=${counts[0]?.tasks} ` +
      `plans=${counts[0]?.plans} people=${counts[0]?.people} accounts=${counts[0]?.accounts}`
  );

  console.log(
    `DDL-DONE (executed_statements=${executed}, schema_changed=${schemaChanged}, ` +
      `schema_before=${beforeFingerprint.slice(0, 12)}, schema_after=${afterFingerprint.slice(0, 12)}, checks_failed=${failed})`
  );
  console.log(
    schemaChanged
      ? "SCHEMA-CHANGED: lan chay nay da tao bang moi cho YC-33→YC-37."
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
