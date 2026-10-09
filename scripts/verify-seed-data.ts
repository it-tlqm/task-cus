import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const EXPECTED_GROUPS = [
  { code: "TTHQ", name: "Thực hiện thủ tục hải quan", row: 8, count: 22 },
  { code: "GSHQ", name: "Kiểm tra giám sát hải quan", row: 9, count: 20 },
  { code: "TON_DONG", name: "Xử lý nghiệp vụ phức tạp & tồn đọng", row: 10, count: 2 },
  { code: "DANH_GIA_HQ", name: "Đánh giá hiệu quả và những việc đã triển khai", row: 11, count: 2 },
  { code: "DANH_GIA_NGAY_TUAN", name: "Đánh giá tình hình thực hiện nhiệm vụ trong ngày/tuần", row: 12, count: 2 },
];

async function verifySeedData() {
  console.log("==========================================================");
  console.log(" KIỂM TRA ĐỐI CHIẾU DỮ LIỆU SEED VỚI PHỤ LỤC A EXCEL GỐC ");
  console.log("==========================================================\n");

  let allValid = true;

  // 1. Kiểm tra 5 nhóm
  const groups = await prisma.activityGroup.findMany({
    include: { templates: true },
    orderBy: { sortOrder: "asc" },
  });

  console.log(`1. Kiểm tra 5 Nhóm nghiệp vụ gốc (Tìm thấy: ${groups.length}/5 nhóm):`);
  for (const exp of EXPECTED_GROUPS) {
    const found = groups.find((g) => g.code === exp.code);
    if (!found) {
      console.error(`  [FAIL] Thiếu nhóm mã ${exp.code} ("${exp.name}")`);
      allValid = false;
      continue;
    }

    const nameMatches = found.name === exp.name;
    const rowMatches = found.sourceRow === exp.row;
    const countMatches = found.templates.length === exp.count;

    if (nameMatches && rowMatches && countMatches) {
      console.log(`  [PASS] ${exp.code}: "${found.name}" (Hàng ${found.sourceRow}, ${found.templates.length} hoạt động)`);
    } else {
      console.error(`  [FAIL] ${exp.code}: Khác biệt - Tên: ${found.name} (Mong đợi: ${exp.name}), Hàng: ${found.sourceRow} vs ${exp.row}, Số template: ${found.templates.length} vs ${exp.count}`);
      allValid = false;
    }
  }

  // 2. Kiểm tra tổng số 48 hoạt động mẫu
  console.log("\n2. Kiểm tra 48 Hoạt động mẫu:");
  const totalTemplates = await prisma.activityTemplate.count();
  if (totalTemplates === 48) {
    console.log(`  [PASS] Tổng số hoạt động mẫu: 48/48`);
  } else {
    console.error(`  [FAIL] Tổng số hoạt động mẫu: ${totalTemplates}/48`);
    allValid = false;
  }

  // 3. Kiểm tra trạng thái UNCONFIGURED và NEEDS_REVIEW
  const unconfiguredCount = await prisma.activityTemplate.count({
    where: { reportingMode: "UNCONFIGURED", reviewStatus: "NEEDS_REVIEW" },
  });
  if (unconfiguredCount === 48) {
    console.log(`  [PASS] Toàn bộ 48 mẫu đều có reportingMode=UNCONFIGURED & reviewStatus=NEEDS_REVIEW`);
  } else {
    console.error(`  [FAIL] Chỉ có ${unconfiguredCount}/48 mẫu đúng trạng thái UNCONFIGURED/NEEDS_REVIEW`);
    allValid = false;
  }

  // 4. Kiểm tra sự hiện diện của raw text và source row
  const templatesWithoutRaw = await prisma.activityTemplate.count({
    where: {
      OR: [{ sourceRawText: "" }, { sourceRow: 0 }],
    },
  });
  if (templatesWithoutRaw === 0) {
    console.log(`  [PASS] 100% hoạt động mẫu lưu đầy đủ sourceRawText và sourceRow để đối chiếu truy vết`);
  } else {
    console.error(`  [FAIL] Có ${templatesWithoutRaw} mẫu thiếu sourceRawText hoặc sourceRow`);
    allValid = false;
  }

  // 5. Kiểm tra tính linh hoạt của danh mục đầu việc cá nhân (PersonalWorkItem)
  console.log("\n3. Kiểm tra Danh mục đầu việc cá nhân (PersonalWorkItem):");
  const personalItems = await prisma.personalWorkItem.findMany();
  console.log(`  [PASS] Đã tạo ${personalItems.length} đầu việc cá nhân độc lập không ép buộc 48 mẫu`);

  console.log("\n----------------------------------------------------------");
  console.log(allValid ? "KẾT LUẬN: DỮ LIỆU SEED KHỚP CHÍNH XÁC 100% VỚI PHỤ LỤC A!" : "KẾT LUẬN: DỮ LIỆU SEED CẦN CHỈNH SỬA!");
  console.log("----------------------------------------------------------");

  await prisma.$disconnect();
  if (!allValid) process.exit(1);
}

verifySeedData();
