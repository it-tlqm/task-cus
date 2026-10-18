import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { getAuthorizedUnitIds, jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";
import { parseSlots, slotKeyOf } from "@/server/duty-catalog";

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

function parseDayStart(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseDayEnd(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Đơn vị chính của cán bộ (nguồn gán unit cho bản ghi phân công). */
async function primaryUnitOf(personId: string): Promise<string | null> {
  const asg = await prisma.personAssignment.findFirst({
    where: { personId, isPrimary: true },
    select: { unitId: true },
  });
  return asg?.unitId || null;
}

/** Cảnh báo mềm: cán bộ có đơn nghỉ đã duyệt trùng ngày (không chặn lưu). */
async function leaveClashOf(personId: string, d: Date): Promise<{ type: string } | null> {
  const dayStart = new Date(d);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(d);
  dayEnd.setHours(23, 59, 59, 999);
  const clash = await prisma.leaveRequest.findFirst({
    where: {
      personId,
      status: "APPROVED",
      startDate: { lte: dayEnd },
      endDate: { gte: dayStart },
    },
    select: { type: true },
  });
  return clash ? { type: clash.type } : null;
}

/**
 * GET /api/rosters?from=YYYY-MM-DD&to=YYYY-MM-DD[&unitId&personId&positionId]
 * Trả về: phân công trong kỳ + danh mục vị trí + thông tin tổng hợp ngày + danh sách đơn vị
 * kèm cảnh báo: trùng đơn nghỉ đã duyệt (leaveClash) và trùng phân công trong ngày (overlapCount).
 */
export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (user.role === "SYSTEM_ADMIN") return jsonError("Quản trị kỹ thuật không có quyền xem lịch trực", 403);

    const { searchParams } = new URL(req.url);
    const from = parseDayStart(searchParams.get("from")) || parseDayStart(new Date().toISOString())!;
    const to = parseDayEnd(searchParams.get("to")) || new Date(from.getTime() + 7 * 86400000);
    const unitId = searchParams.get("unitId") || "";
    const personId = searchParams.get("personId") || "";
    const positionId = searchParams.get("positionId") || "";

    if (to.getTime() - from.getTime() > 62 * 86400000) {
      return jsonError("Khoảng xem tối đa 62 ngày", 400);
    }

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
    if (personId) where.personId = personId;
    if (positionId) where.positionId = positionId;

    const rows = await prisma.dutyRoster.findMany({
      where,
      include: {
        person: { select: { id: true, fullName: true } },
        unit: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ date: "asc" }, { positionOrder: "asc" }, { slotOrder: "asc" }, { createdAt: "asc" }],
      take: 1000,
    });

    // Cảnh báo trùng đơn nghỉ đã duyệt — trả theo PHẠM VI ĐƠN VỊ của người xem + kỳ đang xem,
    // để client cảnh báo được NGAY khi chọn cán bộ (kể cả ngày chưa có phân công nào).
    const leaveScope = authorizedUnits === "ALL"
      ? {}
      : { person: { assignments: { some: { isPrimary: true, unitId: { in: authorizedUnits } } } } };
    const leaves = await prisma.leaveRequest.findMany({
      where: {
        status: "APPROVED",
        startDate: { lte: to },
        endDate: { gte: from },
        ...leaveScope,
      },
      select: { personId: true, startDate: true, endDate: true, type: true },
      take: 500,
    });
    const leaveByPerson = new Map<string, typeof leaves>();
    for (const l of leaves) {
      const arr = leaveByPerson.get(l.personId) || [];
      arr.push(l);
      leaveByPerson.set(l.personId, arr);
    }

    // Cảnh báo trùng phân công trong cùng ngày (một cán bộ ở nhiều vị trí/ô)
    const dayKey = (d: Date | string) => {
      const x = new Date(d);
      return `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}`;
    };
    const countByPersonDay = new Map<string, number>();
    for (const r of rows) {
      const k = `${r.personId}|${dayKey(r.date)}`;
      countByPersonDay.set(k, (countByPersonDay.get(k) || 0) + 1);
    }

    const data = rows.map((r) => {
      const rd = new Date(r.date);
      const clash = (leaveByPerson.get(r.personId) || []).find((l) => {
        const s = new Date(l.startDate);
        const e = new Date(l.endDate);
        return rd >= new Date(s.setHours(0, 0, 0, 0)) && rd <= new Date(e.setHours(23, 59, 59, 999));
      });
      const overlapCount = countByPersonDay.get(`${r.personId}|${dayKey(r.date)}`) || 1;
      return { ...r, leaveClash: clash ? { type: clash.type } : null, overlapCount };
    });

    const [positionsRaw, dayInfos, units] = await Promise.all([
      prisma.dutyPosition.findMany({ orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }),
      prisma.dutyDayInfo.findMany({ where: { date: { gte: from, lte: to } } }),
      prisma.orgUnit.findMany({
        where: authorizedUnits === "ALL" ? { status: "ACTIVE" } : { id: { in: authorizedUnits } },
        select: { id: true, code: true, name: true },
        orderBy: { code: "asc" },
      }),
    ]);

    const positions = positionsRaw.map((p) => ({
      id: p.id,
      code: p.code,
      title: p.title,
      detail: p.detail,
      slots: parseSlots(p.slots),
      sortOrder: p.sortOrder,
      status: p.status,
    }));

    return NextResponse.json({
      success: true,
      data,
      dayInfos,
      positions,
      units,
      // Đơn nghỉ đã duyệt trong kỳ — client dùng để cảnh báo TRƯỚC khi lưu phân công
      leaves: leaves.map((l) => ({ personId: l.personId, type: l.type, startDate: l.startDate, endDate: l.endDate })),
    });
  } catch (error: any) {
    return jsonError("Lỗi khi tải lịch trực: " + error.message, 500);
  }
}

