import { NextResponse } from "next/server";
import { SessionUser } from "./auth";
import { prisma } from "./db";
import { recordAuditEvent } from "./audit";

export class AuthorizationError extends Error {
  statusCode: number;
  constructor(message: string = "Bạn không có quyền thực hiện thao tác này", statusCode: number = 403) {
    super(message);
    this.name = "AuthorizationError";
    this.statusCode = statusCode;
  }
}

// Danh sách các quyền quản trị kỹ thuật mà SYSTEM_ADMIN nắm giữ
const SYSTEM_ADMIN_PERMISSIONS = [
  "org.manage",
  "catalog.manage",
  "audit.view",
  "system.config",
  "form.manage",
  "users.manage",
];

export function checkPermission(user: SessionUser, permission: string): boolean {
  // 1. UNIT_LEADER là Lãnh đạo đơn vị: Toàn quyền điều hành và xem xét
  if (user.role === "UNIT_LEADER") {
    return true;
  }

  // 2. SYSTEM_ADMIN: Chỉ có các quyền quản trị kỹ thuật, KHÔNG mặc nhiên có quyền đọc/sửa nội dung nghiệp vụ nhạy cảm
  if (user.role === "SYSTEM_ADMIN") {
    return SYSTEM_ADMIN_PERMISSIONS.includes(permission) || user.permissions.includes(permission);
  }

  // 3. Các vai trò khác: Kiểm tra theo danh sách quyền cụ thể được cấp
  return user.permissions.includes(permission);
}

export async function getAuthorizedUnitIds(
  user: SessionUser,
  isAdministrativeTask: boolean = false
): Promise<string[] | "ALL"> {
  // Lãnh đạo đơn vị được xem toàn bộ
  if (user.role === "UNIT_LEADER" || user.scopeType === "ORGANIZATION") {
    // Nếu là admin và là tác vụ quản trị tổ chức kỹ thuật thì cho ALL
    if (user.role === "SYSTEM_ADMIN" && !isAdministrativeTask) {
      return []; // Admin kỹ thuật không xem dữ liệu nghiệp vụ theo đơn vị
    }
    return "ALL";
  }

  const targetUnitId = user.scopeUnitId || user.unitId;
  if (!targetUnitId) {
    return [];
  }

  if (user.scopeType === "SUBTREE") {
    const allUnits = await prisma.orgUnit.findMany({ select: { id: true, parentId: true } });
    const result: string[] = [targetUnitId];
    const findChildren = (parentId: string) => {
      const children = allUnits.filter((u) => u.parentId === parentId);
      for (const c of children) {
        result.push(c.id);
        findChildren(c.id);
      }
    };
    findChildren(targetUnitId);
    return result;
  }

  // Mặc định phạm vi DEPARTMENT
  return [targetUnitId];
}

export async function buildScopedWhereClause(user: SessionUser, unitField: string = "unitId") {
  const authorizedUnits = await getAuthorizedUnitIds(user);
  if (authorizedUnits === "ALL") {
    return {};
  }
  return {
    [unitField]: { in: authorizedUnits },
  };
}

/**
 * Kiểm tra quyền hạn trực tiếp trên một Task cụ thể (Chống lỗ hổng IDOR)
 * Ngăn chặn cán bộ bộ phận A xem/sửa dữ liệu bộ phận B
 */
export async function verifyTaskAccess(
  user: SessionUser,
  taskId: string,
  action: "READ" | "WRITE"
): Promise<{ allowed: boolean; task?: any; reason?: string }> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      assignees: true,
      unit: true,
    },
  });

  if (!task) {
    return { allowed: false, reason: "Nhiệm vụ không tồn tại" };
  }

  // 1. Lãnh đạo đơn vị có quyền truy cập
  if (user.role === "UNIT_LEADER") {
    return { allowed: true, task };
  }

  // 2. Admin kỹ thuật không có quyền truy cập nghiệp vụ nhiệm vụ
  if (user.role === "SYSTEM_ADMIN") {
    await recordAuditEvent({
      actorId: user.id,
      action: "IDOR_ATTEMPT_BLOCKED",
      resourceType: "Task",
      resourceId: taskId,
      newData: { reason: "SYSTEM_ADMIN attempted task access without operational grant" },
    });
    return { allowed: false, reason: "Quản trị kỹ thuật không có quyền truy cập nghiệp vụ chi tiết" };
  }

  const authorizedUnits = await getAuthorizedUnitIds(user);
  const isUnitAuthorized = authorizedUnits === "ALL" || authorizedUnits.includes(task.unitId);
  const isOwner = task.ownerId === user.personId;
  const isAssignee = task.assignees.some((a) => a.personId === user.personId);

  if (action === "READ") {
    // Được xem nếu cùng bộ phận hoặc là người liên quan
    if (isUnitAuthorized || isOwner || isAssignee) {
      return { allowed: true, task };
    }
  } else if (action === "WRITE") {
    // Được sửa nếu là Trưởng bộ phận của đơn vị đó, hoặc là chủ sở hữu / người được phân công
    const isDeptLeader = user.role === "DEPARTMENT_LEADER" && isUnitAuthorized;
    if (isDeptLeader || isOwner || isAssignee) {
      return { allowed: true, task };
    }
  }

  // Ghi nhận hành vi vượt quyền IDOR vào audit log
  await recordAuditEvent({
    actorId: user.id,
    action: "IDOR_ATTEMPT_BLOCKED",
    resourceType: "Task",
    resourceId: taskId,
    newData: {
      userUnit: user.unitId,
      taskUnit: task.unitId,
      userRole: user.role,
      action,
    },
  });

  return {
    allowed: false,
    reason: "Bạn không có quyền truy cập nhiệm vụ thuộc bộ phận/cá nhân khác (Phạm vi bảo vệ)",
  };
}

export function jsonError(message: string, status: number = 400) {
  return NextResponse.json({ error: message, success: false }, { status });
}
