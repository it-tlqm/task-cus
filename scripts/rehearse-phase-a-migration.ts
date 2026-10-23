/**
 * S1 — Diễn tập migration Phase A trên bản sao schema/dữ liệu kiểm thử.
 *
 * Kịch bản mô phỏng Production được dựng bằng `prisma db push` (không có
 * `_prisma_migrations`), trước khi Phase A được áp dụng:
 *   1. Clone DB kiểm thử sang DB rehearsal riêng.
 *   2. Bỏ unique index Phase A để mô phỏng schema trước release.
 *   3. Tạo cặp idempotency_key trùng (bản cũ/mới) + backup toàn bộ khóa.
 *   4. Áp migration.sql: dọn khóa cũ hơn về NULL, tạo unique index.
 *   5. Xác minh: giữ bản mới nhất, không mất dòng/nội dung, index hợp lệ, chặn trùng.
 *   6. Rollback (DROP INDEX): dữ liệu còn nguyên; khóa đã NULL không tự khôi phục.
 *   7. Áp lại migration lần 2: phải thành công (idempotent với IF NOT EXISTS).
 *
 * Chỉ chạy trên localhost và database tên talung_v3_*. Không kết nối Production.
 *
 * Chạy:
 *   $env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/talung_v3_phase_a_qa"
 *   $env:DIRECT_URL=$env:DATABASE_URL; $env:ALLOW_MIGRATION_REHEARSAL="1"
 *   npx tsx scripts/rehearse-phase-a-migration.ts
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { assertLocalTestDatabase } from "./lib/test-db-safety";

if (process.env.ALLOW_MIGRATION_REHEARSAL !== "1") {
  console.error("❌ TỪ CHỐI: đặt ALLOW_MIGRATION_REHEARSAL=1 để xác nhận diễn tập trên DB kiểm thử.");
  process.exit(1);
}

const sourceUrl = assertLocalTestDatabase(
  process.env.DIRECT_URL || process.env.DATABASE_URL || "",
  "rehearse-phase-a-migration"
);
const source = new URL(sourceUrl);
const sourceDb = source.pathname.replace(/^\/+/, "");
const rehearsalDb = `${sourceDb}_rehearsal`;
const pgBin =
  process.env.PG_BIN ||
  ["C:\\Program Files\\PostgreSQL\\17\\bin", "C:\\Program Files\\PostgreSQL\\16\\bin"].find((p) =>
    fs.existsSync(path.join(p, "psql.exe"))
  ) ||
  "";

if (!pgBin) throw new Error("Không tìm thấy PostgreSQL bin. Đặt PG_BIN.");

const psql = path.join(pgBin, "psql.exe");
const pgDump = path.join(pgBin, "pg_dump.exe");
const pgRestore = path.join(pgBin, "pg_restore.exe");
const env = { ...process.env, PGPASSWORD: decodeURIComponent(source.password) };
const rehearsalUrl = `${source.protocol}//${source.username}:${source.password}@${source.host}/${rehearsalDb}`;
const migrationFile = path.resolve("prisma/migrations/20261023120000_v3_phase_a_planning/migration.sql");

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];
function check(name: string, ok: boolean, detail = "") {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "[PASS]" : "[FAIL]"} ${name}${detail ? " — " + detail : ""}`);
  if (!ok) throw new Error(`Diễn tập thất bại: ${name}`);
}

function run(exe: string, args: string[], label: string) {
  try {
    return execFileSync(exe, args, { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error: any) {
    console.error(`LỖI ${label}:`, error?.stderr || error?.message);
    throw error;
  }
}

function psqlDb(dbName: string, sql: string, label: string) {
  return run(psql, ["-h", source.hostname, "-p", source.port || "5432", "-U", source.username, "-d", dbName, "-v", "ON_ERROR_STOP=1", "-c", sql], label);
}

async function snapshotContent(prisma: PrismaClient) {
  // Checksum toàn bộ nội dung trừ idempotency_key: bất kỳ thay đổi nội dung nào
  // ngoài khóa cũng làm checksum khác đi.
  const rows = await prisma.$queryRawUnsafe<Array<{ total: number; checksum: string }>>(
    `select count(*)::int as total,
            md5(coalesce(string_agg((to_jsonb(p) - 'idempotency_key')::text, ',' order by p.id), '')) as checksum
     from personal_work_items p`
  );
  return rows[0];
}

async function main() {
  const sourcePrisma = new PrismaClient({ datasources: { db: { url: sourceUrl } } });
  const sourceInfo = await sourcePrisma.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");
  console.log(`Nguồn: ${sourceInfo[0].db} → rehearsal: ${rehearsalDb}\n`);

  // 1. Clone bằng dump/restore (không cần ngắt kết nối DB nguồn).
  psqlDb("postgres", `DROP DATABASE IF EXISTS "${rehearsalDb}" WITH (FORCE);`, "drop rehearsal");
  psqlDb("postgres", `CREATE DATABASE "${rehearsalDb}";`, "create rehearsal");
  const dumpFile = path.join(os.tmpdir(), `talung-phase-a-${Date.now()}.dump`);
  run(pgDump, ["-h", source.hostname, "-p", source.port || "5432", "-U", source.username, "-d", sourceDb, "-Fc", "--no-owner", "--no-privileges", "-f", dumpFile], "pg_dump");
  run(pgRestore, ["-h", source.hostname, "-p", source.port || "5432", "-U", source.username, "-d", rehearsalDb, "--no-owner", "--no-privileges", dumpFile], "pg_restore");
  fs.unlinkSync(dumpFile);
  console.log("✓ Đã clone schema + dữ liệu sang DB rehearsal\n");

  const prisma = new PrismaClient({ datasources: { db: { url: rehearsalUrl } } });
  const database = await prisma.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");
  check("Clone đúng database rehearsal", database[0].db === rehearsalDb, database[0].db);

  // 2. Mô phỏng schema trước Phase A.
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "personal_work_items_person_idempotency_key"`);
  const indexBefore = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
    `select count(*)::int as n from pg_indexes where tablename='personal_work_items' and indexname='personal_work_items_person_idempotency_key'`
  );
  check("Đã mô phỏng schema trước Phase A (chưa có unique index)", indexBefore[0].n === 0, `${indexBefore[0].n} index`);

  // 3. Tạo cặp khóa trùng trên cùng một cán bộ; bản cũ hơn phải bị NULL hóa.
  const pair = await prisma.$queryRawUnsafe<Array<{ person_id: string; ids: string[] }>>(
    `select person_id, array_agg(id order by created_at asc, id asc) as ids
     from personal_work_items group by person_id having count(*) >= 2 order by count(*) desc limit 1`
  );
  check("Có cặp đầu việc cùng cán bộ để thử khóa trùng", pair.length === 1 && pair[0].ids.length >= 2, JSON.stringify(pair[0] || {}));
  const [olderId, newerId] = pair[0].ids;
  const dupKey = `qa-rehearsal-dup-${Date.now()}`;
  await prisma.$executeRawUnsafe(
    `UPDATE personal_work_items SET idempotency_key = $1, created_at = now() - interval '2 days' WHERE id = $2`,
    dupKey,
    olderId
  );
  await prisma.$executeRawUnsafe(
    `UPDATE personal_work_items SET idempotency_key = $1, created_at = now() - interval '1 day' WHERE id = $2`,
    dupKey,
    newerId
  );

  // Backup toàn bộ khóa trước khi migration NULL hóa.
  const keys = await prisma.$queryRawUnsafe<Array<{ id: string; person_id: string; idempotency_key: string; created_at: Date }>>(
    `select id, person_id, idempotency_key, created_at from personal_work_items where idempotency_key is not null order by created_at asc, id asc`
  );
  const backupDir = path.resolve("demo-ops/qa-migration");
  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `rehearsal-keys-before-${Date.now()}.json`);
  fs.writeFileSync(backupFile, JSON.stringify({ database: rehearsalDb, exportedAt: new Date().toISOString(), keys }, null, 2));
  const backupHash = crypto.createHash("sha256").update(fs.readFileSync(backupFile)).digest("hex");
  check("Đã backup idempotency key trước khi NULL hóa", keys.some((k) => k.idempotency_key === dupKey), `${keys.length} khóa, sha256=${backupHash.slice(0, 16)}…`);

  const before = await snapshotContent(prisma);
  console.log(`• Baseline: ${before.total} dòng, checksum=${before.checksum}\n`);

  // 4. Áp migration lần 1.
  run(psql, ["-h", source.hostname, "-p", source.port || "5432", "-U", source.username, "-d", rehearsalDb, "-v", "ON_ERROR_STOP=1", "-f", migrationFile], "apply migration #1");
  console.log("✓ Áp migration lần 1 thành công\n");

  const after = await snapshotContent(prisma);
  check("Không mất dòng nào sau migration", after.total === before.total, `${before.total} → ${after.total}`);
  check("Toàn bộ nội dung nghiệp vụ không đổi (trừ idempotency_key)", after.checksum === before.checksum, `${before.checksum} → ${after.checksum}`);

  const dupRows = await prisma.$queryRawUnsafe<Array<{ id: string; idempotency_key: string | null }>>(
    `select id, idempotency_key from personal_work_items where id in ($1, $2) order by created_at asc`,
    olderId,
    newerId
  );
  const olderRow = dupRows.find((r) => r.id === olderId);
  const newerRow = dupRows.find((r) => r.id === newerId);
  check("Bản ghi cũ hơn bị đặt idempotency_key = NULL", olderRow?.idempotency_key === null, String(olderRow?.idempotency_key));
  check("Bản ghi mới nhất giữ nguyên idempotency_key", newerRow?.idempotency_key === dupKey, String(newerRow?.idempotency_key));

  const indexAfter = await prisma.$queryRawUnsafe<Array<{ indisvalid: boolean; n: number }>>(
    `select i.indisvalid, count(*) over ()::int as n
     from pg_index i join pg_class c on c.oid=i.indexrelid
     where c.relname='personal_work_items_person_idempotency_key'`
  );
  check("Unique index tồn tại và hợp lệ", indexAfter.length === 1 && indexAfter[0].indisvalid === true, JSON.stringify(indexAfter));

  let duplicateBlocked = false;
  let duplicateError = "";
  try {
    // olderId đang NULL; gán lại đúng khóa của newerId phải vi phạm unique index.
    await prisma.$executeRawUnsafe(
      `UPDATE personal_work_items SET idempotency_key = $1 WHERE id = $2`,
      dupKey,
      olderId
    );
  } catch (error: any) {
    duplicateError = String(error?.message || error);
    duplicateBlocked = /unique|duplicate|constraint|23505/i.test(duplicateError);
  }
  check("Unique index chặn ghi trùng (person, idempotency_key)", duplicateBlocked, duplicateError.slice(0, 240));

  // 5. Rollback: chỉ bỏ index, không xóa dữ liệu.
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "personal_work_items_person_idempotency_key"`);
  const afterRollback = await snapshotContent(prisma);
  check("Rollback giữ nguyên số dòng", afterRollback.total === before.total, `${afterRollback.total}`);
  check("Rollback giữ nguyên nội dung nghiệp vụ", afterRollback.checksum === before.checksum, `${afterRollback.checksum}`);
  const rollbackKey = await prisma.$queryRawUnsafe<Array<{ idempotency_key: string | null }>>(
    `select idempotency_key from personal_work_items where id = $1`,
    olderId
  );
  check("Khóa đã NULL không tự khôi phục sau rollback (đúng tài liệu)", rollbackKey[0]?.idempotency_key === null, String(rollbackKey[0]?.idempotency_key));

  // 6. Áp lại lần 2 — kiểm tra idempotent.
  run(psql, ["-h", source.hostname, "-p", source.port || "5432", "-U", source.username, "-d", rehearsalDb, "-v", "ON_ERROR_STOP=1", "-f", migrationFile], "apply migration #2");
  const indexSecond = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
    `select count(*)::int as n from pg_indexes where tablename='personal_work_items' and indexname='personal_work_items_person_idempotency_key'`
  );
  check("Áp lại migration lần 2 thành công (IF NOT EXISTS)", indexSecond[0].n === 1, `${indexSecond[0].n} index`);

  const evidence = {
    generatedAt: new Date().toISOString(),
    sourceDb,
    rehearsalDb,
    migrationFile,
    backupFile,
    backupSha256: backupHash,
    baseline: before,
    afterMigration: after,
    afterRollback,
    checks,
    productionTouched: false,
  };
  const evidenceFile = path.join(backupDir, `rehearsal-evidence-${Date.now()}.json`);
  fs.writeFileSync(evidenceFile, JSON.stringify(evidence, null, 2));
  console.log(`\n=== KẾT QUẢ: ${checks.filter((c) => c.ok).length}/${checks.length} PASS ===`);
  console.log(`Evidence: ${evidenceFile}`);
  console.log(`DB rehearsal giữ lại để S0 kiểm tra: ${rehearsalDb}`);

  await prisma.$disconnect();
  await sourcePrisma.$disconnect();
}

main().catch(async (error) => {
  console.error("\nLỖI DIỄN TẬP:", error?.message);
  process.exitCode = 1;
});
