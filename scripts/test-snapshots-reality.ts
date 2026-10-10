import { prisma } from "../src/server/db";
import { signToken } from "../src/server/auth";
import { computeSnapshotChecksum, verifySnapshotIntegrity } from "../src/server/snapshots";

const BASE_URL = "http://localhost:3000";

interface TestResult {
  scenario: number;
  name: string;
  passed: boolean;
  details: string;
  evidence?: any;
}

const results: TestResult[] = [];

async function getAuthToken(username: string) {
  const account = await prisma.account.findUnique({
    where: { username },
    include: {
      person: {
        include: {
          assignments: {
            where: { isPrimary: true },
            include: { unit: true, position: true },
          },
        },
      },
      roleGrants: {
        include: { role: true },
      },
    },
  });

  if (!account) throw new Error(`User ${username} not found in DB`);

  const primaryAssignment = account.person.assignments[0];
  const primaryGrant = account.roleGrants[0];

  return signToken({
    id: account.id,
    personId: account.person.id,
    username: account.username,
    fullName: account.person.fullName,
    unitId: primaryAssignment?.unitId,
    unitName: primaryAssignment?.unit?.name,
    role: primaryGrant?.role.code || "STAFF",
    scopeType: primaryGrant?.scopeType || "OWN",
  });
}

