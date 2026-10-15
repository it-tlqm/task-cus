/**
 * LÀM TRẮNG DỮ LIỆU NGHIỆP VỤ (chuẩn bị chạy thật) — NGUY HIỂM, ĐỌC KỸ.
 *
 * GIỮ LẠI: cơ cấu tổ chức, chức danh, vai trò/quyền, danh mục 48 mẫu,
 * biểu mẫu, kỳ báo cáo, cấu hình, con người + tài khoản THẬT.
 * XÓA: toàn bộ Task/Kế hoạch/Đầu việc/Nhật ký/Submission/Snapshot/Thông báo/Audit
 * + con người & tài khoản DEMO.
 *
 * BẮT BUỘC trước khi --apply:
 *   1. pg_dump backup toàn DB (lệnh gợi ý in ở dưới, tự điền mật khẩu).
 *   2. Chạy dry-run trước (mặc định), đọc kỹ số lượng từng bảng.
 *   3. Trỏ DIRECT_URL/DATABASE_URL đúng DB production cần làm trắng.
 *
 *   Dry-run:  npx tsx scripts/reset-business-data.ts
 *   Thực thi: npx tsx scripts/reset-business-data.ts --apply
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
});

const DEMO_USERNAMES = ["lanhdao", "truongnhom_a", "canbo_a", "canbo_b", "admin"];

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(
    apply
      ? "== APPLY MODE: XÓA THẬT DỮ LIỆU NGHIỆP VỤ =="
      : "== DRY-RUN: chỉ đếm, không xóa gì =="
  );
  if (apply) {
    console.log("YÊU CẦU: đã pg_dump backup? Ví dụ:");
    console.log("  pg_dump \"$DIRECT_URL\" -Fc -f backup-truoc-lam-trang.dump");
  }

  // 1. Định danh demo (người + tài khoản)
  const demoPeople = await prisma.person.findMany({
    where: {
      OR: [
        { email: { contains: "demo" } },
        { code: { startsWith: "CB-" } },
        { account: { username: { in: DEMO_USERNAMES } } },
      ],
    },
    include: { account: true },
  });
  const demoPersonIds = demoPeople.map((p) => p.id);
  const demoAccountIds = demoPeople.map((p) => p.account?.id).filter(Boolean) as string[];
  console.log(`[Demo] ${demoPeople.length} người demo, ${demoAccountIds.length} TK demo`);

  // 2. Đếm nghiệp vụ toàn cục (xóa hết, không phân biệt demo/thật — toàn là dữ liệu thử)
  const counts: Record<string, number> = {
    tasks: await prisma.task.count(),
    plans: await prisma.plan.count(),
    planItems: await prisma.planItem.count(),
    planTaskLinks: await prisma.planTaskLink.count(),
    personalWorkItems: await prisma.personalWorkItem.count(),
    routineEntries: await prisma.routineEntry.count(),
    resultSubmissions: await prisma.resultSubmission.count(),
    submissionValues: await prisma.submissionValue.count(),
    taskUpdates: await prisma.taskUpdate.count(),
    deadlineRequests: await prisma.deadlineRequest.count(),
    taskAssignees: await prisma.taskAssignee.count(),
    taskAttachments: await prisma.taskAttachment.count(),
    notifications: await prisma.notification.count(),
    reportSnapshots: await prisma.reportSnapshot.count(),
    auditEvents: await prisma.auditEvent.count(),
  };
  console.log("[Nghiệp vụ sẽ xóa]", JSON.stringify(counts, null, 1));

  const kept = {
    orgUnits: await prisma.orgUnit.count(),
    positions: await prisma.position.count(),
    roles: await prisma.role.count(),
    activityGroups: await prisma.activityGroup.count(),
    activityTemplates: await prisma.activityTemplate.count(),
    formTemplates: await prisma.formTemplate.count(),
    reportingPeriods: await prisma.reportingPeriod.count(),
    systemConfigs: await prisma.systemConfig.count(),
    realPeople: (await prisma.person.count()) - demoPeople.length,
  };
  console.log("[GIỮ LẠI]", JSON.stringify(kept, null, 1));

  if (!apply) {
    console.log("== KẾT THÚC DRY-RUN. Thêm --apply để thực thi (sau khi backup). ==");
    return;
  }

  await prisma.$transaction(async (tx) => {
    // Thứ tự: con trước cha, tôn trọng FK không-cascade (snapshot.lockedBy, audit.actor)
    await tx.reportSnapshot.deleteMany({});
    await tx.auditEvent.deleteMany({});
    await tx.submissionValue.deleteMany({});
    await tx.resultSubmission.deleteMany({});
    await tx.routineEntry.deleteMany({});
    await tx.taskUpdate.deleteMany({});
    await tx.deadlineRequest.deleteMany({});
    await tx.taskAssignee.deleteMany({});
    await tx.taskAttachment.deleteMany({});
    await tx.planTaskLink.deleteMany({});
    await tx.personalWorkItem.deleteMany({});
    await tx.planItem.deleteMany({});
    await tx.plan.deleteMany({});
    await tx.task.deleteMany({});
    await tx.notification.deleteMany({});
    // Người demo: cascade kéo theo assignment/account/grant còn lại
    if (demoPersonIds.length > 0) {
      await tx.person.deleteMany({ where: { id: { in: demoPersonIds } } });
    }
    // Mở khóa các kỳ (snapshot đã xóa hết)
    await tx.reportingPeriod.updateMany({ data: { isLocked: false } });
  });

  const verify = {
    tasks: await prisma.task.count(),
    plans: await prisma.plan.count(),
    routines: await prisma.routineEntry.count(),
    snapshots: await prisma.reportSnapshot.count(),
    audits: await prisma.auditEvent.count(),
    notifications: await prisma.notification.count(),
    people: await prisma.person.count(),
    accounts: await prisma.account.count(),
  };
  console.log("[KIỂM CHỨNG SAU XÓA]", JSON.stringify(verify, null, 1));
  console.log("== HOÀN TẤT. DB sẵn sàng chạy thật. ==");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
