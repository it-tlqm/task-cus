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

    // 2. Kiểm tra thẩm quyền xuất báo cáo: reports.export (Tiêu chí AT-17)
    if (!checkPermission(user, "reports.export")) {
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
        { error: "Bạn không có quyền xuất báo cáo Excel (Yêu cầu thẩm quyền reports.export)" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const templateType = searchParams.get("template") || "legacy"; // "legacy" (Mẫu A) hoặc "detailed" (Mẫu B)
    const periodId = searchParams.get("periodId");
    const requestedUnitId = searchParams.get("unitId");

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

    // Lấy các nhiệm vụ và lọc trùng theo Task ID (DISTINCT Task - Chống đếm trùng AT-08)
    const tasks = await prisma.task.findMany({
      where: unitFilter,
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
    const distinctTasks = Array.from(distinctTaskMap.values());

    // Lấy thêm đầu việc cá nhân trong kỳ
    const workItems = await prisma.personalWorkItem.findMany({
      where: {
        ...(period ? { periodId: period.id } : {}),
      },
      include: {
        person: true,
        template: {
          include: {
            group: true,
          },
        },
      },
    });

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

        const collabs = t.assignees.map((a) => a.person.fullName).join(", ");
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
        // Tìm các tasks hoặc workItems thuộc nhóm này
        const matchedTasks = distinctTasks.filter((t) =>
          t.planLinks.some((l) => l.planItem.groupId === group.id)
        );

        const matchedWorkItems = workItems.filter(
          (w) => w.template?.groupId === group.id
        );

        const items: Array<{
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
          items.push({
            title: t.title,
            ownerName: t.owner.fullName,
            collaboratorName: t.assignees.map((a) => a.person.fullName).join(", "),
            priority: t.priority === "HIGH" ? "Cao" : "Trung bình",
            expectedResult: t.expectedResultText || "Theo quy chế",
            actualResult: t.actualResultText || "Đang thực hiện",
            status: t.status === "COMPLETED" ? "Hoàn thành" : "Đang thực hiện",
            dateText: "Thứ 2 - Thứ 6",
          });
        });

        matchedWorkItems.forEach((w) => {
          items.push({
            title: w.title,
            ownerName: w.person.fullName,
            priority: "Bình thường",
            expectedResult: "Thực hiện đầy đủ theo ca trực",
            actualResult: "Đã hoàn thành trong ngày",
            status: "Hoàn thành",
            dateText: "Hàng ngày",
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
        periodTitle,
        unitName,
        departmentName,
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
