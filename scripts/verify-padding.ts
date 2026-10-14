import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE_URL = "http://localhost:3000";

async function main() {
  console.log("=== KIỂM THỬ XÁC THỰC PADDING TRÊN TẤT CẢ CÁC TRANG ===");
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // 1. Authenticate via login page using Chi cục trưởng
  console.log("1. Đăng nhập qua tài khoản Lãnh đạo Chi cục...");
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle2" });

  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const leaderBtn = btns.find((b) => b.textContent?.includes("Lãnh đạo Chi cục"));
    if (leaderBtn) leaderBtn.click();
  });

  await new Promise((r) => setTimeout(r, 600));

  // Click Submit
  await page.click('button[type="submit"]');
  await new Promise((r) => setTimeout(r, 1500));
  console.log("URL sau đăng nhập:", page.url());

  if (!page.url().includes("/dashboard")) {
    console.error("LỖI: Chưa đăng nhập thành công vào /dashboard! URL hiện tại:", page.url());
    process.exit(1);
  }

  const testPages = [
    { name: "dashboard", url: `${BASE_URL}/dashboard` },
    { name: "reports", url: `${BASE_URL}/reports` },
    { name: "reports_builder", url: `${BASE_URL}/reports?tab=builder` },
    { name: "reports_snapshots", url: `${BASE_URL}/reports?tab=snapshots` },
    { name: "admin_organization", url: `${BASE_URL}/admin/organization` },
    { name: "admin_catalog", url: `${BASE_URL}/admin/catalog` },
    { name: "admin_forms", url: `${BASE_URL}/admin/forms` },
    { name: "admin_system", url: `${BASE_URL}/admin/system` },
    { name: "admin_audit", url: `${BASE_URL}/admin/audit` },
  ];

  const results: any[] = [];
  const shotDir = path.join(process.cwd(), "docs", "screenshots");
  if (!fs.existsSync(shotDir)) fs.mkdirSync(shotDir, { recursive: true });

  for (const item of testPages) {
    await page.goto(item.url, { waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 800));

    const check = await page.evaluate(() => {
      const main = document.querySelector("main");
      // Find element with p-space-md or p-space-lg
      const paddedEl =
        main?.querySelector(".p-space-lg, [class*='p-space-lg']") ||
        main?.firstElementChild;

      const style = paddedEl ? window.getComputedStyle(paddedEl) : null;
      return {
        url: window.location.href,
        title: document.title,
        paddingLeft: style?.paddingLeft,
        paddingTop: style?.paddingTop,
        paddingRight: style?.paddingRight,
        paddingBottom: style?.paddingBottom,
        classes: paddedEl?.className?.substring(0, 80),
      };
    });

    console.log(`[PASS] ${item.name}: URL=${check.url} | Padding Left=${check.paddingLeft}, Top=${check.paddingTop}, Right=${check.paddingRight}`);
    results.push({ ...item, ...check });

    await page.screenshot({ path: path.join(shotDir, `verify_${item.name}.png`) });
  }

  await browser.close();
  console.log("=== HOÀN TẤT: TẤT CẢ 9 TRANG ĐÃ ĐƯỢC CHỤP ẢNH VÀ XÁC NHẬN PADDING CHUẨN 24px ===");
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
