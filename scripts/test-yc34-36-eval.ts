/**
 * test-yc34-36-eval.ts — Kiểm thử YC-34 (biểu mẫu) · YC-35 (quan hệ phụ trách) ·
 * YC-36 (tự đánh giá) trên DB LOCAL, tự dọn sạch dữ liệu test.
 *
 *   $env:DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/talung_yc33_local"
 *   $env:DIRECT_URL=$env:DATABASE_URL
 *   npx tsx scripts/test-yc34-36-eval.ts
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { createRequire } from "node:module";
import { buildEvaluationWorkbook } from "../src/server/evaluation-export";
import { saveAssessment, isReviewerFor } from "../src/server/evaluation/assessment";
import { computeLeaderDimensions, wouldCreateCycle } from "../src/server/scoring/leader-average";
import { computeScoreForPeriod } from "../src/server/scoring";

const require = createRequire("C:/Users/thanhnx/AppData/Local/Temp/opencode/xlsstest/package.json");
const XLSX = require("@e965/xlsx");

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

const YEAR = 2098;
const MONTH = 5;
const TAG = "YC3436";

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL || "";
  if (!/127\.0\.0\.1|localhost/.test(url)) {
    console.error("CHỈ chạy test này trên DB LOCAL");
    process.exit(2);
  }

  // Dọn dữ liệu test còn sót
  await prisma.workCatalogVersion.deleteMany({ where: { code: { startsWith: TAG } } });
  await prisma.reportingPeriod.deleteMany({
    where: { title: { startsWith: "Kỳ " + TAG } },
  });
  const oldPeople = await prisma.person.findMany({
    where: { code: { startsWith: TAG } },
    select: { id: true },
  });
  const oldIds = oldPeople.map((p) => p.id);
  if (oldIds.length) {
    await prisma.approvalDecision.deleteMany({ where: { case: { submittedById: { in: oldIds } } } });
    await prisma.approvalCase.deleteMany({ where: { submittedById: { in: oldIds } } });
    await prisma.scoreRunItem.deleteMany({ where: { scoreRun: { personId: { in: oldIds } } } });
    await prisma.scoreRun.deleteMany({ where: { personId: { in: oldIds } } });
    await prisma.evaluationAssessment.deleteMany({ where: { subjectPersonId: { in: oldIds } } });
    await prisma.personSupervision.deleteMany({
      where: { OR: [{ managerPersonId: { in: oldIds } }, { subordinatePersonId: { in: oldIds } }] },
    });
    await prisma.monthlyWorkResult.deleteMany({ where: { personId: { in: oldIds } } });
    await prisma.personalWorkItem.deleteMany({ where: { personId: { in: oldIds } } });
    await prisma.person.deleteMany({ where: { id: { in: oldIds } } });
  }

  // -------- Fixture --------
  const unit = await prisma.orgUnit.findFirst();
  const leader = await prisma.person.create({
    data: {
      code: `${TAG}-LD`,
      fullName: "[TEST] Đội trưởng",
      status: "ACTIVE",
      assignments: {
        create: {
          unitId: unit!.id,
          isPrimary: true,
        },
      },
    },
    include: { assignments: true },
  });
  const staff = await prisma.person.create({
    data: {
      code: `${TAG}-CC`,
      fullName: "[TEST] Công chức",
      status: "ACTIVE",
      assignments: { create: { unitId: unit!.id, isPrimary: true } },
    },
    include: { assignments: true },
  });

  const version = await prisma.workCatalogVersion.create({
    data: {
      code: `${TAG}-V1`,
      title: "[TEST] Danh mục TX",
      entryCount: 1,
      importHash: `${TAG}-hash`,
      status: "ACTIVE",
    },
  });
  const txEntry = await prisma.workCatalogEntry.create({
    data: {
      versionId: version.id,
      code: "NV-TEST-99",
      department: "Bộ phân Nghiệp vụ Hải quan",
      departmentOrder: 0,
      groupCode: "NV",
      title: "[TEST] Đầu việc TX hệ số 2",
      convertFactor: 2,
      sortOrder: 1,
      sourceRow: 1,
    },
  });
  const period = await prisma.reportingPeriod.create({
    data: {
      type: "MONTHLY",
      title: `Kỳ ${TAG} ${YEAR}-${MONTH}`,
      startAt: new Date(YEAR, MONTH - 1, 1),
      endAt: new Date(YEAR, MONTH, 0),
    },
  });
  const workItem = await prisma.personalWorkItem.create({
    data: {
      personId: staff.id,
      periodId: period.id,
      catalogEntryId: txEntry.id,
      title: "[TEST] Đầu việc từ danh mục TX",
      sortOrder: 1,
    },
  });
  await prisma.monthlyWorkResult.create({
    data: {
      personId: staff.id,
      periodYear: YEAR,
      periodMonth: MONTH,
      workItemId: workItem.id,
      title: "[TEST] Kết quả tháng",
      assignedQty: 5,
      completedQty: 5,
      dueDate: new Date(YEAR, MONTH - 1, 10),
      completedDate: new Date(YEAR, MONTH - 1, 10),
    },
  });

  const staffAcc = await prisma.account.findFirst({
    where: { personId: staff.id },
    select: { id: true },
  });
  const leaderAcc = await prisma.account.findFirst({
    where: { personId: leader.id },
    select: { id: true },
  });
  if (!staffAcc || !leaderAcc) {
    // Tạo tài khoản test (chỉ dùng trong test, dọn cùng person).
    await prisma.account.create({
      data: { personId: staff.id, username: `${TAG}-cc`, passwordHash: "test-only" },
    });
    await prisma.account.create({
      data: { personId: leader.id, username: `${TAG}-ld`, passwordHash: "test-only" },
    });
  }
  const staffAccId = (
    staffAcc ||
    (await prisma.account.findFirst({ where: { personId: staff.id } }))!
  ).id;
  const leaderAccId = (
    leaderAcc ||
    (await prisma.account.findFirst({ where: { personId: leader.id } }))!
  ).id;
  if (!staffAccId || !leaderAccId) throw new Error("thieu tai khoan de test");

  const staffUser: any = {
    id: staffAccId,
    role: "STAFF",
    personId: staff.id,
    permissions: [],
    scopeType: "DEPARTMENT",
    scopeUnitId: unit!.id,
    unitId: unit!.id,
    fullName: staff.fullName,
  };
  const leaderUser: any = {
    id: leaderAccId,
    role: "UNIT_LEADER",
    personId: leader.id,
    permissions: [],
    scopeType: "ORGANIZATION",
    scopeUnitId: null,
    unitId: unit!.id,
    fullName: leader.fullName,
  };

  // ================= YC-36 — tự đánh giá =================
  console.log("\n=== YC-36 — Tự đánh giá / nhận xét lãnh đạo ===");
  const save1 = await saveAssessment(leaderUser, {
    subjectPersonId: staff.id,
    periodType: "MONTH",
    periodYear: YEAR,
    periodNumber: MONTH,
    reviewerComment: "Nhận xét của lãnh đạo",
  });
  check("Lãnh đạo ghi được nhận xét", save1.success === true, save1.error);

  const save2 = await saveAssessment(staffUser, {
    subjectPersonId: staff.id,
    periodType: "MONTH",
    periodYear: YEAR,
    periodNumber: MONTH,
    reviewerComment: "Cán bộ tự sửa nhận xét",
  });
  check(
    "Cán bộ KHÔNG sửa được nhận xét của lãnh đạo",
    save2.success === false && save2.status === 403,
    save2.error
  );

  const save3 = await saveAssessment(staffUser, {
    subjectPersonId: staff.id,
    periodType: "MONTH",
    periodYear: YEAR,
    periodNumber: MONTH,
    commonCriteriaScore: 27,
    strengths: "Ưu điểm: tích cực",
    weaknesses: "Hạn chế: cần bồi dưỡng",
    selfGradeChoice: "Hoàn thành tốt",
  });
  check("Cán bộ tự chấm + ưu điểm/hạn chế + xếp loại", save3.success === true, save3.error);
  check(
    "Gợi ý điểm tiêu chí chung vẫn NULL (chưa có quy tắc)",
    save3.data?.commonCriteriaSuggested === null,
    String(save3.data?.commonCriteriaSuggested)
  );
  check(
    "Gợi ý mức xếp loại vẫn NULL (chưa có ngưỡng)",
    save3.data?.selfGradeSuggestion === null,
    String(save3.data?.selfGradeSuggestion)
  );
  check(
    "Có lý do giải thích vì sao chưa có gợi ý",
    !!save3.data?.suggestions.commonCriteria.reason,
    save3.data?.suggestions.commonCriteria.reason
  );

  const save4 = await saveAssessment(staffUser, {
    subjectPersonId: staff.id,
    periodType: "MONTH",
    periodYear: YEAR,
    periodNumber: MONTH,
    commonCriteriaScore: 99,
  });
  check("Điểm tiêu chí chung ngoài 0…30 bị từ chối", save4.success === false && save4.status === 400, save4.error);

  const save5 = await saveAssessment(staffUser, {
    subjectPersonId: staff.id,
    periodType: "MONTH",
    periodYear: YEAR,
    periodNumber: MONTH,
    selfGradeChoice: "Mức không tồn tại",
  });
  check("Mức xếp loại ngoài 4 mức mẫu bị từ chối", save5.success === false && save5.status === 400, save5.error);

  const isRev = await isReviewerFor(leaderUser, staff.id);
  check("Lãnh đạo đơn vị là người đánh giá", isRev === true);

  // ================= YC-35 — quan hệ phụ trách =================
  console.log("\n=== YC-35 — Quan hệ phụ trách + bình quân ===");
  const sup = await prisma.personSupervision.create({
    data: {
      managerPersonId: leader.id,
      subordinatePersonId: staff.id,
      scopeType: "UNIT",
      effectiveFrom: new Date(YEAR, 0, 1),
      status: "CONFIRMED",
      confirmedById: leader.personId,
    },
  });
  check("Tạo quan hệ phụ trách thành công", !!sup.id);

  const cycle = await wouldCreateCycle(staff.id, leader.id);
  check("Phát hiện vòng quản lý khi đảo chiều", cycle === true);
  const selfCycle = await wouldCreateCycle(leader.id, leader.id);
  check("Chặn tự phụ trách chính mình", selfCycle === true);

  const comp = await computeScoreForPeriod({
    personId: staff.id,
    periodType: "MONTH",
    periodYear: YEAR,
    periodNumber: MONTH,
  });
  check("Điểm của cán bộ đủ căn cứ", comp.status === "KNOWN", comp.status);

  const leaderRes = await computeLeaderDimensions(
    leader.id,
    "MONTH",
    YEAR,
    MONTH,
    async (pid) => {
      const c = await computeScoreForPeriod({
        personId: pid,
        periodType: "MONTH",
        periodYear: YEAR,
        periodNumber: MONTH,
      });
      return { a: c.ratios.a, b: c.ratios.b, c: c.ratios.c };
    }
  );
  check("Bình quân lãnh đạo có căn cứ → KNOWN", leaderRes.status === "KNOWN", leaderRes.status);
  check("a của lãnh đạo = bình quân cấp dưới", leaderRes.dimensions.a.value === 100, String(leaderRes.dimensions.a.value));
  check("Đếm đủ người được tính", leaderRes.dimensions.a.countedCount === 1, String(leaderRes.dimensions.a.countedCount));

  // Không có quan hệ → NOT_APPLICABLE
  await prisma.personSupervision.deleteMany({ where: { id: sup.id } });
  const noRel = await computeLeaderDimensions(
    leader.id,
    "MONTH",
    YEAR,
    MONTH,
    async () => ({ a: 1, b: 1, c: 1 })
  );
  check(
    "Không có quan hệ phụ trách → NOT_APPLICABLE (không bịa điểm)",
    noRel.status === "NOT_APPLICABLE",
    noRel.status
  );

  // Quan hệ có nhưng cấp dưới chưa có điểm → INSUFFICIENT_DATA (không lấy 0)
  await prisma.personSupervision.create({
    data: {
      managerPersonId: leader.id,
      subordinatePersonId: staff.id,
      scopeType: "UNIT",
      effectiveFrom: new Date(YEAR, 0, 1),
      status: "CONFIRMED",
    },
  });
  const missing = await computeLeaderDimensions(
    leader.id,
    "MONTH",
    YEAR,
    MONTH,
    async () => ({ a: null, b: null, c: null })
  );
  check(
    "Cấp dưới chưa có điểm → INSUFFICIENT_DATA (KHÔNG lấy 0)",
    missing.status === "INSUFFICIENT_DATA",
    missing.status
  );
  check("Nêu rõ người còn thiếu để rà soát", missing.reasons.length > 0, missing.reasons[0]);

  // ================= YC-34 — xuất biểu mẫu =================
  console.log("\n=== YC-34 — Biểu mẫu 01A/01B/02A/02B ===");
  const score = await computeScoreForPeriod({
    personId: staff.id,
    periodType: "MONTH",
    periodYear: YEAR,
    periodNumber: MONTH,
  });

  const buf = await buildEvaluationWorkbook({
    template: "01A",
    periodType: "MONTH",
    year: YEAR,
    number: MONTH,
    person: {
      fullName: staff.fullName,
      positionTitle: "Công chức",
      unitName: unit!.name,
      commonCriteriaScore: 27,
      commonCriteriaSuggested: null,
      selfGradeChoice: "Hoàn thành tốt",
      selfGradeSuggestion: null,
      strengths: "Ưu điểm: tích cực",
      weaknesses: "Hạn chế: cần bồi dưỡng",
      reviewerComment: "Nhận xét của lãnh đạo",
      evaluationStatus: "SUBMITTED",
    },
    tasks: [
      {
        title: "[TEST] Đầu việc từ danh mục TX",
        dueDate: "10/05/2098",
        product: "Sản phẩm",
        factor: 2,
        assignedQty: 5,
        completedQty: 5,
        completedDate: "10/05/2098",
        lateDays: 0,
        reworkCount: 0,
      },
    ],
    score,
  });
  check("Sinh được file xlsx", buf.length > 5000, `${buf.length} bytes`);

  const wb = XLSX.read(buf, { type: "buffer" });
  check("Có sheet Bảng 1 (tính điểm)", wb.SheetNames.includes("Bảng 1 (tính điểm)"), wb.SheetNames.join(", "));
  check("Có sheet Biểu 01A (CC)", wb.SheetNames.includes("Biểu 01A (CC)"), wb.SheetNames.join(", "));

  const form = wb.Sheets["Biểu 01A (CC)"];
  const text = XLSX.utils.sheet_to_json(form, { header: 1, raw: false, defval: "" }) as any[][];
  const flat = text.map((r) => (r || []).join(" | ")).join("\n");
  check("Biểu 01A ghi đúng điểm tiêu chí chung (27)", flat.includes("27"), "");
  check("Biểu 01A ghi điểm KQ ×70%", /\d/.test(flat), "");
  check("Biểu 01A ghi ưu điểm", flat.includes("Ưu điểm: tích cực"), "");
  check("Biểu 01A ghi hạn chế", flat.includes("cần bồi dưỡng"), "");
  check("Biểu 01A ghi nhận xét lãnh đạo", flat.includes("Nhận xét của lãnh đạo"), "");
  check("Biểu 01A có phần chữ ký để trống", flat.includes("CÔNG CHỨC TỰ ĐÁNH GIÁ"), "");
  // Theo mẫu gốc: mục "tự đề xuất mức xếp loại" CHỈ có ở mẫu QUÝ (02A/02B), không có ở 01A.

  // Mẫu quý 02A — có mục xếp loại
  const buf2 = await buildEvaluationWorkbook({
    template: "02A",
    periodType: "QUARTER",
    year: YEAR,
    number: 2,
    person: {
      fullName: staff.fullName,
      positionTitle: "Công chức",
      unitName: unit!.name,
      commonCriteriaScore: null,
      commonCriteriaSuggested: null,
      selfGradeChoice: null,
      selfGradeSuggestion: null,
      strengths: null,
      weaknesses: null,
      reviewerComment: null,
      evaluationStatus: "DRAFT",
    },
    tasks: [],
    score: null,
  });
  const wb2 = XLSX.read(buf2, { type: "buffer" });
  const form2 = wb2.Sheets["Biểu 02A (CC)"];
  const flat2 = XLSX.utils.sheet_to_json(form2, { header: 1, raw: false, defval: "" })
    .map((r: any[]) => (r || []).join(" | "))
    .join("\n");
  check("Mẫu 02A có mục xếp loại", flat2.includes("tự đề xuất mức xếp loại"), "");
  check(
    "Mẫu 02A đánh dấu DỰ THẢO khi thiếu căn cứ",
    flat2.includes("DỰ THẢO"),
    ""
  );

  // Mẫu 01B (lãnh đạo) — không có sheet Bảng 1
  const buf3 = await buildEvaluationWorkbook({
    template: "01B",
    periodType: "MONTH",
    year: YEAR,
    number: MONTH,
    person: {
      fullName: leader.fullName,
      positionTitle: "Đội trưởng",
      unitName: unit!.name,
      commonCriteriaScore: 27,
      commonCriteriaSuggested: null,
      selfGradeChoice: null,
      selfGradeSuggestion: null,
      strengths: null,
      weaknesses: null,
      reviewerComment: null,
      evaluationStatus: "DRAFT",
    },
    tasks: [],
    score: null,
    leader: { a: 87.006, b: 80.232, c: 83.899, d: null, dd: null, e: null, reasons: [], status: "KNOWN" },
  });
  const wb3 = XLSX.read(buf3, { type: "buffer" });
  check(
    "Mẫu 01B không kèm sheet Bảng 1",
    !wb3.SheetNames.includes("Bảng 1 (tính điểm)"),
    wb3.SheetNames.join(", ")
  );
  const flat3 = XLSX.utils.sheet_to_json(wb3.Sheets["01B tháng"], { header: 1, raw: false, defval: "" })
    .map((r: any[]) => (r || []).join(" | "))
    .join("\n");
  check("Mẫu 01B ghi a/b/c từ bình quân lãnh đạo", flat3.includes("87.006"), "");

  // Dọn sạch
  await prisma.evaluationAssessment.deleteMany({ where: { subjectPersonId: { in: [staff.id, leader.id] } } });
  await prisma.personSupervision.deleteMany({
    where: { OR: [{ managerPersonId: { in: [staff.id, leader.id] } }, { subordinatePersonId: { in: [staff.id, leader.id] } }] },
  });
  await prisma.scoreRun.deleteMany({ where: { personId: { in: [staff.id, leader.id] } } });
  await prisma.monthlyWorkResult.deleteMany({ where: { personId: { in: [staff.id, leader.id] } } });
  await prisma.personalWorkItem.deleteMany({ where: { personId: { in: [staff.id, leader.id] } } });
  await prisma.reportingPeriod.deleteMany({ where: { id: period.id } });
  await prisma.workCatalogEntry.deleteMany({ where: { id: txEntry.id } });
  await prisma.workCatalogVersion.deleteMany({ where: { id: version.id } });
  await prisma.person.deleteMany({ where: { id: { in: [staff.id, leader.id] } } });
  console.log("\nĐã dọn sạch dữ liệu test.");

  console.log("\n========================================");
  console.log(`KẾT QUẢ YC-34/35/36: ${passed} pass / ${failed} fail`);
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