/**
 * POST /api/rosters — lãnh đạo phân công một cán bộ vào một ô của biểu.
 * Body: { date, personId, positionId, slotOrder, unitId?, reason?, notes? }
 * (Vẫn chấp nhận body cũ: {date, shift, personId, post, notes} khi không có positionId.)
 * Kèm cảnh báo mềm nếu trùng đơn nghỉ đã duyệt — vẫn cho lưu.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    const canAssign = user.role === "UNIT_LEADER" || user.role === "DEPARTMENT_LEADER";
    if (!canAssign) return jsonError("Chỉ lãnh đạo mới được phân công nhiệm vụ", 403);

    const body = await req.json();
    const { date, personId, positionId, slotOrder, unitId, reason, notes } = body;
    if (!date || !personId) return jsonError("Ngày và người thực hiện là bắt buộc", 400);
    const d = parseDayStart(String(date));
    if (!d) return jsonError("Ngày phân công không hợp lệ", 400);

    const person = await prisma.person.findUnique({ where: { id: personId }, select: { id: true, status: true } });
    if (!person || person.status !== "ACTIVE") return jsonError("Cán bộ không tồn tại hoặc đã ngừng hoạt động", 400);

    // Đơn vị mặc định = đơn vị chính của người được phân công
    let targetUnitId: string | null = unitId || null;
    if (!targetUnitId) targetUnitId = await primaryUnitOf(personId);
    if (!(await inScope(user, targetUnitId))) {
      return jsonError("Bạn không có quyền phân công cho đơn vị này", 403);
    }

    // ---- Trường hợp 1: phân công theo biểu mẫu (có positionId) ----
    if (positionId) {
      const position = await prisma.dutyPosition.findUnique({ where: { id: positionId } });
      if (!position) return jsonError("Vị trí/nhiệm vụ không tồn tại", 400);
      if (position.status !== "ACTIVE") return jsonError("Vị trí/nhiệm vụ đã ngừng sử dụng — không phân công mới", 400);
      const slots = parseSlots(position.slots);
      const idx = Number(slotOrder);
      if (!Number.isInteger(idx) || idx < 0 || idx >= slots.length) {
        return jsonError("Ô phân công không hợp lệ (ngoài phạm vi vị trí)", 400);
      }
      const slot = slots[idx];
      const slotKey = slotKeyOf(position.id, idx);

      const dup = await prisma.dutyRoster.findUnique({ where: { date_slotKey: { date: d, slotKey } } });
      if (dup) {
        return jsonError("Ô này đã có người — hãy đổi người thay vì phân công thêm", 409);
      }

      const created = await prisma.dutyRoster.create({
        data: {
          date: d,
          shift: "CA_NGAY",
          personId,
          unitId: targetUnitId,
          notes: notes?.trim() || null,
          reason: reason?.trim() || null,
          positionId: position.id,
          positionTitle: position.title,
          positionDetail: position.detail,
          positionOrder: position.sortOrder,
          slotLabel: slot.l,
          slotOrder: idx,
          slotKey,
          createdById: user.personId,
        },
        include: {
          person: { select: { id: true, fullName: true } },
          unit: { select: { id: true, name: true, code: true } },
        },
      });

      const clash = await leaveClashOf(personId, d);
      await recordAuditEvent({
        actorId: user.id,
        action: "ROSTER_CREATE",
        resourceType: "DutyRoster",
        resourceId: created.id,
        newData: {
          date: d.toISOString().slice(0, 10),
          personId,
          positionId: position.id,
          positionCode: position.code,
          slotLabel: slot.l,
          slotOrder: idx,
          reason: reason?.trim() || undefined,
        },
      });
      return NextResponse.json(
        {
          success: true,
          data: { ...created, leaveClash: clash, overlapCount: 1 },
          warning: clash ? "Người này có đơn nghỉ đã duyệt trùng ngày — kiểm tra lại phân công!" : undefined,
        },
        { status: 201 }
      );
    }

    // ---- Trường hợp 2: tương thích dữ liệu cũ (không có positionId) ----
    const { shift, post } = body;
    if (!SHIFTS[shift]) return jsonError("Ca trực không hợp lệ", 400);
    const created = await prisma.dutyRoster.create({
      data: {
        date: d,
        shift,
        post: post?.trim() || null,
        personId,
        unitId: targetUnitId,
        notes: notes?.trim() || null,
        createdById: user.personId,
      },
      include: {
        person: { select: { id: true, fullName: true } },
        unit: { select: { id: true, name: true, code: true } },
      },
    });
    const clash = await leaveClashOf(personId, d);
    await recordAuditEvent({
      actorId: user.id,
      action: "ROSTER_CREATE",
      resourceType: "DutyRoster",
      resourceId: created.id,
      newData: { personId, date: d.toISOString().slice(0, 10), shift, post: post || undefined },
    });
    return NextResponse.json(
      {
        success: true,
        data: { ...created, leaveClash: clash, overlapCount: 1 },
        warning: clash ? "Người này có đơn nghỉ đã duyệt trùng ngày — kiểm tra lại phân công!" : undefined,
      },
      { status: 201 }
    );
  } catch (error: any) {
    return jsonError("Lỗi khi phân công nhiệm vụ: " + error.message, 500);
  }
}

/**
 * PATCH /api/rosters — đổi người thực hiện (bắt buộc ghi lý do) / cập nhật ghi chú.
 * Body: { id, personId?, reason?, notes? } — lưu vết đầy đủ vào audit.
 */
