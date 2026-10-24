/**
 * S3 — Phase C: service target-only (D7=A).
 *
 * Phạm vi:
 *  - Chỉ quản lý `MetricPlanTarget` + `MetricPlanTargetRevision`.
 *  - Không sửa `src/server/metrics.ts`, `/api/metrics/admin`, summary/entries.
 *  - Quyền: `metrics.config` (Q8) — không dùng `system.config`, không `giao_ban.target.*`.
 *
 * D5 hiện DEFERRED_B_C_3: service trả `rules.officialPercentAllowed=false` và
 * `direction=NOT_SET` / `measureMode=PENDING_BUSINESS_INPUT`; không tự tính %.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { checkPermission } from "./guard";
import { recordAuditEvent } from "./audit";
import type { SessionUser } from "./auth";
import { parseMetricInput, type BaselineScope, type Direction, type MeasureMode, type TargetRuleSnapshot } from "@/lib/metrics-contract";
import { canAssignTarget, ruleKey, ruleOf } from "@/lib/metric-target-rules";
import { loadMetricTargetRules } from "./metric-target-rules";

const PERIOD_TYPES = ["YEAR", "QUARTER", "MONTH"] as const;
const COMPARISON_KINDS = ["NONE", "BTC_YEAR", "UBND_YEAR", "MONTH_PLAN"] as const;
const DATA_SOURCES = ["REAL", "DEMO"] as const;
const TARGET_STATUSES = ["PROPOSED", "CONFIRMED", "LOCKED"] as const;

export class MetricTargetError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "MetricTargetError";
    this.statusCode = statusCode;
  }
}

/** D5-A/C1-A — quy tắc đánh giá/gán chỉ tiêu tường minh của metric + kỳ. */
export interface MetricTargetRules {
  targetApplicable: boolean;
  direction: Direction;
  measureMode: MeasureMode;
  baselineScope: BaselineScope;
  officialPercentAllowed: boolean;
  configured: boolean;
  pending: string | null;
  sourceNote: string | null;
}

function rulesFrom(rule: TargetRuleSnapshot, sourceNote: string | null): MetricTargetRules {
  const officialPercentAllowed = canAssignTarget(rule);
  return {
    targetApplicable: rule.configured && rule.targetApplicable,
    direction: rule.direction,
    measureMode: rule.measureMode,
    baselineScope: rule.baselineScope,
    officialPercentAllowed,
    configured: rule.configured,
    pending: officialPercentAllowed ? null : "V32_TARGET_RULE_PENDING",
    sourceNote,
  };
}

export interface MetricTargetView {
  id: string;
  metricId: string;
  metricCode: string;
  metricName: string;
  classificationId: string;
  classificationLabel: string | null;
  label: string;
  periodType: string;
  year: number;
  periodNo: number | null;
  valueBase: number;
  unitType: string;
  unitLabel: string;
  displayScale: number;
  comparisonKind: string;
  dataSource: string;
  isOfficial: boolean;
  status: string;
  sourceNote: string | null;
  note: string | null;
  proposedByName: string | null;
  proposedAt: string | null;
  confirmedByName: string | null;
  confirmedAt: string | null;
  lockedByName: string | null;
  lockedAt: string | null;
  revisionCount: number;
  rules: MetricTargetRules;
}

export interface MetricTargetInput {
  metricId?: unknown;
  classificationId?: unknown;
  label?: unknown;
  periodType?: unknown;
  year?: unknown;
  periodNo?: unknown;
  value?: unknown;
  comparisonKind?: unknown;
  dataSource?: unknown;
  sourceNote?: unknown;
  note?: unknown;
}

export interface TargetRevisionView {
  id: string;
  targetId: string;
  action: string;
  oldValue: number | null;
  newValue: number | null;
  oldStatus: string | null;
  newStatus: string | null;
  oldSourceNote: string | null;
  newSourceNote: string | null;
  reason: string | null;
  editedByName: string | null;
  editedAt: string;
}

type TargetRow = Prisma.MetricPlanTargetGetPayload<{
  include: {
    metric: {
      select: {
        id: true;
        code: true;
        name: true;
        unitType: true;
        unitLabel: true;
        displayScale: true;
      };
    };
  };
}>;

const targetInclude = {
  metric: {
    select: {
      id: true,
      code: true,
      name: true,
      unitType: true,
      unitLabel: true,
      displayScale: true,
    },
  },
} satisfies Prisma.MetricPlanTargetInclude;

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

