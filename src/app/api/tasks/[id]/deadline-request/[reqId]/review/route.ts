import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";
import { decideApproval } from "@/server/approval-case";

/**
 * Duyệt/từ chối đề nghị lùi hạn.
 *
 * YC-09: mọi quyết định đi qua `decideApproval` để thống nhất ApprovalCase +
 * ApprovalDecision + TaskUpdate + thông báo. Người đề nghị không được tự duyệt
 * yêu cầu của chính mình (kể cả khi là lãnh đạo).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; reqId: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);

    const { id: taskId, reqId } = await params;
    const body = await req.json();
    const { action, reviewNotes } = body; // action: "APPROVE" | "REJECT"

    if (action !== "APPROVE" && action !== "REJECT") {
      return jsonError("Thao tác duyệt phải là APPROVE hoặc REJECT", 400);
    }

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) return jsonError("Nhiệm vụ không tồn tại", 404);

    const deadlineReq = await prisma.deadlineRequest.findUnique({ where: { id: reqId } });
    if (!deadlineReq || deadlineReq.taskId !== taskId) {
      return jsonError("Đề nghị lùi hạn không tồn tại hoặc không khớp nhiệm vụ", 404);
    }

    if (deadlineReq.status !== "PENDING") {
      return jsonError(`Đề nghị này đã được xử lý trước đó (${deadlineReq.status})`, 400);
    }

    // Chặn tự duyệt rõ ràng trước khi vào service (service cũng kiểm tra lại).
    if (deadlineReq.requestedById === user.personId) {
      return jsonError(
        "Bạn không được tự quyết định đề nghị gia hạn do chính mình trình — cần lãnh đạo khác thẩm quyền xử lý.",
        403
      );
    }

    const isApproved = action === "APPROVE";
    const note = typeof reviewNotes === "string" ? reviewNotes.trim() : "";

    const result = await decideApproval({
      user,
      caseType: "DEADLINE_REQUEST",
      resourceId: reqId,
      action: isApproved ? "AGREE" : "REJECT",
      reason: isApproved ? note || null : note || "Không chấp thuận đề nghị gia hạn.",
      content: null,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error, data: result.data },
        { status: result.status || 400 }
      );
    }

    const [updatedReq, updatedTask] = await Promise.all([
      prisma.deadlineRequest.findUnique({ where: { id: reqId } }),
      prisma.task.findUnique({ where: { id: taskId } }),
    ]);

    return NextResponse.json({
      success: true,
      message: isApproved ? "Đã phê duyệt gia hạn nhiệm vụ thành công" : "Đã từ chối đề nghị lùi hạn",
      data: {
        request: updatedReq,
        task: updatedTask,
      },
    });
  } catch (error: any) {
    return jsonError("Lỗi khi xử lý đề nghị lùi hạn: " + error.message, 500);
  }
}
