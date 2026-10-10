import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { getAuthorizedUnitIds, jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";
import { createNotification } from "@/server/notifications";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return jsonError("Yêu cầu đăng nhập", 401);
    }

    const { id: planId } = await params;
    const body = await req.json();
    const { action, reviewNotes, taskId, planItemId } = body;

    const plan = await prisma.plan.findUnique({
      where: { id: planId },
      include: {
        unit: true,
        items: true,
      },
    });

    if (!plan) {
      return jsonError("Kế hoạch công tác không tồn tại", 404);
    }

    const authorizedUnits = await getAuthorizedUnitIds(user);
    const isUnitAuthorized = authorizedUnits === "ALL" || authorizedUnits.includes(plan.unitId);

    // 1. ACTION: SUBMIT (Trình duyệt kế hoạch)
    if (action === "SUBMIT") {
      // Người tạo hoặc thành viên thuộc đơn vị có quyền trình duyệt
      if (!isUnitAuthorized && plan.creatorId !== user.personId) {
        return jsonError("Bạn không có quyền trình duyệt kế hoạch của bộ phận khác", 403);
      }

      if (plan.status !== "DRAFT" && plan.status !== "RETURNED") {
        return jsonError(`Kế hoạch ở trạng thái "${plan.status}" không thể trình duyệt lại`, 400);
      }

      const updated = await prisma.plan.update({
        where: { id: planId },
        data: { status: "SUBMITTED" },
      });

      await recordAuditEvent({
        actorId: user.id,
        action: "PLAN_SUBMIT",
        resourceType: "Plan",
        resourceId: planId,
        oldData: { status: plan.status },
        newData: { status: "SUBMITTED" },
      });

      return NextResponse.json({
        success: true,
        message: "Đã trình duyệt kế hoạch thành công",
        data: updated,
      });
    }

    // 2. ACTION: APPROVE (Phê duyệt kế hoạch)
    if (action === "APPROVE") {
      // Quyền duyệt: Lãnh đạo đơn vị hoặc Trưởng bộ phận trong phạm vi được giao
      const canApprove =
        user.role === "UNIT_LEADER" ||
        (user.role === "DEPARTMENT_LEADER" && isUnitAuthorized);

      if (!canApprove) {
        return jsonError("Bạn không có thẩm quyền phê duyệt kế hoạch này", 403);
      }

      if (plan.status !== "SUBMITTED") {
        return jsonError(`Chỉ kế hoạch ở trạng thái "SUBMITTED" mới có thể phê duyệt`, 400);
      }

      const updated = await prisma.plan.update({
        where: { id: planId },
        data: {
          status: "APPROVED",
          approvedBy: user.personId,
          approvedAt: new Date(),
        },
      });

      await recordAuditEvent({
        actorId: user.id,
        action: "PLAN_APPROVE",
        resourceType: "Plan",
        resourceId: planId,
        oldData: { status: plan.status },
        newData: { status: "APPROVED", approvedBy: user.personId },
      });

      if (plan.creatorId) {
        await createNotification({
          recipientId: plan.creatorId,
          category: "approval",
          type: "PLAN_APPROVED",
          title: `Kế hoạch công tác đã được phê duyệt: ${plan.title}`,
          content: `Lãnh đạo đã phê duyệt kế hoạch công tác '${plan.title}'. Kế hoạch chính thức có hiệu lực thi hành.`,
          tag: "ĐÃ PHÊ DUYỆT",
          tagType: "success",
          entityType: "PLAN",
          entityId: plan.id,
          actionUrl: "/plans",
          actionLabel: "Xem kế hoạch",
          idempotencyKey: `EVENT_PLAN_APP_${plan.id}_${Date.now()}`,
        });
      }

      return NextResponse.json({
        success: true,
        message: "Đã phê duyệt kế hoạch thành công",
        data: updated,
      });
    }

    // 3. ACTION: RETURN (Trả lại kế hoạch kèm ý kiến chỉ đạo)
    if (action === "RETURN") {
      const canReturn =
        user.role === "UNIT_LEADER" ||
        (user.role === "DEPARTMENT_LEADER" && isUnitAuthorized);

      if (!canReturn) {
        return jsonError("Bạn không có thẩm quyền trả lại kế hoạch này", 403);
      }

      if (plan.status !== "SUBMITTED") {
        return jsonError(`Chỉ kế hoạch ở trạng thái "SUBMITTED" mới có thể trả lại yêu cầu hoàn thiện`, 400);
      }

      if (!reviewNotes?.trim()) {
        return jsonError("Vui lòng ghi rõ lý do hoặc nội dung chỉ đạo chỉnh sửa", 400);
      }

      const updated = await prisma.plan.update({
        where: { id: planId },
        data: {
          status: "RETURNED",
        },
      });

      await recordAuditEvent({
        actorId: user.id,
        action: "PLAN_RETURN",
        resourceType: "Plan",
        resourceId: planId,
        oldData: { status: plan.status },
        newData: { status: "RETURNED", reviewNotes: reviewNotes.trim() },
      });

      if (plan.creatorId) {
        await createNotification({
          recipientId: plan.creatorId,
          category: "approval",
          type: "PLAN_RETURNED",
          title: `Kế hoạch công tác bị trả lại: ${plan.title}`,
          content: `Lãnh đạo yêu cầu chỉnh sửa/hoàn thiện kế hoạch '${plan.title}'. Ý kiến chỉ đạo: ${reviewNotes.trim()}`,
          tag: "TRẢ LẠI KẾ HOẠCH",
          tagType: "danger",
          entityType: "PLAN",
          entityId: plan.id,
          actionUrl: "/plans",
          actionLabel: "Chỉnh sửa kế hoạch",
          idempotencyKey: `EVENT_PLAN_RET_${plan.id}_${Date.now()}`,
        });
      }

      return NextResponse.json({
        success: true,
        message: "Đã trả lại kế hoạch yêu cầu hoàn thiện",
        data: updated,
      });
    }

    // 4. ACTION: LINK_TASK (Liên kết nhiệm vụ có sẵn vào kế hoạch - Single Distinct Task ID)
    if (action === "LINK_TASK") {
      if (!taskId || !planItemId) {
        return jsonError("Thiếu Task ID hoặc Plan Item ID", 400);
      }

      // Kiểm tra xem task và plan item có tồn tại không
      const targetTask = await prisma.task.findUnique({ where: { id: taskId } });
      const targetItem = await prisma.planItem.findUnique({ where: { id: planItemId } });

      if (!targetTask || !targetItem) {
        return jsonError("Nhiệm vụ hoặc Hạng mục kế hoạch không tồn tại", 404);
      }

      // Tạo liên kết nhiều-nhiều bảo toàn Task ID duy nhất
      const link = await prisma.planTaskLink.upsert({
        where: {
          planItemId_taskId: {
            planItemId,
            taskId,
          },
        },
        create: {
          planItemId,
          taskId,
        },
        update: {},
      });

      await recordAuditEvent({
        actorId: user.id,
        action: "PLAN_TASK_LINK",
        resourceType: "PlanTaskLink",
        resourceId: link.id,
        newData: { planId, planItemId, taskId },
      });

      return NextResponse.json({
        success: true,
        message: "Đã liên kết nhiệm vụ vào kế hoạch thành công (Không clone bản ghi)",
        data: link,
      });
    }

    return jsonError(`Action "${action}" không hợp lệ`, 400);
  } catch (error: any) {
    return jsonError("Lỗi hệ thống khi xử lý quy trình kế hoạch: " + error.message, 500);
  }
}
