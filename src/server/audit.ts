import { prisma } from "./db";

export interface AuditLogParams {
  actorId?: string;
  action: string; // LOGIN, LOGOUT, TASK_CREATE, TASK_UPDATE, TASK_DELETE, ORG_CREATE, PERMISSION_DENIED
  resourceType: string; // Account, Task, Plan, OrgUnit, Security
  resourceId?: string;
  oldData?: any;
  newData?: any;
  ipAddress?: string;
}

export async function recordAuditEvent(params: AuditLogParams) {
  try {
    return await prisma.auditEvent.create({
      data: {
        actorId: params.actorId || null,
        action: params.action,
        resourceType: params.resourceType,
        resourceId: params.resourceId || null,
        oldData: params.oldData ? JSON.parse(JSON.stringify(params.oldData)) : undefined,
        newData: params.newData ? JSON.parse(JSON.stringify(params.newData)) : undefined,
        ipAddress: params.ipAddress || null,
      },
    });
  } catch (err: any) {
    // Không làm sập luồng chính nếu lỗi ghi audit log, nhưng in cảnh báo
    console.error("[AUDIT LOG ERROR]:", err.message);
    return null;
  }
}
