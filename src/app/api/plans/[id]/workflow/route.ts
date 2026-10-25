import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { getAuthorizedUnitIds, verifyTaskAccess, jsonError, checkPermission } from "@/server/guard";
import { assertPeriodWritable } from "@/server/period-guard";
import { recordAuditEvent } from "@/server/audit";
import { createNotification } from "@/server/notifications";
import { reopenApprovalCaseOnResubmit } from "@/server/approval-case";
import { advisoryLock } from "@/server/idempotency";
import { planContentLockKey, planContentLockMessage } from "@/server/planning";

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
        items: {
          include: {
            _count: { select: { workItems: true, taskLinks: true } },
          },
        },
      },
    });

    if (!plan) {
      return jsonError("Kế hoạch công tác không tồn tại", 404);
    }

    const authorizedUnits = await getAuthorizedUnitIds(user);
    const isUnitAuthorized = authorizedUnits === "ALL" || authorizedUnits.includes(plan.unitId);

    // E1: kỳ đã chốt thì mọi chuyển trạng thái kế hoạch đều bị khóa
    try {
      await assertPeriodWritable(plan.periodId);
    } catch (err: any) {
      return jsonError(err.message, err.statusCode || 423);
    }

    // 1. ACTION: SUBMIT (Trình duyệt kế hoạch)
    if (action === "SUBMIT") {
      // Chỉ Lãnh đạo đơn vị, Trưởng bộ phận hoặc tài khoản có quyền plans.create trong phạm vi đơn vị mới được trình duyệt kế hoạch cấp Đội
      const canSubmit =
        user.role === "UNIT_LEADER" ||
        (user.role === "DEPARTMENT_LEADER" && isUnitAuthorized) ||
        (checkPermission(user, "plans.create") && isUnitAuthorized);

      if (!canSubmit) {
        return jsonError("Bạn không có thẩm quyền trình duyệt kế hoạch cấp bộ phận (Yêu cầu vai trò Trưởng bộ phận)", 403);
      }

      if (plan.status !== "DRAFT" && plan.status !== "RETURNED") {
        // YC-04: retry an toàn — trạng thái đã chuyển thì trả về hiện trạng, không tạo tác dụng phụ mới
        if (plan.status === "SUBMITTED") {
          return NextResponse.json({
            success: true,
            message: "Kế hoạch đã được trình duyệt trước đó (chặn gửi trùng)",
            data: plan,
            deduplicated: true,
          });
        }
        return jsonError(`Kế hoạch ở trạng thái "${plan.status}" không thể trình duyệt lại`, 400);
      }

      // A4: không cho trình duyệt kế hoạch rỗng. Mỗi kế hoạch phải có ít nhất
      // một hạng mục và hạng mục đó phải có đầu việc hoặc nhiệm vụ liên kết.
      if (plan.items.length === 0) {
        return jsonError(
          "Kế hoạch chưa có hạng mục nào — hãy thêm hạng mục và đầu việc trước khi trình duyệt",
          409
        );
      }
      const populatedItems = plan.items.filter(
        (item) => item._count.workItems > 0 || item._count.taskLinks > 0
      );
      if (populatedItems.length === 0) {
        return jsonError(
          "Kế hoạch chưa có đầu việc/nhiệm vụ nào — hãy thêm nội dung trước khi trình duyệt",
          409
        );
      }

      // YC-04: update có điều kiện — hai request đồng thời chỉ một request thắng
      const submitRes = await prisma.plan.updateMany({
        where: { id: planId, status: { in: ["DRAFT", "RETURNED"] } },
        data: { status: "SUBMITTED" },
      });
      if (submitRes.count === 0) {
        const current = await prisma.plan.findUnique({ where: { id: planId } });
        return NextResponse.json({
          success: true,
          message: "Kế hoạch đã được trình duyệt trước đó (chặn gửi trùng)",
          data: current,
          deduplicated: true,
        });
      }
      const updated = await prisma.plan.findUnique({ where: { id: planId } });

      // YC-37: kế hoạch được trình lại sau khi bị trả lại / yêu cầu giải trình
      // → mở lại vòng quyết định (không tạo hồ sơ trùng).
      await reopenApprovalCaseOnResubmit(
        "PLAN",
        planId,
        user.id,
        "Kế hoạch đã trình duyệt lại sau khi bổ sung nội dung."
      );

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

      // Tách người trình — người duyệt: không tự phê duyệt kế hoạch do mình lập
      if (plan.creatorId && plan.creatorId === user.personId) {
        return jsonError("Người lập kế hoạch không được tự phê duyệt. Vui lòng trình cấp có thẩm quyền khác", 403);
      }

      if (plan.status !== "SUBMITTED") {
        // YC-04: retry an toàn sau khi đã duyệt
        if (plan.status === "APPROVED" || (plan as any).status === "IN_EFFECT") {
          return NextResponse.json({
            success: true,
            message: "Kế hoạch đã được phê duyệt trước đó (chặn gửi trùng)",
            data: plan,
            deduplicated: true,
          });
        }
        return jsonError(`Chỉ kế hoạch ở trạng thái "SUBMITTED" mới có thể phê duyệt`, 400);
      }

      // YC-04: update có điều kiện — chống duyệt trùng đồng thời
      const approveRes = await prisma.plan.updateMany({
        where: { id: planId, status: "SUBMITTED" },
        data: {
          status: "APPROVED",
          approvedBy: user.personId,
          approvedAt: new Date(),
        },
      });
      if (approveRes.count === 0) {
        const current = await prisma.plan.findUnique({ where: { id: planId } });
        return NextResponse.json({
          success: true,
          message: "Kế hoạch đã được phê duyệt trước đó (chặn gửi trùng)",
          data: current,
          deduplicated: true,
        });
      }
      const updated = await prisma.plan.findUnique({ where: { id: planId } });

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
          idempotencyKey: `EVENT_PLAN_APP_${plan.id}`,
        });
      }

      return NextResponse.json({
        success: true,
        message: "Đã phê duyệt kế hoạch thành công",
        data: updated,
      });
    }

    // E1-2. ACTION: EFFECT (Ban hành hiệu lực thi hành: APPROVED → IN_EFFECT)
    if (action === "EFFECT") {
      const canEffect =
        user.role === "UNIT_LEADER" ||
        (user.role === "DEPARTMENT_LEADER" && isUnitAuthorized);
      if (!canEffect) {
        return jsonError("Bạn không có thẩm quyền ban hành hiệu lực kế hoạch này", 403);
      }
      if (plan.status === "IN_EFFECT") {
        const current = await prisma.plan.findUnique({ where: { id: planId } });
        return NextResponse.json({
          success: true,
          message: "Kế hoạch đã có hiệu lực thi hành (chặn gửi trùng)",
          data: current,
          deduplicated: true,
        });
      }
      if (plan.status !== "APPROVED") {
        return jsonError(`Chỉ kế hoạch đã phê duyệt mới có thể ban hành hiệu lực`, 400);
      }
      const effectRes = await prisma.plan.updateMany({
        where: { id: planId, status: "APPROVED" },
        data: { status: "IN_EFFECT" },
      });
      if (effectRes.count === 0) {
        const current = await prisma.plan.findUnique({ where: { id: planId } });
        return NextResponse.json({
          success: true, message: "Kế hoạch đã được xử lý trước đó (chặn gửi trùng)",
          data: current, deduplicated: true,
        });
      }
      await recordAuditEvent({
        actorId: user.id,
        action: "PLAN_EFFECT",
        resourceType: "Plan",
        resourceId: planId,
        oldData: { status: "APPROVED" },
        newData: { status: "IN_EFFECT" },
      });
      return NextResponse.json({
        success: true,
        message: "Kế hoạch chính thức có hiệu lực thi hành",
        data: await prisma.plan.findUnique({ where: { id: planId } }),
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

      // YC-04: update có điều kiện — chống trả trùng đồng thời
      const returnRes = await prisma.plan.updateMany({
        where: { id: planId, status: "SUBMITTED" },
        data: {
          status: "RETURNED",
        },
      });
      if (returnRes.count === 0) {
        const current = await prisma.plan.findUnique({ where: { id: planId } });
        return NextResponse.json({
          success: true,
          message: "Kế hoạch đã được xử lý trước đó (chặn gửi trùng)",
          data: current,
          deduplicated: true,
        });
      }
      const updated = await prisma.plan.findUnique({ where: { id: planId } });

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
          idempotencyKey: `EVENT_PLAN_RET_${plan.id}`,
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

      // Slice 2: hạng mục phải thuộc đúng kế hoạch trong URL
      if (targetItem.planId !== planId) {
        return jsonError("Hạng mục kế hoạch không thuộc kế hoạch này", 400);
      }

      // Slice 2: chống IDOR — chỉ người có quyền WRITE trên task và trong phạm vi đơn vị của kế hoạch mới được link
      if (!isUnitAuthorized) {
        return jsonError("Bạn không có quyền liên kết nhiệm vụ vào kế hoạch của bộ phận khác", 403);
      }
      const taskAccess = await verifyTaskAccess(user, taskId, "WRITE");
      if (!taskAccess.allowed) {
        return jsonError(taskAccess.reason || "Truy cập bị từ chối", 403);
      }

      // Task 3C review: LINK_TASK cũng là ghi nội dung kế hoạch. Lấy cùng khóa
      // với item create/hủy mềm, đọc lại trạng thái trong transaction để không
      // gắn nhiệm vụ vào kế hoạch vừa CANCELED (hoặc đã khóa nội dung).
      const linkResult = await prisma.$transaction(async (tx) => {
        await advisoryLock(tx, planContentLockKey(planId));
        const freshPlan = await tx.plan.findUnique({
          where: { id: planId },
          select: { status: true, title: true },
        });
        if (!freshPlan) return { kind: "missingPlan" as const };

        const freshLock = planContentLockMessage(freshPlan);
        if (freshLock) {
          return { kind: "locked" as const, message: freshLock };
        }

        const freshItem = await tx.planItem.findUnique({
          where: { id: planItemId },
          select: { id: true, planId: true },
        });
        if (!freshItem || freshItem.planId !== planId) {
          return { kind: "missingItem" as const };
        }

        // Tạo liên kết nhiều-nhiều bảo toàn Task ID duy nhất
        const created = await tx.planTaskLink.upsert({
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
        return { kind: "linked" as const, link: created };
      });

      if (linkResult.kind === "missingPlan") {
        return jsonError("Kế hoạch công tác không tồn tại", 404);
      }
      if (linkResult.kind === "missingItem") {
        return jsonError("Hạng mục kế hoạch không tồn tại hoặc không thuộc kế hoạch này", 404);
      }
      if (linkResult.kind === "locked") {
        return jsonError(linkResult.message, 409);
      }
      const link = linkResult.link;

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

    // 5. ACTION: REQUEST_AMENDMENT (Trình duyệt bổ sung / Yêu cầu điều chỉnh kế hoạch đã duyệt)
    if (action === "REQUEST_AMENDMENT") {
      const canRequest =
        user.role === "UNIT_LEADER" ||
        (user.role === "DEPARTMENT_LEADER" && isUnitAuthorized) ||
        (checkPermission(user, "plans.create") && isUnitAuthorized);

      if (!canRequest) {
        return jsonError("Bạn không có thẩm quyền đề xuất điều chỉnh/bổ sung kế hoạch này", 403);
      }

      if (plan.status !== "APPROVED" && plan.status !== "IN_EFFECT") {
        return jsonError(`Chỉ kế hoạch đã phê duyệt mới có thể trình duyệt bổ sung/điều chỉnh`, 400);
      }

      const targetStatus = body.unlockToDraft ? "DRAFT" : "SUBMITTED";

      // E1: niêm snapshot vào bảng plan_versions (truy vấn/đối soát được),
      // thay cho việc chỉ nhét JSON vào AuditEvent ở mức pilot
      const planSnapshot = await prisma.plan.findUnique({
        where: { id: planId },
        include: {
          items: {
            include: {
              workItems: { select: { id: true, title: true, personId: true, status: true } },
              taskLinks: { select: { taskId: true } },
            },
            orderBy: { sortOrder: "asc" },
          },
        },
      });
      const snapshotPayload = planSnapshot
        ? {
            title: planSnapshot.title,
            unitId: planSnapshot.unitId,
            periodId: planSnapshot.periodId,
            items: planSnapshot.items.map((pi) => ({
              id: pi.id,
              title: pi.title,
              groupId: pi.groupId,
              workItems: pi.workItems,
              linkedTaskIds: pi.taskLinks.map((l) => l.taskId),
            })),
          }
        : null;
      const lastVersion = await prisma.planVersion.findFirst({
        where: { planId },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      await prisma.planVersion.create({
        data: {
          planId,
          version: (lastVersion?.version || 0) + 1,
          statusBefore: plan.status,
          statusAfter: targetStatus,
          reason: reviewNotes?.trim() || "Trình duyệt bổ sung/điều chỉnh nhiệm vụ",
          snapshotData: (snapshotPayload || {}) as any,
          createdById: user.personId,
          createdBy: `${user.fullName} (${user.username})`,
        },
      });

      const updated = await prisma.plan.update({
        where: { id: planId },
        data: {
          status: targetStatus,
        },
      });

      await recordAuditEvent({
        actorId: user.id,
        action: "PLAN_REQUEST_AMENDMENT",
        resourceType: "Plan",
        resourceId: planId,
        oldData: { status: plan.status },
        newData: {
          status: targetStatus,
          reason: reviewNotes || "Trình duyệt bổ sung/điều chỉnh nhiệm vụ",
          snapshotBeforeUnlock: planSnapshot
            ? {
                title: planSnapshot.title,
                unitId: planSnapshot.unitId,
                periodId: planSnapshot.periodId,
                items: planSnapshot.items.map((pi) => ({
                  id: pi.id,
                  title: pi.title,
                  groupId: pi.groupId,
                  workItems: pi.workItems,
                  linkedTaskIds: pi.taskLinks.map((l) => l.taskId),
                })),
              }
            : null,
        },
      });

      const leaders = await prisma.account.findMany({
        where: {
          roleGrants: {
            some: {
              role: { code: { in: ["UNIT_LEADER", "DEPARTMENT_LEADER"] } },
            },
          },
          status: "ACTIVE",
        },
        select: { personId: true },
      });

      for (const leader of leaders) {
        if (leader.personId && leader.personId !== user.personId) {
          await createNotification({
            recipientId: leader.personId,
            category: "approval",
            type: "PLAN_AMENDMENT_REQUEST",
            title: `Đề xuất điều chỉnh bổ sung kế hoạch: ${plan.title}`,
            content: `Cán bộ ${user.fullName} vừa trình duyệt bổ sung/điều chỉnh kế hoạch "${plan.title}". Lý do: ${reviewNotes || "Bổ sung nhiệm vụ phát sinh"}`,
            actionUrl: "/approvals",
            actionLabel: "Xem phê duyệt",
          });
        }
      }

      return NextResponse.json({
        success: true,
        message:
          targetStatus === "DRAFT"
            ? "Đã mở khóa kế hoạch về trạng thái Dự thảo để bổ sung, điều chỉnh nhiệm vụ"
            : "Đã trình duyệt bổ sung kế hoạch lên Lãnh đạo phê duyệt thành công",
        data: updated,
      });
    }

    return jsonError(`Action "${action}" không hợp lệ`, 400);
  } catch (error: any) {
    return jsonError("Lỗi hệ thống khi xử lý quy trình kế hoạch: " + error.message, 500);
  }
}
