/**
 * V3.2 (B2-A) — nhập bổ sung/điều chỉnh mốc lũy kế bằng quyền nhập liệu hiện có.
 *
 * Quy tắc:
 *  - Dùng lại `canEnter`/`canConfirm` của phân công nhập liệu; KHÔNG thêm quyền mới.
 *  - `metrics.entry_all` được nhập/xác nhận mọi chỉ tiêu; `metrics.config` vẫn quản trị đầy đủ qua /api/metrics/admin.
 *  - Mọi create/update/confirm bắt buộc lý do; ghi `metric_baseline_revisions` old/new + audit old/new.
 *  - Không sửa/xóa mốc LOCKED; sửa mốc CONFIRMED cần `canConfirm` và đưa về PROPOSED để xác nhận lại.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { recordAuditEvent } from "./audit";
import type { SessionUser } from "./auth";
import {
  dateOnlyFromStr,
  dateOnlyToStr,
  isMetricsEntryAdmin,
  parseNumberInput,
  permForMetric,
  resolveEntryPerms,
  todayVnDateOnly,
} from "./metrics";

const CUM_KINDS = ["MONTH", "QUARTER", "YEAR", "LEDGER"] as const;
type CumKind = (typeof CUM_KINDS)[number];

export class MetricAdjustmentError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "MetricAdjustmentError";
    this.statusCode = statusCode;
  }
}

export interface CumulativeAdjustmentInput {
  metricId?: unknown;
  classificationId?: unknown;
  cumKind?: unknown;
  asOfDate?: unknown;
  value?: unknown;
  reason?: unknown;
  sourceNote?: unknown;
}

export interface CumulativeAdjustmentView {
  id: string;
  metricId: string;
  metricCode: string;
  metricName: string;
  classificationId: string;
  classificationLabel: string | null;
  cumKind: string;
  asOfDate: string;
  valueBase: number;
  status: string;
  dataSource: string;
  isOfficial: boolean;
  sourceNote: string | null;
  reason: string | null;
  proposedByName: string | null;
  confirmedByName: string | null;
  confirmedAt: string | null;
  revisionCount: number;
  canEdit: boolean;
  canConfirm: boolean;
}

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function cumKindOf(v: unknown): CumKind {
  const value = (str(v) || "YEAR").toUpperCase();
  if (!CUM_KINDS.includes(value as CumKind)) {
    throw new MetricAdjustmentError("Loại mốc phải là MONTH/QUARTER/YEAR/LEDGER.", 400);
  }
  return value as CumKind;
}

async function loadMetric(metricId: string) {
  const metric = await prisma.metricDefinition.findUnique({
    where: { id: metricId },
    select: {
      id: true,
      code: true,
      name: true,
      unitType: true,
      unitLabel: true,
      displayScale: true,
      active: true,
      groupId: true,
      allowBackdateDays: true,
    },
  });
  if (!metric || !metric.active) throw new MetricAdjustmentError("Chỉ tiêu không tồn tại hoặc đã ẩn.", 400);
  return metric;
}

async function permissionsFor(user: SessionUser, metric: { id: string; groupId: string; allowBackdateDays: number }) {
  const perms = await resolveEntryPerms(user);
  const p = permForMetric(perms, metric);
  return {
    all: perms.all,
    canEnter: perms.all || p.canEnter,
    canConfirm: perms.all || p.canConfirm,
  };
}

async function toViews(rows: any[], user: SessionUser): Promise<CumulativeAdjustmentView[]> {
  if (rows.length === 0) return [];
  const metricIds = Array.from(new Set(rows.map((r) => r.metricId)));
  const metrics = await prisma.metricDefinition.findMany({
    where: { id: { in: metricIds } },
    select: {
      id: true,
      code: true,
      name: true,
      displayScale: true,
      unitType: true,
      groupId: true,
      allowBackdateDays: true,
    },
  });
  const metricById = new Map(metrics.map((m) => [m.id, m]));
  const classificationIds = Array.from(new Set(rows.map((r) => r.classificationId).filter(Boolean)));
  const classes = classificationIds.length
    ? await prisma.metricClassification.findMany({
        where: { id: { in: classificationIds } },
        select: { id: true, label: true },
      })
    : [];
  const classLabel = new Map(classes.map((c) => [c.id, c.label]));
  const personIds = Array.from(
    new Set(rows.flatMap((r) => [r.proposedById, r.confirmedById]).filter((id): id is string => Boolean(id)))
  );
  const people = personIds.length
    ? await prisma.person.findMany({ where: { id: { in: personIds } }, select: { id: true, fullName: true } })
    : [];
  const personName = new Map(people.map((p) => [p.id, p.fullName]));
  const ids = rows.map((r) => r.id);
  const counts = ids.length
    ? await prisma.metricBaselineRevision.groupBy({
        by: ["baselineId"],
        where: { baselineId: { in: ids } },
        _count: { _all: true },
      })
    : [];
  const countById = new Map(counts.map((c) => [c.baselineId, c._count._all]));
  const latestRevisions = ids.length
    ? await prisma.metricBaselineRevision.findMany({
        where: { baselineId: { in: ids } },
        orderBy: [{ editedAt: "desc" }],
        select: { baselineId: true, reason: true },
      })
    : [];
  const reasonById = new Map<string, string | null>();
  for (const r of latestRevisions) if (!reasonById.has(r.baselineId)) reasonById.set(r.baselineId, r.reason);

  const perms = await resolveEntryPerms(user);
  return rows.map((r) => {
    const metric = metricById.get(r.metricId);
    const p = metric ? permForMetric(perms, metric) : { canEnter: false, canConfirm: false, backdateDays: 0 };
    return {
      id: r.id,
      metricId: r.metricId,
      metricCode: metric?.code ?? "",
      metricName: metric?.name ?? "",
      classificationId: r.classificationId,
      classificationLabel: r.classificationId ? classLabel.get(r.classificationId) ?? null : null,
      cumKind: r.cumKind,
      asOfDate: dateOnlyToStr(r.asOfDate),
      valueBase: Number(r.valueNumeric),
      status: r.status,
      dataSource: r.dataSource,
      isOfficial: r.dataSource === "REAL",
      sourceNote: r.sourceNote,
      reason: reasonById.get(r.id) ?? null,
      proposedByName: r.proposedById ? personName.get(r.proposedById) ?? null : null,
      confirmedByName: r.confirmedById ? personName.get(r.confirmedById) ?? null : null,
      confirmedAt: r.confirmedAt ? r.confirmedAt.toISOString() : null,
      revisionCount: countById.get(r.id) ?? 0,
      canEdit: p.canEnter || perms.all,
      canConfirm: p.canConfirm || perms.all,
    };
  });
}

export async function listCumulativeAdjustments(
  user: SessionUser,
  filters: { metricId?: string; year?: number }
): Promise<CumulativeAdjustmentView[]> {
  const perms = await resolveEntryPerms(user);
  const metrics = await prisma.metricDefinition.findMany({
    where: { active: true },
    select: { id: true, groupId: true, allowBackdateDays: true },
  });
  const allowedIds = metrics
    .filter((m) => perms.all || permForMetric(perms, m).canEnter || permForMetric(perms, m).canConfirm)
    .map((m) => m.id);
  if (filters.metricId) {
    if (!allowedIds.includes(filters.metricId)) {
      throw new MetricAdjustmentError("Bạn không được phân công chỉ tiêu này.", 403);
    }
  }
  const where: Prisma.MetricBaselineWhereInput = { metricId: { in: filters.metricId ? [filters.metricId] : allowedIds } };
  if (filters.year) {
    where.asOfDate = {
      gte: new Date(Date.UTC(filters.year, 0, 1)),
      lte: new Date(Date.UTC(filters.year, 11, 31)),
    };
  }
  const rows = await prisma.metricBaseline.findMany({
    where,
    orderBy: [{ asOfDate: "desc" }, { cumKind: "asc" }],
    take: 500,
  });
  return toViews(rows, user);
}

export async function createCumulativeAdjustment(
  user: SessionUser,
  input: CumulativeAdjustmentInput
): Promise<CumulativeAdjustmentView> {
  const metricId = str(input.metricId);
  if (!metricId) throw new MetricAdjustmentError("Thiếu chỉ tiêu.", 400);
  const metric = await loadMetric(metricId);
  const p = await permissionsFor(user, metric);
  if (!p.canEnter) throw new MetricAdjustmentError("Bạn không được phân công nhập chỉ tiêu này.", 403);

  const reason = str(input.reason);
  if (!reason) throw new MetricAdjustmentError("Nhập bổ sung/điều chỉnh lũy kế bắt buộc phải có lý do.", 400);
  const asOf = dateOnlyFromStr(str(input.asOfDate) || "");
  if (!asOf) throw new MetricAdjustmentError("Ngày mốc không hợp lệ (YYYY-MM-DD).", 400);
  if (asOf.getTime() > todayVnDateOnly().getTime()) {
    throw new MetricAdjustmentError("Ngày mốc không được ở tương lai.", 400);
  }
  const parsed = parseNumberInput(input.value as string | number);
  if (parsed === null) throw new MetricAdjustmentError("Giá trị mốc không hợp lệ.", 400);
  const valueBase = new Prisma.Decimal(parsed).mul(metric.displayScale || 1);
  const cumKind = cumKindOf(input.cumKind);
  const classificationId = str(input.classificationId) || "";
  if (classificationId) {
    const cls = await prisma.metricClassification.findFirst({
      where: { id: classificationId, metricId },
      select: { id: true },
    });
    if (!cls) throw new MetricAdjustmentError("Phân loại không thuộc chỉ tiêu đã chọn.", 400);
  }
  const duplicate = await prisma.metricBaseline.findUnique({
    where: {
      metricId_classificationId_cumKind_asOfDate: { metricId, classificationId, cumKind, asOfDate: asOf },
    },
  });
  if (duplicate) {
    throw new MetricAdjustmentError("Đã có mốc cùng ngày/loại — sửa mốc cũ thay vì tạo trùng.", 400);
  }

  // B-C-2/Q9: tài khoản DEMO tạo mốc DEMO; tài khoản thật tạo mốc REAL.
  const dataSource = (user.personCode || "").toUpperCase().startsWith("DEMO") ? "DEMO" : "REAL";
  const sourceNote = str(input.sourceNote);

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.metricBaseline.create({
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
        baselineId: row.id,
        action: "CREATE",
        newValue: valueBase,
        newStatus: "PROPOSED",
        newSourceNote: sourceNote,
        reason,
        editedById: user.personId,
      },
    });
    return row;
  });

  await recordAuditEvent({
    actorId: user.id,
    action: "METRIC_BASELINE_ADJUSTMENT_CREATED",
    resourceType: "MetricBaseline",
    resourceId: created.id,
    newData: {
      metricId,
      classificationId,
      cumKind,
      asOfDate: dateOnlyToStr(asOf),
      valueBase: valueBase.toString(),
      dataSource,
      sourceNote,
      reason,
    },
  });

  const [view] = await toViews([created], user);
  return view;
}

export async function updateCumulativeAdjustment(
  user: SessionUser,
  id: string,
  input: CumulativeAdjustmentInput
): Promise<CumulativeAdjustmentView> {
  const existing = await prisma.metricBaseline.findUnique({ where: { id } });
  if (!existing) throw new MetricAdjustmentError("Mốc lũy kế không tồn tại.", 404);
  if (existing.status === "LOCKED") throw new MetricAdjustmentError("Mốc đã chốt — không sửa trực tiếp.", 400);
  const metric = await loadMetric(existing.metricId);
  const p = await permissionsFor(user, metric);
  if (!p.canEnter) throw new MetricAdjustmentError("Bạn không được phân công nhập chỉ tiêu này.", 403);
  if (existing.status === "CONFIRMED" && !p.canConfirm) {
    throw new MetricAdjustmentError("Mốc đã xác nhận — cần quyền xác nhận để điều chỉnh.", 403);
  }

  const reason = str(input.reason);
  if (!reason) throw new MetricAdjustmentError("Điều chỉnh mốc lũy kế bắt buộc phải có lý do.", 400);
  const asOf = dateOnlyFromStr(str(input.asOfDate) || dateOnlyToStr(existing.asOfDate));
  if (!asOf) throw new MetricAdjustmentError("Ngày mốc không hợp lệ.", 400);
  if (asOf.getTime() > todayVnDateOnly().getTime()) {
    throw new MetricAdjustmentError("Ngày mốc không được ở tương lai.", 400);
  }
  const parsed = parseNumberInput(input.value as string | number);
  if (parsed === null) throw new MetricAdjustmentError("Giá trị mốc không hợp lệ.", 400);
  const valueBase = new Prisma.Decimal(parsed).mul(metric.displayScale || 1);
  const sourceNote = str(input.sourceNote);
  const duplicate = await prisma.metricBaseline.findUnique({
    where: {
      metricId_classificationId_cumKind_asOfDate: {
        metricId: existing.metricId,
        classificationId: existing.classificationId,
        cumKind: existing.cumKind,
        asOfDate: asOf,
      },
    },
  });
  if (duplicate && duplicate.id !== id) {
    throw new MetricAdjustmentError("Đã có mốc cùng ngày/loại — kiểm tra lại.", 400);
  }

  await prisma.$transaction(async (tx) => {
    await tx.metricBaseline.update({
      where: { id },
      data: {
        asOfDate: asOf,
        valueNumeric: valueBase,
        sourceNote,
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
        reason,
        editedById: user.personId,
      },
    });
  });

  await recordAuditEvent({
    actorId: user.id,
    action: "METRIC_BASELINE_ADJUSTMENT_UPDATED",
    resourceType: "MetricBaseline",
    resourceId: id,
    oldData: {
      metricId: existing.metricId,
      classificationId: existing.classificationId,
      cumKind: existing.cumKind,
      asOfDate: dateOnlyToStr(existing.asOfDate),
      valueBase: existing.valueNumeric.toString(),
      status: existing.status,
      sourceNote: existing.sourceNote,
    },
    newData: {
      metricId: existing.metricId,
      classificationId: existing.classificationId,
      cumKind: existing.cumKind,
      asOfDate: dateOnlyToStr(asOf),
      valueBase: valueBase.toString(),
      status: "PROPOSED",
      sourceNote,
      reason,
    },
  });

  const updated = await prisma.metricBaseline.findUniqueOrThrow({ where: { id } });
  const [view] = await toViews([updated], user);
  return view;
}

export async function confirmCumulativeAdjustment(
  user: SessionUser,
  id: string,
  input: { reason?: unknown }
): Promise<CumulativeAdjustmentView> {
  const existing = await prisma.metricBaseline.findUnique({ where: { id } });
  if (!existing) throw new MetricAdjustmentError("Mốc lũy kế không tồn tại.", 404);
  if (existing.status === "LOCKED") throw new MetricAdjustmentError("Mốc đã chốt.", 400);
  if (existing.status === "CONFIRMED") {
    const [view] = await toViews([existing], user);
    return view;
  }
  const metric = await loadMetric(existing.metricId);
  const p = await permissionsFor(user, metric);
  if (!p.canConfirm) throw new MetricAdjustmentError("Bạn không có quyền xác nhận chỉ tiêu này.", 403);
  const reason = str(input.reason);
  if (!reason) throw new MetricAdjustmentError("Xác nhận mốc lũy kế bắt buộc phải có lý do.", 400);

  await prisma.$transaction(async (tx) => {
    await tx.metricBaseline.update({
      where: { id },
      data: {
        status: "CONFIRMED",
        confirmedById: user.personId,
        confirmedAt: new Date(),
        lockedById: null,
        lockedAt: null,
      },
    });
    await tx.metricBaselineRevision.create({
      data: {
        baselineId: id,
        action: "CONFIRM",
        oldStatus: existing.status,
        newStatus: "CONFIRMED",
        reason,
        editedById: user.personId,
      },
    });
  });

  await recordAuditEvent({
    actorId: user.id,
    action: "METRIC_BASELINE_ADJUSTMENT_CONFIRMED",
    resourceType: "MetricBaseline",
    resourceId: id,
    oldData: { status: existing.status, valueBase: existing.valueNumeric.toString() },
    newData: {
      status: "CONFIRMED",
      valueBase: existing.valueNumeric.toString(),
      reason,
    },
  });

  const updated = await prisma.metricBaseline.findUniqueOrThrow({ where: { id } });
  const [view] = await toViews([updated], user);
  return view;
}
