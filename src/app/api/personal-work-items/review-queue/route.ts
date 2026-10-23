/**
 * /api/personal-work-items/review-queue — V3.0.1 + P1/YC-12 (lịch sử phê duyệt)
 *
 * GET ?status=pending|confirmed|returned|all&person=&personId=&month=&year=
 *  - pending  : hồ sơ đang chờ lãnh đạo trực tiếp xác nhận
 *  - confirmed: hồ sơ đã được xác nhận (lịch sử)
 *  - returned : hồ sơ đã bị trả lại (lịch sử)
 *  - all      : toàn bộ hồ sơ trong phạm vi quản lý
 * Mỗi hồ sơ kèm lịch sử gửi → trả lại → gửi lại → xác nhận.
 *
 * Phân quyền tại API:
 *  - Chờ xử lý: chỉ lãnh đạo trực tiếp hiện tại.
 *  - Lịch sử: lãnh đạo trực tiếp hiện tại HOẶC người đã ra quyết định
 *    (reviewedById) — giữ lịch sử khi tuyến phụ trách thay đổi.
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
import { unaccentSearchIds } from "@/server/search";

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
    const personQuery = (searchParams.get("person") || "").trim();
    const month = Number(searchParams.get("month") || 0);
    const year = Number(searchParams.get("year") || 0);

    const where: any = {};
    if (status === "pending") where.reviewState = "SUBMITTED";
    else if (status === "confirmed") where.reviewState = "CONFIRMED";
    else if (status === "returned") where.reviewState = "RETURNED";
    else if (status === "all") {
      // đã xử lý (xác nhận / trả lại) hoặc đang chờ
      where.reviewState = { in: ["SUBMITTED", "CONFIRMED", "RETURNED"] };
    }

    if (personId) where.personId = personId;
    if (personQuery) {
      const ids = await unaccentSearchIds("people", ["code", "full_name"], personQuery, 500);
      if (!ids || ids.length === 0) {
        return NextResponse.json({ success: true, data: [], labels: REVIEW_STATE_LABEL });
      }
      where.personId = ids.length === 1 ? ids[0] : { in: ids };
    }

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

    // Tên người đã xử lý — reviewedById không khai báo relation trong schema.
    const reviewerIds = Array.from(
      new Set(items.map((i) => i.reviewedById).filter((x): x is string => !!x))
    );
    const reviewers = reviewerIds.length
      ? await prisma.person.findMany({
          where: { id: { in: reviewerIds } },
          select: { id: true, code: true, fullName: true },
        })
      : [];
    const reviewerMap = new Map(reviewers.map((p) => [p.id, p]));

    const visible: any[] = [];
    for (const i of items) {
      // Lãnh đạo trực tiếp hiện tại hoặc chính người đã ra quyết định được xem lịch sử.
      const currentLeader = await canReviewAsDirectLeader(user, i.personId);
      const decidedByMe = !!i.reviewedById && i.reviewedById === user.personId;
      if (!currentLeader && !decidedByMe) continue;

      // Lọc theo tháng/năm của kỳ hoặc thời điểm gửi (theo giờ Việt Nam).
      if (month || year) {
        const p = (i.period?.title || "").match(/(\d{1,2})\/(\d{4})/);
        const periodMonth = p ? Number(p[1]) : null;
        const periodYear = p ? Number(p[2]) : null;
        let submittedMonth: number | null = null;
        let submittedYear: number | null = null;
        if (i.submittedAt) {
          const vn = new Date(i.submittedAt.getTime() + 7 * 3600 * 1000);
          submittedMonth = vn.getUTCMonth() + 1;
          submittedYear = vn.getUTCFullYear();
        }
        const monthOk = !month || periodMonth === month || submittedMonth === month;
        const yearOk = !year || periodYear === year || submittedYear === year;
        if (!monthOk || !yearOk) continue;
      }

      const history = await listReviewHistory(i.id);
      const reviewer = i.reviewedById ? reviewerMap.get(i.reviewedById) ?? null : null;
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
        canDecide: i.reviewState === "SUBMITTED" && currentLeader,
        resultText: i.resultText,
        reviewNote: i.reviewNote,
        completedDate: i.completedDate,
        submittedAt: i.submittedAt,
        reviewedAt: i.reviewedAt,
        reviewedById: i.reviewedById,
        reviewedBy: reviewer,
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
