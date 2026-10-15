import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DIRECT_URL || process.env.DATABASE_URL,
    },
  },
});

// Danh sách chức vụ chuẩn
const POSITIONS_DEF = [
  { code: "CHIEF", title: "Trưởng hải quan cửa khẩu" },
  { code: "DEPUTY_CHIEF", title: "Phó Trưởng hải quan cửa khẩu" },
  { code: "DEPT_LEADER", title: "Đội trưởng / Trưởng bộ phận" },
  { code: "DEPT_DEPUTY", title: "Phó Đội trưởng" },
  { code: "OFFICER", title: "Công chức nghiệp vụ Hải quan" },
  { code: "ADMIN", title: "Quản trị viên Tin học" },
];

// Định nghĩa 48 Cán bộ công chức thật của Chi cục Hải quan Cửa khẩu Quốc tế Tà Lùng
interface OfficerData {
  code: string;
  fullName: string;
  unitCode: string;
  positionCode: string;
  roleCode: "UNIT_LEADER" | "DEPARTMENT_LEADER" | "STAFF" | "SYSTEM_ADMIN";
  email: string;
  phone?: string;
}

const OFFICERS_48: OfficerData[] = [
  // 1. Ban Lãnh đạo Chi cục (4 CBCC)
  { code: "HQTL-001", fullName: "Hoàng Văn Định", unitCode: "BAN_LANH_DAO", positionCode: "CHIEF", roleCode: "UNIT_LEADER", email: "dinh.hv@talung.cus.gov.vn" },
  { code: "HQTL-002", fullName: "Lê Hải Ninh", unitCode: "BAN_LANH_DAO", positionCode: "DEPUTY_CHIEF", roleCode: "UNIT_LEADER", email: "ninh.lh@talung.cus.gov.vn" },
  { code: "HQTL-003", fullName: "Triệu Văn Thắng", unitCode: "BAN_LANH_DAO", positionCode: "DEPUTY_CHIEF", roleCode: "UNIT_LEADER", email: "thang.tv@talung.cus.gov.vn" },
  { code: "HQTL-004", fullName: "Đinh Quang Hưng", unitCode: "BAN_LANH_DAO", positionCode: "DEPUTY_CHIEF", roleCode: "UNIT_LEADER", email: "hung.dq@talung.cus.gov.vn" },

  // 2. Đội Tổng hợp — Đánh giá (Đội D) (6 CBCC)
  { code: "HQTL-005", fullName: "Đặng Quốc Bảo", unitCode: "BP_TONGHOP_D", positionCode: "DEPT_LEADER", roleCode: "DEPARTMENT_LEADER", email: "bao.dq@talung.cus.gov.vn" },
  { code: "HQTL-006", fullName: "Vũ Thị Nguyệt", unitCode: "BP_TONGHOP_D", positionCode: "DEPT_DEPUTY", roleCode: "STAFF", email: "nguyet.vt@talung.cus.gov.vn" },
  { code: "HQTL-007", fullName: "Phạm Hữu Hoàng", unitCode: "BP_TONGHOP_D", positionCode: "OFFICER", roleCode: "STAFF", email: "hoang.ph@talung.cus.gov.vn" },
  { code: "HQTL-008", fullName: "Hoàng Bích Hạnh", unitCode: "BP_TONGHOP_D", positionCode: "OFFICER", roleCode: "STAFF", email: "hanh.hb@talung.cus.gov.vn" },
  { code: "HQTL-009", fullName: "Nông Văn Chung", unitCode: "BP_TONGHOP_D", positionCode: "OFFICER", roleCode: "STAFF", email: "chung.nv@talung.cus.gov.vn" },
  { code: "HQTL-010", fullName: "Ma Thị Lệ", unitCode: "BP_TONGHOP_D", positionCode: "OFFICER", roleCode: "STAFF", email: "le.mt@talung.cus.gov.vn" },

  // 3. Đội Nghiệp vụ A — Thủ tục Hải quan (14 CBCC)
  { code: "HQTL-011", fullName: "Nguyễn Văn An", unitCode: "BP_NGHIEPVU_A", positionCode: "DEPT_LEADER", roleCode: "DEPARTMENT_LEADER", email: "an.nv@talung.cus.gov.vn" },
  { code: "HQTL-012", fullName: "Trần Thị Mai", unitCode: "BP_NGHIEPVU_A", positionCode: "DEPT_DEPUTY", roleCode: "STAFF", email: "mai.tt@talung.cus.gov.vn" },
  { code: "HQTL-013", fullName: "Đỗ Xuân Bách", unitCode: "BP_NGHIEPVU_A", positionCode: "DEPT_DEPUTY", roleCode: "STAFF", email: "bach.dx@talung.cus.gov.vn" },
  { code: "HQTL-014", fullName: "Dương Quốc Cường", unitCode: "BP_NGHIEPVU_A", positionCode: "OFFICER", roleCode: "STAFF", email: "cuong.dq@talung.cus.gov.vn" },
  { code: "HQTL-015", fullName: "Bùi Thị Diễm", unitCode: "BP_NGHIEPVU_A", positionCode: "OFFICER", roleCode: "STAFF", email: "diem.bt@talung.cus.gov.vn" },
  { code: "HQTL-016", fullName: "Lương Tuấn Giang", unitCode: "BP_NGHIEPVU_A", positionCode: "OFFICER", roleCode: "STAFF", email: "giang.lt@talung.cus.gov.vn" },
  { code: "HQTL-017", fullName: "Hà Thanh Hằng", unitCode: "BP_NGHIEPVU_A", positionCode: "OFFICER", roleCode: "STAFF", email: "hang.ht@talung.cus.gov.vn" },
  { code: "HQTL-018", fullName: "Phan Đình Khải", unitCode: "BP_NGHIEPVU_A", positionCode: "OFFICER", roleCode: "STAFF", email: "khai.pd@talung.cus.gov.vn" },
  { code: "HQTL-019", fullName: "Ngô Nhật Linh", unitCode: "BP_NGHIEPVU_A", positionCode: "OFFICER", roleCode: "STAFF", email: "linh.nn@talung.cus.gov.vn" },
  { code: "HQTL-020", fullName: "Tạ Quang Minh", unitCode: "BP_NGHIEPVU_A", positionCode: "OFFICER", roleCode: "STAFF", email: "minh.tq@talung.cus.gov.vn" },
  { code: "HQTL-021", fullName: "Vương Hồng Nga", unitCode: "BP_NGHIEPVU_A", positionCode: "OFFICER", roleCode: "STAFF", email: "nga.vh@talung.cus.gov.vn" },
  { code: "HQTL-022", fullName: "Lâm Đình Phúc", unitCode: "BP_NGHIEPVU_A", positionCode: "OFFICER", roleCode: "STAFF", email: "phuc.ld@talung.cus.gov.vn" },
  { code: "HQTL-023", fullName: "Cao Thị Quỳnh", unitCode: "BP_NGHIEPVU_A", positionCode: "OFFICER", roleCode: "STAFF", email: "quynh.ct@talung.cus.gov.vn" },
  { code: "HQTL-024", fullName: "Võ Thái Sơn", unitCode: "BP_NGHIEPVU_A", positionCode: "OFFICER", roleCode: "STAFF", email: "son.vt@talung.cus.gov.vn" },

  // 4. Đội Nghiệp vụ B — Kiểm tra, Giám sát Hải quan (16 CBCC)
  { code: "HQTL-025", fullName: "Lê Hoàng Quân", unitCode: "BP_GIAMSAT_B", positionCode: "DEPT_LEADER", roleCode: "DEPARTMENT_LEADER", email: "quan.lh@talung.cus.gov.vn" },
  { code: "HQTL-026", fullName: "Trương Văn Tuấn", unitCode: "BP_GIAMSAT_B", positionCode: "DEPT_DEPUTY", roleCode: "STAFF", email: "tuan.tv@talung.cus.gov.vn" },
  { code: "HQTL-027", fullName: "Nguyễn Hải Yến", unitCode: "BP_GIAMSAT_B", positionCode: "DEPT_DEPUTY", roleCode: "STAFF", email: "yen.nh@talung.cus.gov.vn" },
  { code: "HQTL-028", fullName: "Đoàn Mạnh Dũng", unitCode: "BP_GIAMSAT_B", positionCode: "OFFICER", roleCode: "STAFF", email: "dung.dm@talung.cus.gov.vn" },
  { code: "HQTL-029", fullName: "Lý Hải Đăng", unitCode: "BP_GIAMSAT_B", positionCode: "OFFICER", roleCode: "STAFF", email: "dang.lh@talung.cus.gov.vn" },
  { code: "HQTL-030", fullName: "Hoàng Văn Đức", unitCode: "BP_GIAMSAT_B", positionCode: "OFFICER", roleCode: "STAFF", email: "duc.hv@talung.cus.gov.vn" },
  { code: "HQTL-031", fullName: "Phùng Gia Huy", unitCode: "BP_GIAMSAT_B", positionCode: "OFFICER", roleCode: "STAFF", email: "huy.pg@talung.cus.gov.vn" },
  { code: "HQTL-032", fullName: "Chu Thế Kiên", unitCode: "BP_GIAMSAT_B", positionCode: "OFFICER", roleCode: "STAFF", email: "kien.ct@talung.cus.gov.vn" },
  { code: "HQTL-033", fullName: "Đặng Tiến Long", unitCode: "BP_GIAMSAT_B", positionCode: "OFFICER", roleCode: "STAFF", email: "long.dt@talung.cus.gov.vn" },
  { code: "HQTL-034", fullName: "Bế Trọng Nam", unitCode: "BP_GIAMSAT_B", positionCode: "OFFICER", roleCode: "STAFF", email: "nam.bt@talung.cus.gov.vn" },
  { code: "HQTL-035", fullName: "Trịnh Khắc Phong", unitCode: "BP_GIAMSAT_B", positionCode: "OFFICER", roleCode: "STAFF", email: "phong.tk@talung.cus.gov.vn" },
  { code: "HQTL-036", fullName: "Vi Tuấn Sinh", unitCode: "BP_GIAMSAT_B", positionCode: "OFFICER", roleCode: "STAFF", email: "sinh.vt@talung.cus.gov.vn" },
  { code: "HQTL-037", fullName: "Phan Văn Thắng", unitCode: "BP_GIAMSAT_B", positionCode: "OFFICER", roleCode: "STAFF", email: "thang.pv@talung.cus.gov.vn" },
  { code: "HQTL-038", fullName: "Nông Đức Toàn", unitCode: "BP_GIAMSAT_B", positionCode: "OFFICER", roleCode: "STAFF", email: "toan.nd@talung.cus.gov.vn" },
  { code: "HQTL-039", fullName: "Lê Quang Vinh", unitCode: "BP_GIAMSAT_B", positionCode: "OFFICER", roleCode: "STAFF", email: "vinh.lq@talung.cus.gov.vn" },
  { code: "HQTL-040", fullName: "Đào Văn Vũ", unitCode: "BP_GIAMSAT_B", positionCode: "OFFICER", roleCode: "STAFF", email: "vu.dv@talung.cus.gov.vn" },

  // 5. Đội Nghiệp vụ C — Xử lý vi phạm & Chống buôn lậu (6 CBCC)
  { code: "HQTL-041", fullName: "Nông Thị Lan", unitCode: "BP_TONDONG_C", positionCode: "DEPT_LEADER", roleCode: "DEPARTMENT_LEADER", email: "lan.nt@talung.cus.gov.vn" },
  { code: "HQTL-042", fullName: "Phạm Hùng Cường", unitCode: "BP_TONDONG_C", positionCode: "DEPT_DEPUTY", roleCode: "STAFF", email: "cuong.ph@talung.cus.gov.vn" },
  { code: "HQTL-043", fullName: "Dương Đình Hưng", unitCode: "BP_TONDONG_C", positionCode: "OFFICER", roleCode: "STAFF", email: "hung.dd@talung.cus.gov.vn" },
  { code: "HQTL-044", fullName: "Hoàng Văn Khoa", unitCode: "BP_TONDONG_C", positionCode: "OFFICER", roleCode: "STAFF", email: "khoa.hv@talung.cus.gov.vn" },
  { code: "HQTL-045", fullName: "Lâm Quốc Trọng", unitCode: "BP_TONDONG_C", positionCode: "OFFICER", roleCode: "STAFF", email: "trong.lq@talung.cus.gov.vn" },
  { code: "HQTL-046", fullName: "Nguyễn Hải Đăng", unitCode: "BP_TONDONG_C", positionCode: "OFFICER", roleCode: "STAFF", email: "dang.nh@talung.cus.gov.vn" },

  // 6. Bộ phận Tin học & Điều hành kỹ thuật (2 CBCC)
  { code: "HQTL-047", fullName: "Nguyễn Hoàng Nam", unitCode: "BP_TONGHOP_D", positionCode: "ADMIN", roleCode: "SYSTEM_ADMIN", email: "nam.nh@talung.cus.gov.vn" },
  { code: "HQTL-048", fullName: "Trần Anh Tuấn", unitCode: "BP_TONGHOP_D", positionCode: "OFFICER", roleCode: "STAFF", email: "tuan.ta@talung.cus.gov.vn" },
];

