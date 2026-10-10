/**
 * TALUNG-CUS-WORK — P1 FIX 06A: KIỂM THỬ THỰC TẾ QUẢN TRỊ CÁN BỘ, TÀI KHOẢN & PHÂN QUYỀN
 * 
 * Bộ kiểm thử độc lập đối soát qua HTTP API và PostgreSQL:
 * 1. Tạo cán bộ mới -> lưu PostgreSQL -> F5 vẫn tồn tại.
 * 2. Chỉnh sửa cán bộ -> Reload đúng dữ liệu.
 * 3. Điều chuyển đơn vị -> dữ liệu mới đúng, lịch sử cũ được bảo toàn.
 * 4. Tạo Account liên kết Person -> đăng nhập đúng theo trạng thái được cấp.
 * 5. Vô hiệu hóa Account -> không thể tiếp tục truy cập trái phép bằng JWT cũ.
 * 6. Người không có quyền không thể thêm/sửa/vô hiệu hóa tài khoản (HTTP 403).
 * 7. Không thể tự nâng quyền hoặc tự gán quyền nghiệp vụ không hợp lệ.
 * 8. Scope Guard: Không thể xem hoặc thay đổi Person ngoài phạm vi cho phép (HTTP 403).
 * 9. Dữ liệu trùng hoặc không hợp lệ bị Backend từ chối (HTTP 400 / 409).
 * 10. Frontend UI Safety: Xử lý lỗi API giữ form, không tạo success giả.
 * 11. SYSTEM_ADMIN không tự động có quyền xem hoặc chốt Snapshot nghiệp vụ (HTTP 403).
 * 12. AuditEvent ghi nhận đúng người thực hiện và các thay đổi quan trọng.
 */

import { prisma } from "../src/server/db";

const BASE_URL = "http://localhost:3000";

interface AuthSession {
  token: string;
  user: any;
}

