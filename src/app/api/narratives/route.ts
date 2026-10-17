import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";
import { isMetricsAdmin, resolveEntryPerms } from "@/server/metrics";

const PERIOD_TYPES = ["WEEK", "MONTH", "QUARTER", "YEAR"];

function isValidPeriodKey(periodType: string, key: string): boolean {
  if (periodType === "WEEK") return /^\d{4}-W\d{2}$/.test(key);
  if (periodType === "MONTH") return /^\d{4}-\d{2}$/.test(key);
  if (periodType === "QUARTER") return /^\d{4}-Q[1-4]$/.test(key);
  if (periodType === "YEAR") return /^\d{4}$/.test(key);
  return false;
}

// ============================================================
// GET /api/narratives?periodType=WEEK&periodKey=2026-W42
//   -> các mục nhận xét + nội dung của kỳ + quyền sửa của người dùng
// ============================================================

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);

    const { searchParams } = new URL(req.url);
    const periodType = searchParams.get("periodType") || "WEEK";
    const periodKey = searchParams.get("periodKey") || "";
    if (!PERIOD_TYPES.includes(periodType) || !isValidPeriodKey(periodType, periodKey))
      return jsonError("Kỳ không hợp lệ", 400);

    const [sections, narratives, groups] = await Promise.all([
      prisma.narrativeSection.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] }),
      prisma.briefingNarrative.findMany({ where: { periodType, periodKey } }),
      prisma.metricGroup.findMany({ select: { id: true, name: true } }),
    ]);
    const groupName = new Map(groups.map((g) => [g.id, g.name]));

    const perms = await resolveEntryPerms(user);
    const admin = isMetricsAdmin(user);

    // Quyền sửa: lãnh đạo/quản trị; hoặc được phân công nhập theo nhóm gắn với mục
    const canEditForGroup = (groupId: string | null) => {
      if (admin) return true;
      if (!groupId) return false;
      for (const a of perms.assignments) {
        if (a.groupId === groupId && a.canEnter) return true;
      }
      return false;
    };

    const narrativeBySection = new Map(narratives.map((n) => [n.sectionId, n]));
    const updaterIds = Array.from(new Set(narratives.map((n) => n.updatedById).filter(Boolean))) as string[];
    const persons = updaterIds.length
      ? await prisma.person.findMany({ where: { id: { in: updaterIds } }, select: { id: true, fullName: true } })
      : [];
    const nameById = new Map(persons.map((p) => [p.id, p.fullName]));

    return NextResponse.json({
      success: true,
      periodType,
      periodKey,
      sections: sections.map((s) => {
        const n = narrativeBySection.get(s.id);
        return {
          id: s.id,
          code: s.code,
          title: s.title,
          groupId: s.groupId,
          groupName: s.groupId ? groupName.get(s.groupId) || null : null,
          content: n?.content || "",
          updatedByName: n?.updatedById ? nameById.get(n.updatedById) || null : null,
          updatedAt: n?.updatedAt ? n.updatedAt.toISOString() : null,
          canEdit: canEditForGroup(s.groupId),
        };
      }),
    });
  } catch (error: any) {
    console.error("GET /api/narratives error:", error);
    return jsonError("Lỗi hệ thống khi tải nhận xét", 500);
  }
}

// ============================================================
// PUT /api/narratives — lưu nội dung: { sectionId, periodType, periodKey, content }
// ============================================================

export async function PUT(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);

    const body = await req.json().catch(() => null);
    const sectionId = body?.sectionId ? String(body.sectionId) : null;
    const periodType = body?.periodType ? String(body.periodType) : null;
    const periodKey = body?.periodKey ? String(body.periodKey) : null;
    const content = typeof body?.content === "string" ? body.content.slice(0, 20000) : null;
    if (!sectionId || !periodType || !periodKey || content === null)
      return jsonError("Thiếu thông tin nội dung", 400);
    if (!PERIOD_TYPES.includes(periodType) || !isValidPeriodKey(periodType, periodKey))
      return jsonError("Kỳ không hợp lệ", 400);

    const section = await prisma.narrativeSection.findUnique({ where: { id: sectionId } });
    if (!section || !section.active) return jsonError("Mục nhận xét không tồn tại", 404);

    const admin = isMetricsAdmin(user);
    if (!admin) {
      const perms = await resolveEntryPerms(user);
      let allowed = false;
      if (section.groupId) {
        for (const a of perms.assignments) {
          if (a.groupId === section.groupId && a.canEnter) allowed = true;
        }
      }
      if (!allowed)
        return jsonError("Chỉ lãnh đạo hoặc người được phân công nhập cho mục này mới sửa được", 403);
    }

    const existing = await prisma.briefingNarrative.findUnique({
      where: { sectionId_periodType_periodKey: { sectionId, periodType, periodKey } },
    });

    if (existing) {
      await prisma.briefingNarrative.update({
        where: { id: existing.id },
        data: { content, updatedById: user.personId },
      });
    } else {
      await prisma.briefingNarrative.create({
        data: { sectionId, periodType, periodKey, content, updatedById: user.personId },
      });
    }

    await recordAuditEvent({
      actorId: user.id,
      action: "NARRATIVE_SAVED",
      resourceType: "Narrative",
      resourceId: sectionId,
      newData: { periodType, periodKey, length: content.length },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("PUT /api/narratives error:", error);
    return jsonError("Lỗi hệ thống khi lưu nhận xét", 500);
  }
}
