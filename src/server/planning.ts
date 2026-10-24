/**
 * Quy tắc truy cập và liên kết kế hoạch công tác.
 *
 * Phạm vi Phase A:
 * - Kế hoạch vẫn là cấp đơn vị (chưa có trường Plan scope cá nhân — D1 chưa chốt).
 * - Chỉ người có quyền plans.create trong phạm vi đơn vị mới được tạo/sửa kế hoạch.
 * - Kế hoạch đã trình duyệt (SUBMITTED) hoặc đã duyệt/có hiệu lực thì khóa nội dung;
 *   đã duyệt/có hiệu lực tiếp tục dùng luồng bổ sung theo quy định hiện hành.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { SessionUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { checkPermission, getAuthorizedUnitIds } from "@/server/guard";
import { normalizeTitle } from "@/server/idempotency";

export const PLAN_CONTENT_EDITABLE = ["DRAFT", "RETURNED"] as const;
export const PLAN_CONTENT_LOCKED = ["SUBMITTED", "APPROVED", "IN_EFFECT"] as const;

/**
 * Task 3C — trạng thái được phép hủy mềm kế hoạch trùng.
 * SUBMITTED/APPROVED/IN_EFFECT phải đi theo quy trình trả lại/điều chỉnh,
 * không xóa/hủy trực tiếp.
 */
export const PLAN_CANCELABLE_STATUSES = ["DRAFT", "RETURNED"] as const;

/** Trạng thái đánh dấu kế hoạch trùng đã được hủy mềm (không xóa cứng). */
export const PLAN_CANCELED_STATUS = "CANCELED";

export type PlanAccessShape = {
  id: string;
  unitId: string;
  creatorId: string;
  status: string;
  title: string;
  periodId?: string;
};

export function isPlanContentEditable(status: string): boolean {
  return (PLAN_CONTENT_EDITABLE as readonly string[]).includes(status);
}

export function planContentLockMessage(plan: { status: string; title: string }): string | null {
  if (plan.status === "SUBMITTED") {
    return `Kế hoạch "${plan.title}" đang chờ phê duyệt — nội dung đã khóa. Hãy yêu cầu trả lại nếu cần sửa.`;
  }
  if (plan.status === "APPROVED" || plan.status === "IN_EFFECT") {
    return `Kế hoạch "${plan.title}" đã phê duyệt — hãy dùng “Trình duyệt bổ sung” thay vì sửa trực tiếp.`;
  }
  // Task 3C: kế hoạch đã hủy mềm là trạng thái cuối, không được thêm/sửa
  // hạng mục hay gắn liên kết mới.
  if (plan.status === "CANCELED") {
    return `Kế hoạch "${plan.title}" đã được hủy — không thể thay đổi nội dung.`;
  }
  return null;
}

/**
 * Quyền quản lý nội dung kế hoạch (tạo hạng mục/sửa/xóa).
 * Không mở cho SYSTEM_ADMIN và không mở cho cán bộ không có plans.create.
 */
export async function canManagePlanContent(
  user: SessionUser,
  plan: PlanAccessShape
): Promise<boolean> {
  if (user.role === "SYSTEM_ADMIN") return false;
  if (!checkPermission(user, "plans.create")) return false;

  const authorizedUnits = await getAuthorizedUnitIds(user);
  if (authorizedUnits !== "ALL" && !authorizedUnits.includes(plan.unitId)) {
    return false;
  }

  // Trưởng bộ phận/Trưởng đơn vị quản lý kế hoạch trong phạm vi;
  // cán bộ có quyền tạo chỉ quản lý kế hoạch do chính mình tạo.
  if (user.role === "UNIT_LEADER" || user.role === "DEPARTMENT_LEADER") return true;
  return plan.creatorId === user.personId;
}

/**
 * Quyền sửa thông tin cấp kế hoạch (hiện chỉ tiêu đề).
 *
 * - Người tạo được sửa kế hoạch của chính mình kể cả khi không còn quyền
 *   `plans.create` (quyền sửa gắn với chính bản ghi họ đã lập).
 * - Lãnh đạo/Trưởng bộ phận theo đúng policy quản lý nội dung hiện hành
 *   (`canManagePlanContent`: có `plans.create` + trong phạm vi đơn vị).
 * - Trạng thái được sửa do route kiểm tra: chỉ DRAFT/RETURNED.
 */
export async function canEditPlanTitle(
  user: SessionUser,
  plan: PlanAccessShape
): Promise<boolean> {
  if (user.role === "SYSTEM_ADMIN") return false;
  if (plan.creatorId === user.personId) return true;
  return canManagePlanContent(user, plan);
}

/** Thông báo lý do không thể hủy mềm kế hoạch (null = được phép). */
export function planCancelStatusMessage(plan: { status: string; title: string }): string | null {
  if ((PLAN_CANCELABLE_STATUSES as readonly string[]).includes(plan.status)) return null;
  if (plan.status === "SUBMITTED") {
    return `Kế hoạch "${plan.title}" đang chờ phê duyệt — không thể hủy. Hãy yêu cầu trả lại trước khi xử lý.`;
  }
  if (plan.status === "APPROVED" || plan.status === "IN_EFFECT") {
    return `Kế hoạch "${plan.title}" đã phê duyệt/có hiệu lực — không thể hủy trực tiếp. Hãy dùng quy trình điều chỉnh.`;
  }
  if (plan.status === PLAN_CANCELED_STATUS) {
    return `Kế hoạch "${plan.title}" đã được hủy trước đó.`;
  }
  return `Kế hoạch "${plan.title}" ở trạng thái "${plan.status}" — chỉ hủy được kế hoạch DRAFT hoặc RETURNED.`;
}

