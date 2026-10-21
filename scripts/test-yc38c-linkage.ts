/**
 * test-yc38c-linkage.ts — Kiểm thử liên thông dữ liệu YC-38C trên DB LOCAL.
 *
 *   $env:DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/talung_yc38_restore"
 *   $env:DIRECT_URL=$env:DATABASE_URL
 *   npx tsx scripts/test-yc38c-linkage.ts
 *
 * Ma trận 20 tình huống (bộ này kiểm tra các tình huống ở tầng DB/logic):
 *  T1  1 việc giao 1 người        → 1 work item, 1 chủ trì
 *  T2  1 việc giao bộ phận        → primary_owner_unit_id, KHÔNG có chủ trì cá nhân
 *  T3  1 việc giao nhiều người    → 1 work item + N dòng phân công, KHÔNG nhân bản việc gốc
 *  T5  1 kế hoạch nhiều kỳ        → cùng series_code
 *  T7  1 task có nhiều work item   → hợp lệ, không coi là trùng
 *  T10 1 việc nhiều SP QĐ1277      → work_item_products nhiều dòng, hệ số KHÔNG cộng
 *  T12 double-click/retry          → 1 bản ghi (idempotency_key)
 *  T16 dữ liệu DEMO/lịch sử        → không bị sửa/xoá
 *  +   TX và QĐ1277 độc lập        → 2 trục, provenance bất biến
 *  +   chống ghi trùng kết quả tháng
 */
import { PrismaClient } from "@prisma/client";
import {
  createLinkedWorkItem,
  resolveMonthlyPeriod,
  resolveWorkSource,
  buildIdempotencyKey,
  buildSeriesCode,
} from "../src/server/work-item-linkage";

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

const TEST_TAG = "[YC38C-TEST]";