function normalizeStatus(status: string): string {
  return TARGET_STATUSES.includes(status as (typeof TARGET_STATUSES)[number]) ? status : "PROPOSED";
}

function ensureCanManage(user: SessionUser): void {
  if (!checkPermission(user, "metrics.config")) {
    throw new MetricTargetError("Chỉ người có quyền metrics.config mới được cấu hình chỉ tiêu giao.", 403);
  }
}

async function getTargetRow(id: string): Promise<TargetRow> {
  const row = await prisma.metricPlanTarget.findUnique({ where: { id }, include: targetInclude });
  if (!row) throw new MetricTargetError("Chỉ tiêu giao không tồn tại.", 404);
  return row;
}

async function revisionCounts(targetIds: string[]): Promise<Map<string, number>> {
  if (targetIds.length === 0) return new Map();
  const groups = await prisma.metricPlanTargetRevision.groupBy({
    by: ["targetId"],
    where: { targetId: { in: targetIds } },
    _count: { _all: true },
  });
  return new Map(groups.map((g) => [g.targetId, g._count._all]));
}

async function toViews(rows: TargetRow[]): Promise<MetricTargetView[]> {
  if (rows.length === 0) return [];
  const personIds = Array.from(
    new Set(
      rows
        .flatMap((r) => [r.proposedById, r.confirmedById, r.lockedById])
        .filter((id): id is string => Boolean(id))
    )
  );
  const classificationIds = Array.from(new Set(rows.map((r) => r.classificationId).filter(Boolean)));
  const metricIds = Array.from(new Set(rows.map((r) => r.metricId)));
  const [people, classifications, counts, rules] = await Promise.all([
    personIds.length
      ? prisma.person.findMany({ where: { id: { in: personIds } }, select: { id: true, fullName: true } })
      : Promise.resolve([]),
    classificationIds.length
      ? prisma.metricClassification.findMany({
          where: { id: { in: classificationIds } },
          select: { id: true, label: true },
        })
      : Promise.resolve([]),
    revisionCounts(rows.map((r) => r.id)),
    loadMetricTargetRules(metricIds),
  ]);
  const personName = new Map(people.map((p) => [p.id, p.fullName]));
  const classLabel = new Map(classifications.map((c) => [c.id, c.label]));

  return rows.map((r) => {
    const rule = ruleOf(rules, r.metricId, r.periodType);
    const sourceNote = rules.get(ruleKey(r.metricId, r.periodType))?.sourceNote ?? null;
    return {
      id: r.id,
      metricId: r.metricId,
      metricCode: r.metric.code,
      metricName: r.metric.name,
      classificationId: r.classificationId,
      classificationLabel: r.classificationId ? classLabel.get(r.classificationId) ?? null : null,
      label: r.label,
      periodType: r.periodType,
      year: r.year,
      periodNo: r.periodNo,
      valueBase: Number(r.valueNumeric),
      unitType: r.metric.unitType,
      unitLabel: r.metric.unitLabel || r.metric.unitType,
      displayScale: r.metric.displayScale || 1,
      comparisonKind: r.comparisonKind,
      dataSource: r.dataSource,
      isOfficial: r.dataSource === "REAL",
      status: normalizeStatus(r.status),
      sourceNote: r.sourceNote,
      note: r.note,
      proposedByName: r.proposedById ? personName.get(r.proposedById) ?? null : null,
      proposedAt: r.createdAt.toISOString(),
      confirmedByName: r.confirmedById ? personName.get(r.confirmedById) ?? null : null,
      confirmedAt: r.confirmedAt ? r.confirmedAt.toISOString() : null,
      lockedByName: r.lockedById ? personName.get(r.lockedById) ?? null : null,
      lockedAt: r.lockedAt ? r.lockedAt.toISOString() : null,
      revisionCount: counts.get(r.id) ?? 0,
      rules: rulesFrom(rule, sourceNote),
    };
  });
}

