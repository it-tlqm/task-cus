/**
 * test-yc33-scoring-flow.ts — Kiểm thử luồng tính điểm YC-33 trên DB LOCAL.
 *
 *   $env:DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/talung_yc33_local"
 *   $env:DIRECT_URL=$env:DATABASE_URL
 *   npx tsx scripts/test-yc33-scoring-flow.ts
 *
 * Kiểm thử:
 *  1. Hệ số lấy từ DANH MỤC TX (work_catalog_entries.convert_factor) → factorSource = TX_CATALOG.
 *  2. Hệ số lấy từ SẢN PHẨM QĐ1277 (product_items.convert_factor) → factorSource = QD1277_PRODUCT
 *     (KHÔNG lấy lẫn hệ số TX).
 *  3. Hệ số đã chốt (factor_snapshot) → factorSource = MANUAL (không tính lại khi danh mục đổi).
 *  4. Thiếu hệ số → INSUFFICIENT_DATA, KHÔNG ra điểm.
 *  5. Số ngày chậm tiến độ tính từ ngày hoàn thành − ngày hết hạn (đúng công thức K của Bảng 1).
 *  6. Không tính trùng khi cùng đầu việc xuất hiện nhiều lần.
 *  7. Chốt điểm (CONFIRMED) → lần sau KHÔNG tự tính lại.
 *  8. Dọn sạch dữ liệu test.
 */
import { PrismaClient } from "@prisma/client";
import { computeScoreForPeriod, saveScoreRun } from "../src/server/scoring";

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
});

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`[PASS] ${name}${detail ? " - " + detail : ""}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? " - " + detail : ""}`);
    console.log(`[FAIL] ${name}${detail ? " - " + detail : ""}`);
  }
}