async function main() {
  console.log("=== YC-38C — Kiểm thử liên thông dữ liệu ===\n");

  const persons = await prisma.person.findMany({ take: 3, orderBy: { createdAt: "asc" } });
  if (persons.length < 2) throw new Error("cần ít nhất 2 người trong DB local");
  const owner = persons[0];
  const colleague = persons[1];
  const unit = await prisma.orgUnit.findFirst();

  const txEntry = await prisma.workCatalogEntry.findFirst({ where: { status: "ACTIVE" } });
  const txEntry2 = await prisma.workCatalogEntry.findFirst({
    where: { status: "ACTIVE", id: { not: txEntry?.id } },
  });
  const sp = await prisma.productItem.findFirst({ where: { status: "ACTIVE" } });
  const sp2 = await prisma.productItem.findFirst({
    where: { status: "ACTIVE", id: { not: sp?.id } },
  });

  const periodId = await resolveMonthlyPeriod(new Date());
  check("Kỳ đánh giá tháng được phân giải", !!periodId, periodId || "");

  // Dữ liệu trước khi test (để chứng minh không mất dữ liệu)
  const mrBefore = await prisma.monthlyWorkResult.count();
  const wiBefore = await prisma.personalWorkItem.count();
  const taskBefore = await prisma.task.count();

  const created: string[] = [];
  const cleanup = async () => {
    for (const id of created) {
      await prisma.workItemProduct.deleteMany({ where: { workItemId: id } });
      await prisma.workItemAssignment.deleteMany({ where: { workItemId: id } });
      await prisma.monthlyWorkResult.deleteMany({ where: { workItemId: id } });
      await prisma.personalWorkItem.deleteMany({ where: { id } });
    }
  };

  try {
    // ------------------------------------------------------------ T1
    const src1 = await resolveWorkSource({ catalogEntryId: txEntry!.id }, owner.id);
    check("T1: nguồn TX phân giải đúng", src1.ok && src1.source?.sourceKind === "TX_CATALOG");
    const w1 = await createLinkedWorkItem({
      personId: owner.id,
      periodId: periodId!,
      title: `${TEST_TAG} T1 một người`,
      source: src1.ok ? src1.source : null,
    });
    created.push(w1.id);
    const a1 = await prisma.workItemAssignment.findMany({ where: { workItemId: w1.id } });
    const wi1 = await prisma.personalWorkItem.findUnique({ where: { id: w1.id } });
    check("T1: đúng 1 dòng phân công", a1.length === 1, `n=${a1.length}`);
    check("T1: dòng phân công là PRIMARY_OWNER", a1[0]?.role === "PRIMARY_OWNER");
    check("T1: đầu mối chủ trì = cá nhân", wi1?.primaryOwnerPersonId === owner.id && !wi1?.primaryOwnerUnitId);
    check("T1: giữ mã danh mục tại thời điểm tạo", wi1?.sourceCodeSnapshot === txEntry!.code, wi1?.sourceCodeSnapshot || "");
    check("T1: catalog_entry_id được gắn", wi1?.catalogEntryId === txEntry!.id);

    // ------------------------------------------------------------ T2
    const w2 = await createLinkedWorkItem({
      personId: owner.id,
      periodId: periodId!,
      title: `${TEST_TAG} T2 bộ phận`,
      source: src1.ok ? src1.source : null,
      primaryOwnerUnitId: unit!.id,
    });
    created.push(w2.id);
    const wi2 = await prisma.personalWorkItem.findUnique({ where: { id: w2.id } });
    check(
      "T2: chủ trì là BỘ PHẬN, không có chủ trì cá nhân",
      wi2?.primaryOwnerUnitId === unit!.id && !wi2?.primaryOwnerPersonId
    );
    check("T2: vẫn có bảng phân công (phân công tiếp được)", (await prisma.workItemAssignment.count({ where: { workItemId: w2.id } })) >= 1);

    // ------------------------------------------------------------ T3
    const w3 = await createLinkedWorkItem({
      personId: owner.id,
      periodId: periodId!,
      title: `${TEST_TAG} T3 nhiều người`,
      source: src1.ok ? src1.source : null,
      collaboratorIds: [colleague.id],
    });
    created.push(w3.id);
    const a3 = await prisma.workItemAssignment.findMany({ where: { workItemId: w3.id } });
    check("T3: 1 việc gốc (không nhân bản)", (await prisma.personalWorkItem.count({ where: { title: `${TEST_TAG} T3 nhiều người` } })) === 1);
    check("T3: 2 dòng phân công (chủ trì + phối hợp)", a3.length === 2, `n=${a3.length}`);
    check("T3: đúng 1 PRIMARY_OWNER", a3.filter((x) => x.role === "PRIMARY_OWNER").length === 1);
    check("T3: người phối hợp có role COLLABORATOR", a3.some((x) => x.role === "COLLABORATOR" && x.personId === colleague.id));

    // ------------------------------------------------------------ T5
    const seriesCode = buildSeriesCode();
    const series = await prisma.workItemSeries.create({
      data: { seriesCode, title: `${TEST_TAG} chuỗi nhiều kỳ` },
    });
    const w5a = await createLinkedWorkItem({
      personId: owner.id,
      periodId: periodId!,
      title: `${TEST_TAG} T5 kỳ 1`,
      source: src1.ok ? src1.source : null,
      seriesId: series.id,
    });
    created.push(w5a.id);
    const w5b = await createLinkedWorkItem({
      personId: owner.id,
      periodId: periodId!,
      title: `${TEST_TAG} T5 kỳ 2`,
      source: src1.ok ? src1.source : null,
      seriesId: series.id,
    });
    created.push(w5b.id);
    const seriesItems = await prisma.personalWorkItem.findMany({ where: { seriesId: series.id } });
    check("T5: 2 kỳ = 2 dòng work item cùng chuỗi", seriesItems.length === 2);
    check(
      "T5: mã gốc ổn định qua các kỳ",
      seriesItems.every((x) => x.seriesId === series.id) && series.seriesCode === seriesCode
    );

    // ------------------------------------------------------------ T7
    const w7a = await createLinkedWorkItem({
      personId: owner.id,
      periodId: periodId!,
      title: `${TEST_TAG} T7 kỳ A`,
      source: src1.ok ? src1.source : null,
    });
    created.push(w7a.id);
    const w7b = await createLinkedWorkItem({
      personId: owner.id,
      periodId: periodId!,
      title: `${TEST_TAG} T7 kỳ B`,
      source: src1.ok ? src1.source : null,
    });
    created.push(w7b.id);
    check("T7: 2 work item khác kỳ KHÔNG bị coi là trùng", w7a.id !== w7b.id);

    // ------------------------------------------------------------ T10 + TX/QĐ1277 độc lập
    const srcBoth = await resolveWorkSource(
      { catalogEntryId: txEntry!.id, productItemId: sp!.id },
      owner.id
    );
    check(
      "TX và QĐ1277 là 2 trục độc lập (cùng tồn tại)",
      srcBoth.ok && srcBoth.source?.catalogEntryId === txEntry!.id && srcBoth.source?.productItemId === sp!.id
    );
    check(
      "provenance giữ mã TX (không bị ghi đè bằng mã SP)",
      srcBoth.ok && srcBoth.source?.sourceCodeSnapshot === txEntry!.code,
      srcBoth.ok ? srcBoth.source?.sourceCodeSnapshot || "" : ""
    );
    const w10 = await createLinkedWorkItem({
      personId: owner.id,
      periodId: periodId!,
      title: `${TEST_TAG} T10 nhiều sản phẩm`,
      source: srcBoth.ok ? srcBoth.source : null,
    });
    created.push(w10.id);
    await prisma.workItemProduct.create({
      data: { workItemId: w10.id, productItemId: sp2!.id, isPrimary: false },
    });
    const links = await prisma.workItemProduct.findMany({ where: { workItemId: w10.id } });
    check("T10: 1 việc gắn được nhiều sản phẩm QĐ1277", links.length === 2, `n=${links.length}`);
    const wi10 = await prisma.personalWorkItem.findUnique({ where: { id: w10.id } });
    check("T10: cột legacy product_item_id giữ 1 SP (tương thích ngược)", !!wi10?.productItemId);
    const wi10Obj = wi10 as unknown as Record<string, unknown>;
    check(
      "T10: hệ số KHÔNG bị cộng dồn (mỗi SP giữ hệ số riêng, việc không lưu hệ số tổng)",
      links.length === 2 && !("convertFactor" in wi10Obj),
      `hệ số từng SP: ${sp!.convertFactor?.toString()} / ${sp2!.convertFactor?.toString()}`
    );

    // ------------------------------------------------------------ T12 idempotency
    const idemKey = `test-${Date.now()}`;
    const i1 = await createLinkedWorkItem({
      personId: owner.id,
      periodId: periodId!,
      title: `${TEST_TAG} T12 idempotency`,
      source: src1.ok ? src1.source : null,
      idempotencyKey: idemKey,
    });
    created.push(i1.id);
    const i2 = await createLinkedWorkItem({
      personId: owner.id,
      periodId: periodId!,
      title: `${TEST_TAG} T12 idempotency (lần 2)`,
      source: src1.ok ? src1.source : null,
      idempotencyKey: idemKey,
    });
    check("T12: gửi lại cùng khoá idempotency → KHÔNG tạo bản ghi thứ hai", i1.id === i2.id && i2.created === false);
    check(
      "T12: chỉ có 1 bản ghi trong DB",
      (await prisma.personalWorkItem.count({ where: { idempotencyKey: idemKey } })) === 1
    );

    // ------------------------------------------------------------ Chống ghi trùng kết quả tháng
    const periodDate = new Date();
    const mrKey = buildIdempotencyKey(owner.id, w1.id, periodDate.getFullYear(), periodDate.getMonth() + 1);
    await prisma.monthlyWorkResult.create({
      data: {
        personId: owner.id,
        periodYear: periodDate.getFullYear(),
        periodMonth: periodDate.getMonth() + 1,
        workItemId: w1.id,
        title: `${TEST_TAG} kết quả tháng`,
        idempotencyKey: mrKey,
        subjectKind: "WORK_ITEM",
        subjectId: w1.id,
      },
    });
    let dupBlocked = false;
    try {
      await prisma.monthlyWorkResult.create({
        data: {
          personId: owner.id,
          periodYear: periodDate.getFullYear(),
          periodMonth: periodDate.getMonth() + 1,
          workItemId: w1.id,
          title: `${TEST_TAG} kết quả tháng (trùng)`,
          idempotencyKey: `${mrKey}-x`,
        },
      });
    } catch {
      dupBlocked = true;
    }
    check("Chống ghi trùng: (người + công việc + kỳ) bị chặn", dupBlocked);
    check("Khóa idempotency kết quả tháng đúng định dạng", mrKey.startsWith(`p:${owner.id}|wi:`));

    // ------------------------------------------------------------ T16 dữ liệu lịch sử
    const mrAfter = await prisma.monthlyWorkResult.count();
    check(
      "T16: dữ liệu lịch sử monthly_work_results không bị xoá/sửa",
      mrAfter >= mrBefore,
      `trước=${mrBefore} sau=${mrAfter} (+${mrAfter - mrBefore} bản ghi test)`
    );
    const legacyNulls = await prisma.monthlyWorkResult.count({ where: { workItemId: null } });
    check(
      "T16: bản ghi cũ (workItemId = NULL) được giữ nguyên, không bị backfill",
      legacyNulls === mrBefore,
      `null=${legacyNulls}/${mrBefore}`
    );

    // ------------------------------------------------------------ Xác minh không mất dữ liệu
    const wiAfter = await prisma.personalWorkItem.count();
    const taskAfter = await prisma.task.count();
    check("Không mất bản ghi nào ngoài dữ liệu test", wiAfter >= wiBefore && taskAfter === taskBefore);
  } finally {
    await cleanup();
    await prisma.workItemSeries.deleteMany({ where: { seriesCode: { startsWith: "CV-" }, title: { startsWith: TEST_TAG } } });
    await prisma.monthlyWorkResult.deleteMany({ where: { title: { startsWith: TEST_TAG } } });
    await prisma.personalWorkItem.deleteMany({ where: { title: { startsWith: TEST_TAG } } });
    await prisma.workItemAssignment.deleteMany({ where: { workItem: { title: { startsWith: TEST_TAG } } } });
    await prisma.workItemProduct.deleteMany({ where: { workItem: { title: { startsWith: TEST_TAG } } } });
  }

  console.log(`\n=== KẾT QUẢ: ${passed} pass / ${failed} fail ===`);
  if (failures.length) {
    console.log("Các lỗi:");
    failures.forEach((f) => console.log("  - " + f));
  }
  process.exit(failed === 0 ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
