import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";
import {
  isMetricsAdmin,
  parseDerivation,
  parseNumberInput,
  dateOnlyFromStr,
  dateOnlyToStr,
  todayVnDateOnly,
  defaultUnitLabel,
} from "@/server/metrics";

const D = Prisma.Decimal;

const VALUE_KINDS = ["FLOW", "BALANCE", "DERIVED"];
const UNIT_TYPES = ["VND", "USD", "COUNT"];
const PERIOD_TYPES = ["YEAR", "QUARTER", "MONTH"];
const CUM_KINDS = ["MONTH", "QUARTER", "YEAR", "LEDGER"];
// B-C-1: loại đối chiếu phải được cấu hình tường minh, không dò chuỗi nhãn.
const COMPARISON_KINDS = ["NONE", "BTC_YEAR", "UBND_YEAR", "MONTH_PLAN"];
const DATA_SOURCES = ["REAL", "DEMO"];

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function intOf(v: unknown, def: number | null = null): number | null {
  if (v === null || v === undefined || v === "") return def;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : def;
}

function boolOf(v: unknown, def = false): boolean {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return def;
}

// ============================================================
// GET — toàn bộ cấu hình (kể cả mục đã ẩn) cho trang Cấu hình
// ============================================================

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (!isMetricsAdmin(user)) return jsonError("Chỉ lãnh đạo/quản trị được xem cấu hình số liệu", 403);

    // ---- Lịch sử chỉ tiêu giao / mốc lũy kế (YC-02) ----
    const { searchParams } = new URL(req.url);
    const historyType = searchParams.get("historyType");
    const historyId = searchParams.get("historyId");
    if (historyType && historyId) {
      if (historyType === "target") {
        const revisions = await prisma.metricPlanTargetRevision.findMany({
          where: { targetId: historyId },
          orderBy: { editedAt: "desc" },
          take: 100,
        });
        const ids = Array.from(new Set(revisions.map((r) => r.editedById)));
        const people = ids.length
          ? await prisma.person.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } })
          : [];
        const names = new Map(people.map((p) => [p.id, p.fullName]));
        return NextResponse.json({
          success: true,
          historyType,
          revisions: revisions.map((r) => ({
            id: r.id,
            action: r.action,
            oldValue: r.oldValue === null ? null : Number(r.oldValue),
            newValue: r.newValue === null ? null : Number(r.newValue),
            oldStatus: r.oldStatus,
            newStatus: r.newStatus,
            oldSourceNote: r.oldSourceNote,
            newSourceNote: r.newSourceNote,
            reason: r.reason,
            editedByName: names.get(r.editedById) || null,
            editedAt: r.editedAt.toISOString(),
          })),
        });
      }
      if (historyType === "baseline") {
        const revisions = await prisma.metricBaselineRevision.findMany({
          where: { baselineId: historyId },
          orderBy: { editedAt: "desc" },
          take: 100,
        });
        const ids = Array.from(new Set(revisions.map((r) => r.editedById)));
        const people = ids.length
          ? await prisma.person.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } })
          : [];
        const names = new Map(people.map((p) => [p.id, p.fullName]));
        return NextResponse.json({
          success: true,
          historyType,
          revisions: revisions.map((r) => ({
            id: r.id,
            action: r.action,
            oldValue: r.oldValue === null ? null : Number(r.oldValue),
            newValue: r.newValue === null ? null : Number(r.newValue),
            oldStatus: r.oldStatus,
            newStatus: r.newStatus,
            oldSourceNote: r.oldSourceNote,
            newSourceNote: r.newSourceNote,
            reason: r.reason,
            editedByName: names.get(r.editedById) || null,
            editedAt: r.editedAt.toISOString(),
          })),
        });
      }
      return jsonError("Loại lịch sử không hợp lệ", 400);
    }

    const groups = await prisma.metricGroup.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
    const metrics = await prisma.metricDefinition.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    const metricIds = metrics.map((m) => m.id);

    const [classifications, targets, baselines, assignments, sections, people, reportBlocks] = await Promise.all([
      prisma.metricClassification.findMany({ orderBy: [{ sortOrder: "asc" }, { label: "asc" }] }),
      prisma.metricPlanTarget.findMany({ where: { metricId: { in: metricIds } } }),
      prisma.metricBaseline.findMany({ where: { metricId: { in: metricIds } } }),
      prisma.metricEntryAssignment.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.narrativeSection.findMany({ orderBy: [{ sortOrder: "asc" }, { title: "asc" }] }),
      prisma.person.findMany({
        where: { status: "ACTIVE" },
        select: {
          id: true,
          code: true,
          fullName: true,
          account: { select: { status: true } },
          assignments: {
            where: { isPrimary: true },
            select: { unit: { select: { code: true, name: true } } },
            take: 1,
          },
        },
        orderBy: { code: "asc" },
        take: 500,
      }),
      prisma.reportBlock.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    ]);

    const personIds = new Set<string>();
    for (const a of assignments) personIds.add(a.personId);
    for (const t of targets) {
      if (t.proposedById) personIds.add(t.proposedById);
      if (t.confirmedById) personIds.add(t.confirmedById);
      if (t.lockedById) personIds.add(t.lockedById);
      if (t.updatedById) personIds.add(t.updatedById);
    }
    for (const b of baselines) {
      if (b.proposedById) personIds.add(b.proposedById);
      if (b.confirmedById) personIds.add(b.confirmedById);
      if (b.lockedById) personIds.add(b.lockedById);
    }
    const extraPersons = personIds.size
      ? await prisma.person.findMany({
          where: { id: { in: Array.from(personIds) } },
          select: { id: true, fullName: true },
        })
      : [];
    const nameById = new Map<string, string>();
    for (const p of people) nameById.set(p.id, p.fullName);
    for (const p of extraPersons) nameById.set(p.id, p.fullName);

    const classByMetric = new Map<string, any[]>();
    for (const c of classifications) {
      const arr = classByMetric.get(c.metricId) || [];
      arr.push({ id: c.id, code: c.code, label: c.label, sortOrder: c.sortOrder, active: c.active });
      classByMetric.set(c.metricId, arr);
    }
    const targetsByMetric = new Map<string, any[]>();
    for (const t of targets) {
      const arr = targetsByMetric.get(t.metricId) || [];
      arr.push({
        id: t.id,
        metricId: t.metricId,
        classificationId: t.classificationId,
        label: t.label,
        periodType: t.periodType,
        year: t.year,
        periodNo: t.periodNo,
        valueBase: Number(t.valueNumeric),
        comparisonKind: t.comparisonKind,
        sourceNote: t.sourceNote,
        dataSource: t.dataSource,
        isOfficial: t.dataSource === "REAL",
        status: t.status,
        proposedByName: t.proposedById ? nameById.get(t.proposedById) || null : null,
        proposedAt: t.createdAt.toISOString(),
        confirmedByName: t.confirmedById ? nameById.get(t.confirmedById) || null : null,
        confirmedAt: t.confirmedAt ? t.confirmedAt.toISOString() : null,
        lockedByName: t.lockedById ? nameById.get(t.lockedById) || null : null,
        lockedAt: t.lockedAt ? t.lockedAt.toISOString() : null,
        updatedByName: t.updatedById ? nameById.get(t.updatedById) || null : null,
        note: t.note,
      });
      targetsByMetric.set(t.metricId, arr);
    }
    const baselinesByMetric = new Map<string, any[]>();
    for (const b of baselines) {
      const arr = baselinesByMetric.get(b.metricId) || [];
      arr.push({
        id: b.id,
        metricId: b.metricId,
        classificationId: b.classificationId,
        cumKind: b.cumKind,
        asOfDate: dateOnlyToStr(b.asOfDate),
        valueBase: Number(b.valueNumeric),
        sourceNote: b.sourceNote,
        dataSource: b.dataSource,
        isOfficial: b.dataSource === "REAL",
        status: b.status,
        proposedByName: b.proposedById ? nameById.get(b.proposedById) || null : null,
        proposedAt: b.createdAt.toISOString(),
        confirmedByName: b.confirmedById ? nameById.get(b.confirmedById) || null : null,
        confirmedAt: b.confirmedAt ? b.confirmedAt.toISOString() : null,
        lockedByName: b.lockedById ? nameById.get(b.lockedById) || null : null,
        lockedAt: b.lockedAt ? b.lockedAt.toISOString() : null,
      });
      baselinesByMetric.set(b.metricId, arr);
    }

    return NextResponse.json({
      success: true,
      groups: groups.map((g) => ({
        id: g.id,
        code: g.code,
        name: g.name,
        sortOrder: g.sortOrder,
        active: g.active,
        note: g.note,
        metrics: metrics
          .filter((m) => m.groupId === g.id)
          .map((m) => ({
            id: m.id,
            groupId: m.groupId,
            code: m.code,
            name: m.name,
            unitType: m.unitType,
            unitLabel: m.unitLabel,
            unitLabelEffective: defaultUnitLabel(m.unitType, m.displayScale, m.unitLabel),
            displayScale: m.displayScale,
            decimals: m.decimals,
            valueKind: m.valueKind,
            derivation: m.derivation ? parseDerivation(m.derivation) : null,
            requireConfirm: m.requireConfirm,
            showOnDashboard: m.showOnDashboard,
            dashboardOrder: m.dashboardOrder,
            allowBackdateDays: m.allowBackdateDays,
            expectDaily: m.expectDaily,
            active: m.active,
            note: m.note,
            sortOrder: m.sortOrder,
            classifications: classByMetric.get(m.id) || [],
            targets: targetsByMetric.get(m.id) || [],
            baselines: baselinesByMetric.get(m.id) || [],
          })),
      })),
      sections: sections.map((s) => ({
        id: s.id,
        code: s.code,
        title: s.title,
        groupId: s.groupId,
        sortOrder: s.sortOrder,
        active: s.active,
      })),
      reportBlocks: reportBlocks.map((b) => ({
        id: b.id,
        code: b.code,
        kind: b.kind,
        title: b.title,
        groupId: b.groupId,
        sectionId: b.sectionId,
        sortOrder: b.sortOrder,
        active: b.active,
        note: b.note,
      })),
      assignments: assignments.map((a) => ({
        id: a.id,
        personId: a.personId,
        personName: nameById.get(a.personId) || null,
        groupId: a.groupId,
        metricId: a.metricId,
        canEnter: a.canEnter,
        canConfirm: a.canConfirm,
        allowBackdateDays: a.allowBackdateDays,
        validFrom: a.validFrom ? dateOnlyToStr(a.validFrom) : null,
        validTo: a.validTo ? dateOnlyToStr(a.validTo) : null,
        active: a.active,
      })),
      people: people.map((p) => ({
        id: p.id,
        code: p.code,
        fullName: p.fullName,
        accountStatus: p.account?.status ?? null,
        unitName: p.assignments[0]?.unit?.name ?? null,
        unitCode: p.assignments[0]?.unit?.code ?? null,
      })),
      // Danh sách người thô cho các chỗ tra tên (không dùng cho UI chọn người)
      peopleRaw: people.map((p) => ({ id: p.id, code: p.code, fullName: p.fullName })),
      // Danh sách phẳng để UI chọn công thức / gán chỉ tiêu
      metricsFlat: metrics.map((m) => ({
        id: m.id,
        code: m.code,
        name: m.name,
        groupId: m.groupId,
        active: m.active,
        unitLabelEffective: defaultUnitLabel(m.unitType, m.displayScale, m.unitLabel),
        displayScale: m.displayScale,
      })),
    });
  } catch (error: any) {
    console.error("GET /api/metrics/admin error:", error);
    return jsonError("Lỗi hệ thống khi tải cấu hình số liệu", 500);
  }
}

