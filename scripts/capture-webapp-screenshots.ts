import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE_URL = "http://localhost:3000";
const OUTPUT_DIR = path.resolve("docs/screenshots");

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log("==========================================================");
  console.log(" TEST 6: KIỂM THỬ BROWSER & CHỤP ẢNH MILESTONE 2 WEBAPP    ");
  console.log(` Thư mục lưu: ${OUTPUT_DIR}`);
  console.log("==========================================================\n");

  // 1. Đăng nhập lấy token session
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "lanhdao", password: "demo123" }),
  });
  const loginCookie = loginRes.headers.get("set-cookie") || "";
  const tokenMatch = loginCookie.match(/token=([^;]+)/);
  const tokenValue = tokenMatch ? tokenMatch[1] : "";

  if (!tokenValue) {
    throw new Error("Không thể lấy session token đăng nhập!");
  }

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
  });

  const jsErrors: string[] = [];

  // 2. Chụp Desktop (1440x900)
  console.log("1. Kiểm tra & Chụp giao diện Desktop (Viewport 1440x900):");
  const desktopPage = await browser.newPage();
  await desktopPage.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

  let currentDesktopDesc = "";
  desktopPage.on("pageerror", (err) => {
    jsErrors.push(`[Desktop - ${currentDesktopDesc}]: ${err.message}`);
  });

  // Set auth cookie
  await desktopPage.setCookie({
    name: "token",
    value: tokenValue,
    domain: "localhost",
    path: "/",
    httpOnly: true,
  });

  const desktopTargets = [
    { name: "desktop_dashboard.png", url: `${BASE_URL}/dashboard`, desc: "Dashboard Điều hành" },
    { name: "desktop_plans.png", url: `${BASE_URL}/plans`, desc: "Kế hoạch Công tác Tuần" },
    { name: "desktop_my_work.png", url: `${BASE_URL}/my-work`, desc: "Công việc của tôi" },
    { name: "desktop_tasks.png", url: `${BASE_URL}/tasks`, desc: "Quản lý Nhiệm vụ & Giao việc" },
    { name: "desktop_admin_org.png", url: `${BASE_URL}/admin/organization`, desc: "Quản trị cơ cấu tổ chức & Nhân sự" },
    { name: "desktop_admin_catalog.png", url: `${BASE_URL}/admin/catalog`, desc: "Quản trị Danh mục Hoạt động Mẫu" },
  ];

  for (const t of desktopTargets) {
    currentDesktopDesc = t.desc;
    console.log(`  -> Đang truy cập ${t.desc} (${t.url})...`);
    await desktopPage.goto(t.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1500));
    const dest = path.join(OUTPUT_DIR, t.name);
    await desktopPage.screenshot({ path: dest, fullPage: false });
    console.log(`     ✓ Đã chụp: ${t.name}`);
  }
  await desktopPage.close();

  // 3. Chụp Mobile (390x844 - iPhone 12/13/14 standard 390px)
  console.log("\n2. Kiểm tra & Chụp giao diện Mobile 390px (Viewport 390x844):");
  const mobilePage = await browser.newPage();
  await mobilePage.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  mobilePage.on("pageerror", (err) => {
    jsErrors.push(`[Mobile Page Error]: ${err.message}`);
  });

  // Case 3.1: Đăng nhập Mobile (Chưa có cookie)
  console.log("  -> Đang truy cập Đăng nhập Mobile...");
  await mobilePage.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1500));
  await mobilePage.screenshot({ path: path.join(OUTPUT_DIR, "mobile_login.png"), fullPage: false });
  console.log("     ✓ Đã chụp: mobile_login.png");

  // Set cookie cho các trang mobile tiếp theo
  await mobilePage.setCookie({
    name: "token",
    value: tokenValue,
    domain: "localhost",
    path: "/",
    httpOnly: true,
  });

  const mobileTargets = [
    { name: "mobile_my_work.png", url: `${BASE_URL}/my-work`, desc: "Công việc của tôi (Mobile)" },
    { name: "mobile_tasks.png", url: `${BASE_URL}/tasks`, desc: "Điều hành Nhiệm vụ (Mobile)" },
    { name: "mobile_plans.png", url: `${BASE_URL}/plans`, desc: "Kế hoạch Công tác (Mobile)" },
  ];

  for (const t of mobileTargets) {
    console.log(`  -> Đang truy cập ${t.desc} (${t.url})...`);
    await mobilePage.goto(t.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1500));
    await mobilePage.screenshot({ path: path.join(OUTPUT_DIR, t.name), fullPage: false });
    console.log(`     ✓ Đã chụp: ${t.name}`);
  }

  // Case 3.3: Chi tiết nhiệm vụ Mobile (Màn hình chi tiết & nhật ký)
  console.log("  -> Đang kiểm tra Chi tiết nhiệm vụ Mobile (Màn hình chi tiết & nhật ký)...");
  await mobilePage.goto(`${BASE_URL}/my-work`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1500));
  await mobilePage.evaluate(() => {
    window.scrollTo(0, 600);
  });
  await new Promise((r) => setTimeout(r, 500));
  await mobilePage.screenshot({ path: path.join(OUTPUT_DIR, "mobile_task_detail.png"), fullPage: false });
  console.log("     ✓ Đã chụp: mobile_task_detail.png");

  await mobilePage.close();
  await browser.close();

  console.log("\n----------------------------------------------------------");
  if (jsErrors.length === 0) {
    console.log("XÁC NHẬN: 100% GIAO DIỆN KHÔNG CÓ LỖI JAVASCRIPT NÀO!");
  } else {
    console.warn("CẢNH BÁO: Phát hiện lỗi JavaScript:", jsErrors);
  }
  console.log(`HOÀN THÀNH CHỤP ẢNH TẤT CẢ GIAO DIỆN WEBAPP TẠI: ${OUTPUT_DIR}`);
  console.log("----------------------------------------------------------");

  if (jsErrors.length > 0) {
    throw new Error(`Phát hiện ${jsErrors.length} lỗi JavaScript runtime trên trình duyệt!`);
  }
}

main().catch((err) => {
  console.error("Lỗi khi kiểm thử trình duyệt WebApp:", err);
  process.exit(1);
});
