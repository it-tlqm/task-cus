import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { getAuthorizedUnitIds, jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";

const SHIFTS: Record<string, string> = {
  SANG: "Sáng",
  CHIEU: "Chiều",
  CA_NGAY: "Cả ngày",
};

async function inScope(user: any, unitId?: string | null): Promise<boolean> {
  if (user.role === "UNIT_LEADER") return true;
  const au = await getAuthorizedUnitIds(user);
  if (au === "ALL") return true;
  return !!unitId && au.includes(unitId);
}

/** GET /api/rosters?from=YYYY-MM-DD&to=YYYY-MM-DD — kèm cảnh báo trùng nghỉ đã duyệt. */
export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (user.role === "SYSTEM_ADMIN") return jsonError("Quản trị kỹ thuật không có quyền xem lịch trực", 403);

    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from") ? new Date(searchParams.get("from")!) : new Date();
    const to = searchParams.get("to") ? new Date(searchParams.get("to")!) : new Date(Date.now() + 7 * 86400000);
    const unitId = searchParams.get("unitId") || "";

    const authorizedUnits = await getAuthorizedUnitIds(user);
    const where: any = { date: { gte: from, lte: to } };
    if (unitId) {
      if (authorizedUnits !== "ALL" && !authorizedUnits.includes(unitId)) {
        return jsonError("Bạn không có quyền xem lịch đơn vị này", 403);
      }
      where.unitId = unitId;
    } else if (authorizedUnits !== "ALL") {
      where.OR = [{ unitId: { in: authorizedUnits } }, { unitId: null, personId: user.personId }];
    }

    const rows = await prisma.dutyRoster.findMany({
      where,
      include: {
        person: { select: { id: true, fullName: true } },
        unit: { select: { id: true, name: true } },
      },
      orderBy: [{ date: "asc" }, { personId: "asc" }],
      take: 500,
    });

    // Cảnh báo: người trực có đơn nghỉ đã duyệt trùng ngày
    const personIds = [...new Set(rows.map((r) => r.personId))];
    const leaves = personIds.length > 0
      ? await prisma.leaveRequest.findMany({
          where: {
            personId: { in: personIds },
            status: "APPROVED",
            startDate: { lte: to },
            endDate: { gte: from },
          },
          select: { personId: true, startDate: true, endDate: true, type: true },
        })
      : [];
    const leaveByPerson = new Map<string, typeof leaves>();
    for (const l of leaves) {
      const arr = leaveByPerson.get(l.personId) || [];
      arr.push(l);
      leaveByPerson.set(l.personId, arr);
    }
    const data = rows.map((r) => {
      const rd = new Date(r.date);
      const clash = (leaveByPerson.get(r.personId) || []).find((l) => {
        const { s, e } = { s: new Date(l.startDate), e: new Date(l.endDate) };
        return rd >= new Date(s.setHours(0, 0, 0, 0)) && rd <= new Date(e.setHours(23, 59, 59, 999));
      });
      return { ...r, leaveClash: clash ? { type: clash.type } : null };
    });

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return jsonError("Lỗi khi tải lịch trực: " + error.message, 500);
  }
}

/** POST — lãnh đạo xếp trực (kèm cảnh báo mềm nếu trùng nghỉ, vẫn cho lưu). */
export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    const canAssign = user.role === "UNIT_LEADER" || user.role === "DEPARTMENT_LEADER";
    if (!canAssign) return jsonError("Chỉ lãnh đạo mới được xếp lịch trực", 403);

    const body = await req.json();
    const { date, shift, post, personId, unitId, notes } = body;
    if (!date || !personId) return jsonError("Ngày trực và người trực là bắt buộc", 400);
    const d = new Date(date);
    if (isNaN(d.getTime())) return jsonError("Ngày trực không hợp lệ", 400);
    d.setHours(0, 0, 0, 0);
    if (!SHIFTS[shift]) return jsonError("Ca trực không hợp lệ", 400);

    // Đơn vị mặc định = đơn vị của người được xếp
    let targetUnitId: string | null = unitId || null;
    if (!targetUnitId) {
      const asg = await prisma.personAssignment.findFirst({
        where: { personId, isPrimary: true }, select: { unitId: true },
      });
      targetUnitId = asg?.unitId || null;
    }
    if (!(await inScope(user, targetUnitId))) {
      return jsonError("Bạn không có quyền xếp trực cho đơn vị này", 403);
    }

    const created = await prisma.dutyRoster.create({
      data: {
        date: d, shift, post: post?.trim() || null, personId,
        unitId: targetUnitId, notes: notes?.trim() || null, createdById: user.personId,
      },
      include: { person: { select: { id: true, fullName: true } }, unit: { select: { id: true, name: true } } },
    });

    // Cảnh báo mềm trùng nghỉ (không chặn)
    const dayEnd = new Date(d); dayEnd.setHours(23, 59, 59, 999);
    const clash = await prisma.leaveRequest.findFirst({
      where: {
        personId, status: "APPROVED",
        startDate: { lte: dayEnd },
        endDate: { gte: d },
      },
      select: { type: true },
    });

    await recordAuditEvent({
      actorId: user.id, action: "ROSTER_CREATE", resourceType: "DutyRoster", resourceId: created.id,
      newData: { personId, date: d.toISOString().slice(0, 10), shift },
    });
    return NextResponse.json(
      {
        success: true, data: { ...created, leaveClash: clash ? { type: clash.type } : null },
        warning: clash ? "Người này có đơn nghỉ đã duyệt trùng ngày — kiểm tra lại phân công!" : undefined,
      },
      { status: 201 }
    );
  } catch (error: any) {
    return jsonError("Lỗi khi xếp lịch trực: " + error.message, 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    const canAssign = user.role === "UNIT_LEADER" || user.role === "DEPARTMENT_LEADER";
    if (!canAssign) return jsonError("Chỉ lãnh đạo mới được xóa lịch trực", 403);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return jsonError("Thiếu ID", 400);
    const current = await prisma.dutyRoster.findUnique({ where: { id } });
    if (!current) return jsonError("Không tồn tại", 404);
    if (!(await inScope(user, current.unitId))) return jsonError("Bạn không có quyền xóa lịch đơn vị này", 403);
    await prisma.dutyRoster.delete({ where: { id } });
    await recordAuditEvent({
      actorId: user.id, action: "ROSTER_DELETE", resourceType: "DutyRoster", resourceId: id,
      oldData: { personId: current.personId, date: current.date },
    });
    return NextResponse.json({ success: true, message: "Đã xóa khỏi lịch trực." });
  } catch (error: any) {
    return jsonError("Lỗi khi xóa: " + error.message, 500);
  }
}
