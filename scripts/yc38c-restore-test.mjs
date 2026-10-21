/**
 * yc38c-restore-test.mjs — RESTORE-TEST cho backup YC-38C.
 *
 *   node scripts/yc38c-restore-test.mjs <backupFile> [localDbUrl]
 *
 * 3 lớp kiểm tra:
 *   1) Cấu trúc file backup: JSON hợp lệ, mọi bảng khớp `counts`.
 *   2) Đối chiếu count với DB nguồn (phát hiện trôi dữ liệu sau backup).
 *   3) NẠP LẠI thật vào DB LOCAL scratch rồi đọc lại → chứng minh khôi phục được,
 *      kèm kiểm tra tính toàn vẹn tham chiếu (FK) trên tập bảng đã backup.
 *
 * Quy tắc: KHÔNG ghi vào DB nguồn. DB đích phải là LOCAL (127.0.0.1/localhost).
 */
import { createRequire } from "node:module";
import fs from "fs";
const REPO = "D:/thanhnx/OpenCode/talung-cus-work";
const require = createRequire(`${REPO}/package.json`);
const { PrismaClient, Prisma } = require("@prisma/client");

const backupFile = process.argv[2];
const localUrl =
  process.argv[3] || "postgresql://postgres:postgres@127.0.0.1:5432/talung_yc38_restore";
if (!backupFile) {
  console.error("usage: node scripts/yc38c-restore-test.mjs <backupFile> [localDbUrl]");
  process.exit(2);
}
if (!/127\.0\.0\.1|localhost/.test(localUrl)) {
  console.error("TU CHOI: DB dich phai la LOCAL (127.0.0.1/localhost). Khong ghi vao DB nguon.");
  process.exit(2);
}

let failed = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`[PASS] ${name}${detail ? " - " + detail : ""}`);
  else {
    failed++;
    console.log(`[FAIL] ${name}${detail ? " - " + detail : ""}`);
  }
};

/** Quan hệ FK cần kiểm tra toàn vẹn (model con → model cha) */
const FK_CHECKS = [
  ["PersonalWorkItem", "PlanItem", "planItemId"],
  ["PersonalWorkItem", "Task", "taskId"],
  ["PersonalWorkItem", "Person", "personId"],
  ["PersonalWorkItem", "ActivityTemplate", "templateId"],
  ["MonthlyWorkResult", "Person", "personId"],
  ["MonthlyWorkResult", "PersonalWorkItem", "workItemId"],
  ["PlanTaskLink", "PlanItem", "planItemId"],
  ["PlanTaskLink", "Task", "taskId"],
  ["TaskAssignee", "Task", "taskId"],
  ["RoutineEntry", "Person", "personId"],
  ["WorkCatalogEntry", "WorkCatalogVersion", "versionId"],
  ["ProductItem", "ProductCatalogVersion", "versionId"],
  ["ActivityTemplate", "ActivityGroup", "groupId"],
];

