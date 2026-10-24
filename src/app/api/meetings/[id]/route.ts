import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest, type SessionUser } from "@/server/auth";
import { getAuthorizedUnitIds, jsonError } from "@/server/guard";
import { advisoryLock, normalizeTitle } from "@/server/idempotency";
import { nextTaskCode } from "@/server/task-code";
import { recordAuditEvent } from "@/server/audit";
import { createNotification } from "@/server/notifications";

function canManage(user: any): boolean {
  return user.role === "UNIT_LEADER" || user.role === "DEPARTMENT_LEADER";
}

/**
 * Phạm vi đơn vị của biên bản.
 * `getAuthorizedUnitIds` trả "ALL" cho UNIT_LEADER theo thiết kế chung, nhưng biên bản
 * giao ban chỉ được sửa trong đơn vị mình — trừ khi grant có phạm vi ORGANIZATION.
 */
async function getMeetingScopeUnits(user: SessionUser): Promise<string[] | "ALL"> {
  const authorized = await getAuthorizedUnitIds(user);
  if (authorized !== "ALL") return authorized;
  if (user.scopeType === "ORGANIZATION") return "ALL";
  const rootUnitId = user.scopeUnitId || user.unitId;
  if (!rootUnitId) return [];
  if (user.scopeType === "SUBTREE") {
    const scoped = await getAuthorizedUnitIds({ ...user, role: "DEPARTMENT_LEADER" });
    return scoped === "ALL" ? [rootUnitId] : scoped;
  }
  return [rootUnitId];
}

/** Người tạo biên bản hoặc lãnh đạo trong đúng phạm vi đơn vị của biên bản. */
type MeetingScopeRow = {
  unitId: string | null;
  createdById: string | null;
  conclusions?: Array<{ ownerId: string | null; assigneeIds: string[] }>;
};

/** Quyền XEM: người tạo, người chủ trì/phối hợp, hoặc thành viên trong phạm vi đơn vị. */
async function canViewMeeting(user: SessionUser, meeting: MeetingScopeRow): Promise<boolean> {
  // Danh sách biên bản chặn SYSTEM_ADMIN — chi tiết phải khớp để không lộ dữ liệu nghiệp vụ.
  if (user.role === "SYSTEM_ADMIN") return false;
  const authorizedUnits = await getAuthorizedUnitIds(user);
  // "ALL" (lãnh đạo toàn tổ chức) xem được cả biên bản cũ không gắn unitId.
  if (authorizedUnits === "ALL") return true;
  if (meeting.createdById && meeting.createdById === user.personId) return true;
  const isConclusionMember = (meeting.conclusions || []).some(
    (c) => c.ownerId === user.personId || (c.assigneeIds || []).includes(user.personId)
  );
  if (isConclusionMember) return true;
  if (!meeting.unitId) return false;
  return authorizedUnits.includes(meeting.unitId);
}

/** Quyền SỬA: người tạo hoặc lãnh đạo trong đúng phạm vi đơn vị của biên bản. */
async function canEditMeeting(user: SessionUser, meeting: MeetingScopeRow): Promise<boolean> {
  if (meeting.createdById && meeting.createdById === user.personId) return true;
  if (!canManage(user)) return false;
  if (!meeting.unitId) return user.scopeType === "ORGANIZATION";
  const scopeUnits = await getMeetingScopeUnits(user);
  return scopeUnits === "ALL" || scopeUnits.includes(meeting.unitId);
}

