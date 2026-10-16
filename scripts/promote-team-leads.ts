/**
 * Nâng Trưởng nhóm (chức vụ TRUONG_BO_PHAN) thành DEPARTMENT_LEADER phạm vi
 * đơn vị của họ — để sửa giao việc + duyệt trên mobile/desktop theo đúng RBAC.
 * - Không đụng UNIT_LEADER/SYSTEM_ADMIN, không cấp org.manage/audit.
 * - Grant STAFF cũ được đóng (validTo) để giữ lịch sử, không xóa.
 * - Mặc định dry-run; thêm --apply để ghi thật (có audit).
 */
import { prisma } from "../src/server/db";

async function main() {
  const apply = process.argv.includes("--apply");
  const deptRole = await prisma.role.findUnique({ where: { code: "DEPARTMENT_LEADER" } });
  const staffRole = await prisma.role.findUnique({ where: { code: "STAFF" } });
  if (!deptRole || !staffRole) throw new Error("Thieu role goc");

  const leads = await prisma.person.findMany({
    where: {
      status: "ACTIVE",
      assignments: { some: { isPrimary: true, position: { code: "TRUONG_BO_PHAN" } } },
      account: { status: "ACTIVE" },
    },
    include: {
      account: { include: { roleGrants: { include: { role: true } } } },
      assignments: { where: { isPrimary: true }, include: { unit: true } },
    },
  });

  for (const p of leads) {
    const unit = p.assignments[0]?.unit;
    const grants = p.account?.roleGrants || [];
    const activeDept = grants.find((g) => g.role.code === "DEPARTMENT_LEADER" && !g.validTo);
    console.log(`- ${p.fullName} (${p.account?.username}) @ ${unit?.name || "?"}: grants=[${grants.map((g) => `${g.role.code}${g.validTo ? "(het han)" : ""}`).join(",")}] ${activeDept ? "=> DA LA TRUONG BO PHAN, bo qua" : ""}`);
    if (!apply || activeDept || !p.account || !unit) continue;

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      // Đóng grant STAFF đang hiệu lực (giữ lịch sử)
      await tx.roleGrant.updateMany({
        where: { accountId: p.account!.id, roleId: staffRole.id, validTo: null },
        data: { validTo: now },
      });
      // Cấp DEPARTMENT_LEADER phạm vi đơn vị
      const grant = await tx.roleGrant.create({
        data: {
          accountId: p.account!.id,
          roleId: deptRole.id,
          scopeType: "DEPARTMENT",
          scopeUnitId: unit.id,
          validFrom: now,
        },
      });
      await tx.auditEvent.create({
        data: {
          action: "ROLE_PROMOTE_TEAMLEAD",
          resourceType: "RoleGrant",
          resourceId: grant.id,
          newData: { person: p.fullName, username: p.account!.username, from: "STAFF", to: "DEPARTMENT_LEADER", scope: unit.name },
        },
      });
    });
    console.log(`  APPLIED: ${p.account.username} -> DEPARTMENT_LEADER @ ${unit.name}`);
  }
  console.log(apply ? "DONE" : "DRY-RUN (them --apply de ghi that)");
}

main().catch((e) => { console.error("ERR:", e.message); process.exit(1); }).finally(() => process.exit(0));
