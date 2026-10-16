import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { NextRequest } from "next/server";

const JWT_FALLBACK_SECRET = "talung_cus_work_demo_jwt_secret_2026";

function requireJwtSecret(): string {
  const configured = process.env.JWT_SECRET;
  if (!configured && process.env.NODE_ENV === "production") {
    throw new Error("SECURITY: JWT_SECRET chưa được cấu hình trong môi trường production");
  }
  if (!configured) {
    console.warn("[auth] JWT_SECRET chưa cấu hình — dùng secret demo, CHỈ cho môi trường phát triển");
  }
  return configured || JWT_FALLBACK_SECRET;
}

export interface SessionUser {
  id: string; // accountId
  personId: string;
  username: string;
  fullName: string;
  personCode?: string;
  positionTitle?: string;
  unitId?: string;
  unitName?: string;
  role: string;
  scopeType: "OWN" | "ASSIGNED" | "DEPARTMENT" | "SUBTREE" | "ORGANIZATION";
  scopeUnitId?: string | null;
  permissions: string[];
}

export async function hashPassword(plain: string): Promise<string> {
  return await bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(plain, hash);
}

export function signToken(user: SessionUser, remember: boolean = true): string {
  return jwt.sign(user, requireJwtSecret(), { expiresIn: remember ? "7d" : "8h" });
}

export function verifyToken(token: string): SessionUser | null {
  try {
    return jwt.verify(token, requireJwtSecret()) as SessionUser;
  } catch {
    return null;
  }
}

interface CachedAuth {
  user: SessionUser;
  expiresAt: number;
}
const authMemoryCache = new Map<string, CachedAuth>();
const AUTH_CACHE_MAX = 1000;

function pruneAuthCache(nowMs: number) {
  if (authMemoryCache.size <= AUTH_CACHE_MAX) return;
  for (const [k, v] of authMemoryCache) {
    if (v.expiresAt <= nowMs) authMemoryCache.delete(k);
    if (authMemoryCache.size <= AUTH_CACHE_MAX / 2) break;
  }
}

export async function authenticateRequest(req: NextRequest): Promise<SessionUser | null> {
  let token: string | undefined;

  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.substring(7);
  } else {
    token = req.cookies.get("token")?.value;
  }

  if (!token) return null;
  const decoded = verifyToken(token);
  if (!decoded) return null;

  const nowMs = Date.now();
  const cached = authMemoryCache.get(token);
  if (cached && cached.expiresAt > nowMs) {
    return cached.user;
  }

  // Kiểm tra thời gian thực trong PostgreSQL:
  // 1. Tài khoản và Cán bộ phải ở trạng thái ACTIVE (thu hồi token ngay nếu bị vô hiệu hóa)
  // 2. Đồng bộ phân công đơn vị và phạm vi quyền hiện hành để triệt tiêu lỗ hổng dùng token cũ truy cập đơn vị cũ sau khi điều chuyển
  const now = new Date();
  const account = await prisma.account.findUnique({
    where: { id: decoded.id },
    include: {
      person: {
        include: {
          assignments: {
            where: {
              isPrimary: true,
              effectiveFrom: { lte: now },
              OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
            },
            include: { unit: true, position: true },
            take: 1,
          },
        },
      },
      roleGrants: {
        where: {
          validFrom: { lte: now },
          OR: [{ validTo: null }, { validTo: { gte: now } }],
        },
        include: {
          role: {
            include: {
              rolePermissions: { include: { permission: true } },
            },
          },
          scopeUnit: true,
        },
      },
    },
  });

  if (!account || account.status !== "ACTIVE" || account.person?.status !== "ACTIVE") {
    return null;
  }

  const primaryAssignment = account.person.assignments[0];
  const primaryGrant = account.roleGrants[0];

  const permissions = new Set<string>();
  for (const grant of account.roleGrants) {
    for (const rp of grant.role.rolePermissions) {
      permissions.add(rp.permission.code);
    }
  }

  // Luôn trả về SessionUser được cập nhật theo cơ sở dữ liệu thực tế tại thời điểm gọi API:
  // Ngay sau khi điều chuyển, unitId và scopeUnitId lập tức trỏ về đơn vị mới!
  const sessionUser: SessionUser = {
    ...decoded,
    unitId: primaryAssignment?.unitId || decoded.unitId,
    unitName: primaryAssignment?.unit?.name || decoded.unitName,
    positionTitle: primaryAssignment?.position?.title || decoded.positionTitle,
    role: primaryGrant?.role.code || decoded.role,
    scopeType: (primaryGrant?.scopeType as SessionUser["scopeType"]) || decoded.scopeType,
    scopeUnitId: primaryGrant?.scopeUnitId !== undefined ? primaryGrant.scopeUnitId : decoded.scopeUnitId,
    permissions: permissions.size > 0 ? Array.from(permissions) : decoded.permissions,
  };

  authMemoryCache.set(token, { user: sessionUser, expiresAt: nowMs + 60_000 });
  pruneAuthCache(nowMs);
  return sessionUser;
}

export async function getAccountWithPermissions(username: string) {
  const account = await prisma.account.findUnique({
    where: { username },
    include: {
      person: {
        include: {
          assignments: {
            where: { isPrimary: true },
            include: { unit: true, position: true },
          },
        },
      },
      roleGrants: {
        include: {
          role: {
            include: {
              rolePermissions: {
                include: { permission: true },
              },
            },
          },
          scopeUnit: true,
        },
      },
    },
  });

  if (!account) return null;

  const primaryAssignment = account.person.assignments[0];
  const primaryGrant = account.roleGrants[0];

  const permissions = new Set<string>();
  for (const grant of account.roleGrants) {
    for (const rp of grant.role.rolePermissions) {
      permissions.add(rp.permission.code);
    }
  }

  return {
    id: account.id,
    personId: account.person.id,
    username: account.username,
    fullName: account.person.fullName,
    personCode: account.person.code,
    positionTitle: primaryAssignment?.position?.title || "Cán bộ công chức",
    unitId: primaryAssignment?.unitId,
    unitName: primaryAssignment?.unit?.name,
    role: primaryGrant?.role.code || "STAFF",
    scopeType: (primaryGrant?.scopeType as SessionUser["scopeType"]) || "DEPARTMENT",
    scopeUnitId: primaryGrant?.scopeUnitId,
    permissions: Array.from(permissions),
    passwordHash: account.passwordHash,
    status: account.status,
    personStatus: account.person.status,
  };
}

export const getCurrentSession = authenticateRequest;

