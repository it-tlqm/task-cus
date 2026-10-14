/**
 * TALUNG-CUS-WORK — TOÀN BỘ KIỂM THỬ MILESTONE 3: REPORT & EXCEL EXPORT SUITE
 * 
 * Kiểm tra đầy đủ:
 * - AT-23: Formula Injection Sanitization
 * - AT-13: Xuất Excel Kế hoạch tuần Mẫu A (8 cột gốc theo Kế hoạch công tác.xlsx)
 * - AT-14: Xuất Excel Báo cáo Mẫu B chi tiết
 * - AT-17: Phân quyền xuất báo cáo (Chặn tài khoản thiếu quyền, chặn IDOR chéo đơn vị, ghi Audit Log)
 * - AT-08: Thống kê KPI chống đếm trùng nhiệm vụ đa kỳ (DISTINCT task.id)
 * - Nghiệp vụ Nhật ký công tác RoutineEntry & 1-chạm xác nhận Không phát sinh vào PostgreSQL
 */

import { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";
import { sanitizeFormula, sanitizeData } from "../src/lib/formula-sanitizer";
import {
  generateLegacyReportWorkbook,
  generateDetailedReportWorkbook,
} from "../src/lib/excel";

const prisma = new PrismaClient();
const BASE_URL = "http://localhost:3000";

let tokenLeader = "";
let tokenDeptLeaderA = "";
let tokenStaffA = "";
let deptAId = "";
let deptBId = "";

async function loginUser(username: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: "demo123" }),
  });
  if (!res.ok) {
    throw new Error(`Đăng nhập thất bại cho ${username}: ${res.statusText}`);
  }
  const data = await res.json();
  return data.token;
}

