/**
 * /api/personal-work-items/review-queue — V3.0.1 + P1 (lịch sử phê duyệt)
 *
 * GET ?status=pending|confirmed|returned|all &personId=&month=
 *  - pending  : hồ sơ đang chờ lãnh đạo trực tiếp xác nhận
 *  - confirmed: hồ sơ đã được xác nhận (lịch sử)
 *  - returned : hồ sơ đã bị trả lại (lịch sử)
 *  - all      : toàn bộ hồ sơ trong phạm vi quản lý
 * Mỗi hồ sơ kèm lịch sử gửi → trả lại → gửi lại → xác nhận.
 * Phân quyền kiểm tra tại API: chỉ trả về hồ sơ mà người đăng nhập có quyền xử lý.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";
import {
  canReviewAsDirectLeader,
  listReviewHistory,
  REVIEW_STATE_LABEL,
} from "@/server/work-item-review";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (user.role === "SYSTEM_ADMIN") {
      return NextResponse.json({ success: true, data: [], labels: REVIEW_STATE_LABEL });
    }

    const { searchParams } = new URL(req.url);
    const status = (searchParams.get("status") || "pending").toLowerCase();
    const personId = searchParams.get("personId") || "";
    const month = searchParams.get("month") || "";

    const where: any = {};
    if (status === "pending") where.reviewState = "SUBMITTED";
    else if (status === "confirmed") where.reviewState = "CONFIRMED";
    else if (status === "returned") where.reviewState = "RETURNED";
    else if (status === "all") {
      // đã xử lý (xác nhận / trả lại) hoặc đang chờ
      where.reviewState = { in: ["SUBMITTED", "CONFIRMED", "RETURNED"] };
    }
    if (personId) where.personId = personId;

    const items = await prisma.personalWorkItem.findMany({
      where,
      include: {
        person: { select: { id: true, code: true, fullName: true } },
        period: { select: { id: true, title: true, type: true } },
        product: { select: { id: true, code: true, taskName: true } },
        catalogEntry: { select: { id: true, code: true, title: true } },
        linkedProducts: {
          select: {
            id: true,
            reviewState: true,
            quantity: true,
            quantityUnit: true,
            factorSnapshot: true,
            productItem: { select: { id: true, code: true, taskName: true, convertFactor: true } },
          },
        },
        _count: { select: { evidences: true } },
      },
      orderBy: [{ submittedAt: "desc" }, { updatedAt: "desc" }],
    });

    const visible: any[] = [];
    for (const i of items) {
      // Chỉ lãnh đạo trực tiếp của cán bộ đó mới xử lý/xem được
      if (!(await canReviewAsDirectLeader(user, i.personId))) continue;
      if (month) {
        // lọc theo tháng của kỳ (periodId của đầu việc) hoặc theo tháng gửi
        const p = (i.period?.title || "").match(/(\d{1,2})\/(\d{4})/);
        const submittedMonth = i.submittedAt ? i.submittedAt.getMonth() + 1 : null;
        const periodMonth = p ? Number(p[1]) : null;
        const m = Number(month);
        if (periodMonth !== m && submittedMonth !== m) continue;
      }
      const history = await listReviewHistory(i.id);
      visible.push({
        id: i.id,
        title: i.title,
        reviewState: i.reviewState,
        officialState:
          i.reviewState === "CONFIRMED"
            ? "OFFICIAL"
            : i.reviewState === "SUBMITTED"
              ? "WAITING"
              : i.reviewState === "RETURNED"
                ? "RETURNED"
                : "DRAFT",
        resultText: i.resultText,
        reviewNote: i.reviewNote,
        completedDate: i.completedDate,
        submittedAt: i.submittedAt,
        reviewedAt: i.reviewedAt,
        reviewedById: i.reviewedById,
        submitCount: i.submitCount,
        person: i.person,
        period: i.period,
        catalogEntry: i.catalogEntry,
        product: i.product,
        evidenceCount: i._count?.evidences ?? 0,
        products: i.linkedProducts.map((p) => ({
          id: p.id,
          code: p.productItem.code,
          taskName: p.productItem.taskName,
          factor: p.productItem.convertFactor,
          factorSnapshot: p.factorSnapshot,
          quantity: p.quantity,
          quantityUnit: p.quantityUnit,
          reviewState: p.reviewState,
        })),
        history: history.map((h) => ({
          id: h.id,
          action: h.action,
          note: h.note,
          resultText: h.resultText,
          completedOn: h.completedOn,
          actor: h.actor,
          createdAt: h.createdAt,
        })),
      });
    }

    return NextResponse.json({ success: true, data: visible, labels: REVIEW_STATE_LABEL });
  } catch (err: any) {
    console.error("[REVIEW_QUEUE] lỗi:", err);
    return jsonError("Không tải được danh sách hồ sơ.", 500);
  }
}
