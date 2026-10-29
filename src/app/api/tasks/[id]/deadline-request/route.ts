import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { verifyTaskAccess, jsonError } from "@/server/guard";
import { isTerminalTaskStatus } from "@/server/task-transitions";
import { advisoryLock } from "@/server/idempotency";
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

    // F4 (YC-38): nhiệm vụ đã nghiệm thu/kết thúc ⇒ không được xin gia hạn thông thường.
    if (isTerminalTaskStatus(access.task?.status)) {
      return jsonError(
        `Nhiệm vụ ${access.task.status === "CANCELED" ? "đã bị loại" : "đã được nghiệm thu hoàn thành"} — không thể xin gia hạn.`,
        409
      );
    }

    const body = await req.json();
    const { requestedDeadline, reason } = body;

    if (!requestedDeadline) {
      return jsonError("Thời hạn đề xuất mới là bắt buộc", 400);
    }

    const { getSystemConfigBoolean } = await import("@/server/system-config");
    const requireReason = await getSystemConfigBoolean("deadlineRequireReason", true);
    if (requireReason && !reason?.trim()) {
      return jsonError("Theo quy định vận hành của hệ thống, bắt buộc phải giải trình lý do khi đề xuất lùi hạn", 400);
    }

    const parsedDate = new Date(requestedDeadline);
    if (isNaN(parsedDate.getTime())) {
      return jsonError("Định dạng ngày không hợp lệ", 400);
    }
    if (parsedDate.getUTCFullYear() < 2000 || parsedDate.getUTCFullYear() > 2100) {
      return jsonError("Thời hạn đề xuất không hợp lệ (ngoài khoảng năm cho phép)", 400);
    }
    const currentDeadline = access.task?.currentDeadline ? new Date(access.task.currentDeadline) : null;
    if (currentDeadline && !isNaN(currentDeadline.getTime()) && parsedDate <= currentDeadline) {
      return jsonError("Thời hạn mới phải sau hạn hiện tại", 400);
    }

    // Chống gửi trùng đề nghị (bấm liên tiếp): cùng người + cùng hạn trong 120s
    const newRequest = await prisma.$transaction(async (tx) => {
      await advisoryLock(tx, `deadline-req:${taskId}:${user.personId}:${parsedDate.toISOString()}`);
      const recent = await tx.deadlineRequest.findFirst({
        where: {
          taskId,
          requestedById: user.personId,
          requestedDeadline: parsedDate,
          createdAt: { gte: new Date(Date.now() - 120_000) },
        },
        include: { requestedBy: true },
      });
      if (recent) return { row: recent, deduplicated: true as const };
      const created = await tx.deadlineRequest.create({
        data: {
          taskId,
          requestedById: user.personId,
          requestedDeadline: parsedDate,
          reason: reason.trim(),
          status: "PENDING",
        },
        include: { requestedBy: true },
      });
      return { row: created, deduplicated: false as const };
    });

    if (newRequest.deduplicated) {
      return NextResponse.json({
        success: true,
        message: "Đề nghị này vừa được gửi (chặn bấm trùng)",
        data: newRequest.row,
        deduplicated: true,
      });
    }

    await recordAuditEvent({
      actorId: user.id,
      action: "TASK_DEADLINE_REQUEST_CREATE",
      resourceType: "DeadlineRequest",
      resourceId: newRequest.row.id,
      newData: { taskId, requestedDeadline: parsedDate, reason: reason.trim() },
    });

    return NextResponse.json({
      success: true,
      message: "Đã gửi đề nghị lùi thời hạn hoàn thành nhiệm vụ",
      data: newRequest.row,
    }, { status: 201 });
  } catch (error: any) {
    return jsonError("Lỗi khi tạo đề nghị lùi hạn: " + error.message, 500);
  }
}
