import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";
import { listDecidedApprovalCases, listMyApprovalCases } from "@/server/approval-case";

export const runtime = "nodejs";

/**
 * GET /api/approvals/cases
 *
 * - Mặc định: hồ sơ DO TÔI trình (theo dõi, giải trình lại).
 * - `?scope=decided`: lịch sử ĐÃ XỬ LÝ theo thẩm quyền (YC-12).
 *   Lọc thêm: `person` (mã/tên cán bộ), `month` (1-12), `year`.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (!user.personId) {
      return jsonError("Tài khoản chưa được liên kết hồ sơ cán bộ", 400);
    }
    if (user.role === "SYSTEM_ADMIN") {
      return NextResponse.json({ success: true, data: [] });
    }

    const { searchParams } = new URL(req.url);
    const scope = (searchParams.get("scope") || "").toLowerCase();
    if (scope === "decided") {
      const cases = await listDecidedApprovalCases(user, {
        person: searchParams.get("person") || undefined,
        month: searchParams.get("month"),
        year: searchParams.get("year"),
      });
      return NextResponse.json({ success: true, data: cases, scope: "decided" });
    }

    const cases = await listMyApprovalCases(user);
    return NextResponse.json({ success: true, data: cases, scope: "mine" });
  } catch (error: any) {
    console.error("[Approval Cases Error]", error);
    return jsonError("Lỗi khi tải danh sách hồ sơ: " + error.message, 500);
  }
}
