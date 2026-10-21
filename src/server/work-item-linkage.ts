/**
 * YC-38C — Liên thông dữ liệu công việc (lớp dùng chung cho mọi nguồn tạo việc).
 *
 * Quy tắc nghiệp vụ đã chốt:
 *  - MỘT công việc gốc (`personal_work_items`), NHIỀU người tham gia
 *    (`work_item_assignments`) — KHÔNG nhân bản công việc gốc cho từng người.
 *  - MỘT đầu mối chủ trì: cá nhân HOẶC bộ phận (không cả hai).
 *  - TX (danh mục công việc) và QĐ1277 (danh mục sản phẩm) là HAI trục độc lập:
 *    không gộp trường nguồn, không cộng hệ số, không tự gắn sản phẩm.
 *  - Provenance bất biến: nguồn + mã tham chiếu + mã danh mục tại thời điểm tạo.
 */
import { prisma } from "./db";
import { getCatalogEntrySelectionError } from "./work-catalog";
import type { PrismaClient, Prisma } from "@prisma/client";

export type SourceKind =
  | "TX_CATALOG"
  | "QD1277_PRODUCT"
  | "PLAN"
  | "DEPT"
  | "LEGACY_TEMPLATE"
  | "DOCUMENT"
  | "MEETING"
  | "TASK"
  | "CUSTOM";

export const SOURCE_KIND_LABEL: Record<SourceKind, string> = {
  TX_CATALOG: "Đầu việc Danh mục TX",
  QD1277_PRODUCT: "Sản phẩm đầu ra QĐ1277",
  PLAN: "Kế hoạch",
  DEPT: "Danh mục đầu việc của bộ phận",
  LEGACY_TEMPLATE: "Mẫu thường xuyên (cũ)",
  DOCUMENT: "Văn bản",
  MEETING: "Giao ban / biên bản",
  TASK: "Nhiệm vụ",
  CUSTOM: "Tự nhập",
};

export interface SourceInput {
  catalogEntryId?: string | null;
  productItemId?: string | null;
  sourceKind?: string | null;
  sourceRefId?: string | null;
  sourceCodeSnapshot?: string | null;
}

export interface ResolvedSource {
  sourceKind: SourceKind;
  sourceRefId: string;
  sourceCodeSnapshot: string | null;
  catalogEntryId: string | null;
  productItemId: string | null;
}

/** Mã công việc gốc ổn định — dùng cho chuỗi nhiều kỳ. */
export function buildSeriesCode(): string {
  const d = new Date();
  const y = d.getFullYear();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `CV-${y}-${rand}`;
}

/** Khóa idempotency cho kết quả tháng: người + công việc + kỳ. */
export function buildIdempotencyKey(
  personId: string,
  workItemId: string,
  periodYear: number,
  periodMonth: number
): string {
  return `p:${personId}|wi:${workItemId}|y:${periodYear}|m:${periodMonth}`;
}

/**
 * Chuẩn hóa & kiểm tra nguồn công việc.
 * - Nếu có catalogEntryId → nguồn là TX, mã snapshot = mã đầu việc.
 * - Nếu có productItemId → nguồn là QĐ1277, mã snapshot = mã sản phẩm.
 * - Nếu có sourceKind/sourceRefId tường minh → dùng nguyên vẹn (văn bản, giao ban...).
 * - TX và QĐ1277 có thể cùng tồn tại (2 trục độc lập) → nguồn chính ưu tiên TX.
 * Trả về null khi không có nguồn nào (công việc ngoài danh mục — hợp lệ).
 */
