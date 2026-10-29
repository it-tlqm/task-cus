import { NextRequest, NextResponse } from "next/server";
import { isSelfInitiated } from "@/server/task-origin";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { verifyTaskAccess, jsonError } from "@/server/guard";
import {
  assertTaskNotTerminal,
  assertTaskStatusTransition,
  isTaskLeader,
  isTerminalTaskStatus,
} from "@/server/task-transitions";
import { isValidProgressStep } from "@/server/idempotency";
import { recordAuditEvent } from "@/server/audit";
import { reopenApprovalCaseOnResubmit, decideApproval, getTaskApprovalSummaries } from "@/server/approval-case";
import { ParticipantError, submitOverallResult } from "@/server/task-participant";
import { toClientAttachments } from "@/server/attachments";
import { createNotification } from "@/server/notifications";
import { isApprovalQualityEnabled } from "@/server/approval-quality";
import { getTaskPrecheckView } from "@/server/approval-route";

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

    const task = await prisma.task.findUnique({
      where: { id: taskId },
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
          orderBy: { createdAt: "desc" },
        },
        updates: {
          orderBy: { createdAt: "desc" },
          include: {
            author: true,
            subjectPerson: { select: { id: true, fullName: true } },
          },
        },
        participantResults: {
          include: {
            person: { select: { id: true, fullName: true, code: true } },
            submittedBy: { select: { id: true, fullName: true } },
            decidedBy: { select: { id: true, fullName: true } },
          },
          orderBy: [{ role: "asc" }, { createdAt: "asc" }],
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
    });

    if (!task) return jsonError("Không tìm thấy nhiệm vụ", 404);

    // YC-09: owner hiển thị trước collaborator.
    if (Array.isArray((task as any).participantResults)) {
      (task as any).participantResults = [...(task as any).participantResults].sort(
        (a: any, b: any) => {
          if (a.role === "OWNER" && b.role !== "OWNER") return -1;
          if (b.role === "OWNER" && a.role !== "OWNER") return 1;
          return String(a.person?.fullName || "").localeCompare(String(b.person?.fullName || ""), "vi");
        }
      );
    }

    const now = new Date();
    const isFinished = task.status === "COMPLETED" || task.status === "DONE" || task.status === "CANCELED";
    const isOverdue = !isFinished && new Date(task.currentDeadline) < now;
    const latestProgress = (task.updates as any[])?.find(
      (u) => !u.subjectPersonId && !String(u.kind || "").startsWith("participant_")
    )?.progressPercent;

    // Nhật ký hợp nhất: tiến độ + toàn bộ lai lịch (ai giao/nhận/sửa/duyệt/gia hạn/đính kèm)
    // từ TaskUpdate, DeadlineRequest, Attachment và AuditEvent (bỏ các audit trùng với TaskUpdate)
    const audits = await prisma.auditEvent.findMany({
      where: { resourceType: "Task", resourceId: taskId },
      include: { actor: { include: { person: { select: { fullName: true } } } } },
      orderBy: { timestamp: "asc" },
    });
    const personIds = new Set<string>();
    for (const a of audits) {
      const nd: any = a.newData || {};
      if (typeof nd.ownerId === "string") personIds.add(nd.ownerId);
      if (Array.isArray(nd.assignees)) nd.assignees.forEach((x: any) => typeof x === "string" && personIds.add(x));
    }
    // Người đề nghị lùi hạn (requestedById là personId nhưng không nằm trong audit newData)
    for (const dr of (task.deadlineRequests as any[]) || []) {
      if (typeof dr.requestedById === "string") personIds.add(dr.requestedById);
    }
    const extraPeople = personIds.size > 0
      ? await prisma.person.findMany({ where: { id: { in: [...personIds] } }, select: { id: true, fullName: true } })
      : [];
    const pname = new Map(extraPeople.map((p) => [p.id, p.fullName]));
    const actorName = (a: any) => a.actor?.person?.fullName || "Hệ thống";

    const timeline: any[] = [];

    // 1. Dòng khởi tạo / giao nhiệm vụ (luôn có)
    const createAudit = audits.find((a) => a.action === "TASK_CREATE");
    {
      const nd: any = createAudit?.newData || {};
      const ownerName = (task.owner as any)?.fullName || (typeof nd.ownerId === "string" ? pname.get(nd.ownerId) || null : null);
      const collaboratorNames = (task.assignees || []).map((as: any) => as.person?.fullName).filter(Boolean);
      const extraAssigneeCount = Array.isArray(nd.assignees) ? nd.assignees.length : 0;
      
      let assigneesText = "";
      if (collaboratorNames.length > 0) {
        assigneesText = ` (phối hợp: ${collaboratorNames.join(", ")})`;
      } else if (extraAssigneeCount > 0) {
        assigneesText = ` (+ ${extraAssigneeCount} cán bộ phối hợp)`;
      }

      timeline.push({
        id: `create-${taskId}`,
        at: createAudit?.timestamp || task.createdAt,
        actor: createAudit ? actorName(createAudit) : "Lãnh đạo đơn vị",
        kind: "create",
        title: isSelfInitiated(task.originKind) ? "Khởi tạo công việc" : "Giao nhiệm vụ",
        detail: ownerName ? `Phân công chủ trì: ${ownerName}${assigneesText}` : null,
        progress: null,
        statusFrom: null,
        statusTo: "NOT_STARTED",
      });
    }

    // 2. Chỉnh sửa chỉ đạo / nội dung (từ AuditEvent TASK_UPDATE có sửa nội dung)
    const FIELD_LABELS: Record<string, string> = {
      title: "Tiêu đề",
      description: "Nội dung chỉ đạo",
      priority: "Độ ưu tiên",
      currentDeadline: "Hạn giải quyết",
      expectedResultText: "Sản phẩm mục tiêu",
      ownerId: "Cán bộ chủ trì",
      assignees: "Cán bộ phối hợp",
    };

    for (const a of audits) {
      if (a.action === "TASK_UPDATE") {
        const nd: any = a.newData || {};
        const od: any = a.oldData || {};
        const changed: string[] = Array.isArray(nd.changedFields) ? nd.changedFields : [];
        const hasContentChange = changed.some((f) => FIELD_LABELS[f]) || (od.title && nd.title && od.title !== nd.title) || nd.assigneesChanged;
        
        if (hasContentChange) {
          const detailParts: string[] = [];
          if (od.title && nd.title && od.title !== nd.title) {
            detailParts.push(`Đổi tiêu đề: "${nd.title}"`);
          }
          if (od.currentDeadline && nd.currentDeadline && new Date(od.currentDeadline).getTime() !== new Date(nd.currentDeadline).getTime()) {
            detailParts.push(`Đổi hạn giải quyết: ${new Date(nd.currentDeadline).toLocaleDateString("vi-VN")}`);
          }
          if (nd.assigneesChanged) {
            detailParts.push("Điều chỉnh phân công cán bộ phối hợp");
          }
          const otherChanged = changed.filter((f) => f !== "title" && f !== "currentDeadline" && f !== "assignees" && FIELD_LABELS[f]);
          if (otherChanged.length > 0) {
            detailParts.push(`Điều chỉnh ${otherChanged.map((f) => FIELD_LABELS[f]).join(", ")}`);
          }

          timeline.push({
            id: `aud-${a.id}`,
            at: a.timestamp,
            actor: actorName(a),
            kind: "edit",
            title: "Chỉnh sửa chỉ đạo",
            detail: detailParts.join(" · ") || "Lãnh đạo điều chỉnh thông tin nhiệm vụ",
            progress: null,
            statusFrom: null,
            statusTo: null,
          });
        }
      }
    }

    // 3. Tiến độ, nhận việc, nghiệm thu, trả lại (từ TaskUpdate)
    // kind đã lưu lúc ghi thì dùng thẳng; dữ liệu cũ (kind null) mới suy luận dự phòng
    const KIND_TITLES: Record<string, string> = {
      accept: "Xác nhận nhận việc",
      submit: "Nộp kết quả / Chờ duyệt",
      approve: "Nghiệm thu hoàn thành",
      return: "Trả lại yêu cầu hoàn thiện",
      cancel: "Loại nhiệm vụ trùng",
      extend: "Gia hạn",
      progress: "Cập nhật tiến độ",
      participant_submit: "Báo phần việc",
      participant_progress: "Cập nhật phần việc",
      participant_return: "Trả lại phần việc",
      participant_accept: "Chấp nhận phần việc",
      participant_exempt: "Miễn phần việc",
      participant_accept_task: "Nhận phần việc",
      participant_owner_submit: "Chủ trì nộp kết quả chung",
      participant_precheck_pass: "Kiểm tra sơ bộ đạt",
      participant_precheck_return: "Kiểm tra sơ bộ trả lại",
    };
    for (const u of (task.updates as any[]) || []) {
      const notes = u.notes || "";
      let kind: string = typeof u.kind === "string" && KIND_TITLES[u.kind] ? u.kind : "";
      let title = "";
      if (!kind) {
        const isAccept = (u.statusBefore === "NOT_STARTED" && u.statusAfter === "IN_PROGRESS") || notes.toLowerCase().includes("nhận việc");
        const isSubmit = u.statusAfter === "WAITING_REVIEW";
        const isApprove = u.statusAfter === "COMPLETED" || u.statusAfter === "DONE" || notes.includes("nghiệm thu") || notes.includes("hoàn thành 100%");
        const isReturn = (u.statusBefore === "WAITING_REVIEW" && u.statusAfter === "IN_PROGRESS") || notes.toLowerCase().includes("trả lại") || notes.toLowerCase().includes("yêu cầu bổ sung");
        const isCancel = u.statusAfter === "CANCELED" || notes.includes("loại nhiệm vụ trùng");
        if (isAccept) kind = "accept";
        else if (isSubmit) kind = "submit";
        else if (isApprove) kind = "approve";
        else if (isReturn) kind = "return";
        else if (isCancel) kind = "cancel";
        else kind = "progress";
      }
      title = KIND_TITLES[kind] || "Cập nhật tiến độ";

      timeline.push({
        id: `upd-${u.id}`,
        at: u.createdAt,
        actor: u.author?.fullName || "Cán bộ thụ lý",
        kind,
        title: u.subjectPerson?.fullName ? `${title} — ${u.subjectPerson.fullName}` : title,
        detail: notes || null,
        progress: u.subjectPersonId ? null : u.progressPercent,
        statusFrom: u.statusBefore || null,
        statusTo: u.statusAfter || null,
      });
    }

    // 4. Đề nghị & duyệt lùi hạn
    for (const dr of (task.deadlineRequests as any[]) || []) {
      const isPending = dr.status === "PENDING";
      const isApproved = dr.status === "APPROVED";
      const deadlineStr = dr.requestedDeadline ? new Date(dr.requestedDeadline).toLocaleDateString("vi-VN") : "";

      timeline.push({
        id: `dr-${dr.id}`,
        at: dr.createdAt,
        actor: dr.requestedBy?.fullName || (dr.requestedById ? pname.get(dr.requestedById) || "Cán bộ" : "Cán bộ"),
        kind: "extend",
        title: isPending ? "Đề nghị lùi hạn (chờ duyệt)" : isApproved ? "Được duyệt lùi hạn" : "Bị từ chối lùi hạn",
        detail: `${dr.reason ? `Lý do: ${dr.reason}` : ""}${deadlineStr ? ` → Hạn mới đề xuất: ${deadlineStr}` : ""}`.trim() || null,
        progress: null,
        statusFrom: null,
        statusTo: null,
      });
    }

    // 5. Tệp đính kèm
    for (const at of (task.attachments as any[]) || []) {
      const sizeStr = at.fileSize ? ` (${Math.round(at.fileSize / 1024)} KB)` : "";
      timeline.push({
        id: `file-${at.id}`,
        at: at.createdAt,
        actor: at.uploadedBy?.fullName || "Cán bộ",
        kind: "file",
        title: "Đính kèm tài liệu",
        detail: `Tệp: ${at.fileName}${sizeStr}`,
        progress: null,
        statusFrom: null,
        statusTo: null,
      });
    }

    // Sắp xếp giảm dần theo thời gian (sự kiện mới nhất lên đầu)
    timeline.sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());

    // YC-08: projection quyết định duyệt gần nhất (badge/người/thời gian/lý do)
    const approvalSummaries = await getTaskApprovalSummaries([taskId], user);
    // YC-11: tuyến pre-check/final + trạng thái từng phần (flag tắt => enabled=false).
    const precheck = await getTaskPrecheckView(taskId, user);

    return NextResponse.json({
      success: true,
      data: {
        ...task,
        // KHÔNG phát URL công khai của kho lưu trữ.
        attachments: toClientAttachments((task as any).attachments || [], task.id),
        isOverdue,
        progressPercent: typeof latestProgress === "number" ? latestProgress : isFinished ? 100 : 0,
        approval: approvalSummaries.get(taskId) ?? null,
        qualityEnabled: isApprovalQualityEnabled(),
        precheck,
        // YC-38 UAT fix: thong tin danh muc TX kem theo (ma, ten, he so)
    txSource: (() => {
      const ce = (task as any).workItem?.catalogEntry;
      if (!ce) return null;
      return {
        code: ce.code,
        title: ce.title,
        department: ce.department,
        groupCode: ce.groupCode,
        convertFactor:
          ce.convertFactor === null || ce.convertFactor === undefined
            ? null
            : Number(ce.convertFactor),
      };
    })(),
        timeline,
      },
    });
  } catch (error: any) {
    return jsonError("Lỗi khi tải chi tiết nhiệm vụ: " + error.message, 500);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);

    const { id: taskId } = await params;
    const access = await verifyTaskAccess(user, taskId, "WRITE");
    if (!access.allowed) {
      return jsonError(access.reason || "Truy cập bị từ chối", 403);
    }

    const body = await req.json();
    const {
      action,
      status,
      title,
      description,
      priority,
      currentDeadline,
      actualResultText,
      expectedResultText,
      hasIssue,
      issueNotes,
      assignedQty,
      completedQty,
      quantityUnit,
      factorSnapshot,
      completedDate,
      progressPercent,
      ownerId,
      assigneeIds,
      cancelReason,
      notes,
      qualityPercent,
    } = body;

    const currentTask = access.task;

    // F1/F2/F3 (YC-38 — vá lỗ hổng quyền ghi sau nghiệm thu): nhiệm vụ đã nghiệm thu/kết thúc
    // ⇒ chặn mọi thao tác ghi (currentTask). Chặn ở SERVER, không phụ thuộc giao diện.
    if (isTerminalTaskStatus(currentTask.status)) {
      return jsonError(
        `Nhiệm vụ ${currentTask.status === "CANCELED" ? "đã bị loại" : "đã được nghiệm thu hoàn thành"} — không thể cập nhật tiến độ, thay đổi trạng thái, ghi đè kết quả hoặc nộp lại.`,
        409
      );
    }
    const isLeader = await isTaskLeader(user, currentTask.unitId);
    const isOwner = currentTask.ownerId === user.personId;
    const isCollaborator = (currentTask.assignees || []).some(
      (a: any) => a.personId === user.personId
    );

    const parseQty = (raw: unknown): number | null => {
      if (raw === undefined || raw === null || raw === "") return null;
      const n = Number(raw);
      return Number.isFinite(n) && n >= 0 ? n : NaN;
    };
    const parsedAssignedQty = parseQty(assignedQty);
    const parsedCompletedQty = parseQty(completedQty);
    const parsedFactor = parseQty(factorSnapshot);
    if (Number.isNaN(parsedAssignedQty) || Number.isNaN(parsedCompletedQty) || Number.isNaN(parsedFactor)) {
      return jsonError("Số lượng hoặc hệ số quy đổi không hợp lệ", 400);
    }
    let parsedCompletedDate: Date | null = null;
    if (completedDate) {
      const d = new Date(completedDate);
      if (Number.isNaN(d.getTime())) return jsonError("Ngày hoàn thành không hợp lệ", 400);
      parsedCompletedDate = d;
    }
    if (
      (assignedQty !== undefined ||
        completedQty !== undefined ||
        quantityUnit !== undefined ||
        factorSnapshot !== undefined) &&
      !isOwner &&
      !isLeader
    ) {
      return jsonError("Chỉ người chủ trì hoặc lãnh đạo thẩm quyền mới được sửa số lượng.", 403);
    }

    // YC-09 Phase 1: collaborator không đổi trạng thái / cờ vướng mắc Task-level.
    if (isCollaborator && !isOwner && !isLeader) {
      if (status !== undefined || hasIssue !== undefined || issueNotes !== undefined) {
        return jsonError(
          "Người phối hợp chỉ được báo phần việc của mình; không được đổi trạng thái hoặc cờ vướng mắc chung của nhiệm vụ.",
          403
        );
      }
    }

    // Mọi quyết định nghiệm thu/trả lại đều đi qua ApprovalCase để thống nhất lịch sử.
    const decideTaskResult = async (
      decision: "AGREE" | "REJECT" | "CLARIFY",
      decisionReason: string | null,
      decisionContent: string | null
    ) => {
      const result = await decideApproval({
        user,
        caseType: "TASK_RESULT",
        resourceId: taskId,
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
        where: { id: taskId },
        include: { owner: true, unit: true, assignees: { include: { person: true } } },
      });
      return NextResponse.json({ success: true, message: result.message, data: fresh });
    };

    // YC-08: lãnh đạo loại nhiệm vụ trùng khỏi danh sách thực hiện (xóa mềm CANCELED,
    // bảo toàn liên kết/lịch sử/Snapshot; công chức thường bị chặn 403)
    if (action === "CANCEL_DUPLICATE") {
      if (!isLeader) {
        return jsonError("Chỉ Lãnh đạo phụ trách mới được loại nhiệm vụ trùng khỏi danh sách", 403);
      }
      if (currentTask.status === "COMPLETED" || currentTask.status === "DONE") {
        return jsonError("Nhiệm vụ đã nghiệm thu hoàn thành, không thể loại trùng. Ghi chú trùng vào báo cáo thay thế", 400);
      }
      if (currentTask.status === "CANCELED") {
        return jsonError("Nhiệm vụ này đã được loại khỏi danh sách trước đó", 400);
      }
      if (!cancelReason?.trim()) {
        return jsonError("Vui lòng ghi rõ lý do loại trùng (mã nhiệm vụ giữ lại để đối soát)", 400);
      }
      const linkCount = await prisma.planTaskLink.count({ where: { taskId } });
      const updatedDup = await prisma.task.update({
        where: { id: taskId },
        data: {
          status: "CANCELED",
          issueNotes: `[LOẠI TRÙNG] ${cancelReason.trim()}`,
        },
        include: { owner: true, unit: true, assignees: { include: { person: true } } },
      });
      await prisma.taskUpdate.create({
        data: {
          taskId,
          authorId: user.personId,
          progressPercent: 0,
          statusBefore: currentTask.status,
          statusAfter: "CANCELED",
          kind: "cancel",
          notes: `Lãnh đạo loại nhiệm vụ trùng: ${cancelReason.trim()} (giữ ${linkCount} liên kết kế hoạch để đối soát)`,
        },
      });
      await recordAuditEvent({
        actorId: user.id,
        action: "TASK_CANCEL_DUPLICATE",
        resourceType: "Task",
        resourceId: taskId,
        oldData: { code: currentTask.code, title: currentTask.title, status: currentTask.status },
        newData: { status: "CANCELED", reason: cancelReason.trim(), planLinksKept: linkCount, by: user.fullName },
      });
      return NextResponse.json({
        success: true,
        message: `Đã loại nhiệm vụ trùng [${currentTask.code}] khỏi danh sách thực hiện (không tính KPI)`,
        data: updatedDup,
      });
    }

    // YC-09: quyết định nghiệm thu / trả lại qua ApprovalCase chung (không ghi tắt).
    if (status === "COMPLETED" || status === "DONE") {
      return decideTaskResult("AGREE", notes || null, null);
    }
    if (currentTask.status === "WAITING_REVIEW" && status === "IN_PROGRESS") {
      // E8-A: trả lại phải có ghi chú/lý do rõ ràng; KHÔNG tự sinh lý do thay người quyết định.
      const returnNote = (notes || actualResultText || issueNotes || "").trim();
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
    if (
      actualResultText !== undefined &&
      currentTask.status === "WAITING_REVIEW" &&
      actualResultText !== currentTask.actualResultText
    ) {
      return jsonError("Nhiệm vụ đang chờ Lãnh đạo phê duyệt — không thể sửa kết quả đã trình.", 409);
    }
    // YC-09: người phối hợp không được đổi danh sách người nhận việc.
    if (assigneeIds !== undefined && !isLeader) {
      return jsonError("Chỉ Lãnh đạo phụ trách mới được điều chỉnh danh sách người phối hợp.", 403);
    }
    // Nội dung chỉ đạo: chỉ chủ trì hoặc lãnh đạo phụ trách được sửa (người phối hợp chỉ ghi tiến độ).
    const touchesContentInput =
      title !== undefined ||
      description !== undefined ||
      priority !== undefined ||
      currentDeadline !== undefined ||
      expectedResultText !== undefined ||
      ownerId !== undefined;
    if (touchesContentInput && !isOwner && !isLeader) {
      return jsonError(
        "Bạn là người phối hợp — chỉ được cập nhật tiến độ/nhật ký, không được sửa nội dung, hạn hay phân công nhiệm vụ.",
        403
      );
    }
    // Nội dung đang chờ duyệt bị khóa TRƯỚC mọi thao tác ghi phụ (kể cả bảng phân công).
    if (currentTask.status === "WAITING_REVIEW" && touchesContentInput) {
      return jsonError("Nhiệm vụ đang chờ Lãnh đạo phê duyệt — nội dung đã khóa, không thể chỉnh sửa.", 409);
    }

    // YC-09: chuẩn hóa bước 5% ngay tại API
    if (progressPercent !== undefined && !isValidProgressStep(Number(progressPercent))) {
      return jsonError("Tiến độ phải là bội số của 5% trong khoảng 0–100 (ví dụ 5%, 15%, 25%)", 400);
    }

    // Guard tập trung: nghiệm thu / trả lại / dời hạn trực tiếp (Slice 1)
    const deadlineChanged =
      currentDeadline !== undefined &&
      new Date(currentDeadline).getTime() !== new Date(currentTask.currentDeadline).getTime();
    try {
      assertTaskStatusTransition({
        currentStatus: currentTask.status,
        targetStatus: status ?? null,
        deadlineChanged,
        isLeader,
        isOwner,
      });
    } catch (err: any) {
      return jsonError(err.message, err.statusCode || 403);
    }

    // YC-09 Phase 1: chủ trì nộp chung qua S-ALL + snapshot (một case/Task).
    if (status === "WAITING_REVIEW") {
      if (!isOwner) {
        return jsonError("Chỉ người chủ trì mới được nộp kết quả chung.", 403);
      }
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
      return NextResponse.json({
        success: true,
        message: "Đã nộp kết quả chung và trình Lãnh đạo phê duyệt.",
        data: submitted.task,
      });
    }

    const updateData: any = {};
    const changedFields: string[] = [];

    if (status !== undefined) updateData.status = status;
    // YC-03: chỉnh sửa nội dung chỉ đạo trên đúng bản ghi (không tạo Task mới)
    if (title !== undefined && title.trim() && title.trim() !== currentTask.title) {
      updateData.title = title.trim();
      changedFields.push("title");
    }
    if (description !== undefined) { updateData.description = description; changedFields.push("description"); }
    if (priority !== undefined) { updateData.priority = priority; changedFields.push("priority"); }
    if (currentDeadline !== undefined) { updateData.currentDeadline = new Date(currentDeadline); changedFields.push("currentDeadline"); }
    if (actualResultText !== undefined) updateData.actualResultText = actualResultText;
    if (assignedQty !== undefined) updateData.assignedQty = parsedAssignedQty;
    if (completedQty !== undefined) updateData.completedQty = parsedCompletedQty;
    if (quantityUnit !== undefined) updateData.quantityUnit = quantityUnit?.trim() || null;
    if (factorSnapshot !== undefined) updateData.factorSnapshot = parsedFactor;
    if (completedDate !== undefined) updateData.completedDate = parsedCompletedDate;
    if (status === "WAITING_REVIEW") {
      if (completedQty === undefined && currentTask.assignedQty != null) {
        updateData.completedQty = currentTask.assignedQty;
      }
      if (!parsedCompletedDate) updateData.completedDate = new Date();
    }
    if (status === "IN_PROGRESS" || status === "NOT_STARTED") {
      updateData.completedDate = null;
      updateData.completedQty = null;
    }
    if (expectedResultText !== undefined) { updateData.expectedResultText = expectedResultText; changedFields.push("expectedResultText"); }
    if (hasIssue !== undefined) updateData.hasIssue = Boolean(hasIssue);
    if (issueNotes !== undefined) updateData.issueNotes = issueNotes;

    // YC-03: đổi người chủ trì — chỉ lãnh đạo phụ trách
    if (ownerId !== undefined && ownerId !== currentTask.ownerId) {
      if (!isLeader) {
        return jsonError("Chỉ Lãnh đạo phụ trách mới được đổi cán bộ chủ trì", 403);
      }
      const newOwner = await prisma.person.findUnique({ where: { id: ownerId } });
      if (!newOwner) return jsonError("Cán bộ chủ trì mới không tồn tại trong hệ thống", 400);
      updateData.ownerId = ownerId;
      changedFields.push("ownerId");
    }

    // YC-01/YC-03: thêm/bớt người phối hợp khi sửa (bỏ trùng, bỏ chủ trì)
    let assigneesChanged = false;
    let addedAssigneeIds: string[] = [];
    if (assigneeIds !== undefined && Array.isArray(assigneeIds)) {
      const effectiveOwner = updateData.ownerId || currentTask.ownerId;
      const clean = [...new Set(assigneeIds.filter((x) => typeof x === "string").map((x) => x.trim()).filter(Boolean))].filter(
        (pId) => pId !== effectiveOwner
      );
      // Chỉ báo cho người MỚI được bổ sung, không làm ồn người đã phối hợp từ trước.
      // Người chỉ có quyền VIEWER trước đó nay thành phối hợp viên thì vẫn cần biết.
      const previousCollaboratorIds = new Set(
        (currentTask.assignees || [])
          .filter((a: any) => a.role !== "VIEWER")
          .map((a: any) => a.personId)
      );
      addedAssigneeIds = clean.filter((pId) => !previousCollaboratorIds.has(pId));
      await prisma.taskAssignee.deleteMany({ where: { taskId } });
      if (clean.length > 0) {
        await prisma.taskAssignee.createMany({
          data: clean.map((pId: string) => ({ taskId, personId: pId, role: "COLLABORATOR" })),
        });
      }
      assigneesChanged = true;
      changedFields.push("assignees");
    }

    const effectiveProgress = (status === "COMPLETED" || status === "DONE")
      ? 100
      : progressPercent !== undefined
      ? Number(progressPercent)
      : undefined;

    // YC-03.7: nhiệm vụ đã nghiệm thu/khóa thì nội dung bị đóng băng — chỉ đổi trạng thái theo quy trình
    const contentFields = ["title", "description", "priority", "currentDeadline", "expectedResultText", "ownerId", "assignees"];
    const touchesContent = changedFields.some((f) => contentFields.includes(f));
    const onlyStatusChange = status !== undefined && !touchesContent;
    // Đã trình duyệt: khóa nội dung cho đến khi lãnh đạo quyết định (tránh sửa lén hồ sơ đang xem).
    if (currentTask.status === "WAITING_REVIEW" && touchesContent) {
      return jsonError("Nhiệm vụ đang chờ Lãnh đạo phê duyệt — nội dung đã khóa, không thể chỉnh sửa.", 409);
    }
    if (
      (currentTask.status === "COMPLETED" || currentTask.status === "DONE" || currentTask.status === "CANCELED") &&
      touchesContent &&
      !onlyStatusChange
    ) {
      return jsonError("Nhiệm vụ đã nghiệm thu/kết thúc nên nội dung được khóa. Mọi điều chỉnh tuân thủ quy trình hiện có", 400);
    }

    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: updateData,
      include: {
        owner: true,
        unit: true,
        assignees: { include: { person: true } },
      },
    });

    let actionName = "TASK_UPDATE";
    let successMessage = "Đã cập nhật nhiệm vụ thành công";

    if (status === "COMPLETED" || status === "DONE") {
      actionName = "TASK_APPROVE_COMPLETED";
      successMessage = "Đã nghiệm thu và phê duyệt hoàn thành nhiệm vụ thành công";
    } else if (currentTask.status === "WAITING_REVIEW" && status === "IN_PROGRESS") {
      actionName = "TASK_RETURN_FOR_CLARIFICATION";
      successMessage = "Đã trả lại nhiệm vụ yêu cầu giải trình hoàn thiện";
    }

    if (effectiveProgress !== undefined || status !== undefined || deadlineChanged) {
      const deadlineNote = deadlineChanged
        ? ` Lãnh đạo điều chỉnh hạn từ ${new Date(currentTask.currentDeadline).toLocaleDateString("vi-VN")} sang ${new Date(updatedTask.currentDeadline).toLocaleDateString("vi-VN")}.`
        : "";
      await prisma.taskUpdate.create({
        data: {
          taskId,
          authorId: user.personId,
          progressPercent: effectiveProgress !== undefined ? effectiveProgress : 100,
          statusBefore: currentTask.status,
          statusAfter: updatedTask.status,
          kind:
            updatedTask.status === "COMPLETED" || updatedTask.status === "DONE"
              ? "approve"
              : currentTask.status === "WAITING_REVIEW" && updatedTask.status === "IN_PROGRESS"
              ? "return"
              : "progress",
          notes: (actualResultText || (status === "COMPLETED" ? "Lãnh đạo đơn vị nghiệm thu hoàn thành 100%" : "Cập nhật trạng thái nhiệm vụ")) + deadlineNote,
        },
      });
    }

    // YC-37: nhiệm vụ được trình lại (chuyển về WAITING_REVIEW) sau khi bị trả lại
    // hoặc được yêu cầu giải trình → mở lại vòng quyết định (không tạo hồ sơ trùng).
    if (updatedTask.status === "WAITING_REVIEW") {
      await reopenApprovalCaseOnResubmit(
        "TASK_RESULT",
        taskId,
        user.id,
        "Nhiệm vụ đã được trình lại sau khi bổ sung nội dung."
      );
    }

    // YC-03: lưu vết ai sửa — trước/sau đầy đủ, không chỉ status
    await recordAuditEvent({
      actorId: user.id,
      action: actionName,
      resourceType: "Task",
      resourceId: taskId,
      oldData: {
        status: currentTask.status,
        title: currentTask.title,
        priority: currentTask.priority,
        currentDeadline: currentTask.currentDeadline,
        expectedResultText: currentTask.expectedResultText,
      },
      newData: {
        status: updatedTask.status,
        title: updatedTask.title,
        priority: updatedTask.priority,
        currentDeadline: updatedTask.currentDeadline,
        expectedResultText: updatedTask.expectedResultText,
        changedFields,
        assigneesChanged,
        actualResultText,
        progressPercent: effectiveProgress,
      },
    });

    // Bổ sung người phối hợp: chỉ báo người mới, mỗi người một lần.
    if (assigneesChanged && addedAssigneeIds.length > 0) {
      for (const pId of addedAssigneeIds) {
        if (pId === user.personId) continue;
        await createNotification({
          recipientId: pId,
          category: "task",
          type: "TASK_ASSIGNED",
          title: `Nhiệm vụ phối hợp: [${updatedTask.code}] ${updatedTask.title}`,
          content: `Đồng chí được bổ sung làm người phối hợp thực hiện nhiệm vụ '${updatedTask.title}'. Hạn hoàn thành: ${new Date(updatedTask.currentDeadline).toLocaleDateString("vi-VN")}.`,
          tag: "PHỐI HỢP",
          tagType: "primary",
          entityType: "TASK",
          entityId: updatedTask.id,
          actionUrl: `/tasks/${updatedTask.id}`,
          actionLabel: "Xem chi tiết nhiệm vụ",
          taskCode: updatedTask.code,
          idempotencyKey: `EVENT_TASK_COLLAB_ADDED_${updatedTask.id}_${pId}`,
        });
      }
    }

    if (status === "COMPLETED" || status === "DONE") {
      await createNotification({
        recipientId: updatedTask.ownerId,
        category: "task",
        type: "TASK_COMPLETED",
        title: `Nhiệm vụ đã được nghiệm thu: [${updatedTask.code}]`,
        content: `Lãnh đạo đã nghiệm thu và xác nhận hoàn thành nhiệm vụ '${updatedTask.title}'. Kết quả đạt chuẩn nghiệp vụ.`,
        tag: "ĐÃ NGHIỆM THU",
        tagType: "success",
        entityType: "TASK",
        entityId: updatedTask.id,
        actionUrl: `/tasks/${updatedTask.id}`,
        actionLabel: "Xem kết quả nghiệm thu",
        taskCode: updatedTask.code,
        idempotencyKey: `EVENT_TASK_CMP_${updatedTask.id}`,
      });
    } else if (currentTask.status === "WAITING_REVIEW" && status === "IN_PROGRESS") {
      await createNotification({
        recipientId: updatedTask.ownerId,
        category: "task",
        type: "TASK_REJECTED",
        title: `Yêu cầu hoàn thiện nhiệm vụ: [${updatedTask.code}]`,
        content: `Lãnh đạo yêu cầu bổ sung/giải trình kết quả nhiệm vụ '${updatedTask.title}'. Lý do: ${actualResultText || issueNotes || "Chưa đạt yêu cầu"}.`,
        tag: "YÊU CẦU BỔ SUNG",
        tagType: "warning",
        entityType: "TASK",
        entityId: updatedTask.id,
        actionUrl: `/tasks/${updatedTask.id}`,
        actionLabel: "Hoàn thiện nhiệm vụ",
        taskCode: updatedTask.code,
        idempotencyKey: `EVENT_TASK_RET_${updatedTask.id}`,
      });
    }

    return NextResponse.json({
      success: true,
      message: successMessage,
      data: updatedTask,
    });
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
