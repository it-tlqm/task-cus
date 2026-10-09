import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { NextRequest } from "next/server";

const JWT_SECRET = process.env.JWT_SECRET || "talung_cus_work_demo_jwt_secret_2026";

export interface SessionUser {
  id: string; // accountId
  personId: string;
  username: string;
  fullName: string;
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

export function signToken(user: SessionUser): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): SessionUser | null {
  try {
    return jwt.verify(token, JWT_SECRET) as SessionUser;
  } catch {
    return null;
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
  return verifyToken(token);
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
    unitId: primaryAssignment?.unitId,
    unitName: primaryAssignment?.unit?.name,
    role: primaryGrant?.role.code || "STAFF",
    scopeType: (primaryGrant?.scopeType as SessionUser["scopeType"]) || "DEPARTMENT",
    scopeUnitId: primaryGrant?.scopeUnitId,
    permissions: Array.from(permissions),
    passwordHash: account.passwordHash,
  };
}
