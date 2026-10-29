import { prisma } from "../src/server/db";

const DEMO_PREFIX = "DEMO-UI-";
const DAY = 86_400_000;

const dbUrl = process.env.DATABASE_URL || "";
if (dbUrl && !/localhost|127\.0\.0\.1/.test(dbUrl)) {
  throw new Error("Script này chỉ được chạy với DB local (localhost/127.0.0.1).");
}

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * DAY);
}

async function main() {
  const staffAccount = await prisma.account.findUnique({
    where: { username: "democb01" },
    include: {
      person: {
        include: {
          assignments: {
            where: { isPrimary: true },
            select: { unitId: true },
          },
        },
      },
    },
  });
  const leaderAccount = await prisma.account.findUnique({
    where: { username: "demold01" },
    include: { person: true },
  });
  if (!staffAccount?.person || !leaderAccount?.person) {
    throw new Error("Thiếu tài khoản demo democb01/demold01");
  }
  const staff = staffAccount.person;
  const leader = leaderAccount.person;
  const unitId = staff.assignments[0]?.unitId;
  if (!unitId) throw new Error("Tài khoản democb01 chưa có đơn vị chính");

  // Xoá dữ liệu demo cũ (cascade sang participant/update/deadline request)
  await prisma.task.deleteMany({ where: { code: { startsWith: DEMO_PREFIX } } });

  const specs = [
    {
      code: "DEMO-UI-OVERDUE",
      title: "[DEMO UI] Rà soát hồ sơ quá hạn",
      status: "IN_PROGRESS",
      priority: "Cao",
      deadline: daysFromNow(-5),
      progress: 40,
      expectedResultText: "Báo cáo rà soát hồ sơ",
      description: "Dữ liệu tạm để thử nút Giải trình chậm hạn và Xin gia hạn.",
    },
    {
      code: "DEMO-UI-PENDING-EXT",
      title: "[DEMO UI] Việc đang chờ duyệt gia hạn",
      status: "IN_PROGRESS",
      priority: "Cao",
      deadline: daysFromNow(-3),
      progress: 60,
      expectedResultText: "Kết quả xử lý hồ sơ",
      description: "Dữ liệu tạm để thử luồng lãnh đạo duyệt gia hạn.",
    },
    {
      code: "DEMO-UI-ISSUE",
      title: "[DEMO UI] Việc đã gửi giải trình",
      status: "IN_PROGRESS",
      priority: "Trung bình",
      deadline: daysFromNow(-2),
      progress: 30,
      hasIssue: true,
      issueNotes: "Đang đối chiếu hồ sơ giấy, dự kiến hoàn thành trong ngày.",
      expectedResultText: "Biên bản đối chiếu",
      description: "Dữ liệu tạm để xem nội dung giải trình trên thẻ việc.",
    },
    {
      code: "DEMO-UI-DONE",
      title: "[DEMO UI] Việc đã hoàn thành",
      status: "COMPLETED",
      priority: "Thấp",
      deadline: daysFromNow(-1),
      progress: 100,
      actualResultText: "Đã hoàn thành và được nghiệm thu.",
      expectedResultText: "Báo cáo hoàn thành",
      description: "Dữ liệu tạm để xem trạng thái đã hoàn thành.",
    },
    {
      code: "DEMO-UI-UPCOMING",
      title: "[DEMO UI] Việc sắp đến hạn",
      status: "IN_PROGRESS",
      priority: "Trung bình",
      deadline: daysFromNow(1),
      progress: 20,
      expectedResultText: "Kết quả xử lý",
      description: "Dữ liệu tạm để xem việc sắp đến hạn.",
    },
  ];

  const created: Array<{ id: string; code: string; title: string }> = [];
  for (const spec of specs) {
    const task = await prisma.task.create({
      data: {
        code: spec.code,
        title: spec.title,
        description: spec.description,
        ownerId: staff.id,
        unitId,
        priority: spec.priority,
        status: spec.status,
        originalDeadline: spec.deadline,
        currentDeadline: spec.deadline,
        expectedResultText: spec.expectedResultText,
        actualResultText: spec.actualResultText ?? null,
        hasIssue: spec.hasIssue ?? false,
        issueNotes: spec.issueNotes ?? null,
        createdById: leader.id,
        assignedById: leader.id,
        originKind: "LEADER_ASSIGNED",
      },
    });

    await prisma.taskParticipantResult.create({
      data: {
        taskId: task.id,
        personId: staff.id,
        role: "OWNER",
        partStatus: spec.status === "COMPLETED" ? "ACCEPTED" : "IN_PROGRESS",
        partProgressPercent: spec.progress,
        partResultText: spec.status === "COMPLETED" ? spec.actualResultText ?? null : null,
      },
    });

    await prisma.taskUpdate.create({
      data: {
        taskId: task.id,
        authorId: staff.id,
        progressPercent: spec.progress,
        kind: "progress",
        notes: "Cập nhật tiến độ (dữ liệu demo).",
      },
    });

    created.push({ id: task.id, code: task.code, title: task.title });
  }

  const pendingTask = created.find((t) => t.code === "DEMO-UI-PENDING-EXT")!;
  await prisma.deadlineRequest.create({
    data: {
      taskId: pendingTask.id,
      requestedById: staff.id,
      requestedDeadline: daysFromNow(5),
      reason: "Cần thêm thời gian đối chiếu hồ sơ và xác minh thông tin.",
      status: "PENDING",
    },
  });

  // Kích hoạt 2 nhóm TX để tab Danh mục TX có dữ liệu thực tế
  const bpNghiepVu = await prisma.orgUnit.findUnique({ where: { code: "BP_NGHIEPVU_A" } });
  const bpTongHop = await prisma.orgUnit.findUnique({ where: { code: "BP_TONGHOP_D" } });
  const mappingSpecs = [
    { department: "Bộ phân Nghiệp vụ Hải quan", unitId: bpNghiepVu?.id },
    { department: "Bộ phận TH & Báo cáo", unitId: bpTongHop?.id },
  ];
  await prisma.workCatalogDepartmentMapping.deleteMany({
    where: { department: "Bộ phận Nghiệp vụ Hải quan" },
  });
  for (const spec of mappingSpecs) {
    if (!spec.unitId) continue;
    await prisma.workCatalogDepartmentMapping.upsert({
      where: { department: spec.department },
      create: {
        department: spec.department,
        unitId: spec.unitId,
        isActive: true,
        confirmedBy: leader.id,
        confirmedAt: new Date(),
      },
      update: {
        unitId: spec.unitId,
        isActive: true,
        confirmedBy: leader.id,
        confirmedAt: new Date(),
      },
    });
  }

  console.log("Đã tạo dữ liệu demo local:");
  for (const t of created) console.log(`- ${t.code}: ${t.title} (${t.id})`);
  console.log("- Đã tạo 1 đề nghị gia hạn PENDING cho DEMO-UI-PENDING-EXT");
  console.log("- Đã kích hoạt 2 nhóm TX: Bộ phận Nghiệp vụ Hải quan, Bộ phận TH & Báo cáo");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
