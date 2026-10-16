import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding talung-cus-work database with DEMO data...");

  // 1. Clear existing data in reverse order of relationships
  await prisma.submissionValue.deleteMany({});
  await prisma.resultSubmission.deleteMany({});
  await prisma.routineEntry.deleteMany({});
  await prisma.deadlineRequest.deleteMany({});
  await prisma.taskUpdate.deleteMany({});
  await prisma.taskAssignee.deleteMany({});
  await prisma.planTaskLink.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.personalWorkItem.deleteMany({});
  await prisma.planItem.deleteMany({});
  await prisma.plan.deleteMany({});
  await prisma.reportingPeriod.deleteMany({});
  await prisma.formTemplateVersion.deleteMany({});
  await prisma.formTemplate.deleteMany({});
  await prisma.activityTemplate.deleteMany({});
  await prisma.activityGroup.deleteMany({});
  await prisma.roleGrant.deleteMany({});
  await prisma.rolePermission.deleteMany({});
  await prisma.permission.deleteMany({});
  await prisma.role.deleteMany({});
  await prisma.account.deleteMany({});
  await prisma.personAssignment.deleteMany({});
  await prisma.person.deleteMany({});
  await prisma.position.deleteMany({});
  await prisma.orgUnit.deleteMany({});
  await prisma.organization.deleteMany({});
  await prisma.auditEvent.deleteMany({});

  // 2. Organization
  const org = await prisma.organization.create({
    data: {
      code: "HQ_TA_LUNG",
      name: "Hải quan cửa khẩu Quốc tế Tà Lùng",
      status: "ACTIVE",
    },
  });

  // 3. Org Units (Cây cơ cấu tổ chức)
  const rootUnit = await prisma.orgUnit.create({
    data: {
      orgId: org.id,
      code: "HQCK_TALUNG",
      name: "Hải quan cửa khẩu Quốc tế Tà Lùng",
      level: 1,
      sortOrder: 1,
      status: "ACTIVE",
    },
  });

  const leadershipUnit = await prisma.orgUnit.create({
    data: {
      orgId: org.id,
      parentId: rootUnit.id,
      code: "BAN_LANH_DAO",
      name: "Lãnh đạo đơn vị",
      level: 2,
      sortOrder: 2,
      status: "ACTIVE",
    },
  });

  const deptA = await prisma.orgUnit.create({
    data: {
      orgId: org.id,
      parentId: rootUnit.id,
      code: "BP_NGHIEPVU_A",
      name: "Bộ phận Nghiệp vụ A (Thủ tục Hải quan)",
      level: 2,
      sortOrder: 3,
      status: "ACTIVE",
    },
  });

  const deptB = await prisma.orgUnit.create({
    data: {
      orgId: org.id,
      parentId: rootUnit.id,
      code: "BP_GIAMSAT_B",
      name: "Bộ phận Kiểm tra giám sát B (Barie & kho, bãi)",
      level: 2,
      sortOrder: 4,
      status: "ACTIVE",
    },
  });

  const deptC = await prisma.orgUnit.create({
    data: {
      orgId: org.id,
      parentId: rootUnit.id,
      code: "BP_TONDONG_C",
      name: "Bộ phận Xử lý nghiệp vụ tồn đọng C",
      level: 2,
      sortOrder: 5,
      status: "ACTIVE",
    },
  });

  const deptD = await prisma.orgUnit.create({
    data: {
      orgId: org.id,
      parentId: rootUnit.id,
      code: "BP_TONGHOP_D",
      name: "Bộ phận Tổng hợp & Báo cáo D",
      level: 2,
      sortOrder: 6,
      status: "ACTIVE",
    },
  });

  // 4. Positions
  const posChief = await prisma.position.create({
    data: { code: "CHI_CUC_TRUONG", title: "Trưởng hải quan cửa khẩu" },
  });
  const posLeader = await prisma.position.create({
    data: { code: "TRUONG_BO_PHAN", title: "Trưởng bộ phận / Trưởng nhóm" },
  });
  const posOfficer = await prisma.position.create({
    data: { code: "CAN_BO_CONG_CHUC", title: "Cán bộ công chức / Kiểm tra viên" },
  });

  // 5. People
  const personLeader = await prisma.person.create({
    data: {
      code: "CB-001",
      fullName: "Đ/c Hoàng Văn Định",
      email: "dinh.hv@talung.cus.demo",
      status: "ACTIVE",
    },
  });
  const personOfficerA = await prisma.person.create({
    data: {
      code: "CB-002",
      fullName: "Đ/c Nguyễn Văn An",
      email: "an.nv@talung.cus.demo",
      status: "ACTIVE",
    },
  });
  const personOfficerA2 = await prisma.person.create({
    data: {
      code: "CB-003",
      fullName: "Đ/c Trần Thị Mai",
      email: "mai.tt@talung.cus.demo",
      status: "ACTIVE",
    },
  });
  const personOfficerB = await prisma.person.create({
    data: {
      code: "CB-004",
      fullName: "Đ/c Lê Hoàng Quân",
      email: "quan.lh@talung.cus.demo",
      status: "ACTIVE",
    },
  });
  const personOfficerC = await prisma.person.create({
    data: {
      code: "CB-005",
      fullName: "Đ/c Nông Thị Lan",
      email: "lan.nt@talung.cus.demo",
      status: "ACTIVE",
    },
  });
  const personOfficerD = await prisma.person.create({
    data: {
      code: "CB-006",
      fullName: "Đ/c Đặng Quốc Bảo",
      email: "bao.dq@talung.cus.demo",
      status: "ACTIVE",
    },
  });

  // 6. Assignments
  await prisma.personAssignment.createMany({
    data: [
      { personId: personLeader.id, unitId: leadershipUnit.id, positionId: posChief.id, isPrimary: true },
      { personId: personOfficerA.id, unitId: deptA.id, positionId: posLeader.id, isPrimary: true },
      { personId: personOfficerA2.id, unitId: deptA.id, positionId: posOfficer.id, isPrimary: true },
      { personId: personOfficerB.id, unitId: deptB.id, positionId: posOfficer.id, isPrimary: true },
      { personId: personOfficerC.id, unitId: deptC.id, positionId: posOfficer.id, isPrimary: true },
      { personId: personOfficerD.id, unitId: deptD.id, positionId: posOfficer.id, isPrimary: true },
    ],
  });

  // 7. Roles & Permissions
  const permissionsList = [
    { code: "plans.view", name: "Xem kế hoạch", module: "PLANS" },
    { code: "plans.create", name: "Lập kế hoạch", module: "PLANS" },
    { code: "plans.approve", name: "Phê duyệt kế hoạch", module: "PLANS" },
    { code: "tasks.assign", name: "Giao nhiệm vụ", module: "TASKS" },
    { code: "tasks.update_own", name: "Cập nhật tiến độ nhiệm vụ", module: "TASKS" },
    { code: "reports.view", name: "Xem báo cáo", module: "REPORTS" },
    { code: "reports.export", name: "Xuất báo cáo XLSX", module: "REPORTS" },
    { code: "catalog.manage", name: "Quản lý danh mục mẫu", module: "CATALOG" },
    { code: "org.manage", name: "Quản trị cơ cấu tổ chức", module: "ORG" },
    { code: "audit.view", name: "Xem nhật ký kiểm toán", module: "AUDIT" },
  ];

  const createdPerms: Record<string, string> = {};
  for (const p of permissionsList) {
    const perm = await prisma.permission.create({ data: p });
    createdPerms[p.code] = perm.id;
  }

  const roleLeader = await prisma.role.create({
    data: { code: "UNIT_LEADER", name: "Trưởng hải quan cửa khẩu", isSystem: true },
  });
  const roleDeptLeader = await prisma.role.create({
    data: { code: "DEPARTMENT_LEADER", name: "Trưởng bộ phận", isSystem: true },
  });
  const roleStaff = await prisma.role.create({
    data: { code: "STAFF", name: "Công chức", isSystem: true },
  });
  const roleAdmin = await prisma.role.create({
    data: { code: "SYSTEM_ADMIN", name: "Quản trị hệ thống", isSystem: true },
  });

  // Assign permissions to roles
  for (const permCode of Object.keys(createdPerms)) {
    await prisma.rolePermission.create({
      data: { roleId: roleLeader.id, permissionId: createdPerms[permCode] },
    });
    await prisma.rolePermission.create({
      data: { roleId: roleAdmin.id, permissionId: createdPerms[permCode] },
    });
  }

  // Dept leader permissions
  for (const code of ["plans.view", "plans.create", "plans.approve", "tasks.assign", "tasks.update_own", "reports.view", "reports.export"]) {
    await prisma.rolePermission.create({
      data: { roleId: roleDeptLeader.id, permissionId: createdPerms[code] },
    });
  }

  // Staff permissions
  for (const code of ["plans.view", "tasks.update_own", "reports.view"]) {
    await prisma.rolePermission.create({
      data: { roleId: roleStaff.id, permissionId: createdPerms[code] },
    });
  }

  // 8. Accounts & Role Grants
  const passwordHash = await bcrypt.hash("demo123", 10);

  const accLeader = await prisma.account.create({
    data: { personId: personLeader.id, username: "lanhdao", passwordHash },
  });
  const accOfficerA = await prisma.account.create({
    data: { personId: personOfficerA.id, username: "truongnhom_a", passwordHash },
  });
  const accOfficerA2 = await prisma.account.create({
    data: { personId: personOfficerA2.id, username: "canbo_a", passwordHash },
  });
  const accOfficerB = await prisma.account.create({
    data: { personId: personOfficerB.id, username: "canbo_b", passwordHash },
  });
  const accAdmin = await prisma.account.create({
    data: { personId: personOfficerD.id, username: "admin", passwordHash },
  });

  await prisma.roleGrant.createMany({
    data: [
      { accountId: accLeader.id, roleId: roleLeader.id, scopeType: "ORGANIZATION" },
      { accountId: accOfficerA.id, roleId: roleDeptLeader.id, scopeType: "DEPARTMENT", scopeUnitId: deptA.id },
      { accountId: accOfficerA2.id, roleId: roleStaff.id, scopeType: "DEPARTMENT", scopeUnitId: deptA.id },
      { accountId: accOfficerB.id, roleId: roleStaff.id, scopeType: "DEPARTMENT", scopeUnitId: deptB.id },
      { accountId: accAdmin.id, roleId: roleAdmin.id, scopeType: "ORGANIZATION" },
    ],
  });

  // 9. 5 Nhóm nghiệp vụ từ Excel gốc
  const groupTTHQ = await prisma.activityGroup.create({
    data: {
      code: "TTHQ",
      name: "Thực hiện thủ tục hải quan",
      sourceRow: 8,
      sortOrder: 1,
      description: "Nhóm B8 trong Excel nguồn: Thủ tục hải quan đối với hàng hóa XNK",
    },
  });

  const groupGSHQ = await prisma.activityGroup.create({
    data: {
      code: "GSHQ",
      name: "Kiểm tra giám sát hải quan",
      sourceRow: 9,
      sortOrder: 2,
      description: "Nhóm B9 trong Excel nguồn: Kiểm tra giám sát phương tiện, kho bãi, địa điểm",
    },
  });

  const groupTonDong = await prisma.activityGroup.create({
    data: {
      code: "TON_DONG",
      name: "Xử lý nghiệp vụ phức tạp & tồn đọng",
      sourceRow: 10,
      sortOrder: 3,
      description: "Nhóm B10 trong Excel nguồn: Tồn đọng giá, mã HS, C/O vướng mắc",
    },
  });

  const groupDanhGiaHQ = await prisma.activityGroup.create({
    data: {
      code: "DANH_GIA_HQ",
      name: "Đánh giá hiệu quả và những việc đã triển khai",
      sourceRow: 11,
      sortOrder: 4,
      description: "Nhóm B11 trong Excel nguồn: Rà soát chỉ tiêu thông quan và thời gian xử lý",
    },
  });

  const groupDanhGiaNgayTuan = await prisma.activityGroup.create({
    data: {
      code: "DANH_GIA_NGAY_TUAN",
      name: "Đánh giá tình hình thực hiện nhiệm vụ trong ngày/tuần",
      sourceRow: 12,
      sortOrder: 5,
      description: "Nhóm B12 trong Excel nguồn: Đánh giá tình hình nhiệm vụ trong ngày/tuần",
    },
  });

  // 10. 48 Hoạt động mẫu từ Phụ lục A
  const tthqItems = [
    { code: "TTHQ-01", text: "•Tiếp nhận hồ sơ", row: 8, prio: "Cao" },
    { code: "TTHQ-02", text: "•C/O", row: 8, prio: "Cao" },
    { code: "TTHQ-03", text: "•Phúc tập hồ sơ XNK", row: 8, prio: "Cao" },
    { code: "TTHQ-04", text: "•Rà soát chính sách thuế, mã HS", row: 8, prio: "Cao" },
    { code: "TTHQ-05", text: "•MGH, Không thu thuế", row: 8, prio: "Cao" },
    { code: "TTHQ-06", text: "•Báo cáo định kỳ, đột xuất", row: 8, prio: "Cao" },
    { code: "TTHQ-07", text: "•Tham mưu chính xử lý các vụ việc vi phạm về thủ tục hải quan", row: 8, prio: "Cao" },
    { code: "TTHQ-08", text: "- Theo dõi, tham mưu, đề xuất thực hiện thủ tục với hàng đưa về bảo quản.", row: 8, prio: "Cao" },
    { code: "TTHQ-09", text: "- Thực hiện công tác trị giá hải quan (cập nhật, tham vấn, chỉ đạo cấp trên...)", row: 8, prio: "Cao" },
    { code: "TTHQ-10", text: "- Thực hiện công tác quản lý rủi ro.", row: 8, prio: "Cao" },
    { code: "TTHQ-11", text: "- Đầu mối cung cấp các số liệu, báo cáo về các cơ sở gia công quản lý trên địa bàn", row: 8, prio: "Cao" },
    { code: "TTHQ-12", text: "- Tư vấn, hỗ trợ doanh nghiệp thực hiện thủ tục hải quan đối với hàng hóa xuất nhập khẩu.", row: 8, prio: "Cao" },
    { code: "TTHQ-13", text: "- Thực hiện các báo cáo định kỳ. báo cáo đột xuất liên quan.", row: 8, prio: "Cao" },
    { code: "TTHQ-14", text: "- Hủy tờ khai đối với các tờ khai chưa thông quan.", row: 8, prio: "Cao" },
    { code: "TTHQ-15", text: "- Tiếp nhận tờ khai sửa bổ sung đối với các tờ khai thay đổi về mã hàng và thuế", row: 8, prio: "Cao" },
    { code: "TTHQ-16", text: "- Thực hiện hồi báo đối với các lô hàng KNQ theo quy định.", row: 8, prio: "Cao" },
    { code: "TTHQ-17", text: "- Quản lý và sử dụng đối với các loại niêm phong hải quan, trang thiết bị chuyên dùng", row: 8, prio: "Cao" },
    { code: "TTHQ-18", text: "- Hủy tờ khai đối với các tờ khai chưa đã thông quan.", row: 8, prio: "Cao" },
    { code: "TTHQ-19", text: "- Tiếp nhận tờ khai sửa bổ sung đối với các tờ khai không thay đổi về mã hàng và thuế", row: 8, prio: "Cao" },
    { code: "TTHQ-20", text: "•SHTT", row: 8, prio: "Cao" },
    { code: "TTHQ-21", text: "•DVCTT", row: 8, prio: "Cao" },
    { code: "TTHQ-22", text: "•Vướng mắc, kiến nghị và đề xuất", row: 8, prio: "Cao" },
  ];

  for (const item of tthqItems) {
    await prisma.activityTemplate.create({
      data: {
        groupId: groupTTHQ.id,
        code: item.code,
        title: item.text.replace(/^[•\-]\s*/, ""),
        sourceRawText: item.text,
        sourceRow: item.row,
        defaultPriority: item.prio,
        reportingMode: "UNCONFIGURED",
        reviewStatus: "NEEDS_REVIEW",
      },
    });
  }

  const gshqItems = [
    { code: "GSHQ-01", text: "•Kiểm tra hồ sơ XNK (Getin/getout, Hệ thống QL PTVT XNC, GPS, BBBG điện tử, CKS …)", row: 9, prio: "Cao" },
    { code: "GSHQ-02", text: "•Theo dõi hàng hoá vận chuyển đi/đến (BIA/BOA)", row: 9, prio: "Cao" },
    { code: "GSHQ-03", text: "•Theo dõi trạng thái seal GPS", row: 9, prio: "Cao" },
    { code: "GSHQ-04", text: "•Giám sát tại kho, bãi địa điểm tập kết", row: 9, prio: "Cao" },
    { code: "GSHQ-05", text: "•Theo dõi quản lý trang thiết bị kiểm tra giám sát", row: 9, prio: "Cao" },
    { code: "GSHQ-06", text: "•Quản lý hàng hoá XNK tồn tại địa điểm (KNQ/địa điểm tập kết)", row: 9, prio: "Cao" },
    { code: "GSHQ-07", text: "•Kiểm tra thực tế hàng hóa", row: 9, prio: "Cao" },
    { code: "GSHQ-08", text: "•Kiểm tra hành khách XNC và CDBG, Soi chiếu hành lý", row: 9, prio: "Cao" },
    { code: "GSHQ-09", text: "- Thực hiện kiểm tra, kiểm soát phương tiện vận chuyển hàng hóa qua lại biên giới", row: 9, prio: "Cao" },
    { code: "GSHQ-10", text: "- Thông quan đối với tờ khai PTVT tạm xuất", row: 9, prio: "Cao" },
    { code: "GSHQ-11", text: "- Tiếp nhận và thông quan đối với tờ khai PTVT tái nhập", row: 9, prio: "Cao" },
    { code: "GSHQ-12", text: "- Xác nhận bản kê 119 trên hệ thống.", row: 9, prio: "Cao" },
    { code: "GSHQ-13", text: "- Tham mưu, đề xuất và báo cáo kế hoạch về công tác thu ngân sách.", row: 9, prio: "Cao" },
    { code: "GSHQ-14", text: "- Thực hiện và báo cáo hàng ngày về công tác thu ngân sách", row: 9, prio: "Cao" },
    { code: "GSHQ-15", text: "- Thu phí tờ khai, tờ khai phương tiện, Hàng quá cảnh.", row: 9, prio: "Cao" },
    { code: "GSHQ-16", text: "- Thực hiện công tác Hoàn thuế, không thu thuế.", row: 9, prio: "Cao" },
    { code: "GSHQ-17", text: "- Thực hiện kiểm hóa đối với các lô hàng nhập trả, xuất trả, buộc tái xuất.", row: 9, prio: "Cao" },
    { code: "GSHQ-18", text: "•Tham mưu chính xử lý các vụ việc vi phạm về kiểm tra, giám sát, kiểm soát hải quan", row: 9, prio: "Cao" },
    { code: "GSHQ-19", text: "•Nắm tình hình nội, ngoại biên", row: 9, prio: "Cao" },
    { code: "GSHQ-20", text: "•Vướng mắc, kiến nghị và đề xuất", row: 9, prio: "Cao" },
  ];

  for (const item of gshqItems) {
    await prisma.activityTemplate.create({
      data: {
        groupId: groupGSHQ.id,
        code: item.code,
        title: item.text.replace(/^[•\-]\s*/, ""),
        sourceRawText: item.text,
        sourceRow: item.row,
        defaultPriority: item.prio,
        reportingMode: "UNCONFIGURED",
        reviewStatus: "NEEDS_REVIEW",
      },
    });
  }

  const tonDongItems = [
    { code: "TON_DONG-01", text: "• Tờ khai, hồ sơ tham vấn giá, Mã HS, C/O vướng mắc.", row: 10, prio: "Trung bình" },
    { code: "TON_DONG-02", text: "• Tiến độ xử lý hồ sơ tồn đọng từ ngày/tuần trước.", row: 10, prio: "Trung bình" },
  ];

  for (const item of tonDongItems) {
    await prisma.activityTemplate.create({
      data: {
        groupId: groupTonDong.id,
        code: item.code,
        title: item.text.replace(/^[•\-]\s*/, ""),
        sourceRawText: item.text,
        sourceRow: item.row,
        defaultPriority: item.prio,
        reportingMode: "UNCONFIGURED",
        reviewStatus: "NEEDS_REVIEW",
      },
    });
  }

  const danhGiaHqItems = [
    { code: "DANH_GIA_HQ-01", text: "• Rà soát chỉ tiêu thông quan và thời gian xử lý trong ngày/ trong tuần", row: 11, prio: "Trung bình" },
    { code: "DANH_GIA_HQ-02", text: "• Trao đổi, giải đáp khó khăn phát sinh cho doanh nghiệp.", row: 11, prio: "Trung bình" },
  ];

  for (const item of danhGiaHqItems) {
    await prisma.activityTemplate.create({
      data: {
        groupId: groupDanhGiaHQ.id,
        code: item.code,
        title: item.text.replace(/^[•\-]\s*/, ""),
        sourceRawText: item.text,
        sourceRow: item.row,
        defaultPriority: item.prio,
        reportingMode: "UNCONFIGURED",
        reviewStatus: "NEEDS_REVIEW",
      },
    });
  }

  const danhGiaNgayTuanItems = [
    { code: "DANH_GIA_NGAY_TUAN-01", text: "• Giải quyết thủ tục phát sinh theo chức trách nhiệm vụ được giao", row: 12, prio: "Cao" },
    { code: "DANH_GIA_NGAY_TUAN-02", text: "• Kiểm soát khu vực thực hiện nhiệm vụ chuyên môn đảm bảo đúng quy định", row: 12, prio: "Cao" },
  ];

  for (const item of danhGiaNgayTuanItems) {
    await prisma.activityTemplate.create({
      data: {
        groupId: groupDanhGiaNgayTuan.id,
        code: item.code,
        title: item.text.replace(/^[•\-]\s*/, ""),
        sourceRawText: item.text,
        sourceRow: item.row,
        defaultPriority: item.prio,
        reportingMode: "UNCONFIGURED",
        reviewStatus: "NEEDS_REVIEW",
      },
    });
  }

  // 11. Biểu mẫu kết quả động nền tảng
  const formTTHQ = await prisma.formTemplate.create({
    data: {
      code: "FORM-TTHQ-DEFAULT",
      name: "Biểu mẫu kết quả Thủ tục Hải quan",
      status: "ACTIVE",
    },
  });

  await prisma.formTemplateVersion.create({
    data: {
      formTemplateId: formTTHQ.id,
      version: 1,
      status: "PUBLISHED",
      schemaJson: {
        fields: [
          { key: "total_files", label: "Tổng số hồ sơ tiếp nhận", type: "INTEGER", required: true, min: 0 },
          { key: "handled_files", label: "Đã giải quyết thông quan", type: "INTEGER", required: true, min: 0 },
          { key: "green_channel", label: "Luồng Xanh", type: "INTEGER", required: false, min: 0 },
          { key: "yellow_channel", label: "Luồng Vàng", type: "INTEGER", required: false, min: 0 },
          { key: "red_channel", label: "Luồng Đỏ", type: "INTEGER", required: false, min: 0 },
          { key: "issues", label: "Vướng mắc phát sinh", type: "LONG_TEXT", required: false },
        ],
        allowNotOccurred: true,
      },
    },
  });

  // 12. Kỳ công tác Tuần 41 (06/10/2026 - 12/10/2026)
  const periodW41 = await prisma.reportingPeriod.create({
    data: {
      type: "WEEK",
      title: "Tuần 41 — Năm 2026",
      startAt: new Date("2026-10-06T00:00:00+07:00"),
      endAt: new Date("2026-10-12T23:59:59+07:00"),
      dueAt: new Date("2026-10-12T17:00:00+07:00"),
      isLocked: false,
    },
  });

  // 13. Kế hoạch công tác Tuần 41 của BP Nghiệp vụ A
  const planA = await prisma.plan.create({
    data: {
      periodId: periodW41.id,
      unitId: deptA.id,
      creatorId: personOfficerA.id,
      title: "Kế hoạch công tác tuần 41 — Bộ phận Nghiệp vụ A",
      status: "APPROVED",
      approvedBy: personLeader.id,
      approvedAt: new Date("2026-10-06T08:30:00+07:00"),
    },
  });

  const planItemTTHQ = await prisma.planItem.create({
    data: {
      planId: planA.id,
      groupId: groupTTHQ.id,
      title: "Thủ tục Hải quan hàng XNK (Tiếp nhận & Phân luồng điện tử)",
      sortOrder: 1,
    },
  });

  // 14. Danh mục đầu việc cá nhân linh hoạt (PersonalWorkItems)
  // Đ/c An có 3 việc; Đ/c Mai có 2 việc (Chứng minh không áp đặt 48 việc cứng)
  const templateTTHQ01 = await prisma.activityTemplate.findUnique({ where: { code: "TTHQ-01" } });
  const templateTTHQ08 = await prisma.activityTemplate.findUnique({ where: { code: "TTHQ-08" } });

  await prisma.personalWorkItem.createMany({
    data: [
      {
        personId: personOfficerA.id,
        periodId: periodW41.id,
        planItemId: planItemTTHQ.id,
        templateId: templateTTHQ01?.id,
        title: "Tiếp nhận, kiểm tra hồ sơ và xử lý tờ khai luồng Vàng / Đỏ phát sinh",
        sortOrder: 1,
        status: "ACTIVE",
      },
      {
        personId: personOfficerA.id,
        periodId: periodW41.id,
        planItemId: planItemTTHQ.id,
        templateId: templateTTHQ08?.id,
        title: "Phúc tập hồ sơ hải quan XNK tồn đọng theo định kỳ tuần",
        sortOrder: 2,
        status: "ACTIVE",
      },
      {
        personId: personOfficerA.id,
        periodId: periodW41.id,
        planItemId: planItemTTHQ.id,
        templateId: null, // Việc đặc thù tự tạo ngoài danh mục mẫu
        title: "Hỗ trợ doanh nghiệp tháo gỡ vướng mắc kiểm tra chuyên ngành nông sản",
        sortOrder: 3,
        status: "ACTIVE",
      },
      {
        personId: personOfficerA2.id,
        periodId: periodW41.id,
        planItemId: planItemTTHQ.id,
        templateId: templateTTHQ01?.id,
        title: "Rà soát chứng từ C/O Form E và trị giá tính thuế hàng nhập khẩu",
        sortOrder: 1,
        status: "ACTIVE",
      },
    ],
  });

  // 15. Nhiệm vụ điều hành cụ thể (Distinct Tasks)
  const task1 = await prisma.task.create({
    data: {
      code: "TSK-1042",
      title: "Rà soát kiểm tra chuyên ngành đối với 15 lô hàng nông sản xuất khẩu",
      description: "Chủ trì phối hợp kiểm dịch thực vật tại luồng xuất khẩu, đảm bảo thông quan trước 16h30.",
      ownerId: personOfficerA.id,
      unitId: deptA.id,
      priority: "Cao",
      status: "IN_PROGRESS",
      originalDeadline: new Date("2026-10-12T16:30:00+07:00"),
      currentDeadline: new Date("2026-10-12T16:30:00+07:00"),
      hasIssue: false,
      expectedResultText: "100% lô hàng nông sản được giải quyết đúng quy trình, không ùn tắc.",
    },
  });

  const task2 = await prisma.task.create({
    data: {
      code: "TSK-1043",
      title: "Xử lý vướng mắc khai báo mã HS mặt hàng máy móc thiết bị nhập khẩu",
      description: "Doanh nghiệp đề nghị tham vấn trị giá và đối chiếu mã HS phụ tùng cơ khí.",
      ownerId: personOfficerA.id,
      unitId: deptA.id,
      priority: "Cao",
      status: "WAITING_REVIEW",
      originalDeadline: new Date("2026-10-10T11:30:00+07:00"),
      currentDeadline: new Date("2026-10-10T11:30:00+07:00"),
      hasIssue: false,
      expectedResultText: "Có biên bản tham vấn và báo cáo đề xuất hướng phân loại.",
    },
  });

  // Liên kết nhiệm vụ vào kế hoạch tuần (PlanTaskLink)
  await prisma.planTaskLink.createMany({
    data: [
      { planItemId: planItemTTHQ.id, taskId: task1.id },
      { planItemId: planItemTTHQ.id, taskId: task2.id },
    ],
  });

  console.log("Seeding completed successfully with 5 groups, 48 activity templates, org units, people, roles, and demo tasks!");
}

main()
  .catch((e) => {
    console.error("Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
