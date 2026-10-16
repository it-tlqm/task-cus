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

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (user.role === "SYSTEM_ADMIN") return jsonError("Quản trị kỹ thuật không có quyền xem sổ văn bản", 403);
    const { searchParams } = new URL(req.url);
    const direction = searchParams.get("direction") || "";
    const status = searchParams.get("status") || "";
    const search = searchParams.get("search")?.trim() || "";
    const where: any = {};
    if (direction === "DEN" || direction === "DI") where.direction = direction;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { number: { contains: search, mode: "insensitive" } },
        { title: { contains: search, mode: "insensitive" } },
        { fromTo: { contains: search, mode: "insensitive" } },
      ];
    }
    const rows = await prisma.officialDoc.findMany({
      where,
      include: {
        handler: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    // Kèm thông tin task đã sinh từ văn bản
    const taskIds = [...new Set(rows.map((r) => r.taskId).filter(Boolean))] as string[];
    const tasks = taskIds.length > 0
      ? await prisma.task.findMany({ where: { id: { in: taskIds } }, select: { id: true, code: true, status: true } })
      : [];
    const taskOf = new Map(tasks.map((t) => [t.id, t]));
    return NextResponse.json({
      success: true,
      data: rows.map((r) => ({ ...r, task: r.taskId ? taskOf.get(r.taskId) || null : null })),
    });
  } catch (error: any) {
    return jsonError("Lỗi khi tải sổ văn bản: " + error.message, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (user.role === "SYSTEM_ADMIN") return jsonError("Quản trị kỹ thuật không được ghi sổ văn bản", 403);
    const body = await req.json();
    const { direction, number, title, fromTo, docDate, handlerId, deadline, notes } = body;
    if (direction !== "DEN" && direction !== "DI") return jsonError("Loại sổ (đến/đi) không hợp lệ", 400);
    if (!number?.trim() || !title?.trim()) return jsonError("Số hiệu và trích yếu là bắt buộc", 400);
    if (handlerId) {
      const h = await prisma.person.findUnique({ where: { id: handlerId } });
      if (!h) return jsonError("Người xử lý không tồn tại", 400);
    }
    // Chống ghi trùng khi bấm liên tiếp
    const lockKey = `doc:${direction}:${normalizeTitle(number)}:${normalizeTitle(title)}`;
    const saved = await prisma.$transaction(async (tx) => {
      await advisoryLock(tx, lockKey);
      const recent = await tx.officialDoc.findFirst({
        where: { direction, number: number.trim(), title: title.trim(), createdAt: { gte: new Date(Date.now() - 120_000) } },
      });
      if (recent) return { row: recent, deduplicated: true as const };
      const created = await tx.officialDoc.create({
        data: {
          direction,
          number: number.trim(),
          title: title.trim(),
          fromTo: fromTo?.trim() || null,
          docDate: docDate ? new Date(docDate) : null,
          handlerId: handlerId || null,
          deadline: deadline ? new Date(deadline) : null,
          status: "DANG_XU_LY",
          notes: notes?.trim() || null,
          createdById: user.personId,
        },
      });
      return { row: created, deduplicated: false as const };
    });
    if (!saved.deduplicated) {
      await recordAuditEvent({
        actorId: user.id, action: "DOC_CREATE", resourceType: "OfficialDoc", resourceId: saved.row.id,
        newData: { direction, number },
      });
      // Báo người xử lý (nếu có)
      if (handlerId && handlerId !== user.personId) {
        try {
          await createNotification({
            recipientId: handlerId,
            category: "task", type: "TASK_ASSIGNED",
            title: `Văn bản ${direction === "DEN" ? "đến" : "đi"} cần xử lý: ${number.trim()}`,
            content: `${user.fullName} chuyển bạn xử lý văn bản "${title.trim()}"${deadline ? `, hạn ${new Date(deadline).toLocaleDateString("vi-VN")}` : ""}.`,
            tag: "VĂN BẢN MỚI", tagType: "primary",
            entityType: "ROUTINE", entityId: saved.row.id,
            actionUrl: "/docs", actionLabel: "Xem sổ văn bản",
            idempotencyKey: `EVENT_DOC_${saved.row.id}_${handlerId}`,
          });
        } catch {}
      }
    }
    return NextResponse.json(
      { success: true, data: saved.row, deduplicated: saved.deduplicated || undefined },
      { status: saved.deduplicated ? 200 : 201 }
    );
  } catch (error: any) {
    return jsonError("Lỗi khi ghi sổ văn bản: " + error.message, 500);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    const body = await req.json();
    const { id, action } = body;
    if (!id || !action) return jsonError("Thiếu ID hoặc thao tác", 400);
    const current = await prisma.officialDoc.findUnique({ where: { id } });
    if (!current) return jsonError("Văn bản không tồn tại", 404);

    if (action === "status") {
      // Đổi trạng thái: người xử lý, người tạo hoặc lãnh đạo
      const allowed =
        current.handlerId === user.personId || current.createdById === user.personId || canManage(user);
      if (!allowed) return jsonError("Bạn không có quyền cập nhật văn bản này", 403);
      const { status } = body;
      if (!["DANG_XU_LY", "HOAN_THANH", "LUU_TRU"].includes(status)) return jsonError("Trạng thái không hợp lệ", 400);
      const updated = await prisma.officialDoc.update({ where: { id }, data: { status } });
      await recordAuditEvent({
        actorId: user.id, action: "DOC_STATUS", resourceType: "OfficialDoc", resourceId: id,
        oldData: { status: current.status }, newData: { status },
      });
      return NextResponse.json({ success: true, data: updated });
    }

    if (action === "convert") {
      // Chuyển văn bản thành nhiệm vụ (lãnh đạo, chống sinh trùng bằng taskId)
      if (!canManage(user)) return jsonError("Chỉ lãnh đạo mới được chuyển văn bản thành nhiệm vụ", 403);
      if (current.taskId) {
        const existing = await prisma.task.findUnique({ where: { id: current.taskId }, include: { owner: true, unit: true } });
        return NextResponse.json({ success: true, data: existing, deduplicated: true, message: "Văn bản này đã chuyển thành nhiệm vụ trước đó" });
      }
      const { ownerId, deadline } = body;
      const effectiveOwner = ownerId || current.handlerId || user.personId;
      let targetUnitId: string | null | undefined = user.unitId;
      if (!targetUnitId) {
        const du = await prisma.orgUnit.findFirst({ where: { level: 2 }, select: { id: true } });
        targetUnitId = du?.id || null;
      }
      if (!targetUnitId) return jsonError("Không xác định được đơn vị thực hiện", 400);
      const authorizedUnits = await getAuthorizedUnitIds(user);
      if (authorizedUnits !== "ALL" && !authorizedUnits.includes(targetUnitId)) {
        return jsonError("Bạn không có quyền giao việc cho đơn vị này", 403);
      }
      const task = await prisma.$transaction(async (tx) => {
        await advisoryLock(tx, `doc-convert:${id}`);
        const recheck = await tx.officialDoc.findUnique({ where: { id } });
        if (recheck?.taskId) {
          return await tx.task.findUnique({ where: { id: recheck.taskId }, include: { owner: true, unit: true } });
        }
        const code = await nextTaskCode(tx);
        const created = await tx.task.create({
          data: {
            code,
            title: `Xử lý văn bản ${current.number}: ${current.title}`.slice(0, 300),
            description: `Từ sổ văn bản ${current.direction === "DEN" ? "đến" : "đi"} số ${current.number}${current.fromTo ? ` (${current.fromTo})` : ""}`,
            ownerId: effectiveOwner,
            unitId: targetUnitId!,
            priority: "Cao",
            status: "NOT_STARTED",
            originalDeadline: deadline ? new Date(deadline) : current.deadline || new Date(Date.now() + 3 * 86400000),
            currentDeadline: deadline ? new Date(deadline) : current.deadline || new Date(Date.now() + 3 * 86400000),
          },
          include: { owner: true, unit: true },
        });
        await tx.officialDoc.update({ where: { id }, data: { taskId: created.id, status: "DANG_XU_LY" } });
        return created;
      });
      await recordAuditEvent({
        actorId: user.id, action: "DOC_CONVERT_TASK", resourceType: "Task", resourceId: (task as any).id,
        newData: { docId: id },
      });
      return NextResponse.json({ success: true, message: "Đã chuyển văn bản thành nhiệm vụ!", data: task }, { status: 201 });
    }

    if (action === "delete") {
      if (!canManage(user)) return jsonError("Chỉ lãnh đạo mới được xóa văn bản", 403);
      await prisma.officialDoc.delete({ where: { id } });
      await recordAuditEvent({
        actorId: user.id, action: "DOC_DELETE", resourceType: "OfficialDoc", resourceId: id,
        oldData: { number: current.number, title: current.title },
      });
      return NextResponse.json({ success: true, message: "Đã xóa văn bản." });
    }

    return jsonError("Thao tác không hợp lệ", 400);
  } catch (error: any) {
    return jsonError("Lỗi khi xử lý văn bản: " + error.message, 500);
  }
}