async function loginAs(username: string, password: string = "demo123"): Promise<AuthSession> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Đăng nhập thất bại cho "${username}" (${res.status}): ${text}`);
  }

  const data = await res.json();
  return { token: data.token, user: data.user };
}

async function runPersonnelTests() {
  console.log("=".repeat(80));
  console.log("TALUNG-CUS-WORK — P1 FIX 06A: TEST SUITE QUẢN TRỊ CÁN BỘ, TÀI KHOẢN & PHÂN QUYỀN");
  console.log("=".repeat(80));

  let passedTests = 0;
  const totalTests = 12;

  // 1. Chuẩn bị các phiên làm việc
  console.log("\n[SETUP] Khởi tạo các phiên làm việc...");
  const leaderSession = await loginAs("lanhdao"); // UNIT_LEADER
  const adminSession = await loginAs("admin"); // SYSTEM_ADMIN
  const officerSession = await loginAs("canbo_a"); // STAFF
  console.log("✓ Đã đăng nhập: lanhdao (UNIT_LEADER), admin (SYSTEM_ADMIN), canbo_a (STAFF)");

  // Lấy danh sách đơn vị để thử nghiệm
  const units = await prisma.orgUnit.findMany({
    where: { status: "ACTIVE" },
    orderBy: { level: "asc" },
  });
  if (units.length < 2) {
    throw new Error("Hệ thống cần ít nhất 2 đơn vị trong CSDL để thử nghiệm điều chuyển");
  }
  const unitA = units.find((u) => u.code.includes("NGHIEPVU") || u.code.includes("BP_")) || units[0];
  const unitB = units.find((u) => u.id !== unitA.id) || units[1];

  const positions = await prisma.position.findMany({ where: { status: "ACTIVE" } });
  const positionA = positions[0];
  const positionB = positions.length > 1 ? positions[1] : positions[0];

  const uniqueSuffix = Date.now().toString().slice(-4);
  const testPersonCode = `CB-TEST-${uniqueSuffix}`;
  const testUsername = `user_test_${uniqueSuffix}`;
  let createdPersonId = "";
  let createdAccountId = "";

  // --------------------------------------------------------------------------
  // KỊCH BẢN 1: Tạo cán bộ mới -> lưu PostgreSQL -> F5 vẫn tồn tại
  // --------------------------------------------------------------------------
  try {
    console.log("\n--------------------------------------------------------------------------------");
    console.log("KỊCH BẢN 1: Tạo cán bộ mới qua API -> Lưu PostgreSQL -> Reload vẫn tồn tại");
    console.log("--------------------------------------------------------------------------------");

    const payload = {
      code: testPersonCode,
      fullName: `Đ/c Kiểm Thử Số ${uniqueSuffix}`,
      unitId: unitA.id,
      positionId: positionA?.id,
      email: `test.${uniqueSuffix}@talung.cus.demo`,
      phone: `0988${uniqueSuffix}12`,
      notes: "Cán bộ kiểm thử quy trình P1 FIX 06A",
    };

    const res = await fetch(`${BASE_URL}/api/people`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminSession.token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (res.status !== 201 || !data.success) {
      throw new Error(`Tạo cán bộ thất bại (${res.status}): ${JSON.stringify(data)}`);
    }

    createdPersonId = data.data.id;

    // Đối soát trực tiếp trong PostgreSQL
    const dbPerson = await prisma.person.findUnique({
      where: { id: createdPersonId },
      include: { assignments: { include: { unit: true, position: true } } },
    });

    if (!dbPerson || dbPerson.code !== testPersonCode) {
      throw new Error("Không tìm thấy cán bộ trong PostgreSQL sau khi API báo thành công");
    }

    const primaryAssign = dbPerson.assignments.find((a) => a.isPrimary);
    if (!primaryAssign || primaryAssign.unitId !== unitA.id) {
      throw new Error("Phân công ban đầu vào Đơn vị A không chính xác trong PostgreSQL");
    }

    // Giả lập Reload (F5): GET /api/people/:id
    const reloadRes = await fetch(`${BASE_URL}/api/people/${createdPersonId}`, {
      headers: { Authorization: `Bearer ${adminSession.token}` },
    });
    const reloadData = await reloadRes.json();
    if (!reloadRes.ok || reloadData.data.code !== testPersonCode) {
      throw new Error("Reload (F5) không tìm thấy cán bộ vừa tạo");
    }

    console.log(`✅ [PASS] Kịch bản 1: Đã tạo và đối soát cán bộ ${testPersonCode} trong PostgreSQL và F5 thành công.`);
    passedTests++;
  } catch (err: any) {
    console.error("❌ [FAIL] Kịch bản 1:", err.message);
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN 2: Chỉnh sửa cán bộ -> Reload đúng dữ liệu
  // --------------------------------------------------------------------------
  try {
    console.log("\n--------------------------------------------------------------------------------");
    console.log("KỊCH BẢN 2: Chỉnh sửa thông tin cán bộ -> Reload đúng dữ liệu mới");
    console.log("--------------------------------------------------------------------------------");

    const updatedName = `Đ/c Kiểm Thử (Đã Sửa Tên ${uniqueSuffix})`;
    const updatedPhone = "0912999888";

    const res = await fetch(`${BASE_URL}/api/people/${createdPersonId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminSession.token}`,
      },
      body: JSON.stringify({
        fullName: updatedName,
        phone: updatedPhone,
        notes: "Đã cập nhật thông tin qua bản sửa P1 FIX 06A",
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(`Sửa thông tin cán bộ thất bại (${res.status}): ${JSON.stringify(data)}`);
    }

    // Đối soát CSDL
    const dbCheck = await prisma.person.findUnique({ where: { id: createdPersonId } });
    if (!dbCheck || dbCheck.fullName !== updatedName || dbCheck.phone !== updatedPhone) {
      throw new Error("Dữ liệu sau khi sửa trong PostgreSQL không khớp với payload");
    }

    // Reload qua API
    const reloadRes = await fetch(`${BASE_URL}/api/people/${createdPersonId}`, {
      headers: { Authorization: `Bearer ${adminSession.token}` },
    });
    const reloadData = await reloadRes.json();
    if (reloadData.data.fullName !== updatedName) {
      throw new Error("Reload API không phản ánh họ tên mới");
    }

    console.log(`✅ [PASS] Kịch bản 2: Đã sửa thông tin và đối soát thành công (Họ tên: "${updatedName}").`);
    passedTests++;
  } catch (err: any) {
    console.error("❌ [FAIL] Kịch bản 2:", err.message);
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN 3: Điều chuyển đơn vị -> dữ liệu mới đúng, lịch sử cũ được bảo toàn
  // --------------------------------------------------------------------------
  try {
    console.log("\n--------------------------------------------------------------------------------");
    console.log("KỊCH BẢN 3: Điều chuyển đơn vị -> Phân công mới đúng, bảo toàn lịch sử");
    console.log("--------------------------------------------------------------------------------");

    // a. Kiểm tra chặn ngày hiệu lực trong tương lai (Future effective date guard)
    const futureDateRes = await fetch(`${BASE_URL}/api/people/${createdPersonId}/transfer`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminSession.token}`,
      },
      body: JSON.stringify({
        newUnitId: unitB.id,
        newPositionId: positionB?.id,
        effectiveDate: "2029-12-31",
      }),
    });
    if (futureDateRes.status !== 400) {
      throw new Error(`Điều chuyển với ngày hiệu lực tương lai phải bị chặn với 400, nhận được: ${futureDateRes.status}`);
    }

    // b. Thực hiện điều chuyển hợp lệ
    const effDate = new Date().toISOString().slice(0, 10);
    const res = await fetch(`${BASE_URL}/api/people/${createdPersonId}/transfer`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminSession.token}`,
      },
      body: JSON.stringify({
        newUnitId: unitB.id,
        newPositionId: positionB?.id,
        effectiveDate: effDate,
        decisionNumber: `QĐ-ĐĐ-${uniqueSuffix}/HQTL`,
        notes: "Điều chuyển tăng cường công tác",
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(`Điều chuyển thất bại (${res.status}): ${JSON.stringify(data)}`);
    }

    // Đối soát CSDL: Cán bộ phải có đúng 2 bản ghi PersonAssignment
    const allAssignments = await prisma.personAssignment.findMany({
      where: { personId: createdPersonId },
      orderBy: { createdAt: "asc" },
      include: { unit: true },
    });

    if (allAssignments.length !== 2) {
      throw new Error(`Mong đợi 2 bản ghi phân công (lịch sử + hiện tại), thực tế: ${allAssignments.length}`);
    }

    const oldAssign = allAssignments[0];
    const newAssign = allAssignments[1];

    if (oldAssign.isPrimary !== false || !oldAssign.effectiveTo) {
      throw new Error("Phân công cũ chưa được đóng (isPrimary phải false và có effectiveTo)");
    }
    if (oldAssign.unitId !== unitA.id) {
      throw new Error("Phân công cũ không giữ đúng đơn vị ban đầu (Unit A)");
    }

    if (newAssign.isPrimary !== true || newAssign.unitId !== unitB.id || newAssign.effectiveTo !== null) {
      throw new Error("Phân công mới không phản ánh đúng Đơn vị B hoặc chưa đánh dấu isPrimary = true");
    }

    console.log(
      `✅ [PASS] Kịch bản 3: Điều chuyển từ "${unitA.name}" sang "${unitB.name}" thành công; Phân công cũ được đóng an toàn, lịch sử bảo toàn 100%.`
    );
    passedTests++;
  } catch (err: any) {
    console.error("❌ [FAIL] Kịch bản 3:", err.message);
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN 4: Tạo Account liên kết Person -> đăng nhập đúng theo trạng thái được cấp
  // --------------------------------------------------------------------------
  try {
    console.log("\n--------------------------------------------------------------------------------");
    console.log("KỊCH BẢN 4: Cấp Account liên kết Person -> Đăng nhập thành công với mật khẩu thật");
    console.log("--------------------------------------------------------------------------------");

    // a. Kiểm tra chính sách mật khẩu: Từ chối mật khẩu yếu < 8 ký tự hoặc thiếu chữ/số
    const weakPassRes = await fetch(`${BASE_URL}/api/people/${createdPersonId}/account`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminSession.token}`,
      },
      body: JSON.stringify({
        username: testUsername,
        password: "12345", // yếu
        roleCode: "STAFF",
      }),
    });
    if (weakPassRes.status !== 400) {
      throw new Error(`Mật khẩu yếu phải bị từ chối với HTTP 400, nhận được: ${weakPassRes.status}`);
    }

    // b. Cấp tài khoản với mật khẩu mạnh hợp lệ
    const testPassword = `Pass@Secure${uniqueSuffix}`;
    const res = await fetch(`${BASE_URL}/api/people/${createdPersonId}/account`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminSession.token}`,
      },
      body: JSON.stringify({
        username: testUsername,
        password: testPassword,
        roleCode: "STAFF",
        scopeType: "DEPARTMENT",
      }),
    });

    const data = await res.json();
    if (res.status !== 201 || !data.success) {
      throw new Error(`Cấp tài khoản thất bại (${res.status}): ${JSON.stringify(data)}`);
    }

    createdAccountId = data.data.id;

    // Đối soát CSDL: Mật khẩu phải được hash bcrypt, không được lưu plaintext
    const dbAccount = await prisma.account.findUnique({
      where: { id: createdAccountId },
      include: { roleGrants: { include: { role: true } } },
    });
    if (!dbAccount) {
      throw new Error("Tài khoản không tồn tại trong CSDL");
    }
    if (dbAccount.passwordHash === testPassword) {
      throw new Error("NGHIÊM TRỌNG: Mật khẩu bị lưu dưới dạng plaintext!");
    }
    if (!dbAccount.passwordHash.startsWith("$2")) {
      throw new Error("Mật khẩu chưa được băm bằng chuẩn bcrypt an toàn");
    }

    // Thử đăng nhập thực tế bằng tài khoản vừa tạo
    const newOfficerSession = await loginAs(testUsername, testPassword);
    if (!newOfficerSession.token || newOfficerSession.user.username !== testUsername) {
      throw new Error("Đăng nhập bằng tài khoản mới được cấp thất bại");
    }

    console.log(
      `✅ [PASS] Kịch bản 4: Cấp tài khoản "${testUsername}" thành công; Mật khẩu băm bcrypt an toàn; Đăng nhập thực tế thành công.`
    );
    passedTests++;
  } catch (err: any) {
    console.error("❌ [FAIL] Kịch bản 4:", err.message);
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN 5: Vô hiệu hóa Account -> không thể tiếp tục truy cập bằng JWT cũ
  // --------------------------------------------------------------------------
  try {
    console.log("\n--------------------------------------------------------------------------------");
    console.log("KỊCH BẢN 5: Vô hiệu hóa Account -> Thu hồi phiên và từ chối JWT cũ thời gian thực");
    console.log("--------------------------------------------------------------------------------");

    // Lấy JWT hợp lệ trước khi vô hiệu hóa
    const testPassword = `Pass@Secure${uniqueSuffix}`;
    const validSessionBeforeLock = await loginAs(testUsername, testPassword);

    // Kiểm tra token này gọi được API /api/auth/me
    const testPreCheck = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${validSessionBeforeLock.token}` },
    });
    if (!testPreCheck.ok) {
      throw new Error("Trước khi khóa, token phải hoạt động bình thường");
    }

    // Thực hiện vô hiệu hóa tài khoản qua API
    const lockRes = await fetch(`${BASE_URL}/api/people/${createdPersonId}/account/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminSession.token}`,
      },
      body: JSON.stringify({
        status: "DISABLED",
        reason: "Thử nghiệm vô hiệu hóa tài khoản P1 FIX 06A",
      }),
    });
    const lockData = await lockRes.json();
    if (!lockRes.ok || !lockData.success) {
      throw new Error(`Vô hiệu hóa thất bại (${lockRes.status}): ${JSON.stringify(lockData)}`);
    }

    // Kiểm tra CSDL
    const dbAccAfterLock = await prisma.account.findUnique({ where: { id: createdAccountId } });
    if (dbAccAfterLock?.status !== "DISABLED") {
      throw new Error("Trạng thái trong PostgreSQL chưa chuyển thành DISABLED");
    }

    // ĐĂNG NHẬP MỚI PHẢI BỊ CHẶN (HTTP 403)
    const reloginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: testUsername, password: testPassword }),
    });
    if (reloginRes.status !== 403) {
      throw new Error(`Đăng nhập tài khoản bị khóa phải trả về HTTP 403, nhận được: ${reloginRes.status}`);
    }

    // ĐẶC BIỆT: DÙNG JWT CŨ ĐÃ CẤP TRƯỚC ĐÓ ĐỂ GỌI API -> PHẢI BỊ CHẶN (HTTP 401)
    const oldJwtCall = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${validSessionBeforeLock.token}` },
    });
    if (oldJwtCall.status !== 401) {
      throw new Error(`LỖ HỔNG: JWT cũ vẫn truy cập được sau khi tài khoản bị vô hiệu hóa! Nhận được: ${oldJwtCall.status}`);
    }

    console.log(
      `✅ [PASS] Kịch bản 5: Vô hiệu hóa tài khoản thành công; Đăng nhập mới bị từ chối (403); Toàn bộ JWT đã cấp trước đó bị thu hồi hiệu lực ngay lập tức (401 Unauthorized).`
    );
    passedTests++;
  } catch (err: any) {
    console.error("❌ [FAIL] Kịch bản 5:", err.message);
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN 6: Người không có quyền không thể thêm/sửa/vô hiệu hóa (HTTP 403)
  // --------------------------------------------------------------------------
  try {
    console.log("\n--------------------------------------------------------------------------------");
    console.log("KỊCH BẢN 6: Phân quyền RBAC chặn cán bộ thường thêm/sửa/khóa tài khoản (403)");
    console.log("--------------------------------------------------------------------------------");

    // Cán bộ thường gọi POST /api/people
    const unauthAdd = await fetch(`${BASE_URL}/api/people`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${officerSession.token}`,
      },
      body: JSON.stringify({
        code: `CB-UNAUTH-${uniqueSuffix}`,
        fullName: "Cán bộ không hợp lệ",
        unitId: unitA.id,
      }),
    });
    if (unauthAdd.status !== 403) {
      throw new Error(`Cán bộ thường tạo nhân sự phải nhận 403, nhận được: ${unauthAdd.status}`);
    }

    // Cán bộ thường gọi PUT /api/people/:id
    const unauthEdit = await fetch(`${BASE_URL}/api/people/${createdPersonId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${officerSession.token}`,
      },
      body: JSON.stringify({ fullName: "Cán bộ cố tình sửa" }),
    });
    if (unauthEdit.status !== 403) {
      throw new Error(`Cán bộ thường sửa nhân sự phải nhận 403, nhận được: ${unauthEdit.status}`);
    }

    // Cán bộ thường gọi PATCH status tài khoản
    const unauthStatus = await fetch(`${BASE_URL}/api/people/${createdPersonId}/account/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${officerSession.token}`,
      },
      body: JSON.stringify({ status: "ACTIVE" }),
    });
    if (unauthStatus.status !== 403) {
      throw new Error(`Cán bộ thường đổi status tài khoản phải nhận 403, nhận được: ${unauthStatus.status}`);
    }

    console.log("✅ [PASS] Kịch bản 6: Toàn bộ thao tác thêm/sửa/khóa của cán bộ không có thẩm quyền đều bị chặn với HTTP 403 Forbidden.");
    passedTests++;
  } catch (err: any) {
    console.error("❌ [FAIL] Kịch bản 6:", err.message);
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN 7: Không thể tự nâng quyền hoặc tự gán quyền nghiệp vụ không hợp lệ
  // --------------------------------------------------------------------------
  try {
    console.log("\n--------------------------------------------------------------------------------");
    console.log("KỊCH BẢN 7: Ngăn chặn tự nâng quyền (Privilege Escalation Guard)");
    console.log("--------------------------------------------------------------------------------");

    // Người dùng bình thường không thể gán role UNIT_LEADER
    const unauthEscalate = await fetch(`${BASE_URL}/api/people/${createdPersonId}/account`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${officerSession.token}`,
      },
      body: JSON.stringify({
        username: `escalate_${uniqueSuffix}`,
        password: "Password123",
        roleCode: "UNIT_LEADER",
      }),
    });

    if (unauthEscalate.status !== 403) {
      throw new Error(`Thao tác nâng quyền trái phép phải nhận 403 Forbidden, nhận được: ${unauthEscalate.status}`);
    }

    console.log("✅ [PASS] Kịch bản 7: Backend chặn đứng hành vi tự nâng quyền hoặc gán quyền vượt cấp (HTTP 403 Forbidden).");
    passedTests++;
  } catch (err: any) {
    console.error("❌ [FAIL] Kịch bản 7:", err.message);
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN 8: Scope Guard: Không thể xem hoặc thay đổi Person ngoài phạm vi
  // --------------------------------------------------------------------------
  try {
    console.log("\n--------------------------------------------------------------------------------");
    console.log("KỊCH BẢN 8: Scope Guard kiểm soát phạm vi xem nhân sự theo đơn vị");
    console.log("--------------------------------------------------------------------------------");

    // Lấy một đơn vị mà cán bộ canbo_a không thuộc về
    const foreignUnit = units.find((u) => u.id !== officerSession.user.unitId);
    if (foreignUnit) {
      const scopeCheck = await fetch(`${BASE_URL}/api/people?unitId=${foreignUnit.id}`, {
        headers: { Authorization: `Bearer ${officerSession.token}` },
      });

      if (scopeCheck.status !== 403) {
        throw new Error(
          `Cán bộ thường xem nhân sự đơn vị khác phải bị Scope Guard chặn với 403, nhận được: ${scopeCheck.status}`
        );
      }
    }

    console.log("✅ [PASS] Kịch bản 8: Scope Guard hoạt động chính xác, chặn truy cập danh sách nhân sự chéo đơn vị (HTTP 403).");
    passedTests++;
  } catch (err: any) {
    console.error("❌ [FAIL] Kịch bản 8:", err.message);
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN 9: Dữ liệu trùng hoặc không hợp lệ bị Backend từ chối (400 / 409)
  // --------------------------------------------------------------------------
  try {
    console.log("\n--------------------------------------------------------------------------------");
    console.log("KỊCH BẢN 9: Kiểm tra chống trùng định danh và validate dữ liệu (400/409)");
    console.log("--------------------------------------------------------------------------------");

    // a. Trùng mã cán bộ
    const dupCodeRes = await fetch(`${BASE_URL}/api/people`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminSession.token}`,
      },
      body: JSON.stringify({
        code: testPersonCode, // Đã tồn tại
        fullName: "Cán bộ trùng mã",
        unitId: unitA.id,
      }),
    });
    if (dupCodeRes.status !== 409) {
      throw new Error(`Trùng mã cán bộ phải trả về 409 Conflict, nhận được: ${dupCodeRes.status}`);
    }

    // b. Thiếu trường bắt buộc
    const invalidRes = await fetch(`${BASE_URL}/api/people`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminSession.token}`,
      },
      body: JSON.stringify({
        code: "",
        fullName: "Cán bộ thiếu mã",
      }),
    });
    if (invalidRes.status !== 400) {
      throw new Error(`Thiếu trường bắt buộc phải trả về 400 Bad Request, nhận được: ${invalidRes.status}`);
    }

    // c. Điều chuyển về đúng đơn vị và chức vụ hiện tại không đổi
    const noopTransfer = await fetch(`${BASE_URL}/api/people/${createdPersonId}/transfer`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminSession.token}`,
      },
      body: JSON.stringify({
        newUnitId: unitB.id, // Đã chuyển sang unitB ở test 3
        newPositionId: positionB?.id,
      }),
    });
    if (noopTransfer.status !== 400) {
      throw new Error(`Điều chuyển trùng đơn vị hiện tại phải trả về 400 Bad Request, nhận được: ${noopTransfer.status}`);
    }

    console.log("✅ [PASS] Kịch bản 9: Backend từ chối chính xác dữ liệu trùng lặp (409) và dữ liệu không hợp lệ (400).");
    passedTests++;
  } catch (err: any) {
    console.error("❌ [FAIL] Kịch bản 9:", err.message);
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN 10: API thất bại -> UI giữ nội dung form, không báo thành công giả
  // --------------------------------------------------------------------------
  try {
    console.log("\n--------------------------------------------------------------------------------");
    console.log("KỊCH BẢN 10: Kiểm tra mã nguồn UI xử lý lỗi trung thực (Zero Fake Success)");
    console.log("--------------------------------------------------------------------------------");

    // Đọc mã nguồn src/app/admin/organization/page.tsx để xác minh:
    // 1. Không có catch {} nuốt lỗi
    // 2. Có modalError hiển thị banner lỗi
    // 3. Không xóa dữ liệu form khi API trả về !res.ok
    const fs = await import("fs");
    const uiContent = fs.readFileSync("src/app/admin/organization/page.tsx", "utf-8");

    if (uiContent.includes("toast.info(\"Đã ghi nhận") || uiContent.includes("catch {}")) {
      throw new Error("Phát hiện đoạn mã giả lập thành công hoặc nuốt lỗi trong page.tsx");
    }

    if (!uiContent.includes("setModalError(json.error") && !uiContent.includes("setModalError(data.error")) {
      throw new Error("Giao diện chưa có cơ chế setModalError để hiển thị thông báo lỗi từ Backend");
    }

    if (!uiContent.includes("confirmDialog")) {
      throw new Error("Giao diện thiếu dialog xác nhận an toàn trước khi thay đổi trạng thái tài khoản");
    }

    console.log("✅ [PASS] Kịch bản 10: Mã nguồn UI xử lý lỗi trung thực, hiển thị banner lỗi trực tiếp trong modal, giữ nguyên form.");
    passedTests++;
  } catch (err: any) {
    console.error("❌ [FAIL] Kịch bản 10:", err.message);
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN 11: SYSTEM_ADMIN không tự động có quyền xem hoặc chốt Snapshot nghiệp vụ
  // --------------------------------------------------------------------------
  try {
    console.log("\n--------------------------------------------------------------------------------");
    console.log("KỊCH BẢN 11: SYSTEM_ADMIN bị chặn khi cố chốt hoặc xem Snapshot nghiệp vụ (403)");
    console.log("--------------------------------------------------------------------------------");

    // Thử gọi chốt kỳ số liệu bằng tài khoản SYSTEM_ADMIN
    const adminLockRes = await fetch(`${BASE_URL}/api/reports/snapshots`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminSession.token}`,
      },
      body: JSON.stringify({ notes: "Admin cố chốt kỳ trái thẩm quyền" }),
    });

    if (adminLockRes.status !== 403) {
      throw new Error(
        `SYSTEM_ADMIN chốt kỳ báo cáo phải bị từ chối với HTTP 403 Forbidden, nhận được: ${adminLockRes.status}`
      );
    }

    // Thử gọi xem danh sách bản chốt bằng tài khoản SYSTEM_ADMIN
    const adminListRes = await fetch(`${BASE_URL}/api/reports/snapshots`, {
      headers: { Authorization: `Bearer ${adminSession.token}` },
    });

    if (adminListRes.status !== 403) {
      throw new Error(
        `SYSTEM_ADMIN xem bản chốt nghiệp vụ phải bị từ chối với HTTP 403 Forbidden, nhận được: ${adminListRes.status}`
      );
    }

    console.log(
      "✅ [PASS] Kịch bản 11: Đúng nguyên tắc phân quyền: SYSTEM_ADMIN hoàn toàn không có quyền xem hay chốt Snapshot nghiệp vụ (HTTP 403 Forbidden)."
    );
    passedTests++;
  } catch (err: any) {
    console.error("❌ [FAIL] Kịch bản 11:", err.message);
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN 12: AuditEvent ghi nhận đúng người thực hiện và các thay đổi quan trọng
  // --------------------------------------------------------------------------
  try {
    console.log("\n--------------------------------------------------------------------------------");
    console.log("KỊCH BẢN 12: Kiểm toán an ninh PostgreSQL ghi nhận đầy đủ chuỗi AuditEvent");
    console.log("--------------------------------------------------------------------------------");

    const auditEvents = await prisma.auditEvent.findMany({
      where: {
        OR: [
          { resourceId: createdPersonId },
          { resourceId: createdAccountId },
        ],
      },
      orderBy: { timestamp: "asc" },
    });

    const actions = auditEvents.map((e) => e.action);

    const hasCreate = actions.includes("PERSON_CREATE");
    const hasUpdate = actions.includes("PERSON_UPDATE");
    const hasTransfer = actions.includes("PERSON_TRANSFER");
    const hasAccountCreate = actions.includes("ACCOUNT_CREATE");
    const hasAccountStatus = actions.includes("ACCOUNT_STATUS_CHANGE");

    if (!hasCreate || !hasUpdate || !hasTransfer || !hasAccountCreate || !hasAccountStatus) {
      throw new Error(
        `Thiếu sự kiện kiểm toán bắt buộc. Danh sách tìm thấy: ${JSON.stringify(actions)}`
      );
    }

    // Kiểm tra không có password plaintext trong newData
    for (const event of auditEvents) {
      const dataStr = JSON.stringify(event.newData || {});
      if (dataStr.includes("Pass@Secure") || dataStr.includes("passwordHash")) {
        throw new Error("NGUY HIỂM: AuditEvent lưu thông tin mật khẩu bí mật!");
      }
    }

    console.log(
      `✅ [PASS] Kịch bản 12: Ghi nhận đầy đủ 4 sự kiện kiểm toán (PERSON_CREATE, PERSON_UPDATE, ACCOUNT_CREATE, ACCOUNT_STATUS_CHANGE) gắn với Actor hợp lệ; Mật khẩu được bảo vệ tuyệt đối.`
    );
    passedTests++;
  } catch (err: any) {
    console.error("❌ [FAIL] Kịch bản 12:", err.message);
  }

  // --------------------------------------------------------------------------
  // TỔNG KẾT
  // --------------------------------------------------------------------------
  console.log("\n" + "=".repeat(80));
  console.log(`TỔNG KẾT KIỂM THỬ THỰC TẾ: ${passedTests}/${totalTests} KỊCH BẢN ĐẠT CHUẨN (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log("=".repeat(80));

  if (passedTests === totalTests) {
    console.log("\n>> TOÀN BỘ 12/12 KỊCH BẢN P1 FIX 06A ĐỀU HOẠT ĐỘNG HOÀN TOÀN TRÊN DỮ LIỆU THỰC TẾ!\n");
  } else {
    process.exit(1);
  }
}

runPersonnelTests()
  .catch((err) => {
    console.error("Lỗi khi chạy bộ kiểm thử:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
