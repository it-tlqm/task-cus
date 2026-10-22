import { NextRequest, NextResponse } from "next/server";
import { getAccountWithPermissions, verifyPassword, signToken } from "@/server/auth";
import { jsonError } from "@/server/guard";
import { prisma } from "@/server/db";
import { Prisma } from "@prisma/client";

// Chống dò mật khẩu bằng DB (đếm LOGIN_FAILED theo tên đăng nhập ĐÃ CHUẨN HÓA trong 10 phút).
// Không dùng bộ nhớ tiến trình vì Vercel chạy nhiều instance (mất tác dụng),
// cũng không khóa theo IP vì cả đơn vị chung 1 IP NAT sẽ khóa oan hàng loạt.
const LOGIN_MAX_FAILS = 10;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;

// Cán bộ thường gõ tên đăng nhập theo mã trên danh sách giấy (CB-012, 1.CB-001, cb018)
// trong khi tài khoản lưu dạng liền (cb012, cb0018). Chuẩn hóa để gõ kiểu nào cũng đúng tài khoản.
function normalizeLoginKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function loginLookupVariants(raw: string): string[] {
  const t = raw.trim();
  if (!t) return [];
  const withoutListPrefix = t.replace(/^\d{1,3}\s*[\.\)\-:]\s*/, ""); // "1.CB-001" -> "CB-001"
  const norm = normalizeLoginKey(withoutListPrefix);
  const set = new Set<string>([t, t.toLowerCase(), withoutListPrefix.trim(), norm]);
  const m = norm.match(/^([a-z]+)0*(\d+)$/); // cb018 -> tiền tố "cb", số "18"
  if (m) {
    const prefix = m[1];
    const digits = String(Number(m[2]));
    set.add(prefix + digits); // cb18
    set.add(prefix + digits.padStart(3, "0")); // cb018
    set.add(prefix + digits.padStart(4, "0")); // cb0018
  }
  return Array.from(set).filter((s) => s.length > 0 && s.length <= 64);
}

// Tìm tài khoản theo cách gõ linh hoạt; nếu nhiều tài khoản cùng khớp thì từ chối (an toàn).
async function findAccountForLogin(raw: string): Promise<{ id: string; username: string } | null> {
  const variants = loginLookupVariants(raw);
  if (variants.length === 0) return null;
  const found = await prisma.account.findMany({
    where: { OR: variants.map((v) => ({ username: { equals: v, mode: "insensitive" as const } })) },
    select: { id: true, username: true },
    take: 6,
  });
  if (found.length === 0) return null;
  const t = raw.trim();
  const norm = normalizeLoginKey(t.replace(/^\d{1,3}\s*[\.\)\-:]\s*/, ""));
  const exact = found.find((a) => a.username === t);
  if (exact) return exact;
  const ci = found.find((a) => a.username.toLowerCase() === t.toLowerCase() || a.username.toLowerCase() === norm);
  if (ci) return ci;
  return found.length === 1 ? found[0] : null;
}

async function loginFailCount(lockKey: string, legacyNames: string[]): Promise<number> {
  const names = Array.from(
    new Set(legacyNames.map((n) => n.trim()).filter((n) => n.length > 0 && n.length <= 120))
  );
  const or: Prisma.AuditEventWhereInput[] = [{ newData: { path: ["usernameNormalized"], equals: lockKey } }];
  for (const n of names) or.push({ newData: { path: ["username"], equals: n } });
  return prisma.auditEvent.count({
    where: {
      action: "LOGIN_FAILED",
      timestamp: { gte: new Date(Date.now() - LOGIN_WINDOW_MS) },
      OR: or,
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

    if (typeof username !== "string" || typeof password !== "string" || !username.trim() || !password) {
      return jsonError("Vui lòng cung cấp đầy đủ tên đăng nhập và mật khẩu", 400);
    }

    const typedUsername = username.trim().slice(0, 120);

    // Nhận diện tài khoản theo cách gõ linh hoạt (hoa/thường, dấu gạch, "1.CB-001", cb018 ↔ cb0018)
    const resolved = await findAccountForLogin(typedUsername);
    const lockKey = resolved
      ? resolved.username.toLowerCase()
      : normalizeLoginKey(typedUsername) || typedUsername.toLowerCase();

    // Chống dò mật khẩu: khóa tạm sau nhiều lần sai (đếm trên DB để đa instance vẫn chặn được).
    // Đếm theo khóa đã chuẩn hóa nên đổi kiểu gõ cũng không lách được bộ đếm.
    if (
      (await loginFailCount(lockKey, [
        typedUsername,
        typedUsername.toLowerCase(),
        normalizeLoginKey(typedUsername),
        ...(resolved ? [resolved.username, resolved.username.toLowerCase()] : []),
      ])) >= LOGIN_MAX_FAILS
    ) {
      // Chỉ ghi tối đa 3 dòng LOGIN_BLOCKED mỗi khóa/10 phút để không ngập audit khi bị dò liên tục
      const blockedRecent = await prisma.auditEvent.count({
        where: {
          action: "LOGIN_BLOCKED",
          timestamp: { gte: new Date(Date.now() - LOGIN_WINDOW_MS) },
          OR: [{ newData: { path: ["usernameNormalized"], equals: lockKey } }],
        },
      });
      if (blockedRecent < 3) {
        await prisma.auditEvent.create({
          data: {
            actorId: resolved?.id,
            action: "LOGIN_BLOCKED",
            resourceType: "Account",
            resourceId: resolved?.id,
            ipAddress: clientIp,
            newData: {
              username: resolved?.username ?? typedUsername,
              usernameNormalized: lockKey,
              reason: "Quá nhiều lần nhập sai trong 10 phút",
            },
          },
        });
      }
      return jsonError("Tài khoản tạm khóa đăng nhập 10 phút do nhập sai quá nhiều lần", 429);
    }

    const account = resolved ? await getAccountWithPermissions(resolved.username) : null;
    if (!account) {
      await prisma.auditEvent.create({
        data: {
          action: "LOGIN_FAILED",
          resourceType: "Account",
          ipAddress: clientIp,
          newData: { username: typedUsername, usernameNormalized: lockKey, reason: "Account not found" },
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
          newData: {
            username: account.username,
            usernameNormalized: account.username.toLowerCase(),
            reason: "Invalid password",
          },
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
      // Claim trong JWT ⇒ middleware chặn các API/trang khác cho tới khi đổi mật khẩu.
      mustChangePassword: !!account.mustChangePassword,
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
        newData: { username: account.username, usernameNormalized: account.username.toLowerCase(), role: account.role },
      },
    });

    const response = NextResponse.json({
      success: true,
      user: sessionUser,
      token,
      // Tài khoản quản trị khởi tạo: bắt buộc đổi mật khẩu ở lần đăng nhập kế tiếp.
      mustChangePassword: !!account.mustChangePassword,
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
