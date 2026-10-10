import { PrismaClient } from "@prisma/client";
import { execSync } from "child_process";

async function verifyFreshMigration() {
  console.log("=== KIỂM TRA TẠO CSDL POSTGRESQL MỚI TỪ TOÀN BỘ MIGRATIONS ===");
  const testDbName = "talung_fresh_migration_test";
  const defaultUrl = "postgresql://postgres:postgres@localhost:5432/postgres?schema=public";
  const testDbUrl = `postgresql://postgres:postgres@localhost:5432/${testDbName}?schema=public`;

  const adminPrisma = new PrismaClient({
    datasources: { db: { url: defaultUrl } },
  });

  try {
    // Drop old test db if exists
    await adminPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${testDbName}" WITH (FORCE);`);
    await adminPrisma.$executeRawUnsafe(`CREATE DATABASE "${testDbName}";`);
    console.log(`✓ Đã tạo CSDL thử nghiệm độc lập: ${testDbName}`);
  } finally {
    await adminPrisma.$disconnect();
  }

  try {
    // Run prisma migrate deploy with test database URL
    console.log("Chạy 'prisma migrate deploy' trên CSDL mới...");
    execSync(`npx prisma migrate deploy`, {
      env: { ...process.env, DATABASE_URL: testDbUrl },
      stdio: "pipe",
    });
    console.log("✓ 'prisma migrate deploy' chạy thành công 100%!");

    // Verify tables in the new database using PrismaClient
    const testPrisma = new PrismaClient({
      datasources: { db: { url: testDbUrl } },
    });

    const res: any = await testPrisma.$queryRawUnsafe(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    const tables: string[] = res.map((r: any) => r.table_name);
    console.log(`Tổng số bảng được tạo: ${tables.length}`);

    // Verify key tables exist
    const requiredTables = [
      "system_configs",
      "report_snapshots",
      "notifications",
      "accounts",
      "roles",
      "permissions",
      "people",
      "org_units",
      "activity_templates",
      "personal_work_items",
      "plans",
      "tasks",
    ];

    const missing = requiredTables.filter((t) => !tables.includes(t));
    if (missing.length > 0) {
      throw new Error(`CSDL mới bị thiếu các bảng quan trọng: ${missing.join(", ")}`);
    }

    console.log("✅ Toàn bộ các bảng quan trọng (kể cả system_configs, report_snapshots, notifications) đều được tạo thành công!");
    await testPrisma.$disconnect();
  } finally {
    // Cleanup test database
    const cleanupPrisma = new PrismaClient({
      datasources: { db: { url: defaultUrl } },
    });
    try {
      await cleanupPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${testDbName}" WITH (FORCE);`);
      console.log(`✓ Đã dọn dẹp và xóa CSDL thử nghiệm: ${testDbName}`);
    } finally {
      await cleanupPrisma.$disconnect();
    }
  }
}

verifyFreshMigration().catch((err) => {
  console.error("❌ Thất bại khi kiểm tra migration CSDL mới:", err);
  process.exit(1);
});
