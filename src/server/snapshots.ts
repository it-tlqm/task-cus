import crypto from "crypto";
import { prisma } from "./db";
import { SessionUser } from "./auth";
import { checkPermission, getAuthorizedUnitIds } from "./guard";
import { recordAuditEvent } from "./audit";
import { UNIT_ALL_LABEL } from "@/lib/unit-info";

/**
 * Chuẩn hóa đối tượng thành chuỗi JSON kinh điển (Canonical JSON)
 * để bảo đảm tính tất định khi tính toán mã băm SHA-256:
 * - Các key của object được sắp xếp theo thứ tự bảng chữ cái A-Z đệ quy.
 * - Mảng giữ nguyên thứ tự phần tử.
 * - Loại bỏ các giá trị undefined, chuẩn hóa null và Date sang chuỗi ISO.
 */
export function canonicalJsonStringify(obj: any): string {
  if (obj === null || obj === undefined) {
    return "null";
  }
  if (typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (obj instanceof Date) {
    return JSON.stringify(obj.toISOString());
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map((item) => canonicalJsonStringify(item)).join(",") + "]";
  }

  const sortedKeys = Object.keys(obj).sort();
  const pairs: string[] = [];
  for (const key of sortedKeys) {
    const val = obj[key];
    if (val !== undefined) {
      pairs.push(`${JSON.stringify(key)}:${canonicalJsonStringify(val)}`);
    }
  }
  return "{" + pairs.join(",") + "}";
}

/**
 * Tính mã băm toàn vẹn SHA-256 từ dữ liệu bản chụp (Snapshot Data).
 * Trả về chuỗi hex 64 ký tự chữ thường (lowercase).
 * LƯU Ý: Đây là mã kiểm tra toàn vẹn nội dung, không phải chữ ký số PKI.
 */
export function computeSnapshotChecksum(snapshotData: any): string {
  const canonical = canonicalJsonStringify(snapshotData);
  return crypto.createHash("sha256").update(canonical, "utf8").digest("hex").toLowerCase();
}

/**
 * Xác minh tính toàn vẹn của bản chụp bằng cách tính lại hash từ snapshotData và so sánh.
 * Tuyệt đối không tự động cập nhật lại storedChecksum nếu phát hiện sai lệch.
 */
export function verifySnapshotIntegrity(
  storedChecksum: string,
  snapshotData: any
): {
  isValid: boolean;
  computedChecksum: string;
  storedChecksum: string;
  message: string;
} {
  const computed = computeSnapshotChecksum(snapshotData);
  const isValid = computed.toLowerCase() === storedChecksum.toLowerCase();
  return {
    isValid,
    computedChecksum: computed,
    storedChecksum: storedChecksum.toLowerCase(),
    message: isValid
      ? "Dữ liệu toàn vẹn, khớp mã băm SHA-256 được lưu trữ"
      : "CẢNH BÁO: Dữ liệu bản chụp đã bị can thiệp sai lệch so với mã băm gốc",
  };
}

export interface CreateSnapshotOptions {
  periodId?: string;
  notes?: string;
  scopeUnitId?: string;
}

/**
 * Quy trình chốt kỳ số liệu và tạo bản chụp bất biến (Immutable Report Snapshot).
 */
export async function createReportSnapshot(user: SessionUser, options: CreateSnapshotOptions = {}) {
  // 1. Kiểm tra quyền hạn: Chỉ Lãnh đạo đơn vị (UNIT_LEADER) hoặc người có quyền plans.approve / reports.export
  // Quản trị kỹ thuật (SYSTEM_ADMIN) tuyệt đối không có thẩm quyền chốt kỳ số liệu nghiệp vụ
  if (user.role === "SYSTEM_ADMIN") {
    throw new Error("FORBIDDEN: Quản trị kỹ thuật (SYSTEM_ADMIN) không có thẩm quyền chốt khóa số liệu nghiệp vụ");
  }

  const hasLeaderRole = user.role === "UNIT_LEADER";
  const hasApprovePerm = checkPermission(user, "plans.approve") || checkPermission(user, "reports.export");
  if (!hasLeaderRole && !hasApprovePerm) {
    throw new Error("FORBIDDEN: Chỉ Lãnh đạo đơn vị mới có thẩm quyền chốt khóa số liệu kỳ báo cáo");
  }

  // 2. Tìm kỳ báo cáo
  let period = null;
  if (options.periodId) {
    period = await prisma.reportingPeriod.findUnique({
      where: { id: options.periodId },
      include: { snapshots: { where: { status: "LOCKED" } } },
    });
  } else {
    period = await prisma.reportingPeriod.findFirst({
      where: { type: "WEEK" },
      orderBy: { startAt: "desc" },
      include: { snapshots: { where: { status: "LOCKED" } } },
    });
  }

  if (!period) {
    throw new Error("NOT_FOUND: Không tìm thấy kỳ công tác phù hợp để chốt");
  }

  // 3. Chống chốt trùng: Nếu kỳ này đã có bản chốt LOCKED hợp lệ
  if (period.snapshots && period.snapshots.length > 0) {
    const existing = period.snapshots[0];
    throw new Error(
      `ALREADY_LOCKED: Kỳ báo cáo "${period.title}" đã được chốt và khóa trước đó với mã ${existing.code} lúc ${new Date(
        existing.lockedAt
      ).toLocaleString("vi-VN")}`
    );
  }

  // 4. Kiểm tra Scope Guard nếu chỉ định scopeUnitId
  const authorizedUnits = await getAuthorizedUnitIds(user);
  if (options.scopeUnitId && authorizedUnits !== "ALL" && !authorizedUnits.includes(options.scopeUnitId)) {
    throw new Error("SCOPE_VIOLATION: Bạn không có quyền chốt kỳ cho bộ phận ngoài thẩm quyền");
  }

  // 5. Thu thập toàn bộ dữ liệu nghiệp vụ thực tế từ PostgreSQL tại thời điểm chốt
  const now = new Date();
  const unitFilter = options.scopeUnitId
    ? { unitId: options.scopeUnitId }
    : authorizedUnits === "ALL"
    ? {}
    : { unitId: { in: authorizedUnits } };

  // a. Danh sách nhiệm vụ
  const tasks = await prisma.task.findMany({
    where: unitFilter,
    orderBy: { createdAt: "desc" },
    include: {
      owner: true,
      unit: true,
      updates: { orderBy: { createdAt: "desc" }, take: 3 },
    },
  });

  // b. Đơn vị tổ chức để phân tích theo bộ phận
  const orgUnits = await prisma.orgUnit.findMany({
    where: options.scopeUnitId ? { id: options.scopeUnitId } : undefined,
    orderBy: { sortOrder: "asc" },
  });

  // c. Sổ nhật ký tác nghiệp ca trực trong kỳ
  const routines = await prisma.routineEntry.findMany({
    where: {
      periodId: period.id,
      ...(options.scopeUnitId ? { unitId: options.scopeUnitId } : {}),
    },
    include: {
      person: true,
      unit: true,
      template: true,
      submissions: {
        include: { values: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // d. Đầu việc cá nhân trong kỳ
  const personalWorkItems = await prisma.personalWorkItem.findMany({
    where: { periodId: period.id },
  });

  // 6. Tính toán các chỉ số tổng hợp KPI thực tế
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.status === "COMPLETED" || t.status === "DONE").length;
  const inProgressTasks = tasks.filter((t) => t.status === "IN_PROGRESS").length;
  const waitingReviewTasks = tasks.filter((t) => t.status === "WAITING_REVIEW").length;
  const overdueTasks = tasks.filter(
    (t) => (t.status === "IN_PROGRESS" || t.status === "WAITING_REVIEW") && new Date(t.currentDeadline) < now
  ).length;
  const hasIssueTasks = tasks.filter((t) => t.hasIssue).length;
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 1000) / 10 : 100;

  // Phân rã theo từng phòng ban
  const departmentBreakdown = orgUnits.map((u) => {
    const deptTasks = tasks.filter((t) => t.unitId === u.id);
    const deptCompleted = deptTasks.filter((t) => t.status === "COMPLETED" || t.status === "DONE").length;
    const deptInProgress = deptTasks.filter((t) => t.status === "IN_PROGRESS").length;
    const deptWaiting = deptTasks.filter((t) => t.status === "WAITING_REVIEW").length;
    const deptOverdue = deptTasks.filter(
      (t) => (t.status === "IN_PROGRESS" || t.status === "WAITING_REVIEW") && new Date(t.currentDeadline) < now
    ).length;
    const rate = deptTasks.length > 0 ? Math.round((deptCompleted / deptTasks.length) * 1000) / 10 : 100;
    return {
      unitId: u.id,
      unitName: u.name,
      taskCount: deptTasks.length,
      completedCount: deptCompleted,
      inProgressCount: deptInProgress,
      waitingReviewCount: deptWaiting,
      overdueCount: deptOverdue,
      completionRate: rate,
    };
  });

  // e. Tổng hợp nhật ký ca trực
  const notOccurredCount = routines.filter((r) => r.occurrenceStatus === "NOT_OCCURRED").length;

  // 7. Chuẩn hóa cấu trúc bản chụp (Snapshot Data Contract)
  const targetScopeUnit = options.scopeUnitId ? orgUnits.find((u) => u.id === options.scopeUnitId) : null;

  const snapshotData = {
    schemaVersion: "1.0.0",
    period: {
      id: period.id,
      title: period.title,
      type: period.type,
      startAt: period.startAt.toISOString(),
      endAt: period.endAt.toISOString(),
    },
    scope: {
      unitId: targetScopeUnit ? targetScopeUnit.id : null,
      unitName: targetScopeUnit ? targetScopeUnit.name : UNIT_ALL_LABEL,
    },
    metadata: {
      generatedAt: now.toISOString(),
      lockedBy: {
        personId: user.personId,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
      },
      notes: options.notes || "Chốt khóa số liệu kỳ phục vụ lưu trữ và kiểm toán tác nghiệp",
    },
    metrics: {
      totalTasks,
      completedTasks,
      inProgressTasks,
      waitingReviewTasks,
      overdueTasks,
      hasIssueTasks,
      completionRate,
      totalRoutines: routines.length,
      notOccurredRoutines: notOccurredCount,
      totalPersonalWorkItems: personalWorkItems.length,
    },
    departmentBreakdown,
    tasks: tasks.map((t) => ({
      id: t.id,
      code: t.code,
      title: t.title,
      priority: t.priority,
      status: t.status,
      ownerName: t.owner?.fullName || "Chưa phân công",
      unitName: t.unit?.name || "Chưa rõ bộ phận",
      currentDeadline: t.currentDeadline.toISOString(),
      hasIssue: t.hasIssue,
      actualResultText: t.actualResultText || null,
      latestNote: t.updates[0]?.notes || null,
    })),
    routinesSummary: {
      totalEntries: routines.length,
      notOccurredCount,
      sampleEntries: routines.slice(0, 15).map((r) => {
        const companyVal = r.submissions[0]?.values.find((v) => v.fieldKey === "company_name" || v.fieldKey === "companyName");
        const contVal = r.submissions[0]?.values.find((v) => v.fieldKey === "container_count" || v.fieldKey === "containerCount");
        return {
          id: r.id,
          activityCode: r.template?.code || "TTHQ-01",
          activityTitle: r.template?.title || "Nhật ký tác nghiệp",
          personName: r.person?.fullName || "Cán bộ trực",
          unitName: r.unit?.name || "Đơn vị",
          status: r.occurrenceStatus,
          notes: r.notes || null,
          companyName: companyVal?.valueText || null,
          containerCount: contVal?.valueNumber ?? null,
        };
      }),
    },
  };

  // 8. Tính toán mã băm SHA-256 từ nội dung Snapshot Data chuẩn hóa
  const checksum = computeSnapshotChecksum(snapshotData);

  // Sinh mã Snapshot: SNP-YYYYMMDD-[4 chữ số ngẫu nhiên]
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const code = `SNP-${dateStr}-${randomSuffix}`;
  const title = `Bản chụp số liệu ${period.title}`;

  // 9. Thực thi lưu trữ Transaction an toàn trong PostgreSQL
  const result = await prisma.$transaction(async (tx) => {
    // a. Tạo bản ghi ReportSnapshot
    const snapshot = await tx.reportSnapshot.create({
      data: {
        code,
        periodId: period.id,
        version: 1,
        title,
        snapshotData: snapshotData as any,
        checksum,
        lockedById: user.personId,
        lockedByName: `${user.fullName} (${user.username})`,
        lockedAt: now,
        status: "LOCKED",
        scopeUnitId: options.scopeUnitId || null,
        notes: options.notes || null,
      },
    });

    // b. Đánh dấu kỳ báo cáo đã khóa
    await tx.reportingPeriod.update({
      where: { id: period.id },
      data: { isLocked: true },
    });

    // c. Ghi Audit Event bất biến
    await tx.auditEvent.create({
      data: {
        actorId: user.id,
        action: "REPORT_SNAPSHOT_LOCKED",
        resourceType: "ReportSnapshot",
        resourceId: snapshot.id,
        newData: {
          snapshotId: snapshot.id,
          code: snapshot.code,
          periodId: period.id,
          periodTitle: period.title,
          checksum: snapshot.checksum,
          lockedBy: user.username,
          metrics: snapshotData.metrics,
        },
      },
    });

    return snapshot;
  });

  return {
    success: true,
    snapshot: {
      id: result.id,
      code: result.code,
      periodId: result.periodId,
      periodTitle: period.title,
      version: result.version,
      title: result.title,
      checksum: result.checksum,
      lockedByName: result.lockedByName,
      lockedAt: result.lockedAt,
      status: result.status,
      metrics: snapshotData.metrics,
    },
    integrity: verifySnapshotIntegrity(result.checksum, result.snapshotData),
  };
}

/**
 * Lấy danh sách toàn bộ các bản chụp số liệu trong kho lưu trữ
 */
export async function listReportSnapshots(user: SessionUser) {
  if (user.role === "SYSTEM_ADMIN") {
    throw new Error("FORBIDDEN: Quản trị kỹ thuật (SYSTEM_ADMIN) không có quyền xem dữ liệu nghiệp vụ báo cáo");
  }

  const authorizedUnits = await getAuthorizedUnitIds(user);
  const unitFilter =
    authorizedUnits === "ALL"
      ? {}
      : {
          OR: [{ scopeUnitId: null }, { scopeUnitId: { in: authorizedUnits } }],
        };

  const snapshots = await prisma.reportSnapshot.findMany({
    where: unitFilter,
    orderBy: { lockedAt: "desc" },
    include: {
      period: true,
      lockedBy: true,
      scopeUnit: true,
    },
  });

  return snapshots.map((s) => {
    const rawData = s.snapshotData as any;
    const integrity = verifySnapshotIntegrity(s.checksum, rawData);
    return {
      id: s.id,
      code: s.code,
      periodId: s.periodId,
      periodTitle: s.period?.title || "Kỳ công tác",
      periodType: s.period?.type || "WEEK",
      startAt: s.period?.startAt,
      endAt: s.period?.endAt,
      version: s.version,
      title: s.title,
      checksum: s.checksum,
      lockedById: s.lockedById,
      lockedByName: s.lockedByName,
      lockedAt: s.lockedAt,
      status: s.status,
      scopeUnitName: s.scopeUnit?.name || "Toàn đơn vị",
      metrics: rawData?.metrics || null,
      isValid: integrity.isValid,
      integrityMessage: integrity.message,
    };
  });
}

/**
 * Lấy chi tiết bản chụp đầy đủ bao gồm toàn bộ snapshotData để đối soát hoặc xuất file
 */
export async function getReportSnapshotById(snapshotId: string, user: SessionUser) {
  if (user.role === "SYSTEM_ADMIN") {
    throw new Error("FORBIDDEN: Quản trị kỹ thuật (SYSTEM_ADMIN) không có quyền xem chi tiết bản chốt dữ liệu nghiệp vụ");
  }

  const snapshot = await prisma.reportSnapshot.findFirst({
    where: {
      OR: [{ id: snapshotId }, { code: snapshotId }],
    },
    include: {
      period: true,
      lockedBy: true,
      scopeUnit: true,
    },
  });

  if (!snapshot) {
    return null;
  }

  // Kiểm tra Scope Guard
  const authorizedUnits = await getAuthorizedUnitIds(user);
  if (
    snapshot.scopeUnitId &&
    authorizedUnits !== "ALL" &&
    !authorizedUnits.includes(snapshot.scopeUnitId)
  ) {
    throw new Error("SCOPE_VIOLATION: Bạn không có quyền truy cập bản chụp của bộ phận này");
  }

  const rawData = snapshot.snapshotData as any;
  const integrity = verifySnapshotIntegrity(snapshot.checksum, rawData);

  return {
    ...snapshot,
    integrity,
  };
}

/**
 * Danh sách các kỳ báo cáo có thể chốt số liệu
 */
export async function listAvailablePeriods() {
  const periods = await prisma.reportingPeriod.findMany({
    orderBy: { startAt: "desc" },
    include: {
      snapshots: { select: { id: true, code: true, checksum: true, status: true } },
    },
  });

  return periods.map((p) => ({
    id: p.id,
    title: p.title,
    type: p.type,
    startAt: p.startAt,
    endAt: p.endAt,
    isLocked: p.isLocked,
    hasSnapshot: p.snapshots.some((s) => s.status === "LOCKED"),
    snapshotCode: p.snapshots.find((s) => s.status === "LOCKED")?.code || null,
  }));
}