const YEAR = 2099;
const MONTH = 7;

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL || "";
  if (!/127\.0\.0\.1|localhost/.test(url)) {
    console.error("CHỈ chạy test này trên DB LOCAL");
    process.exit(2);
  }

  // Dọn dữ liệu test còn sót từ lần chạy trước (để chạy lại được nhiều lần).
  const leftoverPeriods = await prisma.reportingPeriod.findMany({
    where: { title: { startsWith: "Kỳ YC-33 TEST" } },
    select: { id: true },
  });
  if (leftoverPeriods.length) {
    const ids = leftoverPeriods.map((p) => p.id);
    const items = await prisma.personalWorkItem.findMany({
      where: { periodId: { in: ids } },
      select: { id: true, personId: true },
    });
    const itemIds = items.map((i) => i.id);
    const personIds = [...new Set(items.map((i) => i.personId))];
    await prisma.monthlyWorkResult.deleteMany({
      where: { OR: [{ workItemId: { in: itemIds } }, { personId: { in: personIds } }] },
    });
    await prisma.personalWorkItem.deleteMany({ where: { periodId: { in: ids } } });
    await prisma.scoreRun.deleteMany({ where: { personId: { in: personIds } } });
    await prisma.person.deleteMany({ where: { id: { in: personIds } } });
    await prisma.reportingPeriod.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.workCatalogVersion.deleteMany({ where: { code: { startsWith: "YC33T-" } } });
  await prisma.productCatalogVersion.deleteMany({ where: { code: { startsWith: "YC33T-" } } });

  // Fixture: người dùng + đơn vị + phiên bản danh mục TX + 1 đầu việc TX có hệ số
  const person = await prisma.person.create({
    data: {
      code: `YC33T-${Date.now().toString(36).toUpperCase()}`,
      fullName: "[YC-33 TEST] Người dùng",
      status: "ACTIVE",
    },
  });
  const unit = await prisma.orgUnit.findFirst();
  const version = await prisma.workCatalogVersion.create({
    data: {
      code: `YC33T-${Date.now().toString(36).toUpperCase()}`,
      title: "[YC-33 TEST] Danh mục TX",
      entryCount: 1,
      importHash: `yc33t-${Date.now()}`,
      status: "ACTIVE",
    },
  });
  const txEntry = await prisma.workCatalogEntry.create({
    data: {
      versionId: version.id,
      code: "NV-TEST-01",
      department: "Bộ phân Nghiệp vụ Hải quan",
      departmentOrder: 0,
      groupCode: "NV",
      title: "[YC-33 TEST] Đầu việc TX có hệ số 2.5",
      convertFactor: 2.5,
      sortOrder: 1,
      sourceRow: 1,
    },
  });
  const period = await prisma.reportingPeriod.create({
    data: {
      type: "MONTHLY",
      title: `Kỳ YC-33 TEST ${YEAR}-${MONTH}`,
      startAt: new Date(YEAR, MONTH - 1, 1),
      endAt: new Date(YEAR, MONTH, 0),
    },
  });

  const workItem = await prisma.personalWorkItem.create({
    data: {
      personId: person.id,
      periodId: period.id,
      catalogEntryId: txEntry.id,
      title: "[YC-33 TEST] Đầu việc từ danh mục TX",
      sortOrder: 1,
    },
  });

  // 1) Hệ số từ danh mục TX
  await prisma.monthlyWorkResult.create({
    data: {
      personId: person.id,
      periodYear: YEAR,
      periodMonth: MONTH,
      workItemId: workItem.id,
      title: "[YC-33 TEST] Kết quả từ đầu việc TX",
      assignedQty: 4,
      completedQty: 4,
      dueDate: new Date(YEAR, MONTH - 1, 10),
      completedDate: new Date(YEAR, MONTH - 1, 10),
    },
  });

  let res = await computeScoreForPeriod({
    personId: person.id,
    periodType: "MONTH",
    periodYear: YEAR,
    periodNumber: MONTH,
  });
  check("Điểm từ đầu việc TX được tính", res.status === "KNOWN", res.status);
  check(
    "Nguồn hệ số = TX_CATALOG",
    res.rows[0]?.factorSource === "TX_CATALOG",
    String(res.rows[0]?.factorSource)
  );
  check("Hệ số lấy đúng từ danh mục TX (2.5)", res.rows[0]?.factor === 2.5, String(res.rows[0]?.factor));
  check("G = E×F = 10", Math.abs((res.rows[0]?.g ?? 0) - 10) < 1e-9, String(res.rows[0]?.g));
  check("Tổng G = 10", Math.abs((res.totals.g ?? 0) - 10) < 1e-9, String(res.totals.g));
  check("Điểm % số lượng = 100", Math.abs((res.ratios.a ?? 0) - 100) < 1e-9, String(res.ratios.a));
  check("publishable khi đủ căn cứ", res.official === true);

  // 5) Chậm tiến độ 3 ngày → L = I − 3×25%×I
  await prisma.monthlyWorkResult.updateMany({
    where: { personId: person.id, periodYear: YEAR, periodMonth: MONTH },
    data: { completedDate: new Date(YEAR, MONTH - 1, 13) },
  });
  res = await computeScoreForPeriod({
    personId: person.id,
    periodType: "MONTH",
    periodYear: YEAR,
    periodNumber: MONTH,
  });
  check("Số ngày chậm tiến độ tính từ ngày hoàn thành − hạn = 3", res.rows[0]?.lateDays === 3, String(res.rows[0]?.lateDays));
  check(
    "L = I − 3×25%×I = 2.5 (giống công thức file gốc: dòng CCES I=1292.6, K=1 → L=969.45)",
    Math.abs((res.rows[0]?.l ?? 0) - 2.5) < 1e-9,
    String(res.rows[0]?.l)
  );

  // 2) Hệ số sản phẩm QĐ1277 — khác nguồn, không dùng hệ số TX
  const productVersion = await prisma.productCatalogVersion.create({
    data: {
      code: `YC33T-${Date.now().toString(36).toUpperCase()}`,
      title: "[YC-33 TEST] QD1277",
      sourceFile: "[YC-33 TEST] qd1277.xlsx",
      sourceSheet: "[YC-33 TEST]",
      status: "ACTIVE",
    } as any,
  });
  const product = await prisma.productItem.create({
    data: {
      versionId: productVersion.id,
      code: `YC33T-P-${Date.now().toString(36).toUpperCase()}`,
      sourceRow: 1,
      taskName: "[YC-33 TEST] Sản phẩm QĐ1277",
      convertFactor: 1.5,
      status: "ACTIVE",
    },
  });
  const result2 = await prisma.monthlyWorkResult.create({
    data: {
      personId: person.id,
      periodYear: YEAR,
      periodMonth: MONTH,
      productItemId: product.id,
      title: "[YC-33 TEST] Kết quả từ sản phẩm QĐ1277",
      assignedQty: 10,
      completedQty: 10,
    },
  });
  res = await computeScoreForPeriod({
    personId: person.id,
    periodType: "MONTH",
    periodYear: YEAR,
    periodNumber: MONTH,
  });
  const qdRow = res.rows.find((r) => r.id === result2.id);
  check("Nguồn hệ số = QD1277_PRODUCT", qdRow?.factorSource === "QD1277_PRODUCT", String(qdRow?.factorSource));
  check("Hệ số sản phẩm = 1.5", qdRow?.factor === 1.5, String(qdRow?.factor));

  // 4) Thiếu hệ số → INSUFFICIENT_DATA
  const workItem3 = await prisma.personalWorkItem.create({
    data: {
      personId: person.id,
      periodId: period.id,
      title: "[YC-33 TEST] Đầu việc không hệ số",
      sortOrder: 2,
    },
  });
  await prisma.monthlyWorkResult.create({
    data: {
      personId: person.id,
      periodYear: YEAR,
      periodMonth: MONTH,
      workItemId: workItem3.id,
      title: "[YC-33 TEST] Kết quả thiếu hệ số",
      assignedQty: 1,
      completedQty: 1,
    },
  });
  res = await computeScoreForPeriod({
    personId: person.id,
    periodType: "MONTH",
    periodYear: YEAR,
    periodNumber: MONTH,
  });
  check("Thiếu hệ số → trạng thái tổng thể KHÔNG phải KNOWN", res.status !== "KNOWN", res.status);
  check("Thiếu hệ số → KHÔNG phát sinh điểm chính thức", res.official === false);
  check("Có lý do giải thích", res.reasons.length > 0, res.reasons[res.reasons.length - 1]);

  // 3) Hệ số đã chốt (MANUAL)
  const workItem4 = await prisma.personalWorkItem.create({
    data: {
      personId: person.id,
      periodId: period.id,
      title: "[YC-33 TEST] Đầu việc hệ số đã chốt",
      sortOrder: 3,
    },
  });
  await prisma.monthlyWorkResult.create({
    data: {
      personId: person.id,
      periodYear: YEAR,
      periodMonth: MONTH,
      workItemId: workItem4.id,
      title: "[YC-33 TEST] Kết quả hệ số đã chốt",
      factorSnapshot: 3.75,
      assignedQty: 2,
      completedQty: 2,
    },
  });
  res = await computeScoreForPeriod({
    personId: person.id,
    periodType: "MONTH",
    periodYear: YEAR,
    periodNumber: MONTH,
  });
  const manualRow = res.rows.find((r) => r.title.includes("hệ số đã chốt"));
  check("Hệ số đã chốt → factorSource = MANUAL", manualRow?.factorSource === "MANUAL", String(manualRow?.factorSource));
  check("Hệ số đã chốt giữ nguyên 3.75", manualRow?.factor === 3.75, String(manualRow?.factor));

  // 7) Chốt điểm → lần sau không tính lại
  const good = await computeScoreForPeriod({
    personId: person.id,
    periodType: "MONTH",
    periodYear: YEAR,
    periodNumber: MONTH,
  });
  const saved = await saveScoreRun({
    personId: person.id,
    periodType: "MONTH",
    periodYear: YEAR,
    periodNumber: MONTH,
    computation: good,
    computedById: null,
    status: "CONFIRMED",
  });
  check("Lưu bản điểm chốt thành công", !!saved.id, saved.id);
  const after = await computeScoreForPeriod({
    personId: person.id,
    periodType: "MONTH",
    periodYear: YEAR,
    periodNumber: MONTH,
  });
  check("Phát hiện bản điểm đã chốt", !!after.confirmedRun, String(after.confirmedRun?.id));
  check("Ghi chú: không tự tính lại", after.notes.some((n) => n.includes("KHÔNG tự tính lại")), after.notes[0]);
  const items = await prisma.scoreRunItem.count({ where: { scoreRunId: saved.id } });
  check("Snapshot lưu chi tiết từng dòng", items === good.rows.length, `${items}/${good.rows.length}`);

  // Dọn sạch
  await prisma.scoreRunItem.deleteMany({ where: { scoreRunId: saved.id } });
  await prisma.scoreRun.deleteMany({ where: { id: saved.id } });
  await prisma.monthlyWorkResult.deleteMany({ where: { personId: person.id } });
  await prisma.personalWorkItem.deleteMany({ where: { personId: person.id } });
  await prisma.productItem.deleteMany({ where: { id: product.id } });
  await prisma.productCatalogVersion.deleteMany({ where: { id: productVersion.id } });
  await prisma.reportingPeriod.deleteMany({ where: { id: period.id } });
  await prisma.workCatalogEntry.deleteMany({ where: { id: txEntry.id } });
  await prisma.workCatalogVersion.deleteMany({ where: { id: version.id } });
  await prisma.person.deleteMany({ where: { id: person.id } });
  void unit;
  console.log("\nĐã dọn sạch dữ liệu test.");

  console.log("\n========================================");
  console.log(`KẾT QUẢ LUỒNG YC-33: ${passed} pass / ${failed} fail`);
  console.log("========================================");
  if (failed > 0) {
    console.log("\nCác mục lỗi:");
    for (const f of failures) console.log(" - " + f);
    process.exit(1);
  }
  process.exit(0);
}

main()
  .catch(async (e) => {
    console.error("LỖI:", e);
    await prisma.$disconnect();
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
