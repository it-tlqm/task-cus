import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { getAuthorizedUnitIds, jsonError } from "@/server/guard";
import { advisoryLock, normalizeTitle } from "@/server/idempotency";
import { nextTaskCode } from "@/server/task-code";
import { recordAuditEvent } from "@/server/audit";
import { createNotification } from "@/server/notifications";

function canManage(user: any): boolean {
  return user.role === "UNIT_LEADER" || user.role === "DEPARTMENT_LEADER";
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
    if (!canManage(user)) return jsonError("Chỉ lãnh đạo mới được xử lý kết luận", 403);
    const { id } = await params;
    const body = await req.json();
    const { conclusionId, action } = body;

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
      } catch {}
      return NextResponse.json({ success: true, message: "Đã chuyển kết luận thành nhiệm vụ!", data: task }, { status: 201 });
    }

    return jsonError("Thao tác không hợp lệ", 400);
  } catch (error: any) {
    return jsonError("Lỗi khi xử lý kết luận: " + error.message, 500);
  }
}