export async function PATCH(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    const canAssign = user.role === "UNIT_LEADER" || user.role === "DEPARTMENT_LEADER";
    if (!canAssign) return jsonError("Chỉ lãnh đạo mới được đổi phân công", 403);

    const body = await req.json();
    const { id, personId, reason, notes } = body;
    if (!id) return jsonError("Thiếu ID phân công", 400);

    const current = await prisma.dutyRoster.findUnique({ where: { id } });
    if (!current) return jsonError("Phân công không tồn tại", 404);
    if (!(await inScope(user, current.unitId))) {
      return jsonError("Bạn không có quyền sửa phân công của đơn vị này", 403);
    }

    const data: any = {};
    const auditOld: any = { personId: current.personId, unitId: current.unitId };
    const auditNew: any = {};

    if (notes !== undefined) {
      data.notes = String(notes).trim() || null;
      auditNew.notes = data.notes;
    }

    if (personId && personId !== current.personId) {
      const trimmedReason = String(reason || "").trim();
      if (trimmedReason.length < 3) {
        return jsonError("Đổi người thực hiện phải ghi lý do (tối thiểu 3 ký tự)", 400);
      }
      const person = await prisma.person.findUnique({ where: { id: personId }, select: { id: true, status: true } });
      if (!person || person.status !== "ACTIVE") return jsonError("Cán bộ không tồn tại hoặc đã ngừng hoạt động", 400);
      const newUnitId = await primaryUnitOf(personId);
      if (!(await inScope(user, newUnitId))) {
        return jsonError("Bạn không có quyền phân công cho cán bộ thuộc đơn vị này", 403);
      }
      data.personId = personId;
      data.unitId = newUnitId;
      data.reason = trimmedReason;
      auditNew.personId = personId;
      auditNew.unitId = newUnitId;
      auditNew.reason = trimmedReason;
    } else if (reason !== undefined) {
      data.reason = String(reason).trim() || null;
      auditNew.reason = data.reason;
    }

    if (Object.keys(data).length === 0) return jsonError("Không có thay đổi nào để lưu", 400);

    const updated = await prisma.dutyRoster.update({
      where: { id },
      data,
      include: {
        person: { select: { id: true, fullName: true } },
        unit: { select: { id: true, name: true, code: true } },
      },
    });

    const clash = await leaveClashOf(updated.personId, new Date(updated.date));
    await recordAuditEvent({
      actorId: user.id,
      action: "ROSTER_UPDATE",
      resourceType: "DutyRoster",
      resourceId: id,
      oldData: auditOld,
      newData: auditNew,
    });
    return NextResponse.json({
      success: true,
      data: { ...updated, leaveClash: clash },
      warning: clash ? "Người này có đơn nghỉ đã duyệt trùng ngày — kiểm tra lại phân công!" : undefined,
    });
  } catch (error: any) {
    return jsonError("Lỗi khi cập nhật phân công: " + error.message, 500);
  }
}

