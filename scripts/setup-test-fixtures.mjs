/**
 * setup-test-fixtures.mjs — DB KIỂM THỬ độc lập (tách khỏi môi trường sạch):
 *   copy môi trường sạch (talung_v3_rehearsal) + tài khoản THỬ NGHIỆM + quan hệ lãnh đạo trực tiếp.
 *   Mục đích: chạy bộ regression tự động mà KHÔNG làm bẩn môi trường vận hành sạch.
 */
import { createRequire } from "node:module";
const creq = createRequire("D:/thanhnx/OpenCode/talung-cus-work/package.json");
const { PrismaClient } = creq("@prisma/client");
const bcrypt = creq("bcryptjs");
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });

(async () => {
  const pwd = "LocalTest@2026";
  const hash = await bcrypt.hash(pwd, 10);
  const staffRole = await prisma.role.findUnique({ where: { code: "STAFF" } });
  const leaderRole = await prisma.role.findUnique({ where: { code: "UNIT_LEADER" } });
  const unitA = await prisma.orgUnit.findFirst({ where: { code: "HQCB-BO-PHAN-NGHIEP-VU-HAI-QUAN" } });
  const unitB = await prisma.orgUnit.findFirst({ where: { code: "HQCB-BO-PHAN-DIEU-TRA-CBL" } });
  const unitL = await prisma.orgUnit.findFirst({ where: { code: "HQCB-LANH-DAO-DON-VI" } });

  const mk = async (code, fullName, role, unit, username) => {
    let person = await prisma.person.findFirst({ where: { code } });
    if (!person) person = await prisma.person.create({ data: { code, fullName, status: "ACTIVE" } });
    if (unit) {
      const ex = await prisma.personAssignment.findFirst({ where: { personId: person.id, unitId: unit.id } });
      if (!ex) await prisma.personAssignment.create({ data: { personId: person.id, unitId: unit.id, isPrimary: true, effectiveFrom: new Date("2026-01-01T00:00:00.000Z") } });
    }
    const exAcc = await prisma.account.findFirst({ where: { personId: person.id } });
    if (!exAcc) {
      await prisma.account.create({
        data: {
          username: username || code.toLowerCase().replace(/[^a-z0-9]/g, ""), passwordHash: hash, personId: person.id, status: "ACTIVE",
          roleGrants: { create: [{ roleId: role.id, scopeType: role.code === "UNIT_LEADER" ? "ORGANIZATION" : "DEPARTMENT", scopeUnitId: role.code === "UNIT_LEADER" ? null : unit?.id ?? null }] },
        },
      });
    }
    return person;
  };

  const cb1 = await mk("TEST-CB-01", "Cán bộ thử nghiệm 01", staffRole, unitA, "democb01");
  await mk("TEST-CB-02", "Cán bộ thử nghiệm 02", staffRole, unitB, "democb02");
  const ld = await mk("TEST-LD-01", "Lãnh đạo thử nghiệm", leaderRole, unitL, "demold01");

  // quan hệ lãnh đạo trực tiếp (A1) — CHỈ trong DB kiểm thử
  const sup = await prisma.personSupervision.findFirst({ where: { managerPersonId: ld.id, subordinatePersonId: cb1.id } });
  if (!sup) {
    await prisma.personSupervision.create({
      data: {
        managerPersonId: ld.id, subordinatePersonId: cb1.id, scopeType: "UNIT", status: "CONFIRMED",
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"), confirmedById: ld.id, confirmedAt: new Date(),
        note: "Dữ liệu kiểm thử tự động",
      },
    });
  }
  const accounts = await prisma.account.findMany({ select: { username: true, status: true } });
  console.log("  tai khoan kiem thu:", JSON.stringify(accounts));
  await prisma.$disconnect();
})().catch((e) => { console.error("LOI:", String(e.message).slice(0, 300)); process.exit(1); });
