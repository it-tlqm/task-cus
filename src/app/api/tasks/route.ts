import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { buildScopedWhereClause, verifyTaskAccess, jsonError } from "@/server/guard";
import { assertTaskStatusTransition, isTaskLeader } from "@/server/task-transitions";
import { advisoryLock, normalizeTitle } from "@/server/idempotency";
import { nextTaskCode } from "@/server/task-code";
import { unaccentSearchIds } from "@/server/search";
import { recordAuditEvent } from "@/server/audit";
import { createNotification } from "@/server/notifications";

// YC-04: cửa sổ chống bấm trùng khi giao việc (giây)
const CREATE_DEDUP_WINDOW_SEC = 120;

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
    const deadlineFrom = searchParams.get("deadlineFrom");
    const deadlineTo = searchParams.get("deadlineTo");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10)));
    const search = searchParams.get("search")?.trim() || "";

    const filters: any = {};

    if (status) {
      if (status === "COMPLETED" || status === "DONE") {
        filters.status = { in: ["COMPLETED", "DONE"] };
      } else {
        filters.status = status;
      }
    }
    if (priority) filters.priority = priority;
    if (search) {
      // Tìm không dấu: gõ "Nguyen" ra "Nguyễn" (unaccent 2 vế)
      const ids = await unaccentSearchIds("tasks", ["code", "title"], search);
      if (!ids || ids.length === 0) {
        return NextResponse.json({
          success: true, data: [],
          pagination: { page, pageSize, total: 0, totalPages: 0 },
        });
      }
      filters.id = { in: ids };
    }
    if (deadlineFrom) {
      const d = new Date(deadlineFrom);
      if (!isNaN(d.getTime())) filters.currentDeadline = { ...(filters.currentDeadline || {}), gte: d };
    }
    if (deadlineTo) {
      const d = new Date(deadlineTo);
      if (!isNaN(d.getTime())) filters.currentDeadline = { ...(filters.currentDeadline || {}), lte: d };
    }
    if (hasIssueParam !== null && hasIssueParam !== "") {
      filters.hasIssue = hasIssueParam === "true";
    }
    // Chỉ lấy việc đang có đề xuất lùi hạn chờ duyệt (màn Phê duyệt)
    const deadlinePending = searchParams.get("deadlinePending");
    if (deadlinePending === "1" || deadlinePending === "true") {
      filters.deadlineRequests = { some: { status: "PENDING" } };
    }

    // YC-05: người chủ trì/phối hợp luôn thấy nhiệm vụ của mình kể cả khác đơn vị
    // (không nâng quyền — chỉ cộng thêm 2 điều kiện OR, các guard IDOR giữ nguyên)
    const visibilityClause =
      Object.keys(scopedFilter).length === 0
        ? {}
        : {
            OR: [
              scopedFilter,
              { ownerId: user.personId },
              { assignees: { some: { personId: user.personId } } },
            ],
          };

    const where: any = { ...filters, ...visibilityClause };

    const [total, tasks] = await Promise.all([
      prisma.task.count({ where }),
      prisma.task.findMany({
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
        attachments: {
          orderBy: { createdAt: "desc" },
          include: {
            uploadedBy: {
              select: { fullName: true },
            },
          },
        },
      },
      orderBy: [{ currentDeadline: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      }),
    ]);

    const now = new Date();

    // Tính toán cờ isOverdue độc lập với hasIssue + % tiến độ từ cập nhật mới nhất
    // (Task không lưu sẵn % — nguồn duy nhất là TaskUpdate)
    const enrichedTasks = tasks.map((t) => {
      const isFinished = t.status === "COMPLETED" || t.status === "DONE" || t.status === "CANCELED";
      const isOverdue = !isFinished && new Date(t.currentDeadline) < now;
      const latestProgress = (t.updates as any[])?.[0]?.progressPercent;
      return {
        ...t,
        isOverdue,
        progressPercent: typeof latestProgress === "number" ? latestProgress : isFinished ? 100 : 0,
      };
    });

    return NextResponse.json({
      success: true,
      data: enrichedTasks,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
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

    // YC-01: chuẩn hóa danh sách phối hợp — bỏ trùng, bỏ chủ trì, chỉ giữ người có thật
    const rawAssignees: string[] = Array.isArray(assigneeIds) ? assigneeIds.filter((x) => typeof x === "string") : [];
    const uniqueAssignees = [...new Set(rawAssignees.map((x) => x.trim()).filter(Boolean))].filter(
      (pId) => pId !== effectiveOwnerId
    );
    if (uniqueAssignees.length > 0) {
      const existingCount = await prisma.person.count({ where: { id: { in: uniqueAssignees } } });
      if (existingCount !== uniqueAssignees.length) {
        return jsonError("Danh sách cán bộ phối hợp có người không tồn tại trong hệ thống", 400);
      }
    }

    const parsedDeadline = new Date(effectiveDeadline);

    // YC-04: chống giao việc trùng — khóa tư vấn theo (chủ trì + tiêu đề) rồi kiểm tra
    // cửa sổ 120s. Hai request đồng thời/bấm liên tiếp chỉ tạo đúng 1 Task.
    // E1: mã NV serial theo năm (NV-YYYY-NNNN), cấp phát nguyên tử trong cùng transaction.
    const dedupKey = `task-create:${effectiveOwnerId}:${normalizeTitle(title)}`;
    const newTask = await prisma.$transaction(async (tx) => {
      await advisoryLock(tx, dedupKey);
      const recent = await tx.task.findFirst({
        where: {
          ownerId: effectiveOwnerId,
          title: title.trim(),
          createdAt: { gte: new Date(Date.now() - CREATE_DEDUP_WINDOW_SEC * 1000) },
        },
        include: {
          owner: true,
          unit: true,
          assignees: { include: { person: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      if (recent) return { task: recent, deduplicated: true };

      const taskCode = await nextTaskCode(tx);
      const created = await tx.task.create({
        data: {
          code: taskCode,
          title: title.trim(),
          description,
          ownerId: effectiveOwnerId,
          unitId: targetUnitId,
          priority: priority || "Cao",
          status: "NOT_STARTED",
          originalDeadline: parsedDeadline,
          currentDeadline: parsedDeadline,
          expectedResultText,
          assignees: uniqueAssignees.length > 0 ? {
            create: uniqueAssignees.map((pId: string) => ({
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
      return { task: created, deduplicated: false };
    });

    // YC-04: request trùng trong cửa sổ 120s → trả về bản ghi đã tạo, không spam thông báo
    if (newTask.deduplicated) {
      return NextResponse.json(
        { success: true, data: newTask.task, deduplicated: true, message: "Nhiệm vụ này vừa được tạo (chặn bấm trùng)" },
        { status: 200 }
      );
    }
    const createdTask = newTask.task;

    await recordAuditEvent({
      actorId: user.id,
      action: "TASK_CREATE",
      resourceType: "Task",
      resourceId: createdTask.id,
      newData: { code: createdTask.code, title: createdTask.title, unitId: createdTask.unitId, ownerId, assignees: uniqueAssignees },
    });

    // 1. Tạo thông báo giao việc đến người chủ trì thực hiện
    await createNotification({
      recipientId: createdTask.ownerId,
      category: "task",
      type: "TASK_ASSIGNED",
      title: `Nhiệm vụ mới: [${createdTask.code}] ${createdTask.title}`,
      content: `Đồng chí được phân công chủ trì thực hiện nhiệm vụ '${createdTask.title}'. Hạn hoàn thành: ${createdTask.currentDeadline.toLocaleDateString("vi-VN")}.`,
      tag: "GIAO VIỆC MỚI",
      tagType: "primary",
      entityType: "TASK",
      entityId: createdTask.id,
      actionUrl: `/tasks/${createdTask.id}`,
      actionLabel: "Xem chi tiết nhiệm vụ",
      taskCode: createdTask.code,
      idempotencyKey: `EVENT_TASK_ASSIGNED_${createdTask.id}_${createdTask.ownerId}`,
    });

    // 2. Tạo thông báo cho các cán bộ phối hợp (nếu có)
    for (const pId of uniqueAssignees) {
      await createNotification({
        recipientId: pId,
        category: "task",
        type: "TASK_ASSIGNED",
        title: `Nhiệm vụ phối hợp: [${createdTask.code}] ${createdTask.title}`,
        content: `Đồng chí được phân công phối hợp thực hiện nhiệm vụ '${createdTask.title}'. Hạn hoàn thành: ${createdTask.currentDeadline.toLocaleDateString("vi-VN")}.`,
        tag: "PHỐI HỢP",
        tagType: "primary",
        entityType: "TASK",
        entityId: createdTask.id,
        actionUrl: `/tasks/${createdTask.id}`,
        actionLabel: "Xem chi tiết nhiệm vụ",
        taskCode: createdTask.code,
        idempotencyKey: `EVENT_TASK_ASSIGNED_${createdTask.id}_${pId}`,
      });
    }

    return NextResponse.json({ success: true, data: createdTask }, { status: 201 });
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
    if (action === "ACCEPT_TASK") {
      // Đợt A: người được giao xác nhận đã nhận việc (chủ trì/phối hợp).
      // Chuyển NOT_STARTED → IN_PROGRESS, báo lại người giao việc.
      const isOwner = currentTask.ownerId === user.personId;
      const isAssignee = (currentTask.assignees || []).some((a: any) => a.personId === user.personId);
      if (!isOwner && !isAssignee) {
        return jsonError("Chỉ người chủ trì hoặc phối hợp mới xác nhận nhận việc này", 403);
      }
      if (currentTask.status !== "NOT_STARTED") {
        const fresh = await prisma.task.findUnique({
          where: { id },
          include: { owner: true, unit: true, assignees: { include: { person: true } } },
        });
        return NextResponse.json({
          success: true, data: fresh, deduplicated: true,
          message: "Nhiệm vụ đã được nhận trước đó",
        });
      }
      await prisma.taskUpdate.create({
        data: {
          taskId: id,
          authorId: user.personId,
          progressPercent: 0,
          statusBefore: "NOT_STARTED",
          statusAfter: "IN_PROGRESS",
          kind: "accept",
          notes: `Đã nhận việc, bắt đầu triển khai thực hiện`,
        },
      });
      const accepted = await prisma.task.update({
        where: { id },
        data: { status: "IN_PROGRESS" },
        include: { owner: true, unit: true, assignees: { include: { person: true } } },
      });
      await recordAuditEvent({
        actorId: user.id,
        action: "TASK_ACCEPT",
        resourceType: "Task",
        resourceId: id,
        oldData: { status: "NOT_STARTED" },
        newData: { status: "IN_PROGRESS", acceptedBy: user.fullName },
      });
      // Đánh dấu đã đọc các thông báo giao việc của chính mình cho task này
      await prisma.notification.updateMany({
        where: { recipientId: user.personId, entityType: "TASK", entityId: id, type: "TASK_ASSIGNED", isRead: false },
        data: { isRead: true, readAt: new Date() },
      });
      // Báo lại người đã giao việc (tra từ audit TASK_CREATE)
      try {
        const createAudit = await prisma.auditEvent.findFirst({
          where: { resourceType: "Task", resourceId: id, action: "TASK_CREATE" },
          orderBy: { timestamp: "asc" },
        });
        if (createAudit?.actorId && createAudit.actorId !== user.id) {
          const assigner = await prisma.account.findUnique({
            where: { id: createAudit.actorId }, select: { personId: true },
          });
          if (assigner && assigner.personId !== user.personId) {
            await createNotification({
              recipientId: assigner.personId,
              category: "task",
              type: "TASK_ACCEPTED",
              title: `Đã nhận việc: [${accepted.code}]`,
              content: `${user.fullName} đã xác nhận nhận nhiệm vụ '${accepted.title}' và bắt đầu triển khai.`,
              tag: "ĐÃ NHẬN VIỆC",
              tagType: "success",
              entityType: "TASK",
              entityId: id,
              actionUrl: `/tasks/${id}`,
              actionLabel: "Xem nhiệm vụ",
              taskCode: accepted.code,
              idempotencyKey: `EVENT_TASK_ACCEPT_${id}_${user.personId}`,
            });
          }
        }
      } catch {}
      return NextResponse.json({ success: true, message: "Đã xác nhận nhận việc!", data: accepted });
    } else if (action === "SUBMIT_COMPLETION") {
      // Cán bộ báo hoàn thành: Chuyển sang WAITING_REVIEW ("Chờ xác nhận hoàn thành")
      updateData.status = "WAITING_REVIEW";
      if (actualResultText) updateData.actualResultText = actualResultText;

      await prisma.taskUpdate.create({
        data: {
          taskId: id,
          authorId: user.personId,
          statusBefore: currentTask.status,
          statusAfter: "WAITING_REVIEW",
          kind: "submit",
          notes: `Cán bộ báo hoàn thành nhiệm vụ. Kết quả: ${actualResultText || "Đã xong theo yêu cầu"}`,
        },
      });
    } else if (action === "CONFIRM_COMPLETION") {
      // Người giao việc hoặc Lãnh đạo xác nhận hoàn thành: Chuyển sang COMPLETED
      // Guard tập trung (Slice 1): chủ trì không tự nghiệm thu việc của mình
      const canConfirm = await isTaskLeader(user, currentTask.unitId);

      if (!canConfirm) {
        return jsonError("Chỉ Lãnh đạo đơn vị hoặc Trưởng bộ phận phụ trách mới có thẩm quyền nghiệm thu xác nhận hoàn thành nhiệm vụ này", 403);
      }
      // Chống duyệt trùng: đã hoàn thành thì không duyệt lại
      try {
        assertTaskStatusTransition({
          currentStatus: currentTask.status,
          targetStatus: "COMPLETED",
          deadlineChanged: false,
          isLeader: true,
        });
      } catch (err: any) {
        return jsonError(err.message, err.statusCode || 400);
      }

      updateData.status = "COMPLETED";

      await prisma.taskUpdate.create({
        data: {
          taskId: id,
          authorId: user.personId,
          statusBefore: currentTask.status,
          statusAfter: "COMPLETED",
          kind: "approve",
          notes: "Lãnh đạo / Người giao việc đã xác nhận hoàn thành nhiệm vụ.",
        },
      });
    } else if (action === "REJECT_COMPLETION") {
      // Trả lại nhiệm vụ yêu cầu làm tiếp — qua guard tập trung (Slice 1)
      try {
        assertTaskStatusTransition({
          currentStatus: currentTask.status,
          targetStatus: "IN_PROGRESS",
          deadlineChanged: false,
          isLeader: await isTaskLeader(user, currentTask.unitId),
        });
      } catch (err: any) {
        return jsonError(err.message, err.statusCode || 403);
      }
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
          kind: "return",
          notes: `Trả lại nhiệm vụ yêu cầu hoàn thiện thêm: ${issueNotes || "Chưa đạt yêu cầu"}`,
        },
      });
    } else {
      // Cập nhật thông thường — qua guard tập trung (Slice 1): chặn tự set COMPLETED
      // và chặn trả WAITING_REVIEW về IN_PROGRESS khi không phải lãnh đạo
      try {
        assertTaskStatusTransition({
          currentStatus: currentTask.status,
          targetStatus: status ?? null,
          deadlineChanged: false,
          isLeader: await isTaskLeader(user, currentTask.unitId),
        });
      } catch (err: any) {
        return jsonError(err.message, err.statusCode || 403);
      }
      if (status) {
        updateData.status = status === "DONE" ? "COMPLETED" : status;
      }
      if (actualResultText !== undefined) updateData.actualResultText = actualResultText;
      if (hasIssue !== undefined) {
        updateData.hasIssue = Boolean(hasIssue);
        updateData.issueNotes = hasIssue ? issueNotes : null;
      }
    }

    // Cập nhật danh sách phối hợp nếu có (YC-01/YC-03: bỏ trùng, bỏ chủ trì)
    if (assigneeIds && Array.isArray(assigneeIds)) {
      const clean = [...new Set(assigneeIds.filter((x) => typeof x === "string").map((x) => x.trim()).filter(Boolean))].filter(
        (pId) => pId !== currentTask.ownerId
      );
      await prisma.taskAssignee.deleteMany({ where: { taskId: id } });
      if (clean.length > 0) {
        await prisma.taskAssignee.createMany({
          data: clean.map((pId: string) => ({
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
