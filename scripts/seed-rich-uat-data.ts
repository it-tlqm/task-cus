import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DIRECT_URL || process.env.DATABASE_URL,
    },
  },
});

async function main() {
  console.log("==================================================================");
  console.log(">> BẮT ĐẦU NẠP DỮ LIỆU UAT & TEST PHONG PHÚ LÊN SUPABASE CLOUD");
  console.log("==================================================================");

  // 1. Lấy thông tin các Đơn vị
  const units = await prisma.orgUnit.findMany();
  const unitMap = new Map(units.map((u) => [u.code, u]));
  const unitA = unitMap.get("BP_NGHIEPVU_A")!;
  const unitB = unitMap.get("BP_GIAMSAT_B")!;
  const unitLeadership = unitMap.get("BAN_LANH_DAO")!;

  // 2. Lấy thông tin Cán bộ
  const people = await prisma.person.findMany({
    include: { account: true },
  });
  const personMap = new Map(people.map((p) => [p.code, p]));

  // Cán bộ Đội A
  const personDinh = personMap.get("HQTL-001"); // Chi cục trưởng
  const personAn = personMap.get("HQTL-011"); // Đội trưởng A
  const personCuong = personMap.get("HQTL-014"); // Cán bộ Tiếp nhận A
  const personMai = personMap.get("HQTL-012") || people.find(p => p.fullName.includes("Mai")); // Cán bộ A
  const personQuan = people.find(p => p.fullName.includes("Quân")); // Cán bộ B

  // 3. Lấy Nhóm Nghiệp vụ & Mẫu nghiệp vụ
  const groups = await prisma.activityGroup.findMany();
  const groupTTHQ = groups.find((g) => g.code === "TTHQ") || groups[0];
  const groupGSHQ = groups.find((g) => g.code === "GSHQ") || groups[1];

  const templates = await prisma.activityTemplate.findMany();
  const tmplTTHQ01 = templates.find((t) => t.code === "TTHQ-01") || templates[0];
  const tmplTTHQ03 = templates.find((t) => t.code === "TTHQ-03") || templates[1];
  const tmplTTHQ08 = templates.find((t) => t.code === "TTHQ-08") || templates[2];
  const tmplGSHQ01 = templates.find((t) => t.code === "GSHQ-01") || templates[3];
  const tmplGSHQ02 = templates.find((t) => t.code === "GSHQ-02") || templates[4];

  // 4. Tạo hoặc cập nhật Kỳ báo cáo Tuần 41 & Tuần 42 (Chuẩn ISO 8601 năm 2026)
  // Tuần 41/2026: Thứ Hai 12/10/2026 - Chủ Nhật 18/10/2026
  const startW41 = new Date("2026-10-12T00:00:00.000Z");
  const endW41 = new Date("2026-10-18T23:59:59.999Z");
  const dueW41 = new Date("2026-10-16T17:00:00.000Z");

  const startW42 = new Date("2026-10-19T00:00:00.000Z");
  const endW42 = new Date("2026-10-25T23:59:59.999Z");
  const dueW42 = new Date("2026-10-23T17:00:00.000Z");

  let periodW41 = await prisma.reportingPeriod.findFirst({
    where: { title: { contains: "Tuần 41" } },
  });
  if (!periodW41) {
    periodW41 = await prisma.reportingPeriod.create({
      data: {
        type: "WEEK",
        title: "Kỳ kế hoạch công tác Tuần 41 (12/10/2026 - 18/10/2026)",
        startAt: startW41,
        endAt: endW41,
        dueAt: dueW41,
        isLocked: false,
      },
    });
  } else {
    periodW41 = await prisma.reportingPeriod.update({
      where: { id: periodW41.id },
      data: {
        startAt: startW41,
        endAt: endW41,
        dueAt: dueW41,
        isLocked: false,
      },
    });
  }

  let periodW42 = await prisma.reportingPeriod.findFirst({
    where: { title: { contains: "Tuần 42" } },
  });
  if (!periodW42) {
    periodW42 = await prisma.reportingPeriod.create({
      data: {
        type: "WEEK",
        title: "Kỳ kế hoạch công tác Tuần 42 (19/10/2026 - 25/10/2026)",
        startAt: startW42,
        endAt: endW42,
        dueAt: dueW42,
        isLocked: false,
      },
    });
  }

  console.log(`>> Kỳ kế hoạch Tuần 41: [${periodW41.id}] ${periodW41.title}`);
  console.log(`>> Kỳ kế hoạch Tuần 42: [${periodW42.id}] ${periodW42.title}`);

  // 5. Tạo Kế hoạch công tác Tuần 41 - Đội Nghiệp vụ A
  let planA = await prisma.plan.findFirst({
    where: { periodId: periodW41.id, unitId: unitA.id },
  });

  const creatorAId = personAn ? personAn.id : people[0].id;

  if (!planA) {
    planA = await prisma.plan.create({
      data: {
        periodId: periodW41.id,
        unitId: unitA.id,
        creatorId: creatorAId,
        title: "Kế hoạch công tác Tuần 41/2026 — Đội Nghiệp vụ A (Thủ tục Hải quan)",
        status: "DRAFT", // Cán bộ có thể chỉnh sửa hoặc nộp duyệt
      },
    });
  }

  // Tạo các Mục kế hoạch (Plan Items)
  let planItemTTHQ = await prisma.planItem.findFirst({
    where: { planId: planA.id, groupId: groupTTHQ.id },
  });
  if (!planItemTTHQ) {
    planItemTTHQ = await prisma.planItem.create({
      data: {
        planId: planA.id,
        groupId: groupTTHQ.id,
        title: "Thủ tục hải quan và giải quyết thông quan hàng hóa",
        sortOrder: 1,
      },
    });
  }

  // 6. Xóa các workItem cũ của Tuần 41 để nạp bộ đầu việc chuẩn đẹp
  await prisma.personalWorkItem.deleteMany({
    where: { periodId: periodW41.id },
  });

  // Tạo danh sách 5 đầu việc chuẩn 8 cột A–H cho Cán bộ Đội A (gán cho personCuong, personMai và canbo_a)
  const targetOfficers = [personCuong, personMai].filter(Boolean);
  // Nếu có tài khoản canbo_a riêng
  const accCanBoA = await prisma.account.findUnique({
    where: { username: "canbo_a" },
    include: { person: true },
  });
  if (accCanBoA && !targetOfficers.find(o => o?.id === accCanBoA.person.id)) {
    targetOfficers.push(accCanBoA.person as any);
  }

  console.log(`>> Nạp đầu việc kế hoạch cho ${targetOfficers.length} cán bộ...`);

  for (const officer of targetOfficers) {
    if (!officer) continue;

    // Đầu việc 1: TTHQ-01 (Thứ Hai)
    await prisma.personalWorkItem.create({
      data: {
        personId: officer.id,
        periodId: periodW41.id,
        planItemId: planItemTTHQ.id,
        templateId: tmplTTHQ01.id,
        groupId: groupTTHQ.id,
        title: "Tiếp nhận, kiểm tra tính hợp lệ của hồ sơ hải quan điện tử qua hệ thống VNACCS/VCIS",
        workDate: new Date("2026-10-12T02:00:00.000Z"),
        dateText: "Thứ Hai (12/10)",
        coordinationUnit: "Bộ phận Tổng hợp D",
        priority: "Cao",
        expectedResult: "100% hồ sơ tiếp nhận được phân luồng xử lý đúng hạn",
        sortOrder: 1,
        status: "COMPLETED",
      },
    });

    // Đầu việc 2: TTHQ-03 (Thứ Ba)
    await prisma.personalWorkItem.create({
      data: {
        personId: officer.id,
        periodId: periodW41.id,
        planItemId: planItemTTHQ.id,
        templateId: tmplTTHQ03.id,
        groupId: groupTTHQ.id,
        title: "Kiểm tra chi tiết hồ sơ hải quan đối với tờ khai luồng Vàng theo quy định",
        workDate: new Date("2026-10-13T02:00:00.000Z"),
        dateText: "Thứ Ba (13/10)",
        coordinationUnit: "BP Kiểm tra sau thông quan",
        priority: "Cao",
        expectedResult: "Xử lý thông quan tối thiểu 25 bộ tờ khai đúng quy chuẩn",
        sortOrder: 2,
        status: "IN_PROGRESS",
      },
    });

    // Đầu việc 3: TTHQ-08 (Thứ Tư)
    await prisma.personalWorkItem.create({
      data: {
        personId: officer.id,
        periodId: periodW41.id,
        planItemId: planItemTTHQ.id,
        templateId: tmplTTHQ08.id,
        groupId: groupTTHQ.id,
        title: "Phối hợp kiểm tra thực tế hàng hóa (kiểm hóa luồng Đỏ) tại bãi kiểm tra tập trung",
        workDate: new Date("2026-10-14T02:00:00.000Z"),
        dateText: "Thứ Tư (14/10)",
        coordinationUnit: "Đội Kiểm tra Giám sát B",
        priority: "Khẩn",
        expectedResult: "Lập biên bản kiểm hóa và đối chiếu mã vạch 100% container luồng Đỏ",
        sortOrder: 3,
        status: "IN_PROGRESS",
      },
    });

    // Đầu việc 4: Đầu việc tự nhập đặc thù cửa khẩu (Thứ Năm)
    await prisma.personalWorkItem.create({
      data: {
        personId: officer.id,
        periodId: periodW41.id,
        planItemId: planItemTTHQ.id,
        groupId: groupTTHQ.id,
        title: "Giám sát và làm thủ tục thông quan nhanh cho 35 container nông sản xuất khẩu qua cửa khẩu Tà Lùng",
        workDate: new Date("2026-10-15T02:00:00.000Z"),
        dateText: "Thứ Năm (15/10)",
        coordinationUnit: "Đồn Biên phòng Cửa khẩu Tà Lùng",
        priority: "Cao",
        expectedResult: "Giải phóng hàng nông sản tươi trong ngày, không để phát sinh ách tắc luồng",
        sortOrder: 4,
        status: "IN_PROGRESS",
      },
    });

    // Đầu việc 5: Tổng kết tuần (Thứ Sáu)
    await prisma.personalWorkItem.create({
      data: {
        personId: officer.id,
        periodId: periodW41.id,
        planItemId: planItemTTHQ.id,
        groupId: groupTTHQ.id,
        title: "Tổng hợp số liệu tờ khai, kim ngạch XNK và báo cáo giao ban tuần của Đội Nghiệp vụ A",
        workDate: new Date("2026-10-16T02:00:00.000Z"),
        dateText: "Thứ Sáu (16/10)",
        coordinationUnit: "Bộ phận Tổng hợp D",
        priority: "Trung bình",
        expectedResult: "Báo cáo số liệu giao ban tuần hoàn chỉnh gửi Lãnh đạo Chi cục trước 16h30",
        sortOrder: 5,
        status: "ACTIVE",
      },
    });
  }

  // 7. Tạo thêm Kế hoạch Tuần 41 cho Đội Giám sát B (Trạng thái SUBMITTED để Lãnh đạo có việc duyệt)
  let planB = await prisma.plan.findFirst({
    where: { periodId: periodW41.id, unitId: unitB.id },
  });
  if (!planB) {
    planB = await prisma.plan.create({
      data: {
        periodId: periodW41.id,
        unitId: unitB.id,
        creatorId: personQuan ? personQuan.id : creatorAId,
        title: "Kế hoạch công tác Tuần 41/2026 — Đội Kiểm tra Giám sát B",
        status: "SUBMITTED", // Trạng thái chờ Chi cục trưởng phê duyệt!
      },
    });
  } else {
    await prisma.plan.update({
      where: { id: planB.id },
      data: { status: "SUBMITTED" },
    });
  }

  // Tạo đầu việc cho Cán bộ Đội Giám sát B (personQuan và canbo_b)
  const targetOfficersB = [personQuan].filter(Boolean);
  const accCanBoB = await prisma.account.findUnique({
    where: { username: "canbo_b" },
    include: { person: true },
  });
  if (accCanBoB && !targetOfficersB.find(o => o?.id === accCanBoB.person.id)) {
    targetOfficersB.push(accCanBoB.person as any);
  }

  for (const officer of targetOfficersB) {
    if (!officer) continue;

    await prisma.personalWorkItem.create({
      data: {
        personId: officer.id,
        periodId: periodW41.id,
        groupId: groupGSHQ.id,
        templateId: tmplGSHQ01.id,
        title: "Trực giám sát phương tiện vận tải xuất nhập cảnh qua barie cửa khẩu 24/7",
        workDate: new Date("2026-10-12T02:00:00.000Z"),
        dateText: "Trong tuần",
        coordinationUnit: "Trạm Kiểm soát Biên phòng",
        priority: "Cao",
        expectedResult: "100% xe vào bãi được soi chiếu và đối chiếu biển số",
        sortOrder: 1,
        status: "IN_PROGRESS",
      },
    });

    await prisma.personalWorkItem.create({
      data: {
        personId: officer.id,
        periodId: periodW41.id,
        groupId: groupGSHQ.id,
        templateId: tmplGSHQ02.id,
        title: "Giám sát niêm phong định vị điện tử GPS trên xe container chuyển cửa khẩu",
        workDate: new Date("2026-10-13T02:00:00.000Z"),
        dateText: "Trong tuần",
        coordinationUnit: "Đội Nghiệp vụ A",
        priority: "Khẩn",
        expectedResult: "Kích hoạt và theo dõi hành trình 100% xe mang seal định vị",
        sortOrder: 2,
        status: "IN_PROGRESS",
      },
    });
  }

  // 8. Tạo các Nhiệm vụ (Task) phong phú để Dashboard KPI và Approvals hiển thị đẹp mắt
  // Xóa các task cũ để nạp mới
  await prisma.deadlineRequest.deleteMany({});
  await prisma.taskUpdate.deleteMany({});
  await prisma.taskAssignee.deleteMany({});
  await prisma.task.deleteMany({});

  const ownerA = targetOfficers[0] || people[0];
  const ownerB = targetOfficersB[0] || people[1];

  // Task 1: Chờ nghiệm thu (WAITING_REVIEW) -> Hiện trên trang Phê duyệt của Lãnh đạo / Đội trưởng
  const taskWaitingReview = await prisma.task.create({
    data: {
      code: "NV-2026-001",
      title: "Kiểm tra thực tế lô hàng quặng sắt xuất khẩu của Công ty XNK Cao Bằng",
      description: "Tiến hành lấy mẫu kiểm tra phân tích thành phần quặng tại bãi kiểm hóa Cửa khẩu Tà Lùng",
      ownerId: ownerA.id,
      unitId: unitA.id,
      priority: "Cao",
      status: "WAITING_REVIEW", // Đã làm xong, đang chờ Trưởng đội nghiệm thu!
      originalDeadline: new Date("2026-10-15T10:00:00.000Z"),
      currentDeadline: new Date("2026-10-15T10:00:00.000Z"),
      actualResultText: "Đã hoàn thành kiểm tra thực tế, lấy mẫu niêm phong gửi Chi cục Kiểm định Hải quan. Trình Lãnh đạo nghiệm thu.",
    },
  });

  // Task 2: Có đề xuất gia hạn (Deadline Request PENDING) -> Hiện trên trang Phê duyệt
  const taskExtend = await prisma.task.create({
    data: {
      code: "NV-2026-002",
      title: "Rà soát hồ sơ nợ thuế và cưỡng chế thuế đối với 05 doanh nghiệp quá hạn",
      description: "Tổng hợp danh sách các doanh nghiệp còn nợ thuế quá 90 ngày phát sinh tại Chi cục",
      ownerId: ownerA.id,
      unitId: unitA.id,
      priority: "Cao",
      status: "IN_PROGRESS",
      originalDeadline: new Date("2026-10-14T17:00:00.000Z"),
      currentDeadline: new Date("2026-10-14T17:00:00.000Z"),
    },
  });

  await prisma.deadlineRequest.create({
    data: {
      taskId: taskExtend.id,
      requestedById: ownerA.id,
      requestedDeadline: new Date("2026-10-18T17:00:00.000Z"),
      reason: "Doanh nghiệp xin gia hạn để đối chiếu chứng từ nộp thuế tại Kho bạc Nhà nước tỉnh Cao Bằng",
      status: "PENDING",
    },
  });

  // Task 3: Đang thực hiện đúng hạn (IN_PROGRESS)
  await prisma.task.create({
    data: {
      code: "NV-2026-003",
      title: "Tuần tra, kiểm soát chống buôn lậu khu vực cánh gà hai bên cánh cửa khẩu",
      description: "Phối hợp với lực lượng Biên phòng chốt chặn các đường mòn lối mở vào ban đêm",
      ownerId: ownerB.id,
      unitId: unitB.id,
      priority: "Khẩn",
      status: "IN_PROGRESS",
      originalDeadline: new Date("2026-10-18T23:59:59.000Z"),
      currentDeadline: new Date("2026-10-18T23:59:59.000Z"),
    },
  });

  // Task 4: Đã hoàn thành (DONE)
  await prisma.task.create({
    data: {
      code: "NV-2026-004",
      title: "Bảo dưỡng định kỳ hệ thống máy soi chiếu hành lý và cổng nhận diện biển số xe",
      description: "Đơn vị bảo trì đã kiểm tra và vệ sinh hệ thống cảm biến quang học cổng số 1",
      ownerId: ownerA.id,
      unitId: unitA.id,
      priority: "Trung bình",
      status: "DONE",
      originalDeadline: new Date("2026-10-13T12:00:00.000Z"),
      currentDeadline: new Date("2026-10-13T12:00:00.000Z"),
      actualResultText: "Hệ thống hoạt động ổn định, dữ liệu truyền thông suốt về máy chủ Chi cục.",
    },
  });

  console.log("==================================================================");
  console.log(">> [THÀNH CÔNG] ĐÃ NẠP TOÀN BỘ DỮ LIỆU UAT & TEST PHONG PHÚ LÊN SUPABASE!");
  console.log(">> - Kế hoạch Tuần 41: 5 đầu việc chuẩn 8 cột A–H.");
  console.log(">> - 1 Kế hoạch SUBMITTED của Đội B (để Chi cục trưởng duyệt).");
  console.log(">> - 1 Nhiệm vụ WAITING_REVIEW (chờ nghiệm thu kết quả).");
  console.log(">> - 1 Nhiệm vụ có đề xuất gia hạn PENDING.");
  console.log(">> - Các nhiệm vụ IN_PROGRESS, DONE phục vụ Dashboard KPI.");
  console.log("==================================================================");
}

main()
  .catch((e) => {
    console.error("Lỗi nạp dữ liệu:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