export async function resolveWorkSource(
  input: SourceInput,
  personId: string
): Promise<{ ok: true; source: ResolvedSource } | { ok: false; error: string; status?: number }> {
  const explicitKind = (input.sourceKind || "").trim() as SourceKind | "";
  const explicitRef = (input.sourceRefId || "").trim();

  // Nguồn tường minh (văn bản, giao ban, kế hoạch...) — ưu tiên nếu có
  if (explicitKind && explicitRef) {
    return {
      ok: true,
      source: {
        sourceKind: explicitKind,
        sourceRefId: explicitRef,
        sourceCodeSnapshot: (input.sourceCodeSnapshot || "").trim() || null,
        catalogEntryId: null,
        productItemId: null,
      },
    };
  }

  let catalogEntryId: string | null = null;
  let catalogCode: string | null = null;
  if (input.catalogEntryId) {
    const entry = await prisma.workCatalogEntry.findUnique({
      where: { id: input.catalogEntryId },
      include: { version: { select: { status: true } } },
    });
    if (!entry) return { ok: false, error: "Đầu việc Danh mục TX không tồn tại", status: 400 };
    if (entry.status !== "ACTIVE" || entry.version.status !== "ACTIVE") {
      return {
        ok: false,
        error: "Đầu việc này đã ngừng áp dụng hoặc thuộc phiên bản cũ — không thể chọn để tạo mới",
        status: 400,
      };
    }
    const selectionError = await getCatalogEntrySelectionError(personId, entry);
    if (selectionError) return { ok: false, error: selectionError, status: 403 };
    catalogEntryId = entry.id;
    catalogCode = entry.code;
  }

  let productItemId: string | null = null;
  let productCode: string | null = null;
  if (input.productItemId) {
    const product = await prisma.productItem.findUnique({
      where: { id: input.productItemId },
      include: { version: { select: { status: true } } },
    });
    if (!product) return { ok: false, error: "Sản phẩm không tồn tại trong danh mục QĐ1277", status: 400 };
    if (product.status !== "ACTIVE" || product.version?.status !== "ACTIVE") {
      return { ok: false, error: "Sản phẩm này đã ngừng áp dụng, không thể chọn", status: 400 };
    }
    productItemId = product.id;
    productCode = product.code;
  }

  if (!catalogEntryId && !productItemId) return { ok: true, source: null as any };

  return {
    ok: true,
    source: {
      sourceKind: catalogEntryId ? "TX_CATALOG" : "QD1277_PRODUCT",
      sourceRefId: (catalogEntryId || productItemId)!,
      sourceCodeSnapshot: catalogCode || productCode || null,
      catalogEntryId,
      productItemId,
    },
  };
}

/**
 * Tìm kỳ đánh giá (MONTH) chứa ngày cho trước.
 * Nếu chưa có kỳ tương ứng → tạo mới (upsert theo type+title, an toàn khi chạy song song).
 */
export async function resolveMonthlyPeriod(date: Date): Promise<string | null> {
  const existing = await prisma.reportingPeriod.findFirst({
    where: {
      type: "MONTH",
      startAt: { lte: date },
      endAt: { gte: date },
    },
    orderBy: { startAt: "desc" },
  });
  if (existing) return existing.id;

  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const title = `Tháng ${month}/${year}`;
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  const period = await prisma.reportingPeriod.upsert({
    where: { type_title: { type: "MONTH", title } },
    update: {},
    create: { type: "MONTH", title, startAt: start, endAt: end },
  });
  return period.id;
}

/** Kỳ đánh giá theo năm/tháng (dùng cho monthly_work_results). */
export async function resolvePeriodByYearMonth(
  year: number,
  month: number
): Promise<string | null> {
  const title = `Tháng ${month}/${year}`;
  const found = await prisma.reportingPeriod.findFirst({
    where: { type: "MONTH", title },
  });
  if (found) return found.id;
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  const period = await prisma.reportingPeriod.upsert({
    where: { type_title: { type: "MONTH", title } },
    update: {},
    create: { type: "MONTH", title, startAt: start, endAt: end },
  });
  return period.id;
}

