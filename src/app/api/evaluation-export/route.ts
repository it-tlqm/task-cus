import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { getAuthorizedUnitIds, jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";
import { computeScoreForPeriod } from "@/server/scoring";
import { computeLeaderDimensions } from "@/server/scoring/leader-average";
import { buildEvaluationWorkbook, type EvaluationTemplate, type ExportTaskRow } from "@/server/evaluation-export";
import { getApprovalQualityExportRows, isApprovalQualityEnabled } from "@/server/approval-quality";
import { pickPrimaryAssignment } from "@/server/person-assignment";

export const runtime = "nodejs";

const TEMPLATES: EvaluationTemplate[] = ["01A", "01B", "02A", "02B"];

/**
 * GET /api/evaluation-export?template=01A|01B|02A|02B&personId=&periodType=&year=&number=&preview=1
 *
 * YC-34 — Xem trước / xuất biểu mẫu.
 *  - 01A / 02A: công chức KHÔNG giữ chức vụ lãnh đạo (có thêm sheet Bảng 1)
 *  - 01B / 02B: công chức GIỮ chức vụ lãnh đạo (a/b/c theo quan hệ phụ trách YC-35)
 *  - 01A/01B theo THÁNG · 02A/02B theo QUÝ
 *
 * preview=1 → trả JSON để người dùng xem trước (kèm cờ DỰ THẢO cho ô thiếu căn cứ).
 * Mặc định → trả file .xlsx để tải về.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (user.role === "SYSTEM_ADMIN") {
      return jsonError("Quản trị kỹ thuật không có quyền xuất biểu mẫu đánh giá", 403);
    }

    const { searchParams } = new URL(req.url);
    const template = String(searchParams.get("template") || "01A").toUpperCase() as EvaluationTemplate;
    if (!TEMPLATES.includes(template)) {
      return jsonError("Mẫu không hợp lệ (01A, 01B, 02A, 02B)", 400);
    }
    const periodType = (searchParams.get("periodType") ||
      (template === "02A" || template === "02B" ? "QUARTER" : "MONTH")).toUpperCase() as
      | "MONTH"
      | "QUARTER";
    const now = new Date();
    const periodYear = Number(searchParams.get("year") || now.getFullYear());
    const periodNumber = Number(
      searchParams.get("number") || (periodType === "QUARTER" ? 3 : now.getMonth() + 1)
    );
    const personId = searchParams.get("personId") || user.personId || "";
    const preview = searchParams.get("preview") === "1";
    if (!personId) return jsonError("Thiếu cán bộ", 400);

    // Phân quyền xem
    if (personId !== user.personId) {
      const units = await getAuthorizedUnitIds(user);
      const target = await prisma.person.findUnique({
        where: { id: personId },
        select: { assignments: { select: { unitId: true } } },
      });
      const inScope =
        user.role === "UNIT_LEADER" ||
        units === "ALL" ||
        (target?.assignments || []).some((a) => units.includes(a.unitId));
      if (!inScope) {
        return jsonError("Bạn không có quyền xuất biểu mẫu của cán bộ này", 403);
      }
    }

    const person = await prisma.person.findUnique({
      where: { id: personId },
      include: {
        assignments: { include: { unit: true, position: true } },
      },
    });
    if (!person) return jsonError("Không tìm thấy cán bộ", 404);
    const primaryAssignment = pickPrimaryAssignment(person.assignments, now);

    // Điểm kết quả thực hiện (YC-33)
    const computation = await computeScoreForPeriod({
      personId,
      periodType,
      periodYear,
      periodNumber,
    });

    // Phiếu tự đánh giá (YC-36)
    const evaluation = await prisma.evaluationAssessment.findUnique({
      where: {
        subjectPersonId_periodType_periodYear_periodNumber: {
          subjectPersonId: personId,
          periodType,
          periodYear,
          periodNumber,
        },
      },
    });

    // Điểm bình quân lãnh đạo (YC-35) — chỉ dùng cho mẫu 01B/02B
    let leader: any = null;
    if (template === "01B" || template === "02B") {
      const res = await computeLeaderDimensions(
        personId,
        periodType,
        periodYear,
        periodNumber,
        async (pid) => {
          const c = await computeScoreForPeriod({
            personId: pid,
            periodType,
            periodYear,
            periodNumber,
          });
          return { a: c.ratios.a, b: c.ratios.b, c: c.ratios.c };
        }
      );

      let leaderD = evaluation?.leaderD ?? null;
      let leaderDD = evaluation?.leaderDD ?? null;
      let leaderE = evaluation?.leaderE ?? null;
      if (periodType === "QUARTER" && (leaderD === null || leaderDD === null || leaderE === null)) {
        const months = [(periodNumber - 1) * 3 + 1, (periodNumber - 1) * 3 + 2, (periodNumber - 1) * 3 + 3];
        const monthly = await prisma.evaluationAssessment.findMany({
          where: {
            subjectPersonId: personId,
            periodType: "MONTH",
            periodYear,
            periodNumber: { in: months },
          },
          select: { leaderD: true, leaderDD: true, leaderE: true },
        });
        const average = (key: "leaderD" | "leaderDD" | "leaderE") => {
          const values = monthly.map((m) => m[key]).filter((v): v is number => typeof v === "number");
          return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
        };
        leaderD = leaderD ?? average("leaderD");
        leaderDD = leaderDD ?? average("leaderDD");
        leaderE = leaderE ?? average("leaderE");
      }

      leader = {
        a: res.dimensions.a.value,
        b: res.dimensions.b.value,
        c: res.dimensions.c.value,
        d: leaderD,
        dd: leaderDD,
        e: leaderE,
        reasons: res.reasons,
        status: res.status,
      };
    }


    // Danh sách công việc để đưa vào Bảng 1
    const results = await prisma.monthlyWorkResult.findMany({
      where: {
        personId,
        periodYear,
        periodMonth:
          periodType === "QUARTER"
            ? { in: [(periodNumber - 1) * 3 + 1, (periodNumber - 1) * 3 + 2, (periodNumber - 1) * 3 + 3] }
            : periodNumber,
      },
      include: {
        productItem: {
          select: { taskName: true, outputProduct: true, convertFactor: true },
        },
        workItem: { select: { title: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const tasks: ExportTaskRow[] = results.map((r) => ({
      resultId: r.id,
      title: r.title,
      dueDate: r.dueDate ? new Date(r.dueDate).toLocaleDateString("vi-VN") : null,
      product: r.productItem?.outputProduct || r.productItem?.taskName || r.outputText || null,
      factor:
        r.factorSnapshot ??
        r.productItem?.convertFactor ??
        null,
      assignedQty: r.assignedQty,
      completedQty: r.completedQty,
      completedDate: r.completedDate
        ? new Date(r.completedDate).toLocaleDateString("vi-VN")
        : null,
      lateDays: r.lateCount || 0,
      reworkCount: r.reworkCount || 0,
    }));

    const exportPerson = {
      fullName: person.fullName,
      positionTitle: primaryAssignment?.position?.title || null,
      unitName: primaryAssignment?.unit?.name || null,
      commonCriteriaScore: evaluation?.commonCriteriaScore ?? null,
      commonCriteriaDetail: (evaluation?.commonCriteriaDetail as any) ?? null,
      commonCriteriaSuggested: evaluation?.commonCriteriaSuggested ?? null,
      selfGradeChoice: evaluation?.selfGradeChoice ?? null,
      selfGradeSuggestion: evaluation?.selfGradeSuggestion ?? null,
      strengths: evaluation?.strengths ?? null,
      weaknesses: evaluation?.weaknesses ?? null,
      reviewerComment: evaluation?.reviewerComment ?? null,
      evaluationStatus: evaluation?.evaluationStatus ?? "DRAFT",
    };

    const qualityEnabled = isApprovalQualityEnabled();
    const qualityRows = qualityEnabled
      ? await getApprovalQualityExportRows(
          results.map((r) => r.taskId).filter((x): x is string => !!x),
          personId
        )
      : [];

    if (preview) {
      return NextResponse.json({
        success: true,
        data: {
          template,
          periodType,
          periodYear,
          periodNumber,
          person: exportPerson,
          score: {
            status: computation.status,
            ratios: computation.ratios,
            totals: computation.totals,
            reasons: computation.reasons,
          },
          leader,
          ...(qualityEnabled
            ? {
                quality: {
                  rows: qualityRows,
                  note: "Sheet phụ 'Đánh giá chất lượng' chỉ hiển thị/audit; không tham gia điểm chính thức.",
                },
              }
            : {}),
          evaluationStatus: evaluation?.evaluationStatus ?? "DRAFT",
          warnings: [
            ...computation.reasons,
            ...(leader?.reasons || []),
            evaluation?.commonCriteriaScore === null
              ? "Chưa có điểm tiêu chí chung (cán bộ tự chấm) — ô tương ứng để trống."
              : "",
            evaluation?.reviewerComment === null
              ? "Chưa có nhận xét của cấp có thẩm quyền — để trống (có thể ghi tay)."
              : "",
          ].filter(Boolean),
        },
      });
    }

    const buffer = await buildEvaluationWorkbook({
      template,
      periodType,
      year: periodYear,
      number: periodNumber,
      person: exportPerson,
      tasks,
      score: computation,
      leader,
      qualityRows: qualityEnabled ? qualityRows : undefined,
    });

    await recordAuditEvent({
      actorId: user.id,
      action: "EVALUATION_FORM_EXPORT",
      resourceType: "EvaluationForm",
      resourceId: personId,
      newData: {
        template,
        periodType,
        periodYear,
        periodNumber,
        scoreStatus: computation.status,
        overallScore: computation.ratios.d,
      },
    });

    const fileName = `Phieu-${template}-${periodType === "QUARTER" ? "Q" : "T"}${periodNumber}-${periodYear}-${person.code}.xlsx`;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    console.error("[Evaluation Export Error]", error);
    return jsonError("Lỗi khi xuất biểu mẫu: " + error.message, 500);
  }
}

