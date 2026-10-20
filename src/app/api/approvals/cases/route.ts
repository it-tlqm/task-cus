import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";
import { listMyApprovalCases } from "@/server/approval-case";

export const runtime = "nodejs";

/**
 * GET /api/approvals/cases
 *
 * YC-37 — Danh sách hồ sơ DO TÔI trình, kèm lịch sử quyết định gần nhất.
 * Dùng cho: theo dõi trạng thái · biết vì sao bị trả lại · gửi giải trình lại.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (!user.personId) {
      return jsonError("Tài khoản chưa được liên kết hồ sơ cán bộ", 400);
    }

    const cases = await listMyApprovalCases(user);
    return NextResponse.json({ success: true, data: cases });
  } catch (error: any) {
    console.error("[Approval Cases Error]", error);
    return jsonError("Lỗi khi tải danh sách hồ sơ: " + error.message, 500);
  }
}
