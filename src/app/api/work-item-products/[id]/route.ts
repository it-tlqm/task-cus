/**
 * /api/work-item-products/[id] — V3.0.2: lãnh đạo trực tiếp xác nhận / từ chối TỪNG sản phẩm.
 *
 * PATCH { action: "CONFIRM" | "REJECT", note? }
 *  - Chỉ lãnh đạo trực tiếp (A1) mới xác nhận được; SYSTEM_ADMIN không xác nhận nghiệp vụ.
 *  - Xác nhận ⇒ chụp lại hệ số tại thời điểm xác nhận (F1-A), KHÔNG sửa danh mục.
 *  - Chỉ sản phẩm đã xác nhận mới đủ điều kiện tính điểm chính thức (Q-B4/A-4).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";
import { canReviewAsDirectLeader, isWorkItemReviewLocked } from "@/server/work-item-review";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);

    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "").toUpperCase();
    const note = String(body.note || "").trim();
    if (action !== "CONFIRM" && action !== "REJECT") {
      return jsonError("Thao tác không hợp lệ.", 400);
    }

    const link = await prisma.workItemProduct.findUnique({
      where: { id },
      include: { workItem: true, productItem: true },
    });
    if (!link) return jsonError("Không tìm thấy sản phẩm gắn với công việc.", 404);
    if (!link.reviewState) {
      return jsonError("Sản phẩm này chưa được đưa vào quy trình xác nhận của V3.", 409);
    }

    const canReview = await canReviewAsDirectLeader(user, link.workItem.personId);
    if (!canReview) {
      return jsonError("Bạn không phải lãnh đạo trực tiếp quản lý công việc này.", 403);
    }
    if (isWorkItemReviewLocked(link.workItem) && link.workItem.reviewState === "CONFIRMED") {
      return jsonError("Công việc đã được xác nhận — không thể thay đổi sản phẩm.", 409);
    }
    if (action === "REJECT" && note.length < 3) {
      return jsonError("Vui lòng ghi rõ lý do để cán bộ điều chỉnh.", 400);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.workItemProduct.update({
        where: { id },
        data:
          action === "CONFIRM"
            ? {
                reviewState: "CONFIRMED",
                confirmedById: user.personId,
                confirmedAt: new Date(),
                note: note || link.note,
                // Chụp lại hệ số tại thời điểm xác nhận — không sửa danh mục
                factorSnapshot: link.productItem.convertFactor,
                factorSource: "QD1277_PRODUCT",
              }
            : {
                reviewState: "REJECTED",
                confirmedById: user.personId,
                confirmedAt: new Date(),
                note: note || link.note,
              },
      });
      await tx.workItemReview.create({
        data: {
          workItemId: link.workItemId,
          action: action === "CONFIRM" ? "SP_CONFIRMED" : "SP_REJECTED",
          note: note || null,
          resultText: `SP ${link.productItem.code}`,
          actorId: user.personId,
        },
      });
      return next;
    });

    await recordAuditEvent({
      actorId: user.id,
      action: action === "CONFIRM" ? "WORK_ITEM_PRODUCT_CONFIRM" : "WORK_ITEM_PRODUCT_REJECT",
      resourceType: "WorkItemProduct",
      resourceId: id,
      oldData: { reviewState: link.reviewState },
      newData: {
        reviewState: action === "CONFIRM" ? "CONFIRMED" : "REJECTED",
        productCode: link.productItem.code,
        factorSnapshot: updated.factorSnapshot,
        note: note || null,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (err: any) {
    console.error("[WORK_ITEM_PRODUCTS] lỗi xác nhận:", err);
    return jsonError("Không xử lý được sản phẩm.", 500);
  }
}
