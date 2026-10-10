/**
 * TALUNG-CUS-WORK — P1 FIX 06B BỔ SUNG:
 * 1. BẢO TOÀN NỘI DUNG KẾ HOẠCH LỊCH SỬ KHI SỬA ĐỔI ACTIVITYTEMPLATE GỐC
 * 2. KIỂM THỬ THỰC TẾ TRÌNH DUYỆT (BROWSER AUTOMATION VỚI CHROME / PUPPETEER)
 */

import puppeteer from "puppeteer-core";
import { prisma } from "../src/server/db";

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

async function runAdvancedCatalogTests() {
  console.log("=".repeat(80));
  console.log("P1 FIX 06B BỔ SUNG: BẢO TOÀN LỊCH SỬ KẾ HOẠCH & KIỂM THỬ TRÌNH DUYỆT THẬT");
  console.log("=".repeat(80));

  let passedTests = 0;
  const totalTests = 2;

  const leaderSession = await loginAs("lanhdao");
  const adminSession = await loginAs("admin");
  const officerSession = await loginAs("canbo_a");
  console.log("✓ Đã đăng nhập: lanhdao, admin, canbo_a\n");

  // ==========================================================================
  // PHẦN 1: BẢO TOÀN NỘI DUNG KẾ HOẠCH LỊCH SỬ KHI SỬA ACTIVITYTEMPLATE
  // ==========================================================================
  console.log("-".repeat(80));
  console.log("PHẦN 1: KIỂM THỬ TÍNH BẤT BIẾN KẾ HOẠCH LỊCH SỬ KHI SỬA TÊN/NỘI DUNG MẪU GỐC");
  console.log("-".repeat(80));

  let testPlanId = "";
  let testWorkItemId = "";
  let targetTemplate: any = null;
  let originalTemplateTitle = "";

  try {
    // 1. Lấy 1 ActivityTemplate mẫu có sẵn
    targetTemplate = await prisma.activityTemplate.findFirst({
      where: { code: "TTHQ-01" },
    });
    if (!targetTemplate) throw new Error("Không tìm thấy mẫu TTHQ-01");
    originalTemplateTitle = targetTemplate.title;

    // 2. Lấy hoặc tạo kỳ kế hoạch tuần
    let period = await prisma.reportingPeriod.findFirst({
      where: { type: "WEEK", title: { contains: "Tuần 41/2026" } },
    });
    if (!period) {
      period = await prisma.reportingPeriod.create({
        data: {
          type: "WEEK",
          title: "Tuần 41/2026 (Kiểm thử lịch sử)",
          startAt: new Date(2026, 9, 5),
          endAt: new Date(2026, 9, 11),
        },
      });
    }

    // 3. Cán bộ tạo một Kế hoạch và thêm PlanItem
    const officerPerson = await prisma.person.findFirst({ where: { code: "CB-001" } });
    const officerAssignment = await prisma.personAssignment.findFirst({
      where: { personId: officerPerson!.id, isPrimary: true },
    });
    const unitId = officerAssignment!.unitId;

    const newPlan = await prisma.plan.create({
      data: {
        periodId: period.id,
        unitId,
        creatorId: officerPerson!.id,
        title: "Kế hoạch công tác tuần 41 — Kiểm thử bất biến dữ liệu",
        status: "DRAFT",
        items: {
          create: [
            {
              title: "Nhiệm vụ thủ tục hải quan tại luồng",
              groupId: targetTemplate.groupId,
              sortOrder: 1,
            },
          ],
        },
      },
      include: { items: true },
    });
    testPlanId = newPlan.id;
    const planItemId = newPlan.items[0].id;

    // 4. Cán bộ tạo đầu việc cá nhân chọn từ mẫu TTHQ-01
    const createWorkItemRes = await fetch(`${BASE_URL}/api/personal-work-items`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${officerSession.token}`,
      },
      body: JSON.stringify({
        periodId: period.id,
        planItemId,
        templateId: targetTemplate.id,
        // Tiêu đề tự động lấy snapshot từ template gốc lúc tạo
      }),
    });
    if (!createWorkItemRes.ok) {
      throw new Error(`Tạo personal work item thất bại: ${createWorkItemRes.status}`);
    }
    const wiData = await createWorkItemRes.json();
    testWorkItemId = wiData.data.id;

    // Xác nhận tiêu đề lưu ban đầu khớp với mẫu gốc
    if (wiData.data.title !== originalTemplateTitle) {
      throw new Error(`Tiêu đề work item ban đầu không khớp mẫu gốc: "${wiData.data.title}" != "${originalTemplateTitle}"`);
    }

    // 5. Trình duyệt và Lãnh đạo phê duyệt kế hoạch
    await prisma.plan.update({
      where: { id: testPlanId },
      data: {
        status: "APPROVED",
        approvedBy: leaderSession.user.personId || leaderSession.user.id,
        approvedAt: new Date(),
      },
    });

    // 6. Quản trị viên sửa tên và mô tả của mẫu TTHQ-01 thành tên mới
    const modifiedTemplateTitle = `[TÊN ĐÃ ĐƯỢC ADMIN SỬA ĐỔI HOÀN TOÀN — ${Date.now()}]`;
    const updateTplRes = await fetch(`${BASE_URL}/api/catalog/templates/${targetTemplate.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminSession.token}`,
      },
      body: JSON.stringify({
        title: modifiedTemplateTitle,
        description: "Mô tả mới đã bị thay đổi trong danh mục hiện hành",
      }),
    });
    if (!updateTplRes.ok) {
      throw new Error(`Sửa ActivityTemplate thất bại: ${updateTplRes.status}`);
    }

    // 7. Tải lại kế hoạch tuần 41 qua API GET /api/plans
    const reloadPlanRes = await fetch(`${BASE_URL}/api/plans?periodId=${period.id}&unitId=${unitId}`, {
      headers: { Authorization: `Bearer ${leaderSession.token}` },
    });
    if (!reloadPlanRes.ok) throw new Error("GET /api/plans thất bại");
    const reloadPlanData = await reloadPlanRes.json();
    const loadedPlan = reloadPlanData.data.find((p: any) => p.id === testPlanId);
    if (!loadedPlan) throw new Error("Không tìm thấy kế hoạch vừa tải lại");

    const loadedWorkItem = loadedPlan.items[0]?.workItems?.find((w: any) => w.id === testWorkItemId);
    if (!loadedWorkItem) throw new Error("Không tìm thấy đầu việc trong kế hoạch đã tải lại");

    // ĐỐI SOÁT NGHIỆP VỤ BẤT BIẾN:
    console.log(`- Tiêu đề gốc lúc lập kế hoạch: "${originalTemplateTitle}"`);
    console.log(`- Tiêu đề mẫu sau khi admin sửa: "${modifiedTemplateTitle}"`);
    console.log(`- Tiêu đề trong kế hoạch lịch sử: "${loadedWorkItem.title}"`);
    console.log(`- Liên kết mẫu gốc: code=[${loadedWorkItem.template?.code}], id=${loadedWorkItem.templateId}`);

    if (loadedWorkItem.title === modifiedTemplateTitle) {
      throw new Error("LỖI NGHIÊM TRỌNG: Kế hoạch lịch sử bị biến đổi tiêu đề theo mẫu hiện hành!");
    }

    if (loadedWorkItem.title !== originalTemplateTitle) {
      throw new Error(`Tiêu đề trong kế hoạch không bảo toàn nguyên văn ban đầu! Nhận được: "${loadedWorkItem.title}"`);
    }

    if (!loadedWorkItem.template || loadedWorkItem.template.code !== "TTHQ-01") {
      throw new Error("Mất liên kết tới mẫu gốc TTHQ-01!");
    }

    console.log("✅ [PASS] PHẦN 1: Bảo toàn tính bất biến kế hoạch lịch sử thành công 100%! Khi admin sửa tên mẫu, kế hoạch đã phê duyệt vẫn giữ đúng nguyên văn tiêu đề lúc lập.");
    passedTests++;
  } catch (err: any) {
    console.error(`❌ [FAIL] PHẦN 1: ${err.message}`);
  } finally {
    // Khôi phục lại tiêu đề gốc cho TTHQ-01
    if (targetTemplate && originalTemplateTitle) {
      await prisma.activityTemplate.update({
        where: { id: targetTemplate.id },
        data: { title: originalTemplateTitle },
      });
    }
    // Dọn dẹp dữ liệu thử nghiệm
    if (testWorkItemId) await prisma.personalWorkItem.delete({ where: { id: testWorkItemId } }).catch(() => {});
    if (testPlanId) await prisma.plan.delete({ where: { id: testPlanId } }).catch(() => {});
  }

  // ==========================================================================
  // PHẦN 2: KIỂM THỬ TRÌNH DUYỆT THẬT (PUPPETEER / CHROME BROWSER AUTOMATION)
  // ==========================================================================
  console.log("\n" + "-".repeat(80));
  console.log("PHẦN 2: KIỂM THỬ TRÌNH DUYỆT THẬT (CHROME HEADLESS / PUPPETEER CORE)");
  console.log("-".repeat(80));

  let browser: any = null;
  const browserSuffix = Math.floor(1000 + Math.random() * 9000);
  const browserTplCode = `UI-TEST-${browserSuffix}`;
  const browserTplTitle = `Quy trình kiểm tra phương tiện vận tải đường bộ tự động ${browserSuffix}`;
  const browserTplTitleEdited = `Quy trình kiểm tra phương tiện (ĐÃ SỬA TRÊN GIAO DIỆN ${browserSuffix})`;

  try {
    console.log(`[BROWSER] Khởi chạy Google Chrome từ: ${CHROME_PATH}`);
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--window-size=1440,900"],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    // Thiết lập cookie xác thực JWT cho phiên admin
    await page.setCookie({
      name: "token",
      value: adminSession.cookieToken,
      domain: "localhost",
      path: "/",
      httpOnly: false,
    });

    // 1. Mở trang /admin/catalog
    console.log("[BROWSER] Mở URL http://localhost:3000/admin/catalog ...");
    await page.goto(`${BASE_URL}/admin/catalog`, { waitUntil: "networkidle2", timeout: 15000 });

    const pageTitle = await page.title();
    console.log(`[BROWSER] Tiêu đề trang tải thành công: "${pageTitle}"`);

    // 2. Click nút "Thêm đầu việc mẫu"
    console.log("[BROWSER] Click nút 'Thêm đầu việc mẫu'...");
    const addBtnSelector = "button:has-text('Thêm đầu việc mẫu'), button";
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const btn = btns.find((b) => b.textContent?.includes("Thêm đầu việc mẫu"));
      if (btn) btn.click();
    });

    // Chờ modal xuất hiện
    await page.waitForSelector("form", { timeout: 5000 });
    console.log("[BROWSER] Modal thêm mới đã mở ra trong DOM!");

    // 3. Nhập dữ liệu vào form bằng Puppeteer page.type()
    console.log(`[BROWSER] Nhập mã '${browserTplCode}' và tiêu đề...`);
    await page.waitForSelector("input[placeholder*='TTHQ-23']", { timeout: 5000 });
    await page.type("input[placeholder*='TTHQ-23']", browserTplCode);
    await page.type("input[placeholder*='chuẩn hóa']", browserTplTitle);

    // 4. Nhấn nút submit "Thêm mới vào cơ sở dữ liệu"
    console.log("[BROWSER] Nhấn nút submit 'Thêm mới vào cơ sở dữ liệu'...");
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const submitBtn = btns.find((b) => b.textContent?.includes("Thêm mới vào cơ sở dữ liệu"));
      if (submitBtn) submitBtn.click();
    });

    // Chờ 2.5 giây để network request hoàn thành và bảng cập nhật
    await new Promise((r) => setTimeout(r, 2500));

    // 5. Kiểm tra mã mới xuất hiện trên bảng DOM
    const foundInDom = await page.evaluate((code) => {
      return document.body.innerText.includes(code);
    }, browserTplCode);

    if (!foundInDom) {
      throw new Error(`Không tìm thấy mã "${browserTplCode}" trên giao diện sau khi thêm!`);
    }
    console.log(`[BROWSER] ✓ Đã đối soát: Hoạt động mẫu '${browserTplCode}' hiển thị chính xác trên bảng DOM!`);

    // 6. Chỉnh sửa hoạt động mẫu qua giao diện
    console.log("[BROWSER] Nhấn nút chỉnh sửa mẫu vừa tạo...");
    await page.evaluate((code) => {
      const rows = Array.from(document.querySelectorAll("tr"));
      const targetRow = rows.find((r) => r.innerText.includes(code));
      if (targetRow) {
        const editBtn = targetRow.querySelector("button[title*='Chỉnh sửa'], button");
        if (editBtn) (editBtn as HTMLButtonElement).click();
      }
    }, browserTplCode);

    await page.waitForSelector("form", { timeout: 5000 });
    console.log("[BROWSER] Modal chỉnh sửa đã mở ra trong DOM!");

    const editableInputs = await page.$$("form input:not([disabled])");
    if (editableInputs.length > 0) {
      await editableInputs[0].click({ clickCount: 3 });
      await editableInputs[0].press("Backspace");
      await editableInputs[0].type(browserTplTitleEdited);
    }

    console.log("[BROWSER] Nhấn nút 'Lưu thay đổi'...");
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const saveBtn = btns.find((b) => b.textContent?.includes("Lưu thay đổi"));
      if (saveBtn) saveBtn.click();
    });

    await new Promise((r) => setTimeout(r, 2000));

    // 7. Tải lại trang (F5 Reload) để xác minh tính bền vững
    console.log("[BROWSER] F5 Reload trang để kiểm tra lưu trữ PostgreSQL...");
    await page.reload({ waitUntil: "networkidle2" });

    const foundEditedInDom = await page.evaluate((title) => {
      return document.body.innerText.includes(title);
    }, browserTplTitleEdited);

    if (!foundEditedInDom) {
      throw new Error(`Sau F5 Reload, không tìm thấy tiêu đề đã sửa "${browserTplTitleEdited}" trong DOM!`);
    }
    console.log(`[BROWSER] ✓ Sau F5 Reload: Tiêu đề sửa đổi "${browserTplTitleEdited}" vẫn hiển thị đầy đủ và trung thực!`);

    // 8. Thử nghiệm đổi trạng thái Ngừng áp dụng (RETIRED) qua Confirm Dialog
    console.log("[BROWSER] Nhấn nút 'Ngừng áp dụng' và xác nhận Confirm Dialog...");
    const retireClickResult = await page.evaluate((code) => {
      const rows = Array.from(document.querySelectorAll("tbody tr"));
      const targetRow = rows.find((r) => r.innerText.includes(code));
      if (!targetRow) return "ERROR_ROW_NOT_FOUND: rows count=" + rows.length;
      const buttons = Array.from(targetRow.querySelectorAll("button"));
      const retireBtn = buttons.find(
        (b) => b.title?.includes("Ngừng áp dụng") || b.getAttribute("title")?.includes("Ngừng áp dụng")
      );
      if (!retireBtn) return "ERROR_BTN_NOT_FOUND: buttons=" + buttons.map((b) => b.title || b.innerText).join("; ");
      retireBtn.click();
      return "CLICKED";
    }, browserTplCode);

    console.log(`[BROWSER] Kết quả click nút Ngừng áp dụng: ${retireClickResult}`);
    if (!retireClickResult.startsWith("CLICKED")) {
      throw new Error(`Không thể click nút Ngừng áp dụng: ${retireClickResult}`);
    }

    // Chờ Confirm Dialog xuất hiện
    await new Promise((r) => setTimeout(r, 800));

    const confirmClickResult = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const confirmBtn = btns.find((b) => b.textContent?.includes("Xác nhận thực hiện"));
      if (!confirmBtn) return "ERROR_CONFIRM_NOT_FOUND";
      confirmBtn.click();
      return "CONFIRMED";
    });

    console.log(`[BROWSER] Kết quả click Xác nhận thực hiện: ${confirmClickResult}`);
    if (confirmClickResult !== "CONFIRMED") {
      throw new Error(`Không thể click nút Xác nhận thực hiện trong Confirm Dialog: ${confirmClickResult}`);
    }

    // Chờ 2.5 giây để network request hoàn thành và bảng cập nhật
    await new Promise((r) => setTimeout(r, 2500));

    // Kiểm tra badge chuyển sang "Ngừng áp dụng"
    const isRetiredBadgeInDom = await page.evaluate((code) => {
      const rows = Array.from(document.querySelectorAll("tbody tr"));
      const targetRow = rows.find((r) => r.innerText.includes(code));
      return targetRow ? targetRow.innerText.includes("Ngừng áp dụng") : false;
    }, browserTplCode);

    if (!isRetiredBadgeInDom) {
      const rowText = await page.evaluate((code) => {
        const rows = Array.from(document.querySelectorAll("tbody tr"));
        const targetRow = rows.find((r) => r.innerText.includes(code));
        return targetRow ? targetRow.innerText : "NOT_FOUND";
      }, browserTplCode);
      throw new Error(`Badge trạng thái không chuyển thành 'Ngừng áp dụng' sau khi xác nhận! Nội dung row: ${rowText}`);
    }
    console.log(`[BROWSER] ✓ Trạng thái đã chuyển thành công sang 'Ngừng áp dụng' trên DOM và PostgreSQL!`);

    console.log("✅ [PASS] PHẦN 2: Toàn bộ quy trình mở trang -> thêm mẫu -> sửa mẫu -> F5 -> ngừng áp dụng đã được kiểm thử thực tế 100% trên Google Chrome!");
    passedTests++;
  } catch (err: any) {
    console.error(`❌ [FAIL] PHẦN 2: ${err.message}`);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    // Dọn dẹp mẫu thử nghiệm khỏi DB
    await prisma.activityTemplate.deleteMany({
      where: { code: browserTplCode },
    }).catch(() => {});
  }

  console.log("\n" + "=".repeat(80));
  console.log(`TỔNG KẾT BỔ SUNG 06B: ${passedTests}/${totalTests} BÀI ĐẠT CHUẨN (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log("=".repeat(80));

  if (passedTests < totalTests) {
    process.exit(1);
  }
}

runAdvancedCatalogTests()
  .catch((e) => {
    console.error("FATAL ERROR IN ADVANCED TEST RUNNER:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
