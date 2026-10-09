import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { verifyTaskAccess, jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);

    const { id: taskId } = await params;
    const access = await verifyTaskAccess(user, taskId, "READ");
    if (!access.allowed) {
      return jsonError(access.reason || "Truy cập bị từ chối", 403);
    }

    const requests = await prisma.deadlineRequest.findMany({
      where: { taskId },
      include: {
        requestedBy: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: requests });
  } catch (error: any) {
    return jsonError("Lỗi khi tải đề nghị lùi hạn: " + error.message, 500);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);

    const { id: taskId } = await params;
    const access = await verifyTaskAccess(user, taskId, "WRITE");
    if (!access.allowed) {
      return jsonError(access.reason || "Truy cập bị từ chối", 403);
    }

    const body = await req.json();
    const { requestedDeadline, reason } = body;

    if (!requestedDeadline || !reason?.trim()) {
      return jsonError("Thời hạn đề xuất mới và Lý do lùi hạn là bắt buộc", 400);
    }

    const parsedDate = new Date(requestedDeadline);
    if (isNaN(parsedDate.getTime())) {
      return jsonError("Định dạng ngày không hợp lệ", 400);
    }

    const newRequest = await prisma.deadlineRequest.create({
      data: {
        taskId,
        requestedById: user.personId,
        requestedDeadline: parsedDate,
        reason: reason.trim(),
        status: "PENDING",
      },
      include: { requestedBy: true },
    });

    await recordAuditEvent({
      actorId: user.id,
      action: "TASK_DEADLINE_REQUEST_CREATE",
      resourceType: "DeadlineRequest",
      resourceId: newRequest.id,
      newData: { taskId, requestedDeadline: parsedDate, reason: reason.trim() },
    });

    return NextResponse.json({
      success: true,
      message: "Đã gửi đề nghị lùi thời hạn hoàn thành nhiệm vụ",
      data: newRequest,
    }, { status: 201 });
  } catch (error: any) {
    return jsonError("Lỗi khi tạo đề nghị lùi hạn: " + error.message, 500);
  }
}