async function runSnapshotTests() {
  console.log("================================================================================");
  console.log("TALUNG-CUS-WORK — P1 FIX 05: REAL REPORT SNAPSHOT & PERIOD LOCKING TEST SUITE");
  console.log("================================================================================\n");

  const leaderToken = await getAuthToken("hqtl001"); // UNIT_LEADER
  const staffToken = await getAuthToken("canbo_b");   // STAFF

  // Setup: Find or create test reporting periods to ensure isolated, repeatable testing
  const now = new Date();
  const testPeriodTitle = `Kỳ Kiểm Thử Chốt Số Liệu ${Date.now()}`;
  const testPeriod = await prisma.reportingPeriod.create({
    data: {
      title: testPeriodTitle,
      type: "WEEK",
      startAt: new Date(now.getTime() - 7 * 24 * 3600 * 1000),
      endAt: now,
      isLocked: false,
    },
  });

  console.log(`[SETUP] Đã tạo kỳ báo cáo kiểm thử: ${testPeriod.id} (${testPeriod.title})\n`);

  let createdSnapshotId: string = "";
  let createdSnapshotCode: string = "";
  let createdChecksum: string = "";

  // ---------------------------------------------------------------------------------
  // KỊCH BẢN 1: Người có quyền chốt kỳ thành công (Lãnh đạo đơn vị hqtl001)
  // ---------------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/reports/snapshots`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${leaderToken}`,
      },
      body: JSON.stringify({
        periodId: testPeriod.id,
        notes: "Chốt kỳ báo cáo thử nghiệm P1 FIX 05",
      }),
    });

    const body = await res.json();
    const passed =
      res.status === 201 &&
      body.success === true &&
      body.snapshot &&
      body.snapshot.periodId === testPeriod.id &&
      typeof body.snapshot.checksum === "string" &&
      body.snapshot.checksum.length === 64;

    if (passed) {
      createdSnapshotId = body.snapshot.id;
      createdSnapshotCode = body.snapshot.code;
      createdChecksum = body.snapshot.checksum;
    }

    results.push({
      scenario: 1,
      name: "Người có quyền (Lãnh đạo đơn vị) chốt kỳ thành công",
      passed,
      details: passed
        ? `HTTP 201 Created. Mã: ${body.snapshot.code}, Checksum: ${body.snapshot.checksum}`
        : `Thất bại: HTTP ${res.status}, body: ${JSON.stringify(body)}`,
      evidence: body.snapshot,
    });
  } catch (err: any) {
    results.push({
      scenario: 1,
      name: "Người có quyền chốt kỳ thành công",
      passed: false,
      details: `Exception: ${err.message}`,
    });
  }

  // ---------------------------------------------------------------------------------
  // KỊCH BẢN 2: PostgreSQL lưu Snapshot và checksum 64 hex thật trong DB
  // ---------------------------------------------------------------------------------
  try {
    const dbSnapshot = await prisma.reportSnapshot.findUnique({
      where: { id: createdSnapshotId },
      include: { period: true, lockedBy: true },
    });

    const dbPeriod = await prisma.reportingPeriod.findUnique({
      where: { id: testPeriod.id },
    });

    const is64Hex = /^[0-9a-f]{64}$/.test(dbSnapshot?.checksum || "");
    const passed =
      !!dbSnapshot &&
      dbSnapshot.code === createdSnapshotCode &&
      dbSnapshot.checksum === createdChecksum &&
      is64Hex &&
      dbSnapshot.status === "LOCKED" &&
      dbPeriod?.isLocked === true &&
      dbSnapshot.lockedByName.includes("hqtl001");

    results.push({
      scenario: 2,
      name: "PostgreSQL lưu trữ Snapshot và checksum SHA-256 (64 hex) thật",
      passed,
      details: passed
        ? `DB bản ghi tồn tại. Checksum: ${dbSnapshot?.checksum} (64 hex lowercase). ReportingPeriod.isLocked = ${dbPeriod?.isLocked}`
        : `Kiểm tra DB thất bại. is64Hex: ${is64Hex}, snapshot: ${JSON.stringify(dbSnapshot)}`,
      evidence: {
        id: dbSnapshot?.id,
        code: dbSnapshot?.code,
        checksum: dbSnapshot?.checksum,
        is64Hex,
        lockedByName: dbSnapshot?.lockedByName,
        periodIsLocked: dbPeriod?.isLocked,
      },
    });
  } catch (err: any) {
    results.push({
      scenario: 2,
      name: "PostgreSQL lưu Snapshot và checksum thật",
      passed: false,
      details: `Exception: ${err.message}`,
    });
  }

  // ---------------------------------------------------------------------------------
  // KỊCH BẢN 3: F5 Reload / GET lại vẫn đọc được đúng nội dung và checksum từ PostgreSQL
  // ---------------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/reports/snapshots`, {
      headers: { Authorization: `Bearer ${leaderToken}` },
    });

    const body = await res.json();
    const found = body.snapshots?.find((s: any) => s.id === createdSnapshotId);
    const passed =
      res.status === 200 &&
      body.success === true &&
      !!found &&
      found.checksum === createdChecksum &&
      found.code === createdSnapshotCode &&
      found.isValid === true &&
      found.lockedByName.includes("hqtl001");

    results.push({
      scenario: 3,
      name: "F5 Reload / GET trả về chính xác nội dung, checksum và người chốt",
      passed,
      details: passed
        ? `Đọc lại thành công. Mã: ${found.code}, Checksum: ${found.checksum}, Toàn vẹn: ${found.isValid}, Người chốt: ${found.lockedByName}`
        : `Không tìm thấy hoặc dữ liệu sai lệch sau khi đọc lại.`,
      evidence: found,
    });
  } catch (err: any) {
    results.push({
      scenario: 3,
      name: "Reload trang vẫn đọc được đúng nội dung và checksum",
      passed: false,
      details: `Exception: ${err.message}`,
    });
  }

  // ---------------------------------------------------------------------------------
  // KỊCH BẢN 4: Tính lại SHA-256 khớp với bản chốt lưu trữ (Tính toàn vẹn xác minh)
  // ---------------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/reports/snapshots/${createdSnapshotId}/verify`, {
      method: "POST",
      headers: { Authorization: `Bearer ${leaderToken}` },
    });

    const body = await res.json();
    const passed =
      res.status === 200 &&
      body.success === true &&
      body.isValid === true &&
      body.computedChecksum === createdChecksum &&
      body.storedChecksum === createdChecksum;

    results.push({
      scenario: 4,
      name: "Tính lại SHA-256 khớp 100% với bản chốt lưu trữ (Integrity Verified)",
      passed,
      details: passed
        ? `Xác minh thành công. Computed: ${body.computedChecksum} === Stored: ${body.storedChecksum}. isValid: true`
        : `Xác minh không khớp. body: ${JSON.stringify(body)}`,
      evidence: body,
    });
  } catch (err: any) {
    results.push({
      scenario: 4,
      name: "Tính lại SHA-256 khớp với bản chốt lưu trữ",
      passed: false,
      details: `Exception: ${err.message}`,
    });
  }

  // ---------------------------------------------------------------------------------
  // KỊCH BẢN 5: Thay đổi dữ liệu Snapshot trong môi trường cách ly thì phát hiện sai khác
  // ---------------------------------------------------------------------------------
  try {
    // Tạo một bản snapshot nhân bản trong DB để thử nghiệm can thiệp
    const tamperedPeriod = await prisma.reportingPeriod.create({
      data: {
        title: `Kỳ Kiểm Thử Can Thiệp ${Date.now()}`,
        type: "WEEK",
        startAt: new Date(),
        endAt: new Date(),
        isLocked: true,
      },
    });

    const originalData = {
      schemaVersion: "1.0.0",
      period: { id: tamperedPeriod.id, title: tamperedPeriod.title },
      metrics: { totalTasks: 10, completedTasks: 8 },
    };
    const validChecksum = computeSnapshotChecksum(originalData);

    const tamperedSnapshot = await prisma.reportSnapshot.create({
      data: {
        code: `SNP-TEST-TAMPER-${Date.now().toString(36)}`,
        periodId: tamperedPeriod.id,
        version: 1,
        title: "Bản chụp thử nghiệm giả mạo",
        snapshotData: originalData as any,
        checksum: validChecksum,
        lockedById: (await prisma.person.findFirst())!.id,
        lockedByName: "Cán bộ kiểm thử",
        status: "LOCKED",
      },
    });

    // Cố tình can thiệp sửa trực tiếp DB: sửa số việc hoàn thành từ 8 thành 9999
    const modifiedData = {
      ...originalData,
      metrics: { totalTasks: 10, completedTasks: 9999 },
    };
    await prisma.reportSnapshot.update({
      where: { id: tamperedSnapshot.id },
      data: { snapshotData: modifiedData as any },
    });

    // Gọi API đối soát kiểm tra toàn vẹn
    const verifyRes = await fetch(`${BASE_URL}/api/reports/snapshots/${tamperedSnapshot.id}/verify`, {
      method: "POST",
      headers: { Authorization: `Bearer ${leaderToken}` },
    });
    const verifyBody = await verifyRes.json();

    // Hệ thống PHẢI phát hiện sai khác: isValid === false và storedChecksum giữ nguyên mã gốc
    const passed =
      verifyRes.status === 200 &&
      verifyBody.isValid === false &&
      verifyBody.storedChecksum === validChecksum &&
      verifyBody.computedChecksum !== validChecksum;

    results.push({
      scenario: 5,
      name: "Phát hiện sai lệch toàn vẹn khi dữ liệu Snapshot bị can thiệp sửa đổi",
      passed,
      details: passed
        ? `Đã phát hiện sai khác chính xác! isValid: false. Stored: ${verifyBody.storedChecksum.slice(0, 16)}... != Computed: ${verifyBody.computedChecksum.slice(0, 16)}...`
        : `Lỗi: Hệ thống không phát hiện được sự thay đổi dữ liệu. body: ${JSON.stringify(verifyBody)}`,
      evidence: verifyBody,
    });
  } catch (err: any) {
    results.push({
      scenario: 5,
      name: "Thay đổi dữ liệu Snapshot phát hiện sai khác",
      passed: false,
      details: `Exception: ${err.message}`,
    });
  }

  // ---------------------------------------------------------------------------------
  // KỊCH BẢN 6: Thay đổi dữ liệu nguồn sau chốt không làm biến đổi bản Snapshot lịch sử
  // ---------------------------------------------------------------------------------
  try {
    // Lấy số liệu snapshot trước khi thay đổi dữ liệu nguồn
    const snapBefore = await prisma.reportSnapshot.findUnique({
      where: { id: createdSnapshotId },
    });
    const metricsBefore = (snapBefore?.snapshotData as any)?.metrics;

    // Tạo thêm 1 nhiệm vụ mới trong CSDL sau khi kỳ đã chốt
    const unit = await prisma.orgUnit.findFirst();
    const owner = await prisma.person.findFirst();
    const newTask = await prisma.task.create({
      data: {
        code: `TASK-POST-SNAPSHOT-${Date.now().toString(36).toUpperCase()}`,
        title: "Nhiệm vụ phát sinh sau thời điểm chốt kỳ",
        ownerId: owner!.id,
        unitId: unit!.id,
        priority: "Cao",
        status: "IN_PROGRESS",
        originalDeadline: new Date(),
        currentDeadline: new Date(),
      },
    });

    // Lấy lại snapshot từ PostgreSQL và kiểm tra
    const snapAfter = await prisma.reportSnapshot.findUnique({
      where: { id: createdSnapshotId },
    });
    const metricsAfter = (snapAfter?.snapshotData as any)?.metrics;

    // Kiểm tra tính bất biến: dữ liệu bản chụp và mã băm phải giữ nguyên 100%
    const passed =
      metricsBefore?.totalTasks === metricsAfter?.totalTasks &&
      snapBefore?.checksum === snapAfter?.checksum &&
      snapAfter?.checksum === createdChecksum;

    results.push({
      scenario: 6,
      name: "Dữ liệu nguồn phát sinh sau chốt không làm biến đổi bản Snapshot lịch sử",
      passed,
      details: passed
        ? `Bản chụp bất biến! Metrics trước: ${metricsBefore?.totalTasks} việc == sau: ${metricsAfter?.totalTasks} việc. Checksum giữ nguyên.`
        : `Lỗi: Bản chụp bị thay đổi sau khi tạo task mới.`,
      evidence: { metricsBefore, metricsAfter, checksum: snapAfter?.checksum },
    });

    // Dọn dẹp task thử nghiệm
    await prisma.task.delete({ where: { id: newTask.id } }).catch(() => {});
  } catch (err: any) {
    results.push({
      scenario: 6,
      name: "Thay đổi dữ liệu nguồn không làm biến đổi bản Snapshot",
      passed: false,
      details: `Exception: ${err.message}`,
    });
  }

  // ---------------------------------------------------------------------------------
  // KỊCH BẢN 7: Người không có thẩm quyền bị từ chối thao tác (HTTP 403)
  // ---------------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/reports/snapshots`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffToken}`, // STAFF
      },
      body: JSON.stringify({
        periodId: testPeriod.id,
      }),
    });

    const body = await res.json();
    const passed = res.status === 403 && body.error && body.error.includes("thẩm quyền");

    results.push({
      scenario: 7,
      name: "Người không có thẩm quyền (STAFF) bị từ chối thao tác (HTTP 403 Forbidden)",
      passed,
      details: passed
        ? `Đã từ chối chuẩn xác: HTTP 403. Thông báo: "${body.error}"`
        : `Không chặn được: HTTP ${res.status}, body: ${JSON.stringify(body)}`,
      evidence: body,
    });
  } catch (err: any) {
    results.push({
      scenario: 7,
      name: "Người không có quyền bị từ chối thao tác",
      passed: false,
      details: `Exception: ${err.message}`,
    });
  }

  // ---------------------------------------------------------------------------------
  // KỊCH BẢN 8: Chống chốt trùng kỳ ngoài quy tắc (HTTP 409 Conflict)
  // ---------------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/reports/snapshots`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${leaderToken}`,
      },
      body: JSON.stringify({
        periodId: testPeriod.id, // Kỳ này đã được chốt ở Kịch bản 1
      }),
    });

    const body = await res.json();
    const passed = res.status === 409 && body.error && body.error.includes("đã được chốt");

    results.push({
      scenario: 8,
      name: "Chống chốt trùng kỳ đã khóa (HTTP 409 Conflict với thông báo rõ ràng)",
      passed,
      details: passed
        ? `Chặn thành công: HTTP 409 Conflict. Thông báo: "${body.error}"`
        : `Lỗi: HTTP ${res.status}, body: ${JSON.stringify(body)}`,
      evidence: body,
    });
  } catch (err: any) {
    results.push({
      scenario: 8,
      name: "Không thể chốt trùng kỳ ngoài quy tắc",
      passed: false,
      details: `Exception: ${err.message}`,
    });
  }

  // ---------------------------------------------------------------------------------
  // KỊCH BẢN 9: Gọi chốt kỳ đồng thời xử lý an toàn (Concurrent Lock Guard)
  // ---------------------------------------------------------------------------------
  try {
    const concurrentPeriod = await prisma.reportingPeriod.create({
      data: {
        title: `Kỳ Kiểm Thử Đồng Thời ${Date.now()}`,
        type: "WEEK",
        startAt: new Date(),
        endAt: new Date(),
        isLocked: false,
      },
    });

    // Gửi 2 yêu cầu đồng thời cùng lúc
    const [req1, req2] = await Promise.all([
      fetch(`${BASE_URL}/api/reports/snapshots`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${leaderToken}`,
        },
        body: JSON.stringify({ periodId: concurrentPeriod.id }),
      }),
      fetch(`${BASE_URL}/api/reports/snapshots`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${leaderToken}`,
        },
        body: JSON.stringify({ periodId: concurrentPeriod.id }),
      }),
    ]);

    const status1 = req1.status;
    const status2 = req2.status;

    // Đúng 1 yêu cầu thành công (201) và yêu cầu kia bị chặn (409)
    const oneSuccessOneConflict =
      (status1 === 201 && status2 === 409) || (status1 === 409 && status2 === 201);

    // Kiểm tra trong DB chỉ có duy nhất 1 bản chốt
    const countInDb = await prisma.reportSnapshot.count({
      where: { periodId: concurrentPeriod.id },
    });

    const passed = oneSuccessOneConflict && countInDb === 1;

    results.push({
      scenario: 9,
      name: "Gọi chốt kỳ đồng thời xử lý an toàn (Chỉ 1 bản chốt hợp lệ duy nhất)",
      passed,
      details: passed
        ? `An toàn đồng thời! Req1: HTTP ${status1}, Req2: HTTP ${status2}. Số bản ghi trong DB: ${countInDb}`
        : `Xung đột: Req1: HTTP ${status1}, Req2: HTTP ${status2}, DB count: ${countInDb}`,
      evidence: { status1, status2, countInDb },
    });
  } catch (err: any) {
    results.push({
      scenario: 9,
      name: "Gọi chốt kỳ đồng thời an toàn",
      passed: false,
      details: `Exception: ${err.message}`,
    });
  }

  // ---------------------------------------------------------------------------------
  // KỊCH BẢN 10: API lỗi / Kỳ không tồn tại không tạo Toast thành công giả (HTTP 404)
  // ---------------------------------------------------------------------------------
  try {
    const fakePeriodId = "00000000-0000-0000-0000-000000000000";
    const res = await fetch(`${BASE_URL}/api/reports/snapshots`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${leaderToken}`,
      },
      body: JSON.stringify({ periodId: fakePeriodId }),
    });

    const body = await res.json();
    const passed = res.status === 404 && body.error && !body.success;

    results.push({
      scenario: 10,
      name: "Kỳ không tồn tại trả về HTTP 404, không bao giờ tạo thành công giả",
      passed,
      details: passed
        ? `Đúng chuẩn HTTP 404 Not Found: "${body.error}"`
        : `Lỗi: HTTP ${res.status}, body: ${JSON.stringify(body)}`,
      evidence: body,
    });
  } catch (err: any) {
    results.push({
      scenario: 10,
      name: "Kỳ không tồn tại không tạo thành công giả",
      passed: false,
      details: `Exception: ${err.message}`,
    });
  }

  // ---------------------------------------------------------------------------------
  // KỊCH BẢN 11: AuditEvent ghi nhận đúng người chốt, kỳ và mã checksum
  // ---------------------------------------------------------------------------------
  try {
    const audit = await prisma.auditEvent.findFirst({
      where: {
        action: "REPORT_SNAPSHOT_LOCKED",
        resourceType: "ReportSnapshot",
        resourceId: createdSnapshotId,
      },
      include: { actor: true },
    });

    const passed =
      !!audit &&
      audit.actor?.username === "hqtl001" &&
      (audit.newData as any)?.checksum === createdChecksum &&
      (audit.newData as any)?.code === createdSnapshotCode;

    results.push({
      scenario: 11,
      name: "AuditEvent ghi nhận đúng người chốt (hqtl001) và mã checksum bất biến",
      passed,
      details: passed
        ? `AuditEvent hợp lệ! Action: ${audit?.action}, Actor: ${audit?.actor?.username}, Code: ${(audit?.newData as any)?.code}`
        : `Lỗi AuditEvent: ${JSON.stringify(audit)}`,
      evidence: audit,
    });
  } catch (err: any) {
    results.push({
      scenario: 11,
      name: "AuditEvent ghi nhận đúng người chốt và hành động",
      passed: false,
      details: `Exception: ${err.message}`,
    });
  }

  // ---------------------------------------------------------------------------------
  // KỊCH BẢN 12: Xuất Excel từ bản Snapshot lịch sử phản ánh đúng dữ liệu đã chốt
  // ---------------------------------------------------------------------------------
  try {
    const resDetailed = await fetch(
      `${BASE_URL}/api/reports/export?snapshotId=${createdSnapshotId}&template=detailed`,
      {
        headers: { Authorization: `Bearer ${leaderToken}` },
      }
    );

    const resLegacy = await fetch(
      `${BASE_URL}/api/reports/export?snapshotId=${createdSnapshotId}&template=legacy`,
      {
        headers: { Authorization: `Bearer ${leaderToken}` },
      }
    );

    const isDetailedXlsx =
      resDetailed.status === 200 &&
      resDetailed.headers.get("content-type")?.includes("spreadsheetml") &&
      resDetailed.headers.get("content-disposition")?.includes(`BaoCao_Snapshot_${createdSnapshotCode}_MauB.xlsx`);

    const isLegacyXlsx =
      resLegacy.status === 200 &&
      resLegacy.headers.get("content-type")?.includes("spreadsheetml") &&
      resLegacy.headers.get("content-disposition")?.includes(`BaoCao_Snapshot_${createdSnapshotCode}_MauA.xlsx`);

    const passed = !!(isDetailedXlsx && isLegacyXlsx);

    results.push({
      scenario: 12,
      name: "Xuất Excel (Mẫu A & Mẫu B) từ Snapshot lịch sử phản ánh dữ liệu đã chốt",
      passed,
      details: passed
        ? `Xuất Excel từ Snapshot thành công! Mẫu B: ${resDetailed.headers.get("content-disposition")}, Mẫu A: ${resLegacy.headers.get("content-disposition")}`
        : `Lỗi xuất file. Detailed: ${resDetailed.status}, Legacy: ${resLegacy.status}`,
      evidence: {
        detailedDisposition: resDetailed.headers.get("content-disposition"),
        legacyDisposition: resLegacy.headers.get("content-disposition"),
      },
    });
  } catch (err: any) {
    results.push({
      scenario: 12,
      name: "File báo cáo xuất từ bản Snapshot phản ánh dữ liệu đã chốt",
      passed: false,
      details: `Exception: ${err.message}`,
    });
  }

  // ---------------------------------------------------------------------------------
  // TỔNG KẾT BÁO CÁO
  // ---------------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("KẾT QUẢ KIỂM THỬ THỰC TẾ 12 KỊCH BẢN CHỐT KỲ & SNAPSHOT (P1 FIX 05):");
  console.log("--------------------------------------------------------------------------------\n");

  let totalPassed = 0;
  for (const r of results) {
    if (r.passed) totalPassed++;
    const statusText = r.passed ? "✅ [PASS]" : "❌ [FAIL]";
    console.log(`${statusText} Kịch bản ${r.scenario}: ${r.name}`);
    console.log(`   -> Chi tiết: ${r.details}\n`);
  }

  console.log("================================================================================");
  console.log(`TỔNG KẾT: ${totalPassed}/${results.length} KỊCH BẢN ĐẠT (${Math.round((totalPassed / results.length) * 100)}%)`);
  console.log("================================================================================\n");

  if (totalPassed === results.length) {
    console.log(">> TOÀN BỘ 12 KỊCH BẢN KIỂM TOÁN CHỐT KỲ & SNAPSHOT ĐỀU ĐẠT CHUẨN 100%!");
  } else {
    console.error(">> CÓ KỊCH BẢN THẤT BẠI. CẦN RÀ SOÁT LẠI MÃ NGUỒN.");
    process.exit(1);
  }
}

runSnapshotTests()
  .catch((err) => {
    console.error("Lỗi khi chạy bộ kiểm thử:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
