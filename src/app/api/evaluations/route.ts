import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";
import {
  getOrCreateAssessment,
  isReviewerFor,
  saveAssessment,
  SELF_GRADE_OPTIONS,
  type EvaluationPeriodType,
} from "@/server/evaluation/assessment";

export const runtime = "nodejs";

/**
 * YC-36 — Phiếu tự đánh giá / nhận xét lãnh đạo / mức xếp loại đề xuất.
 *
 * GET  /api/evaluations?personId=&periodType=MONTH|QUARTER&year=&number=
 *      → phiếu đánh giá (tạo bản nháp nếu chưa có).
 * POST /api/evaluations
 *      → lưu. Phân quyền theo từng trường:
 *         - tự đánh giá (điểm tiêu chí chung, ưu điểm, hạn chế, xếp loại): cán bộ
 *         - nhận xét lãnh đạo: chỉ lãnh đạo trong phạm vi
 */
export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (user.role === "SYSTEM_ADMIN") {
      return jsonError("Quản trị kỹ thuật không có quyền xem dữ liệu đánh giá", 403);
    }

    const { searchParams } = new URL(req.url);
    const now = new Date();
    const periodType = (searchParams.get("periodType") || "MONTH").toUpperCase() as EvaluationPeriodType;
    const periodYear = Number(searchParams.get("year") || now.getFullYear());
    const periodNumber = Number(searchParams.get("number") || now.getMonth() + 1);
    const personId = searchParams.get("personId") || user.personId;

    if (!personId) return jsonError("Thiếu cán bộ cần đánh giá", 400);
    if (periodType !== "MONTH" && periodType !== "QUARTER") {
      return jsonError("Kỳ phải là MONTH hoặc QUARTER", 400);
    }

    const isSelf = personId === user.personId;
    const isReviewer = await isReviewerFor(user, personId);
    if (!isSelf && !isReviewer) {
      return jsonError("Bạn không có quyền xem phiếu đánh giá của cán bộ này", 403);
    }

    const view = await getOrCreateAssessment(
      personId,
      periodType,
      periodYear,
      periodNumber,
      user.id
    );

    // Gắn quyền thao tác cho người đang xem.
    view.permissions = {
      canEditSelf: isSelf,
      canEditReviewerComment: isReviewer,
      canSubmit: isSelf || isReviewer,
      reason: null,
    };

    return NextResponse.json({
      success: true,
      data: { ...view, selfGradeOptions: SELF_GRADE_OPTIONS },
    });
  } catch (error: any) {
    console.error("[Evaluations GET Error]", error);
    return jsonError("Lỗi khi tải phiếu đánh giá: " + error.message, error.statusCode || 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (user.role === "SYSTEM_ADMIN") {
      return jsonError("Quản trị kỹ thuật không có quyền ghi phiếu đánh giá", 403);
    }

    const body = await req.json().catch(() => ({}));
    const periodType = String(body.periodType || "MONTH").toUpperCase() as EvaluationPeriodType;
    const periodYear = Number(body.year);
    const periodNumber = Number(body.number);
    if (!Number.isFinite(periodYear) || !Number.isFinite(periodNumber)) {
      return jsonError("Năm/số kỳ không hợp lệ", 400);
    }

    const result = await saveAssessment(user, {
      subjectPersonId: String(body.personId || user.personId || ""),
      periodType,
      periodYear,
      periodNumber,
      roleAtPeriod: body.roleAtPeriod ?? undefined,
      isLeaderSubject: body.isLeaderSubject ?? undefined,
      commonCriteriaScore:
        body.commonCriteriaScore === undefined ? undefined : body.commonCriteriaScore,
      commonCriteriaDetail:
        body.commonCriteriaDetail === undefined ? undefined : body.commonCriteriaDetail,
      leaderD: body.leaderD === undefined ? undefined : body.leaderD,
      leaderDD: body.leaderDD === undefined ? undefined : body.leaderDD,
      leaderE: body.leaderE === undefined ? undefined : body.leaderE,
      taskResultScore: body.taskResultScore === undefined ? undefined : body.taskResultScore,
      selfGradeChoice: body.selfGradeChoice === undefined ? undefined : body.selfGradeChoice,
      strengths: body.strengths === undefined ? undefined : body.strengths,
      weaknesses: body.weaknesses === undefined ? undefined : body.weaknesses,
      reviewerComment: body.reviewerComment === undefined ? undefined : body.reviewerComment,
      finalGrade: body.finalGrade === undefined ? undefined : body.finalGrade,
      finalGradeNote:
        body.finalGradeNote === undefined ? undefined : body.finalGradeNote,
      evaluationStatus: body.evaluationStatus,
    });

    if (!result.success) {
      return jsonError(result.error || "Không lưu được phiếu đánh giá", result.status || 400);
    }

    await recordAuditEvent({
      actorId: user.id,
      action: "EVALUATION_ASSESSMENT_SUBMIT",
      resourceType: "EvaluationAssessment",
      resourceId: result.data?.id,
      newData: { periodType, periodYear, periodNumber },
    });

    return NextResponse.json({
      success: true,
      message: result.message || "Đã lưu phiếu đánh giá",
      data: result.data,
    });
  } catch (error: any) {
    console.error("[Evaluations POST Error]", error);
    return jsonError("Lỗi khi lưu phiếu đánh giá: " + error.message, 500);
  }
}

/** DELETE /api/evaluations?id=... — chỉ xoá phiếu nháp của chính mình. */
export async function DELETE(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return jsonError("Thiếu mã phiếu đánh giá", 400);

    const rec = await prisma.evaluationAssessment.findUnique({ where: { id } });
    if (!rec) return jsonError("Phiếu đánh giá không tồn tại", 404);
    if (rec.subjectPersonId !== user.personId) {
      return jsonError("Chỉ cán bộ được đánh giá mới được xoá bản nháp của mình", 403);
    }
    if (rec.evaluationStatus !== "DRAFT") {
      return jsonError("Chỉ xoá được phiếu ở trạng thái nháp (DRAFT)", 400);
    }
    await prisma.evaluationAssessment.delete({ where: { id } });
    return NextResponse.json({ success: true, message: "Đã xoá phiếu đánh giá nháp" });
  } catch (error: any) {
    return jsonError("Lỗi khi xoá phiếu đánh giá: " + error.message, 500);
  }
}
