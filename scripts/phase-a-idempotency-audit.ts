/**
 * Phase A — audit/backup idempotency key TRƯỚC khi NULL hóa hoặc tạo unique index.
 *
 * Chỉ ĐỌC dữ liệu, không sửa. Xuất bản sao khóa hiện có ra demo-ops/qa-migration/
 * (thư mục local, đã gitignore) để có thể đối chiếu/khôi phục nếu cần.
 *
 * Chạy trên DB kiểm thử:
 *   $env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/talung_v3_phase_a_qa"
 *   $env:DIRECT_URL=$env:DATABASE_URL
 *   npx tsx scripts/phase-a-idempotency-audit.ts
 *
 * Chạy read-only trên môi trường khác (nếu được cấp quyền):
 *   $env:DATABASE_URL="<read-only-url>"; $env:PHASE_A_AUDIT_CONFIRM="1"
 *   npx tsx scripts/phase-a-idempotency-audit.ts
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const dbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL || "";
if (!dbUrl) throw new Error("Thiếu DATABASE_URL/DIRECT_URL");
if (!dbUrl.includes("localhost") && !dbUrl.includes("127.0.0.1") && process.env.PHASE_A_AUDIT_CONFIRM !== "1") {
  throw new Error("TỪ CHỐI: DB không phải localhost. Đặt PHASE_A_AUDIT_CONFIRM=1 nếu đã được cấp quyền read-only.");
}

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

type KeyRow = {
  id: string;
  person_id: string;
  idempotency_key: string;
  created_at: Date;
};

async function main() {
  const database = await prisma.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");
  const summary = await prisma.$queryRawUnsafe<
    Array<{ total: number; with_key: number; distinct_pairs: number }>
  >(
    `select count(*)::int as total,
            count(idempotency_key)::int as with_key,
            (count(distinct (person_id, idempotency_key)) filter (where idempotency_key is not null))::int as distinct_pairs
     from personal_work_items`
  );
  const duplicates = await prisma.$queryRawUnsafe<
    Array<{ person_id: string; idempotency_key: string; copies: number }>
  >(
    `select person_id, idempotency_key, count(*)::int as copies
     from personal_work_items
     where idempotency_key is not null
     group by person_id, idempotency_key
     having count(*) > 1
     order by copies desc, person_id`
  );
  const rows = await prisma.$queryRawUnsafe<KeyRow[]>(
    `select id, person_id, idempotency_key, created_at
     from personal_work_items
     where idempotency_key is not null
     order by created_at asc, id asc`
  );

  const outDir = path.resolve("demo-ops/qa-migration");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = path.join(outDir, `phase-a-idempotency-keys-${stamp}.json`);
  const payload = {
    generatedAt: new Date().toISOString(),
    database: database[0]?.db,
    summary: summary[0],
    duplicates,
    keys: rows,
  };
  const text = JSON.stringify(payload, null, 2);
  fs.writeFileSync(outFile, text, "utf8");
  const sha256 = crypto.createHash("sha256").update(text, "utf8").digest("hex");

  console.log(`DB: ${database[0]?.db}`);
  console.log(`Tổng đầu việc: ${summary[0].total}`);
  console.log(`Có idempotency_key: ${summary[0].with_key}`);
  console.log(`Cặp (person, key) phân biệt: ${summary[0].distinct_pairs}`);
  console.log(`Nhóm trùng: ${duplicates.length}`);
  if (duplicates.length > 0) {
    for (const d of duplicates) console.log(`  - person=${d.person_id} key=${d.idempotency_key} copies=${d.copies}`);
  }
  console.log(`Backup: ${outFile}`);
  console.log(`SHA256: ${sha256}`);
  console.log(duplicates.length === 0 ? "KẾT LUẬN: không có khóa trùng — có thể tạo unique index." : "KẾT LUẬN: CÓ khóa trùng — phải backup và dọn trước khi tạo unique index.");
}

main()
  .catch((e) => {
    console.error("LỖI audit:", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
