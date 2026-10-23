/**
 * Kiểm tra schema YC-10 trên DB test cục bộ (không ghi dữ liệu nghiệp vụ).
 * Dùng cho rehearsal apply/rollback/re-apply.
 *
 *   npx tsx scripts/verify-v3-yc10-schema.ts applied
 *   npx tsx scripts/verify-v3-yc10-schema.ts rolledback
 */
import { createRequire } from "node:module";
import { assertLocalTestDatabase } from "./lib/test-db-safety";

const creq = createRequire(import.meta.url);
const { PrismaClient } = creq("@prisma/client");
const dbUrl = assertLocalTestDatabase(
  process.env.DIRECT_URL || process.env.DATABASE_URL || "",
  "verify-v3-yc10-schema"
);
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
const expect = (process.argv[2] || "applied").toLowerCase();

(async () => {
  const col: any[] = await prisma.$queryRawUnsafe(
    `select column_name, data_type, is_nullable from information_schema.columns where table_name='approval_decisions' and column_name='quality_percent'`
  );
  const table: any[] = await prisma.$queryRawUnsafe(
    `select table_name from information_schema.tables where table_schema='public' and table_name='approval_quality_adjustments'`
  );
  const checks: any[] = table.length
    ? await prisma.$queryRawUnsafe(
        `select conname from pg_constraint where conrelid='approval_quality_adjustments'::regclass and contype in ('c','f','u') order by conname`
      )
    : [];
  const indexes: any[] = table.length
    ? await prisma.$queryRawUnsafe(
        `select indexname from pg_indexes where tablename='approval_quality_adjustments' order by indexname`
      )
    : [];
  const decisionCount: any[] = await prisma.$queryRawUnsafe(
    `select count(*)::int as n from approval_decisions`
  );
  const nullQualityCount: any[] = col.length
    ? await prisma.$queryRawUnsafe(
        `select count(*)::int as n from approval_decisions where quality_percent is null`
      )
    : [{ n: null }];

  const result = {
    checkedAt: new Date().toISOString(),
    database: new URL(dbUrl).pathname.replace(/^\/+/, ""),
    expectation: expect,
    column: col[0] ?? null,
    table: table[0] ?? null,
    checks: checks.map((c) => c.conname),
    indexes: indexes.map((i) => i.indexname),
    decisions: decisionCount[0]?.n ?? null,
    decisionsWithNullQuality: nullQualityCount[0]?.n ?? null,
  };
  console.log(JSON.stringify(result, null, 2));

  const ok =
    expect === "applied"
      ? col.length === 1 &&
        col[0].data_type === "integer" &&
        col[0].is_nullable === "YES" &&
        table.length === 1 &&
        checks.length >= 4 &&
        indexes.some((i) => i.indexname.includes("decision_id_revision"))
      : expect === "rolledback"
        ? col.length === 0 && table.length === 0
        : false;
  await prisma.$disconnect();
  if (!ok) {
    console.error(`SCHEMA MISMATCH for expectation=${expect}`);
    process.exitCode = 1;
  }
})().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exitCode = 1;
});
