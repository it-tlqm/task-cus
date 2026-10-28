/**
 * Kiểm thử luồng "Chốt kỳ / khóa số liệu" trên CSDL local:
 *  - Tạo bản chụp bất biến cho một kỳ tuần chưa khóa.
 *  - Xác minh checksum SHA-256 và KPI tổng hợp.
 *  - Chặn chốt trùng và chặn SYSTEM_ADMIN.
 *  - Dọn dẹp dữ liệu kiểm thử sau khi chạy.
 */
import { prisma } from "../src/server/db";
import { createReportSnapshot, verifySnapshotIntegrity } from "../src/server/snapshots";
import type { SessionUser } from "../src/server/auth";

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "[PASS]" : "[FAIL]"} ${label}${ok || detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  if (ok) pass++;
  else fail++;
}

async function main() {
  const account = await prisma.account.findFirst({
    where: { status: "ACTIVE", person: { status: "ACTIVE" } },
    include: { person: true, roleGrants: { include: { role: true } } },
    orderBy: { username: "asc" },
  });
  if (!account) throw new Error("CSDL local chưa có tài khoản để kiểm thử");

  const primary = await prisma.personAssignment.findFirst({
    where: { personId: account.personId, isPrimary: true },
    include: { unit: true, position: true },
  });

  const baseUser: SessionUser = {
    id: account.id,
    personId: account.personId,
    username: account.username,
    fullName: account.person.fullName,
    personCode: account.person.code,
    positionTitle: primary?.position?.title || "Cán bộ",
    unitId: primary?.unitId || undefined,
    unitName: primary?.unit?.name || undefined,
    role: "UNIT_LEADER",
    scopeType: "ORGANIZATION",
    scopeUnitId: null,
    permissions: ["plans.approve", "reports.export"],
  };

  const period = await prisma.reportingPeriod.findFirst({
    where: { type: "WEEK", isLocked: false },
    orderBy: { startAt: "desc" },
  });
  if (!period) {
    console.log("[SKIP] Không còn kỳ tuần chưa khóa để kiểm thử");
    await prisma.$disconnect();
    return;
  }

  const created = await prisma.reportSnapshot.findFirst({
    where: { periodId: period.id, status: "LOCKED" },
    select: { id: true, code: true },
  });
  if (created) {
    console.log("[SKIP] Kỳ tuần đã có bản chụp LOCKED");
    await prisma.$disconnect();
    return;
  }

  let snapshotId: string | null = null;
  let auditId: string | null = null;
  try {
    console.log(`Kỳ kiểm thử: ${period.title}`);
    const result = await createReportSnapshot(baseUser, {
      periodId: period.id,
      notes: "Bản kiểm thử tự động — sẽ được dọn dẹp",
    });
    snapshotId = result.snapshot.id;

    check("Tạo được bản chụp kỳ", !!result.snapshot.id && result.snapshot.status === "LOCKED", result.snapshot.code);
    check("Mã kiểm tra đúng 64 ký tự", /^[a-f0-9]{64}$/i.test(result.snapshot.checksum));
    check("Checksum tự xác minh", result.integrity.isValid === true, result.integrity.message);
    check(
      "KPI tổng hợp khớp số nhiệm vụ",
      result.snapshot.metrics.totalTasks >= result.snapshot.metrics.completedTasks,
      result.snapshot.metrics
    );

    const stored = await prisma.reportSnapshot.findUnique({ where: { id: result.snapshot.id } });
    check("Lưu đúng người chốt", stored?.lockedById === account.personId);
    check("Lưu trạng thái LOCKED", stored?.status === "LOCKED");
    check(
      "Kiểm tra toàn vẹn lại từ dữ liệu lưu",
      !!stored && verifySnapshotIntegrity(stored.checksum, stored.snapshotData).isValid
    );

    const lockedPeriod = await prisma.reportingPeriod.findUnique({ where: { id: period.id } });
    check("Kỳ được đánh dấu đã khóa", lockedPeriod?.isLocked === true);

    const audit = await prisma.auditEvent.findFirst({
      where: { action: "REPORT_SNAPSHOT_LOCKED", resourceId: result.snapshot.id },
    });
    auditId = audit?.id || null;
    check("Có ghi nhật ký chốt kỳ", !!audit);
    check("Nhật ký có checksum", !!audit && String((audit.newData as any)?.checksum || "").length === 64);

    let duplicateMessage = "";
    try {
      await createReportSnapshot(baseUser, { periodId: period.id });
    } catch (error) {
      duplicateMessage = error instanceof Error ? error.message : String(error);
    }
    check("Chặn chốt trùng kỳ", duplicateMessage.startsWith("ALREADY_LOCKED"), duplicateMessage);

    let adminMessage = "";
    try {
      await createReportSnapshot({ ...baseUser, role: "SYSTEM_ADMIN" }, { periodId: period.id });
    } catch (error) {
      adminMessage = error instanceof Error ? error.message : String(error);
    }
    check("Chặn quản trị kỹ thuật chốt kỳ", adminMessage.startsWith("FORBIDDEN"), adminMessage);
  } finally {
    if (snapshotId) {
      await prisma.auditEvent.deleteMany({ where: { action: "REPORT_SNAPSHOT_LOCKED", resourceId: snapshotId } });
      await prisma.reportSnapshot.delete({ where: { id: snapshotId } }).catch(() => null);
    } else if (auditId) {
      await prisma.auditEvent.delete({ where: { id: auditId } }).catch(() => null);
    }
    await prisma.reportingPeriod.update({ where: { id: period.id }, data: { isLocked: false } }).catch(() => null);
    await prisma.$disconnect();
  }

  console.log(`\nKẾT QUẢ: ${pass} pass / ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
