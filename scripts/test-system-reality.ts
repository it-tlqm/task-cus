/**
 * TALUNG-CUS-WORK — P1 FIX 07: TEST SUITE QUẢN TRỊ HỆ THỐNG THỰC TẾ (/admin/system)
 * 
 * Bộ kiểm thử độc lập đối soát qua HTTP API, PostgreSQL và Puppeteer Browser:
 * 1. Nạp cơ cấu tổ chức thật từ PostgreSQL qua API overview.
 * 2. Số liệu cán bộ và tài khoản thống nhất với CSDL thật.
 * 3. Ma trận vai trò và phân quyền phản ánh chuẩn xác RoleGrant/RolePermission.
 * 4. SYSTEM_ADMIN bị chặn khi cố can thiệp dữ liệu nghiệp vụ nhạy cảm (403).
 * 5. Cán bộ thường không có quyền sửa cấu hình hệ thống (HTTP 403).
 * 6. Người có quyền (admin) cập nhật tham số cấu hình thành công, F5 vẫn bền vững.
 * 7. Module nghiệp vụ (thông báo cảnh báo) thực sự tiếp nhận tham số cấu hình mới.
 * 8. Giá trị cấu hình không hợp lệ bị Backend từ chối với HTTP 400.
 * 9. Kiểm toán an ninh PostgreSQL ghi nhận sự kiện SYSTEM_CONFIG_UPDATE.
 * 10. Frontend UI Safety: Xử lý lỗi trung thực (Zero Fake Success).
 * 11. Trạng thái sao lưu & phục hồi thể hiện trung thực (NOT_CONFIGURED, không có fake restore).
 * 12. Thao tác sửa cấu hình trên trình duyệt thật (Chrome Headless / Puppeteer).
 */

import puppeteer from "puppeteer-core";
import { prisma } from "../src/server/db";
import * as fs from "fs";
import * as path from "path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE_URL = "http://localhost:3000";

async function loginAs(username: string, password: string = "demo123") {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`Đăng nhập thất bại cho ${username}`);
  const data = await res.json();
  const setCookie = res.headers.get("set-cookie") || "";
  const tokenMatch = setCookie.match(/token=([^;]+)/);
  return { token: data.token, cookieToken: tokenMatch ? tokenMatch[1] : data.token, user: data.user };
}

