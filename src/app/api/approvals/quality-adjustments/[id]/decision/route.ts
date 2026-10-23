import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";
import { decideQualityAdjustment } from "@/server/approval-quality";

export const runtime = "nodejs";

/**
 * POST /api/approvals/quality-adjustments/[id]/decision
 *
 * YC-10 (A1) — duyệt/từ chối yêu cầu điều chỉnh chất lượng.
 * - Chỉ người có thẩm quyền quyết định hồ sơ.
 * - Không tự duyệt yêu cầu do chính mình gửi.
 * - Lưu old/new/lý do/người quyết định/thời gian; không sửa quality gốc.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);

    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const result = await decideQualityAdjustment({
      user,
      adjustmentId: id,
      action: body.action,
      note: body.note,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.status || 400 }
      );
    }
    return NextResponse.json({ success: true, data: result.data });
  } catch (error: any) {
    console.error("[Quality Adjustment Decision Error]", error);
    return jsonError("Lỗi khi quyết định điều chỉnh chất lượng: " + error.message, 500);
  }
}
