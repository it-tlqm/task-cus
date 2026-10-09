import { execSync } from "child_process";
import { PrismaClient } from "@prisma/client";

const PSQL_BIN = `"C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe"`;
const TEST_DB_NAME = "talung_test_clean_db";
const TEST_DB_URL = `postgresql://postgres:postgres@localhost:5432/${TEST_DB_NAME}?schema=public`;

async function testCleanMigration() {
  console.log("==========================================================");
  console.log(" KIỂM THỬ PRISMA MIGRATION TRÊN DATABASE THỬ NGHIỆM SẠCH ");
  console.log("==========================================================\n");

  try {
    // 1. Tạo database test bằng psql
    console.log("1. Kết nối PostgreSQL và tạo database thử nghiệm mới...");
    execSync(
      `${PSQL_BIN} -U postgres -h localhost -p 5432 -c "DROP DATABASE IF EXISTS ${TEST_DB_NAME};" postgres`,
      { env: { ...process.env, PGPASSWORD: "postgres" }, encoding: "utf8" }
    );
    execSync(
      `${PSQL_BIN} -U postgres -h localhost -p 5432 -c "CREATE DATABASE ${TEST_DB_NAME};" postgres`,
      { env: { ...process.env, PGPASSWORD: "postgres" }, encoding: "utf8" }
    );
    console.log(`   ✓ Đã tạo mới cơ sở dữ liệu: "${TEST_DB_NAME}".`);

    // 2. Chạy prisma migrate deploy trên database mới
    console.log("\n2. Thực hiện 'prisma migrate deploy' trên database sạch...");
    const migrateOutput = execSync("pnpm exec prisma migrate deploy", {
      env: { ...process.env, DATABASE_URL: TEST_DB_URL },
      encoding: "utf8",
    });
    console.log(`   ${migrateOutput.trim().replace(/\n/g, "\n   ")}`);

    // 3. Kết nối kiểm tra bằng PrismaClient
    console.log("\n3. Kết nối PrismaClient tới database mới và kiểm tra schema...");
    const testPrisma = new PrismaClient({
      datasources: { db: { url: TEST_DB_URL } },
    });

    await testPrisma.$connect();

    // Query kiểm tra bảng
    const tables: any = await testPrisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `;

    const tableNames = tables.map((t: any) => t.table_name);
    console.log(`   ✓ Số lượng bảng đã sinh ra: ${tableNames.length} bảng.`);

    const requiredTables = [
      "_prisma_migrations",
      "accounts",
      "activity_groups",
      "activity_templates",
      "audit_events",
      "deadline_requests",
      "org_units",
      "people",
      "personal_work_items",
      "plan_items",
      "plan_task_links",
      "plans",
      "reporting_periods",
      "task_assignees",
      "task_updates",
      "tasks",
    ];

    for (const reqTable of requiredTables) {
      if (!tableNames.includes(reqTable)) {
        throw new Error(`Thiếu bảng bắt buộc: ${reqTable}`);
      }
    }
    console.log(`   [PASS] Toàn bộ ${requiredTables.length} bảng bắt buộc đều hiện diện chính xác!`);

    await testPrisma.$disconnect();

    // 4. Xóa database test
    console.log("\n4. Dọn dẹp cơ sở dữ liệu thử nghiệm...");
    execSync(
      `${PSQL_BIN} -U postgres -h localhost -p 5432 -c "DROP DATABASE ${TEST_DB_NAME};" postgres`,
      { env: { ...process.env, PGPASSWORD: "postgres" }, encoding: "utf8" }
    );
    console.log(`   ✓ Đã xóa database "${TEST_DB_NAME}".`);

    console.log("\n----------------------------------------------------------");
    console.log("KẾT LUẬN: MIGRATION 0_INIT TRIỂN KHAI THÀNH CÔNG TỪ CON SỐ 0!");
    console.log("----------------------------------------------------------");
  } catch (err: any) {
    console.error("\n[FAIL] Lỗi kiểm thử clean migration:", err.message);
    process.exit(1);
  }
}

testCleanMigration();
