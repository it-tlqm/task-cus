/**
 * generate-yc33-37-samples.ts — Sinh 4 file Excel MẪU (01A/01B/02A/02B) từ hệ thống
 * bằng dữ liệu kiểm thử an toàn (tên [DEMO], không có dữ liệu nhân sự thật).
 *
 *   $env:DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/talung_yc33_local"
 *   $env:DIRECT_URL=$env:DATABASE_URL
 *   npx tsx scripts/generate-yc33-37-samples.ts
 *
 * Đầu ra: docs/samples/YC33_37_bieu_mau/*.xlsx  (dùng để UAT đối chiếu cấu trúc/định dạng)
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { buildEvaluationWorkbook, type EvaluationTemplate } from "../src/server/evaluation-export";
import { computeScoreForPeriod } from "../src/server/scoring";
import { computeLeaderDimensions } from "../src/server/scoring/leader-average";

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
});

const OUT_DIR = path.join(process.cwd(), "docs", "samples", "YC33_37_bieu_mau");
const YEAR = 2026;
const MONTH = 10;
const QUARTER = 3;

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL || "";
  if (!/127\.0\.0\.1|localhost/.test(url)) {
    console.error("CHỈ sinh mẫu trên DB LOCAL. DB hiện tại:", url);
    process.exit(2);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Fixture DEMO riêng cho file mẫu — tên có tiền tố "[MẪU]" để không lẫn với dữ liệu thật.
  const unit = await prisma.orgUnit.findFirst();
  const position = await prisma.position.findFirst();
  const stampTag = `[MẪU] ${Date.now().toString(36).toUpperCase()}`;
  const staff = await prisma.person.create({
    data: {
      code: `YC33S-${Date.now().toString(36).toUpperCase()}`,
      fullName: `${stampTag} Công chức`,
      status: "ACTIVE",
      assignments: { create: { unitId: unit!.id, positionId: position?.id ?? null, isPrimary: true } },
    },
    include: { assignments: { include: { unit: true, position: true } } },
  });
  const leader = await prisma.person.create({
    data: {
      code: `YC33L-${Date.now().toString(36).toUpperCase()}`,
      fullName: `${stampTag} Lãnh đạo`,
      status: "ACTIVE",
      assignments: { create: { unitId: unit!.id, positionId: position?.id ?? null, isPrimary: true } },
    },
    include: { assignments: { include: { unit: true, position: true } } },
  });
  // Danh mục TX (mẫu) để có hệ số thật trong dòng công việc
  const catalogVersion = await prisma.workCatalogVersion.create({
    data: {
      code: `YC33S-V-${Date.now().toString(36).toUpperCase()}`,
      title: "[MẪU] Danh mục TX",
      entryCount: 2,
      importHash: `yc33s-${Date.now()}`,
      status: "ACTIVE",
    },
  });
  const entry1 = await prisma.workCatalogEntry.create({
    data: {
      versionId: catalogVersion.id,
      code: "NV-MAU-01",
      department: "Bộ phân Nghiệp vụ Hải quan",
      departmentOrder: 0,
      groupCode: "NV",
      title: "[MẪU] Kiểm tra hồ sơ hải quan",
      convertFactor: 2.5,
      sortOrder: 1,
      sourceRow: 2,
    },
  });
  const entry2 = await prisma.workCatalogEntry.create({
    data: {
      versionId: catalogVersion.id,
      code: "NV-MAU-02",
      department: "Bộ phân Nghiệp vụ Hải quan",
      departmentOrder: 0,
      groupCode: "NV",
      title: "[MẪU] Giám sát hải quan tại cửa khẩu",
      convertFactor: 1.75,
      sortOrder: 2,
      sourceRow: 3,
    },
  });
  const period = await prisma.reportingPeriod.create({
    data: {
      type: "MONTHLY",
      title: `Kỳ MẪU ${YEAR}-${MONTH}`,
      startAt: new Date(YEAR, MONTH - 1, 1),
      endAt: new Date(YEAR, MONTH, 0),
    },
  });
  const wi1 = await prisma.personalWorkItem.create({
    data: {
      personId: staff.id,
      periodId: period.id,
      catalogEntryId: entry1.id,
      title: "[MẪU] Kiểm tra hồ sơ hải quan",
      dueDate: new Date(Date.UTC(YEAR, MONTH - 1, 8)),
      sortOrder: 1,
    },
  });
  const wi2 = await prisma.personalWorkItem.create({
    data: {
      personId: staff.id,
      periodId: period.id,
      catalogEntryId: entry2.id,
      title: "[MẪU] Giám sát hải quan tại cửa khẩu",
      dueDate: new Date(Date.UTC(YEAR, MONTH - 1, 15)),
      sortOrder: 2,
    },
  });
  await prisma.monthlyWorkResult.create({
    data: {
      personId: staff.id,
      periodYear: YEAR,
      periodMonth: MONTH,
      workItemId: wi1.id,
      title: "[MẪU] Kiểm tra hồ sơ hải quan",
      outputText: "[MẪU] Đã kiểm tra 120 lô hàng, đạt yêu cầu",
      assignedQty: 120,
      completedQty: 120,
      dueDate: new Date(Date.UTC(YEAR, MONTH - 1, 8)),
      completedDate: new Date(Date.UTC(YEAR, MONTH - 1, 8)),
      lateCount: 0,
      reworkCount: 0,
    },
  });
  await prisma.monthlyWorkResult.create({
    data: {
      personId: staff.id,
      periodYear: YEAR,
      periodMonth: MONTH,
      workItemId: wi2.id,
      title: "[MẪU] Giám sát hải quan tại cửa khẩu",
      outputText: "[MẪU] Giám sát 2 ca, có 1 ca hoàn thành chậm 3 ngày",
      assignedQty: 2,
      completedQty: 2,
      dueDate: new Date(Date.UTC(YEAR, MONTH - 1, 15)),
      completedDate: new Date(Date.UTC(YEAR, MONTH - 1, 18)),
      lateCount: 3,
      reworkCount: 1,
    },
  });
  await prisma.evaluationAssessment.create({
    data: {
      subjectPersonId: staff.id,
      periodType: "MONTH",
      periodYear: YEAR,
      periodNumber: MONTH,
      periodStart: new Date(YEAR, MONTH - 1, 1),
      periodEnd: new Date(YEAR, MONTH, 0),
      commonCriteriaScore: 27,
      strengths: "[MẪU] Phục vụ doanh nghiệp tận tình, xử lý vướng mắc kịp thời.",
      weaknesses: "[MẪU] Cần bồi dưỡng thêm về kỹ thuật phân tích rủi ro.",
      selfGradeChoice: "Hoàn thành tốt",
      evaluationStatus: "DRAFT",
    },
  });

  const results = await prisma.monthlyWorkResult.findMany({
    where: { personId: staff.id, periodYear: YEAR, periodMonth: MONTH },
    include: {
      productItem: { select: { taskName: true, outputProduct: true, convertFactor: true } },
      workItem: { select: { title: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  if (results.length === 0) {
    throw new Error("khong co ket qua cong tac thang de sinh mau");
  }

  const score = await computeScoreForPeriod({
    personId: staff.id,
    periodType: "MONTH",
    periodYear: YEAR,
    periodNumber: MONTH,
  });

  // Quan hệ phụ trách DEMO (chỉ để sinh mẫu 01B/02B — KHÔNG tạo trên Production)
  let leaderScore = null;
  if (leader) {
    const existing = await prisma.personSupervision.findFirst({
      where: { managerPersonId: leader.id, subordinatePersonId: staff.id },
    });
    if (!existing) {
      await prisma.personSupervision.create({
        data: {
          managerPersonId: leader.id,
          subordinatePersonId: staff.id,
          scopeType: "UNIT",
          effectiveFrom: new Date(YEAR, 0, 1),
          status: "CONFIRMED",
          note: "[DEMO] chỉ dùng để sinh file mẫu",
        },
      });
    }
    leaderScore = await computeLeaderDimensions(
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
  }

  const evaluation = await prisma.evaluationAssessment.findFirst({
    where: {
      subjectPersonId: staff.id,
      periodType: "MONTH",
      periodYear: YEAR,
      periodNumber: MONTH,
    },
  });

  const tasks = results.map((r) => ({
    resultId: r.id,
    title: r.title,
    dueDate: r.dueDate ? new Date(r.dueDate).toISOString().slice(0, 10) : null,
    product: r.productItem?.outputProduct || r.productItem?.taskName || r.outputText || null,
    factor:
      r.factorSnapshot !== null && r.factorSnapshot !== undefined
        ? Number(r.factorSnapshot)
        : r.productItem?.convertFactor ?? null,
    assignedQty: r.assignedQty,
    completedQty: r.completedQty,
    completedDate: r.completedDate ? new Date(r.completedDate).toISOString().slice(0, 10) : null,
    lateDays: r.lateCount || 0,
    reworkCount: r.reworkCount || 0,
  }));

  const person = {
    fullName: staff.fullName,
    positionTitle: staff.assignments[0]?.position?.title || null,
    unitName: staff.assignments[0]?.unit?.name || null,
    commonCriteriaScore: evaluation?.commonCriteriaScore ?? null,
    commonCriteriaSuggested: evaluation?.commonCriteriaSuggested ?? null,
    selfGradeChoice: evaluation?.selfGradeChoice ?? null,
    selfGradeSuggestion: evaluation?.selfGradeSuggestion ?? null,
    strengths: evaluation?.strengths ?? null,
    weaknesses: evaluation?.weaknesses ?? null,
    reviewerComment: evaluation?.reviewerComment ?? null,
    evaluationStatus: evaluation?.evaluationStatus ?? "DRAFT",
  };

  const leaderInput = leaderScore
    ? {
        a: leaderScore.dimensions.a.value,
        b: leaderScore.dimensions.b.value,
        c: leaderScore.dimensions.c.value,
        d: null,
        dd: null,
        e: null,
        reasons: leaderScore.reasons,
        status: leaderScore.status,
      }
    : null;

  const leaderPerson = leader
    ? {
        ...person,
        fullName: leader.fullName,
        positionTitle: leader.assignments[0]?.position?.title || null,
        unitName: leader.assignments[0]?.unit?.name || null,
      }
    : null;

  const specs: Array<{
    template: EvaluationTemplate;
    periodType: "MONTH" | "QUARTER";
    number: number;
    useLeader: boolean;
  }> = [
    { template: "01A", periodType: "MONTH", number: MONTH, useLeader: false },
    { template: "01B", periodType: "MONTH", number: MONTH, useLeader: true },
    { template: "02A", periodType: "QUARTER", number: QUARTER, useLeader: false },
    { template: "02B", periodType: "QUARTER", number: QUARTER, useLeader: true },
  ];

  for (const spec of specs) {
    const buf = await buildEvaluationWorkbook({
      template: spec.template,
      periodType: spec.periodType,
      year: YEAR,
      number: spec.number,
      person: spec.useLeader && leaderPerson ? leaderPerson : person,
      tasks: spec.useLeader ? [] : tasks,
      score: spec.useLeader ? null : score,
      leader: spec.useLeader ? leaderInput : null,
    });
    const file = path.join(OUT_DIR, `Phieu-${spec.template}-${spec.periodType === "QUARTER" ? "Q" : "T"}${spec.number}-${YEAR}.xlsx`);
    fs.writeFileSync(file, buf);
    console.log(`✓ ${path.basename(file)} (${buf.length} bytes)`);
  }

  // Dọn toàn bộ fixture MẪU
  await prisma.approvalCase.deleteMany({ where: { submittedById: staff.id } });
  await prisma.evaluationAssessment.deleteMany({ where: { subjectPersonId: staff.id } });
  await prisma.scoreRun.deleteMany({ where: { personId: staff.id } });
  await prisma.monthlyWorkResult.deleteMany({ where: { personId: staff.id } });
  await prisma.personalWorkItem.deleteMany({ where: { personId: staff.id } });
  await prisma.personSupervision.deleteMany({
    where: { OR: [{ managerPersonId: leader.id }, { subordinatePersonId: staff.id }] },
  });
  await prisma.workCatalogEntry.deleteMany({ where: { versionId: catalogVersion.id } });
  await prisma.workCatalogVersion.deleteMany({ where: { id: catalogVersion.id } });
  await prisma.reportingPeriod.deleteMany({ where: { id: period.id } });
  await prisma.person.deleteMany({ where: { id: { in: [staff.id, leader.id] } } });
  console.log(`\nĐã sinh 4 file mẫu tại: ${OUT_DIR}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