export interface CreateWorkItemArgs {
  personId: string;
  periodId: string;
  title: string;
  dueDate?: Date | null;
  completedDate?: Date | null;
  expectedResult?: string | null;
  status?: string | null;
  source?: ResolvedSource | null;
  /** Đơn vị chủ trì khi đầu mối là bộ phận (không truyền → chủ trì là cá nhân). */
  primaryOwnerUnitId?: string | null;
  /** Người được phân công phối hợp (ngoài chủ trì). */
  collaboratorIds?: string[];
  assignedById?: string | null;
  /** Liên kết 2 chiều (tuỳ chọn). */
  taskId?: string | null;
  planItemId?: string | null;
  /** Chuỗi công việc gốc (nhiều kỳ). */
  seriesId?: string | null;
  /** Idempotency: nếu đã có bản ghi cùng khoá → trả về bản ghi cũ. */
  idempotencyKey?: string | null;
}

export interface CreatedWorkItem {
  id: string;
  created: boolean;
  sourceKind: SourceKind | null;
}

/**
 * Tạo công việc gốc + bảng phân công + liên kết sản phẩm QĐ1277.
 * KHÔNG nhân bản công việc gốc cho từng người: mọi người là 1 dòng phân công.
 */
export async function createLinkedWorkItem(
  args: CreateWorkItemArgs,
  client: PrismaClient | Prisma.TransactionClient = prisma
): Promise<CreatedWorkItem> {
  const source = args.source || null;

  // Idempotency: trả về bản ghi cũ nếu đã tạo với cùng khoá
  if (args.idempotencyKey) {
    const existing = await client.personalWorkItem.findFirst({
      where: { idempotencyKey: args.idempotencyKey },
    });
    if (existing) {
      return { id: existing.id, created: false, sourceKind: (existing.sourceKind as any) || null };
    }
  }

  const workItem = await client.personalWorkItem.create({
    data: {
      personId: args.personId,
      periodId: args.periodId,
      title: args.title.trim(),
      dueDate: args.dueDate ?? null,
      completedDate: args.completedDate ?? null,
      expectedResult: args.expectedResult ?? null,
      status: args.status || "ACTIVE",
      // YC-38C — provenance
      sourceKind: source?.sourceKind ?? null,
      sourceRefId: source?.sourceRefId ?? null,
      sourceCodeSnapshot: source?.sourceCodeSnapshot ?? null,
      // YC-38C — đầu mối chủ trì (1 trong 2)
      primaryOwnerPersonId: args.primaryOwnerUnitId ? null : args.personId,
      primaryOwnerUnitId: args.primaryOwnerUnitId ?? null,
      // YC-38C — chuỗi công việc gốc
      seriesId: args.seriesId ?? null,
      // YC-31/YC-23 — trục danh mục (độc lập)
      catalogEntryId: source?.catalogEntryId ?? null,
      productItemId: source?.productItemId ?? null,
      taskId: args.taskId ?? null,
      planItemId: args.planItemId ?? null,
      ...(args.idempotencyKey ? { idempotencyKey: args.idempotencyKey } : {}),
    },
  });

  // Bảng phân công: 1 dòng cho chủ trì + 1 dòng cho mỗi người phối hợp
  const collaborators = Array.from(new Set(args.collaboratorIds || [])).filter(
    (p) => p && p !== args.personId
  );
  const assignmentRows = [
    {
      workItemId: workItem.id,
      personId: args.personId,
      periodId: args.periodId,
      role: "PRIMARY_OWNER",
      status: "ASSIGNED",
      assignedById: args.assignedById ?? null,
    },
    ...collaborators.map((p) => ({
      workItemId: workItem.id,
      personId: p,
      periodId: args.periodId,
      role: "COLLABORATOR",
      status: "ASSIGNED",
      assignedById: args.assignedById ?? null,
    })),
  ];
  await client.workItemAssignment.createMany({ data: assignmentRows, skipDuplicates: true });

  // Liên kết sản phẩm QĐ1277 (0..n) — không cộng điểm, không tính trùng
  if (source?.productItemId) {
    await client.workItemProduct.createMany({
      data: [{ workItemId: workItem.id, productItemId: source.productItemId, isPrimary: true }],
      skipDuplicates: true,
    });
  }

  return { id: workItem.id, created: true, sourceKind: source?.sourceKind ?? null };
}
