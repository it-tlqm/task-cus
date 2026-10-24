import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";
import { prisma } from "@/server/db";
import { assertPeriodWritable } from "@/server/period-guard";
import { recordAuditEvent } from "@/server/audit";
import {
  PLAN_CANCELABLE_STATUSES,
  PLAN_CANCELED_STATUS,
  canCancelPlan,
  canEditPlanTitle,
  planCancelStatusMessage,
  planContentLockMessage,
} from "@/server/planning";

export const runtime = "nodejs";

const PLAN_TITLE_MAX_LENGTH = 300;
const PLAN_CANCEL_REASON_MAX_LENGTH = 500;

// Các trường không được phép đổi qua PATCH cấp kế hoạch trong phạm vi task này.
const READ_ONLY_FIELDS = ["unitId", "periodId", "status", "creatorId"] as const;

/**
 * PATCH /api/plans/[id] — sửa tiêu đề kế hoạch.
 *
 * Phạm vi Phase 2A/2A2:
 * - Chỉ sửa `title`; không đổi đơn vị, kỳ, trạng thái hay người tạo.
 * - Người tạo sửa kế hoạch của mình khi còn DRAFT/RETURNED.
 * - Lãnh đạo/Trưởng bộ phận sửa theo policy quản lý nội dung hiện hành.
 * - Kế hoạch đã trình duyệt/đã duyệt/có hiệu lực: 409.
 * - Kỳ đã chốt: 423 (theo assertPeriodWritable).
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);

    const { id: planId } = await ctx.params;
    const plan = await prisma.plan.findUnique({
      where: { id: planId },
      select: {
        id: true,
        unitId: true,
        creatorId: true,
        status: true,
        title: true,
        periodId: true,
      },
    });
    if (!plan) return jsonError("Kế hoạch công tác không tồn tại", 404);

    if (!(await canEditPlanTitle(user, plan))) {
      return jsonError("Bạn không có quyền sửa kế hoạch này", 403);
    }

    const lockMessage = planContentLockMessage(plan);
    if (lockMessage) {
      // SUBMITTED/APPROVED/IN_EFFECT: nội dung khóa, phải dùng luồng trình duyệt/trả lại.
      return jsonError(lockMessage, 409);
    }

    try {
      await assertPeriodWritable(plan.periodId);
    } catch (err: any) {
      return jsonError(err.message, err.statusCode || 423);
    }

    const body: any = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonError("Dữ liệu gửi lên không hợp lệ", 400);
    }

    const readOnlyField = READ_ONLY_FIELDS.find((field) =>
      Object.prototype.hasOwnProperty.call(body, field)
    );
    if (readOnlyField) {
      return jsonError(
        "Chỉ được sửa tiêu đề kế hoạch; không được đổi đơn vị, kỳ, trạng thái hoặc người tạo",
        400
      );
    }

    if (typeof body.title !== "string") {
      return jsonError("Tiêu đề kế hoạch là bắt buộc", 400);
    }
    const title = body.title.trim();
    if (!title) {
      return jsonError("Tiêu đề kế hoạch là bắt buộc", 400);
    }
    if (title.length > PLAN_TITLE_MAX_LENGTH) {
      return jsonError(
        `Tiêu đề kế hoạch không được vượt quá ${PLAN_TITLE_MAX_LENGTH} ký tự`,
        400
      );
    }

    if (title === plan.title) {
      return NextResponse.json({ success: true, data: plan, unchanged: true });
    }

    // Cập nhật có điều kiện trạng thái: nếu kế hoạch vừa được trình duyệt/duyệt
    // trong lúc request đang xử lý thì không ghi đè nội dung đã khóa.
    const updatedCount = await prisma.plan.updateMany({
      where: { id: planId, status: { in: ["DRAFT", "RETURNED"] } },
      data: { title },
    });
    if (updatedCount.count === 0) {
      const current = await prisma.plan.findUnique({
        where: { id: planId },
        select: {
          id: true,
          unitId: true,
          creatorId: true,
          status: true,
          title: true,
          periodId: true,
        },
      });
      if (!current) return jsonError("Kế hoạch công tác không tồn tại", 404);
      return jsonError(
        planContentLockMessage(current) ||
          `Kế hoạch ở trạng thái "${current.status}" không thể sửa tiêu đề`,
        409
      );
    }

    const updated = await prisma.plan.findUnique({
      where: { id: planId },
      select: {
        id: true,
        unitId: true,
        creatorId: true,
        status: true,
        title: true,
        periodId: true,
      },
    });
    if (!updated) return jsonError("Kế hoạch công tác không tồn tại", 404);

    await recordAuditEvent({
      actorId: user.id,
      action: "PLAN_UPDATE",
      resourceType: "Plan",
      resourceId: planId,
      oldData: { title: plan.title },
      newData: { title },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return jsonError("Lỗi khi sửa kế hoạch công tác: " + error.message, 500);
  }
}

/**
 * DELETE /api/plans/[id] — hủy mềm kế hoạch trùng.
 *
 * Task 3C:
 * - Bắt buộc `reason`; không xóa cứng, không cascade.
 * - Chỉ DRAFT/RETURNED; SUBMITTED/APPROVED/IN_EFFECT trả 409.
 * - Chặn nếu còn hạng mục/nhiệm vụ liên kết/đầu việc để không mất dữ liệu.
 * - Chỉ người tạo hoặc lãnh đạo trong phạm vi đơn vị.
 * - Ghi audit `PLAN_CANCEL_DUPLICATE`.
 */
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);

    const { id: planId } = await ctx.params;
    const plan = await prisma.plan.findUnique({
      where: { id: planId },
      select: {
        id: true,
        unitId: true,
        creatorId: true,
        status: true,
        title: true,
        periodId: true,
      },
    });
    if (!plan) return jsonError("Kế hoạch công tác không tồn tại", 404);

    if (!(await canCancelPlan(user, plan))) {
      return jsonError("Bạn không có quyền hủy kế hoạch này", 403);
    }

    // Trạng thái khóa phải trả 409 kể cả khi thiếu lý do: đây là quy tắc
    // nghiệp vụ mạnh hơn validation body.
    const statusMessage = planCancelStatusMessage(plan);
    if (statusMessage) return jsonError(statusMessage, 409);

    const body: any = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonError("Dữ liệu gửi lên không hợp lệ", 400);
    }
    if (typeof body.reason !== "string" || !body.reason.trim()) {
      return jsonError("Lý do hủy kế hoạch là bắt buộc", 400);
    }
    const reason = body.reason.trim();
    if (reason.length > PLAN_CANCEL_REASON_MAX_LENGTH) {
      return jsonError(
        `Lý do hủy kế hoạch không được vượt quá ${PLAN_CANCEL_REASON_MAX_LENGTH} ký tự`,
        400
      );
    }

    // Không xóa cứng: còn bất kỳ liên kết nào thì chặn và yêu cầu xử lý trước.
    const [itemCount, taskLinkCount, workItemCount] = await Promise.all([
      prisma.planItem.count({ where: { planId } }),
      prisma.planTaskLink.count({ where: { planItem: { planId } } }),
      prisma.personalWorkItem.count({ where: { planItem: { planId } } }),
    ]);
    if (itemCount > 0 || taskLinkCount > 0 || workItemCount > 0) {
      const blockers = [
        itemCount > 0 ? `${itemCount} hạng mục` : null,
        taskLinkCount > 0 ? `${taskLinkCount} nhiệm vụ liên kết` : null,
        workItemCount > 0 ? `${workItemCount} đầu việc` : null,
      ].filter(Boolean);
      return NextResponse.json(
        {
          success: false,
          code: "PLAN_HAS_LINKS",
          error:
            `Kế hoạch "${plan.title}" còn ${blockers.join(", ")} — không thể hủy. ` +
            "Hãy xử lý/xóa các liên kết trước.",
          blockers: { itemCount, taskLinkCount, workItemCount },
        },
        { status: 409 }
      );
    }

    // Cập nhật có điều kiện trạng thái: nếu kế hoạch vừa được trình duyệt trong
    // lúc request đang xử lý thì không hủy bản đã khóa.
    const updatedCount = await prisma.plan.updateMany({
      where: {
        id: planId,
        status: { in: [...PLAN_CANCELABLE_STATUSES] },
      },
      data: { status: PLAN_CANCELED_STATUS },
    });
    if (updatedCount.count === 0) {
      const current = await prisma.plan.findUnique({
        where: { id: planId },
        select: { id: true, unitId: true, creatorId: true, status: true, title: true },
      });
      if (!current) return jsonError("Kế hoạch công tác không tồn tại", 404);
      return jsonError(
        planCancelStatusMessage(current) ||
          `Kế hoạch ở trạng thái "${current.status}" không thể hủy`,
        409
      );
    }

    await recordAuditEvent({
      actorId: user.id,
      action: "PLAN_CANCEL_DUPLICATE",
      resourceType: "Plan",
      resourceId: planId,
      oldData: {
        status: plan.status,
        title: plan.title,
        unitId: plan.unitId,
        periodId: plan.periodId,
      },
      newData: { status: PLAN_CANCELED_STATUS, reason },
    });

    return NextResponse.json({
      success: true,
      data: { id: planId, status: PLAN_CANCELED_STATUS, reason },
      message: "Đã hủy mềm kế hoạch trùng. Dữ liệu vẫn được lưu để đối soát.",
    });
  } catch (error: any) {
    return jsonError("Lỗi khi hủy kế hoạch công tác: " + error.message, 500);
  }
}