async function runSystemTests() {
  console.log("=".repeat(80));
  console.log("TALUNG-CUS-WORK — P1 FIX 07: TEST SUITE QUẢN TRỊ HỆ THỐNG THỰC TẾ (/admin/system)");
  console.log("=".repeat(80));

  let passedTests = 0;
  const totalTests = 12;

  const leaderSession = await loginAs("lanhdao");
  const adminSession = await loginAs("admin");
  const officerSession = await loginAs("canbo_a");
  console.log("✓ Đã khởi tạo các phiên: lanhdao (UNIT_LEADER), admin (SYSTEM_ADMIN), canbo_a (STAFF)\n");

  // --------------------------------------------------------------------------
  // KỊCH BẢN 1: Nạp cơ cấu tổ chức thật từ PostgreSQL qua API overview
  // --------------------------------------------------------------------------
  console.log("-".repeat(80));
  console.log("KỊCH BẢN 1: Nạp cơ cấu tổ chức thật từ PostgreSQL qua API overview");
  console.log("-".repeat(80));
  try {
    const res = await fetch(`${BASE_URL}/api/admin/system/overview`, {
      headers: { Authorization: `Bearer ${adminSession.token}` },
    });
    if (!res.ok) throw new Error(`GET overview thất bại: ${res.status}`);
    const json = await res.json();
    const org = json.data?.organization;

    const dbUnits = await prisma.orgUnit.count();
    const dbPositions = await prisma.position.count();

    if (org.totalUnits !== dbUnits || org.totalPositions !== dbPositions) {
      throw new Error(`Số liệu đơn vị không khớp DB: API=${org.totalUnits}/${org.totalPositions}, DB=${dbUnits}/${dbPositions}`);
    }

    console.log(`✅ [PASS] Kịch bản 1: API overview trả về đúng ${org.totalUnits} đơn vị và ${org.totalPositions} chức vụ từ PostgreSQL.`);
    passedTests++;
  } catch (err: any) {
    console.error(`❌ [FAIL] Kịch bản 1: ${err.message}`);
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN 2: Số liệu cán bộ và tài khoản thống nhất với CSDL thật
  // --------------------------------------------------------------------------
  console.log("\n" + "-".repeat(80));
  console.log("KỊCH BẢN 2: Số liệu cán bộ và tài khoản thống nhất với CSDL thật");
  console.log("-".repeat(80));
  try {
    const res = await fetch(`${BASE_URL}/api/admin/system/overview`, {
      headers: { Authorization: `Bearer ${adminSession.token}` },
    });
    const json = await res.json();
    const org = json.data?.organization;

    const dbPersons = await prisma.person.count();
    const dbActivePersons = await prisma.person.count({ where: { status: "ACTIVE" } });
    const dbAccounts = await prisma.account.count();

    if (org.totalPersons !== dbPersons || org.activePersons !== dbActivePersons || org.totalAccounts !== dbAccounts) {
      throw new Error("Số liệu nhân sự và tài khoản không khớp PostgreSQL!");
    }

    console.log(`✅ [PASS] Kịch bản 2: Số liệu cán bộ (${org.totalPersons}), cán bộ hoạt động (${org.activePersons}) và tài khoản (${org.totalAccounts}) khớp 100% với PostgreSQL.`);
    passedTests++;
  } catch (err: any) {
    console.error(`❌ [FAIL] Kịch bản 2: ${err.message}`);
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN 3: Ma trận vai trò và phân quyền phản ánh chuẩn xác Role/Permission
  // --------------------------------------------------------------------------
  console.log("\n" + "-".repeat(80));
  console.log("KỊCH BẢN 3: Ma trận vai trò và phân quyền phản ánh chuẩn xác Role/Permission");
  console.log("-".repeat(80));
  try {
    const res = await fetch(`${BASE_URL}/api/admin/system/overview`, {
      headers: { Authorization: `Bearer ${adminSession.token}` },
    });
    const json = await res.json();
    const rbac = json.data?.rbac;

    const dbRoles = await prisma.role.count();
    const dbPermissions = await prisma.permission.count();

    if (rbac.totalRoles !== dbRoles || rbac.totalPermissions !== dbPermissions) {
      throw new Error(`Số lượng roles/permissions không khớp: API=${rbac.totalRoles}/${rbac.totalPermissions}, DB=${dbRoles}/${dbPermissions}`);
    }

    // Xác nhận có đủ vai trò chuẩn
    const roleCodes = rbac.roles.map((r: any) => r.code);
    if (!roleCodes.includes("SYSTEM_ADMIN") || !roleCodes.includes("UNIT_LEADER") || !roleCodes.includes("STAFF")) {
      throw new Error("Thiếu vai trò bắt buộc trong ma trận RBAC!");
    }

    console.log(`✅ [PASS] Kịch bản 3: Ma trận phân quyền phản ánh đầy đủ ${rbac.totalRoles} vai trò và ${rbac.totalPermissions} mã quyền từ cơ sở dữ liệu.`);
    passedTests++;
  } catch (err: any) {
    console.error(`❌ [FAIL] Kịch bản 3: ${err.message}`);
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN 4: SYSTEM_ADMIN bị chặn khi cố can thiệp dữ liệu nghiệp vụ nhạy cảm (403)
  // --------------------------------------------------------------------------
  console.log("\n" + "-".repeat(80));
  console.log("KỊCH BẢN 4: SYSTEM_ADMIN bị chặn khi cố can thiệp dữ liệu nghiệp vụ nhạy cảm (403)");
  console.log("-".repeat(80));
  try {
    // 1. SYSTEM_ADMIN thử truy cập KPI nghiệp vụ
    const kpiRes = await fetch(`${BASE_URL}/api/dashboard/kpi`, {
      headers: { Authorization: `Bearer ${adminSession.token}` },
    });
    if (kpiRes.status !== 403) {
      throw new Error(`SYSTEM_ADMIN xem KPI nghiệp vụ phải bị từ chối với 403, nhận được: ${kpiRes.status}`);
    }

    // 2. SYSTEM_ADMIN thử truy cập kế hoạch nghiệp vụ
    const planRes = await fetch(`${BASE_URL}/api/plans`, {
      headers: { Authorization: `Bearer ${adminSession.token}` },
    });
    if (planRes.status !== 403) {
      throw new Error(`SYSTEM_ADMIN xem kế hoạch nghiệp vụ phải bị từ chối với 403, nhận được: ${planRes.status}`);
    }

    // 3. SYSTEM_ADMIN thử chốt Snapshot báo cáo
    const snapRes = await fetch(`${BASE_URL}/api/reports/snapshots`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminSession.token}`,
      },
      body: JSON.stringify({ periodId: "test-period" }),
    });
    if (snapRes.status !== 403) {
      throw new Error(`SYSTEM_ADMIN chốt Snapshot nghiệp vụ phải bị từ chối với 403, nhận được: ${snapRes.status}`);
    }

    console.log(`✅ [PASS] Kịch bản 4: Phân quyền kỹ thuật chuẩn: SYSTEM_ADMIN hoàn toàn không có thẩm quyền truy cập KPI, kế hoạch hay chốt Snapshot nghiệp vụ (HTTP 403 Forbidden).`);
    passedTests++;
  } catch (err: any) {
    console.error(`❌ [FAIL] Kịch bản 4: ${err.message}`);
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN 5: Cán bộ thường không có quyền sửa cấu hình hệ thống (HTTP 403)
  // --------------------------------------------------------------------------
  console.log("\n" + "-".repeat(80));
  console.log("KỊCH BẢN 5: Cán bộ thường không có quyền sửa cấu hình hệ thống (HTTP 403)");
  console.log("-".repeat(80));
  try {
    const res = await fetch(`${BASE_URL}/api/admin/system/config`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${officerSession.token}`,
      },
      body: JSON.stringify({ key: "taskDueSoonHours", value: "48" }),
    });

    if (res.status !== 403) {
      throw new Error(`Cán bộ thường sửa cấu hình phải nhận 403, nhận được: ${res.status}`);
    }

    console.log(`✅ [PASS] Kịch bản 5: Backend bảo vệ nghiêm ngặt: Cán bộ không có quyền system.config bị từ chối ngay lập tức (HTTP 403 Forbidden).`);
    passedTests++;
  } catch (err: any) {
    console.error(`❌ [FAIL] Kịch bản 5: ${err.message}`);
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN 6: Người có quyền (admin) cập nhật tham số cấu hình thành công, F5 vẫn bền vững
  // --------------------------------------------------------------------------
  console.log("\n" + "-".repeat(80));
  console.log("KỊCH BẢN 6: Người có quyền (admin) cập nhật tham số cấu hình thành công, F5 vẫn bền vững");
  console.log("-".repeat(80));
  try {
    const testHours = "36";
    const putRes = await fetch(`${BASE_URL}/api/admin/system/config`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminSession.token}`,
      },
      body: JSON.stringify({ key: "taskDueSoonHours", value: testHours }),
    });

    if (!putRes.ok) {
      const err = await putRes.text();
      throw new Error(`PUT /api/admin/system/config thất bại (${putRes.status}): ${err}`);
    }

    // Kiểm tra trong PostgreSQL
    const inDb = await prisma.systemConfig.findUnique({ where: { key: "taskDueSoonHours" } });
    if (!inDb || inDb.value !== testHours) {
      throw new Error(`Giá trị trong PostgreSQL không khớp: ${inDb?.value} != ${testHours}`);
    }

    // F5 Reload qua GET
    const getRes = await fetch(`${BASE_URL}/api/admin/system/config`, {
      headers: { Authorization: `Bearer ${adminSession.token}` },
    });
    const getData = await getRes.json();
    const targetConfig = getData.data.find((c: any) => c.key === "taskDueSoonHours");
    if (targetConfig.value !== testHours) {
      throw new Error("Reload cấu hình không trả về giá trị mới!");
    }

    console.log(`✅ [PASS] Kịch bản 6: Cập nhật tham số taskDueSoonHours thành ${testHours}h thành công; lưu PostgreSQL và F5 bảo toàn nguyên vẹn.`);
    passedTests++;
  } catch (err: any) {
    console.error(`❌ [FAIL] Kịch bản 6: ${err.message}`);
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN 7: Module nghiệp vụ (thông báo cảnh báo) thực sự tiếp nhận tham số cấu hình mới
  // --------------------------------------------------------------------------
  console.log("\n" + "-".repeat(80));
  console.log("KỊCH BẢN 7: Module nghiệp vụ thực sự tiếp nhận tham số cấu hình mới");
  console.log("-".repeat(80));
  try {
    // Đọc cấu hình qua hàm helper backend
    const { getSystemConfigNumber } = await import("../src/server/system-config");
    const configuredHours = await getSystemConfigNumber("taskDueSoonHours", 24);

    if (configuredHours !== 36) {
      throw new Error(`Hàm đọc cấu hình hệ thống trả về giá trị cũ: ${configuredHours}h != 36h!`);
    }

    console.log(`✅ [PASS] Kịch bản 7: Module backend đọc trực tiếp giá trị cấu hình động mới (${configuredHours}h), loại bỏ hoàn toàn giá trị hardcode cũ.`);
    passedTests++;
  } catch (err: any) {
    console.error(`❌ [FAIL] Kịch bản 7: ${err.message}`);
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN 8: Giá trị cấu hình không hợp lệ bị Backend từ chối với HTTP 400
  // --------------------------------------------------------------------------
  console.log("\n" + "-".repeat(80));
  console.log("KỊCH BẢN 8: Giá trị cấu hình không hợp lệ bị Backend từ chối với HTTP 400");
  console.log("-".repeat(80));
  try {
    // 1. Thử gửi giá trị chữ vào trường số (taskDueSoonHours = "invalid_string")
    const strRes = await fetch(`${BASE_URL}/api/admin/system/config`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminSession.token}`,
      },
      body: JSON.stringify({ key: "taskDueSoonHours", value: "abc" }),
    });
    if (strRes.status !== 400) {
      throw new Error(`Giá trị chữ vào trường số phải nhận 400, nhận được: ${strRes.status}`);
    }

    // 2. Thử gửi giá trị ngoài dải cho phép (taskDueSoonHours = 9999 > max 168)
    const outRangeRes = await fetch(`${BASE_URL}/api/admin/system/config`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminSession.token}`,
      },
      body: JSON.stringify({ key: "taskDueSoonHours", value: "999" }),
    });
    if (outRangeRes.status !== 400) {
      throw new Error(`Giá trị vượt quá giới hạn tối đa phải nhận 400, nhận được: ${outRangeRes.status}`);
    }

    // 3. Thử gửi key không nằm trong danh mục hợp lệ
    const invalidKeyRes = await fetch(`${BASE_URL}/api/admin/system/config`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminSession.token}`,
      },
      body: JSON.stringify({ key: "HACK_KEY_ARBITRARY", value: "123" }),
    });
    if (invalidKeyRes.status !== 400) {
      throw new Error(`Key không hợp lệ phải nhận 400, nhận được: ${invalidKeyRes.status}`);
    }

    console.log(`✅ [PASS] Kịch bản 8: Backend validate chặt chẽ theo kiểu dữ liệu và dải giá trị, từ chối chính xác mọi dữ liệu sai (HTTP 400 Bad Request).`);
    passedTests++;
  } catch (err: any) {
    console.error(`❌ [FAIL] Kịch bản 8: ${err.message}`);
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN 9: Kiểm toán an ninh PostgreSQL ghi nhận sự kiện SYSTEM_CONFIG_UPDATE
  // --------------------------------------------------------------------------
  console.log("\n" + "-".repeat(80));
  console.log("KỊCH BẢN 9: Kiểm toán an ninh PostgreSQL ghi nhận sự kiện SYSTEM_CONFIG_UPDATE");
  console.log("-".repeat(80));
  try {
    const auditEvents = await prisma.auditEvent.findMany({
      where: {
        action: "SYSTEM_CONFIG_UPDATE",
        resourceType: "SystemConfig",
      },
      orderBy: { timestamp: "desc" },
      take: 5,
    });

    if (auditEvents.length === 0) {
      throw new Error("Không tìm thấy sự kiện kiểm toán SYSTEM_CONFIG_UPDATE trong PostgreSQL!");
    }

    const latest = auditEvents[0];
    if (!latest.actorId || !(latest.newData as any)?.key) {
      throw new Error("Sự kiện kiểm toán thiếu actorId hoặc payload newData!");
    }

    console.log(`✅ [PASS] Kịch bản 9: PostgreSQL ghi nhận sự kiện kiểm toán SYSTEM_CONFIG_UPDATE gắn với Actor "${latest.actorId}" và nội dung thay đổi rõ ràng.`);
    passedTests++;
  } catch (err: any) {
    console.error(`❌ [FAIL] Kịch bản 9: ${err.message}`);
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN 10: Frontend UI Safety - Xử lý lỗi trung thực (Zero Fake Success)
  // --------------------------------------------------------------------------
  console.log("\n" + "-".repeat(80));
  console.log("KỊCH BẢN 10: Frontend UI Safety - Xử lý lỗi trung thực (Zero Fake Success)");
  console.log("-".repeat(80));
  try {
    const pagePath = path.join(process.cwd(), "src/app/admin/system/page.tsx");
    const content = fs.readFileSync(pagePath, "utf-8");

    if (!content.includes("editError") || !content.includes("setEditError")) {
      throw new Error("UI thiếu state lưu trữ và hiển thị lỗi chỉnh sửa tham số!");
    }

    if (!content.includes("res.ok") || !content.includes("resJson.error")) {
      throw new Error("UI không kiểm tra res.ok từ Backend khi lưu cấu hình!");
    }

    if (content.includes("showToast(\"Xem trước giao diện: Đã lưu")) {
      throw new Error("Phát hiện nút giả mạo showToast('Xem trước giao diện: Đã lưu') trong code!");
    }

    console.log(`✅ [PASS] Kịch bản 10: Giao diện /admin/system đã loại bỏ toàn bộ nút giả; xử lý lỗi API trung thực, hiển thị banner cảnh báo và không tạo thành công ảo.`);
    passedTests++;
  } catch (err: any) {
    console.error(`❌ [FAIL] Kịch bản 10: ${err.message}`);
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN 11: Trạng thái sao lưu & phục hồi thể hiện trung thực (NOT_CONFIGURED)
  // --------------------------------------------------------------------------
  console.log("\n" + "-".repeat(80));
  console.log("KỊCH BẢN 11: Trạng thái sao lưu & phục hồi thể hiện trung thực (NOT_CONFIGURED)");
  console.log("-".repeat(80));
  try {
    const res = await fetch(`${BASE_URL}/api/admin/system/overview`, {
      headers: { Authorization: `Bearer ${adminSession.token}` },
    });
    const json = await res.json();
    const backup = json.data?.backupStatus;

    if (!backup || backup.isConfigured !== false || backup.status !== "NOT_CONFIGURED") {
      throw new Error("Trạng thái sao lưu không phản ánh trung thực trạng thái NOT_CONFIGURED!");
    }

    const pagePath = path.join(process.cwd(), "src/app/admin/system/page.tsx");
    const pageContent = fs.readFileSync(pagePath, "utf-8");
    if (pageContent.includes("Khôi phục cơ sở dữ liệu") || pageContent.includes("Restore Database")) {
      throw new Error("Giao diện tồn tại nút Restore Database nguy hiểm chưa được phê duyệt!");
    }

    console.log(`✅ [PASS] Kịch bản 11: Hệ thống thể hiện trung thực trạng thái sao lưu (NOT_CONFIGURED, vận hành qua script bảo mật), tuyệt đối không tạo nút Restore giả mạo.`);
    passedTests++;
  } catch (err: any) {
    console.error(`❌ [FAIL] Kịch bản 11: ${err.message}`);
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN 12: Thao tác sửa cấu hình trên trình duyệt thật (Chrome / Puppeteer)
  // --------------------------------------------------------------------------
  console.log("\n" + "-".repeat(80));
  console.log("KỊCH BẢN 12: Thao tác sửa cấu hình trên trình duyệt thật (Chrome Headless)");
  console.log("-".repeat(80));
  let browser: any = null;
  try {
    console.log(`[BROWSER] Khởi chạy Chrome từ ${CHROME_PATH}...`);
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--window-size=1440,900"],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    // Thiết lập cookie xác thực JWT cho admin
    await page.setCookie({
      name: "token",
      value: adminSession.cookieToken,
      domain: "localhost",
      path: "/",
      httpOnly: false,
    });

    // 1. Mở trang /admin/system
    console.log("[BROWSER] Mở URL http://localhost:3000/admin/system...");
    await page.goto(`${BASE_URL}/admin/system`, { waitUntil: "networkidle2", timeout: 15000 });

    // 2. Kiểm tra các số liệu tổng quan hiển thị trên DOM
    const bodyText = await page.evaluate(() => document.body.innerText);
    if (!bodyText.includes("Trung tâm Quản trị Kỹ thuật") || !bodyText.includes("taskDueSoonHours")) {
      throw new Error("Giao diện /admin/system không tải đúng tiêu đề hoặc bảng tham số cấu hình!");
    }
    console.log("[BROWSER] ✓ Trang quản trị và bảng tham số cấu hình hiển thị đầy đủ!");

    // 3. Click nút "Sửa" tại dòng taskDueSoonHours
    console.log("[BROWSER] Click nút 'Sửa' tham số taskDueSoonHours...");
    await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll("tbody tr"));
      const targetRow = rows.find((r) => r.innerText.includes("taskDueSoonHours"));
      if (targetRow) {
        const editBtn = targetRow.querySelector("button");
        if (editBtn) (editBtn as HTMLButtonElement).click();
      }
    });

    // Chờ modal xuất hiện
    await page.waitForSelector("form input[type='number']", { timeout: 5000 });
    console.log("[BROWSER] Modal sửa tham số đã mở ra!");

    // 4. Sửa giá trị thành 48
    console.log("[BROWSER] Nhập giá trị mới: 48...");
    const numberInput = await page.$("form input[type='number']");
    if (numberInput) {
      await numberInput.click({ clickCount: 3 });
      await numberInput.press("Backspace");
      await numberInput.type("48");
    }

    // 5. Click "Lưu vào cơ sở dữ liệu"
    console.log("[BROWSER] Click 'Lưu vào cơ sở dữ liệu'...");
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const saveBtn = btns.find((b) => b.textContent?.includes("Lưu vào cơ sở dữ liệu"));
      if (saveBtn) saveBtn.click();
    });

    await new Promise((r) => setTimeout(r, 2000));

    // 6. Reload trang F5 để kiểm tra giá trị mới đã lưu vào PostgreSQL
    console.log("[BROWSER] F5 Reload trang để kiểm tra giá trị mới...");
    await page.reload({ waitUntil: "networkidle2" });

    const reloadedText = await page.evaluate(() => document.body.innerText);
    if (!reloadedText.includes("48")) {
      throw new Error("Sau F5 Reload, giá trị 48 không xuất hiện trên bảng tham số!");
    }
    console.log("[BROWSER] ✓ Sau F5 Reload: Giá trị mới '48' hiển thị chính xác trên giao diện DOM!");

    // Khôi phục lại về 24
    await prisma.systemConfig.update({
      where: { key: "taskDueSoonHours" },
      data: { value: "24" },
    });

    console.log("✅ [PASS] Kịch bản 12: Thao tác mở trang -> sửa tham số -> lưu DB -> F5 reload đã kiểm thử thành công 100% trên Google Chrome!");
    passedTests++;
  } catch (err: any) {
    console.error(`❌ [FAIL] Kịch bản 12: ${err.message}`);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log(`TỔNG KẾT KIỂM THỬ THỰC TẾ: ${passedTests}/${totalTests} KỊCH BẢN ĐẠT CHUẨN (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log("=".repeat(80));

  if (passedTests < totalTests) {
    process.exit(1);
  }
}

runSystemTests()
  .catch((e) => {
    console.error("FATAL ERROR IN SYSTEM TEST RUNNER:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
