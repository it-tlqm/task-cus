import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { getAuthorizedUnitIds, jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";

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

    // Quyền duyệt: Lãnh đạo đơn vị hoặc Trưởng bộ phận phụ trách
    const authorizedUnits = await getAuthorizedUnitIds(user);
    const canReview =
      user.role === "UNIT_LEADER" ||
      (user.role === "DEPARTMENT_LEADER" && (authorizedUnits === "ALL" || authorizedUnits.includes(task.unitId)));

    if (!canReview) {
      return jsonError("Bạn không có thẩm quyền phê duyệt đề nghị lùi hạn này", 403);
    }

    const isApproved = action === "APPROVE";

    // Cập nhật DeadlineRequest
    const updatedReq = await prisma.deadlineRequest.update({
      where: { id: reqId },
      data: {
        status: isApproved ? "APPROVED" : "REJECTED",
        reviewedById: user.personId,
        reviewedAt: new Date(),
        reviewNotes: reviewNotes || null,
      },
    });

    // Nếu phê duyệt -> cập nhật currentDeadline của Task sang thời hạn mới
    let updatedTask = task;
    if (isApproved) {
      updatedTask = await prisma.task.update({
        where: { id: taskId },
        data: {
          currentDeadline: deadlineReq.requestedDeadline,
        },
      });

      // Ghi log cập nhật tiến độ
      await prisma.taskUpdate.create({
        data: {
          taskId,
          authorId: user.personId,
          notes: `Lãnh đạo phê duyệt gia hạn nhiệm vụ đến ngày ${deadlineReq.requestedDeadline.toLocaleDateString("vi-VN")}. Lý do: ${deadlineReq.reason}`,
        },
      });
    } else {
      await prisma.taskUpdate.create({
        data: {
          taskId,
          authorId: user.personId,
          notes: `Lãnh đạo từ chối đề nghị gia hạn nhiệm vụ. Lý do: ${reviewNotes || "Không chấp thuận"}`,
        },
      });
    }

    await recordAuditEvent({
      actorId: user.id,
      action: isApproved ? "TASK_DEADLINE_REQUEST_APPROVED" : "TASK_DEADLINE_REQUEST_REJECTED",
      resourceType: "DeadlineRequest",
      resourceId: reqId,
      oldData: { deadline: task.currentDeadline },
      newData: { newDeadline: isApproved ? deadlineReq.requestedDeadline : task.currentDeadline, reviewNotes },
    });

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
