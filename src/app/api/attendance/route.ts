import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { getAuthorizedUnitIds, jsonError } from "@/server/guard";

const SYMBOLS = new Set(["X", "1/2", "P", "KP", "CT", "OFF"]);

function isoDate(value: Date | string) {
  return new Date(value).toISOString().slice(0, 10);
}

function startOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1, 1));
}

function endOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
}

async function resolveUnitId(user: any, requested?: string | null) {
  const authorized = await getAuthorizedUnitIds(user);
  const unitId = requested || user.unitId || (authorized === "ALL" ? "" : authorized[0]);
  if (!unitId) return { error: "Chưa xác định đơn vị chấm công", unitId: null, authorized };
  if (authorized !== "ALL" && !authorized.includes(unitId)) {
    return { error: "Bạn không có quyền chấm công cho đơn vị này", unitId: null, authorized };
  }
  return { error: null, unitId, authorized };
}

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);

    const { searchParams } = new URL(req.url);
    const now = new Date();
    const month = Number(searchParams.get("month") || now.getMonth() + 1);
    const year = Number(searchParams.get("year") || now.getFullYear());
    if (month < 1 || month > 12 || year < 2000 || year > 2100) {
      return jsonError("Tháng/năm không hợp lệ", 400);
    }

    const resolved = await resolveUnitId(user, searchParams.get("unitId"));
    if (!resolved.unitId) return jsonError(resolved.error || "Không xác định được đơn vị", 403);

    const [unit, people, sheet] = await Promise.all([
      prisma.orgUnit.findUnique({ where: { id: resolved.unitId }, select: { id: true, name: true, code: true } }),
      prisma.person.findMany({
        where: {
          status: "ACTIVE",
          assignments: { some: { unitId: resolved.unitId } },
        },
        select: {
          id: true,
          code: true,
          fullName: true,
          assignments: {
            where: { unitId: resolved.unitId },
            select: { position: { select: { title: true } } },
          },
        },
        orderBy: { fullName: "asc" },
      }),
      prisma.attendanceSheet.findUnique({
        where: { unitId_month_year: { unitId: resolved.unitId, month, year } },
      }),
    ]);

    const [entries, grades, handovers] = sheet
      ? await Promise.all([
          prisma.attendanceEntry.findMany({
            where: { sheetId: sheet.id },
            select: { id: true, personId: true, date: true, symbol: true, note: true },
          }),
          prisma.attendanceGrade.findMany({
            where: { sheetId: sheet.id },
            select: { personId: true, grade: true, reason: true },
          }),
          prisma.attendanceHandover.findMany({
            where: {
              unitId: resolved.unitId,
              date: { gte: startOfMonth(year, month), lte: endOfMonth(year, month) },
            },
            orderBy: { date: "asc" },
          }),
        ])
      : [[], [], []];

    return NextResponse.json({
      success: true,
      unit: unit || { id: resolved.unitId, name: "Đơn vị", code: "" },
      month,
      year,
      sheet,
      people: people.map((p) => ({
        id: p.id,
        code: p.code,
        fullName: p.fullName,
        positionTitle: p.assignments[0]?.position?.title || "",
      })),
      entries: entries.map((e) => ({ ...e, date: isoDate(e.date) })),
      grades,
      handovers: handovers.map((h) => ({ ...h, date: isoDate(h.date) })),
      canEdit: user.role === "UNIT_LEADER" || user.role === "DEPARTMENT_LEADER",
    });
  } catch (error: any) {
    return jsonError("Lỗi khi tải bảng chấm công: " + error.message, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (user.role !== "UNIT_LEADER" && user.role !== "DEPARTMENT_LEADER") {
      return jsonError("Chỉ lãnh đạo/trưởng bộ phận được chấm công", 403);
    }

    const body = await req.json();
    const action = String(body.action || "");
    const month = Number(body.month);
    const year = Number(body.year);
    if (month < 1 || month > 12 || year < 2000 || year > 2100) {
      return jsonError("Tháng/năm không hợp lệ", 400);
    }

    const resolved = await resolveUnitId(user, body.unitId);
    if (!resolved.unitId) return jsonError(resolved.error || "Không xác định được đơn vị", 403);
    const unitId = resolved.unitId;

    const sheet = await prisma.attendanceSheet.upsert({
      where: { unitId_month_year: { unitId, month, year } },
      update: {},
      create: { unitId, month, year, createdById: user.personId },
    });

    if (action === "mark") {
      const personId = String(body.personId || "");
      const dateStr = String(body.date || "");
      const symbol = String(body.symbol || "");
      if (!personId || !dateStr) return jsonError("Thiếu cán bộ hoặc ngày chấm công", 400);
      if (symbol && !SYMBOLS.has(symbol)) return jsonError("Ký hiệu chấm công không hợp lệ", 400);

      const person = await prisma.person.findFirst({
        where: { id: personId, assignments: { some: { unitId } } },
        select: { id: true },
      });
      if (!person) return jsonError("Cán bộ không thuộc đơn vị chấm công", 403);

      const date = new Date(`${dateStr}T00:00:00.000Z`);
      if (Number.isNaN(date.getTime())) return jsonError("Ngày không hợp lệ", 400);

      if (!symbol) {
        await prisma.attendanceEntry.deleteMany({
          where: { sheetId: sheet.id, personId, date },
        });
        return NextResponse.json({ success: true, deleted: true });
      }

      const entry = await prisma.attendanceEntry.upsert({
        where: { sheetId_personId_date: { sheetId: sheet.id, personId, date } },
        update: { symbol, note: body.note ? String(body.note) : null, markedById: user.personId },
        create: {
          sheetId: sheet.id,
          personId,
          date,
          symbol,
          note: body.note ? String(body.note) : null,
          markedById: user.personId,
        },
      });
      return NextResponse.json({ success: true, entry: { ...entry, date: isoDate(entry.date) } });
    }

    if (action === "grade") {
      const personId = String(body.personId || "");
      const grade = String(body.grade || "");
      if (!personId || !["A", "B", "C", ""].includes(grade)) {
        return jsonError("Xếp loại không hợp lệ", 400);
      }
      if (!grade) {
        await prisma.attendanceGrade.deleteMany({ where: { sheetId: sheet.id, personId } });
        return NextResponse.json({ success: true, deleted: true });
      }
      const row = await prisma.attendanceGrade.upsert({
        where: { sheetId_personId: { sheetId: sheet.id, personId } },
        update: { grade, reason: body.reason ? String(body.reason) : null, updatedById: user.personId },
        create: {
          sheetId: sheet.id,
          personId,
          grade,
          reason: body.reason ? String(body.reason) : null,
          updatedById: user.personId,
        },
      });
      return NextResponse.json({ success: true, grade: row });
    }

    if (action === "handover") {
      const dateStr = String(body.date || "");
      const fromPersonId = String(body.fromPersonId || "");
      const toPersonId = String(body.toPersonId || "");
      if (!dateStr || !fromPersonId || !toPersonId) {
        return jsonError("Thiếu ngày hoặc người bàn giao/nhận bàn giao", 400);
      }
      const date = new Date(`${dateStr}T00:00:00.000Z`);
      if (Number.isNaN(date.getTime())) return jsonError("Ngày không hợp lệ", 400);

      const people = await prisma.person.findMany({
        where: { id: { in: [fromPersonId, toPersonId] }, assignments: { some: { unitId } } },
        select: { id: true },
      });
      if (people.length !== 2) return jsonError("Người bàn giao/nhận không thuộc đơn vị", 403);

      const row = await prisma.attendanceHandover.upsert({
        where: { unitId_date: { unitId, date } },
        update: {
          fromPersonId,
          toPersonId,
          note: body.note ? String(body.note) : null,
          createdById: user.personId,
        },
        create: {
          unitId,
          date,
          fromPersonId,
          toPersonId,
          note: body.note ? String(body.note) : null,
          createdById: user.personId,
        },
      });
      return NextResponse.json({ success: true, handover: { ...row, date: isoDate(row.date) } });
    }

    return jsonError("Thao tác không hợp lệ", 400);
  } catch (error: any) {
    return jsonError("Lỗi khi lưu chấm công: " + error.message, 500);
  }
}
