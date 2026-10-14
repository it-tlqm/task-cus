import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("==================================================================");
  console.log(">> PHÊ DUYỆT BAN HÀNH DANH MỤC 48 HOẠT ĐỘNG MẪU CHÍNH THỨC");
  console.log("==================================================================");

  const templates = await prisma.activityTemplate.findMany({
    include: { group: true },
  });

  console.log(`>> Tìm thấy ${templates.length} hoạt động mẫu.`);

  // Cấu hình chế độ báo cáo theo đặc thù nghiệp vụ hải quan:
  // - Nhóm 1 (TTHQ): ON_OCCURRENCE (Theo vụ việc phát sinh: mở tờ khai, kiểm hóa, v.v.)
  // - Nhóm 2 (GSHQ): EVERY_PERIOD (Định kỳ hàng ngày/tuần: trực cổng, tuần tra, soi chiếu)
  // - Nhóm 3 (TON_DONG): ON_OCCURRENCE (Xử lý hàng tồn đọng, tang vật)
  // - Nhóm 4 (DANH_GIA_HQ): EVERY_PERIOD (Đánh giá hiệu quả công tác tuần/tháng)
  // - Nhóm 5 (DANH_GIA_NGAY_TUAN): EVERY_PERIOD (Chấm điểm định kỳ)
  let updatedCount = 0;

  for (const t of templates) {
    let mode = "ON_OCCURRENCE";
    if (t.group.code === "GSHQ" || t.group.code === "DANH_GIA_HQ" || t.group.code === "DANH_GIA_NGAY_TUAN") {
      mode = "EVERY_PERIOD";
    }

    await prisma.activityTemplate.update({
      where: { id: t.id },
      data: {
        reviewStatus: "VERIFIED",
        reportingMode: mode,
      },
    });
    updatedCount++;
  }

  // Ghi nhật ký kiểm toán hệ thống
  await prisma.auditEvent.create({
    data: {
      action: "CATALOG_APPROVED",
      resourceType: "ActivityTemplate",
      newData: {
        totalTemplates: updatedCount,
        status: "VERIFIED",
        approvedBy: "Lãnh đạo Chi cục Hải quan CKQT Tà Lùng",
        timestamp: new Date().toISOString(),
      },
    },
  });

  console.log(`>> [THÀNH CÔNG] Đã phê duyệt chính thức ${updatedCount} hoạt động mẫu sang trạng thái VERIFIED!`);
  console.log(">> Đã ghi vết kiểm toán CATALOG_APPROVED vào bảng audit_events.");
  console.log("==================================================================");
}

main()
  .catch((e) => {
    console.error("Lỗi:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
