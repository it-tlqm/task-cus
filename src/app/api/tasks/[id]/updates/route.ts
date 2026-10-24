import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { verifyTaskAccess, jsonError } from "@/server/guard";
import {
  assertTaskNotTerminal,
  assertTaskStatusTransition,
  isTaskLeader,
  isTerminalTaskStatus,
} from "@/server/task-transitions";
import { advisoryLock, isValidProgressStep } from "@/server/idempotency";
import { recordAuditEvent } from "@/server/audit";
import { reopenApprovalCaseOnResubmit, decideApproval } from "@/server/approval-case";
import {
  ParticipantError,
  recordParticipantProgress,
  submitOverallResult,
} from "@/server/task-participant";

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

    // YC-09 Phase 1 — Collaborator chỉ ghi phần việc, không ghi Task-level.
    const isOwnerUser = access.task?.ownerId === user.personId;
    const isCollaboratorUser = (access.task?.assignees || []).some(
      (a: any) => a.personId === user.personId
    );
    const isLeaderUser = await isTaskLeader(user, access.task?.unitId || "");
    if (isCollaboratorUser && !isOwnerUser && !isLeaderUser) {
      if (wantsSubmit) {
        return jsonError(
          "Chỉ người chủ trì mới được nộp kết quả chung. Người phối hợp chỉ báo phần việc của mình.",
          403
        );
      }
      if (
        explicitStatus ||
        actualResultText !== undefined ||
        hasIssue !== undefined ||
        issueNotes !== undefined
      ) {
        return jsonError(
          "Người phối hợp chỉ được báo tiến độ/kết quả phần việc của mình. Không được đổi trạng thái, kết quả chung hoặc cờ vướng mắc của nhiệm vụ.",
          403
        );
      }
      if (progress === null) {
        return jsonError("Vui lòng nhập tiến độ phần việc (bước 5%).", 422);
      }
      const part = await recordParticipantProgress(user, taskId, {
        progressPercent: progress,
        notes: notes ?? null,
      });
      return NextResponse.json(
        {
          success: true,
          message: "Đã cập nhật tiến độ phần việc của bạn.",
          data: { participant: part },
        },
        { status: 201 }
      );
    }

    // E8-A: trả lại hồ sơ qua endpoint tiến độ PHẢI đi qua ApprovalCase và phải có ghi chú.
    // Đi thẳng vào transaction cũ sẽ ghi kind="progress", không có quyết định duyệt và có thể
    // ghi đè tiến độ bằng giá trị client gửi lên — không được phép.
    if (access.task?.status === "WAITING_REVIEW" && targetStatus === "IN_PROGRESS") {
      const returnNote = (notes || "").trim();
      if (!returnNote) {
        return jsonError(
          "Vui lòng nêu lý do trả lại/yêu cầu hoàn thiện. Tiến độ hiện tại (kể cả 100%) được giữ nguyên.",
          400
        );
      }
      const result = await decideApproval({
        user,
        caseType: "TASK_RESULT",
        resourceId: taskId,
        action: "REJECT",
        reason: returnNote,
        content: null,
      });
      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error, data: result.data },
          { status: result.status || 400 }
        );
      }
      const fresh = await prisma.task.findUnique({
        where: { id: taskId },
        include: { owner: true, unit: true, assignees: { include: { person: true } } },
      });
      return NextResponse.json({
        success: true,
        message: result.message,
        data: { task: fresh },
        returned: true,
      });
    }

    // YC-09 Phase 1 — Chủ trì nộp chung qua service S-ALL + snapshot.
    if (isOwnerUser && targetStatus === "WAITING_REVIEW") {
      const submitted = await submitOverallResult(user, taskId, {
        actualResultText: actualResultText ?? null,
        note: notes ?? null,
      });
      try {
        await reopenApprovalCaseOnResubmit(
          "TASK_RESULT",
          taskId,
          user.id,
          "Nhiệm vụ đã được trình lại sau khi bổ sung nội dung."
        );
      } catch {
        /* lần nộp đầu chưa có case — bình thường */
      }
      return NextResponse.json(
        {
          success: true,
          message: "Đã nộp kết quả chung và trình Lãnh đạo phê duyệt.",
          data: { update: submitted.update, task: submitted.task, snapshot: submitted.snapshot },
          submitted: true,
        },
        { status: 201 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // Khoá 2 tầng: theo người (bấm trùng) + theo nhiệm vụ (2 người nộp đồng thời)
      await advisoryLock(tx, `task-progress:${taskId}:${user.personId}`);
      await advisoryLock(tx, `task-status:${taskId}`);

      // Đọc lại trạng thái SAU khi khoá (chống TOCTOU)
      const fresh = await tx.task.findUnique({
        where: { id: taskId },
        select: { id: true, status: true, title: true, unitId: true, ownerId: true },
      });
      if (!fresh) return { kind: "notfound" as const };
      const isOwner = fresh.ownerId === user.personId;

      // F2: nhiệm vụ đã nghiệm thu/kết thúc ⇒ KHÔNG cập nhật tiến độ, trạng thái,
      // ghi đè kết quả hay nộp lại. Chặn ở server, trả 409, KHÔNG ghi bản ghi nào.
      if (isTerminalTaskStatus(fresh.status)) {
        return { kind: "terminal" as const, status: fresh.status };
      }

      // YC-09: nghiệm thu chỉ qua hồ sơ phê duyệt (ApprovalCase), không ghi tắt qua tiến độ.
      if (targetStatus === "COMPLETED" || targetStatus === "DONE") {
        return {
          kind: "guard" as const,
          message:
            "Không nghiệm thu trực tiếp qua cập nhật tiến độ. Vui lòng xử lý tại hồ sơ phê duyệt để lưu đúng lịch sử.",
          statusCode: 403,
        };
      }

      // YC-09: chỉ người chủ trì được nộp kết quả; người phối hợp không nộp thay.
      if (targetStatus === "WAITING_REVIEW" && !isOwner) {
        return {
          kind: "guard" as const,
          message:
            "Chỉ người chủ trì nhiệm vụ mới được nộp kết quả trình Lãnh đạo phê duyệt. Người phối hợp chỉ ghi tiến độ phần việc của mình.",
          statusCode: 403,
        };
      }

      // YC-09: người phối hợp không được ghi đè kết quả chung — từ chối, KHÔNG báo thành công.
      if (actualResultText !== undefined && actualResultText !== null && String(actualResultText).trim() !== "") {
        if (!isOwner) {
          return {
            kind: "forbidden_result" as const,
            message:
              "Bạn là người phối hợp — không được ghi đè kết quả chung của nhiệm vụ. Phần việc của bạn vẫn được ghi nhận qua tiến độ/nhật ký.",
          };
        }
        if (fresh.status === "WAITING_REVIEW") {
          return {
            kind: "guard" as const,
            message: "Nhiệm vụ đang chờ Lãnh đạo phê duyệt — không thể sửa kết quả đã trình.",
            statusCode: 409,
          };
        }
      }

      // Chống nộp trùng: đang chờ duyệt thì KHÔNG tạo thêm sự kiện submit
      if (targetStatus === "WAITING_REVIEW" && fresh.status === "WAITING_REVIEW") {
        return { kind: "already_submitted" as const };
      }

      // Guard tập trung (Slice 1): chặn tự nghiệm thu COMPLETED qua endpoint tiến độ
      try {
        // KHÔNG AI TỰ DUYỆT NHIỆM VỤ CỦA MÌNH: kể cả lãnh đạo thì chủ nhiệm vụ
        // phải được một lãnh đạo khác có thẩm quyền nghiệm thu.
        if (
          (targetStatus === "COMPLETED" || targetStatus === "DONE") &&
          fresh.ownerId === user.personId
        ) {
          return {
            kind: "guard" as const,
            message:
              "Bạn không thể tự nghiệm thu nhiệm vụ do chính mình chủ trì — cần lãnh đạo khác thẩm quyền.",
            statusCode: 403,
          };
        }
        assertTaskStatusTransition({
          currentStatus: fresh.status,
          targetStatus,
          deadlineChanged: false,
          isLeader: await isTaskLeader(user, fresh.unitId),
          isOwner,
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
      // YC-38 (F2/III): kết quả CHUNG của nhiệm vụ thuộc về người chủ trì.
      // Người phối hợp đã bị chặn ở trên nếu cố ghi đè; chỉ ghi khi đúng chủ trì.
      if (actualResultText && isOwner) {
        updateData.actualResultText = actualResultText;
      }

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

    if (result.kind === "forbidden_result") {
      return jsonError(result.message, 403);
    }

    if (result.kind === "terminal") {
      return jsonError(
        `Nhiệm vụ ${result.status === "CANCELED" ? "đã bị loại" : "đã được nghiệm thu hoàn thành"} — không thể cập nhật tiến độ, thay đổi trạng thái, ghi đè kết quả hoặc nộp lại.`,
        409
      );
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
    if (error instanceof ParticipantError) {
      return NextResponse.json(
        { success: false, error: error.message, data: error.data ?? null },
        { status: error.statusCode }
      );
    }
    return jsonError("Lỗi khi lưu tiến độ: " + error.message, 500);
  }
}
