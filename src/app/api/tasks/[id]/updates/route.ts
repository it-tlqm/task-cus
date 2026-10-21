import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { verifyTaskAccess, jsonError } from "@/server/guard";
import { assertTaskStatusTransition, isTaskLeader } from "@/server/task-transitions";
import { advisoryLock, isValidProgressStep } from "@/server/idempotency";
import { recordAuditEvent } from "@/server/audit";
import { reopenApprovalCaseOnResubmit } from "@/server/approval-case";

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

    const updates = await prisma.taskUpdate.findMany({
      where: { taskId },
      include: { author: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: updates });
  } catch (error: any) {
    return jsonError("Lỗi khi tải lịch sử tiến độ: " + error.message, 500);
  }
}

/**
 * POST /api/tasks/[id]/updates — cập nhật tiến độ / trình duyệt kết quả.
 *
 * YC-38 B4 — CONTRACT CHUẨN HÓA (áp dụng cho MỌI client gọi endpoint này):
 *  - `newStatus` / `statusAfter` / `status` : client chủ động chỉ định trạng thái đích
 *      (luồng /my-work — giữ nguyên hành vi cũ, không bị ảnh hưởng).
 *  - `submitForReview: true`               : client xin trình duyệt (luồng /tasks/[id]).
 *      + tiến độ = 100%  ⇒ TỰ ĐỘNG trình duyệt  → status = WAITING_REVIEW, kind='submit'
 *      + tiến độ <  100% ⇒ CHƯA triển khai luồng nghiệm thu sớm (đề xuất nghiệp vụ đang chờ
 *                        Hải quan xác nhận) ⇒ chỉ ghi nhật ký, giữ trạng thái đang thực hiện.
 *  - KHÔNG BAO GIỜ tự chuyển thẳng sang COMPLETED (chỉ lãnh đạo mới nghiệm thu).
 *
 * Chống nộp trùng (server-side, không chỉ disable nút):
 *  - Khoá tư vấn 2 tầng: theo người (bấm trùng) + theo nhiệm vụ (2 người nộp đồng thời).
 *  - Đọc lại trạng thái SAU khi khoá (chống TOCTOU) → nếu đã WAITING_REVIEW thì 409.
 *  - Giữ cơ chế chống trùng 15s (cùng người + cùng % + cùng nội dung).
 *
 * Ghi sự kiện lịch sử + đổi trạng thái task trong CÙNG một transaction.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);

    const { id: taskId } = await params;
    // Chỉ người có quyền thực hiện mới được gửi kết quả / cập nhật tiến độ
    const access = await verifyTaskAccess(user, taskId, "WRITE");
    if (!access.allowed) {
      return jsonError(access.reason || "Bạn không có quyền cập nhật nhiệm vụ này", 403);
    }

    const body = await req.json();
    const {
      progressPercent,
      notes,
      newStatus,
      statusAfter,
      status,
      hasIssue,
      issueNotes,
      submitForReview,
      actualResultText,
    } = body;

    const explicitStatus = newStatus || statusAfter || status || null;
    const progress = progressPercent !== undefined ? Number(progressPercent) : null;

    // YC-09: chuẩn hóa bước 5% ngay tại API (0,5,...,100)
    if (progress !== null && !isValidProgressStep(progress)) {
      return jsonError(
        "Tiến độ phải là bội số của 5% trong khoảng 0–100 (ví dụ 5%, 15%, 25%)",
        400
      );
    }

    // ---- Chuẩn hóa ý định trình duyệt
    const wantsSubmit = submitForReview === true || explicitStatus === "WAITING_REVIEW";
    let targetStatus: string | null = explicitStatus;
    let earlySubmitIgnored = false;
    if (!explicitStatus && wantsSubmit) {
      if (progress === 100) {
        targetStatus = "WAITING_REVIEW";
      } else {
        // Trình duyệt sớm (<100%) chưa triển khai — đề xuất nghiệp vụ đang chờ Hải quan xác nhận
        earlySubmitIgnored = true;
        targetStatus = null;
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // Khoá 2 tầng: theo người (bấm trùng) + theo nhiệm vụ (2 người nộp đồng thời)
      await advisoryLock(tx, `task-progress:${taskId}:${user.personId}`);
      await advisoryLock(tx, `task-status:${taskId}`);

      // Đọc lại trạng thái SAU khi khoá (chống TOCTOU)
      const fresh = await tx.task.findUnique({
        where: { id: taskId },
        select: { id: true, status: true, title: true, unitId: true },
      });
      if (!fresh) return { kind: "notfound" as const };

      // Chống nộp trùng: đang chờ duyệt thì KHÔNG tạo thêm sự kiện submit
      if (targetStatus === "WAITING_REVIEW" && fresh.status === "WAITING_REVIEW") {
        return { kind: "already_submitted" as const };
      }

      // Guard tập trung (Slice 1): chặn tự nghiệm thu COMPLETED qua endpoint tiến độ
      try {
        assertTaskStatusTransition({
          currentStatus: fresh.status,
          targetStatus,
          deadlineChanged: false,
          isLeader: await isTaskLeader(user, fresh.unitId),
        });
      } catch (err: any) {
        return {
          kind: "guard" as const,
          message: err.message,
          statusCode: err.statusCode || 403,
        };
      }

      // YC-04: chống cập nhật trùng (bấm liên tiếp/F5) — cùng người, cùng nội dung trong 15s
      const recent = await tx.taskUpdate.findFirst({
        where: {
          taskId,
          authorId: user.personId,
          progressPercent: progress ?? 0,
          notes: notes || null,
          createdAt: { gte: new Date(Date.now() - 15_000) },
        },
        include: { author: true },
        orderBy: { createdAt: "desc" },
      });
      if (recent) return { kind: "dedup" as const, update: recent };

      // Ghi sự kiện lịch sử + đổi trạng thái trong CÙNG transaction
      const createdUpdate = await tx.taskUpdate.create({
        data: {
          taskId,
          authorId: user.personId,
          progressPercent: progress ?? 0,
          statusBefore: fresh.status,
          statusAfter: targetStatus || fresh.status,
          kind:
            targetStatus === "COMPLETED" || targetStatus === "DONE"
              ? "approve"
              : targetStatus === "WAITING_REVIEW"
              ? "submit"
              : "progress",
          notes: notes || null,
        },
        include: { author: true },
      });

      const updateData: any = {};
      if (targetStatus) updateData.status = targetStatus;
      if (hasIssue !== undefined) {
        updateData.hasIssue = Boolean(hasIssue);
        updateData.issueNotes = issueNotes || null;
      }
      if (actualResultText) updateData.actualResultText = actualResultText;

      const updatedTask = await tx.task.update({
        where: { id: taskId },
        data: updateData,
        include: {
          owner: true,
          unit: true,
          assignees: { include: { person: true } },
        },
      });

      return {
        kind: "ok" as const,
        update: createdUpdate,
        task: updatedTask,
        statusBefore: fresh.status,
        submitted: targetStatus === "WAITING_REVIEW",
      };
    });

    if (result.kind === "notfound") {
      return jsonError("Không tìm thấy nhiệm vụ", 404);
    }

    if (result.kind === "guard") {
      return jsonError(result.message, result.statusCode);
    }

    if (result.kind === "already_submitted") {
      return jsonError(
        "Nhiệm vụ này đã được trình Lãnh đạo phê duyệt — không thể trình lặp lại.",
        409
      );
    }

    if (result.kind === "dedup") {
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: { owner: true, unit: true, assignees: { include: { person: true } } },
      });
      return NextResponse.json(
        {
          success: true,
          message: "Tiến độ này vừa được lưu (chặn bấm trùng)",
          data: { update: result.update, task },
          deduplicated: true,
        },
        { status: 200 }
      );
    }

    const createdUpdate = result.update;
    const updatedTask = result.task!;

    // YC-37: nhiệm vụ được trình lại sau khi bị trả lại → mở lại vòng quyết định (không tạo hồ sơ trùng)
    if (result.submitted) {
      try {
        await reopenApprovalCaseOnResubmit(
          "TASK_RESULT",
          taskId,
          user.id,
          "Nhiệm vụ đã được trình lại sau khi bổ sung nội dung."
        );
      } catch {
        /* không có hồ sơ cần mở lại thì bỏ qua */
      }
    }

    await recordAuditEvent({
      actorId: user.id,
      action: "TASK_PROGRESS_UPDATE",
      resourceType: "Task",
      resourceId: taskId,
      oldData: { status: result.statusBefore },
      newData: {
        progressPercent: progress,
        status: updatedTask.status,
        hasIssue: updatedTask.hasIssue,
        submitted: result.submitted,
        kind: createdUpdate.kind,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: result.submitted
          ? "Đã nộp kết quả và trình Lãnh đạo đơn vị phê duyệt!"
          : "Đã cập nhật tiến độ nhiệm vụ thành công",
        data: {
          update: createdUpdate,
          task: updatedTask,
        },
        submitted: result.submitted,
        earlySubmitIgnored,
        earlySubmitNote: earlySubmitIgnored
          ? "Chưa triển khai luồng trình duyệt sớm khi tiến độ dưới 100% (đề xuất nghiệp vụ đang chờ xác nhận) — chỉ cập nhật nhật ký."
          : undefined,
      },
      { status: 201 }
    );
  } catch (error: any) {
    return jsonError("Lỗi khi lưu tiến độ: " + error.message, 500);
  }
}
