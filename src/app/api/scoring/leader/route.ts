import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { getAuthorizedUnitIds, jsonError } from "@/server/guard";
import { computeScoreForPeriod } from "@/server/scoring";
import { computeLeaderDimensions } from "@/server/scoring/leader-average";
import { prisma } from "@/server/db";

export const runtime = "nodejs";

/**
 * GET /api/scoring/leader?personId=&periodType=MONTH|QUARTER&year=&number=
 *
 * YC-35 — Tính a/b/c của LÃNH ĐẠO theo quan hệ phụ trách (đệ quy):
 *   Đội trưởng = bình quân các Đội phó; Đội phó = bình quân các công chức phụ trách.
 *
 * - Chỉ tính khi có quan hệ phụ trách đã XÁC NHẬN trong kỳ.
 * - Không lấy điểm thiếu làm 0 → trả về trạng thái + danh sách người còn thiếu để rà soát.
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
    const personId = searchParams.get("personId") || user.personId || "";
    const periodType = (searchParams.get("periodType") || "MONTH").toUpperCase() as
      | "MONTH"
      | "QUARTER";
    const periodYear = Number(searchParams.get("year") || now.getFullYear());
    const periodNumber = Number(searchParams.get("number") || now.getMonth() + 1);
    if (!personId) return jsonError("Thiếu mã cán bộ", 400);

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
        return jsonError("Bạn không có quyền xem kết quả đánh giá của cán bộ này", 403);
      }
    }

    // Điểm cá nhân của một cán bộ (không phải lãnh đạo) trong kỳ.
    const personalScores = async (pid: string) => {
      const comp = await computeScoreForPeriod({
        personId: pid,
        periodType,
        periodYear,
        periodNumber,
      });
      return {
        a: comp.ratios.a,
        b: comp.ratios.b,
        c: comp.ratios.c,
      };
    };

    const result = await computeLeaderDimensions(
      personId,
      periodType,
      periodYear,
      periodNumber,
      personalScores
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error("[Leader Score Error]", error);
    return jsonError("Lỗi khi tính điểm bình quân lãnh đạo: " + error.message, 500);
  }
}
