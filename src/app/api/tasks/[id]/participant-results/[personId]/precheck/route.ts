import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";
import { ParticipantError } from "@/server/task-participant-error";
import { precheckParticipantPart } from "@/server/approval-route";

function errorResponse(err: any) {
  if (err instanceof ParticipantError) {
    return NextResponse.json(
      { success: false, error: err.message, data: err.data ?? null },
      { status: err.statusCode }
    );
  }
  return jsonError("Lỗi kiểm tra sơ bộ phần việc: " + (err?.message || "Không xác định"), 500);
}

/**
 * YC-11 — pre-check PASS/RETURN cho một phần việc.
 * Không tạo ApprovalCase; chỉ ghi event + projection participant.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; personId: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    const { id: taskId, personId } = await params;
    // Không dùng verifyTaskAccess ở đây: pre-checker có thể ở bộ phận khác
    // (multi-department M2) và không phải assignee. Quyền thực sự được kiểm tra
    // theo tuyến PersonSupervision bên trong service (fail-closed 403).
    if (user.role === "SYSTEM_ADMIN") {
      return jsonError("Quản trị kỹ thuật không có quyền nghiệp vụ.", 403);
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "").toUpperCase();
    if (action !== "PASS" && action !== "RETURN") {
      return jsonError("Hành động kiểm tra sơ bộ không hợp lệ (PASS/RETURN).", 400);
    }

    const result = await precheckParticipantPart(user, taskId, personId, {
      action,
      note: body.note ?? null,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    return errorResponse(err);
  }
}
