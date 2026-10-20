import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";
import {
  isApprovalCaseType,
  respondToApproval,
  type ApprovalCaseType,
} from "@/server/approval-case";

export const runtime = "nodejs";

/**
 * POST /api/approvals/[caseType]/[id]/response
 *
 * YC-37 — Người được yêu cầu giải trình bổ sung nội dung và gửi lại.
 * - Chỉ người trình hồ sơ được phản hồi.
 * - Hồ sơ quay lại vòng quyết định (currentRound + 1); KHÔNG tạo Task/hồ sơ mới.
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

    const body = await req.json().catch(() => ({}));
    const content = String(body.content || "");

    const result = await respondToApproval(
      user,
      caseType as ApprovalCaseType,
      id,
      content
    );

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error, data: result.data },
        { status: result.status || 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message,
      data: result.data,
    });
  } catch (error: any) {
    console.error("[Approval Response Error]", error);
    return jsonError("Lỗi khi gửi nội dung giải trình: " + error.message, 500);
  }
}