export async function listMetricTargets(
  user: SessionUser,
  filters: { metricId?: string; year?: number; periodType?: string; periodNo?: number | null }
): Promise<MetricTargetView[]> {
  ensureCanManage(user);
  const where: Prisma.MetricPlanTargetWhereInput = {};
  if (filters.metricId) where.metricId = filters.metricId;
  if (filters.year) where.year = filters.year;
  if (filters.periodType) where.periodType = filters.periodType;
  if (filters.periodNo !== undefined) where.periodNo = filters.periodNo;
  const rows = await prisma.metricPlanTarget.findMany({
    where,
    include: targetInclude,
    orderBy: [{ year: "desc" }, { periodType: "asc" }, { periodNo: "asc" }, { label: "asc" }],
    take: 500,
  });
  return toViews(rows);
}

export async function getMetricTarget(user: SessionUser, id: string): Promise<MetricTargetView> {
  ensureCanManage(user);
  const row = await getTargetRow(id);
  const [view] = await toViews([row]);
  return view;
}

async function resolveInput(
  input: MetricTargetInput,
  existingMetricId?: string
): Promise<{
  metric: { id: string; name: string; unitType: string; unitLabel: string | null; displayScale: number };
  classificationId: string;
  label: string;
  periodType: string;
  year: number;
  periodNo: number | null;
  valueBase: Prisma.Decimal;
  comparisonKind: string;
  dataSource: string;
  sourceNote: string | null;
  note: string | null;
  rule: TargetRuleSnapshot;
}> {
  const metricId = existingMetricId || str(input.metricId);
  if (!metricId) throw new MetricTargetError("Thiếu chỉ tiêu.", 400);
  if (existingMetricId && input.metricId && str(input.metricId) !== existingMetricId) {
    throw new MetricTargetError("Không được đổi chỉ tiêu của bản ghi đã tạo.", 400);
  }
  const metric = await prisma.metricDefinition.findUnique({
    where: { id: metricId },
    select: { id: true, name: true, unitType: true, unitLabel: true, displayScale: true },
  });
  if (!metric) throw new MetricTargetError("Chỉ tiêu không tồn tại.", 400);

  const label = str(input.label);
  if (!label) throw new MetricTargetError("Thiếu tên hiển thị của chỉ tiêu giao.", 400);

  const periodType = (str(input.periodType) || "YEAR").toUpperCase();
  if (!PERIOD_TYPES.includes(periodType as (typeof PERIOD_TYPES)[number])) {
    throw new MetricTargetError("Loại kỳ không hợp lệ.", 400);
  }
  const year = intOf(input.year, null);
  if (!year || year < 2000 || year > 2100) throw new MetricTargetError("Năm không hợp lệ.", 400);
  const periodNo = periodType === "YEAR" ? null : intOf(input.periodNo, null);
  if (periodType === "MONTH" && (!periodNo || periodNo < 1 || periodNo > 12)) {
    throw new MetricTargetError("Tháng phải từ 1–12.", 400);
  }
  if (periodType === "QUARTER" && (!periodNo || periodNo < 1 || periodNo > 4)) {
    throw new MetricTargetError("Quý phải từ 1–4.", 400);
  }

  // D5-A/C1-A: chỉ metric+kỳ đã có quy tắc được duyệt mới được gán chỉ tiêu.
  const rule = await prisma.metricTargetRule.findUnique({
    where: { metricId_periodType: { metricId, periodType } },
  });
  const ruleSnapshot: TargetRuleSnapshot = rule
    ? {
        configured: true,
        targetApplicable: rule.targetApplicable === true,
        direction: rule.direction as Direction,
        measureMode: rule.measureMode as MeasureMode,
        baselineScope: rule.baselineScope as BaselineScope,
      }
    : {
        configured: false,
        targetApplicable: false,
        direction: "NOT_SET",
        measureMode: "PENDING_BUSINESS_INPUT",
        baselineScope: "PENDING_BUSINESS_INPUT",
      };
  if (!canAssignTarget(ruleSnapshot)) {
    throw new MetricTargetError(
      ruleSnapshot.configured && !ruleSnapshot.targetApplicable
        ? "Chưa có quy tắc gán chỉ tiêu cho chỉ tiêu/kỳ này."
        : "Chỉ tiêu/kỳ này chưa đủ quy tắc đánh giá để gán chỉ tiêu.",
      400
    );
  }

  const parsed = parseMetricInput(input.value as string | number);
  if (parsed === null) throw new MetricTargetError("Giá trị chỉ tiêu không hợp lệ.", 400);
  if (parsed < 0) throw new MetricTargetError("Giá trị chỉ tiêu không được âm.", 400);
  const valueBase = new Prisma.Decimal(parsed).mul(metric.displayScale || 1);

  const comparisonKind = (str(input.comparisonKind) || "NONE").toUpperCase();
  if (!COMPARISON_KINDS.includes(comparisonKind as (typeof COMPARISON_KINDS)[number])) {
    throw new MetricTargetError("Loại đối chiếu không hợp lệ.", 400);
  }
  if ((comparisonKind === "BTC_YEAR" || comparisonKind === "UBND_YEAR") && periodType !== "YEAR") {
    throw new MetricTargetError("Chỉ tiêu BTC/UBND phải là chỉ tiêu Năm.", 400);
  }
  if (comparisonKind === "MONTH_PLAN" && periodType !== "MONTH") {
    throw new MetricTargetError("Kế hoạch tháng HQTL phải là chỉ tiêu Tháng.", 400);
  }

  const dataSource = (str(input.dataSource) || "REAL").toUpperCase();
  if (!DATA_SOURCES.includes(dataSource as (typeof DATA_SOURCES)[number])) {
    throw new MetricTargetError("Nguồn dữ liệu phải là REAL hoặc DEMO.", 400);
  }

  const classificationId = str(input.classificationId) || "";
  if (classificationId) {
    const classification = await prisma.metricClassification.findFirst({
      where: { id: classificationId, metricId },
      select: { id: true },
    });
    if (!classification) throw new MetricTargetError("Phân loại không thuộc chỉ tiêu đã chọn.", 400);
  }

  return {
    metric,
    classificationId,
    label,
    periodType,
    year,
    periodNo,
    valueBase,
    comparisonKind,
    dataSource,
    sourceNote: str(input.sourceNote),
    note: str(input.note),
    rule: ruleSnapshot,
  };
}

