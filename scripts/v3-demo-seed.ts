/**
 * v3-demo-seed.ts — Chuẩn bị dữ liệu DEMO cho môi trường V3 demo (DB LOCAL riêng).
 *
 *   $env:DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/talung_v3_demo"
 *   $env:DIRECT_URL=$env:DATABASE_URL
 *   npx tsx scripts/v3-demo-seed.ts
 *
 * Nội dung (CHỈ trên DB demo local — KHÔNG chạm Production):
 *  1. Đặt lại mật khẩu 3 tài khoản demo về `LocalTest@2026` (hash trong bản sao Production
 *     là mật khẩu đã đổi, không dùng được cho demo).
 *  2. Bảo đảm quan hệ phụ trách (lãnh đạo trực tiếp) DEMO-LD-01 → DEMO-CB-01/CB-02.
 *  3. Tạo 1 đầu việc demo độc lập (không gắn nhiệm vụ) để thử luồng gửi lãnh đạo.
 */
import crypto from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire("D:/thanhnx/OpenCode/talung-cus-work/package.json");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
});

const DEMO_PASSWORD = process.env.V3_DEMO_PASSWORD || "LocalTest@2026";
const TAG = "[V3-DEMO]";

async function main() {
  // Ngày làm việc của DEMO = hôm nay theo giờ Việt Nam (để luôn hiện với bộ lọc
  // mặc định "Hôm nay" của trang Nhật ký công việc).
  const todayVN = new Date(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date())
  );
  const TODAY = new Date(Date.UTC(todayVN.getUTCFullYear(), todayVN.getUTCMonth(), todayVN.getUTCDate()));

  // ---- 1. Mật khẩu tài khoản demo -------------------------------------------
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  for (const username of ["democb01", "democb02", "demold01"]) {
    const acc = await prisma.account.findUnique({ where: { username } });
    if (!acc) {
      console.log(`  [SKIP] ${username}: không có trong DB demo`);
      continue;
    }
    await prisma.account.update({ where: { id: acc.id }, data: { passwordHash: hash } });
    console.log(`  [OK] Đặt mật khẩu demo: ${username}`);
  }

  // ---- 2. Quan hệ phụ trách (lãnh đạo trực tiếp) --------------------------
  const leader = await prisma.person.findFirst({ where: { code: "DEMO-LD-01" } });
  for (const code of ["DEMO-CB-01", "DEMO-CB-02"]) {
    const staff = await prisma.person.findFirst({ where: { code } });
    if (!leader || !staff) {
      console.log(`  [SKIP] Quan hệ phụ trách ${code}: thiếu người`);
      continue;
    }
    const existing = await prisma.personSupervision.findFirst({
      where: { managerPersonId: leader.id, subordinatePersonId: staff.id, status: "CONFIRMED" },
    });
    if (existing) {
      console.log(`  [OK] Quan hệ phụ trách đã có: DEMO-LD-01 → ${code}`);
      continue;
    }
    await prisma.personSupervision.create({
      data: {
        managerPersonId: leader.id,
        subordinatePersonId: staff.id,
        scopeType: "UNIT",
        status: "CONFIRMED",
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        confirmedById: leader.id,
        confirmedAt: new Date(),
        note: "Dữ liệu demo V3 — lãnh đạo trực tiếp",
      },
    });
    console.log(`  [OK] Tạo quan hệ phụ trách: DEMO-LD-01 → ${code}`);
  }

  // ---- 3. Đầu việc demo độc lập để thử luồng gửi lãnh đạo -----------------
  const staff = await prisma.person.findFirst({ where: { code: "DEMO-CB-01" } });
  const period = await prisma.reportingPeriod.findFirst({
    where: { type: "MONTH", title: { contains: "Tháng 10/2026" } },
  });
  if (!staff || !period) {
    console.log("  [SKIP] Thiếu người hoặc kỳ tháng 10/2026 trong DB demo");
    return;
  }
  const existing = await prisma.personalWorkItem.findFirst({
    where: { personId: staff.id, title: { startsWith: TAG } },
  });
  let item = existing;
  if (existing) {
    console.log(`  [OK] Đầu việc demo đã có (reviewState=${existing.reviewState})`);
  } else {
    item = await prisma.personalWorkItem.create({
      data: {
        personId: staff.id,
        periodId: period.id,
        primaryOwnerPersonId: staff.id,
        title: `${TAG} Kiểm tra hồ sơ thu nghiệm V3.0.1`,
        sourceKind: "CUSTOM",
        status: "IN_PROGRESS",
        priority: "Trung bình",
        expectedResult: "Rà soát hồ sơ và gửi lãnh đạo trực tiếp xác nhận",
        dueDate: TODAY,
        workDate: TODAY,
        reviewState: "DRAFT",
      },
    });
    await prisma.workItemAssignment.create({
      data: {
        workItemId: item.id,
        personId: staff.id,
        periodId: period.id,
        role: "PRIMARY_OWNER",
        status: "IN_PROGRESS",
        assignedById: staff.id,
      },
    });
    console.log(`  [OK] Tạo đầu việc demo: ${item.title}`);
    console.log(`       id=${item.id}`);
  }

  // ---- 4. Gắn 3 mã SP QĐ1277 (để thử luồng nhiều SP + xác nhận từng SP) ----
  const version = await prisma.productCatalogVersion.findFirst({ where: { status: "ACTIVE" } });
  const products = version
    ? await prisma.productItem.findMany({
        where: { versionId: version.id, status: "ACTIVE" },
        take: 3,
        orderBy: { code: "asc" },
      })
    : [];
  for (const p of products) {
    const exists = await prisma.workItemProduct.findFirst({
      where: { workItemId: item.id, productItemId: p.id },
    });
    if (exists) continue;
    await prisma.workItemProduct.create({
      data: {
        workItemId: item.id,
        productItemId: p.id,
        reviewState: "PROPOSED",
        proposedById: staff.id,
        proposedAt: new Date(),
        quantity: 10,
        quantityUnit: "bộ",
        note: "Đề xuất mẫu cho phiên thử nghiệm V3",
      },
    });
    console.log(`  [OK] Gắn mã SP đề xuất: ${p.code}`);
  }
}

main()
  .catch((e) => {
    console.error("LỖI seed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
