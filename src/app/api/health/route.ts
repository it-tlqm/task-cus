import { NextResponse } from "next/server";
import { prisma } from "@/server/db";

/** Sức khỏe hệ thống cho giám sát/uptime (không cần đăng nhập, không lộ dữ liệu). */
export async function GET() {
  const started = Date.now();
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    return NextResponse.json({
      success: true,
      status: "ok",
      db: "up",
      latencyMs: Date.now() - started,
      time: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, status: "degraded", db: "down", error: error.message },
      { status: 503 }
    );
  }
}
