/**
 * S1 — Tạo fixture riêng cho kiểm thử YC-23/25 (trưởng bộ phận A/B).
 *
 * Lý do: bộ test `test-yc23-25-api.ts` cần tài khoản DEPARTMENT_LEADER cho hai
 * bộ phận A/B, nhưng mật khẩu các tài khoản cb001/cb002 không thuộc fixture của
 * worktree QA. Không đổi mật khẩu tài khoản cán bộ thật; thay vào đó tạo tài khoản
 * DEMO riêng, chỉ trên database kiểm thử cục bộ.
 *
 * An toàn:
 *  - Chỉ chạy khi QA_FIXTURE_SETUP=1 và DB localhost thuộc talung_v3_*.
 *  - Không tạo PersonSupervision (không làm thay đổi tuyến xác nhận công việc).
 *  - Idempotent: chạy lại chỉ cập nhật đúng hai tài khoản fixture.
 *
 * Chạy:
 *   $env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/talung_v3_phase_a_qa"
 *   $env:DIRECT_URL=$env:DATABASE_URL; $env:QA_FIXTURE_SETUP="1"
 *   npx tsx scripts/setup-phase-a-qa-fixtures.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { assertLocalTestDatabase } from "./lib/test-db-safety";

if (process.env.QA_FIXTURE_SETUP !== "1") {
  console.error("❌ TỪ CHỐI: đặt QA_FIXTURE_SETUP=1 để xác nhận đây là database kiểm thử.");
  process.exit(1);
}

const dbUrl = assertLocalTestDatabase(
  process.env.DIRECT_URL || process.env.DATABASE_URL || "",
  "setup-phase-a-qa-fixtures"
);
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
const PASSWORD = process.env.QA_FIXTURE_PASSWORD || "LocalTest@2026";

const FIXTURES = [
  {
    username: "demolda01",
    personCode: "DEMO-QA-LD-A",
    fullName: "Lãnh đạo QA bộ phận A (thử nghiệm)",
    unitCode: "BP_NGHIEPVU_A",
  },
  {
    username: "demoldb01",
    personCode: "DEMO-QA-LD-B",
    fullName: "Lãnh đạo QA bộ phận B (thử nghiệm)",
    unitCode: "BP_GIAMSAT_B",
  },
];

async function main() {
  const role = await prisma.role.findUnique({ where: { code: "DEPARTMENT_LEADER" } });
  if (!role) throw new Error("Không tìm thấy role DEPARTMENT_LEADER trong DB kiểm thử");

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  for (const fixture of FIXTURES) {
    const unit = await prisma.orgUnit.findUnique({ where: { code: fixture.unitCode } });
    if (!unit) throw new Error(`Không tìm thấy đơn vị ${fixture.unitCode}`);

    const person = await prisma.person.upsert({
      where: { code: fixture.personCode },
      update: { fullName: fixture.fullName, status: "ACTIVE" },
      create: { code: fixture.personCode, fullName: fixture.fullName, status: "ACTIVE" },
    });

    // Chỉ giữ một assignment chính cho đúng đơn vị fixture.
    await prisma.personAssignment.deleteMany({ where: { personId: person.id } });
    await prisma.personAssignment.create({
      data: { personId: person.id, unitId: unit.id, isPrimary: true },
    });

    const account = await prisma.account.upsert({
      where: { username: fixture.username },
      update: { personId: person.id, passwordHash, status: "ACTIVE", mustChangePassword: false },
      create: {
        username: fixture.username,
        passwordHash,
        personId: person.id,
        status: "ACTIVE",
        mustChangePassword: false,
      },
    });

    await prisma.roleGrant.deleteMany({
      where: { accountId: account.id, roleId: role.id },
    });
    await prisma.roleGrant.create({
      data: {
        accountId: account.id,
        roleId: role.id,
        scopeType: "DEPARTMENT",
        scopeUnitId: unit.id,
      },
    });

    console.log(`✓ ${fixture.username} — DEPARTMENT_LEADER @ ${fixture.unitCode}`);
  }
  console.log("✓ Fixture QA sẵn sàng (mật khẩu test cục bộ, không in ra log).");
}

main()
  .catch((error) => {
    console.error("LỖI fixture:", error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
