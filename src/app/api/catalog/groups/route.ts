import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { jsonError } from "@/server/guard";

export async function GET() {
  try {
    const groups = await prisma.activityGroup.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        templates: {
          select: {
            id: true,
            reviewStatus: true,
          },
        },
      },
    });

    const data = groups.map((g) => {
      const total = g.templates.length;
      const active = g.templates.filter((t) => t.reviewStatus === "VERIFIED").length;
      const retired = g.templates.filter((t) => t.reviewStatus === "RETIRED").length;
      const needsReview = g.templates.filter((t) => t.reviewStatus === "NEEDS_REVIEW").length;
      return {
        id: g.id,
        code: g.code,
        name: g.name,
        sortOrder: g.sortOrder,
        description: g.description,
        totalCount: total,
        activeCount: active,
        retiredCount: retired,
        needsReviewCount: needsReview,
        _count: { templates: total },
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return jsonError("Lỗi khi tải nhóm nghiệp vụ: " + error.message, 500);
  }
}
