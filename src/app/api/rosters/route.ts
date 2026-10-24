import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { getAuthorizedUnitIds, jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";
import { parseSlots, slotKeyOf } from "@/server/duty-catalog";
import { primaryUnitOf, resolveDutyUnitId as resolveUnitId } from "@/server/duty-scope";
import {
  hasAssignedPerson,
  isNoonDutyTitle,
  MAX_EXTRA_SLOTS_PER_POSITION,
  NOTES_REQUIRE_PERSON_MESSAGE,
} from "@/lib/duty-roster";

/**
 * YC-24 PHƯƠNG ÁN B — Bảng phân công định danh theo (BỘ PHẬN + NGÀY + Ô).
 *
 * Nguyên tắc phân quyền (backend là chốt chặn cuối cùng — KHÔNG tin unitId do client gửi):
 * - UNIT_LEADER (Lãnh đạo đơn vị): phạm vi toàn đơn vị (mọi bộ phận trực thuộc).
 * - DEPARTMENT_LEADER (Trưởng bộ phận): chỉ bộ phận (và cây con) được cấp.
 * - STAFF: chỉ xem trong phạm vi được cấp; không quản lý.
 * - SYSTEM_ADMIN: không có quyền nghiệp vụ (chặn 403).
 * Mọi tham số unitId gửi lên đều được đối chiếu với phạm vi thực tế của tài khoản.
 */

const SHIFTS: Record<string, string> = {
  SANG: "Sáng",
  CHIEU: "Chiều",
  CA_NGAY: "Cả ngày",
};

/** Ghi chú per-person (DutyRoster.notes) — giới hạn để tránh dữ liệu rác/ô quá dài. */
const MAX_NOTES_LENGTH = 1000;

function normalizeNotes(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
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

function dayBounds(d: Date): { start: Date; end: Date } {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

// Phạm vi bộ phận: dùng chung tại @/server/duty-scope (scopeUnitsOf/resolveDutyUnitId/primaryUnitOf).

/** Cảnh báo mềm: cán bộ có đơn nghỉ đã duyệt trùng ngày (không chặn lưu). */
async function leaveClashOf(personId: string, d: Date): Promise<{ type: string } | null> {
  const { start, end } = dayBounds(d);
  const clash = await prisma.leaveRequest.findFirst({
    where: {
      personId,
      status: "APPROVED",
      startDate: { lte: end },
      endDate: { gte: start },
    },
    select: { type: true },
  });
  return clash ? { type: clash.type } : null;
}

/**
 * Cảnh báo cán bộ được phân công ở bảng khác trong cùng ngày (chỉ trả SỐ LƯỢNG — không lộ chi tiết ngoài quyền).
 * Chỉ đếm CÙNG NHÓM TRỰC (trực thường / trực trưa): một người vừa trực thường vừa trực trưa
 * trong ngày là hợp lệ, không phải trùng phân công.
 * outside = số phân công cùng nhóm trực ngoài bộ phận đang xét.
 */
async function crossCountOf(
  personId: string,
  d: Date,
  boardUnitId: string,
  noon: boolean
): Promise<{ total: number; board: number; outside: number }> {
  const { start, end } = dayBounds(d);
  const rows = await prisma.dutyRoster.findMany({
    where: { personId, date: { gte: start, lte: end } },
    select: { unitId: true, positionTitle: true },
  });
  let total = 0;
  let board = 0;
  for (const r of rows) {
    if (isNoonDutyTitle(r.positionTitle) !== noon) continue;
    total++;
    if (r.unitId === boardUnitId) board++;
  }
  return { total, board, outside: Math.max(0, total - board) };
}

/**
 * GET /api/rosters?from=YYYY-MM-DD&to=YYYY-MM-DD[&unitId=...][&personId&positionId]
 * Trả về: phân công CỦA ĐÚNG MỘT BỘ PHẬN trong kỳ + danh mục của bộ phận đó + thông tin tổng hợp ngày
 * + danh sách bộ phận trong phạm vi (kèm trạng thái đã/chưa lập bảng) + dữ liệu cũ cần đối chiếu (chỉ Lãnh đạo đơn vị).
 */
export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (user.role === "SYSTEM_ADMIN") return jsonError("Quản trị kỹ thuật không có quyền xem lịch trực", 403);

    const { searchParams } = new URL(req.url);
    const from = parseDayStart(searchParams.get("from")) || parseDayStart(new Date().toISOString())!;
    const to = parseDayEnd(searchParams.get("to")) || new Date(from.getTime() + 7 * 86400000);
    const personId = searchParams.get("personId") || "";
    const positionId = searchParams.get("positionId") || "";

    if (to.getTime() - from.getTime() > 62 * 86400000) {
      return jsonError("Khoảng xem tối đa 62 ngày", 400);
    }

    const resolved = await resolveUnitId(user, searchParams.get("unitId") || null);
    if (!resolved.ok) return jsonError(resolved.error, resolved.status);
    const { unitId, authorized, units } = resolved;

    const where: any = { unitId, date: { gte: from, lte: to } };
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

    // Cảnh báo trùng đơn nghỉ đã duyệt — theo phạm vi đơn vị của người xem + kỳ đang xem
    const leaveScope =
      authorized === "ALL"
        ? {}
        : { person: { assignments: { some: { isPrimary: true, unitId: { in: authorized } } } } };
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

    // Đếm phân công theo (cán bộ, ngày) TRONG bảng này — tách riêng trực thường / trực trưa.
    // Một người vừa trực thường vừa trực trưa trong ngày KHÔNG bị coi là trùng phân công.
    const dayKey = (d: Date | string) => {
      const x = new Date(d);
      return `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}`;
    };
    const boardNormal = new Map<string, number>();
    const boardNoon = new Map<string, number>();
    for (const r of rows) {
      const k = `${r.personId}|${dayKey(r.date)}`;
      const bucket = isNoonDutyTitle(r.positionTitle) ? boardNoon : boardNormal;
      bucket.set(k, (bucket.get(k) || 0) + 1);
    }

    // Đếm phân công theo (cán bộ, ngày, nhóm trực) TRÊN TOÀN HỆ THỐNG (chỉ số lượng)
    // — cảnh báo phân công chéo bộ phận, cũng tách trực thường / trực trưa.
    const personIds = [...new Set(rows.map((r) => r.personId))];
    const allNormal = new Map<string, number>();
    const allNoon = new Map<string, number>();
    if (personIds.length > 0) {
      const grouped = await prisma.dutyRoster.groupBy({
        by: ["personId", "date", "positionTitle"],
        where: { personId: { in: personIds }, date: { gte: from, lte: to } },
        _count: { id: true },
      });
      for (const g of grouped) {
        const k = `${g.personId}|${dayKey(g.date)}`;
        const bucket = isNoonDutyTitle(g.positionTitle) ? allNoon : allNormal;
        bucket.set(k, (bucket.get(k) || 0) + g._count.id);
      }
    }

    const data = rows.map((r) => {
      const rd = new Date(r.date);
      const clash = (leaveByPerson.get(r.personId) || []).find((l) => {
        const s = new Date(l.startDate);
        const e = new Date(l.endDate);
        return rd >= new Date(s.setHours(0, 0, 0, 0)) && rd <= new Date(e.setHours(23, 59, 59, 999));
      });
      const k = `${r.personId}|${dayKey(r.date)}`;
      const noon = isNoonDutyTitle(r.positionTitle);
      const boardCount = (noon ? boardNoon : boardNormal).get(k) || 1;
      const allCount = (noon ? allNoon : allNormal).get(k) || boardCount;
      const outside = Math.max(0, allCount - boardCount);
      // overlapCount = số phân công CÙNG NHÓM TRỰC trong bảng này (kể cả chính dòng này).
      // 1 trực thường + 1 trực trưa  -> mỗi dòng đều = 1, không cảnh báo.
      return { ...r, leaveClash: clash ? { type: clash.type } : null, overlapCount: boardCount, overlapOutsideCount: outside };
    });

    const scopeUnitIds = units.map((u) => u.id);

    const [positionsRaw, dayInfos, assignGroups, infoGroups, positionGroups, legacyUnassigned] = await Promise.all([
      prisma.dutyPosition.findMany({ where: { unitId }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }),
      prisma.dutyDayInfo.findMany({ where: { unitId, date: { gte: from, lte: to } }, orderBy: { date: "asc" } }),
      // Trạng thái đã/chưa lập bảng theo bộ phận (chỉ trong phạm vi người xem)
      prisma.dutyRoster.groupBy({
        by: ["unitId"],
        where: { unitId: { in: scopeUnitIds }, date: { gte: from, lte: to }, positionId: { not: null } },
        _count: { id: true },
      }),
      prisma.dutyDayInfo.groupBy({
        by: ["unitId"],
        where: { unitId: { in: scopeUnitIds }, date: { gte: from, lte: to } },
        _count: { id: true },
      }),
      // Số vị trí/nhiệm vụ đang hoạt động — cho biết bộ phận đã thiết lập danh mục hay chưa
      prisma.dutyPosition.groupBy({
        by: ["unitId"],
        where: { unitId: { in: scopeUnitIds }, status: "ACTIVE" },
        _count: { id: true },
      }),
      authorized === "ALL"
        ? prisma.dutyRoster.findMany({
            where: { unitId: null, date: { gte: from, lte: to } },
            include: { person: { select: { id: true, fullName: true } } },
            orderBy: { date: "asc" },
            take: 200,
          })
        : Promise.resolve([] as any[]),
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

    const boardStatus = units.map((u) => ({
      unitId: u.id,
      assignments: assignGroups.find((g) => g.unitId === u.id)?._count.id || 0,
      dayInfos: infoGroups.find((g) => g.unitId === u.id)?._count.id || 0,
      catalog: positionGroups.find((g) => g.unitId === u.id)?._count.id || 0,
    }));

    return NextResponse.json({
      success: true,
      data,
      dayInfos,
      positions,
      units,
      selectedUnitId: unitId,
      boardStatus,
      legacyUnassigned,
      // Đơn nghỉ đã duyệt trong kỳ — client dùng để cảnh báo TRƯỚC khi lưu phân công
      leaves: leaves.map((l) => ({ personId: l.personId, type: l.type, startDate: l.startDate, endDate: l.endDate })),
    });
  } catch (error: any) {
    return jsonError("Lỗi khi tải lịch trực: " + error.message, 500);
  }
}

/**
 * POST /api/rosters — lãnh đạo phân công một cán bộ vào một ô của BẢNG THUỘC MỘT BỘ PHẬN.
 * Body: { date, unitId, personId, positionId, slotOrder, reason?, notes? }
 * (Vẫn chấp nhận body cũ: { date, unitId, shift, personId, post, notes } khi không có positionId.)
 * - unitId là BẮT BUỘC: bảng phân công thuộc bộ phận nào do người lập chọn, không tự suy từ người được phân công.
 * - Vị trí (positionId) phải thuộc đúng danh mục của bộ phận đó.
 * - Cảnh báo mềm: trùng đơn nghỉ đã duyệt; cán bộ đã có phân công khác trong cùng ngày (nội bộ/ngoài bảng).
 */
export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    const canAssign = user.role === "UNIT_LEADER" || user.role === "DEPARTMENT_LEADER";
    if (!canAssign) return jsonError("Chỉ lãnh đạo mới được phân công nhiệm vụ", 403);

    const body = await req.json();
    const { date, personId, positionId, slotOrder, unitId, reason, notes } = body;
    // E13 / A0: ghi chú chỉ gắn với người được phân công — không nhận ghi chú cho ô trống.
    const assignedPersonId = hasAssignedPerson(personId) ? String(personId).trim() : "";
    const noteText = normalizeNotes(notes);
    if (noteText && !assignedPersonId) return jsonError(NOTES_REQUIRE_PERSON_MESSAGE, 400);
    if (!date || !assignedPersonId) return jsonError("Ngày và người thực hiện là bắt buộc", 400);
    if (!unitId) return jsonError("Thiếu bộ phận của bảng phân công", 400);
    const d = parseDayStart(String(date));
    if (!d) return jsonError("Ngày phân công không hợp lệ", 400);
    if (noteText && noteText.length > MAX_NOTES_LENGTH) {
      return jsonError(`Ghi chú tối đa ${MAX_NOTES_LENGTH} ký tự`, 400);
    }

    const resolved = await resolveUnitId(user, String(unitId));
    if (!resolved.ok) return jsonError(resolved.error, resolved.status);
    const targetUnitId = resolved.unitId;

    const person = await prisma.person.findUnique({ where: { id: assignedPersonId }, select: { id: true, status: true } });
    if (!person || person.status !== "ACTIVE") return jsonError("Cán bộ không tồn tại hoặc đã ngừng hoạt động", 400);

    // ---- Trường hợp 1: phân công theo biểu mẫu (có positionId) ----
    if (positionId) {
      const position = await prisma.dutyPosition.findUnique({ where: { id: positionId } });
      if (!position) return jsonError("Vị trí/nhiệm vụ không tồn tại", 400);
      if (position.unitId !== targetUnitId) {
        return jsonError("Vị trí không thuộc danh mục của bộ phận đang phân công", 400);
      }
      if (position.status !== "ACTIVE") return jsonError("Vị trí/nhiệm vụ đã ngừng sử dụng — không phân công mới", 400);
      const slots = parseSlots(position.slots);
      const idx = Number(slotOrder);
      // Cho phép thêm người ngoài số ô danh mục, tối đa 12 dòng bổ sung/vị trí/ngày.
      if (!Number.isInteger(idx) || idx < 0 || idx >= slots.length + MAX_EXTRA_SLOTS_PER_POSITION) {
        return jsonError(
          `Ô phân công không hợp lệ (vị trí có ${slots.length} ô, chỉ được thêm tối đa ${MAX_EXTRA_SLOTS_PER_POSITION} ô bổ sung)`,
          400
        );
      }
      const slot = slots[idx] ?? null;
      const slotKey = slotKeyOf(position.id, idx);

      const dup = await prisma.dutyRoster.findFirst({ where: { unitId: targetUnitId, date: d, slotKey } });
      if (dup) {
        return jsonError("Ô này đã có người — hãy đổi người thay vì phân công thêm", 409);
      }

      const created = await prisma.dutyRoster.create({
        data: {
          date: d,
          shift: "CA_NGAY",
          personId: assignedPersonId,
          unitId: targetUnitId,
          notes: noteText,
          reason: reason?.trim() || null,
          positionId: position.id,
          positionTitle: position.title,
          positionDetail: position.detail,
          positionOrder: position.sortOrder,
          slotLabel: slot?.l ?? null,
          slotOrder: idx,
          slotKey,
          createdById: user.personId,
        },
        include: {
          person: { select: { id: true, fullName: true } },
          unit: { select: { id: true, name: true, code: true } },
        },
      });

      const clash = await leaveClashOf(assignedPersonId, d);
      const cross = await crossCountOf(assignedPersonId, d, targetUnitId, isNoonDutyTitle(position.title));
      await recordAuditEvent({
        actorId: user.id,
        action: "ROSTER_CREATE",
        resourceType: "DutyRoster",
        resourceId: created.id,
        newData: {
          date: d.toISOString().slice(0, 10),
          unitId: targetUnitId,
          personId: assignedPersonId,
          positionId: position.id,
          positionCode: position.code,
          slotLabel: slot?.l ?? undefined,
          slotOrder: idx,
          reason: reason?.trim() || undefined,
          notes: noteText ?? undefined,
        },
      });
      return NextResponse.json(
        {
          success: true,
          data: { ...created, leaveClash: clash, overlapCount: cross.board, overlapOutsideCount: cross.outside },
          warning: clash ? "Người này có đơn nghỉ đã duyệt trùng ngày — kiểm tra lại phân công!" : undefined,
          crossWarning:
            cross.outside > 0
              ? `Cán bộ còn ${cross.outside} phân công cùng nhóm trực trong cùng ngày (ngoài bảng này) — kiểm tra trùng.`
              : undefined,
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
        personId: assignedPersonId,
        unitId: targetUnitId,
        notes: noteText,
        createdById: user.personId,
      },
      include: {
        person: { select: { id: true, fullName: true } },
        unit: { select: { id: true, name: true, code: true } },
      },
    });
    const clash = await leaveClashOf(assignedPersonId, d);
    const cross = await crossCountOf(assignedPersonId, d, targetUnitId, false);
    await recordAuditEvent({
      actorId: user.id,
      action: "ROSTER_CREATE",
      resourceType: "DutyRoster",
      resourceId: created.id,
      newData: { personId: assignedPersonId, date: d.toISOString().slice(0, 10), unitId: targetUnitId, shift, post: post || undefined, notes: noteText ?? undefined },
    });
    return NextResponse.json(
      {
        success: true,
        data: { ...created, leaveClash: clash, overlapCount: cross.board, overlapOutsideCount: cross.outside },
        warning: clash ? "Người này có đơn nghỉ đã duyệt trùng ngày — kiểm tra lại phân công!" : undefined,
        crossWarning:
          cross.outside > 0
            ? `Cán bộ còn ${cross.outside} phân công cùng nhóm trực trong cùng ngày (ngoài bảng này) — kiểm tra trùng.`
            : undefined,
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
 * Lưu ý Phương án B: đổi người KHÔNG đổi bộ phận của bảng (bảng thuộc bộ phận nào giữ nguyên).
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

    // Phạm vi: bảng thuộc bộ phận nào thì phải có quyền với bộ phận đó.
    // Bản ghi cũ không gắn bộ phận (unitId null): chỉ Lãnh đạo đơn vị được thao tác.
    if (current.unitId) {
      const resolved = await resolveUnitId(user, current.unitId);
      if (!resolved.ok) return jsonError("Bạn không có quyền sửa phân công của bộ phận này", 403);
    } else if (user.role !== "UNIT_LEADER") {
      return jsonError("Bạn không có quyền sửa dữ liệu lịch trực cũ chưa gắn bộ phận", 403);
    }

    const data: any = {};
    // E13 / A0: không bao giờ lưu ghi chú cho dòng không có người thực hiện (chặn cả dữ liệu bất thường).
    if (notes !== undefined && !hasAssignedPerson(current.personId)) {
      return jsonError(NOTES_REQUIRE_PERSON_MESSAGE, 400);
    }
    const auditOld: any = { personId: current.personId, unitId: current.unitId, notes: current.notes };
    const auditNew: any = {};

    if (notes !== undefined) {
      const nextNotes = normalizeNotes(notes);
      if (nextNotes && nextNotes.length > MAX_NOTES_LENGTH) {
        return jsonError(`Ghi chú tối đa ${MAX_NOTES_LENGTH} ký tự`, 400);
      }
      // Chỉ ghi audit khi giá trị thực sự thay đổi (old → new).
      if (nextNotes !== current.notes) {
        data.notes = nextNotes;
        auditNew.notes = nextNotes;
      }
    }

    let crossWarning: string | undefined;
    if (personId && personId !== current.personId) {
      const trimmedReason = String(reason || "").trim();
      if (trimmedReason.length < 3) {
        return jsonError("Đổi người thực hiện phải ghi lý do (tối thiểu 3 ký tự)", 400);
      }
      const person = await prisma.person.findUnique({ where: { id: personId }, select: { id: true, status: true } });
      if (!person || person.status !== "ACTIVE") return jsonError("Cán bộ không tồn tại hoặc đã ngừng hoạt động", 400);
      data.personId = personId;
      data.reason = trimmedReason;
      auditNew.personId = personId;
      auditNew.reason = trimmedReason;
      // Cảnh báo mềm nếu người mới thuộc bộ phận khác bảng (phân công chéo — chỉ cảnh báo, không chặn)
      if (current.unitId) {
        const newUnit = await primaryUnitOf(personId);
        if (newUnit && newUnit !== current.unitId) {
          crossWarning = "Cán bộ được điều động từ bộ phận khác — phân công chéo, kiểm tra thống nhất trước khi lưu.";
        }
      }
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
      crossWarning,
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
    if (current.unitId) {
      const resolved = await resolveUnitId(user, current.unitId);
      if (!resolved.ok) return jsonError("Bạn không có quyền gỡ phân công của bộ phận này", 403);
    } else if (user.role !== "UNIT_LEADER") {
      return jsonError("Bạn không có quyền gỡ dữ liệu lịch trực cũ chưa gắn bộ phận", 403);
    }
    await prisma.dutyRoster.delete({ where: { id } });
    await recordAuditEvent({
      actorId: user.id,
      action: "ROSTER_DELETE",
      resourceType: "DutyRoster",
      resourceId: id,
      oldData: {
        personId: current.personId,
        date: current.date,
        unitId: current.unitId,
        positionId: current.positionId,
        positionTitle: current.positionTitle,
        slotLabel: current.slotLabel,
        notes: current.notes,
        reason: current.reason,
      },
      newData: reason.trim() ? { reason: reason.trim() } : undefined,
    });
    return NextResponse.json({ success: true, message: "Đã gỡ phân công." });
  } catch (error: any) {
    return jsonError("Lỗi khi gỡ phân công: " + error.message, 500);
  }
}
