import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { prisma } from "@/server/db";
import { checkPermission, getAuthorizedUnitIds } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";
import {
  generateLegacyReportWorkbook,
  generateDetailedReportWorkbook,
  LegacyReportGroupData,
  DetailedReportItem,
} from "@/lib/excel";
import { getReportSnapshotById } from "@/server/snapshots";

export async function GET(req: NextRequest) {
  try {
    // 1. Kiểm tra xác thực phiên
    const user = await authenticateRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const templateType = searchParams.get("template") || "legacy"; // "legacy" (Mẫu A) hoặc "detailed" (Mẫu B)
    const planId = searchParams.get("planId");
    const periodId = searchParams.get("periodId");
    const requestedUnitId = searchParams.get("unitId");
    const exportScope = searchParams.get("scope");
    const requestedPersonId = searchParams.get("personId");

    const hasExportAllPermission = checkPermission(user, "reports.export") || user.role === "UNIT_LEADER" || user.role === "DEPARTMENT_LEADER";
    const isPersonalScope = exportScope === "personal" || user.role === "STAFF";

    // Chống IDOR: Cán bộ thường chỉ được xuất báo cáo cá nhân của chính mình.
    // Lãnh đạo hoặc tài khoản có quyền reports.export mới được xuất thay cho người khác.
    const targetPersonId = isPersonalScope
      ? (hasExportAllPermission && requestedPersonId ? requestedPersonId : user.personId)
      : requestedPersonId;

    let targetOfficer = null;
    if (targetPersonId) {
      targetOfficer = await prisma.person.findUnique({ where: { id: targetPersonId } });
    }

    const isOwnPersonalExport = isPersonalScope && targetPersonId === user.personId;

    // 2. Kiểm tra thẩm quyền xuất báo cáo: reports.export (Tiêu chí AT-17)
    if (!isOwnPersonalExport && !hasExportAllPermission) {
      await recordAuditEvent({
        actorId: user.id,
        action: "REPORT_EXPORT_BLOCKED",
        resourceType: "Report",
        newData: {
          reason: "Tài khoản thiếu quyền reports.export",
          role: user.role,
          username: user.username,
        },
      });

      return NextResponse.json(
        { error: "Bạn không có quyền xuất báo cáo Excel của người khác (Yêu cầu thẩm quyền reports.export)" },
        { status: 403 }
      );
    }

    // 3. Kiểm tra Scope Guard (Chống IDOR xuất trộm dữ liệu bộ phận khác)
    const authorizedUnits = await getAuthorizedUnitIds(user);
    if (requestedUnitId && authorizedUnits !== "ALL" && !authorizedUnits.includes(requestedUnitId)) {
      await recordAuditEvent({
        actorId: user.id,
        action: "IDOR_ATTEMPT_BLOCKED",
        resourceType: "Report",
        newData: {
          reason: "Cố tình xuất báo cáo của đơn vị ngoài phạm vi được phân công",
          requestedUnitId,
          authorizedUnits,
        },
      });

      return NextResponse.json(
        { error: "Bạn không có quyền xuất dữ liệu của đơn vị này (Phạm vi bảo vệ)" },
        { status: 403 }
      );
    }

    // Xác định bộ phận cần xuất
    let targetUnit = null;
    if (requestedUnitId) {
      targetUnit = await prisma.orgUnit.findUnique({ where: { id: requestedUnitId } });
    } else if (authorizedUnits !== "ALL" && authorizedUnits.length > 0) {
      targetUnit = await prisma.orgUnit.findUnique({ where: { id: authorizedUnits[0] } });
    }

    const unitName = "Chi cục Hải quan Cửa khẩu Quốc tế Tà Lùng";
    const departmentName = targetUnit ? targetUnit.name : "Toàn đơn vị";

    // 4. Nếu yêu cầu xuất từ Bản chụp số liệu (Snapshot), kết xuất từ dữ liệu bất biến đã chốt (Tiêu chí P1 FIX 05)
    const snapshotId = searchParams.get("snapshotId");
    if (snapshotId) {
      const snapshot = await getReportSnapshotById(snapshotId, user);
      if (!snapshot) {
        return NextResponse.json(
          { error: "Không tìm thấy bản chụp số liệu tương ứng để xuất báo cáo" },
          { status: 404 }
        );
      }

      const snapData = snapshot.snapshotData as any;
      const snapTasks = snapData.tasks || [];
      const periodTitle = `${snapshot.period?.title || snapshot.title} [BẢN CHỤP ĐÃ CHỐT: ${snapshot.code}]`;
      const snapDeptName = snapshot.scopeUnit?.name || departmentName;

      let workbook;
      let fileName = "";

      if (templateType === "detailed") {
        const detailedItems: DetailedReportItem[] = snapTasks.map((t: any) => ({
          id: t.id,
          code: t.code,
          title: t.title,
          groupName: "Nhiệm vụ công tác trọng tâm (Bản chụp đã chốt)",
          ownerName: t.ownerName,
          departmentName: t.unitName,
          collaborators: "Cán bộ phân công",
          priority: t.priority === "HIGH" || t.priority === "Cao" ? "Cao" : "Trung bình",
          deadlineText: t.currentDeadline ? new Date(t.currentDeadline).toLocaleDateString("vi-VN") : "Đúng hạn",
          progressPercent: t.status === "COMPLETED" || t.status === "DONE" ? 100 : t.hasIssue ? 40 : 75,
          status:
            t.status === "COMPLETED" || t.status === "DONE"
              ? "Hoàn thành"
              : t.status === "WAITING_REVIEW"
              ? "Chờ nghiệm thu"
              : t.hasIssue
              ? "Có vướng mắc"
              : "Đang thực hiện",
          issueNotes: t.hasIssue ? "Có vướng mắc trong ca trực" : undefined,
          actualResult: t.actualResultText || (t.status === "COMPLETED" ? "Đã nghiệm thu kết quả" : undefined),
        }));

        workbook = await generateDetailedReportWorkbook({
          periodTitle,
          unitName,
          departmentFilter: snapshot.scopeUnit?.name,
          items: detailedItems,
        });

        fileName = `BaoCao_Snapshot_${snapshot.code}_MauB.xlsx`;
      } else {
        const groupsData: LegacyReportGroupData[] = [
          {
            groupCode: "SNAPSHOT-TASKS",
            groupName: `Nhiệm vụ công tác đã chốt số liệu (${snapshot.code})`,
            sourceRow: 1,
            workItems: snapTasks.map((t: any) => ({
              title: t.title,
              ownerName: t.ownerName,
              priority: t.priority === "HIGH" || t.priority === "Cao" ? "Cao" : "Trung bình",
              expectedResult: "Theo kế hoạch đã chốt",
              actualResult: t.actualResultText || (t.status === "COMPLETED" ? "Đã nghiệm thu hoàn thành" : "Đang thực hiện"),
              status: t.status === "COMPLETED" ? "Hoàn thành" : "Đang thực hiện",
              dateText: t.currentDeadline ? new Date(t.currentDeadline).toLocaleDateString("vi-VN") : "Hàng ngày",
            })),
          },
        ];

        workbook = await generateLegacyReportWorkbook({
          periodTitle,
          unitName,
          departmentName: snapDeptName,
          groups: groupsData,
        });

        fileName = `BaoCao_Snapshot_${snapshot.code}_MauA.xlsx`;
      }

      await recordAuditEvent({
        actorId: user.id,
        action: "SNAPSHOT_REPORT_EXPORTED",
        resourceType: "ReportSnapshot",
        resourceId: snapshot.id,
        newData: {
          snapshotCode: snapshot.code,
          checksum: snapshot.checksum,
          templateType,
          fileName,
        },
      });

      const buffer = await workbook.xlsx.writeBuffer();
      return new NextResponse(Buffer.from(buffer), {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${fileName}"`,
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      });
    }

    // 5. Lấy thông tin Kỳ báo cáo (Dữ liệu động)
    let period = null;
    if (periodId) {
      period = await prisma.reportingPeriod.findUnique({ where: { id: periodId } });
    } else {
      period = await prisma.reportingPeriod.findFirst({
        where: { type: "WEEK" },
        orderBy: { startAt: "desc" },
      });
    }

    const periodTitle = period ? period.title : "Kỳ Tuần 41 (06/10/2026 - 12/10/2026)";

    // 5. Truy vấn dữ liệu thực tế: 5 nhóm nghiệp vụ & Tasks
    const activityGroups = await prisma.activityGroup.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        templates: true,
      },
    });

    const unitFilter = requestedUnitId
      ? { unitId: requestedUnitId }
      : authorizedUnits === "ALL"
      ? {}
      : { unitId: { in: authorizedUnits } };

    let distinctTasks: any[] = [];
    let workItems: any[] = [];
    let selectedPlan: any = null;

    if (planId) {
      // TRƯỜNG HỢP 1: Xuất theo Plan cụ thể (Từ màn hình Kế hoạch /plans)
      // Phạm vi dữ liệu TUÂN THỦ 100% Kế hoạch đang chọn, không kéo Task/WorkItem ngoài kế hoạch
      selectedPlan = await prisma.plan.findUnique({
        where: { id: planId },
        include: {
          period: true,
          unit: true,
          items: {
            include: {
              group: true,
              workItems: {
                include: {
                  person: true,
                  group: true,
                  template: { include: { group: true } },
                },
                orderBy: { sortOrder: "asc" },
              },
              taskLinks: {
                include: {
                  task: {
                    include: {
                      owner: true,
                      unit: true,
                      assignees: { include: { person: true } },
                      planLinks: {
                        include: {
                          planItem: {
                            include: {
                              group: true,
                              plan: true,
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            orderBy: { sortOrder: "asc" },
          },
        },
      });

      if (!selectedPlan) {
        return NextResponse.json({ error: "Không tìm thấy kế hoạch được yêu cầu" }, { status: 404 });
      }

      if (authorizedUnits !== "ALL" && !authorizedUnits.includes(selectedPlan.unitId)) {
        return NextResponse.json({ error: "Bạn không có quyền truy cập kế hoạch của bộ phận này" }, { status: 403 });
      }

      if (selectedPlan.period) {
        period = selectedPlan.period;
      }
      if (selectedPlan.unit) {
        targetUnit = selectedPlan.unit;
      }

      let planWorkItems = selectedPlan.items.flatMap((pi: any) => pi.workItems);
      let planTasks: any[] = [];
      selectedPlan.items.forEach((pi: any) => {
        pi.taskLinks?.forEach((tl: any) => {
          if (tl.task) planTasks.push(tl.task);
        });
      });

      const distinctPlanTaskMap = new Map<string, any>();
      for (const t of planTasks) {
        if (!distinctPlanTaskMap.has(t.id)) {
          distinctPlanTaskMap.set(t.id, t);
        }
      }
      distinctTasks = Array.from(distinctPlanTaskMap.values());

      if (isPersonalScope && targetPersonId) {
        planWorkItems = planWorkItems.filter(
          (w: any) => w.personId === targetPersonId || (targetOfficer && w.person?.fullName === targetOfficer.fullName)
        );
        distinctTasks = distinctTasks.filter(
          (t: any) => t.ownerId === targetPersonId || t.assignees.some((a: any) => a.personId === targetPersonId)
        );
      }

      workItems = planWorkItems;
    } else {
      // TRƯỜNG HỢP 2: Xuất tổng hợp theo kỳ (Không chỉ định planId)
      // Task BẮT BUỘC phải liên kết với Kế hoạch thuộc kỳ này (Loại bỏ hoàn toàn lọc lỏng theo deadline)
      const taskPeriodWhere = period
        ? {
            planLinks: {
              some: {
                planItem: {
                  plan: {
                    periodId: period.id,
                  },
                },
              },
            },
          }
        : {};

      const taskPersonalWhere = isPersonalScope && targetPersonId
        ? {
            OR: [
              { ownerId: targetPersonId },
              { assignees: { some: { personId: targetPersonId } } },
            ],
          }
        : {};

      const tasks = await prisma.task.findMany({
        where: {
          ...unitFilter,
          ...taskPeriodWhere,
          ...taskPersonalWhere,
        },
        include: {
          owner: true,
          unit: true,
          assignees: {
            include: {
              person: true,
            },
          },
          planLinks: {
            include: {
              planItem: {
                include: {
                  group: true,
                  plan: true,
                },
              },
            },
          },
        },
      });

      const distinctTaskMap = new Map<string, typeof tasks[0]>();
      for (const t of tasks) {
        if (!distinctTaskMap.has(t.id)) {
          distinctTaskMap.set(t.id, t);
        }
      }
      distinctTasks = Array.from(distinctTaskMap.values());

      workItems = await prisma.personalWorkItem.findMany({
        where: {
          ...(period ? { periodId: period.id } : {}),
          ...(targetPersonId ? { personId: targetPersonId } : {}),
        },
        include: {
          person: true,
          group: true,
          template: {
            include: {
              group: true,
            },
          },
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      });
    }

    const finalPeriodTitle = selectedPlan
      ? `${selectedPlan.period?.title || "Kế hoạch tuần"} - ${selectedPlan.title}`
      : periodTitle;

    let workbook;
    let fileName = "";

    if (templateType === "detailed") {
      // -------------------------------------------------------------
      // MẪU B: BÁO CÁO CHI TIẾT THEO ĐẦU VIỆC & NHIỆM VỤ
      // -------------------------------------------------------------
      const detailedItems: DetailedReportItem[] = [];

      // Đưa từng Task vào bảng chi tiết
      distinctTasks.forEach((t) => {
        const groupName =
          t.planLinks.length > 0 && t.planLinks[0].planItem.group
            ? t.planLinks[0].planItem.group.name
            : "Nhiệm vụ công tác trọng tâm";

        const collabs = t.assignees.map((a: any) => a.person.fullName).join(", ");
        const deadlineStr = t.currentDeadline
          ? new Date(t.currentDeadline).toLocaleDateString("vi-VN")
          : "Đúng hạn kỳ";

        detailedItems.push({
          id: t.id,
          code: t.code,
          title: t.title,
          groupName,
          ownerName: t.owner.fullName,
          departmentName: t.unit.name,
          collaborators: collabs,
          priority: t.priority === "HIGH" ? "Cao" : t.priority === "LOW" ? "Thấp" : "Trung bình",
          deadlineText: deadlineStr,
          progressPercent: t.status === "COMPLETED" ? 100 : t.hasIssue ? 40 : 75,
          status:
            t.status === "COMPLETED"
              ? "Hoàn thành"
              : t.status === "WAITING_REVIEW"
              ? "Chờ nghiệm thu"
              : t.hasIssue
              ? "Có vướng mắc"
              : "Đang thực hiện",
          issueNotes: t.issueNotes || undefined,
          actualResult: t.actualResultText || undefined,
        });
      });

      // Bổ sung đầu việc cá nhân nếu có
      workItems.forEach((w) => {
        const groupName = w.template?.group?.name || "Thủ tục hải quan thường xuyên";
        detailedItems.push({
          id: w.id,
          code: `CV-CN-${w.sortOrder || 1}`,
          title: w.title,
          groupName,
          ownerName: w.person.fullName,
          departmentName,
          priority: "Trung bình",
          deadlineText: "Theo ca trực",
          progressPercent: 100,
          status: "Hoàn thành",
          actualResult: "Đã hoàn thành kiểm tra đối chiếu",
        });
      });

      workbook = await generateDetailedReportWorkbook({
        periodTitle,
        unitName,
        departmentFilter: targetUnit?.name,
        items: detailedItems,
      });

      fileName = `BaoCao_ChiTiet_DauViec_MauB_HQTL_${new Date().toISOString().slice(0, 10)}.xlsx`;
    } else {
      // -------------------------------------------------------------
      // MẪU A: BÁO CÁO TRUYỀN THỐNG (Biểu Kế Hoạch Tuần 8 Cột Gốc)
      // -------------------------------------------------------------
      const groupsData: LegacyReportGroupData[] = activityGroups.map((group) => {
        const matchedTasks = distinctTasks.filter((t: any) => {
          const belongsToGroup = t.planLinks.some((l: any) => l.planItem.groupId === group.id);
          if (belongsToGroup) return true;
          return group.code === "TTHQ" && (t.planLinks.length === 0 || !t.planLinks.some((l: any) => l.planItem?.groupId));
        });

        const matchedWorkItems = workItems.filter(
          (w: any) => w.groupId === group.id || w.template?.groupId === group.id || (!w.groupId && !w.template?.groupId && group.code === "TTHQ")
        );

        const items: Array<{
          id?: string;
          title: string;
          ownerName: string;
          collaboratorName?: string;
          priority: string;
          expectedResult?: string;
          actualResult?: string;
          status: string;
          dateText?: string;
        }> = [];

        matchedTasks.forEach((t) => {
          const isOwner = t.ownerId === targetPersonId;
          const isPersonalReport = isPersonalScope && targetOfficer;

          let itemTitle = t.title;
          let ownerDisplay = t.owner.fullName;
          let collabDisplay = t.assignees.map((a: any) => a.person.fullName).join(", ") || t.unit.name;

          if (isPersonalScope && targetOfficer) {
            if (isOwner) {
              ownerDisplay = targetOfficer.fullName;
              const otherAssignees = t.assignees
                .filter((a: any) => a.personId !== targetPersonId)
                .map((a: any) => a.person.fullName);
              collabDisplay = otherAssignees.length > 0 ? otherAssignees.join(", ") : t.unit.name;
            } else {
              itemTitle = `[Phối hợp] ${t.title}`;
              ownerDisplay = `${t.owner.fullName} (Chủ trì)`;
              collabDisplay = `Phối hợp: ${targetOfficer.fullName}`;
            }
          }

          items.push({
            id: t.id,
            title: itemTitle,
            ownerName: ownerDisplay,
            collaboratorName: collabDisplay,
            priority: t.priority === "HIGH" ? "Cao" : t.priority === "LOW" ? "Thấp" : "Trung bình",
            expectedResult: t.expectedResultText || "Theo quy chế",
            actualResult: t.actualResultText || (t.status === "COMPLETED" ? "Đã hoàn thành" : "Đang thực hiện"),
            status: t.status === "COMPLETED" ? "Đã hoàn thành" : "Đang thực hiện",
            dateText: t.currentDeadline ? new Date(t.currentDeadline).toLocaleDateString("vi-VN") : "Thứ 2 - Thứ 6",
          });
        });

        matchedWorkItems.forEach((w) => {
          let dateStr = w.dateText;
          if (!dateStr && w.workDate) {
            const d = new Date(w.workDate);
            const dayNames = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
            dateStr = `${dayNames[d.getDay()]} (${d.toLocaleDateString("vi-VN")})`;
          }
          if (!dateStr) dateStr = "Cả tuần";

          items.push({
            id: w.id,
            title: w.title,
            ownerName: w.person.fullName,
            collaboratorName: w.coordinationUnit || undefined,
            priority: w.priority || "Trung bình",
            expectedResult: w.expectedResult || "Hoàn thành đúng tiến độ nghiệp vụ",
            actualResult: w.status === "COMPLETED" ? "Đã hoàn thành" : "Đang thực hiện",
            status:
              w.status === "COMPLETED"
                ? "Đã hoàn thành"
                : w.status === "NOT_STARTED"
                ? "Chưa thực hiện"
                : "Đang thực hiện",
            dateText: dateStr,
          });
        });

        return {
          groupCode: group.code,
          groupName: group.name,
          sourceRow: group.sourceRow,
          workItems: items,
        };
      });

      workbook = await generateLegacyReportWorkbook({
        periodTitle: finalPeriodTitle,
        unitName,
        departmentName: targetUnit?.name || selectedPlan?.unit?.name || departmentName,
        officerName: targetOfficer ? targetOfficer.fullName : undefined,
        groups: groupsData,
      });

      fileName = `BaoCao_KeHoachTuan_MauA_HQTL_${new Date().toISOString().slice(0, 10)}.xlsx`;
    }

    // 6. Ghi Audit Log xuất file báo cáo
    await recordAuditEvent({
      actorId: user.id,
      action: "REPORT_EXPORTED",
      resourceType: "Report",
      newData: {
        templateType,
        fileName,
        periodTitle,
        unitId: targetUnit?.id || "ALL",
      },
    });

    // 7. Kết xuất buffer và trả về HTTP Streaming Response
    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(Buffer.from(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (err: any) {
    console.error("Error in GET /api/reports/export:", err);
    return NextResponse.json(
      { error: err.message || "Lỗi khi xuất file báo cáo Excel" },
      { status: 500 }
    );
  }
}