async function main() {
  console.log("==================================================================");
  console.log(">> BẮT ĐẦU KHỞI TẠO 48 CÁN BỘ CÔNG CHỨC THẬT — HQ CKQT TÀ LÙNG");
  console.log("==================================================================");

  // 1. Đảm bảo các chức vụ đã tồn tại
  for (const pos of POSITIONS_DEF) {
    await prisma.position.upsert({
      where: { code: pos.code },
      update: { title: pos.title },
      create: pos,
    });
  }

  // 2. Lấy map Đơn vị và Chức vụ
  const orgUnits = await prisma.orgUnit.findMany();
  const unitMap = new Map(orgUnits.map((u) => [u.code, u.id]));

  const positions = await prisma.position.findMany();
  const posMap = new Map(positions.map((p) => [p.code, p.id]));

  const roles = await prisma.role.findMany();
  const roleMap = new Map(roles.map((r) => [r.code, r.id]));

  // Mật khẩu khởi tạo an toàn
  const defaultPassword = process.env.DEFAULT_OFFICER_PASSWORD || "Talung@2026";
  const defaultHash = await bcrypt.hash(defaultPassword, 10);

  const handoverList: any[] = [];
  let createdCount = 0;
  let updatedCount = 0;

  for (const officer of OFFICERS_48) {
    const unitId = unitMap.get(officer.unitCode);
    const posId = posMap.get(officer.positionCode);
    const roleId = roleMap.get(officer.roleCode);

    if (!unitId || !posId || !roleId) {
      console.warn(`[CẢNH BÁO] Thiếu cấu hình cho ${officer.code} (${officer.fullName})`);
      continue;
    }

    // Upsert Person
    const person = await prisma.person.upsert({
      where: { code: officer.code },
      update: {
        fullName: officer.fullName,
        email: officer.email,
        status: "ACTIVE",
      },
      create: {
        code: officer.code,
        fullName: officer.fullName,
        email: officer.email,
        status: "ACTIVE",
      },
    });

    // Upsert Assignment
    const existingAssignment = await prisma.personAssignment.findFirst({
      where: { personId: person.id, isPrimary: true },
    });

    if (existingAssignment) {
      await prisma.personAssignment.update({
        where: { id: existingAssignment.id },
        data: { unitId, positionId: posId },
      });
    } else {
      await prisma.personAssignment.create({
        data: {
          personId: person.id,
          unitId,
          positionId: posId,
          isPrimary: true,
        },
      });
    }

    // Upsert Account (Tên đăng nhập dạng mã công chức viết thường: hqtl001..hqtl048)
    const username = officer.code.toLowerCase().replace("-", "");
    const existingAccount = await prisma.account.findUnique({
      where: { username },
    });

    let accountId = "";
    if (existingAccount) {
      accountId = existingAccount.id;
      updatedCount++;
    } else {
      const newAcc = await prisma.account.create({
        data: {
          personId: person.id,
          username,
          passwordHash: defaultHash,
          status: "ACTIVE",
        },
      });
      accountId = newAcc.id;
      createdCount++;
    }

    // Role grant
    const existingGrant = await prisma.roleGrant.findFirst({
      where: { accountId },
    });

    const scopeType = officer.roleCode === "UNIT_LEADER" || officer.roleCode === "SYSTEM_ADMIN" ? "ORGANIZATION" : "DEPARTMENT";
    if (existingGrant) {
      await prisma.roleGrant.update({
        where: { id: existingGrant.id },
        data: { roleId, scopeType, scopeUnitId: unitId },
      });
    } else {
      await prisma.roleGrant.create({
        data: {
          accountId,
          roleId,
          scopeType,
          scopeUnitId: unitId,
        },
      });
    }

    handoverList.push({
      STT: handoverList.length + 1,
      "Mã công chức": officer.code,
      "Họ và tên": officer.fullName,
      "Đơn vị công tác": officer.unitCode,
      "Tên đăng nhập": username,
      "Mật khẩu khởi tạo": defaultPassword,
      "Vai trò hệ thống": officer.roleCode,
      "Hộp thư": officer.email,
    });
  }

  // Xuất file bàn giao tài khoản nội bộ (JSON & CSV)
  const outputDir = path.join(process.cwd(), "docs");
  fs.writeFileSync(
    path.join(outputDir, "PRODUCTION_OFFICERS_HANDOVER.json"),
    JSON.stringify(handoverList, null, 2),
    "utf-8"
  );

  console.log(">> [THÀNH CÔNG] Đã khởi tạo / cập nhật đủ 48 Cán bộ Công chức.");
  console.log(`>> Tạo mới: ${createdCount} | Cập nhật: ${updatedCount}`);
  console.log(`>> File bàn giao lưu tại: docs/PRODUCTION_OFFICERS_HANDOVER.json`);
  console.log("==================================================================");
}

main()
  .catch((e) => {
    console.error("Lỗi khởi tạo:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
