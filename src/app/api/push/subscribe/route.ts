import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";

/** Đăng ký nhận web-push cho máy hiện tại (1 máy gọi 1 lần). */
export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    const body = await req.json().catch(() => ({}));
    const { endpoint, keys } = body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return jsonError("Thiếu thông tin đăng ký push", 400);
    }
    const ua = req.headers.get("user-agent")?.slice(0, 200) || null;
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { personId: user.personId, p256dh: keys.p256dh, auth: keys.auth, userAgent: ua },
      create: { personId: user.personId, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent: ua },
    });
    return NextResponse.json({ success: true, message: "Đã bật thông báo đẩy trên máy này!" });
  } catch (error: any) {
    return jsonError("Lỗi khi đăng ký push: " + error.message, 500);
  }
}

/** Tắt push trên máy hiện tại. */
export async function DELETE(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    const { searchParams } = new URL(req.url);
    const endpoint = searchParams.get("endpoint") || (await req.json().catch(() => ({})))?.endpoint;
    if (!endpoint) return jsonError("Thiếu endpoint", 400);
    await prisma.pushSubscription.deleteMany({ where: { endpoint, personId: user.personId } });
    return NextResponse.json({ success: true, message: "Đã tắt thông báo đẩy trên máy này." });
  } catch (error: any) {
    return jsonError("Lỗi khi tắt push: " + error.message, 500);
  }
}