/** Chi tiết biên bản + kết luận kèm task đã sinh. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    const { id } = await params;
    const meeting = await prisma.meeting.findUnique({
      where: { id },
      include: { conclusions: { orderBy: { sortOrder: "asc" } } },
    });
    if (!meeting) return jsonError("Biên bản không tồn tại", 404);
    if (!(await canViewMeeting(user, meeting))) {
      return jsonError("Bạn không có quyền xem biên bản này", 403);
    }
    const canEdit = await canEditMeeting(user, meeting);
    const personIds = [...new Set(meeting.conclusions.flatMap((c) => [c.ownerId, ...(c.assigneeIds || [])]).filter(Boolean))] as string[];
    const taskIds = [...new Set(meeting.conclusions.map((c) => c.taskId).filter(Boolean))] as string[];
    const [people, tasks] = await Promise.all([
      personIds.length > 0
        ? prisma.person.findMany({ where: { id: { in: personIds } }, select: { id: true, fullName: true } })
        : Promise.resolve([]),
      taskIds.length > 0
        ? prisma.task.findMany({ where: { id: { in: taskIds } }, select: { id: true, code: true, title: true, status: true } })
        : Promise.resolve([]),
    ]);
    const nameOf = new Map(people.map((p) => [p.id, p.fullName]));
    const taskOf = new Map(tasks.map((t) => [t.id, t]));
    return NextResponse.json({
      success: true,
      data: {
        ...meeting,
        canEdit,
        conclusions: meeting.conclusions.map((c) => ({
          ...c,
          ownerName: c.ownerId ? nameOf.get(c.ownerId) || null : null,
          assigneeNames: (c.assigneeIds || []).map((pid: string) => nameOf.get(pid) || pid),
          task: c.taskId ? taskOf.get(c.taskId) || null : null,
        })),
      },
    });
  } catch (error: any) {
    return jsonError("Lỗi khi tải biên bản: " + error.message, 500);
  }
}

/** Thêm kết luận (lãnh đạo). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (!canManage(user)) return jsonError("Chỉ lãnh đạo mới được thêm kết luận", 403);
    const { id } = await params;
    const meeting = await prisma.meeting.findUnique({ where: { id } });
    if (!meeting) return jsonError("Biên bản không tồn tại", 404);
    if (!(await canEditMeeting(user, meeting))) {
      return jsonError("Bạn không có quyền thêm kết luận cho biên bản này", 403);
    }
    const body = await req.json();
    const { content, ownerId, assigneeIds, deadline, priority } = body;
    if (!content?.trim()) return jsonError("Nội dung kết luận là bắt buộc", 400);
    const maxSort = await prisma.meetingConclusion.aggregate({
      where: { meetingId: id }, _max: { sortOrder: true },
    });
    const created = await prisma.meetingConclusion.create({
      data: {
        meetingId: id,
        content: content.trim(),
        ownerId: ownerId || null,
        assigneeIds: Array.isArray(assigneeIds) ? [...new Set(assigneeIds.filter((x: any) => typeof x === "string" && x !== ownerId))] : [],
        deadline: deadline ? new Date(deadline) : null,
        priority: priority || "Cao",
        sortOrder: (maxSort._max.sortOrder || 0) + 1,
      },
    });
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error: any) {
    return jsonError("Lỗi khi thêm kết luận: " + error.message, 500);
  }
}

/** Sửa/xóa kết luận + CHUYỂN kết luận thành nhiệm vụ (chống sinh trùng bằng taskId). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    const { id } = await params;
    const body = await req.json();
    const { conclusionId, action } = body;

    const meeting = await prisma.meeting.findUnique({ where: { id } });
    if (!meeting) return jsonError("Biên bản không tồn tại", 404);
    if (!(await canEditMeeting(user, meeting))) {
      return jsonError("Bạn không có quyền sửa biên bản này", 403);
    }

    // Sửa thông tin biên bản: người tạo hoặc lãnh đạo trong phạm vi đơn vị.
    if (action === "update_meeting") {
      const { title, meetingAt, chair, notes } = body;
      const data: { title?: string; meetingAt?: Date; chair?: string | null; notes?: string | null } = {};

      if (title !== undefined) {
        if (typeof title !== "string" || !title.trim()) return jsonError("Tiêu đề biên bản là bắt buộc", 400);
        const cleanTitle = title.trim();
        if (cleanTitle.length > 200) return jsonError("Tiêu đề biên bản không quá 200 ký tự", 400);
        data.title = cleanTitle;
      }
      if (meetingAt !== undefined) {
        const parsed = typeof meetingAt === "string" ? new Date(meetingAt) : new Date(NaN);
        if (Number.isNaN(parsed.getTime())) return jsonError("Thời gian họp không hợp lệ", 400);
        data.meetingAt = parsed;
      }
      if (chair !== undefined) {
        if (chair !== null && typeof chair !== "string") return jsonError("Chủ trì không hợp lệ", 400);
        const cleanChair = typeof chair === "string" ? chair.trim() : "";
        if (cleanChair.length > 200) return jsonError("Chủ trì không quá 200 ký tự", 400);
        data.chair = cleanChair || null;
      }
      if (notes !== undefined) {
        if (notes !== null && typeof notes !== "string") return jsonError("Ghi chú không hợp lệ", 400);
        const cleanNotes = typeof notes === "string" ? notes.trim() : "";
        if (cleanNotes.length > 5000) return jsonError("Ghi chú không quá 5.000 ký tự", 400);
        data.notes = cleanNotes || null;
      }
      if (Object.keys(data).length === 0) return jsonError("Không có thông tin biên bản cần cập nhật", 400);

      const updated = await prisma.meeting.update({ where: { id }, data });
      await recordAuditEvent({
        actorId: user.id,
        action: "MEETING_UPDATE",
        resourceType: "Meeting",
        resourceId: id,
        oldData: { title: meeting.title, meetingAt: meeting.meetingAt, chair: meeting.chair, notes: meeting.notes },
        newData: { title: updated.title, meetingAt: updated.meetingAt, chair: updated.chair, notes: updated.notes },
      });
      return NextResponse.json({ success: true, message: "Đã lưu thông tin biên bản.", data: updated });
    }

    if (!canManage(user)) return jsonError("Chỉ lãnh đạo mới được xử lý kết luận", 403);

    if (action === "delete") {
      if (!conclusionId) return jsonError("Thiếu ID kết luận", 400);
      const cur = await prisma.meetingConclusion.findUnique({ where: { id: conclusionId } });
      if (!cur || cur.meetingId !== id) return jsonError("Kết luận không thuộc biên bản này", 400);
      await prisma.meetingConclusion.delete({ where: { id: conclusionId } });
      return NextResponse.json({ success: true, message: "Đã xóa kết luận." });
    }

    if (action === "update") {
      if (!conclusionId) return jsonError("Thiếu ID kết luận", 400);
      const { content, ownerId, assigneeIds, deadline, priority } = body;
      const cur = await prisma.meetingConclusion.findUnique({ where: { id: conclusionId } });
      if (!cur || cur.meetingId !== id) return jsonError("Kết luận không thuộc biên bản này", 400);
      if (cur.taskId) return jsonError("Kết luận đã chuyển thành nhiệm vụ — sửa trực tiếp trên nhiệm vụ", 400);
      const updated = await prisma.meetingConclusion.update({
        where: { id: conclusionId },
        data: {
          ...(content !== undefined ? { content: content.trim() } : {}),
          ...(ownerId !== undefined ? { ownerId: ownerId || null } : {}),
          ...(assigneeIds !== undefined && Array.isArray(assigneeIds)
            ? { assigneeIds: [...new Set(assigneeIds.filter((x: any) => typeof x === "string"))] }
            : {}),
          ...(deadline !== undefined ? { deadline: deadline ? new Date(deadline) : null } : {}),
          ...(priority !== undefined ? { priority } : {}),
        },
      });
      return NextResponse.json({ success: true, data: updated });
    }

    if (action === "convert") {
      // Chuyển 1 kết luận thành 1 Task duy nhất (bấm trùng trả về task đã sinh)
      if (!conclusionId) return jsonError("Thiếu ID kết luận", 400);
      const concl = await prisma.meetingConclusion.findUnique({
        where: { id: conclusionId },
        include: { meeting: true },
      });
      if (!concl || concl.meetingId !== id) return jsonError("Kết luận không thuộc biên bản này", 400);
      if (concl.taskId) {
        const existing = await prisma.task.findUnique({
          where: { id: concl.taskId },
          include: { owner: true, unit: true },
        });
        return NextResponse.json({ success: true, data: existing, deduplicated: true, message: "Kết luận này đã chuyển thành nhiệm vụ trước đó" });
      }
      const meeting = concl.meeting;
      let targetUnitId: string | null | undefined = meeting.unitId || user.unitId;
      if (!targetUnitId) {
        const du = await prisma.orgUnit.findFirst({ where: { level: 2 }, select: { id: true } });
        targetUnitId = du?.id || null;
      }
      if (!targetUnitId) return jsonError("Không xác định được đơn vị thực hiện", 400);
      const authorizedUnits = await getAuthorizedUnitIds(user);
      if (authorizedUnits !== "ALL" && !authorizedUnits.includes(targetUnitId)) {
        return jsonError("Bạn không có quyền giao việc cho đơn vị này", 403);
      }
      const ownerId = concl.ownerId || user.personId;
      const assignees = (concl.assigneeIds || []).filter((p: string) => p !== ownerId);
      const deadline = concl.deadline || new Date(Date.now() + 7 * 86400000);

      const task = await prisma.$transaction(async (tx) => {
        await advisoryLock(tx, `meeting-convert:${conclusionId}`);
        const recheck = await tx.meetingConclusion.findUnique({ where: { id: conclusionId } });
        if (recheck?.taskId) {
          return await tx.task.findUnique({ where: { id: recheck.taskId }, include: { owner: true, unit: true } });
        }
        const code = await nextTaskCode(tx);
        const created = await tx.task.create({
          data: {
            code,
            title: concl.content.slice(0, 300),
            description: `Từ kết luận giao ban "${meeting.title}" (${new Date(meeting.meetingAt).toLocaleDateString("vi-VN")})`,
            ownerId,
            unitId: targetUnitId!,
            priority: concl.priority || "Cao",
            status: "NOT_STARTED",
            originalDeadline: deadline,
            currentDeadline: deadline,
            // YC-38: nguon phat sinh = giao ban (server quyet dinh, khong phai client khai)
        originKind: "DOCUMENT_MEETING",
            assignees: assignees.length > 0 ? { create: assignees.map((pId: string) => ({ personId: pId, role: "COLLABORATOR" })) } : undefined,
          },
          include: { owner: true, unit: true },
        });
        await tx.meetingConclusion.update({ where: { id: conclusionId }, data: { taskId: created.id } });
        return created;
      });

      await recordAuditEvent({
        actorId: user.id, action: "MEETING_CONVERT_TASK", resourceType: "Task", resourceId: (task as any).id,
        newData: { meetingId: id, conclusionId },
      });
      try {
        await createNotification({
          recipientId: ownerId,
          category: "task", type: "TASK_ASSIGNED",
          title: `Nhiệm vụ từ giao ban: [${(task as any).code}]`,
          content: `Kết luận giao ban "${meeting.title}" giao bạn chủ trì: '${concl.content.slice(0, 120)}'`,
          tag: "GIAO VIỆC MỚI", tagType: "primary",
          entityType: "TASK", entityId: (task as any).id,
          actionUrl: `/tasks/${(task as any).id}`, actionLabel: "Xem và nhận việc",
          taskCode: (task as any).code,
          idempotencyKey: `EVENT_MEET_CONV_${conclusionId}_${ownerId}`,
        });
        // Công chức phối hợp cũng phải biết mình được giao việc từ biên bản.
        for (const pId of assignees) {
          if (pId === ownerId) continue;
          await createNotification({
            recipientId: pId,
            category: "task", type: "TASK_ASSIGNED",
            title: `Nhiệm vụ phối hợp từ giao ban: [${(task as any).code}]`,
            content: `Kết luận giao ban "${meeting.title}" giao bạn phối hợp thực hiện: '${concl.content.slice(0, 120)}'`,
            tag: "PHỐI HỢP", tagType: "primary",
            entityType: "TASK", entityId: (task as any).id,
            actionUrl: `/tasks/${(task as any).id}`, actionLabel: "Xem và nhận việc",
            taskCode: (task as any).code,
            idempotencyKey: `EVENT_MEET_CONV_${conclusionId}_${pId}`,
          });
        }
      } catch {}
      return NextResponse.json({ success: true, message: "Đã chuyển kết luận thành nhiệm vụ!", data: task }, { status: 201 });
    }

    return jsonError("Thao tác không hợp lệ", 400);
  } catch (error: any) {
    return jsonError("Lỗi khi xử lý kết luận: " + error.message, 500);
  }
}
