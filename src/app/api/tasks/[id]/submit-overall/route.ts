import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";
import { ParticipantError, submitOverallResult } from "@/server/task-participant";
import { reopenApprovalCaseOnResubmit } from "@/server/approval-case";
import { recordAuditEvent } from "@/server/audit";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    const { id: taskId } = await params;
    const { verifyTaskAccess } = await import("@/server/guard");
    const access = await verifyTaskAccess(user, taskId, "WRITE");
    if (!access.allowed) return jsonError(access.reason || "Không có quyền cập nhật nhiệm vụ", 403);

    const body = await req.json().catch(() => ({}));
    const result = await submitOverallResult(user, taskId, {
      actualResultText: body.actualResultText ?? null,
      note: body.note ?? null,
    });

    // S4: case chỉ được tạo ở lần quyết định đầu; nếu đã có case bị trả lại thì mở lại vòng.
    try {
      await reopenApprovalCaseOnResubmit(
        "TASK_RESULT",
        taskId,
        user.id,
        "Nhiệm vụ đã được trình lại sau khi bổ sung nội dung."
      );
    } catch {
      /* chưa có case để mở lại — bình thường ở lần nộp đầu */
    }

    await recordAuditEvent({
      actorId: user.id,
      action: "TASK_SUBMIT_OVERALL",
      resourceType: "Task",
      resourceId: taskId,
      newData: { round: result.round, status: "WAITING_REVIEW" },
    });

    return NextResponse.json(
      {
        success: true,
        message: "Đã nộp kết quả chung và trình lãnh đạo phê duyệt.",
        data: { task: result.task, snapshot: result.snapshot, round: result.round },
      },
      { status: 201 }
    );
  } catch (err: any) {
    if (err instanceof ParticipantError) {
      return NextResponse.json(
        { success: false, error: err.message, data: err.data ?? null },
        { status: err.statusCode }
      );
    }
    return jsonError("Lỗi khi nộp kết quả chung: " + (err?.message || "Không xác định"), 500);
  }
}
