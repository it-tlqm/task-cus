import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";
import { resolveDutyUnitId } from "@/server/duty-scope";

/**
 * YC-24 PHƯƠNG ÁN B — Thông tin tổng hợp ngày định danh theo (BỘ PHẬN + NGÀY).
 * Số liệu (Tổng số công chức/Có mặt/Vắng/Lý do) nhập TAY theo biểu — hệ thống không tự tính.
 */

function parseDayStart(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function optionalInt(v: unknown): { present: boolean; ok: boolean; value: number | null } {
  // Không gửi trường → giữ nguyên giá trị cũ
  if (v === undefined) return { present: false, ok: true, value: null };
  // Gửi rỗng/null → xóa giá trị
  if (v === null || v === "") return { present: true, ok: true, value: null };
  const n = Number(v);
  if (!Number.isFinite(n)) return { present: true, ok: false, value: null };
  const i = Math.trunc(n);
  if (i < 0 || i > 9999) return { present: true, ok: false, value: null };
  return { present: true, ok: true, value: i };
}

/**
 * GET /api/rosters/day-info?from&to[&unitId=...] — thông tin tổng hợp ngày CỦA MỘT BỘ PHẬN.
 * unitId bắt buộc theo ngữ cảnh; nếu thiếu, backend mặc định bộ phận trong phạm vi (1 bộ phận) hoặc bộ phận chính.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (user.role === "SYSTEM_ADMIN") return jsonError("Quản trị kỹ thuật không có quyền xem dữ liệu nghiệp vụ", 403);
    const { searchParams } = new URL(req.url);
    const from = parseDayStart(searchParams.get("from"));
    const to = parseDayStart(searchParams.get("to"));
    if (!from || !to) return jsonError("Thiếu khoảng ngày (from/to)", 400);
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);

    const resolved = await resolveDutyUnitId(user, searchParams.get("unitId") || null);
    if (!resolved.ok) return jsonError(resolved.error, resolved.status);

    const rows = await prisma.dutyDayInfo.findMany({
      where: { unitId: resolved.unitId, date: { gte: from, lte: end } },
      orderBy: { date: "asc" },
    });
    return NextResponse.json({ success: true, data: rows, selectedUnitId: resolved.unitId });
  } catch (error: any) {
    return jsonError("Lỗi khi tải thông tin ngày: " + error.message, 500);
  }
}

/**
 * PUT /api/rosters/day-info — lãnh đạo lưu thông tin tổng hợp của MỘT BỘ PHẬN trong một ngày.
 * Body: { unitId, date, totalStaff?, presentStaff?, absentCount?, absentReason?, notes? }
 */
export async function PUT(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    const canAssign = user.role === "UNIT_LEADER" || user.role === "DEPARTMENT_LEADER";
    if (!canAssign) return jsonError("Chỉ lãnh đạo mới được sửa thông tin tổng hợp ngày", 403);

    const body = await req.json();
    const date = parseDayStart(body?.date ? String(body.date) : null);
    if (!date) return jsonError("Ngày không hợp lệ", 400);
    if (!body?.unitId) return jsonError("Thiếu bộ phận của bảng phân công", 400);

    const resolved = await resolveDutyUnitId(user, String(body.unitId));
    if (!resolved.ok) return jsonError(resolved.error, resolved.status);
    const unitId = resolved.unitId;

    const totalStaff = optionalInt(body?.totalStaff);
    const presentStaff = optionalInt(body?.presentStaff);
    const absentCount = optionalInt(body?.absentCount);
    if (!totalStaff.ok || !presentStaff.ok || !absentCount.ok) {
      return jsonError("Số liệu phải là số nguyên từ 0 đến 9999", 400);
    }
    const absentReason = body?.absentReason !== undefined ? String(body.absentReason).trim() || null : undefined;
    const notes = body?.notes !== undefined ? String(body.notes).trim() || null : undefined;

    // Khóa nghiệp vụ: (bộ phận, ngày) — mỗi bộ phận có bảng tổng hợp riêng cho cùng ngày.
    const existing = await prisma.dutyDayInfo.findFirst({ where: { unitId, date } });
    const data: any = {};
    if (totalStaff.present) data.totalStaff = totalStaff.value;
    if (presentStaff.present) data.presentStaff = presentStaff.value;
    if (absentCount.present) data.absentCount = absentCount.value;
    if (absentReason !== undefined) data.absentReason = absentReason;
    if (notes !== undefined) data.notes = notes;

    const saved = existing
      ? await prisma.dutyDayInfo.update({ where: { id: existing.id }, data: { ...data, updatedById: user.personId } })
      : await prisma.dutyDayInfo.create({
          data: { date, unitId, ...data, createdById: user.personId, updatedById: user.personId },
        });

    await recordAuditEvent({
      actorId: user.id,
      action: "ROSTER_DAY_INFO_UPSERT",
      resourceType: "DutyDayInfo",
      resourceId: saved.id,
      oldData: existing
        ? {
            unitId,
            totalStaff: existing.totalStaff,
            presentStaff: existing.presentStaff,
            absentCount: existing.absentCount,
            absentReason: existing.absentReason,
            notes: existing.notes,
          }
        : undefined,
      newData: { unitId, date: date.toISOString().slice(0, 10), ...data },
    });
    return NextResponse.json({ success: true, data: saved });
  } catch (error: any) {
    return jsonError("Lỗi khi lưu thông tin ngày: " + error.message, 500);
  }
}