async function main() {
  // ---------- Lớp 1: cấu trúc file
  const backup = JSON.parse(fs.readFileSync(backupFile, "utf8"));
  check("Backup là JSON hợp lệ", !!backup?.data && !!backup?.counts);
  const mismatched = Object.entries(backup.counts).filter(
    ([t, n]) => !Array.isArray(backup.data[t]) || backup.data[t].length !== n
  );
  check(
    "Mọi bảng: số bản ghi khớp `counts`",
    mismatched.length === 0,
    mismatched.map(([t, n]) => `${t}:${n}`).join(",")
  );
  check("Có mốc thời gian backup", !!backup.backupAt, backup.backupAt);

  // ---------- Lớp 2: đối chiếu DB nguồn
  // Bảng chỉ-ghi (append-only) được phép dồn số dòng → báo cáo, không coi là trôi dữ liệu.
  const APPEND_ONLY = new Set(["AuditEvent", "Notification"]);
  const srcUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
  const src = new PrismaClient({ datasources: { db: { url: srcUrl } } });
  const drift = [];
  const appendOnlyDrift = [];
  for (const model of Object.keys(backup.counts)) {
    const live = await src[model].count();
    if (live === backup.counts[model]) continue;
    const msg = `${model}: backup=${backup.counts[model]} live=${live}`;
    if (APPEND_ONLY.has(model)) appendOnlyDrift.push(msg);
    else drift.push(msg);
  }
  check(
    "Count DB nguồn khớp backup (không trôi dữ liệu nghiệp vụ)",
    drift.length === 0,
    drift.join(" | ")
  );
  if (appendOnlyDrift.length) {
    console.log(`[INFO] Bảng chỉ-ghi đã dồn thêm (bình thường): ${appendOnlyDrift.join(" | ")}`);
  }
  await src.$disconnect();

  // ---------- Lớp 3: nạp lại thật vào DB local scratch
  const dst = new PrismaClient({ datasources: { db: { url: localUrl } } });
  const models = Object.keys(backup.counts);
  let restored = 0;
  const failedTables = [];
  const totalRows = Object.values(backup.counts).reduce((a, b) => a + b, 0);

  // Một transaction = một connection ⇒ session_replication_role áp dụng cho toàn bộ
  await dst.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL session_replication_role = replica");
      for (const model of models) {
        const rows = backup.data[model];
        if (!rows.length) continue;
        try {
          await tx[model].deleteMany({});
          const chunk = 200;
          for (let i = 0; i < rows.length; i += chunk) {
            await tx[model].createMany({ data: rows.slice(i, i + chunk), skipDuplicates: true });
          }
          const n = await tx[model].count();
          if (n === rows.length) restored++;
          else failedTables.push(`${model}(${n}/${rows.length})`);
        } catch (e) {
          failedTables.push(`${model}(${String(e.message).split("\n").pop().slice(0, 70)})`);
        }
      }
    },
    { timeout: 900000, maxWait: 60000 }
  );
  check(
    "Nạp lại được vào DB local scratch",
    failedTables.length === 0,
    failedTables.join(", ")
  );
  console.log(`  bảng khôi phục đầy đủ: ${restored}/${models.length} · tổng bản ghi: ${totalRows}`);

  // ---------- Kiểm tra toàn vẹn tham chiếu trên DB vừa khôi phục
  // Dùng DMMF để map tên field Prisma -> tên cột thật trong DB.
  const MODEL_BY_NAME = Object.fromEntries(
    Prisma.dmmf.datamodel.models.map((m) => [m.name, m])
  );
  const tableOf = (model) => MODEL_BY_NAME[model]?.dbName || model;
  const colOf = (model, field) => {
    const f = MODEL_BY_NAME[model]?.fields.find((x) => x.name === field);
    return f?.dbName || field;
  };
  const orphans = [];
  for (const [child, parent, fk] of FK_CHECKS) {
    const ct = tableOf(child);
    const pt = tableOf(parent);
    const cc = colOf(child, fk);
    try {
      const rows = await dst.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS n FROM "${ct}" c
         WHERE c."${cc}" IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM "${pt}" p WHERE p.id = c."${cc}")`
      );
      if (rows[0].n > 0) orphans.push(`${ct}.${cc}->${pt}:${rows[0].n}`);
    } catch (e) {
      orphans.push(`${ct}.${cc}: ${String(e.message).split("\n").pop().slice(0, 50)}`);
    }
  }
  check("Không có tham chiếu mồ côi (FK) sau khi khôi phục", orphans.length === 0, orphans.join(", "));

  // Đọc lại vài dòng để chứng minh dữ liệu dùng được
  const sample = await dst.personalWorkItem.count();
  const sampleTx = await dst.workCatalogEntry.count();
  const sampleMr = await dst.monthlyWorkResult.count();
  console.log(`  đọc lại: personal_work_items=${sample} work_catalog_entries=${sampleTx} monthly_work_results=${sampleMr}`);

  await dst.$disconnect();
  console.log(`\n${failed === 0 ? "RESTORE-TEST PASS" : "RESTORE-TEST FAIL"}`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
