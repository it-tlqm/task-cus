import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { getAuthorizedUnitIds, jsonError } from "@/server/guard";
import { advisoryLock } from "@/server/idempotency";
import { recordAuditEvent } from "@/server/audit";
import { createNotification } from "@/server/notifications";

// Đợt B v1: đơn nghỉ phép/bù/công tác/cuối tuần + duyệt theo phạm vi.
const LEAVE_TYPES: Record<string, string> = {
  NGHI_PHEP: "Nghỉ phép",
  NGHI_BU: "Nghỉ bù",
  CONG_TAC: "Công tác",
  NGHI_CUOI_TUAN: "Nghỉ cuối tuần",
};

async function canReview(user: any, personId: string): Promise<boolean> {
  if (user.role === "UNIT_LEADER") return true;
  if (user.role !== "DEPARTMENT_LEADER") return false;
  const authorizedUnits = await getAuthorizedUnitIds(user);
  if (authorizedUnits === "ALL") return true;
  const target = await prisma.person.findUnique({
    where: { id: personId },
    include: { assignments: { where: { isPrimary: true }, select: { unitId: true } } },
  });
  return !!target?.assignments.some((a) => authorizedUnits.includes(a.unitId));
}

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (user.role === "SYSTEM_ADMIN") return jsonError("Quản trị kỹ thuật không có quyền xem đơn nghỉ", 403);

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "";
    const requestedPersonId = searchParams.get("personId") || "";

    const authorizedUnits = await getAuthorizedUnitIds(user);
    const where: any = {};
    if (status) where.status = status;

    if (user.role === "UNIT_LEADER" || authorizedUnits === "ALL") {
      if (requestedPersonId) where.personId = requestedPersonId;
    } else if (user.role === "DEPARTMENT_LEADER") {
      if (requestedPersonId) {
        const ok = await canReview(user, requestedPersonId);
        if (!ok) return jsonError("Bạn không có quyền xem đơn của cán bộ này", 403);
        where.personId = requestedPersonId;
      } else {
        where.person = { assignments: { some: { unitId: { in: authorizedUnits }, isPrimary: true } } };
      }
    } else {
      where.personId = user.personId;
    }

    const rows = await prisma.leaveRequest.findMany({
      where,
      include: {
        person: { select: { id: true, fullName: true } },
        handoverTo: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return NextResponse.json({ success: true, data: rows });
  } catch (error: any) {
    return jsonError("Lỗi khi tải đơn nghỉ: " + error.message, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (user.role === "SYSTEM_ADMIN") return jsonError("Quản trị kỹ thuật không được tạo đơn nghỉ", 403);

    const body = await req.json();
    const { type, startDate, endDate, reason, handoverToId, handoverNotes } = body;
    if (!LEAVE_TYPES[type]) return jsonError("Loại nghỉ không hợp lệ", 400);
    if (!startDate || !endDate) return jsonError("Từ ngày và đến ngày là bắt buộc", 400);
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
      return jsonError("Khoảng ngày nghỉ không hợp lệ", 400);
    }
    if (!reason?.trim()) return jsonError("Lý do nghỉ là bắt buộc", 400);
    if (handoverToId) {
      const h = await prisma.person.findUnique({ where: { id: handoverToId } });
      if (!h) return jsonError("Người bàn giao không tồn tại", 400);
    }

    // Chống báo trùng (bấm liên tiếp): cùng người + loại + khoảng ngày trong 120s
    const lockKey = `leave:${user.personId}:${type}:${start.toISOString().slice(0, 10)}:${end.toISOString().slice(0, 10)}`;
    const saved = await prisma.$transaction(async (tx) => {
      await advisoryLock(tx, lockKey);
      const recent = await tx.leaveRequest.findFirst({
        where: {
          personId: user.personId, type,
          startDate: start, endDate: end,
          createdAt: { gte: new Date(Date.now() - 120_000) },
        },
        include: { person: { select: { id: true, fullName: true } }, handoverTo: { select: { id: true, fullName: true } } },
      });
      if (recent) return { row: recent, deduplicated: true as const };
      const created = await tx.leaveRequest.create({
        data: {
          personId: user.personId,
          type,
          startDate: start,
          endDate: end,
          reason: reason.trim(),
          handoverToId: handoverToId || null,
          handoverNotes: handoverNotes?.trim() || null,
          status: "PENDING",
        },
        include: { person: { select: { id: true, fullName: true } }, handoverTo: { select: { id: true, fullName: true } } },
      });
      return { row: created, deduplicated: false as const };
    });

    if (!saved.deduplicated) {
      await recordAuditEvent({
        actorId: user.id, action: "LEAVE_CREATE", resourceType: "LeaveRequest", resourceId: saved.row.id,
        newData: { personId: user.personId, type, startDate, endDate },
      });
      // Báo lãnh đạo phụ trách duyệt (trưởng bộ phận của đơn vị mình + lãnh đạo đơn vị)
      try {
        const me = await prisma.person.findUnique({
          where: { id: user.personId },
          include: { assignments: { where: { isPrimary: true }, select: { unitId: true } } },
        });
        const myUnitId = me?.assignments[0]?.unitId;
        const leaders = myUnitId
          ? await prisma.account.findMany({
              where: {
                status: "ACTIVE",
                OR: [
                  { roleGrants: { some: { role: { code: "UNIT_LEADER" }, validTo: null } } },
                  { roleGrants: { some: { role: { code: "DEPARTMENT_LEADER" }, scopeUnitId: myUnitId, validTo: null } } },
                ],
              },
              select: { personId: true },
            })
          : [];
        for (const l of leaders) {
          if (l.personId && l.personId !== user.personId) {
            await createNotification({
              recipientId: l.personId,
              category: "approval",
              type: "LEAVE_REQUEST_PENDING",
              title: `Đơn ${LEAVE_TYPES[type]}: ${user.fullName}`,
              content: `${user.fullName} báo ${LEAVE_TYPES[type].toLowerCase()} từ ${start.toLocaleDateString("vi-VN")} đến ${end.toLocaleDateString("vi-VN")}. Lý do: ${reason.trim()}`,
              tag: "DUYỆT ĐƠN NGHỈ",
              tagType: "warning",
              entityType: "ROUTINE",
              entityId: saved.row.id,
              actionUrl: "/leaves",
              actionLabel: "Xem và duyệt đơn",
              idempotencyKey: `EVENT_LEAVE_${saved.row.id}_${l.personId}`,
            });
          }
        }
        // Báo người được bàn giao (nếu có)
        if (handoverToId && handoverToId !== user.personId) {
          await createNotification({
            recipientId: handoverToId,
            category: "task",
            type: "LEAVE_HANDOVER",
            title: `Bàn giao khi ${user.fullName} ${LEAVE_TYPES[type].toLowerCase()}`,
            content: handoverNotes?.trim() || `${user.fullName} phân công bạn tiếp nhận công việc trong thời gian vắng mặt.`,
            tag: "BÀN GIAO",
            tagType: "primary",
            entityType: "ROUTINE",
            entityId: saved.row.id,
            actionUrl: "/leaves",
            actionLabel: "Xem chi tiết",
            idempotencyKey: `EVENT_LEAVE_HO_${saved.row.id}_${handoverToId}`,
          });
        }
      } catch {}
    }

    return NextResponse.json(
      { success: true, data: saved.row, deduplicated: saved.deduplicated || undefined },
      { status: saved.deduplicated ? 200 : 201 }
    );
  } catch (error: any) {
    return jsonError("Lỗi khi tạo đơn nghỉ: " + error.message, 500);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    const body = await req.json();
    const { id, action, reviewNotes } = body;
    if (!id || !action) return jsonError("Thiếu ID hoặc thao tác", 400);

    const current = await prisma.leaveRequest.findUnique({ where: { id } });
    if (!current) return jsonError("Đơn không tồn tại", 404);

    if (action === "APPROVE" || action === "REJECT") {
      const ok = await canReview(user, current.personId);
      if (!ok) return jsonError("Chỉ lãnh đạo phụ trách mới được duyệt đơn này", 403);
      if (current.status !== "PENDING") {
        return jsonError("Đơn này đã được xử lý trước đó", 400);
      }
      if (action === "REJECT" && !reviewNotes?.trim()) {
        return jsonError("Từ chối phải ghi rõ lý do", 400);
      }
      const updated = await prisma.leaveRequest.update({
        where: { id },
        data: {
          status: action === "APPROVE" ? "APPROVED" : "REJECTED",
          reviewedById: user.personId,
          reviewedAt: new Date(),
          reviewNotes: reviewNotes?.trim() || null,
        },
        include: { person: { select: { id: true, fullName: true } }, handoverTo: { select: { id: true, fullName: true } } },
      });
      await recordAuditEvent({
        actorId: user.id, action: action === "APPROVE" ? "LEAVE_APPROVE" : "LEAVE_REJECT",
        resourceType: "LeaveRequest", resourceId: id,
        oldData: { status: "PENDING" }, newData: { status: updated.status, by: user.fullName },
      });
      try {
        await createNotification({
          recipientId: current.personId,
          category: "approval",
          type: action === "APPROVE" ? "LEAVE_APPROVED" : "LEAVE_REJECTED",
          title: action === "APPROVE" ? `Đơn ${LEAVE_TYPES[current.type]} đã được duyệt` : `Đơn ${LEAVE_TYPES[current.type]} bị từ chối`,
          content: action === "APPROVE"
            ? `${user.fullName} đã duyệt đơn của bạn.${reviewNotes?.trim() ? ` Ghi chú: ${reviewNotes.trim()}` : ""}`
            : `${user.fullName} chưa đồng ý đơn của bạn. Lý do: ${reviewNotes?.trim()}`,
          tag: action === "APPROVE" ? "ĐÃ DUYỆT" : "TỪ CHỐI",
          tagType: action === "APPROVE" ? "success" : "danger",
          entityType: "ROUTINE",
          entityId: id,
          actionUrl: "/leaves",
          actionLabel: "Xem đơn",
          idempotencyKey: `EVENT_LEAVE_DEC_${id}`,
        });
      } catch {}
      return NextResponse.json({ success: true, message: action === "APPROVE" ? "Đã duyệt đơn!" : "Đã từ chối đơn.", data: updated });
    }

    if (action === "CANCEL") {
      const isOwner = current.personId === user.personId;
      const isLeader = user.role === "UNIT_LEADER" || user.role === "DEPARTMENT_LEADER";
      if (!isOwner && !isLeader) return jsonError("Bạn không có quyền hủy đơn này", 403);
      if (current.status !== "PENDING") return jsonError("Chỉ hủy được đơn đang chờ duyệt", 400);
      const updated = await prisma.leaveRequest.update({
        where: { id }, data: { status: "CANCELED" },
        include: { person: { select: { id: true, fullName: true } }, handoverTo: { select: { id: true, fullName: true } } },
      });
      await recordAuditEvent({
        actorId: user.id, action: "LEAVE_CANCEL", resourceType: "LeaveRequest", resourceId: id,
        oldData: { status: "PENDING" }, newData: { status: "CANCELED" },
      });
      return NextResponse.json({ success: true, message: "Đã hủy đơn.", data: updated });
    }

    return jsonError("Thao tác không hợp lệ", 400);
  } catch (error: any) {
    return jsonError("Lỗi khi xử lý đơn: " + error.message, 500);
  }
}
