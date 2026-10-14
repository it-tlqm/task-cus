import puppeteer from "puppeteer-core";

const BASE_URL = "http://localhost:3000";
const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

interface ResponsiveCheck {
  viewportWidth: number;
  viewportHeight: number;
  label: string;
  url: string;
  overflowDetected: boolean;
  scrollWidth: number;
  clientWidth: number;
  bottomNavVisible?: boolean;
  status: "PASS" | "FAIL";
  notes: string;
}

const VIEWPORTS = [
  { width: 2560, height: 1440, label: "2560px (Stitch Desktop Gốc)" },
  { width: 1440, height: 900, label: "1440px (Desktop Tiêu Chuẩn)" },
  { width: 1366, height: 768, label: "1366px (Laptop Phổ Thông)" },
  { width: 768, height: 1024, label: "768px (Tablet Portrait)" },
  { width: 430, height: 932, label: "430px (iPhone Pro Max)" },
  { width: 390, height: 844, label: "390px (Stitch Mobile Gốc)" },
  { width: 375, height: 667, label: "375px (iPhone SE/Standard)" },
  { width: 360, height: 800, label: "360px (Android Compact)" },
];

const PAGES_TO_CHECK = [
  { url: "/login", name: "Đăng Nhập" },
  { url: "/my-work", name: "Công Việc Của Tôi" },
  { url: "/plans", name: "Kế Hoạch Công Tác" },
  { url: "/dashboard", name: "Dashboard Điều Hành" },
  { url: "/tasks", name: "Nhiệm Vụ Chỉ Đạo" },
];

async function getSessionCookie(username: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: "demo123" }),
  });
  const setCookie = res.headers.get("set-cookie") || "";
  const match = setCookie.match(/token=([^;]+)/);
  return match ? match[1] : "";
}

async function runResponsiveVerification() {
  console.log("================================================================================");
  console.log("      BỘ KIỂM TRA RESPONSIVE ĐA THIẾT BỊ (2560px -> 360px) & HORIZONTAL OVERFLOW");
  console.log("================================================================================\n");

  const results: ResponsiveCheck[] = [];

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
  });

  const sessionToken = await getSessionCookie("lanhdao");

  for (const vp of VIEWPORTS) {
    console.log(`>> Đang kiểm tra Viewport: ${vp.label} (${vp.width}x${vp.height})...`);
    const page = await browser.newPage();
    await page.setViewport({
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: vp.width <= 430 ? 2 : 1,
      isMobile: vp.width <= 768,
      hasTouch: vp.width <= 768,
    });

    if (sessionToken) {
      await page.setCookie({
        name: "token",
        value: sessionToken,
        domain: "localhost",
        path: "/",
        httpOnly: true,
      });
    }

    for (const pg of PAGES_TO_CHECK) {
      try {
        await page.goto(`${BASE_URL}${pg.url}`, {
          waitUntil: "domcontentloaded",
          timeout: 10000,
        });
        await new Promise((r) => setTimeout(r, 600));

        // Đo scrollWidth và clientWidth của documentElement
        const metrics = await page.evaluate(() => {
          const doc = document.documentElement;
          const body = document.body;
          const scrollW = Math.max(doc.scrollWidth, body.scrollWidth);
          const clientW = doc.clientWidth;
          const hasBottomNav = document.querySelector("nav.fixed.bottom-0") !== null;
          return {
            scrollW,
            clientW,
            hasBottomNav,
          };
        });

        // Cho phép dung sai 2px do thanh cuộn dọc native của Chromium
        const isOverflow = metrics.scrollW > metrics.clientW + 2;

        results.push({
          viewportWidth: vp.width,
          viewportHeight: vp.height,
          label: vp.label,
          url: pg.url,
          overflowDetected: isOverflow,
          scrollWidth: metrics.scrollW,
          clientWidth: metrics.clientW,
          bottomNavVisible: metrics.hasBottomNav,
          status: !isOverflow ? "PASS" : "FAIL",
          notes: !isOverflow
            ? `Khớp hoàn toàn viewport ${vp.width}px (Không tràn ngang)`
            : `Phát hiện tràn ngang: scrollWidth ${metrics.scrollW}px > clientWidth ${metrics.clientW}px`,
        });
      } catch (err: any) {
        console.error(`   ! Lỗi tại ${pg.url} (${vp.label}):`, err.message);
      }
    }

    await page.close();
  }

  // KIỂM TRA ĐẶC BIỆT: DRAWER 520px TRÊN MOBILE 390px VÀ 360px
  console.log("\n>> Kiểm tra đặc biệt: Drawer trên Mobile 390px & 360px (Không được tràn màn hình)...");
  for (const mWidth of [390, 360]) {
    const page = await browser.newPage();
    await page.setViewport({ width: mWidth, height: 800, isMobile: true, hasTouch: true });
    await page.setCookie({
      name: "token",
      value: sessionToken,
      domain: "localhost",
      path: "/",
      httpOnly: true,
    });
    await page.goto(`${BASE_URL}/my-work`, { waitUntil: "domcontentloaded" });
    await new Promise((r) => setTimeout(r, 1000));

    // Mở Drawer bằng cách click nút tác nghiệp trên mobile
    await page.evaluate(() => {
      const btn = document.querySelector("button[type='button'], .bg-secondary") as HTMLElement;
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 600));

      const drawerMetrics = await page.evaluate(() => {
        const aside = document.querySelector("aside.sm\\:max-w-\\[520px\\], aside.relative");
        if (!aside) return null;
        const rect = aside.getBoundingClientRect();
        const docW = document.documentElement.clientWidth;
        return {
          asideWidth: Math.round(rect.width),
          docWidth: docW,
          fitsInViewport: rect.width <= docW + 1,
        };
      });

      if (drawerMetrics) {
        results.push({
          viewportWidth: mWidth,
          viewportHeight: 800,
          label: `Drawer Check (${mWidth}px)`,
          url: "/my-work (Drawer)",
          overflowDetected: !drawerMetrics.fitsInViewport,
          scrollWidth: drawerMetrics.asideWidth,
          clientWidth: drawerMetrics.docWidth,
          status: drawerMetrics.fitsInViewport ? "PASS" : "FAIL",
          notes: `Drawer width: ${drawerMetrics.asideWidth}px <= Viewport: ${drawerMetrics.docWidth}px`,
        });
        console.log(`   ✓ Drawer tại ${mWidth}px: Rộng ${drawerMetrics.asideWidth}px (Vừa vặn viewport: ${drawerMetrics.fitsInViewport})`);
      }
    await page.close();
  }

  await browser.close();

  console.log("\n================================================================================");
  console.log("             BẢNG TỔNG HỢP KIỂM ĐỊNH RESPONSIVE & TRÀN NGANG                    ");
  console.log("================================================================================");
  console.table(results);
  console.log("================================================================================\n");

  const failCount = results.filter((r) => r.status === "FAIL").length;
  console.log(`>> TỔNG KẾT: ${results.length - failCount}/${results.length} bài kiểm tra đạt chuẩn (FAIL: ${failCount})`);
}

runResponsiveVerification().catch(console.error);
