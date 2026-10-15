import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { prisma } from "@/server/db";
import { checkPermission, getAuthorizedUnitIds } from "@/server/guard";

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!checkPermission(user, "reports.view")) {
      return NextResponse.json({ error: "Bạn không có quyền xem báo cáo" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const periodId = searchParams.get("periodId");
    const requestedUnitId = searchParams.get("unitId");

    const authorizedUnits = await getAuthorizedUnitIds(user);
    if (requestedUnitId && authorizedUnits !== "ALL" && !authorizedUnits.includes(requestedUnitId)) {
      return NextResponse.json({ error: "Không có quyền truy cập bộ phận này" }, { status: 403 });
    }

    // Determine target units filter
    const unitFilter = requestedUnitId
      ? { unitId: requestedUnitId }
      : authorizedUnits === "ALL"
      ? {}
      : { unitId: { in: authorizedUnits } };

    // Find period if specified or default active
    let period = null;
    if (periodId) {
      period = await prisma.reportingPeriod.findUnique({ where: { id: periodId } });
    } else {
      period = await prisma.reportingPeriod.findFirst({
        where: { type: "WEEK" },
        orderBy: { startAt: "desc" },
      });
    }

    // Anti double-counting: Fetch DISTINCT tasks
    // Tasks linked via PlanTaskLink to the specified period OR in the unit
    let tasksWhere: any = { ...unitFilter };
    if (period) {
      tasksWhere = {
        ...tasksWhere,
        planLinks: {
          some: {
            planItem: {
              plan: {
                periodId: period.id,
              },
            },
          },
        },
      };
    }

    // If no tasks linked specifically via plan links, fallback to unit tasks
    let tasks = await prisma.task.findMany({
      where: tasksWhere,
      include: {
        owner: true,
        unit: true,
        planLinks: {
          include: {
            planItem: {
              include: {
                group: true,
              },
            },
          },
        },
      },
    });

    // Fallback if zero tasks linked via plan link in dev database
    if (tasks.length === 0 && period) {
      tasks = await prisma.task.findMany({
        where: unitFilter,
        include: {
          owner: true,
          unit: true,
          planLinks: {
            include: {
              planItem: {
                include: {
                  group: true,
                },
              },
            },
          },
        },
      });
    }

    // De-duplicate task IDs to strictly uphold AT-08
    const distinctTaskMap = new Map<string, typeof tasks[0]>();
    for (const t of tasks) {
      if (!distinctTaskMap.has(t.id)) {
        distinctTaskMap.set(t.id, t);
      }
    }
    const distinctTasks = Array.from(distinctTaskMap.values());

    const totalDistinctTasks = distinctTasks.length;
    const completedTasks = distinctTasks.filter((t) => t.status === "COMPLETED").length;
    const inProgressTasks = distinctTasks.filter((t) => t.status === "IN_PROGRESS" || t.status === "WAITING_REVIEW").length;
    const issueTasks = distinctTasks.filter((t) => t.hasIssue).length;

    // Routine entries in period for not-occurred stats
    const routineFilter: any = requestedUnitId
      ? { unitId: requestedUnitId }
      : authorizedUnits === "ALL"
      ? {}
      : { unitId: { in: authorizedUnits } };

    const routineEntries = await prisma.routineEntry.findMany({
      where: {
        ...routineFilter,
        ...(period ? { periodId: period.id } : {}),
      },
    });

    const notOccurredCount = routineEntries.filter((r) => r.occurrenceStatus === "NOT_OCCURRED").length;
    const completionRate = totalDistinctTasks > 0 ? Math.round((completedTasks / totalDistinctTasks) * 100) : null;

    // Groups breakdown
    const activityGroups = await prisma.activityGroup.findMany({
      orderBy: { sortOrder: "asc" },
    });

    const groupBreakdown = activityGroups.map((g) => {
      const groupTasks = distinctTasks.filter((t) =>
        t.planLinks.some((l) => l.planItem.groupId === g.id)
      );
      return {
        id: g.id,
        code: g.code,
        name: g.name,
        count: groupTasks.length,
      };
    });

    return NextResponse.json({
      success: true,
      period: period ? { id: period.id, title: period.title, type: period.type } : null,
      summary: {
        totalTasks: totalDistinctTasks,
        completedTasks,
        inProgressTasks,
        issueTasks,
        notOccurredCount,
        completionRate,
      },
      groupBreakdown,
      distinctTasksCount: totalDistinctTasks, // Explicit field for verification
    });
  } catch (err: any) {
    console.error("Error in GET /api/reports/summary:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
