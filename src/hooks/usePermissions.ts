"use client";

import { useEffect, useState } from "react";

export interface ClientSessionUser {
  id: string;
  personId: string;
  username: string;
  fullName: string;
  role: string;
  scopeType?: string;
  permissions: string[];
}

// Quyền kỹ thuật của SYSTEM_ADMIN (soi gương guard.ts — chỉ để hiển thị, backend vẫn chặn thật)
const SYSTEM_ADMIN_TECH = [
  "org.manage",
  "catalog.manage",
  "audit.view",
  "system.config",
  "form.manage",
  "users.manage",
];

let cachedUser: ClientSessionUser | null | undefined;
let inflight: Promise<ClientSessionUser | null> | null = null;

function loadMe(): Promise<ClientSessionUser | null> {
  if (cachedUser !== undefined) return Promise.resolve(cachedUser);
  if (!inflight) {
    const p: Promise<ClientSessionUser | null> = fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const u: ClientSessionUser | null = json?.user || null;
        cachedUser = u;
        return u;
      })
      .catch(() => {
        cachedUser = null;
        const n: ClientSessionUser | null = null;
        return n;
      });
    inflight = p;
    p.finally(() => {
      inflight = null;
    });
  }
  return inflight as Promise<ClientSessionUser | null>;
}

export function canDo(user: ClientSessionUser | null, permission: string): boolean {
  if (!user) return false;
  if (user.role === "UNIT_LEADER") {
    if (permission === "system.config") {
      return Array.isArray(user.permissions) && user.permissions.includes("system.config");
    }
    return true;
  }
  if (user.role === "SYSTEM_ADMIN") {
    return (
      SYSTEM_ADMIN_TECH.includes(permission) ||
      (Array.isArray(user.permissions) && user.permissions.includes(permission))
    );
  }
  return Array.isArray(user.permissions) && user.permissions.includes(permission);
}

/**
 * Hook quyền hiển thị (display-only): ẩn menu/nút mà tài khoản không được dùng,
 * thay vì hiện ra rồi chặn 403 khi bấm. Backend vẫn là chốt chặn cuối cùng.
 */
export function usePermissions() {
  const [user, setUser] = useState<ClientSessionUser | null | undefined>(cachedUser);
  const [loading, setLoading] = useState(cachedUser === undefined);

  useEffect(() => {
    if (cachedUser !== undefined) return;
    loadMe().then((u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  const role = user?.role || "";
  const can = (permission: string) => canDo(user || null, permission);
  const isUnitLeader = role === "UNIT_LEADER";
  const isDeptLeader = role === "DEPARTMENT_LEADER";
  const canApprove = isUnitLeader || isDeptLeader;
  const canAssign = isUnitLeader || isDeptLeader || can("tasks.assign");
  const canExport = isUnitLeader || isDeptLeader || can("reports.export");
  const canLock = isUnitLeader || can("plans.approve") || can("reports.export");
  const canManageOrg =
    can("org.manage") || can("users.manage") || isUnitLeader || role === "SYSTEM_ADMIN";
  const canManageCatalog = can("catalog.manage");
  const canAudit = can("audit.view");
  const showAdminMenu = isUnitLeader || role === "SYSTEM_ADMIN";

  return {
    user: user || null,
    loading,
    can,
    isUnitLeader,
    isDeptLeader,
    canApprove,
    canAssign,
    canExport,
    canLock,
    canManageOrg,
    canManageCatalog,
    canAudit,
    showAdminMenu,
  };
}
