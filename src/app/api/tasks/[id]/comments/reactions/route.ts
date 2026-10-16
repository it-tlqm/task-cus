import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { verifyTaskAccess, jsonError } from "@/server/guard";

const ALLOWED_EMOJI = ["👍", "❤️", "✅"];

/** Bật/tắt reaction cho bình luận (mỗi người 1 emoji 1 lần, bấm lại để gỡ). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    const { id: taskId } = await params;
    const access = await verifyTaskAccess(user, taskId, "WRITE");
    if (!access.allowed) return jsonError(access.reason || "Truy cập bị từ chối", 403);
    const body = await req.json();
    const { commentId, emoji } = body;
    if (!commentId) return jsonError("Thiếu ID bình luận", 400);
    if (!ALLOWED_EMOJI.includes(emoji)) return jsonError("Biểu cảm không hợp lệ", 400);
    const current = await prisma.taskComment.findUnique({ where: { id: commentId } });
    if (!current || current.taskId !== taskId) return jsonError("Bình luận không tồn tại", 404);

    const existing = await prisma.commentReaction.findUnique({
      where: { commentId_personId_emoji: { commentId, personId: user.personId, emoji } },
    });
    let reacted: boolean;
    if (existing) {
      await prisma.commentReaction.delete({ where: { id: existing.id } });
      reacted = false;
    } else {
      await prisma.commentReaction.create({ data: { commentId, personId: user.personId, emoji } });
      reacted = true;
    }
    const counts = await prisma.commentReaction.groupBy({
      by: ["emoji"],
      where: { commentId },
      _count: { emoji: true },
    });
    return NextResponse.json({
      success: true,
      reacted,
      counts: counts.map((c) => ({ emoji: c.emoji, count: c._count.emoji })),
    });
  } catch (error: any) {
    return jsonError("Lỗi khi thả cảm xúc: " + error.message, 500);
  }
}
