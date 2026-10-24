import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { buildScopedWhereClause, verifyTaskAccess, jsonError } from "@/server/guard";
import {
  assertTaskStatusTransition,
  isTaskLeader,
  isTerminalTaskStatus,
} from "@/server/task-transitions";
import { advisoryLock, normalizeTitle } from "@/server/idempotency";
import { nextTaskCode } from "@/server/task-code";
import { unaccentSearchIds } from "@/server/search";
import { recordAuditEvent } from "@/server/audit";
import { checkWorkItemAccess } from "@/server/work-access";
import { toClientAttachments } from "@/server/attachments";
import { createNotification } from "@/server/notifications";
import {
  createLinkedWorkItem,
  resolveMonthlyPeriod,
  resolveWorkSource,
  type ResolvedSource,
} from "@/server/work-item-linkage";
import { isSelfInitiated, resolveOriginKind } from "@/server/task-origin";
import { decideApproval, reopenApprovalCaseOnResubmit, getTaskApprovalSummaries } from "@/server/approval-case";
import {
  ParticipantError,
  acceptParticipantPart,
  initializeTaskParticipants,
  submitOverallResult,
} from "@/server/task-participant";
import { isApprovalQualityEnabled } from "@/server/approval-quality";

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
          stats: { active: 0, high: 0, dueSoon: 0, overdue: 0, waiting: 0, done: 0, maxOverdueDays: 0 },
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
    // YC-11: người phụ trách trực tiếp cũng thấy nhiệm vụ của người mình phụ trách
    // để vào hàng chờ pre-check (chỉ đọc; quyền thao tác vẫn theo tuyến).
    const nowForSupervision = new Date();
    const supervisedPeople = user.personId
      ? await prisma.personSupervision.findMany({
          where: {
            managerPersonId: user.personId,
            status: "CONFIRMED",
            effectiveFrom: { lte: nowForSupervision },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: nowForSupervision } }],
          },
          select: { subordinatePersonId: true },
        })
      : [];
    const supervisedPersonIds = [...new Set(supervisedPeople.map((s) => s.subordinatePersonId))];
    const visibilityClause =
      Object.keys(scopedFilter).length === 0
        ? {}
        : {
            OR: [
              scopedFilter,
              { ownerId: user.personId },
              { assignees: { some: { personId: user.personId } } },
              ...(supervisedPersonIds.length > 0
                ? [
                    { ownerId: { in: supervisedPersonIds } },
                    { assignees: { some: { personId: { in: supervisedPersonIds } } } },
                  ]
                : []),
            ],
          };

    const where: any = { ...filters, ...visibilityClause };

    const [total, tasks, statRows] = await Promise.all([
      prisma.task.count({ where }),
      prisma.task.findMany({
      where,
      include: {
        owner: true,
        unit: true,
        assignees: {
          include: { person: true },
        },
        // UX Phase 1: trạng thái phần việc của CHÍNH người dùng hiện tại.
        // Danh sách có thể trả việc toàn đơn vị (lãnh đạo), nên tab "Chờ nhận việc"
        // chỉ được dựa trên dữ liệu của chính mình.
        participantResults: {
          where: { personId: user.personId },
          select: { partStatus: true, role: true },
          take: 1,
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
          where: { subjectPersonId: null },
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
        workItem: {
          include: {
            catalogEntry: {
              select: {
                id: true,
                code: true,
                title: true,
                department: true,
                groupCode: true,
                convertFactor: true,
              },
            },
            product: { select: { id: true, code: true, taskName: true } },
          },
        },
      },
      orderBy: [{ currentDeadline: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      }),
      // Bộ đếm KPI: lấy toàn bộ phạm vi (chỉ 4 cột nhẹ) — không phụ thuộc trang đang tải
      prisma.task.findMany({
        where,
        select: { status: true, priority: true, currentDeadline: true, hasIssue: true },
      }),
    ]);

    const now = new Date();

    // Cùng nguồn dữ liệu với danh sách → bộ đếm không còn "ảo" khi phân trang
    const stats = {
      active: 0,
      high: 0,
      dueSoon: 0,
      overdue: 0,
      waiting: 0,
      done: 0,
      maxOverdueDays: 0,
    };
    for (const t of statRows) {
      const finished = t.status === "COMPLETED" || t.status === "DONE" || t.status === "CANCELED";
      if (t.status === "WAITING_REVIEW") stats.waiting += 1;
      if (finished) {
        if (t.status !== "CANCELED") stats.done += 1;
        continue;
      }
      const dl = new Date(t.currentDeadline).getTime();
      const late = !isNaN(dl) && dl < now.getTime();
      stats.active += 1;
      if (t.priority === "Cao" || t.priority === "Khẩn") stats.high += 1;
      if (late) {
        stats.maxOverdueDays = Math.max(
          stats.maxOverdueDays,
          Math.floor((now.getTime() - dl) / 86400000)
        );
      } else if (!isNaN(dl) && dl <= now.getTime() + 24 * 3600 * 1000) {
        stats.dueSoon += 1;
      }
      // Khớp quy ước danh sách: quá hạn HOẶC có vướng mắc
      if (late || t.hasIssue) stats.overdue += 1;
    }

    // Tính toán cờ isOverdue độc lập với hasIssue + % tiến độ từ cập nhật mới nhất
    // (Task không lưu sẵn % — nguồn duy nhất là TaskUpdate)
    const qualityEnabled = isApprovalQualityEnabled();
    const approvalMap = await getTaskApprovalSummaries(tasks.map((t) => t.id));
    const enrichedTasks = tasks.map((t) => {
      const isFinished = t.status === "COMPLETED" || t.status === "DONE" || t.status === "CANCELED";
      const isOverdue = !isFinished && new Date(t.currentDeadline) < now;
      const latestProgress = (t.updates as any[])?.[0]?.progressPercent;
      // YC-38 UAT fix: thong tin danh muc TX kem theo (ma, ten, he so) cho giao dien
      const ce = (t as any).workItem?.catalogEntry;
      const txSource = ce
        ? {
            code: ce.code,
            title: ce.title,
            department: ce.department,
            groupCode: ce.groupCode,
            convertFactor:
              ce.convertFactor === null || ce.convertFactor === undefined
                ? null
                : Number(ce.convertFactor),
          }
        : null;
      return {
        ...t,
        isOverdue,
        progressPercent: typeof latestProgress === "number" ? latestProgress : isFinished ? 100 : 0,
        txSource,
        approval: approvalMap.get(t.id) ?? null,
        // UX Phase 1: trạng thái phần việc của chính người dùng (null nếu không tham gia).
        myPartStatus: (t as any).participantResults?.[0]?.partStatus ?? null,
        // YC-10 quick approve: client cần biết có bắt buộc chọn quality hay không.
        qualityEnabled,
        // KHÔNG phát URL công khai của kho lưu trữ.
        attachments: toClientAttachments((t as any).attachments || [], t.id),
      };
    });

    return NextResponse.json({
      success: true,
      data: enrichedTasks,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      stats,
      qualityEnabled,
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
      workItemId, // YC-32: giao nhiệm vụ từ đầu việc (liên kết 2 chiều)
      // YC-38B/YC-38C: nguồn công việc (TX / QĐ1277 / văn bản / giao ban)
      catalogEntryId,
      productItemId,
      sourceKind,
      sourceRefId,
      sourceCodeSnapshot,
      idempotencyKey,
      originKind, // YC-38: nguon phat sinh (client chi duoc TU KHAI; server quyet dinh lai)
    } = body;

    // YC-32: kiểm tra quyền trên đầu việc + chống tạo Task trùng cho cùng đầu việc
    let linkedWorkItem: any = null;
    if (workItemId) {
      const access = await checkWorkItemAccess(user, String(workItemId));
      if (!access.allowed || !access.item) {
        return jsonError(
          access.reason || "Bạn không có quyền giao nhiệm vụ từ đầu việc này",
          403
        );
      }
      linkedWorkItem = access.item;
      if (linkedWorkItem.taskId) {
        const existing = await prisma.task.findUnique({
          where: { id: linkedWorkItem.taskId },
          include: { owner: true, unit: true, assignees: { include: { person: true } } },
        });
        if (existing) {
          return NextResponse.json(
            {
              success: true,
              data: existing,
              linkedExisting: true,
              message: "Đầu việc đã được giao nhiệm vụ — không tạo thêm nhiệm vụ mới",
            },
            { status: 200 }
          );
        }
      }
    }

    const effectiveOwnerId = ownerId || linkedWorkItem?.personId || user.personId;
    const effectiveDeadline = deadline || body.currentDeadline || linkedWorkItem?.dueDate || null;

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

    // YC-38C: phân giải nguồn công việc (TX / QĐ1277 / văn bản / giao ban).
    // TX và QĐ1277 là hai trục ĐỘC LẬP — không gộp, không tự gắn sản phẩm.
    let resolvedSource: ResolvedSource | null = null;
    const hasSourceInput =
      !!catalogEntryId || !!productItemId || (!!sourceKind && !!sourceRefId);
    if (hasSourceInput && !linkedWorkItem) {
      const src = await resolveWorkSource(
        { catalogEntryId, productItemId, sourceKind, sourceRefId, sourceCodeSnapshot },
        effectiveOwnerId
      );
      if (!src.ok) return jsonError(src.error, src.status || 400);
      resolvedSource = src.source || null;
    }

    // YC-38: nguon phat sinh — quyet dinh o SERVER (khong tin client khai "lãnh đạo giao")
    const resolvedOrigin = resolveOriginKind({
      actorRole: user.role,
      actorPersonId: user.personId,
      ownerPersonId: effectiveOwnerId,
      requested: originKind,
    });

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
      if (recent) return { task: recent, deduplicated: true, workItemId: null };

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
          // YC-38C: người tạo ≠ người giao ≠ người chủ trì (chủ trì = ownerId)
          // LƯU Ý: cột này tham chiếu `people(id)` → dùng personId (user.id là accountId)
          createdById: user.personId,
          assignedById: user.personId,
          // YC-38: nguon phat sinh (KHONG thay the source_kind = nguon danh muc)
          originKind: resolvedOrigin.originKind,
          sourceKind: resolvedSource?.sourceKind ?? null,
          sourceRefId: resolvedSource?.sourceRefId ?? null,
          sourceCodeSnapshot: resolvedSource?.sourceCodeSnapshot ?? null,
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

      // YC-38C: sinh công việc gốc + bảng phân công (1 việc gốc, nhiều người)
      let linkedWorkItemId: string | null = null;
      if (resolvedSource) {
        const periodId = await resolveMonthlyPeriod(parsedDeadline);
        if (periodId) {
          const wi = await createLinkedWorkItem(
            {
              personId: effectiveOwnerId,
              periodId,
              title: title.trim(),
              dueDate: parsedDeadline,
              source: resolvedSource,
              collaboratorIds: uniqueAssignees,
              assignedById: user.personId,
              taskId: created.id,
              idempotencyKey: idempotencyKey ? `task:${idempotencyKey}` : null,
            },
            tx
          );
          linkedWorkItemId = wi.id;
          await tx.task.update({
            where: { id: created.id },
            data: { workItemId: wi.id },
          });
        }
      }
      return { task: created, deduplicated: false, workItemId: linkedWorkItemId };
    });

    // YC-04: request trùng trong cửa sổ 120s → trả về bản ghi đã tạo, không spam thông báo
    const createdTask = newTask.task;

    // YC-32: gắn nhiệm vụ vào đầu việc (nếu chưa có) — liên kết 2 chiều, không tạo thêm Task
    if (linkedWorkItem) {
      await prisma.personalWorkItem.updateMany({
        where: { id: linkedWorkItem.id, taskId: null },
        data: { taskId: createdTask.id },
      });
      await recordAuditEvent({
        actorId: user.id,
        action: "WORK_ITEM_TASK_LINK",
        resourceType: "PersonalWorkItem",
        resourceId: linkedWorkItem.id,
        newData: { taskId: createdTask.id, taskCode: createdTask.code, deduplicated: newTask.deduplicated },
      });
    }

    if (newTask.deduplicated) {
      return NextResponse.json(
        { success: true, data: newTask.task, deduplicated: true, message: "Nhiệm vụ này vừa được tạo (chặn bấm trùng)" },
        { status: 200 }
      );
    }

    await recordAuditEvent({
      actorId: user.id,
      action: "TASK_CREATE",
      resourceType: "Task",
      resourceId: createdTask.id,
      newData: { code: createdTask.code, title: createdTask.title, unitId: createdTask.unitId, ownerId, assignees: uniqueAssignees, workItemId: linkedWorkItem?.id || null },
    });

    // YC-09 Phase 1: Task mới qua API có participant rows (legacy=false) để S-ALL áp dụng ngay.
    try {
      await initializeTaskParticipants(prisma, createdTask.id);
    } catch (err) {
      console.error("[TASK_PARTICIPANT_INIT]", err);
    }

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
      reason,
      qualityPercent,
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

    // F1/F2/F3 (YC-38 — vá lỗ hổng quyền ghi sau nghiệm thu): nhiệm vụ đã nghiệm thu/kết thúc
    // ⇒ chặn mọi thao tác ghi (currentTask). Chặn ở SERVER, không phụ thuộc giao diện.
    if (isTerminalTaskStatus(currentTask.status)) {
      return jsonError(
        `Nhiệm vụ ${currentTask.status === "CANCELED" ? "đã bị loại" : "đã được nghiệm thu hoàn thành"} — không thể cập nhật tiến độ, thay đổi trạng thái, ghi đè kết quả hoặc nộp lại.`,
        409
      );
    }
    const updateData: any = {};
    const isOwner = currentTask.ownerId === user.personId;
    const isLeader = await isTaskLeader(user, currentTask.unitId);
    const isCollaborator = (currentTask.assignees || []).some(
      (a: any) => a.personId === user.personId
    );

    // Mọi quyết định nghiệm thu/trả lại đều đi qua ApprovalCase để thống nhất lịch sử.
    const decideTaskResult = async (
      decision: "AGREE" | "REJECT" | "CLARIFY",
      decisionReason: string | null,
      decisionContent: string | null
    ) => {
      const result = await decideApproval({
        user,
        caseType: "TASK_RESULT",
        resourceId: id,
        action: decision,
        reason: decisionReason,
        content: decisionContent,
        qualityPercent,
      });
      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error, data: result.data },
          { status: result.status || 400 }
        );
      }
      const fresh = await prisma.task.findUnique({
        where: { id },
        include: { owner: true, unit: true, assignees: { include: { person: true } } },
      });
      return NextResponse.json({ success: true, message: result.message, data: fresh });
    };

    // Xử lý các action chuyên biệt
    if (action === "ACCEPT_TASK") {
      // Đợt A: người được giao xác nhận đã nhận việc (chủ trì/phối hợp).
      // Chuyển NOT_STARTED → IN_PROGRESS, báo lại người giao việc.
      // YC-38: cong viec TU KHOI TAO khong co buoc "xac nhan nhan viec"
      // (chi ap dung khi origin_kind da duoc ghi ro; du lieu lich su NULL giu nguyen hanh vi cu)
      if (isSelfInitiated(currentTask.originKind)) {
        return jsonError(
          "Công việc tự khởi tạo không có bước xác nhận nhận việc — hãy bắt đầu triển khai trực tiếp",
          400
        );
      }
      const isOwner = currentTask.ownerId === user.personId;
      const isAssignee = (currentTask.assignees || []).some((a: any) => a.personId === user.personId);
      if (!isOwner && !isAssignee) {
        return jsonError("Chỉ người chủ trì hoặc phối hợp mới xác nhận nhận việc này", 403);
      }
      // YC-09 Phase 1: collaborator nhận phần việc, không đổi Task status chung.
      if (!isOwner && isAssignee) {
        await acceptParticipantPart(user, id);
        const freshPart = await prisma.task.findUnique({
          where: { id },
          include: { owner: true, unit: true, assignees: { include: { person: true } } },
        });
        return NextResponse.json({
          success: true,
          data: freshPart,
          message: "Đã xác nhận nhận phần việc của bạn.",
        });
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
      // YC-09: CHỈ người chủ trì được nộp kết quả. Người phối hợp không được nộp thay.
      if (!isOwner) {
        return jsonError(
          isCollaborator
            ? "Bạn là người phối hợp — chỉ người chủ trì mới được nộp kết quả chung của nhiệm vụ."
            : "Chỉ người chủ trì nhiệm vụ mới được nộp kết quả trình Lãnh đạo phê duyệt.",
          403
        );
      }
      try {
        assertTaskStatusTransition({
          currentStatus: currentTask.status,
          targetStatus: "WAITING_REVIEW",
          deadlineChanged: false,
          isLeader,
          isOwner,
        });
      } catch (err: any) {
        return jsonError(err.message, err.statusCode || 403);
      }
      // YC-09 Phase 1: nộp chung qua S-ALL + snapshot; một ApprovalCase/Task.
      const submitted = await submitOverallResult(user, id, {
        actualResultText: actualResultText ?? null,
        note: reason ?? null,
      });
      try {
        await reopenApprovalCaseOnResubmit(
          "TASK_RESULT",
          id,
          user.id,
          "Nhiệm vụ đã được trình lại sau khi bổ sung nội dung."
        );
      } catch {
        /* lần nộp đầu chưa có case — bình thường */
      }
      const freshSubmitted = await prisma.task.findUnique({
        where: { id },
        include: { owner: true, unit: true, assignees: { include: { person: true } } },
      });
      return NextResponse.json({
        success: true,
        message: "Đã nộp kết quả chung và trình Lãnh đạo phê duyệt.",
        data: freshSubmitted,
        snapshot: submitted.snapshot,
      });
    } else if (action === "CONFIRM_COMPLETION") {
      // Người giao việc hoặc Lãnh đạo xác nhận hoàn thành — qua ApprovalCase chung.
      return decideTaskResult("AGREE", reason || null, null);
    } else if (action === "REJECT_COMPLETION") {
      // Trả lại nhiệm vụ yêu cầu làm tiếp — qua ApprovalCase chung.
      // E8-A: bắt buộc có lý do/ghi chú; giữ nguyên tiến độ hiện tại (kể cả 100%).
      const rejectNote = (issueNotes || reason || actualResultText || "").trim();
      if (!rejectNote) {
        return jsonError(
          "Vui lòng nêu lý do trả lại/yêu cầu hoàn thiện. Tiến độ hiện tại (kể cả 100%) được giữ nguyên.",
          400
        );
      }
      return decideTaskResult("REJECT", rejectNote, null);
    } else {
      // Nghiệm thu / trả lại qua status tự do → đi qua ApprovalCase chung, không ghi tắt.
      if (status === "COMPLETED" || status === "DONE") {
        return decideTaskResult("AGREE", reason || null, null);
      }
      if (currentTask.status === "WAITING_REVIEW" && status === "IN_PROGRESS") {
        const returnNote = (issueNotes || reason || actualResultText || "").trim();
        if (!returnNote) {
          return jsonError(
            "Vui lòng nêu lý do trả lại/yêu cầu hoàn thiện. Tiến độ hiện tại (kể cả 100%) được giữ nguyên.",
            400
          );
        }
        return decideTaskResult("REJECT", returnNote, null);
      }

      // YC-09: người phối hợp không được ghi đè kết quả chung của nhiệm vụ.
      if (actualResultText !== undefined && !isOwner && !isLeader) {
        return jsonError(
          "Bạn là người phối hợp — không được ghi đè kết quả chung; chỉ người chủ trì hoặc lãnh đạo thẩm quyền mới được cập nhật kết quả.",
          403
        );
      }
      // Kết quả đã trình duyệt thì bị khóa, tránh sửa lén sau khi lãnh đạo đang xem.
      if (actualResultText !== undefined && currentTask.status === "WAITING_REVIEW" && actualResultText !== currentTask.actualResultText) {
        return jsonError("Nhiệm vụ đang chờ Lãnh đạo phê duyệt — không thể sửa kết quả đã trình.", 409);
      }
      // Đổi danh sách người phối hợp: chỉ lãnh đạo phụ trách.
      if (assigneeIds !== undefined && !isLeader) {
        return jsonError("Chỉ Lãnh đạo phụ trách mới được điều chỉnh danh sách người phối hợp.", 403);
      }

      // Cập nhật thông thường — qua guard tập trung (Slice 1): chặn tự set COMPLETED,
      // chặn người phối hợp nộp thay/đổi trạng thái nghiệp vụ, chặn tự hủy.
      try {
        assertTaskStatusTransition({
          currentStatus: currentTask.status,
          targetStatus: status ?? null,
          deadlineChanged: false,
          isLeader,
          isOwner: isOwner,
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
      if (!isLeader) {
        return jsonError("Chỉ Lãnh đạo phụ trách mới được điều chỉnh danh sách người phối hợp.", 403);
      }
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

    // Trình lại sau khi bị trả lại → mở lại vòng quyết định (không tạo hồ sơ trùng).
    if (updatedTask.status === "WAITING_REVIEW") {
      await reopenApprovalCaseOnResubmit(
        "TASK_RESULT",
        id,
        user.id,
        "Nhiệm vụ đã được trình lại sau khi bổ sung nội dung."
      );
    }

    return NextResponse.json({ success: true, data: updatedTask });
  } catch (error: any) {
    if (error instanceof ParticipantError) {
      return NextResponse.json(
        { success: false, error: error.message, data: error.data ?? null },
        { status: error.statusCode }
      );
    }
    return jsonError("Lỗi khi cập nhật nhiệm vụ: " + error.message, 500);
  }
}
