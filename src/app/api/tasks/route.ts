import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { buildScopedWhereClause, verifyTaskAccess, getAuthorizedUnitIds, jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";
import { createNotification } from "@/server/notifications";

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return jsonError("Yêu cầu đăng nhập để truy cập danh sách nhiệm vụ", 401);
    }

    // Quản trị kỹ thuật không có quyền truy cập danh sách nhiệm vụ nghiệp vụ
    if (user.role === "SYSTEM_ADMIN") {
      return jsonError("Tài khoản Quản trị kỹ thuật không có quyền truy cập dữ liệu nhiệm vụ", 403);
    }

    const scopedFilter = await buildScopedWhereClause(user, "unitId");

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const priority = searchParams.get("priority");
    const hasIssueParam = searchParams.get("hasIssue");

    const where: any = {
      ...scopedFilter,
    };

    if (status) {
      if (status === "COMPLETED" || status === "DONE") {
        where.status = { in: ["COMPLETED", "DONE"] };
      } else {
        where.status = status;
      }
    }
    if (priority) where.priority = priority;
    if (hasIssueParam !== null) {
      where.hasIssue = hasIssueParam === "true";
    }

    const tasks = await prisma.task.findMany({
      where,
      include: {
        owner: true,
        unit: true,
        assignees: {
          include: { person: true },
        },
        planLinks: {
          include: {
            planItem: {
              include: { plan: true },
            },
          },
        },
        deadlineRequests: {
          where: { status: "PENDING" },
          orderBy: { createdAt: "desc" },
        },
        updates: {
          orderBy: { createdAt: "desc" },
          take: 3,
          include: { author: true },
        },
      },
      orderBy: [{ currentDeadline: "asc" }, { createdAt: "desc" }],
    });

    const now = new Date();

    // Tính toán cờ isOverdue độc lập với hasIssue
    const enrichedTasks = tasks.map((t) => {
      const isFinished = t.status === "COMPLETED" || t.status === "DONE" || t.status === "CANCELED";
      const isOverdue = !isFinished && new Date(t.currentDeadline) < now;
      return {
        ...t,
        isOverdue,
      };
    });

    return NextResponse.json({ success: true, data: enrichedTasks });
  } catch (error: any) {
    return jsonError("Lỗi khi tải danh sách nhiệm vụ: " + error.message, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return jsonError("Vui lòng đăng nhập để tạo nhiệm vụ", 401);
    }

    if (user.role === "SYSTEM_ADMIN") {
      return jsonError("Quản trị kỹ thuật không có thẩm quyền tạo nhiệm vụ nghiệp vụ", 403);
    }

    const body = await req.json();
    const {
      title,
      description,
      ownerId,
      unitId,
      priority,
      deadline,
      expectedResultText,
      assigneeIds, // Danh sách ID cán bộ phối hợp
    } = body;

    const effectiveOwnerId = ownerId || user.personId;
    const effectiveDeadline = deadline || body.currentDeadline;

    if (!title || !effectiveOwnerId || !effectiveDeadline) {
      return jsonError("Tiêu đề, Người chủ trì và Hạn hoàn thành là bắt buộc", 400);
    }

    let targetUnitId = unitId || user.unitId;
    if (!targetUnitId) {
      const defaultUnit = await prisma.orgUnit.findFirst({
        where: { level: 2 },
      });
      targetUnitId = defaultUnit?.id;
    }
    if (!targetUnitId) {
      return jsonError("Đơn vị thực hiện là bắt buộc", 400);
    }

    // Cán bộ công chức thường chỉ được tạo nhiệm vụ trong bộ phận của mình
    if (user.role === "STAFF" && user.unitId && targetUnitId !== user.unitId) {
      return jsonError("Bạn chỉ được tạo nhiệm vụ trong bộ phận của mình", 403);
    }

    const taskCode = `NV-${Date.now().toString().slice(-6)}`;
    const parsedDeadline = new Date(effectiveDeadline);

    const newTask = await prisma.task.create({
      data: {
        code: taskCode,
        title,
        description,
        ownerId: effectiveOwnerId,
        unitId: targetUnitId,
        priority: priority || "Cao",
        status: "NOT_STARTED",
        originalDeadline: parsedDeadline,
        currentDeadline: parsedDeadline,
        expectedResultText,
        assignees: assigneeIds && assigneeIds.length > 0 ? {
          create: assigneeIds.map((pId: string) => ({
            personId: pId,
            role: "COLLABORATOR",
          })),
        } : undefined,
      },
      include: {
        owner: true,
        unit: true,
        assignees: { include: { person: true } },
      },
    });

    await recordAuditEvent({
      actorId: user.id,
      action: "TASK_CREATE",
      resourceType: "Task",
      resourceId: newTask.id,
      newData: { code: newTask.code, title: newTask.title, unitId: newTask.unitId, ownerId },
    });

    // 1. Tạo thông báo giao việc đến người chủ trì thực hiện
    await createNotification({
      recipientId: newTask.ownerId,
      category: "task",
      type: "TASK_ASSIGNED",
      title: `Nhiệm vụ mới: [${newTask.code}] ${newTask.title}`,
      content: `Đồng chí được phân công chủ trì thực hiện nhiệm vụ '${newTask.title}'. Hạn hoàn thành: ${newTask.currentDeadline.toLocaleDateString("vi-VN")}.`,
      tag: "GIAO VIỆC MỚI",
      tagType: "primary",
      entityType: "TASK",
      entityId: newTask.id,
      actionUrl: `/tasks/${newTask.id}`,
      actionLabel: "Xem chi tiết nhiệm vụ",
      taskCode: newTask.code,
      idempotencyKey: `EVENT_TASK_ASSIGNED_${newTask.id}_${newTask.ownerId}`,
    });

    // 2. Tạo thông báo cho các cán bộ phối hợp (nếu có)
    if (assigneeIds && Array.isArray(assigneeIds)) {
      for (const pId of assigneeIds) {
        if (pId !== newTask.ownerId) {
          await createNotification({
            recipientId: pId,
            category: "task",
            type: "TASK_ASSIGNED",
            title: `Nhiệm vụ phối hợp: [${newTask.code}] ${newTask.title}`,
            content: `Đồng chí được phân công phối hợp thực hiện nhiệm vụ '${newTask.title}'. Hạn hoàn thành: ${newTask.currentDeadline.toLocaleDateString("vi-VN")}.`,
            tag: "PHỐI HỢP",
            tagType: "primary",
            entityType: "TASK",
            entityId: newTask.id,
            actionUrl: `/tasks/${newTask.id}`,
            actionLabel: "Xem chi tiết nhiệm vụ",
            taskCode: newTask.code,
            idempotencyKey: `EVENT_TASK_ASSIGNED_${newTask.id}_${pId}`,
          });
        }
      }
    }

    return NextResponse.json({ success: true, data: newTask }, { status: 201 });
  } catch (error: any) {
    return jsonError("Lỗi khi tạo nhiệm vụ: " + error.message, 500);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return jsonError("Vui lòng đăng nhập để cập nhật nhiệm vụ", 401);
    }

    const body = await req.json();
    const {
      id,
      action,
      status,
      actualResultText,
      hasIssue,
      issueNotes,
      assigneeIds,
    } = body;

    if (!id) {
      return jsonError("Thiếu Task ID", 400);
    }

    // KIỂM TRA CHỐNG LỖ HỔNG IDOR
    const accessCheck = await verifyTaskAccess(user, id, "WRITE");
    if (!accessCheck.allowed) {
      return jsonError(accessCheck.reason || "Truy cập bị từ chối", 403);
    }

    const currentTask = accessCheck.task;
    const updateData: any = {};

    // Xử lý các action chuyên biệt
    if (action === "SUBMIT_COMPLETION") {
      // Cán bộ báo hoàn thành: Chuyển sang WAITING_REVIEW ("Chờ xác nhận hoàn thành")
      updateData.status = "WAITING_REVIEW";
      if (actualResultText) updateData.actualResultText = actualResultText;

      await prisma.taskUpdate.create({
        data: {
          taskId: id,
          authorId: user.personId,
          statusBefore: currentTask.status,
          statusAfter: "WAITING_REVIEW",
          notes: `Cán bộ báo hoàn thành nhiệm vụ. Kết quả: ${actualResultText || "Đã xong theo yêu cầu"}`,
        },
      });
    } else if (action === "CONFIRM_COMPLETION") {
      // Người giao việc hoặc Lãnh đạo xác nhận hoàn thành: Chuyển sang COMPLETED
      const authorizedUnits = await getAuthorizedUnitIds(user);
      const canConfirm =
        user.role === "UNIT_LEADER" ||
        (user.role === "DEPARTMENT_LEADER" && (authorizedUnits === "ALL" || authorizedUnits.includes(currentTask.unitId))) ||
        currentTask.ownerId === user.personId;

      if (!canConfirm) {
        return jsonError("Bạn không có thẩm quyền nghiệm thu xác nhận nhiệm vụ này", 403);
      }

      updateData.status = "COMPLETED";

      await prisma.taskUpdate.create({
        data: {
          taskId: id,
          authorId: user.personId,
          statusBefore: currentTask.status,
          statusAfter: "COMPLETED",
          notes: "Lãnh đạo / Người giao việc đã xác nhận hoàn thành nhiệm vụ.",
        },
      });
    } else if (action === "REJECT_COMPLETION") {
      // Trả lại nhiệm vụ yêu cầu làm tiếp
      updateData.status = "IN_PROGRESS";
      if (issueNotes) {
        updateData.hasIssue = true;
        updateData.issueNotes = issueNotes;
      }

      await prisma.taskUpdate.create({
        data: {
          taskId: id,
          authorId: user.personId,
          statusBefore: currentTask.status,
          statusAfter: "IN_PROGRESS",
          notes: `Trả lại nhiệm vụ yêu cầu hoàn thiện thêm: ${issueNotes || "Chưa đạt yêu cầu"}`,
        },
      });
    } else {
      // Cập nhật thông thường
      if (status) {
        updateData.status = status === "DONE" ? "COMPLETED" : status;
      }
      if (actualResultText !== undefined) updateData.actualResultText = actualResultText;
      if (hasIssue !== undefined) {
        updateData.hasIssue = Boolean(hasIssue);
        updateData.issueNotes = hasIssue ? issueNotes : null;
      }
    }

    // Cập nhật danh sách phối hợp nếu có
    if (assigneeIds && Array.isArray(assigneeIds)) {
      await prisma.taskAssignee.deleteMany({ where: { taskId: id } });
      if (assigneeIds.length > 0) {
        await prisma.taskAssignee.createMany({
          data: assigneeIds.map((pId: string) => ({
            taskId: id,
            personId: pId,
            role: "COLLABORATOR",
          })),
        });
      }
    }

    const updatedTask = await prisma.task.update({
      where: { id },
      data: updateData,
      include: {
        owner: true,
        unit: true,
        assignees: { include: { person: true } },
      },
    });

    await recordAuditEvent({
      actorId: user.id,
      action: action || "TASK_UPDATE",
      resourceType: "Task",
      resourceId: updatedTask.id,
      oldData: { status: currentTask.status },
      newData: { status: updatedTask.status, hasIssue: updatedTask.hasIssue },
    });

    return NextResponse.json({ success: true, data: updatedTask });
  } catch (error: any) {
    return jsonError("Lỗi khi cập nhật nhiệm vụ: " + error.message, 500);
  }
}
