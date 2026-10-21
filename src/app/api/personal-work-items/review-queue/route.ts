/**
 * GET /api/personal-work-items/review-queue — V3.0.1
 * Danh sách công việc đang chờ lãnh đạo trực tiếp xác nhận (chỉ trả về phần người
 * đăng nhập có quyền xử lý).
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";
import { listPendingReviews, REVIEW_STATE_LABEL } from "@/server/work-item-review";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (user.role === "SYSTEM_ADMIN") {
      return NextResponse.json({ success: true, data: [], labels: REVIEW_STATE_LABEL });
    }

    const items = await listPendingReviews(user);
    return NextResponse.json({
      success: true,
      data: items.map((i: any) => ({
        id: i.id,
        title: i.title,
        status: i.status,
        reviewState: i.reviewState,
        resultText: i.resultText,
        completedDate: i.completedDate,
        submittedAt: i.submittedAt,
        submitCount: i.submitCount,
        person: i.person,
        period: i.period,
        product: i.product,
        catalogEntry: i.catalogEntry,
        evidenceCount: i._count?.evidences ?? 0,
      })),
      labels: REVIEW_STATE_LABEL,
    });
  } catch (err: any) {
    console.error("[REVIEW_QUEUE] lỗi:", err);
    return jsonError("Không tải được danh sách hồ sơ chờ xác nhận.", 500);
  }
}
