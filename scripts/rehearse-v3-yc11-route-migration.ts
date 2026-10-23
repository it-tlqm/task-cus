/**
 * Migration rehearsal YC-11 Phase 3 — additive `approval_route_snapshots`.
 * Apply -> verify -> rollback -> verify old data unchanged -> re-apply.
 * Chỉ chạy trên DB test cục bộ; không Production.
 */
import fs from "fs";
import path from "path";
import { createRequire } from "node:module";
import { assertLocalTestDatabase } from "./lib/test-db-safety";

const creq = createRequire(import.meta.url);
const { PrismaClient } = creq("@prisma/client");
const dbUrl = assertLocalTestDatabase(
  process.env.DIRECT_URL || process.env.DATABASE_URL || "",
  "rehearse-v3-yc11-route-migration"
);
process.env.DATABASE_URL = dbUrl;
process.env.DIRECT_URL = dbUrl;

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
const migrationPath = path.join(
  process.cwd(),
  "prisma",
  "migrations",
  "20261023190000_v3_approval_precheck_route",
  "migration.sql"
);
const rollbackPath = path.join(
  process.cwd(),
  "scripts",
  "sql",
  "v3_approval_precheck_route_rollback.sql"
);
const evidenceDir = path.join(process.cwd(), "docs", "evidence", "phase3");

function splitSql(sql: string): string[] {
  const withoutComments = sql.replace(/--[^\n]*/g, "");
  return withoutComments
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function executeFile(file: string) {
  const statements = splitSql(fs.readFileSync(file, "utf8"));
  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
  return statements.length;
}

async function counts() {
  return {
    tasks: await prisma.task.count(),
    approvalCases: await prisma.approvalCase.count(),
    approvalDecisions: await prisma.approvalDecision.count(),
    participantEvents: await prisma.taskParticipantEvent.count(),
    participantResults: await prisma.taskParticipantResult.count(),
    supervisions: await prisma.personSupervision.count(),
  };
}

async function schemaState() {
  const table = await prisma.$queryRawUnsafe<any[]>(
    `select to_regclass('approval_route_snapshots')::text as t`
  );
  if (!table[0]?.t) {
    return { exists: false, columns: [], indexes: [], checks: [] };
  }
  const columns = await prisma.$queryRawUnsafe<any[]>(
    `select column_name, data_type, is_nullable from information_schema.columns where table_name='approval_route_snapshots' order by ordinal_position`
  );
  const indexes = await prisma.$queryRawUnsafe<any[]>(
    `select indexname, indexdef from pg_indexes where tablename='approval_route_snapshots' order by indexname`
  );
  const checks = await prisma.$queryRawUnsafe<any[]>(
    `select conname, pg_get_constraintdef(oid) as def from pg_constraint where conrelid='approval_route_snapshots'::regclass and contype='c' order by conname`
  );
  return { exists: true, columns, indexes, checks };
}

async function main() {
  if (!fs.existsSync(evidenceDir)) fs.mkdirSync(evidenceDir, { recursive: true });
  const before = await counts();
  // Rehearsal có thể chạy lại: bắt đầu từ trạng thái chưa có bảng.
  // Chỉ drop bảng mới; không chạm dữ liệu Task/ApprovalCase/Event.
  await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "approval_route_snapshots" CASCADE');
  const appliedStatements = await executeFile(migrationPath);
  const afterApply = await schemaState();
  const afterApplyCounts = await counts();

  const rolledBackStatements = await executeFile(rollbackPath);
  const afterRollback = await schemaState();
  const afterRollbackCounts = await counts();

  const reappliedStatements = await executeFile(migrationPath);
  const afterReapply = await schemaState();

  const uniqueTaskRound = afterReapply.indexes.some(
    (x) => String(x.indexname).includes("task_id_round") && String(x.indexdef).includes("UNIQUE")
  );
  const routeStatusCheck = afterReapply.checks.some(
    (x) => String(x.conname).includes("route_status") && String(x.def).includes("READY")
  );
  const dataUnchanged =
    afterApplyCounts.tasks === before.tasks &&
    afterApplyCounts.approvalCases === before.approvalCases &&
    afterApplyCounts.approvalDecisions === before.approvalDecisions &&
    afterApplyCounts.participantEvents === before.participantEvents &&
    afterApplyCounts.participantResults === before.participantResults &&
    afterApplyCounts.supervisions === before.supervisions &&
    afterRollbackCounts.tasks === before.tasks &&
    afterRollbackCounts.approvalCases === before.approvalCases &&
    afterRollbackCounts.approvalDecisions === before.approvalDecisions &&
    afterRollbackCounts.participantEvents === before.participantEvents &&
    afterRollbackCounts.participantResults === before.participantResults &&
    afterRollbackCounts.supervisions === before.supervisions;

  const result = {
    suite: "YC-11 Phase 3 migration rehearsal",
    database: dbUrl,
    migration: "20261023190000_v3_approval_precheck_route",
    executedAt: new Date().toISOString(),
    apply: {
      statements: appliedStatements,
      tableExists: afterApply.exists,
      columns: afterApply.columns,
      indexes: afterApply.indexes,
      checks: afterApply.checks,
      uniqueTaskRound,
      routeStatusCheck,
    },
    rollback: {
      statements: rolledBackStatements,
      tableExists: afterRollback.exists,
    },
    reapply: {
      statements: reappliedStatements,
      tableExists: afterReapply.exists,
    },
    dataBefore: before,
    dataAfterApply: afterApplyCounts,
    dataAfterRollback: afterRollbackCounts,
    dataUnchanged,
    pass:
      afterApply.exists &&
      !afterRollback.exists &&
      afterReapply.exists &&
      uniqueTaskRound &&
      routeStatusCheck &&
      dataUnchanged,
    productionTouched: false,
  };

  fs.writeFileSync(
    path.join(evidenceDir, "MIGRATION_REHEARSAL_2026-10-24.json"),
    JSON.stringify(result, null, 2),
    "utf8"
  );

  console.log(JSON.stringify(result, null, 2));
  if (!result.pass) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