/** DELETE /api/rosters?id=...&reason=... — lãnh đạo gỡ phân công (ghi lý do nếu có). */
export async function DELETE(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    const canAssign = user.role === "UNIT_LEADER" || user.role === "DEPARTMENT_LEADER";
    if (!canAssign) return jsonError("Chỉ lãnh đạo mới được gỡ phân công", 403);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const reason = searchParams.get("reason") || "";
    if (!id) return jsonError("Thiếu ID", 400);
    const current = await prisma.dutyRoster.findUnique({ where: { id } });
    if (!current) return jsonError("Không tồn tại", 404);
    if (!(await inScope(user, current.unitId))) return jsonError("Bạn không có quyền gỡ phân công của đơn vị này", 403);
    await prisma.dutyRoster.delete({ where: { id } });
    await recordAuditEvent({
      actorId: user.id,
      action: "ROSTER_DELETE",
      resourceType: "DutyRoster",
      resourceId: id,
      oldData: {
        personId: current.personId,
        date: current.date,
        positionId: current.positionId,
        positionTitle: current.positionTitle,
        slotLabel: current.slotLabel,
      },
      newData: reason.trim() ? { reason: reason.trim() } : undefined,
    });
    return NextResponse.json({ success: true, message: "Đã gỡ phân công." });
  } catch (error: any) {
    return jsonError("Lỗi khi gỡ phân công: " + error.message, 500);
  }
}
