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
            groupName: true,
            convertFactor: true,
            status: true,
            group: { select: { code: true, title: true } },
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
        groupName: i.productItem.group?.title || i.productItem.groupName || null,
        factor: i.productItem.convertFactor,
        factorSource: i.factorSource || "QD1277_PRODUCT",
        factorSnapshot: i.factorSnapshot,
        isPrimary: i.isPrimary,
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

    const created = await prisma.$transaction(async (tx) => {
      const existing = await tx.workItemProduct.findFirst({
        where: { workItemId, productItemId },
      });
      if (existing) {
        const err: any = new Error("Công việc này đã gắn mã sản phẩm này.");
        err.statusCode = 409;
        throw err;
      }

      // Liên kết đầu tiên là sản phẩm chính. Đồng thời giữ con trỏ
      // PersonalWorkItem.productItemId trỏ đúng liên kết chính, tránh
      // trường hợp có WorkItemProduct nhưng con trỏ null (dữ liệu mồ côi).
      const isFirstLink = (await tx.workItemProduct.count({ where: { workItemId } })) === 0;
      const link = await tx.workItemProduct.create({
        data: {
          workItemId,
          productItemId,
          isPrimary: isFirstLink,
          quantity: quantity === undefined || quantity === null || quantity === "" ? null : Number(quantity),
          quantityUnit: quantityUnit ? String(quantityUnit).trim() : null,
          note: note ? String(note).trim() : null,
          reviewState: "PROPOSED",
          proposedById: user.personId,
          proposedAt: new Date(),
        },
      });
      if (isFirstLink) {
        await tx.personalWorkItem.update({
          where: { id: workItemId },
          data: { productItemId },
        });
      }
      return link;
    }).catch((err: any) => {
      if (err?.statusCode === 409) throw err;
      if (err?.code === "P2002") {
        const dup: any = new Error("Công việc này đã gắn mã sản phẩm này.");
        dup.statusCode = 409;
        throw dup;
      }
      throw err;
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
    if (err?.statusCode) return jsonError(err.message, err.statusCode);
    console.error("[WORK_ITEM_PRODUCTS] lỗi đề xuất:", err);
    return jsonError("Không đề xuất được mã sản phẩm.", 500);
  }
}

/**
 * Bỏ một sản phẩm QĐ1277 do CHÍNH NGƯỜI THỰC HIỆN đề xuất, khi hồ sơ chưa khóa.
 * - Không xóa liên kết đã được lãnh đạo xác nhận.
 * - Nếu sản phẩm bị bỏ đang là sản phẩm chính, chuyển con trỏ chính sang liên kết còn lại
 *   (hoặc null) để không còn tham chiếu mồ côi.
 */
export async function DELETE(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);

    const body = await req.json().catch(() => ({}));
    const workItemId = String(body.workItemId || "").trim();
    const productItemId = String(body.productItemId || "").trim();
    if (!workItemId || !productItemId) {
      return jsonError("Thiếu đầu việc hoặc mã sản phẩm cần bỏ", 400);
    }

    const access = await checkWorkItemAccess(user, workItemId);
    if (!access.allowed || !access.item) {
      return jsonError(access.reason || "Bạn không có quyền bỏ sản phẩm của công việc này", 403);
    }
    if (access.item.personId !== user.personId) {
      return jsonError("Chỉ người thực hiện công việc mới được bỏ mã sản phẩm đã đề xuất.", 403);
    }
    if (isWorkItemReviewLocked(access.item)) {
      return jsonError(
        "Công việc đã gửi hoặc đã được xác nhận — không thể tự bỏ sản phẩm.",
        409
      );
    }

    let removed: { code: string; wasPrimary: boolean } | null = null;
    try {
      removed = await prisma.$transaction(async (tx) => {
        const link = await tx.workItemProduct.findFirst({
          where: { workItemId, productItemId },
          include: { productItem: { select: { code: true } } },
        });
        if (!link) return null;

        if (link.reviewState === "CONFIRMED") {
          const err: any = new Error(
            "Sản phẩm này đã được lãnh đạo xác nhận — không thể bỏ."
          );
          err.statusCode = 409;
          throw err;
        }

        const wasPrimary = link.isPrimary;
        await tx.workItemProduct.delete({ where: { id: link.id } });

        const currentItem = await tx.personalWorkItem.findUnique({
          where: { id: workItemId },
          select: { productItemId: true },
        });
        if (wasPrimary || currentItem?.productItemId === productItemId) {
          const nextLink = await tx.workItemProduct.findFirst({
            where: { workItemId },
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
            select: { id: true, productItemId: true },
          });
          // Giữ đúng một sản phẩm chính sau khi xóa.
          if (nextLink && wasPrimary) {
            await tx.workItemProduct.update({
              where: { id: nextLink.id },
              data: { isPrimary: true },
            });
          }
          await tx.personalWorkItem.update({
            where: { id: workItemId },
            data: { productItemId: nextLink?.productItemId ?? null },
          });
        }

        return { code: link.productItem.code, wasPrimary };
      });
    } catch (err: any) {
      if (err?.statusCode) return jsonError(err.message, err.statusCode);
      throw err;
    }

    if (removed) {
      await recordAuditEvent({
        actorId: user.id,
        action: "WORK_ITEM_PRODUCT_REMOVE",
        resourceType: "WorkItemProduct",
        resourceId: workItemId,
        oldData: {
          workItemId,
          productItemId,
          productCode: removed.code,
          wasPrimary: removed.wasPrimary,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: { workItemId, productItemId, deleted: !!removed },
    });
  } catch (err: any) {
    console.error("[WORK_ITEM_PRODUCTS] lỗi bỏ sản phẩm:", err);
    return jsonError("Không bỏ được mã sản phẩm.", 500);
  }
}
