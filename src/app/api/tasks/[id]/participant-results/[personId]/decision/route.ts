import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";
import { ParticipantError, decideParticipantPart } from "@/server/task-participant";

function errorResponse(err: any) {
  if (err instanceof ParticipantError) {
    return NextResponse.json(
      { success: false, error: err.message, data: err.data ?? null },
      { status: err.statusCode }
    );
  }
  return jsonError("Lỗi xử lý phần việc: " + (err?.message || "Không xác định"), 500);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; personId: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    const { id: taskId, personId } = await params;
    const { verifyTaskAccess } = await import("@/server/guard");
    const access = await verifyTaskAccess(user, taskId, "READ");
    if (!access.allowed) return jsonError(access.reason || "Không có quyền xem nhiệm vụ", 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "").toUpperCase();
    if (!["RETURN", "ACCEPT", "EXEMPT"].includes(action)) {
      return jsonError("Hành động xử lý phần việc không hợp lệ.", 400);
    }
    const row = await decideParticipantPart(
      user,
      taskId,
      personId,
      action as "RETURN" | "ACCEPT" | "EXEMPT",
      body.note ?? null
    );
    return NextResponse.json({ success: true, data: row });
  } catch (err: any) {
    return errorResponse(err);
  }
}
