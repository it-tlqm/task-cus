import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";
import { isApprovalCaseType, type ApprovalCaseType } from "@/server/approval-case";
import { requestQualityAdjustment } from "@/server/approval-quality";

export const runtime = "nodejs";

/**
 * POST /api/approvals/[caseType]/[id]/quality-adjustments
 *
 * YC-10 (A1) — yêu cầu điều chỉnh chất lượng SAU khi hồ sơ đã AGREED.
 * - Không cập nhật quyết định gốc; tạo bản ghi old/new/lý do/người yêu cầu.
 * - Chỉ owner/submitter/tuyến duyệt có thẩm quyền; không cấp quyền mới.
 * - Feature flag server-side `V3_YC10_QUALITY` phải bật.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ caseType: string; id: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);

    const { caseType, id } = await params;
    if (!isApprovalCaseType(caseType)) {
      return jsonError("Loại hồ sơ không hợp lệ", 400);
    }
    if (caseType !== "TASK_RESULT") {
      return jsonError("Chỉ điều chỉnh chất lượng cho hồ sơ nghiệm thu kết quả công việc.", 400);
    }

    const body = await req.json().catch(() => ({}));
    const result = await requestQualityAdjustment({
      user,
      caseType: caseType as ApprovalCaseType,
      resourceId: id,
      newQualityPercent: body.newQualityPercent,
      reason: body.reason,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.status || 400 }
      );
    }
    return NextResponse.json({ success: true, data: result.data }, { status: 201 });
  } catch (error: any) {
    console.error("[Quality Adjustment Request Error]", error);
    return jsonError("Lỗi khi tạo yêu cầu điều chỉnh chất lượng: " + error.message, 500);
  }
}