async function assertNoDuplicate(params: {
  id?: string;
  metricId: string;
  classificationId: string;
  label: string;
  periodType: string;
  year: number;
  periodNo: number | null;
  comparisonKind: string;
  dataSource: string;
}): Promise<void> {
  const base = {
    id: params.id ? { not: params.id } : undefined,
    metricId: params.metricId,
    classificationId: params.classificationId,
    label: params.label,
    periodType: params.periodType,
    year: params.year,
    periodNo: params.periodNo,
  };
  const dup = await prisma.metricPlanTarget.findFirst({ where: base });
  if (dup) {
    throw new MetricTargetError(
      "Đã có chỉ tiêu giao trùng tên/kỳ — sửa bản ghi cũ thay vì thêm mới.",
      400
    );
  }
  if (params.comparisonKind !== "NONE") {
    const dupKind = await prisma.metricPlanTarget.findFirst({
      where: {
        id: params.id ? { not: params.id } : undefined,
        metricId: params.metricId,
        classificationId: params.classificationId,
        comparisonKind: params.comparisonKind,
        year: params.year,
        periodNo: params.periodNo,
        dataSource: params.dataSource,
      },
    });
    if (dupKind) {
      throw new MetricTargetError(
        "Đã có chỉ tiêu giao cùng loại đối chiếu cho kỳ này — sửa bản ghi cũ.",
        400
      );
    }
  }
}

export async function createMetricTarget(user: SessionUser, input: MetricTargetInput): Promise<MetricTargetView> {
  ensureCanManage(user);
  const resolved = await resolveInput(input);
  await assertNoDuplicate({ ...resolved, metricId: resolved.metric.id });

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.metricPlanTarget.create({
      data: {
        metricId: resolved.metric.id,
        classificationId: resolved.classificationId,
        label: resolved.label,
        periodType: resolved.periodType,
        year: resolved.year,
        periodNo: resolved.periodNo,
        valueNumeric: resolved.valueBase,
        comparisonKind: resolved.comparisonKind,
        dataSource: resolved.dataSource,
        sourceNote: resolved.sourceNote,
        note: resolved.note,
        status: "PROPOSED",
        proposedById: user.personId,
        updatedById: user.personId,
      },
    });
    await tx.metricPlanTargetRevision.create({
      data: {
        targetId: row.id,
        action: "CREATE",
        newValue: resolved.valueBase,
        newStatus: "PROPOSED",
        newSourceNote: resolved.sourceNote,
        reason: resolved.note,
        editedById: user.personId,
      },
    });
    return row;
  });

  await recordAuditEvent({
    actorId: user.id,
    action: "METRIC_ADMIN_TARGET_CREATED",
    resourceType: "MetricConfig",
    resourceId: created.id,
    newData: {
      metricId: resolved.metric.id,
      label: resolved.label,
      year: resolved.year,
      periodNo: resolved.periodNo,
      comparisonKind: resolved.comparisonKind,
      dataSource: resolved.dataSource,
      valueBase: resolved.valueBase.toString(),
      sourceNote: resolved.sourceNote,
    },
  });

  return getMetricTarget(user, created.id);
}