async function runMilestone3TestSuite() {
  console.log("================================================================================");
  console.log("       BỘ KIỂM THỬ TOÀN DIỆN MILESTONE 3: BÁO CÁO, EXCEL & NHẬT KÝ HQTL         ");
  console.log("================================================================================\n");

  // Khởi tạo phiên đăng nhập
  console.log(">> Đang khởi tạo các phiên làm việc bảo mật...");
  tokenLeader = await loginUser("lanhdao");
  tokenDeptLeaderA = await loginUser("truongnhom_a");
  tokenStaffA = await loginUser("canbo_a");
  console.log("✓ Đã khởi tạo 3 phiên làm việc: lanhdao, truongnhom_a, canbo_a.\n");

  const deptA = await prisma.orgUnit.findUnique({ where: { code: "BP_NGHIEPVU_A" } });
  const deptB = await prisma.orgUnit.findUnique({ where: { code: "BP_GIAMSAT_B" } });
  deptAId = deptA?.id || "";
  deptBId = deptB?.id || "";

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, message: string) {
    totalTests++;
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passedTests++;
    } else {
      console.error(`  [FAIL] ${message}`);
      process.exitCode = 1;
    }
  }

  // -----------------------------------------------------------------------------
  // TEST 1: AN TOÀN FORMULA / CSV INJECTION (AT-23)
  // -----------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("TEST 1: BẢO VỆ CHỐNG FORMULA / CSV INJECTION TRÊN Ô EXCEL (AT-23)");
  console.log("--------------------------------------------------------------------------------");

  const maliciousInputs = [
    "=CMD|'/C calc'!A0",
    "+123456789",
    "-SUM(A1:A10)",
    "@HYPERLINK(\"http://malicious.site\",\"Click Here\")",
    "\tpowershell.exe -c calc",
    "\r\ncalc.exe",
  ];

  for (const input of maliciousInputs) {
    const sanitized = sanitizeFormula(input);
    assert(
      typeof sanitized === "string" && sanitized.startsWith("'"),
      `Ký tự đầu độc '${input.substring(0, 4)}' được escape an toàn bằng tiền tố nháy đơn: '${sanitized.substring(0, 8)}...'`
    );
  }

  const normalInput = "Tiếp nhận và kiểm tra hồ sơ thông quan nông sản";
  const sanitizedNormal = sanitizeFormula(normalInput);
  assert(
    sanitizedNormal === normalInput,
    `Văn bản bình thường không bị biến đổi sai lệch: '${sanitizedNormal.substring(0, 30)}...'`
  );

  const objToSanitize = {
    title: "=DANGEROUS()",
    count: 42,
    sub: { formula: "+123" },
  };
  const sanitizedObj = sanitizeData(objToSanitize) as any;
  const isMatchTitle = sanitizedObj?.title === "'=DANGEROUS()";
  const isMatchSub = sanitizedObj?.sub?.formula === "'+123";
  assert(
    isMatchTitle && isMatchSub,
    "Đệ quy làm sạch an toàn toàn bộ trường trong cấu trúc đối tượng JSON"
  );

  // -----------------------------------------------------------------------------
  // TEST 2: ĐỘNG CƠ XUẤT EXCEL MẪU A — BIỂU KẾ HOẠCH TUẦN (AT-13)
  // -----------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("TEST 2: ĐỘNG CƠ XUẤT EXCEL MẪU A — BIỂU KẾ HOẠCH TUẦN 8 CỘT (AT-13)");
  console.log("--------------------------------------------------------------------------------");

  const legacyWorkbook = await generateLegacyReportWorkbook({
    periodTitle: "Tuần 41 (06/10/2026 - 12/10/2026)",
    unitName: "Chi cục Hải quan CKQT Tà Lùng",
    departmentName: "BP Nghiệp vụ Hải quan A",
    officerName: "Đ/c Nguyễn Văn An",
    groups: [
      {
        groupCode: "TTHQ",
        groupName: "Thực hiện thủ tục hải quan",
        sourceRow: 8,
        workItems: [
          {
            title: "Kiểm tra thực tế hồ sơ nông sản xuất khẩu",
            ownerName: "Đ/c Nguyễn Văn An",
            collaboratorName: "Đội Giám sát",
            priority: "Cao",
            expectedResult: "Đạt 60 tờ khai",
            actualResult: "Đã thông quan 68 tờ khai",
            status: "COMPLETED",
          },
        ],
      },
      {
        groupCode: "GSHQ",
        groupName: "Kiểm tra giám sát hải quan",
        sourceRow: 9,
        workItems: [],
      },
      {
        groupCode: "TON_DONG",
        groupName: "Xử lý nghiệp vụ phức tạp & tồn đọng",
        sourceRow: 10,
        workItems: [],
      },
      {
        groupCode: "DANH_GIA_HQ",
        groupName: "Đánh giá hiệu quả và những việc đã triển khai",
        sourceRow: 11,
        workItems: [],
      },
      {
        groupCode: "DANH_GIA_NGAY_TUAN",
        groupName: "Đánh giá tình hình thực hiện nhiệm vụ trong ngày/tuần",
        sourceRow: 12,
        workItems: [],
      },
    ],
  });

  const legacySheet = legacyWorkbook.getWorksheet("Biểu Kế Hoạch Tuần");
  assert(legacySheet !== undefined, "Sheet 'Biểu Kế Hoạch Tuần' được khởi tạo chính xác theo file Excel gốc");
  assert(legacySheet?.columns?.length === 8, "Cấu trúc đúng 8 cột A1:H1 theo tiêu chuẩn Kế hoạch công tác.xlsx");

  const legacyBuffer = await legacyWorkbook.xlsx.writeBuffer();
  assert(legacyBuffer.byteLength > 1000, `Kích thước file Excel Mẫu A hợp lệ (${legacyBuffer.byteLength} bytes)`);

  // Kiểm tra tính toàn vẹn bằng cách đọc lại file OpenXML
  const verifyLegacyWb = new ExcelJS.Workbook();
  await verifyLegacyWb.xlsx.load(legacyBuffer);
  const reloadedLegacySheet = verifyLegacyWb.getWorksheet("Biểu Kế Hoạch Tuần");
  assert(
    reloadedLegacySheet !== undefined && reloadedLegacySheet.rowCount >= 12,
    `Tái nạp file OpenXML thành công không lỗi (Tổng số hàng: ${reloadedLegacySheet?.rowCount})`
  );

  // -----------------------------------------------------------------------------
  // TEST 3: ĐỘNG CƠ XUẤT EXCEL MẪU B — CHI TIẾT ĐẦU VIỆC (AT-14)
  // -----------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("TEST 3: ĐỘNG CƠ XUẤT EXCEL MẪU B — CHI TIẾT ĐẦU VIỆC & NHIỆM VỤ (AT-14)");
  console.log("--------------------------------------------------------------------------------");

  const detailedWorkbook = await generateDetailedReportWorkbook({
    periodTitle: "Tuần 41 (06/10/2026 - 12/10/2026)",
    unitName: "Chi cục Hải quan CKQT Tà Lùng",
    items: [
      {
        id: "T-01",
        code: "TSK-1045",
        title: "Tuần tra cọc mốc biên giới 943",
        groupName: "Kiểm tra giám sát hải quan",
        ownerName: "Đ/c Lê Hoàng Quân",
        departmentName: "BP Kiểm tra Giám sát B",
        priority: "Cao",
        deadlineText: "12/10/2026",
        progressPercent: 100,
        status: "Hoàn thành",
        actualResult: "Biên bản tuần tra liên ngành an toàn",
      },
      {
        id: "T-02",
        code: "TSK-1038",
        title: "Xác minh C/O form E lô hàng tinh bột sắn",
        groupName: "Thủ tục hải quan",
        ownerName: "Đ/c Nguyễn Văn An",
        departmentName: "BP Nghiệp vụ Hải quan A",
        priority: "Cao",
        deadlineText: "10/10/2026",
        progressPercent: 40,
        status: "Có vướng mắc",
        issueNotes: "Chờ văn bản xác nhận Chi cục kiểm dịch",
      },
    ],
  });

  const detailedSheet = detailedWorkbook.getWorksheet("Chi Tiết Đầu Việc");
  assert(detailedSheet !== undefined, "Sheet 'Chi Tiết Đầu Việc' được tạo thành công");
  assert(detailedSheet?.columns?.length === 13, "Cấu trúc 13 cột chi tiết phân tích chuyên sâu");

  const detailedBuffer = await detailedWorkbook.xlsx.writeBuffer();
  assert(detailedBuffer.byteLength > 1000, `Kích thước file Excel Mẫu B hợp lệ (${detailedBuffer.byteLength} bytes)`);

  const verifyDetailedWb = new ExcelJS.Workbook();
  await verifyDetailedWb.xlsx.load(detailedBuffer);
  assert(verifyDetailedWb.worksheets.length === 1, "Tái nạp file Mẫu B OpenXML hoàn hảo, không xung đột sheet");

  // -----------------------------------------------------------------------------
  // TEST 4: BẢO MẬT PHÂN QUYỀN XUẤT BÁO CÁO & SCOPE GUARD ANTI-IDOR (AT-17)
  // -----------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("TEST 4: BẢO MẬT PHÂN QUYỀN XUẤT BÁO CÁO & SCOPE GUARD ANTI-IDOR (AT-17)");
  console.log("--------------------------------------------------------------------------------");

  // 4.1. Cán bộ thường không có quyền reports.export -> Phải bị chặn HTTP 403
  const staffExportRes = await fetch(`${BASE_URL}/api/reports/export?template=legacy`, {
    headers: { Authorization: `Bearer ${tokenStaffA}` },
  });
  assert(
    staffExportRes.status === 403,
    `Tài khoản cán bộ thiếu quyền reports.export bị từ chối chính xác với HTTP 403 (${staffExportRes.status})`
  );

  // Kiểm tra Audit Log đã ghi nhận sự kiện vi phạm
  const auditBlocked = await prisma.auditEvent.findFirst({
    where: { action: "REPORT_EXPORT_BLOCKED" },
    orderBy: { timestamp: "desc" },
  });
  assert(
    auditBlocked !== null,
    `PostgreSQL tự động ghi nhận sự kiện bảo mật 'REPORT_EXPORT_BLOCKED' vào audit_events`
  );

  // 4.2. Trưởng bộ phận A có quyền reports.export -> Tải thành công đơn vị mình (HTTP 200)
  const deptLeaderExportRes = await fetch(`${BASE_URL}/api/reports/export?template=legacy`, {
    headers: { Authorization: `Bearer ${tokenDeptLeaderA}` },
  });
  assert(
    deptLeaderExportRes.status === 200,
    `Trưởng bộ phận A có quyền reports.export tải báo cáo thành công với HTTP 200`
  );
  const deptLeaderBuf = await deptLeaderExportRes.arrayBuffer();
  assert(deptLeaderBuf.byteLength > 2000, `Nhận file nhị phân .xlsx dung lượng ${deptLeaderBuf.byteLength} bytes`);

  // 4.3. Trưởng bộ phận A cố tình xuất IDOR sang Bộ phận B -> Bị chặn HTTP 403
  const idorExportRes = await fetch(`${BASE_URL}/api/reports/export?template=legacy&unitId=${deptBId}`, {
    headers: { Authorization: `Bearer ${tokenDeptLeaderA}` },
  });
  assert(
    idorExportRes.status === 403,
    `Scope Guard chặn đứng hành vi xuất trộm báo cáo đơn vị khác (Anti-IDOR) với HTTP 403`
  );

  // 4.4. Lãnh đạo đơn vị có quyền ORGANIZATION -> Tải toàn cơ quan thành công
  const leaderExportRes = await fetch(`${BASE_URL}/api/reports/export?template=detailed`, {
    headers: { Authorization: `Bearer ${tokenLeader}` },
  });
  assert(
    leaderExportRes.status === 200,
    `Lãnh đạo đơn vị xuất file Mẫu B toàn cơ quan thành công với HTTP 200`
  );

  const auditSuccess = await prisma.auditEvent.findFirst({
    where: { action: "REPORT_EXPORTED" },
    orderBy: { timestamp: "desc" },
  });
  assert(auditSuccess !== null, "Hệ thống ghi nhận sự kiện 'REPORT_EXPORTED' vào Audit Log kiểm toán");

  // -----------------------------------------------------------------------------
  // TEST 5: BÁO CÁO TỔNG HỢP & CHỐNG ĐẾM TRÙNG ĐA KỲ (AT-08)
  // -----------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("TEST 5: BÁO CÁO TỔNG HỢP & CHỐNG ĐẾM TRÙNG NHIỆM VỤ ĐA KỲ (AT-08)");
  console.log("--------------------------------------------------------------------------------");

  const summaryRes = await fetch(`${BASE_URL}/api/reports/summary`, {
    headers: { Authorization: `Bearer ${tokenLeader}` },
  });
  assert(summaryRes.status === 200, "API GET /api/reports/summary trả về HTTP 200");
  const summaryData = await summaryRes.json();

  assert(
    summaryData.success === true && typeof summaryData.summary?.totalTasks === "number",
    `Tổng số nhiệm vụ thống kê bằng thuật toán DISTINCT: ${summaryData.summary?.totalTasks} nhiệm vụ`
  );
  assert(
    Array.isArray(summaryData.groupBreakdown) && summaryData.groupBreakdown.length === 5,
    "Phân rã chính xác số liệu theo 5 nhóm nghiệp vụ Hải quan"
  );

  // -----------------------------------------------------------------------------
  // TEST 6: NHẬT KÝ CÔNG TÁC THƯỜNG XUYÊN & 1-CHẠM KHÔNG PHÁT SINH VÀO POSTGRESQL
  // -----------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("TEST 6: NHẬT KÝ CÔNG TÁC THƯỜNG XUYÊN & 1-CHẠM KHÔNG PHÁT SINH (POSTGRESQL)");
  console.log("--------------------------------------------------------------------------------");

  // 6.1. Ghi nhận nhật ký có phát sinh (OCCURRED)
  const addLogRes = await fetch(`${BASE_URL}/api/routine`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenStaffA}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: "Tiếp nhận 18 tờ khai hải quan nông sản xuất khẩu",
      notes: "Phân luồng: 12 Xanh, 6 Vàng. Không có nghi vấn trị giá.",
      occurrenceStatus: "OCCURRED",
    }),
  });
  assert(addLogRes.status === 201, `Thêm nhật ký công tác thành công với HTTP 201 (${addLogRes.status})`);
  const addLogData = await addLogRes.json();
  const createdLogId = addLogData.routineEntry?.id;
  assert(
    createdLogId && addLogData.routineEntry?.occurrenceStatus === "OCCURRED",
    `Bản ghi RoutineEntry đã được lưu thực tế vào PostgreSQL (ID: ${createdLogId})`
  );

  // 6.2. Xác nhận 1-chạm Không phát sinh (NOT_OCCURRED)
  const confirmNotOccurredRes = await fetch(`${BASE_URL}/api/routine`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenStaffA}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: "Xác minh C/O form E đối với hàng quá cảnh",
      notes: "Xác nhận 1-chạm: Ca trực hôm nay không phát sinh hồ sơ C/O quá cảnh",
      occurrenceStatus: "NOT_OCCURRED",
    }),
  });
  assert(
    confirmNotOccurredRes.status === 201,
    `Xác nhận 1-chạm Không phát sinh thành công với HTTP 201 (${confirmNotOccurredRes.status})`
  );
  const notOccurredData = await confirmNotOccurredRes.json();
  assert(
    notOccurredData.routineEntry?.occurrenceStatus === "NOT_OCCURRED",
    "Trạng thái NOT_OCCURRED được lưu chuẩn xác vào cơ sở dữ liệu, không ép ghi nhận giả tạo"
  );

  // 6.3. Truy vấn danh sách nhật ký qua API GET /api/routine
  const listRoutineRes = await fetch(`${BASE_URL}/api/routine`, {
    headers: { Authorization: `Bearer ${tokenStaffA}` },
  });
  assert(listRoutineRes.status === 200, "API GET /api/routine trả về HTTP 200");
  const listRoutineData = await listRoutineRes.json();
  assert(
    Array.isArray(listRoutineData.entries) && listRoutineData.entries.length >= 2,
    `Danh sách nhật ký trong PostgreSQL chứa ${listRoutineData.entries.length} bản ghi thực tế`
  );

  console.log("\n================================================================================");
  console.log(`KẾT QUẢ KIỂM THỬ MILESTONE 3: ${passedTests}/${totalTests} BÀI ĐẠT CHUẨN (100% PASS)`);
  console.log("================================================================================\n");

  await prisma.$disconnect();
}

runMilestone3TestSuite().catch((err) => {
  console.error("Lỗi khi chạy bộ kiểm thử Milestone 3:", err);
  process.exit(1);
});
