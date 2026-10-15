import { NextRequest, NextResponse } from "next/server";
import { getAccountWithPermissions, verifyPassword, signToken } from "@/server/auth";
import { jsonError } from "@/server/guard";
import { prisma } from "@/server/db";

const loginAttempts = new Map<string, { count: number; firstAt: number }>();
const LOGIN_MAX_FAILS = 10;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;

function loginRateKey(req: NextRequest, username: string): string {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local";
  return `${ip}::${String(username).toLowerCase()}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, password } = body;

    if (!username || !password) {
      return jsonError("Vui lòng cung cấp đầy đủ tên đăng nhập và mật khẩu", 400);
    }

    // Chống dò mật khẩu: khóa tạm sau nhiều lần sai (bộ nhớ tiến trình — chỉ hiệu lực single-instance;
    // khi scale nhiều node cần chuyển sang Redis/DB)
    const rateKey = loginRateKey(req, username);
    const now = Date.now();
    const tracked = loginAttempts.get(rateKey);
    if (tracked && now - tracked.firstAt < LOGIN_WINDOW_MS && tracked.count >= LOGIN_MAX_FAILS) {
      return jsonError("Tài khoản tạm khóa đăng nhập 10 phút do nhập sai quá nhiều lần", 429);
    }
    const recordLoginFail = () => {
      const cur = loginAttempts.get(rateKey);
      if (!cur || now - cur.firstAt >= LOGIN_WINDOW_MS) {
        loginAttempts.set(rateKey, { count: 1, firstAt: now });
      } else {
        loginAttempts.set(rateKey, { count: cur.count + 1, firstAt: cur.firstAt });
      }
    };

    const account = await getAccountWithPermissions(username);
    if (!account) {
      await prisma.auditEvent.create({
        data: {
          action: "LOGIN_FAILED",
          resourceType: "Account",
          newData: { username, reason: "Account not found" },
        },
      });
      return jsonError("Tên đăng nhập hoặc mật khẩu không chính xác", 401);
    }

    if (account.status !== "ACTIVE") {
      await prisma.auditEvent.create({
        data: {
          actorId: account.id,
          action: "LOGIN_REJECTED_INACTIVE",
          resourceType: "Account",
          resourceId: account.id,
          newData: { username: account.username, status: account.status },
        },
      });
      return jsonError("Tài khoản đã bị vô hiệu hóa hoặc khóa truy cập", 403);
    }

    if (account.personStatus !== "ACTIVE") {
      await prisma.auditEvent.create({
        data: {
          actorId: account.id,
          action: "LOGIN_REJECTED_PERSON_INACTIVE",
          resourceType: "Person",
          resourceId: account.personId,
          newData: { username: account.username, personStatus: account.personStatus },
        },
      });
      return jsonError("Hồ sơ cán bộ công chức đã ngừng công tác", 403);
    }

    const isValid = await verifyPassword(password, account.passwordHash);
    if (!isValid) {
      recordLoginFail();
      await prisma.auditEvent.create({
        data: {
          actorId: account.id,
          action: "LOGIN_FAILED",
          resourceType: "Account",
          resourceId: account.id,
          newData: { username: account.username, reason: "Invalid password" },
        },
      });
      return jsonError("Tên đăng nhập hoặc mật khẩu không chính xác", 401);
    }

    const sessionUser = {
      id: account.id,
      personId: account.personId,
      username: account.username,
      fullName: account.fullName,
      unitId: account.unitId,
      unitName: account.unitName,
      role: account.role,
      scopeType: account.scopeType,
      scopeUnitId: account.scopeUnitId,
      permissions: account.permissions,
    };

    const token = signToken(sessionUser);
    loginAttempts.delete(rateKey);

    // Record login audit event
    await prisma.auditEvent.create({
      data: {
        actorId: account.id,
        action: "LOGIN",
        resourceType: "Account",
        resourceId: account.id,
        newData: { username: account.username, role: account.role },
      },
    });

    const response = NextResponse.json({
      success: true,
      user: sessionUser,
      token,
    });

    // Set cookie
    const host = req.headers.get("host") || "";
    const isLocal = host.includes("localhost") || host.includes("127.0.0.1");
    response.cookies.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" && !isLocal,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (error: any) {
    console.error("Login error:", error);
    return jsonError("Lỗi hệ thống khi đăng nhập: " + error.message, 500);
  }
}