export async function updateMetricTarget(
  user: SessionUser,
  id: string,
  input: MetricTargetInput
): Promise<MetricTargetView> {
  ensureCanManage(user);
  const existing = await getTargetRow(id);
  if (existing.status === "LOCKED") throw new MetricTargetError("Chỉ tiêu giao đã chốt — không sửa trực tiếp.", 400);

  const resolved = await resolveInput(input, existing.metricId);
  await assertNoDuplicate({
    id,
    metricId: existing.metricId,
    classificationId: resolved.classificationId,
    label: resolved.label,
    periodType: resolved.periodType,
    year: resolved.year,
    periodNo: resolved.periodNo,
    comparisonKind: resolved.comparisonKind,
    dataSource: resolved.dataSource,
  });

  await prisma.$transaction(async (tx) => {
    await tx.metricPlanTarget.update({
      where: { id },
      data: {
        classificationId: resolved.classificationId,
        label: resolved.label,
        periodType: resolved.periodType,
        year: resolved.year,
        periodNo: resolved.periodNo,
        valueNumeric: resolved.valueBase,
        comparisonKind: resolved.comparisonKind,
        dataSource: resolved.dataSource,
        sourceNote: resolved.sourceNote,
        note: resolved.note,
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
        newValue: resolved.valueBase,
        oldStatus: existing.status,
        newStatus: "PROPOSED",
        oldSourceNote: existing.sourceNote,
        newSourceNote: resolved.sourceNote,
        reason: resolved.note,
        editedById: user.personId,
      },
    });
  });

  await recordAuditEvent({
    actorId: user.id,
    action: "METRIC_ADMIN_TARGET_UPDATED",
    resourceType: "MetricConfig",
    resourceId: id,
    oldData: {
      label: existing.label,
      year: existing.year,
      periodNo: existing.periodNo,
      valueBase: existing.valueNumeric.toString(),
      comparisonKind: existing.comparisonKind,
      dataSource: existing.dataSource,
      status: existing.status,
    },
    newData: {
      label: resolved.label,
      year: resolved.year,
      periodNo: resolved.periodNo,
      valueBase: resolved.valueBase.toString(),
      comparisonKind: resolved.comparisonKind,
      dataSource: resolved.dataSource,
      status: "PROPOSED",
    },
  });

  return getMetricTarget(user, id);
}

export async function confirmMetricTarget(
  user: SessionUser,
  id: string,
  input: { sourceNote?: unknown; reason?: unknown }
): Promise<MetricTargetView> {
  ensureCanManage(user);
  const existing = await getTargetRow(id);
  if (existing.status === "LOCKED") throw new MetricTargetError("Chỉ tiêu giao đã chốt.", 400);
  if (existing.status === "CONFIRMED") return getMetricTarget(user, id);

  const rule = await prisma.metricTargetRule.findUnique({
    where: { metricId_periodType: { metricId: existing.metricId, periodType: existing.periodType } },
  });
  if (!rule?.targetApplicable) {
    throw new MetricTargetError("Chưa có quy tắc gán chỉ tiêu cho chỉ tiêu/kỳ này.", 400);
  }

  const sourceNote = str(input.sourceNote) ?? existing.sourceNote;
  if (!sourceNote) throw new MetricTargetError("Xác nhận chỉ tiêu phải có nguồn/căn cứ.", 400);

  await prisma.$transaction(async (tx) => {
    await tx.metricPlanTarget.update({
      where: { id },
      data: {
        status: "CONFIRMED",
        sourceNote,
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
        newStatus: "CONFIRMED",
        oldSourceNote: existing.sourceNote,
        newSourceNote: sourceNote,
        reason: str(input.reason),
        editedById: user.personId,
      },
    });
  });

  await recordAuditEvent({
    actorId: user.id,
    action: "METRIC_ADMIN_TARGET_CONFIRMED",
    resourceType: "MetricConfig",
    resourceId: id,
    oldData: { status: existing.status, sourceNote: existing.sourceNote },
    newData: { status: "CONFIRMED", sourceNote },
  });

  return getMetricTarget(user, id);
}