/**
 * Quyền hủy mềm kế hoạch trùng.
 *
 * - Người tạo được hủy bản nháp của chính mình, trong phạm vi đơn vị được xem.
 * - Lãnh đạo/Trưởng bộ phận hủy theo policy quản lý nội dung (`plans.create` + phạm vi).
 * - Luôn chặn SYSTEM_ADMIN và người ngoài phạm vi đơn vị của kế hoạch.
 */
export async function canCancelPlan(
  user: SessionUser,
  plan: PlanAccessShape
): Promise<boolean> {
  if (user.role === "SYSTEM_ADMIN") return false;

  const authorizedUnits = await getAuthorizedUnitIds(user);
  if (authorizedUnits !== "ALL" && !authorizedUnits.includes(plan.unitId)) {
    return false;
  }

  if (plan.creatorId === user.personId) return true;
  if (user.role === "UNIT_LEADER" || user.role === "DEPARTMENT_LEADER") {
    return checkPermission(user, "plans.create");
  }
  return false;
}

export interface DuplicatePlanSummary {
  id: string;
  title: string;
  status: string;
  createdAt: Date;
}

type PlanReadClient = Pick<PrismaClient, "plan"> | Prisma.TransactionClient;

/**
 * Tìm kế hoạch trùng: cùng đơn vị + cùng kỳ + tiêu đề chuẩn hóa
 * (trim/gộp khoảng trắng/lowercase qua `normalizeTitle`).
 *
 * Kế hoạch đã hủy mềm (CANCELED) không tính là trùng — cho phép tạo lại bản đúng.
 * Không dùng unique index vì dữ liệu cũ có thể đã trùng; chỉ chặn phát sinh mới.
 */
export async function findDuplicatePlan(
  args: {
    unitId: string;
    periodId: string;
    title: string;
    excludePlanId?: string;
  },
  client: PlanReadClient = prisma
): Promise<DuplicatePlanSummary | null> {
  const candidates = await client.plan.findMany({
    where: {
      unitId: args.unitId,
      periodId: args.periodId,
      status: { not: PLAN_CANCELED_STATUS },
      ...(args.excludePlanId ? { id: { not: args.excludePlanId } } : {}),
    },
    select: { id: true, title: true, status: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  const normalized = normalizeTitle(args.title);
  return candidates.find((plan) => normalizeTitle(plan.title) === normalized) || null;
}

export interface PlanItemLinkValidation {
  ok: boolean;
  status?: number;
  message?: string;
  planItem?: {
    id: string;
    planId: string;
    title: string;
    plan: PlanAccessShape;
  };
}

/**
 * Kiểm tra một hạng mục kế hoạch trước khi gắn đầu việc:
 * tồn tại, đúng kỳ, đúng phạm vi đơn vị, kế hoạch còn được sửa và cán bộ thuộc đơn vị kế hoạch.
 */
export async function validatePlanItemLink(args: {
  planItemId: string;
  personId: string;
  periodId: string;
  user: SessionUser;
}): Promise<PlanItemLinkValidation> {
  const planItem = await prisma.planItem.findUnique({
    where: { id: args.planItemId },
    select: {
      id: true,
      planId: true,
      title: true,
      plan: {
        select: {
          id: true,
          unitId: true,
          creatorId: true,
          status: true,
          title: true,
          periodId: true,
        },
      },
    },
  });

  if (!planItem) {
    return { ok: false, status: 400, message: "Hạng mục kế hoạch không tồn tại" };
  }

  const lockMessage = planContentLockMessage(planItem.plan);
  if (lockMessage) {
    return { ok: false, status: planItem.plan.status === "SUBMITTED" ? 409 : 403, message: lockMessage };
  }

  if (planItem.plan.periodId !== args.periodId) {
    return {
      ok: false,
      status: 400,
      message: "Kỳ của hạng mục không khớp với kỳ của đầu việc",
    };
  }

  const authorizedUnits = await getAuthorizedUnitIds(args.user);
  if (
    authorizedUnits !== "ALL" &&
    !authorizedUnits.includes(planItem.plan.unitId)
  ) {
    return {
      ok: false,
      status: 403,
      message: "Bạn không có quyền gắn đầu việc vào kế hoạch của đơn vị khác",
    };
  }

  const person = await prisma.person.findUnique({
    where: { id: args.personId },
    select: {
      id: true,
      status: true,
      assignments: { select: { unitId: true } },
    },
  });
  if (!person || person.status !== "ACTIVE") {
    return { ok: false, status: 400, message: "Cán bộ phụ trách không tồn tại hoặc đã ngừng hoạt động" };
  }
  if (!person.assignments.some((a) => a.unitId === planItem.plan.unitId)) {
    return {
      ok: false,
      status: 400,
      message: "Cán bộ phụ trách không thuộc đơn vị của kế hoạch đã chọn",
    };
  }

  return { ok: true, planItem };
}

/**
 * Kiểm tra liên kết QĐ1277 có thuộc phiên bản đang áp dụng hay không.
 * Không suy diễn hệ số/điểm; chỉ xác thực danh mục.
 */
export async function getActiveProductError(productItemId: string): Promise<string | null> {
  const product = await prisma.productItem.findUnique({
    where: { id: productItemId },
    include: { version: { select: { status: true } } },
  });
  if (!product) return "Sản phẩm không tồn tại trong danh mục QĐ1277";
  if (product.status !== "ACTIVE" || product.version?.status !== "ACTIVE") {
    return "Sản phẩm này đã ngừng áp dụng, không thể chọn";
  }
  return null;
}
