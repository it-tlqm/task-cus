import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";
import {
  decideApproval,
  isApprovalCaseType,
  type ApprovalCaseType,
} from "@/server/approval-case";

export const runtime = "nodejs";

/**
 * POST /api/approvals/[caseType]/[id]/decision
 *
 * YC-37 — Ghi quyết định sau khi đã XEM TRƯỚC.
 * action:
 *   - AGREE   : đồng ý (chấp thuận)
 *   - REJECT  : không đồng ý — BẮT BUỘC có lý do
 *   - CLARIFY : yêu cầu giải trình — BẮT BUỘC có nội dung cần giải trình
 *
 * Server kiểm tra: RBAC, phạm vi đơn vị, trạng thái hồ sơ, chống bấm lặp.
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
    const action = String(body.action || "").toUpperCase();
    if (!["AGREE", "REJECT", "CLARIFY"].includes(action)) {
      return jsonError("Lựa chọn không hợp lệ (AGREE, REJECT hoặc CLARIFY)", 400);
    }

    const result = await decideApproval({
      user,
      caseType: caseType as ApprovalCaseType,
      resourceId: id,
      action: action as "AGREE" | "REJECT" | "CLARIFY",
      reason: body.reason ?? null,
      content: body.content ?? null,
      returnPersonIds: Array.isArray(body.returnPersonIds)
        ? body.returnPersonIds.filter((x: any) => typeof x === "string")
        : [],
    });

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
    console.error("[Approval Decision Error]", error);
    return jsonError("Lỗi khi ghi quyết định: " + error.message, 500);
  }
}
