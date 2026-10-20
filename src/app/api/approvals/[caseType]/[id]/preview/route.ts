import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";
import {
  buildApprovalPreview,
  isApprovalCaseType,
  type ApprovalCaseType,
} from "@/server/approval-case";

export const runtime = "nodejs";

/**
 * GET /api/approvals/[caseType]/[id]/preview
 *
 * YC-37 — Bước XEM TRƯỚC trước khi quyết định.
 * - Chỉ đọc: KHÔNG ghi quyết định, KHÔNG đổi trạng thái hồ sơ.
 * - Quyền kiểm tra ở server (RBAC + phạm vi đơn vị + chống IDOR).
 * - File đính kèm trả về ENDPOINT có kiểm tra quyền, không trả URL public.
 */
export async function GET(
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

    const result = await buildApprovalPreview(user, caseType as ApprovalCaseType, id);
    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return NextResponse.json({
      success: true,
      data: result.preview,
    });
  } catch (error: any) {
    console.error("[Approval Preview Error]", error);
    return jsonError("Lỗi khi tải hồ sơ xem trước: " + error.message, 500);
  }
}
