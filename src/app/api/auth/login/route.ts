import { NextRequest, NextResponse } from "next/server";
import { getAccountWithPermissions, verifyPassword, signToken } from "@/server/auth";
import { jsonError } from "@/server/guard";
import { prisma } from "@/server/db";

// Chống dò mật khẩu bằng DB (đếm LOGIN_FAILED theo username trong 10 phút).
// Không dùng bộ nhớ tiến trình vì Vercel chạy nhiều instance (mất tác dụng),
// cũng không khóa theo IP vì cả đơn vị chung 1 IP NAT sẽ khóa oan hàng loạt.
const LOGIN_MAX_FAILS = 10;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;

async function loginFailCount(username: string): Promise<number> {
  const u = username.trim();
  return prisma.auditEvent.count({
    where: {
      action: "LOGIN_FAILED",
      timestamp: { gte: new Date(Date.now() - LOGIN_WINDOW_MS) },
      OR: [
        { newData: { path: ["username"], equals: u } },
        { newData: { path: ["username"], equals: u.toLowerCase() } },
      ],
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, password, remember } = body;

    // IP thật của người đăng nhập (sau proxy Vercel: chặng đầu của x-forwarded-for)
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      undefined;

    if (!username || !password) {
      return jsonError("Vui lòng cung cấp đầy đủ tên đăng nhập và mật khẩu", 400);
    }

    // Chống dò mật khẩu: khóa tạm sau nhiều lần sai (đếm trên DB để đa instance vẫn chặn được)
    if ((await loginFailCount(username)) >= LOGIN_MAX_FAILS) {
      return jsonError("Tài khoản tạm khóa đăng nhập 10 phút do nhập sai quá nhiều lần", 429);
    }

    const account = await getAccountWithPermissions(username);
    if (!account) {
      await prisma.auditEvent.create({
        data: {
          action: "LOGIN_FAILED",
          resourceType: "Account",
          ipAddress: clientIp,
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
          ipAddress: clientIp,
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
          ipAddress: clientIp,
          newData: { username: account.username, personStatus: account.personStatus },
        },
      });
      return jsonError("Hồ sơ cán bộ công chức đã ngừng công tác", 403);
    }

    const isValid = await verifyPassword(password, account.passwordHash);
    if (!isValid) {
      // Ghi LOGIN_FAILED vào DB — lần sau loginFailCount() sẽ đếm (khóa 10 phút khi đủ 10 lần)
      await prisma.auditEvent.create({
        data: {
          actorId: account.id,
          action: "LOGIN_FAILED",
          resourceType: "Account",
          resourceId: account.id,
          ipAddress: clientIp,
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

    const token = signToken(sessionUser, remember !== false);

    // Record login audit event
    await prisma.auditEvent.create({
      data: {
        actorId: account.id,
        action: "LOGIN",
        resourceType: "Account",
        resourceId: account.id,
        ipAddress: clientIp,
        newData: { username: account.username, role: account.role },
      },
    });

    const response = NextResponse.json({
      success: true,
      user: sessionUser,
      token,
    });

    // Set cookie (không "ghi nhớ" thì cookie theo phiên trình duyệt + token 8h)
    const host = req.headers.get("host") || "";
    const isLocal = host.includes("localhost") || host.includes("127.0.0.1");
    const keepLogin = remember !== false;
    response.cookies.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" && !isLocal,
      sameSite: "lax",
      path: "/",
      ...(keepLogin ? { maxAge: 60 * 60 * 24 * 7 } : {}),
    });

    return response;
  } catch (error: any) {
    console.error("Login error:", error);
    return jsonError("Lỗi hệ thống khi đăng nhập: " + error.message, 500);
  }
}
