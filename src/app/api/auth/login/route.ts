import { NextRequest, NextResponse } from "next/server";
import { getAccountWithPermissions, verifyPassword, signToken } from "@/server/auth";
import { jsonError } from "@/server/guard";
import { prisma } from "@/server/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, password } = body;

    if (!username || !password) {
      return jsonError("Vui lòng cung cấp đầy đủ tên đăng nhập và mật khẩu", 400);
    }

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

    const isValid = await verifyPassword(password, account.passwordHash);
    if (!isValid) {
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
    response.cookies.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (error: any) {
    console.error("Login error:", error);
    return jsonError("Lỗi hệ thống khi đăng nhập: " + error.message, 500);
  }
}
