import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";
import { prisma } from "@/server/db";
import { assertPeriodWritable } from "@/server/period-guard";
import { recordAuditEvent } from "@/server/audit";
import { canEditPlanTitle, planContentLockMessage } from "@/server/planning";

export const runtime = "nodejs";

const PLAN_TITLE_MAX_LENGTH = 300;

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
