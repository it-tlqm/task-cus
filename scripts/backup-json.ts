/** Backup JSON toàn DB trước thao tác hủy dữ liệu. Chạy: npx tsx scripts/backup-json.ts */
import { PrismaClient } from "@prisma/client";
import fs from "fs";

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
});

const TABLES = [
  "organization", "orgUnit", "position", "person", "personAssignment",
  "account", "role", "permission", "rolePermission", "roleGrant",
  "activityGroup", "activityTemplate", "activityTemplateVersion", "formTemplate", "formTemplateVersion",
  "reportingPeriod", "plan", "planItem", "personalWorkItem",
  "task", "planTaskLink", "taskAssignee", "taskUpdate", "deadlineRequest", "taskAttachment",
  "routineEntry", "resultSubmission", "submissionValue",
  "auditEvent", "notification", "reportSnapshot", "systemConfig",
];

async function main() {
  const dump: Record<string, unknown> = { backupAt: new Date().toISOString(), tables: {} };
  for (const t of TABLES) {
    const model = (prisma as any)[t];
    if (!model) {
      console.log(`[SKIP] model ${t} không tồn tại trong client`);
      continue;
    }
    const rows = await model.findMany({});
    (dump.tables as any)[t] = rows;
    console.log(`[OK] ${t}: ${rows.length} rows`);
  }
  const name = `backup-real-run-${new Date().toISOString().slice(0, 10)}.json`;
  fs.writeFileSync(name, JSON.stringify(dump));
  console.log(`Đã ghi ${name} (${(fs.statSync(name).size / 1024).toFixed(1)} KB)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