export async function lockMetricTarget(
  user: SessionUser,
  id: string,
  input: { reason?: unknown } = {}
): Promise<MetricTargetView> {
  ensureCanManage(user);
  const existing = await getTargetRow(id);
  if (existing.status === "LOCKED") return getMetricTarget(user, id);
  if (existing.status !== "CONFIRMED") throw new MetricTargetError("Chỉ chốt được chỉ tiêu giao đã xác nhận.", 400);

  await prisma.$transaction(async (tx) => {
    await tx.metricPlanTarget.update({
      where: { id },
      data: { status: "LOCKED", lockedById: user.personId, lockedAt: new Date(), updatedById: user.personId },
    });
    await tx.metricPlanTargetRevision.create({
      data: {
        targetId: id,
        action: "LOCK",
        oldStatus: existing.status,
        newStatus: "LOCKED",
        reason: str(input.reason),
        editedById: user.personId,
      },
    });
  });

  await recordAuditEvent({
    actorId: user.id,
    action: "METRIC_ADMIN_TARGET_LOCKED",
    resourceType: "MetricConfig",
    resourceId: id,
    oldData: { status: existing.status },
    newData: { status: "LOCKED" },
  });

  return getMetricTarget(user, id);
}

/** Hủy chỉ tiêu DRAFT/PROPOSED; bản ghi đã CONFIRMED/LOCKED phải giữ lịch sử. */
export async function voidMetricTarget(
  user: SessionUser,
  id: string,
  input: { reason?: unknown } = {}
): Promise<{ id: string; deleted: true }> {
  ensureCanManage(user);
  const existing = await getTargetRow(id);
  if (existing.status !== "PROPOSED") {
    throw new MetricTargetError("Chỉ hủy được chỉ tiêu giao chưa xác nhận; bản ghi đã xác nhận/chốt phải giữ lịch sử.", 400);
  }

  await prisma.$transaction(async (tx) => {
    await tx.metricPlanTargetRevision.create({
      data: {
        targetId: id,
        action: "DELETE",
        oldValue: existing.valueNumeric,
        oldStatus: existing.status,
        oldSourceNote: existing.sourceNote,
        reason: str(input.reason),
        editedById: user.personId,
      },
    });
    await tx.metricPlanTarget.delete({ where: { id } });
  });

  await recordAuditEvent({
    actorId: user.id,
    action: "METRIC_ADMIN_TARGET_DELETED",
    resourceType: "MetricConfig",
    resourceId: id,
    oldData: {
      metricId: existing.metricId,
      label: existing.label,
      year: existing.year,
      periodNo: existing.periodNo,
      valueBase: existing.valueNumeric.toString(),
      status: existing.status,
    },
  });

  return { id, deleted: true };
}

export async function listMetricTargetRevisions(user: SessionUser, id: string): Promise<TargetRevisionView[]> {
  ensureCanManage(user);
  const revisions = await prisma.metricPlanTargetRevision.findMany({
    where: { targetId: id },
    orderBy: { editedAt: "desc" },
    take: 200,
  });
  const personIds = Array.from(new Set(revisions.map((r) => r.editedById).filter(Boolean)));
  const people = personIds.length
    ? await prisma.person.findMany({ where: { id: { in: personIds } }, select: { id: true, fullName: true } })
    : [];
  const nameById = new Map(people.map((p) => [p.id, p.fullName]));

  return revisions.map((r) => ({
    id: r.id,
    targetId: r.targetId,
    action: r.action,
    oldValue: r.oldValue === null ? null : Number(r.oldValue),
    newValue: r.newValue === null ? null : Number(r.newValue),
    oldStatus: r.oldStatus,
    newStatus: r.newStatus,
    oldSourceNote: r.oldSourceNote,
    newSourceNote: r.newSourceNote,
    reason: r.reason,
    editedByName: nameByEmailSafe(nameById, r.editedById),
    editedAt: r.editedAt.toISOString(),
  }));
}

function nameByEmailSafe(map: Map<string, string>, id: string): string | null {
  return map.get(id) ?? null;
}
