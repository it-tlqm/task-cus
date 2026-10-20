import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { getAuthorizedUnitIds, jsonError, checkPermission } from "@/server/guard";
import { assertPeriodWritable } from "@/server/period-guard";
import { recordAuditEvent } from "@/server/audit";
import {
  computeScoreForPeriod,
  saveScoreRun,
  type PeriodType,
} from "@/server/scoring";

export const runtime = "nodejs";

/**
 * YC-33 — Tính điểm theo kỳ (Bảng 1).
 *
 * GET  /api/scoring?personId=&periodType=MONTH|QUARTER&year=&number=
 *      → PREVIEW (chỉ đọc). Trả về điểm + trạng thái + lý do từng dòng.
 *      Trạng thái: KNOWN | INSUFFICIENT_DATA | PENDING_RULE | NOT_APPLICABLE | ERROR.
 *
 * POST /api/scoring
 *      → Lưu snapshot kết quả tính điểm (DRAFT hoặc CONFIRMED).
 *      Quyền chốt: Lãnh đạo đơn vị / Trưởng bộ phận trong phạm vi.
 *      Kỳ đã chốt số → bị khóa (423).
 */
export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (user.role === "SYSTEM_ADMIN") {
      return jsonError("Quản trị kỹ thuật không có quyền xem dữ liệu đánh giá nghiệp vụ", 403);
    }

    const { searchParams } = new URL(req.url);
    const personId = searchParams.get("personId") || user.personId;
    const periodType = (searchParams.get("periodType") || "MONTH").toUpperCase() as PeriodType;
    const periodYear = Number(searchParams.get("year") || new Date().getFullYear());
    const periodNumber = Number(
      searchParams.get("number") || new Date().getMonth() + 1
    );

    if (!personId) return jsonError("Thiếu mã cán bộ cần tính điểm", 400);
    if (periodType !== "MONTH" && periodType !== "QUARTER") {
      return jsonError("Kỳ phải là MONTH hoặc QUARTER", 400);
    }
    if (!Number.isFinite(periodYear) || !Number.isFinite(periodNumber)) {
      return jsonError("Năm/số kỳ không hợp lệ", 400);
    }

    // Phân quyền: cán bộ chỉ xem của mình; lãnh đạo xem trong phạm vi đơn vị.
    if (personId !== user.personId) {
      const canViewAll =
        user.role === "UNIT_LEADER" ||
        (user.role === "DEPARTMENT_LEADER" && (await isInScope(user, personId)));
      if (!canViewAll) {
        return jsonError("Bạn không có quyền xem kết quả tính điểm của cán bộ khác", 403);
      }
    }

    const computation = await computeScoreForPeriod({
      personId,
      periodType,
      periodYear,
      periodNumber,
    });

    return NextResponse.json({
      success: true,
      data: {
        ...computation,
        // Nhấn mạnh: điểm chỉ dùng để trình ký khi trạng thái = KNOWN.
        publishable: computation.status === "KNOWN" && computation.official === true,
      },
    });
  } catch (error: any) {
    console.error("[Scoring GET Error]", error);
    return jsonError("Lỗi khi tính điểm: " + error.message, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (user.role === "SYSTEM_ADMIN") {
      return jsonError("Quản trị kỹ thuật không có quyền ghi kết quả đánh giá", 403);
    }

    const body = await req.json().catch(() => ({}));
    const personId = String(body.personId || "");
    const periodType = String(body.periodType || "MONTH").toUpperCase() as PeriodType;
    const periodYear = Number(body.year);
    const periodNumber = Number(body.number);
    const wantConfirm = body.status === "CONFIRMED";

    if (!personId) return jsonError("Thiếu mã cán bộ", 400);
    if (periodType !== "MONTH" && periodType !== "QUARTER") {
      return jsonError("Kỳ phải là MONTH hoặc QUARTER", 400);
    }
    if (!Number.isFinite(periodYear) || !Number.isFinite(periodNumber)) {
      return jsonError("Năm/số kỳ không hợp lệ", 400);
    }

    if (wantConfirm) {
      const canConfirm =
        user.role === "UNIT_LEADER" ||
        (user.role === "DEPARTMENT_LEADER" && (await isInScope(user, personId))) ||
        checkPermission(user, "reports.snapshot");
      if (!canConfirm) {
        return jsonError("Bạn không có thẩm quyền chốt kết quả đánh giá", 403);
      }
    } else if (personId !== user.personId) {
      return jsonError("Chỉ lưu bản nháp cho chính mình", 403);
    }

    // Kỳ đã chốt số → khóa mọi ghi mới.
    const periodIds = await prisma.personalWorkItem.findMany({
      where: {
        personId,
        ...(periodType === "QUARTER"
          ? { period: { type: "QUARTER" } }
          : { period: { type: "MONTH" } }),
      },
      select: { periodId: true },
      take: 1,
    });
    if (periodIds.length > 0) {
      try {
        await assertPeriodWritable(periodIds[0].periodId);
      } catch (err: any) {
        return jsonError(err.message, err.statusCode || 423);
      }
    }

    const computation = await computeScoreForPeriod({
      personId,
      periodType,
      periodYear,
      periodNumber,
    });

    if (wantConfirm && computation.status !== "KNOWN") {
      return jsonError(
        `Chưa đủ căn cứ để chốt điểm (trạng thái: ${computation.status}). ${computation.reasons[0] ?? ""}`,
        422
      );
    }
    if (computation.confirmedRun && wantConfirm) {
      return NextResponse.json({
        success: true,
        message: "Kỳ này đã có bản điểm chốt — không ghi đè kết quả đã trình ký.",
        deduplicated: true,
        data: { runId: computation.confirmedRun.id },
      });
    }

    const saved = await saveScoreRun({
      personId,
      periodType,
      periodYear,
      periodNumber,
      computation,
      computedById: user.personId ?? null,
      status: wantConfirm ? "CONFIRMED" : "DRAFT",
    });

    await recordAuditEvent({
      actorId: user.id,
      action: wantConfirm ? "SCORE_RUN_CONFIRM" : "SCORE_RUN_SAVE",
      resourceType: "ScoreRun",
      resourceId: saved.id,
      newData: {
        personId,
        periodType,
        periodYear,
        periodNumber,
        status: computation.status,
        overallScore: computation.ratios.d,
        formulaVersion: computation.formulaVersion,
        reasons: computation.reasons,
      },
    });

    return NextResponse.json({
      success: true,
      message: wantConfirm
        ? "Đã chốt kết quả tính điểm cho kỳ."
        : "Đã lưu bản nháp kết quả tính điểm.",
      data: {
        runId: saved.id,
        status: computation.status,
        overallScore: computation.ratios.d,
        ratios: computation.ratios,
        totals: computation.totals,
        reasons: computation.reasons,
      },
    });
  } catch (error: any) {
    console.error("[Scoring POST Error]", error);
    return jsonError("Lỗi khi lưu kết quả tính điểm: " + error.message, 500);
  }
}

/** Cán bộ có thuộc phạm vi đơn vị của người thao tác không? */
async function isInScope(user: any, personId: string): Promise<boolean> {
  const units = await getAuthorizedUnitIds(user);
  if (units === "ALL") return true;
  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: { assignments: { select: { unitId: true } } },
  });
  if (!person) return false;
  return person.assignments.some((a) => units.includes(a.unitId));
}
