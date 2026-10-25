import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";
import { prisma } from "@/server/db";
import { assertPeriodWritable } from "@/server/period-guard";
import { recordAuditEvent } from "@/server/audit";
import { advisoryLock } from "@/server/idempotency";
import {
  canManagePlanContent,
  planContentLockKey,
  planContentLockMessage,
} from "@/server/planning";

export const runtime = "nodejs";

async function getPlanForManage(planId: string) {
  return prisma.plan.findUnique({
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
}

function validateTitle(value: unknown): string | null {
  const title = String(value || "").trim();
  if (!title) return null;
  if (title.length > 300) return null;
  return title;
}

async function validateGroupId(value: unknown): Promise<
  { ok: true; groupId: string | null } | { ok: false }
> {
  if (value === undefined || value === null || value === "") {
    return { ok: true, groupId: null };
  }
  const group = await prisma.activityGroup.findUnique({
    where: { id: String(value) },
    select: { id: true },
  });
  return group ? { ok: true, groupId: group.id } : { ok: false };
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    const { id: planId } = await ctx.params;
    const plan = await getPlanForManage(planId);
    if (!plan) return jsonError("Kế hoạch công tác không tồn tại", 404);
    if (!(await canManagePlanContent(user, plan))) {
      return jsonError("Bạn không có quyền thêm hạng mục vào kế hoạch này", 403);
    }
    const lock = planContentLockMessage(plan);
    if (lock) return jsonError(lock, plan.status === "SUBMITTED" ? 409 : 403);

    try {
      await assertPeriodWritable(plan.periodId);
    } catch (err: any) {
      return jsonError(err.message, err.statusCode || 423);
    }

    const body = await req.json().catch(() => ({}));
    const title = validateTitle(body.title);
    if (!title) {
      return jsonError("Tên hạng mục là bắt buộc và không được vượt quá 300 ký tự", 400);
    }
    const group = await validateGroupId(body.groupId);
    if (!group.ok) return jsonError("Nhóm nghiệp vụ không tồn tại", 400);

    // Task 3C: lấy khóa nội dung dùng chung với hủy mềm. Nếu hủy đang chạy,
    // request này chờ; sau khi lấy khóa phải đọc lại trạng thái để không thêm
    // hạng mục vào kế hoạch vừa chuyển CANCELED.
    const createResult = await prisma.$transaction(async (tx) => {
      await advisoryLock(tx, planContentLockKey(planId));
      const fresh = await tx.plan.findUnique({
        where: { id: planId },
        select: { status: true, title: true },
      });
      if (!fresh) return { kind: "missing" as const };

      const freshLock = planContentLockMessage(fresh);
      if (freshLock) {
        return { kind: "locked" as const, status: fresh.status, message: freshLock };
      }

      const max = await tx.planItem.aggregate({
        where: { planId },
        _max: { sortOrder: true },
      });
      const created = await tx.planItem.create({
        data: {
          planId,
          title,
          groupId: group.groupId,
          sortOrder: Number(body.sortOrder) || (max._max.sortOrder || 0) + 1,
        },
        include: { group: true },
      });
      return { kind: "created" as const, item: created };
    });

    if (createResult.kind === "missing") {
      return jsonError("Kế hoạch công tác không tồn tại", 404);
    }
    if (createResult.kind === "locked") {
      return jsonError(
        createResult.message,
        createResult.status === "SUBMITTED" ? 409 : 403
      );
    }
    const item = createResult.item;

    await recordAuditEvent({
      actorId: user.id,
      action: "PLAN_ITEM_CREATE",
      resourceType: "PlanItem",
      resourceId: item.id,
      newData: { planId, title: item.title, groupId: item.groupId },
    });

    return NextResponse.json({ success: true, data: item }, { status: 201 });
  } catch (error: any) {
    return jsonError("Lỗi khi thêm hạng mục kế hoạch: " + error.message, 500);
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    const { id: planId } = await ctx.params;
    const plan = await getPlanForManage(planId);
    if (!plan) return jsonError("Kế hoạch công tác không tồn tại", 404);
    if (!(await canManagePlanContent(user, plan))) {
      return jsonError("Bạn không có quyền sửa hạng mục của kế hoạch này", 403);
    }
    const lock = planContentLockMessage(plan);
    if (lock) return jsonError(lock, plan.status === "SUBMITTED" ? 409 : 403);

    try {
      await assertPeriodWritable(plan.periodId);
    } catch (err: any) {
      return jsonError(err.message, err.statusCode || 423);
    }

    const body = await req.json().catch(() => ({}));
    const itemId = String(body.itemId || "").trim();
    if (!itemId) return jsonError("Thiếu ID hạng mục cần sửa", 400);
    const current = await prisma.planItem.findFirst({
      where: { id: itemId, planId },
      select: { id: true, title: true, groupId: true, sortOrder: true },
    });
    if (!current) return jsonError("Hạng mục kế hoạch không tồn tại", 404);

    const data: { title?: string; groupId?: string | null; sortOrder?: number } = {};
    if (body.title !== undefined) {
      const title = validateTitle(body.title);
      if (!title) {
        return jsonError("Tên hạng mục là bắt buộc và không được vượt quá 300 ký tự", 400);
      }
      data.title = title;
    }
    if (body.groupId !== undefined) {
      const group = await validateGroupId(body.groupId);
      if (!group.ok) return jsonError("Nhóm nghiệp vụ không tồn tại", 400);
      data.groupId = group.groupId;
    }
    if (body.sortOrder !== undefined) {
      const sortOrder = Number(body.sortOrder);
      if (!Number.isFinite(sortOrder)) return jsonError("Thứ tự hạng mục không hợp lệ", 400);
      data.sortOrder = sortOrder;
    }
    if (Object.keys(data).length === 0) {
      return jsonError("Không có thay đổi nào để lưu", 400);
    }

    const updated = await prisma.planItem.update({
      where: { id: current.id },
      data,
      include: { group: true },
    });

    await recordAuditEvent({
      actorId: user.id,
      action: "PLAN_ITEM_UPDATE",
      resourceType: "PlanItem",
      resourceId: updated.id,
      oldData: current,
      newData: data,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return jsonError("Lỗi khi sửa hạng mục kế hoạch: " + error.message, 500);
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    const { id: planId } = await ctx.params;
    const plan = await getPlanForManage(planId);
    if (!plan) return jsonError("Kế hoạch công tác không tồn tại", 404);
    if (!(await canManagePlanContent(user, plan))) {
      return jsonError("Bạn không có quyền xóa hạng mục của kế hoạch này", 403);
    }
    const lock = planContentLockMessage(plan);
    if (lock) return jsonError(lock, plan.status === "SUBMITTED" ? 409 : 403);

    try {
      await assertPeriodWritable(plan.periodId);
    } catch (err: any) {
      return jsonError(err.message, err.statusCode || 423);
    }

    const itemId = String(req.nextUrl.searchParams.get("itemId") || "").trim();
    if (!itemId) return jsonError("Thiếu ID hạng mục cần xóa", 400);
    const current = await prisma.planItem.findFirst({
      where: { id: itemId, planId },
      select: {
        id: true,
        title: true,
        groupId: true,
        sortOrder: true,
        workItemId: true,
        _count: { select: { workItems: true, taskLinks: true } },
      },
    });
    if (!current) return jsonError("Hạng mục kế hoạch không tồn tại", 404);
    if (
      current.workItemId ||
      current._count.workItems > 0 ||
      current._count.taskLinks > 0
    ) {
      return jsonError(
        "Hạng mục đã có đầu việc/nhiệm vụ liên kết — hãy chuyển hoặc gỡ liên kết trước khi xóa",
        409
      );
    }

    await prisma.planItem.delete({ where: { id: current.id } });
    await recordAuditEvent({
      actorId: user.id,
      action: "PLAN_ITEM_DELETE",
      resourceType: "PlanItem",
      resourceId: current.id,
      oldData: {
        planId,
        title: current.title,
        groupId: current.groupId,
        sortOrder: current.sortOrder,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return jsonError("Lỗi khi xóa hạng mục kế hoạch: " + error.message, 500);
  }
}
