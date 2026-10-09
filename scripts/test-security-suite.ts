import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE_URL = "http://localhost:3000";

async function runSecuritySuite() {
  console.log("==========================================================");
  console.log(" TALUNG-CUS-WORK — TOÀN BỘ KIỂM THỬ BẢO MẬT & IDOR SUITE  ");
  console.log("==========================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${msg}`);
      failed++;
    }
  }

  // Helper login to get cookie
  async function login(username: string): Promise<string> {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password: "demo123" }),
    });
    if (!res.ok) throw new Error(`Login failed for ${username}: ${res.status}`);
    const cookie = res.headers.get("set-cookie");
    if (!cookie) throw new Error(`No cookie returned for ${username}`);
    return cookie.split(";")[0]; // token=...
  }

  try {
    // ----------------------------------------------------
    // TEST PHẦN 1: TRUY CẬP KHI KHÔNG CÓ SESSION (REDIRECT: 'MANUAL')
    // ----------------------------------------------------
    console.log("PHẦN 1: Kiểm tra URL khi KHÔNG CÓ SESSION (redirect: 'manual'):");

    const protectedPages = [
      "/dashboard",
      "/plans",
      "/my-work",
      "/admin/organization",
    ];

    for (const page of protectedPages) {
      const res = await fetch(`${BASE_URL}${page}`, {
        redirect: "manual",
      });
      const location = res.headers.get("location") || "";
      const isRedirect = res.status === 307 || res.status === 302;
      const pointsToLogin = location.includes("/login");
      assert(
        isRedirect && pointsToLogin,
        `Page ${page} -> Trả về HTTP ${res.status} chuyển hướng về '${location}'`
      );
    }

    const protectedApis = [
      "/api/dashboard/kpi",
      "/api/people",
      "/api/tasks",
    ];

    for (const api of protectedApis) {
      const res = await fetch(`${BASE_URL}${api}`, {
        redirect: "manual",
      });
      const data = await res.json().catch(() => ({}));
      assert(
        res.status === 401 && (data.error === "Unauthorized" || data.success === false),
        `API ${api} -> Bị chặn với HTTP ${res.status} 401 Unauthorized, không rò rỉ dữ liệu`
      );
    }

    // ----------------------------------------------------
    // TEST PHẦN 2: CHỐNG LỖ HỔNG IDOR VÀ PHÂN QUYỀN GIỮA CÁC BỘ PHẬN
    // ----------------------------------------------------
    console.log("\nPHẦN 2: Kiểm tra phân quyền Scope Guard & Chống IDOR giữa các bộ phận:");

    const cookieOfficerA = await login("canbo_a");
    const cookieOfficerB = await login("canbo_b");
    const cookieAdmin = await login("admin");
    const cookieLeader = await login("lanhdao");

    // Lấy ID bộ phận B và tìm một Task thuộc bộ phận B
    const deptB = await prisma.orgUnit.findUnique({ where: { code: "BP_GIAMSAT_B" } });
    const deptA = await prisma.orgUnit.findUnique({ where: { code: "BP_NGHIEPVU_A" } });
    const personB = await prisma.person.findFirst({
      where: { assignments: { some: { unitId: deptB!.id } } },
    });

    // Tạo một Task thuộc Bộ phận B để thử nghiệm tấn công IDOR
    const taskDeptB = await prisma.task.create({
      data: {
        code: `NV_TEST_B_${Date.now().toString().slice(-4)}`,
        title: "Nhiệm vụ tuyệt mật Barie số 2 thuộc Bộ phận B",
        ownerId: personB!.id,
        unitId: deptB!.id,
        status: "IN_PROGRESS",
        priority: "Cao",
        originalDeadline: new Date(),
        currentDeadline: new Date(),
      },
    });

    // Case 2.1: Cán bộ bộ phận A cố tình gửi PATCH để sửa Task của bộ phận B (Tấn công IDOR)
    const idorPatchRes = await fetch(`${BASE_URL}/api/tasks`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieOfficerA,
      },
      body: JSON.stringify({
        id: taskDeptB.id,
        status: "COMPLETED",
        actualResultText: "Hacker A đã can thiệp trái phép",
      }),
    });
    const idorPatchData = await idorPatchRes.json();
    assert(
      idorPatchRes.status === 403 && idorPatchData.success === false,
      `Cán bộ BP A sửa Task của BP B (IDOR Attack) -> Bị từ chối HTTP 403 Forbidden ("${idorPatchData.error}")`
    );

    // Case 2.2: Cán bộ bộ phận A truy vấn KPI với tham số unitId của Bộ phận B
    const idorKpiRes = await fetch(`${BASE_URL}/api/dashboard/kpi?unitId=${deptB!.id}`, {
      headers: { Cookie: cookieOfficerA },
    });
    const idorKpiData = await idorKpiRes.json();
    assert(
      idorKpiRes.status === 403,
      `Cán bộ BP A xem KPI của BP B -> Bị từ chối HTTP 403 Forbidden`
    );

    // Case 2.3: Cán bộ bộ phận B sửa chính Task của mình -> Thành công
    const validPatchRes = await fetch(`${BASE_URL}/api/tasks`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieOfficerB,
      },
      body: JSON.stringify({
        id: taskDeptB.id,
        status: "COMPLETED",
        actualResultText: "Cán bộ B hợp lệ cập nhật kết quả",
      }),
    });
    const validPatchData = await validPatchRes.json();
    assert(
      validPatchRes.status === 200 && validPatchData.success === true,
      `Cán bộ BP B sửa đúng Task của đơn vị mình -> Thành công HTTP 200 OK`
    );

    // Dọn dẹp task test
    await prisma.task.delete({ where: { id: taskDeptB.id } });

    // ----------------------------------------------------
    // TEST PHẦN 3: GIỚI HẠN QUYỀN QUẢN TRỊ KỸ THUẬT (SYSTEM_ADMIN)
    // ----------------------------------------------------
    console.log("\nPHẦN 3: Giới hạn Quản trị kỹ thuật (Không mặc nhiên đọc nhiệm vụ nghiệp vụ):");

    // Case 3.1: Admin kỹ thuật xem Tasks nghiệp vụ -> Phải bị từ chối 403
    const adminTaskRes = await fetch(`${BASE_URL}/api/tasks`, {
      headers: { Cookie: cookieAdmin },
    });
    const adminTaskData = await adminTaskRes.json();
    assert(
      adminTaskRes.status === 403,
      `Admin kỹ thuật xem Tasks nghiệp vụ -> Bị từ chối HTTP 403 Forbidden ("${adminTaskData.error}")`
    );

    // Case 3.2: Admin kỹ thuật xem KPI nghiệp vụ -> Phải bị từ chối 403
    const adminKpiRes = await fetch(`${BASE_URL}/api/dashboard/kpi`, {
      headers: { Cookie: cookieAdmin },
    });
    const adminKpiData = await adminKpiRes.json();
    assert(
      adminKpiRes.status === 403,
      `Admin kỹ thuật xem Dashboard KPI nghiệp vụ -> Bị từ chối HTTP 403 Forbidden`
    );

    // Case 3.3: Admin kỹ thuật xem Cơ cấu tổ chức -> Được phép 200 OK
    const adminOrgRes = await fetch(`${BASE_URL}/api/org-units/tree`, {
      headers: { Cookie: cookieAdmin },
    });
    assert(
      adminOrgRes.status === 200,
      `Admin kỹ thuật xem Quản trị cơ cấu tổ chức -> Hợp lệ HTTP 200 OK`
    );

    // ----------------------------------------------------
    // TEST PHẦN 4: AUDIT LOG BẤT BIẾN GHI NHẬN HÀNH VI BẢO MẬT
    // ----------------------------------------------------
    console.log("\nPHẦN 4: Kiểm tra Audit Log bất biến trong PostgreSQL:");
    const idorAuditLogs = await prisma.auditEvent.findMany({
      where: { action: "IDOR_ATTEMPT_BLOCKED" },
    });
    assert(
      idorAuditLogs.length > 0,
      `PostgreSQL đã tự động ghi nhận ${idorAuditLogs.length} sự kiện 'IDOR_ATTEMPT_BLOCKED' khi có hành vi can thiệp trái phép`
    );

    const loginAuditLogs = await prisma.auditEvent.findMany({
      where: { action: "LOGIN" },
    });
    assert(
      loginAuditLogs.length >= 4,
      `PostgreSQL đã ghi nhận ${loginAuditLogs.length} phiên đăng nhập vào bảng audit_events`
    );

    console.log("\n----------------------------------------------------------");
    console.log(`KẾT QUẢ KIỂM THỬ BẢO MẬT: ${passed} PASS, ${failed} FAIL`);
    console.log("----------------------------------------------------------");

    if (failed > 0) process.exit(1);
  } catch (err: any) {
    console.error("Lỗi thực thi test suite:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runSecuritySuite();
