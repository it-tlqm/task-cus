/**
 * Quy tắc truy cập và liên kết kế hoạch công tác.
 *
 * Phạm vi Phase A:
 * - Kế hoạch vẫn là cấp đơn vị (chưa có trường Plan scope cá nhân — D1 chưa chốt).
 * - Chỉ người có quyền plans.create trong phạm vi đơn vị mới được tạo/sửa kế hoạch.
 * - Kế hoạch đã trình duyệt (SUBMITTED) hoặc đã duyệt/có hiệu lực thì khóa nội dung;
 *   đã duyệt/có hiệu lực tiếp tục dùng luồng bổ sung theo quy định hiện hành.
 */
import { SessionUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { checkPermission, getAuthorizedUnitIds } from "@/server/guard";

export const PLAN_CONTENT_EDITABLE = ["DRAFT", "RETURNED"] as const;
export const PLAN_CONTENT_LOCKED = ["SUBMITTED", "APPROVED", "IN_EFFECT"] as const;

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