// ============================================================
// POST — thao tác cấu hình: { entity, action, data }
// entity: group | metric | classification | target | baseline | assignment | section | report_block
// action: create | update | delete | confirm
// ============================================================

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (!isMetricsAdmin(user)) return jsonError("Chỉ lãnh đạo/quản trị được cấu hình số liệu", 403);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError("Dữ liệu không hợp lệ", 400);
    const entity = str(body.entity);
    const action = str(body.action);
    const data = body.data && typeof body.data === "object" ? body.data : {};
    if (!entity || !action) return jsonError("Thiếu thông tin thao tác", 400);

    const audit = (act: string, resourceId: string | null, newData?: any) =>
      recordAuditEvent({
        actorId: user.id,
        action: `METRIC_ADMIN_${act}`,
        resourceType: "MetricConfig",
        resourceId: resourceId || undefined,
        newData,
      });

    // ---------- NHÓM ----------
    if (entity === "group") {
      if (action === "create") {
        const code = str(data.code);
        const name = str(data.name);
        if (!code || !name) return jsonError("Thiếu mã hoặc tên nhóm", 400);
        const dup = await prisma.metricGroup.findUnique({ where: { code } });
        if (dup) return jsonError(`Mã nhóm "${code}" đã tồn tại`, 400);
        const g = await prisma.metricGroup.create({
          data: {
            code,
            name,
            sortOrder: intOf(data.sortOrder, 0) || 0,
            note: str(data.note),
          },
        });
        await audit("GROUP_CREATED", g.id, { code, name });
        return NextResponse.json({ success: true, id: g.id });
      }
      if (action === "update") {
        const id = str(data.id);
        if (!id) return jsonError("Thiếu id nhóm", 400);
        const g = await prisma.metricGroup.update({
          where: { id },
          data: {
            name: str(data.name) || undefined,
            sortOrder: data.sortOrder !== undefined ? intOf(data.sortOrder, 0) || 0 : undefined,
            active: data.active !== undefined ? boolOf(data.active, true) : undefined,
            note: data.note !== undefined ? str(data.note) : undefined,
          },
        });
        await audit("GROUP_UPDATED", id, { name: g.name, active: g.active });
        return NextResponse.json({ success: true });
      }
      if (action === "delete") {
        const id = str(data.id);
        if (!id) return jsonError("Thiếu id nhóm", 400);
        const count = await prisma.metricDefinition.count({ where: { groupId: id } });
        if (count > 0)
          return jsonError(`Nhóm còn ${count} chỉ tiêu — hãy chuyển chỉ tiêu sang nhóm khác hoặc ẩn nhóm thay vì xóa`, 400);
        await prisma.metricGroup.delete({ where: { id } });
        await audit("GROUP_DELETED", id);
        return NextResponse.json({ success: true });
      }
      return jsonError("Thao tác nhóm không hợp lệ", 400);
    }

    // ---------- CHỈ TIÊU ----------
    if (entity === "metric") {
      if (action === "create" || action === "update") {
        const name = str(data.name);
        const unitType = str(data.unitType) || "COUNT";
        const valueKind = str(data.valueKind) || "FLOW";
        if (!UNIT_TYPES.includes(unitType)) return jsonError("Đơn vị không hợp lệ", 400);
        if (!VALUE_KINDS.includes(valueKind)) return jsonError("Kiểu số liệu không hợp lệ", 400);

        let derivation: any = null;
        if (valueKind === "DERIVED") {
          const terms = Array.isArray(data.derivation?.terms) ? data.derivation.terms : [];
          const cleanTerms: { metricId: string; sign: number }[] = [];
          for (const t of terms) {
            const mid = str(t?.metricId);
            if (!mid) continue;
            cleanTerms.push({ metricId: mid, sign: t?.sign === -1 ? -1 : 1 });
          }
          derivation = { terms: cleanTerms, includeBaseline: boolOf(data.derivation?.includeBaseline, false) };
        }

        const base = {
          name: name || undefined,
          unitType,
          unitLabel: data.unitLabel !== undefined ? str(data.unitLabel) : undefined,
          displayScale: intOf(data.displayScale, 1) || 1,
          decimals: Math.max(0, Math.min(4, intOf(data.decimals, 0) || 0)),
          valueKind,
          derivation: valueKind === "DERIVED" ? (derivation as Prisma.InputJsonValue) : Prisma.JsonNull,
          requireConfirm: boolOf(data.requireConfirm, false),
          showOnDashboard: boolOf(data.showOnDashboard, false),
          dashboardOrder: intOf(data.dashboardOrder, 0) || 0,
          allowBackdateDays: intOf(data.allowBackdateDays, 0) || 0,
          expectDaily: boolOf(data.expectDaily, true),
          note: data.note !== undefined ? str(data.note) : undefined,
          sortOrder: intOf(data.sortOrder, 0) || 0,
          ...(data.active !== undefined ? { active: boolOf(data.active, true) } : {}),
        };

        if (action === "create") {
          const groupId = str(data.groupId);
          const code = str(data.code);
          if (!groupId || !code || !name) return jsonError("Thiếu nhóm, mã hoặc tên chỉ tiêu", 400);
          const grp = await prisma.metricGroup.findUnique({ where: { id: groupId } });
          if (!grp) return jsonError("Nhóm không tồn tại", 400);
          const dup = await prisma.metricDefinition.findUnique({ where: { code } });
          if (dup) return jsonError(`Mã chỉ tiêu "${code}" đã tồn tại`, 400);
          const m = await prisma.metricDefinition.create({ data: { ...base, groupId, code, name } });
          await audit("METRIC_CREATED", m.id, { code, name, valueKind });
          return NextResponse.json({ success: true, id: m.id });
        }

        const id = str(data.id);
        if (!id) return jsonError("Thiếu id chỉ tiêu", 400);
        if (valueKind === "DERIVED" && derivation?.terms?.some((t: any) => t.metricId === id))
          return jsonError("Công thức không được tham chiếu chính chỉ tiêu này", 400);
        const m = await prisma.metricDefinition.update({ where: { id }, data: base });
        await audit("METRIC_UPDATED", id, { name: m.name, valueKind });
        return NextResponse.json({ success: true });
      }
      if (action === "delete") {
        const id = str(data.id);
        if (!id) return jsonError("Thiếu id chỉ tiêu", 400);
        const entryCount = await prisma.metricDailyEntry.count({ where: { metricId: id } });
        if (entryCount > 0)
          return jsonError(
            `Chỉ tiêu đã có ${entryCount} bản ghi số liệu — không xóa được. Hãy chuyển sang trạng thái "Ẩn" để giữ lịch sử`,
            400
          );
        await prisma.metricDefinition.delete({ where: { id } });
        await audit("METRIC_DELETED", id);
        return NextResponse.json({ success: true });
      }
      return jsonError("Thao tác chỉ tiêu không hợp lệ", 400);
    }

    // ---------- PHÂN LOẠI (Ô tô / Than cốc / ...) ----------
    if (entity === "classification") {
      if (action === "create") {
        const metricId = str(data.metricId);
        const code = str(data.code);
        const label = str(data.label);
        if (!metricId || !code || !label) return jsonError("Thiếu chỉ tiêu, mã hoặc tên phân loại", 400);
        const dup = await prisma.metricClassification.findUnique({
          where: { metricId_code: { metricId, code } },
        });
        if (dup) return jsonError(`Mã phân loại "${code}" đã tồn tại`, 400);
        const c = await prisma.metricClassification.create({
          data: { metricId, code, label, sortOrder: intOf(data.sortOrder, 0) || 0 },
        });
        await audit("CLASSIFICATION_CREATED", c.id, { metricId, label });
        return NextResponse.json({ success: true, id: c.id });
      }
      if (action === "update") {
        const id = str(data.id);
        if (!id) return jsonError("Thiếu id phân loại", 400);
        await prisma.metricClassification.update({
          where: { id },
          data: {
            label: str(data.label) || undefined,
            sortOrder: data.sortOrder !== undefined ? intOf(data.sortOrder, 0) || 0 : undefined,
            active: data.active !== undefined ? boolOf(data.active, true) : undefined,
          },
        });
        await audit("CLASSIFICATION_UPDATED", id, { label: str(data.label) });
        return NextResponse.json({ success: true });
      }
      if (action === "delete") {
        const id = str(data.id);
        if (!id) return jsonError("Thiếu id phân loại", 400);
        const entryCount = await prisma.metricDailyEntry.count({ where: { classificationId: id } });
        if (entryCount > 0)
          return jsonError("Phân loại đã có số liệu — hãy ẩn thay vì xóa để giữ lịch sử", 400);
        await prisma.metricClassification.delete({ where: { id } });
        await audit("CLASSIFICATION_DELETED", id);
        return NextResponse.json({ success: true });
      }
      return jsonError("Thao tác phân loại không hợp lệ", 400);
    }

    // ---------- CHỈ TIÊU GIAO ----------
    if (entity === "target") {
      // Xóa chỉ cần id; các thao tác khác cần metricId để kiểm tra phạm vi.
      if (action === "delete") {
        const id = str(data.id);
        if (!id) return jsonError("Thiếu id chỉ tiêu giao", 400);
        const existing = await prisma.metricPlanTarget.findUnique({ where: { id } });
        if (!existing) return jsonError("Chỉ tiêu giao không tồn tại", 404);
        const metricIdOfTarget = str(data.metricId);
        if (metricIdOfTarget && existing.metricId !== metricIdOfTarget)
          return jsonError("Chỉ tiêu giao không tồn tại", 404);
        if (existing.status !== "PROPOSED")
          return jsonError("Chỉ xóa được chỉ tiêu giao chưa xác nhận; bản ghi đã xác nhận/chốt phải giữ lịch sử", 400);
        await prisma.$transaction(async (tx) => {
          await tx.metricPlanTargetRevision.create({
            data: {
              targetId: id,
              action: "DELETE",
              oldValue: existing.valueNumeric,
              oldStatus: existing.status,
              oldSourceNote: existing.sourceNote,
              reason: str(data.reason) || null,
              editedById: user.personId,
            },
          });
          await tx.metricPlanTarget.delete({ where: { id } });
        });
        await audit("TARGET_DELETED", id, {
          metricId: existing.metricId,
          label: existing.label,
          year: existing.year,
          valueBase: existing.valueNumeric.toString(),
        });
        return NextResponse.json({ success: true });
      }

      let metricId = str(data.metricId);
      // Confirm/lock có thể chỉ gửi id; suy ra metricId từ bản ghi để kiểm tra phạm vi.
      if (!metricId && (action === "confirm" || action === "lock")) {
        const id = str(data.id);
        if (id) {
          const found = await prisma.metricPlanTarget.findUnique({ where: { id } });
          metricId = found?.metricId || null;
        }
      }
      if (!metricId) return jsonError("Thiếu chỉ tiêu", 400);
      const metric = await prisma.metricDefinition.findUnique({ where: { id: metricId } });
      if (!metric) return jsonError("Chỉ tiêu không tồn tại", 400);

      if (action === "create" || action === "update") {
        const label = str(data.label);
        const periodType = str(data.periodType) || "YEAR";
        const year = intOf(data.year, null);
        if (!label || !year || !PERIOD_TYPES.includes(periodType))
          return jsonError("Thiếu tên chỉ tiêu giao, loại kỳ hoặc năm", 400);
        const periodNo = periodType === "YEAR" ? null : intOf(data.periodNo, null);
        if (periodType === "MONTH" && (!periodNo || periodNo < 1 || periodNo > 12))
          return jsonError("Tháng phải từ 1-12", 400);
        if (periodType === "QUARTER" && (!periodNo || periodNo < 1 || periodNo > 4))
          return jsonError("Quý phải từ 1-4", 400);
        const parsed = parseNumberInput(data.value);
        if (parsed === null) return jsonError("Giá trị chỉ tiêu không hợp lệ", 400);
        const valueBase = new D(parsed).mul(metric.displayScale || 1);
        const classificationId = str(data.classificationId) || "";
        const comparisonKind = (str(data.comparisonKind) || "NONE").toUpperCase();
        if (!COMPARISON_KINDS.includes(comparisonKind))
          return jsonError("Loại đối chiếu không hợp lệ", 400);
        if ((comparisonKind === "BTC_YEAR" || comparisonKind === "UBND_YEAR") && periodType !== "YEAR")
          return jsonError("Chỉ tiêu BTC/UBND phải là chỉ tiêu Năm", 400);
        if (comparisonKind === "MONTH_PLAN" && periodType !== "MONTH")
          return jsonError("Kế hoạch tháng HQTL phải là chỉ tiêu Tháng", 400);
        const note = str(data.note);
        const sourceNote = str(data.sourceNote);
        const dataSource = (str(data.dataSource) || "REAL").toUpperCase();
        if (!DATA_SOURCES.includes(dataSource))
          return jsonError("Nguồn dữ liệu phải là REAL hoặc DEMO", 400);

        if (action === "create") {
          const dup = await prisma.metricPlanTarget.findFirst({
            where: { metricId, classificationId, label, periodType, year, periodNo },
          });
          if (dup)
            return jsonError(
              `Đã có chỉ tiêu "${label}" cho ${periodType === "YEAR" ? year : `${periodType} ${periodNo}/${year}`} — sửa bản ghi cũ thay vì thêm mới`,
              400
            );
          if (comparisonKind !== "NONE") {
            const dupKind = await prisma.metricPlanTarget.findFirst({
              // Chỉ chặn trùng trong cùng nguồn dữ liệu; DEMO không chặn REAL.
              where: { metricId, classificationId, comparisonKind, year, periodNo, dataSource },
            });
            if (dupKind)
              return jsonError("Đã có chỉ tiêu giao cùng loại đối chiếu cho kỳ này — sửa bản ghi cũ", 400);
          }
          const t = await prisma.$transaction(async (tx) => {
            const created = await tx.metricPlanTarget.create({
              data: {
                metricId,
                classificationId,
                label,
                periodType,
                year,
                periodNo,
                valueNumeric: valueBase,
                comparisonKind,
                sourceNote,
                dataSource,
                note,
                status: "PROPOSED",
                proposedById: user.personId,
                updatedById: user.personId,
              },
            });
            await tx.metricPlanTargetRevision.create({
              data: {
                targetId: created.id,
                action: "CREATE",
                newValue: valueBase,
                newStatus: "PROPOSED",
                newSourceNote: sourceNote,
                reason: note,
                editedById: user.personId,
              },
            });
            return created;
          });
          await audit("TARGET_CREATED", t.id, {
            metricId,
            label,
            year,
            comparisonKind,
            dataSource,
            valueBase: valueBase.toString(),
            sourceNote,
          });
          return NextResponse.json({ success: true, id: t.id, status: "PROPOSED", dataSource, isOfficial: dataSource === "REAL" });
        }

        const id = str(data.id);
        if (!id) return jsonError("Thiếu id chỉ tiêu giao", 400);
        const existing = await prisma.metricPlanTarget.findUnique({ where: { id } });
        if (!existing || existing.metricId !== metricId)
          return jsonError("Chỉ tiêu giao không tồn tại", 404);
        if (existing.status === "LOCKED")
          return jsonError("Chỉ tiêu giao đã chốt — không sửa trực tiếp", 400);
        const dup = await prisma.metricPlanTarget.findFirst({
          where: {
            id: { not: id },
            metricId,
            classificationId,
            label,
            periodType,
            year,
            periodNo,
          },
        });
        if (dup)
          return jsonError("Đã có chỉ tiêu giao trùng tên/kỳ — kiểm tra lại", 400);
        if (comparisonKind !== "NONE") {
          const dupKind = await prisma.metricPlanTarget.findFirst({
            where: { id: { not: id }, metricId, classificationId, comparisonKind, year, periodNo, dataSource },
          });
          if (dupKind)
            return jsonError("Đã có chỉ tiêu giao cùng loại đối chiếu cho kỳ này — kiểm tra lại", 400);
        }

        await prisma.$transaction(async (tx) => {
          await tx.metricPlanTarget.update({
            where: { id },
            data: {
              label,
              periodType,
              year,
              periodNo,
              valueNumeric: valueBase,
              comparisonKind,
              sourceNote,
              dataSource,
              note,
              // Sửa số/căn cứ đã xác nhận phải xác nhận lại.
              status: "PROPOSED",
              confirmedById: null,
              confirmedAt: null,
              lockedById: null,
              lockedAt: null,
              updatedById: user.personId,
            },
          });
          await tx.metricPlanTargetRevision.create({
            data: {
              targetId: id,
              action: "UPDATE",
              oldValue: existing.valueNumeric,
              newValue: valueBase,
              oldStatus: existing.status,
              newStatus: "PROPOSED",
              oldSourceNote: existing.sourceNote,
              newSourceNote: sourceNote,
              reason: note,
              editedById: user.personId,
            },
          });
        });
        await audit("TARGET_UPDATED", id, {
          metricId,
          label,
          year,
          comparisonKind,
          dataSource,
          oldDataSource: existing.dataSource,
          oldValue: existing.valueNumeric.toString(),
          newValue: valueBase.toString(),
          oldStatus: existing.status,
          newStatus: "PROPOSED",
        });
        return NextResponse.json({ success: true, id, status: "PROPOSED", dataSource, isOfficial: dataSource === "REAL" });
      }

      if (action === "confirm" || action === "lock") {
        const id = str(data.id);
        if (!id) return jsonError("Thiếu id chỉ tiêu giao", 400);
        const existing = await prisma.metricPlanTarget.findUnique({ where: { id } });
        if (!existing || existing.metricId !== metricId)
          return jsonError("Chỉ tiêu giao không tồn tại", 404);
        if (action === "confirm") {
          if (existing.status === "LOCKED") return jsonError("Chỉ tiêu giao đã chốt", 400);
          const next = "CONFIRMED";
          await prisma.$transaction(async (tx) => {
            await tx.metricPlanTarget.update({
              where: { id },
              data: {
                status: next,
                confirmedById: user.personId,
                confirmedAt: new Date(),
                lockedById: null,
                lockedAt: null,
                updatedById: user.personId,
              },
            });
            await tx.metricPlanTargetRevision.create({
              data: {
                targetId: id,
                action: "CONFIRM",
                oldStatus: existing.status,
                newStatus: next,
                reason: str(data.reason) || null,
                editedById: user.personId,
              },
            });
          });
          await audit("TARGET_CONFIRMED", id, { metricId, oldStatus: existing.status, newStatus: next });
          return NextResponse.json({ success: true, status: next });
        }
        if (existing.status !== "CONFIRMED")
          return jsonError("Chỉ chốt được chỉ tiêu giao đã xác nhận", 400);
        const next = "LOCKED";
        await prisma.$transaction(async (tx) => {
          await tx.metricPlanTarget.update({
            where: { id },
            data: { status: next, lockedById: user.personId, lockedAt: new Date(), updatedById: user.personId },
          });
          await tx.metricPlanTargetRevision.create({
            data: {
              targetId: id,
              action: "LOCK",
              oldStatus: existing.status,
              newStatus: next,
              reason: str(data.reason) || null,
              editedById: user.personId,
            },
          });
        });
        await audit("TARGET_LOCKED", id, { metricId, oldStatus: existing.status, newStatus: next });
        return NextResponse.json({ success: true, status: next });
      }

      return jsonError("Thao tác chỉ tiêu giao không hợp lệ", 400);
    }

    // ---------- MỐC LŨY KẾ ----------
    if (entity === "baseline") {
      if (action === "create") {
        const metricId = str(data.metricId);
        const cumKind = str(data.cumKind) || "YEAR";
        const asOf = dateOnlyFromStr(str(data.asOfDate) || "");
        if (!metricId || !asOf || !CUM_KINDS.includes(cumKind))
          return jsonError("Thiếu chỉ tiêu, ngày mốc hoặc loại mốc", 400);
        const today = todayVnDateOnly();
        if (asOf.getTime() > today.getTime()) return jsonError("Ngày mốc không được ở tương lai", 400);
        const metric = await prisma.metricDefinition.findUnique({ where: { id: metricId } });
        if (!metric) return jsonError("Chỉ tiêu không tồn tại", 400);
        const parsed = parseNumberInput(data.value);
        if (parsed === null) return jsonError("Giá trị mốc không hợp lệ", 400);
        const valueBase = new D(parsed).mul(metric.displayScale || 1);
        const classificationId = str(data.classificationId) || "";
        const sourceNote = str(data.sourceNote);
        const dataSource = (str(data.dataSource) || "REAL").toUpperCase();
        if (!DATA_SOURCES.includes(dataSource))
          return jsonError("Nguồn dữ liệu phải là REAL hoặc DEMO", 400);
        const dup = await prisma.metricBaseline.findUnique({
          where: {
            metricId_classificationId_cumKind_asOfDate: { metricId, classificationId, cumKind, asOfDate: asOf },
          },
        });
        if (dup) return jsonError("Mốc này đã tồn tại — sửa mốc cũ thay vì tạo trùng", 400);
        const b = await prisma.$transaction(async (tx) => {
          const created = await tx.metricBaseline.create({
            data: {
              metricId,
              classificationId,
              cumKind,
              asOfDate: asOf,
              valueNumeric: valueBase,
              sourceNote,
              dataSource,
              status: "PROPOSED",
              proposedById: user.personId,
            },
          });
          await tx.metricBaselineRevision.create({
            data: {
              baselineId: created.id,
              action: "CREATE",
              newValue: valueBase,
              newStatus: "PROPOSED",
              newSourceNote: sourceNote,
              editedById: user.personId,
            },
          });
          return created;
        });
        await audit("BASELINE_PROPOSED", b.id, {
          metricId,
          cumKind,
          asOfDate: str(data.asOfDate),
          valueBase: valueBase.toString(),
          sourceNote,
          dataSource,
        });
        return NextResponse.json({ success: true, id: b.id, status: "PROPOSED", dataSource, isOfficial: dataSource === "REAL" });
      }

      if (action === "update") {
        const id = str(data.id);
        if (!id) return jsonError("Thiếu id mốc", 400);
        const existing = await prisma.metricBaseline.findUnique({ where: { id } });
        if (!existing) return jsonError("Mốc không tồn tại", 404);
        if (existing.status === "LOCKED") return jsonError("Mốc đã chốt — không sửa trực tiếp", 400);
        const metric = await prisma.metricDefinition.findUnique({ where: { id: existing.metricId } });
        if (!metric) return jsonError("Chỉ tiêu không tồn tại", 404);
        const parsed = parseNumberInput(data.value);
        if (parsed === null) return jsonError("Giá trị mốc không hợp lệ", 400);
        const valueBase = new D(parsed).mul(metric.displayScale || 1);
        const asOf = dateOnlyFromStr(str(data.asOfDate) || dateOnlyToStr(existing.asOfDate));
        if (!asOf) return jsonError("Ngày mốc không hợp lệ", 400);
        if (asOf.getTime() > todayVnDateOnly().getTime())
          return jsonError("Ngày mốc không được ở tương lai", 400);
        const dup = await prisma.metricBaseline.findUnique({
          where: {
            metricId_classificationId_cumKind_asOfDate: {
              metricId: existing.metricId,
              classificationId: existing.classificationId,
              cumKind: existing.cumKind,
              asOfDate: asOf,
            },
          },
        });
        if (dup && dup.id !== id)
          return jsonError("Đã có mốc cùng ngày/loại cho chỉ tiêu này — kiểm tra lại", 400);
        const sourceNote = str(data.sourceNote);
        const dataSource = (str(data.dataSource) || existing.dataSource || "REAL").toUpperCase();
        if (!DATA_SOURCES.includes(dataSource))
          return jsonError("Nguồn dữ liệu phải là REAL hoặc DEMO", 400);
        await prisma.$transaction(async (tx) => {
          await tx.metricBaseline.update({
            where: { id },
            data: {
              asOfDate: asOf,
              valueNumeric: valueBase,
              sourceNote,
              dataSource,
              // Sửa số/căn cứ đã xác nhận phải xác nhận lại.
              status: "PROPOSED",
              confirmedById: null,
              confirmedAt: null,
              lockedById: null,
              lockedAt: null,
            },
          });
          await tx.metricBaselineRevision.create({
            data: {
              baselineId: id,
              action: "UPDATE",
              oldValue: existing.valueNumeric,
              newValue: valueBase,
              oldStatus: existing.status,
              newStatus: "PROPOSED",
              oldSourceNote: existing.sourceNote,
              newSourceNote: sourceNote,
              reason: str(data.reason) || null,
              editedById: user.personId,
            },
          });
        });
        await audit("BASELINE_UPDATED", id, {
          metricId: existing.metricId,
          dataSource,
          oldDataSource: existing.dataSource,
          oldValue: existing.valueNumeric.toString(),
          newValue: valueBase.toString(),
          oldStatus: existing.status,
          newStatus: "PROPOSED",
        });
        return NextResponse.json({ success: true, id, status: "PROPOSED", dataSource, isOfficial: dataSource === "REAL" });
      }

      if (action === "confirm" || action === "lock") {
        const id = str(data.id);
        if (!id) return jsonError("Thiếu id mốc", 400);
        const existing = await prisma.metricBaseline.findUnique({ where: { id } });
        if (!existing) return jsonError("Mốc không tồn tại", 404);
        if (action === "confirm") {
          if (existing.status === "LOCKED") return jsonError("Mốc đã chốt", 400);
          const next = "CONFIRMED";
          await prisma.$transaction(async (tx) => {
            await tx.metricBaseline.update({
              where: { id },
              data: { status: next, confirmedById: user.personId, confirmedAt: new Date() },
            });
            await tx.metricBaselineRevision.create({
              data: {
                baselineId: id,
                action: "CONFIRM",
                oldStatus: existing.status,
                newStatus: next,
                reason: str(data.reason) || null,
                editedById: user.personId,
              },
            });
          });
          await audit("BASELINE_CONFIRMED", id, {
            metricId: existing.metricId,
            valueBase: existing.valueNumeric.toString(),
            oldStatus: existing.status,
            newStatus: next,
          });
          return NextResponse.json({ success: true, status: next });
        }
        if (existing.status !== "CONFIRMED")
          return jsonError("Chỉ chốt được mốc đã xác nhận", 400);
        const next = "LOCKED";
        await prisma.$transaction(async (tx) => {
          await tx.metricBaseline.update({
            where: { id },
            data: { status: next, lockedById: user.personId, lockedAt: new Date() },
          });
          await tx.metricBaselineRevision.create({
            data: {
              baselineId: id,
              action: "LOCK",
              oldStatus: existing.status,
              newStatus: next,
              reason: str(data.reason) || null,
              editedById: user.personId,
            },
          });
        });
        await audit("BASELINE_LOCKED", id, {
          metricId: existing.metricId,
          valueBase: existing.valueNumeric.toString(),
          oldStatus: existing.status,
          newStatus: next,
        });
        return NextResponse.json({ success: true, status: next });
      }

      if (action === "delete") {
        const id = str(data.id);
        if (!id) return jsonError("Thiếu id mốc", 400);
        const existing = await prisma.metricBaseline.findUnique({ where: { id } });
        if (!existing) return jsonError("Mốc không tồn tại", 404);
        if (existing.status !== "PROPOSED")
          return jsonError("Chỉ xóa được mốc chưa xác nhận; mốc đã xác nhận/chốt phải giữ lịch sử", 400);
        await prisma.$transaction(async (tx) => {
          await tx.metricBaselineRevision.create({
            data: {
              baselineId: id,
              action: "DELETE",
              oldValue: existing.valueNumeric,
              oldStatus: existing.status,
              oldSourceNote: existing.sourceNote,
              reason: str(data.reason) || null,
              editedById: user.personId,
            },
          });
          await tx.metricBaseline.delete({ where: { id } });
        });
        await audit("BASELINE_DELETED", id, {
          metricId: existing.metricId,
          valueBase: existing.valueNumeric.toString(),
        });
        return NextResponse.json({ success: true });
      }
      return jsonError("Thao tác mốc lũy kế không hợp lệ", 400);
    }

    // ---------- PHÂN CÔNG ----------
    if (entity === "assignment") {
      // YC-28 — phân công hàng loạt nhiều chỉ tiêu cho một người (chống trùng, lưu audit)
      if (action === "create_bulk") {
        const personId = str(data.personId);
        const rawIds: unknown[] = Array.isArray(data.metricIds) ? (data.metricIds as unknown[]) : [];
        const metricIds = Array.from(new Set(rawIds.map((x) => String(x || "")).filter((s) => s !== "")));
        if (!personId) return jsonError("Thiếu người được phân công", 400);
        if (metricIds.length === 0) return jsonError("Chưa chọn chỉ tiêu nào để phân công", 400);
        if (metricIds.length > 100) return jsonError("Mỗi lần chỉ phân công tối đa 100 chỉ tiêu", 400);

        const person = await prisma.person.findUnique({
          where: { id: personId },
          select: { id: true, status: true, fullName: true },
        });
        if (!person) return jsonError("Cán bộ không tồn tại", 400);
        if (person.status !== "ACTIVE") return jsonError("Cán bộ đã ngừng công tác — không phân công được", 400);

        const canEnter = boolOf(data.canEnter, true);
        const canConfirm = boolOf(data.canConfirm, false);
        if (!canEnter && !canConfirm) return jsonError("Phân công phải có ít nhất quyền Nhập hoặc Xác nhận", 400);
        const validFrom = data.validFrom ? dateOnlyFromStr(String(data.validFrom)) : null;
        const validTo = data.validTo ? dateOnlyFromStr(String(data.validTo)) : null;
        const allowBackdateDays =
          data.allowBackdateDays === null || data.allowBackdateDays === "" || data.allowBackdateDays === undefined
            ? null
            : intOf(data.allowBackdateDays, null);

        const metricRows = await prisma.metricDefinition.findMany({ where: { id: { in: metricIds } } });
        const foundIds = new Set(metricRows.map((m) => m.id));
        const missing = metricIds.filter((id) => !foundIds.has(id));
        if (missing.length > 0) return jsonError(`Có ${missing.length} chỉ tiêu không tồn tại — tải lại trang và thử lại`, 400);
        const inactive = metricRows.filter((m) => !m.active);
        if (inactive.length > 0)
          return jsonError(`Chỉ tiêu đã ẩn không phân công được: ${inactive.map((m) => m.code).join(", ")}`, 400);

        const existing = await prisma.metricEntryAssignment.findMany({
          where: { personId, metricId: { in: metricIds } },
        });
        const byMetricId = new Map(existing.map((a) => [a.metricId, a]));
        const sameDate = (a: Date | null, b: Date | null) =>
          (a ? a.getTime() : null) === (b ? b.getTime() : null);

        let created = 0;
        let updated = 0;
        let skipped = 0;
        const details: { metricId: string; code: string; result: "created" | "updated" | "skipped" }[] = [];

        await prisma.$transaction(async (tx) => {
          for (const m of metricRows) {
            const ex = byMetricId.get(m.id);
            if (ex) {
              const identical =
                ex.active &&
                ex.canEnter === canEnter &&
                ex.canConfirm === canConfirm &&
                (ex.allowBackdateDays ?? null) === allowBackdateDays &&
                sameDate(ex.validFrom, validFrom) &&
                sameDate(ex.validTo, validTo);
              if (identical) {
                skipped += 1;
                details.push({ metricId: m.id, code: m.code, result: "skipped" });
                continue;
              }
              await tx.metricEntryAssignment.update({
                where: { id: ex.id },
                data: { canEnter, canConfirm, allowBackdateDays, validFrom, validTo, active: true },
              });
              updated += 1;
              details.push({ metricId: m.id, code: m.code, result: "updated" });
            } else {
              await tx.metricEntryAssignment.create({
                data: {
                  personId,
                  metricId: m.id,
                  canEnter,
                  canConfirm,
                  allowBackdateDays,
                  validFrom,
                  validTo,
                  createdById: user.personId,
                },
              });
              created += 1;
              details.push({ metricId: m.id, code: m.code, result: "created" });
            }
          }
        });

        await audit("ASSIGNMENT_BULK_SAVED", null, {
          personId,
          personName: person.fullName,
          created,
          updated,
          skipped,
          metricCodes: metricRows.map((m) => m.code),
          canEnter,
          canConfirm,
        });
        return NextResponse.json({ success: true, created, updated, skipped, total: metricIds.length, details });
      }

      if (action === "create" || action === "update") {
        const personId = str(data.personId);
        const groupId = str(data.groupId);
        const metricId = str(data.metricId);
        if (!personId) return jsonError("Thiếu người được phân công", 400);
        // YC-27: kiểm tra người tồn tại & còn công tác trước khi phân công
        const person = await prisma.person.findUnique({
          where: { id: personId },
          select: { id: true, status: true },
        });
        if (!person) return jsonError("Cán bộ không tồn tại", 400);
        if (person.status !== "ACTIVE") return jsonError("Cán bộ đã ngừng công tác — không phân công được", 400);
        if ((groupId ? 1 : 0) + (metricId ? 1 : 0) !== 1)
          return jsonError("Chọn phạm vi là một NHÓM hoặc một CHỈ TIÊU (không phải cả hai)", 400);
        const canEnter = boolOf(data.canEnter, true);
        const canConfirm = boolOf(data.canConfirm, false);
        if (!canEnter && !canConfirm)
          return jsonError("Phân công phải có ít nhất quyền Nhập hoặc Xác nhận", 400);
        const validFrom = data.validFrom ? dateOnlyFromStr(String(data.validFrom)) : null;
        const validTo = data.validTo ? dateOnlyFromStr(String(data.validTo)) : null;
        const payload = {
          personId,
          groupId: groupId || null,
          metricId: metricId || null,
          canEnter,
          canConfirm,
          allowBackdateDays:
            data.allowBackdateDays === null || data.allowBackdateDays === "" || data.allowBackdateDays === undefined
              ? null
              : intOf(data.allowBackdateDays, null),
          validFrom,
          validTo,
        };
        if (action === "update") {
          const id = str(data.id);
          if (!id) return jsonError("Thiếu id phân công", 400);
          await prisma.metricEntryAssignment.update({
            where: { id },
            data: { ...payload, active: data.active !== undefined ? boolOf(data.active, true) : undefined },
          });
          await audit("ASSIGNMENT_UPDATED", id, { personId, groupId, metricId, canEnter, canConfirm });
          return NextResponse.json({ success: true });
        }
        // YC-28 — chống trùng (áp dụng cả luồng đơn): đã có phân công cùng người + cùng phạm vi thì
        // cập nhật bản ghi cũ thay vì tạo trùng; nếu giống hệt thì báo đã tồn tại.
        const existing = await prisma.metricEntryAssignment.findFirst({
          where: { personId, metricId: payload.metricId, groupId: payload.groupId },
          orderBy: { createdAt: "asc" },
        });
        if (existing) {
          const identical =
            existing.active &&
            existing.canEnter === canEnter &&
            existing.canConfirm === canConfirm &&
            (existing.allowBackdateDays ?? null) === payload.allowBackdateDays;
          if (!identical) {
            await prisma.metricEntryAssignment.update({ where: { id: existing.id }, data: { ...payload, active: true } });
            await audit("ASSIGNMENT_UPDATED", existing.id, { personId, groupId, metricId, canEnter, canConfirm, dedupe: true });
            return NextResponse.json({ success: true, id: existing.id, duplicated: true, updated: true });
          }
          return NextResponse.json({ success: true, id: existing.id, duplicated: true });
        }
        const a = await prisma.metricEntryAssignment.create({
          data: { ...payload, createdById: user.personId },
        });
        await audit("ASSIGNMENT_CREATED", a.id, { personId, groupId, metricId, canEnter, canConfirm });
        return NextResponse.json({ success: true, id: a.id });
      }
      if (action === "delete") {
        const id = str(data.id);
        if (!id) return jsonError("Thiếu id phân công", 400);
        await prisma.metricEntryAssignment.delete({ where: { id } });
        await audit("ASSIGNMENT_DELETED", id);
        return NextResponse.json({ success: true });
      }
      return jsonError("Thao tác phân công không hợp lệ", 400);
    }

    // ---------- MỤC NHẬN XÉT ----------
    if (entity === "section") {
      if (action === "create") {
        const code = str(data.code);
        const title = str(data.title);
        if (!code || !title) return jsonError("Thiếu mã hoặc tiêu đề mục", 400);
        const dup = await prisma.narrativeSection.findUnique({ where: { code } });
        if (dup) return jsonError(`Mã mục "${code}" đã tồn tại`, 400);
        const s = await prisma.narrativeSection.create({
          data: {
            code,
            title,
            groupId: str(data.groupId),
            sortOrder: intOf(data.sortOrder, 0) || 0,
          },
        });
        await audit("SECTION_CREATED", s.id, { code, title });
        return NextResponse.json({ success: true, id: s.id });
      }
      if (action === "update") {
        const id = str(data.id);
        if (!id) return jsonError("Thiếu id mục", 400);
        await prisma.narrativeSection.update({
          where: { id },
          data: {
            title: str(data.title) || undefined,
            groupId: data.groupId !== undefined ? str(data.groupId) : undefined,
            sortOrder: data.sortOrder !== undefined ? intOf(data.sortOrder, 0) || 0 : undefined,
            active: data.active !== undefined ? boolOf(data.active, true) : undefined,
          },
        });
        await audit("SECTION_UPDATED", id, { title: str(data.title) });
        return NextResponse.json({ success: true });
      }
      if (action === "delete") {
        const id = str(data.id);
        if (!id) return jsonError("Thiếu id mục", 400);
        const count = await prisma.briefingNarrative.count({ where: { sectionId: id } });
        if (count > 0)
          return jsonError(`Mục đã có ${count} nội dung theo kỳ — hãy ẩn thay vì xóa`, 400);
        await prisma.narrativeSection.delete({ where: { id } });
        await audit("SECTION_DELETED", id);
        return NextResponse.json({ success: true });
      }
      return jsonError("Thao tác mục nhận xét không hợp lệ", 400);
    }

    // ---------- KHỐI CẤU TRÚC BÁO CÁO ----------
    if (entity === "report_block") {
      const KINDS = ["HEADING", "METRIC_GROUP", "NARRATIVE"];
      const titleOf = (v: unknown): string => (typeof v === "string" ? v.trim().slice(0, 300) : "");
      const validateRefs = async (
        kind: string,
        groupId: string | null,
        sectionId: string | null
      ): Promise<string | null> => {
        if (kind === "METRIC_GROUP") {
          if (!groupId) return "Khối bảng số liệu phải chọn nhóm chỉ tiêu";
          const g = await prisma.metricGroup.findUnique({ where: { id: groupId } });
          if (!g) return "Nhóm chỉ tiêu không tồn tại";
        }
        if (kind === "NARRATIVE") {
          if (!sectionId) return "Khối nhận xét phải chọn mục nội dung";
          const s = await prisma.narrativeSection.findUnique({ where: { id: sectionId } });
          if (!s) return "Mục nội dung không tồn tại";
        }
        return null;
      };

      if (action === "create") {
        const code = str(data.code);
        const kind = str(data.kind) || "HEADING";
        const title = titleOf(data.title);
        if (!code) return jsonError("Thiếu mã khối", 400);
        if (!KINDS.includes(kind)) return jsonError("Loại khối không hợp lệ", 400);
        if (kind === "HEADING" && !title) return jsonError("Khối tiêu đề phải có nội dung tiêu đề", 400);
        const dup = await prisma.reportBlock.findUnique({ where: { code } });
        if (dup) return jsonError(`Mã khối "${code}" đã tồn tại`, 400);
        const groupId = kind === "METRIC_GROUP" ? str(data.groupId) : null;
        const sectionId = kind === "NARRATIVE" ? str(data.sectionId) : null;
        const refErr = await validateRefs(kind, groupId, sectionId);
        if (refErr) return jsonError(refErr, 400);
        const b = await prisma.reportBlock.create({
          data: {
            code,
            kind,
            title,
            groupId,
            sectionId,
            sortOrder: intOf(data.sortOrder, 0) || 0,
            note: str(data.note),
          },
        });
        await audit("REPORT_BLOCK_CREATED", b.id, { code, kind, title });
        return NextResponse.json({ success: true, id: b.id });
      }
      if (action === "update") {
        const id = str(data.id);
        if (!id) return jsonError("Thiếu id khối", 400);
        const existing = await prisma.reportBlock.findUnique({ where: { id } });
        if (!existing) return jsonError("Khối không tồn tại", 404);
        const kind = data.kind !== undefined ? str(data.kind) || existing.kind : existing.kind;
        if (!KINDS.includes(kind)) return jsonError("Loại khối không hợp lệ", 400);
        const groupId =
          kind === "METRIC_GROUP" ? (data.groupId !== undefined ? str(data.groupId) : existing.groupId) : null;
        const sectionId =
          kind === "NARRATIVE" ? (data.sectionId !== undefined ? str(data.sectionId) : existing.sectionId) : null;
        const refErr = await validateRefs(kind, groupId, sectionId);
        if (refErr) return jsonError(refErr, 400);
        await prisma.reportBlock.update({
          where: { id },
          data: {
            kind,
            title: data.title !== undefined ? titleOf(data.title) : undefined,
            groupId,
            sectionId,
            sortOrder: data.sortOrder !== undefined ? intOf(data.sortOrder, 0) || 0 : undefined,
            active: data.active !== undefined ? boolOf(data.active, true) : undefined,
            note: data.note !== undefined ? str(data.note) : undefined,
          },
        });
        await audit("REPORT_BLOCK_UPDATED", id, { kind });
        return NextResponse.json({ success: true });
      }
      if (action === "delete") {
        const id = str(data.id);
        if (!id) return jsonError("Thiếu id khối", 400);
        await prisma.reportBlock.delete({ where: { id } });
        await audit("REPORT_BLOCK_DELETED", id);
        return NextResponse.json({ success: true });
      }
      return jsonError("Thao tác khối báo cáo không hợp lệ", 400);
    }

    return jsonError("Đối tượng cấu hình không hợp lệ", 400);
  } catch (error: any) {
    console.error("POST /api/metrics/admin error:", error);
    if (error?.code === "P2025") return jsonError("Bản ghi không tồn tại hoặc đã bị xóa", 404);
    return jsonError("Lỗi hệ thống khi lưu cấu hình", 500);
  }
}
