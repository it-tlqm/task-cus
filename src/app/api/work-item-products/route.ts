/**
 * /api/work-item-products — V3.0.2: sản phẩm QĐ1277 của một công việc (nhiều SP / SP)
 *
 * GET  ?workItemId=  : danh sách SP kèm trạng thái xác nhận
 * POST               : công chức ĐỀ XUẤT mã SP (Q-B4/A-1) cho công việc của mình
 *
 * Nguyên tắc: không tự chọn hệ số; hệ số chỉ được CHỐT (snapshot) khi lãnh đạo xác nhận.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";
import { checkWorkItemAccess } from "@/server/work-access";
import { isWorkItemReviewLocked, canReviewAsDirectLeader } from "@/server/work-item-review";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    const workItemId = req.nextUrl.searchParams.get("workItemId");
    if (!workItemId) return jsonError("Thiếu mã đầu việc", 400);

    const access = await checkWorkItemAccess(user, workItemId);
    if (!access.allowed || !access.item) {
      return jsonError(access.reason || "Bạn không có quyền xem sản phẩm của công việc này", 403);
    }

    const items = await prisma.workItemProduct.findMany({
      where: { workItemId },
      include: {
        productItem: {
          select: {
            id: true,
            code: true,
            taskName: true,
            outputProduct: true,
            convertFactor: true,
            status: true,
            version: { select: { code: true, status: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const canReview = await canReviewAsDirectLeader(user, access.item.personId);
    return NextResponse.json({
      success: true,
      data: items.map((i) => ({
        id: i.id,
        productItemId: i.productItemId,
        code: i.productItem.code,
        taskName: i.productItem.taskName,
        outputProduct: i.productItem.outputProduct,
        factor: i.productItem.convertFactor,
        factorSource: i.factorSource || "QD1277_PRODUCT",
        factorSnapshot: i.factorSnapshot,
        quantity: i.quantity,
        quantityUnit: i.quantityUnit,
        note: i.note,
        reviewState: i.reviewState || null,
        proposedAt: i.proposedAt,
        confirmedAt: i.confirmedAt,
        confirmedById: i.confirmedById,
        catalogStatus: i.productItem.status,
        catalogVersion: i.productItem.version?.code || null,
        canReview,
      })),
    });
  } catch (err: any) {
    console.error("[WORK_ITEM_PRODUCTS] lỗi:", err);
    return jsonError("Không tải được danh sách sản phẩm.", 500);
  }
}

/** Công chức đề xuất mã SP cho công việc của mình (Q-B4/A-1). */
export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);

    const body = await req.json().catch(() => ({}));
    const { workItemId, productItemId, quantity, quantityUnit, note } = body;
    if (!workItemId || !productItemId) return jsonError("Thiếu đầu việc hoặc mã sản phẩm", 400);

    const access = await checkWorkItemAccess(user, workItemId);
    if (!access.allowed || !access.item) {
      return jsonError(access.reason || "Bạn không có quyền gắn sản phẩm cho công việc này", 403);
    }
    // Người đề xuất phải là người thực hiện công việc (lãnh đạo chỉ xác nhận)
    if (access.item.personId !== user.personId) {
      return jsonError("Chỉ người thực hiện công việc mới đề xuất được mã sản phẩm.", 403);
    }

    // Đã gửi/đã xác nhận ⇒ khoá; bổ sung SP sau nghiệm thu đi qua quy trình riêng (Q-B4/A-2)
    if (isWorkItemReviewLocked(access.item)) {
      return jsonError(
        "Công việc đã gửi hoặc đã được xác nhận — không thể tự thêm sản phẩm. Việc bổ sung sản phẩm sau nghiệm thu phải thực hiện theo quy trình đề nghị riêng.",
        409
      );
    }

    const product = await prisma.productItem.findUnique({
      where: { id: productItemId },
      include: { version: { select: { status: true } } },
    });
    if (!product) return jsonError("Mã sản phẩm không tồn tại trong danh mục.", 400);
    if (product.status !== "ACTIVE" || product.version?.status !== "ACTIVE") {
      return jsonError("Mã sản phẩm không thuộc danh mục đang hiệu lực.", 400);
    }

    const existing = await prisma.workItemProduct.findFirst({
      where: { workItemId, productItemId },
    });
    if (existing) {
      return jsonError("Công việc này đã gắn mã sản phẩm này.", 409);
    }

    const created = await prisma.workItemProduct.create({
      data: {
        workItemId,
        productItemId,
        quantity: quantity === undefined || quantity === null || quantity === "" ? null : Number(quantity),
        quantityUnit: quantityUnit ? String(quantityUnit).trim() : null,
        note: note ? String(note).trim() : null,
        reviewState: "PROPOSED",
        proposedById: user.personId,
        proposedAt: new Date(),
      },
    });

    await recordAuditEvent({
      actorId: user.id,
      action: "WORK_ITEM_PRODUCT_PROPOSE",
      resourceType: "WorkItemProduct",
      resourceId: created.id,
      newData: {
        workItemId,
        productItemId,
        productCode: product.code,
        quantity: created.quantity,
        quantityUnit: created.quantityUnit,
      },
    });

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (err: any) {
    console.error("[WORK_ITEM_PRODUCTS] lỗi đề xuất:", err);
    return jsonError("Không đề xuất được mã sản phẩm.", 500);
  }
}
