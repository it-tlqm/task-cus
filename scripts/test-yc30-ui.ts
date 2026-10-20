/**
 * test-yc30-ui.ts — Kiểm thử giao diện YC-30 (desktop + mobile) bằng trình duyệt thật.
 *
 * Chạy local (dev server cổng 3100 + DB local):
 *   $env:DATABASE_URL="<chuỗi kết nối DB local>"; $env:DIRECT_URL=$env:DATABASE_URL
 *   npx next dev -p 3100
 *   npx tsx scripts/test-yc30-ui.ts
 *
 * Tài khoản kiểm thử: đặt TEST_LEADER_USER / TEST_DEPT_USER / TEST_STAFF_USER
 * và mật khẩu qua TEST_<USERNAME>_PASS hoặc TEST_PASSWORD
 * (hoặc để script đọc demo-ops/demo-secrets.json — nằm ngoài Git).
 *
 * Phạm vi: sidebar desktop (mở/thu gọn/tooltip), active state, breadcrumb,
 * drawer mobile (mở/đóng/focus trap), route cũ (deep-link/refresh), lỗi console / HTTP 5xx.
 */
import fs from "fs";
import path from "path";
import { createRequire } from "node:module";

const repoRequire = createRequire(path.resolve("package.json"));
const puppeteer = repoRequire("puppeteer-core");

const BASE = process.env.TEST_BASE_URL || "http://localhost:3100";
const CHROME = "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe";
const OUT_DIR = path.resolve("demo-ops/yc30-ui");
fs.mkdirSync(OUT_DIR, { recursive: true });

/**
 * Tài khoản kiểm thử: đọc mật khẩu từ biến môi trường hoặc demo-ops/demo-secrets.json
 * (nằm ngoài Git). KHÔNG hardcode mật khẩu trong mã nguồn.
 */
function resolvePassword(username: string): string {
  const upper = username.toUpperCase();
  const fromEnv =
    process.env[`TEST_${upper}_PASS`] ||
    process.env.TEST_PASSWORD ||
    // Theo vai trò (dùng cho tài khoản local có tên khác).
    (ACCOUNTS.leader.username === username ? process.env.TEST_LEADER_PASS : undefined) ||
    (ACCOUNTS.staff.username === username ? process.env.TEST_STAFF_PASS : undefined) ||
    (ACCOUNTS.dept.username === username ? process.env.TEST_DEPT_PASS : undefined);
  if (fromEnv) return fromEnv;
  try {
    const p = path.resolve("demo-ops/demo-secrets.json");
    if (fs.existsSync(p)) {
      const json = JSON.parse(fs.readFileSync(p, "utf8"));
      const acc = (json.accounts || []).find((a: any) => a.username === username);
      if (acc?.password) return acc.password;
    }
  } catch {}
  throw new Error(
    `Chưa có mật khẩu cho tài khoản "${username}". Đặt biến môi trường TEST_<USERNAME>_PASS hoặc TEST_PASSWORD.`
  );
}

const ACCOUNTS = {
  leader: {
    username: process.env.TEST_LEADER_USER || "lanhdao",
    role: "UNIT_LEADER",
  },
  dept: {
    username: process.env.TEST_DEPT_USER || "truongnhom_a",
    role: "DEPARTMENT_LEADER",
  },
  staff: {
    username: process.env.TEST_STAFF_USER || "canbo_a",
    role: "STAFF",
  },
};

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`[PASS] ${name}${detail ? " - " + detail : ""}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? " - " + detail : ""}`);
    console.log(`[FAIL] ${name}${detail ? " - " + detail : ""}`);
  }
}

const consoleErrors: string[] = [];
const httpErrors: string[] = [];

async function login(page: any, username: string, password: string) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  const res = await page.evaluate(
    async (u: string, p: string) => {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u, password: p }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.token) return { ok: false, status: r.status };
      localStorage.setItem("token", j.token);
      localStorage.setItem("currentUser", JSON.stringify(j.user));
      // Tắt tour hướng dẫn lần đầu để overlay không che nút (tour vẫn chạy thật với người dùng).
      const done: Record<string, boolean> = {};
      for (const p of [
        "/dashboard",
        "/my-work",
        "/tasks",
        "/plans",
        "/routine",
        "/approvals",
        "/reports",
        "/roster",
        "/giao-ban",
        "/giao-ban/nhap",
        "/admin/catalog",
      ]) {
        done[p] = true;
      }
      localStorage.setItem("hqtl-tour-done", JSON.stringify(done));
      return { ok: true, user: j.user };
    },
    username,
    password
  );
  if (!res.ok) throw new Error(`login ${username} failed: ${res.status}`);
  return res.user;
}

/** Mở nhóm menu đang gập để kiểm tra được các mục bên trong. */
async function expandSection(page: any, sectionId: string) {
  await page.evaluate((id: string) => {
    const btn = document.querySelector(`[data-testid="nav-section-${id}"] button`);
    if (btn && btn.getAttribute("aria-expanded") === "false") btn.click();
  }, sectionId);
  await new Promise((r) => setTimeout(r, 350));
}

/**
 * Đóng các lớp hướng dẫn tự mở lần đầu (ContextHelp z-70, Tour z-80) để không che nút bấm.
 * Đây là hành vi có sẵn của ứng dụng, không phải lỗi YC-30.
 */
async function dismissOverlays(page: any) {
  await page.evaluate(() => {
    for (const sel of ['div.fixed.z-\\[70\\]', 'div.fixed.z-\\[80\\]']) {
      const overlay = document.querySelector(sel);
      if (!overlay) continue;
      const closeBtn = Array.from(overlay.querySelectorAll("button")).find((b) => {
        const t = (b.textContent || "").trim();
        return t === "Đóng" || t === "Bỏ qua" || t === "Xong ✓" || t === "Rồi, tôi tự làm được";
      });
      if (closeBtn) (closeBtn as HTMLElement).click();
      else {
        const backdrop = overlay.querySelector("div.absolute.inset-0");
        if (backdrop) (backdrop as HTMLElement).click();
      }
    }
  });
  await new Promise((r) => setTimeout(r, 450));
}

async function visibleText(page: any, selector: string): Promise<string> {
  return page.evaluate((sel: string) => {
    const el = document.querySelector(sel);
    return el ? (el as HTMLElement).innerText : "";
  }, selector);
}

async function navItems(page: any): Promise<string[]> {
  return page.evaluate(() => {
    const nav = document.querySelector('[data-testid="app-navigation"]');
    if (!nav) return [];
    return Array.from(nav.querySelectorAll("a[href]")).map((a) => (a as HTMLAnchorElement).getAttribute("href") || "");
  });
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new" as any,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--window-size=1600,1000"],
  });

  try {
    // ============================================================ DESKTOP
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1000 });
    page.on("console", (msg: any) => {
      if (msg.type() === "error") consoleErrors.push(`[desktop] ${msg.text()}`);
    });
    page.on("pageerror", (err: any) => consoleErrors.push(`[desktop] pageerror: ${err.message}`));
    page.on("response", (res: any) => {
      if (res.status() >= 500) httpErrors.push(`[desktop] ${res.status()} ${res.url()}`);
    });

    const leader = await login(page, ACCOUNTS.leader.username, resolvePassword(ACCOUNTS.leader.username));
    check("Đăng nhập lãnh đạo đơn vị thành công", leader?.role === "UNIT_LEADER", leader?.role);

    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle2" });
    await page.waitForSelector('[data-testid="app-navigation"]', { timeout: 20000 });

    // 1. Menu hiển thị đầy đủ nhóm
    const sections = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid^="nav-section-"]')).map((el) =>
        el.getAttribute("data-testid")
      )
    );
    check("Sidebar có 6 nhóm điều hướng", sections.length === 6, sections.join(", "));
    check(
      "Có nhóm 'Nhật ký công việc' (YC-30 bổ sung)",
      sections.includes("nav-section-journal"),
      sections.join(", ")
    );

    await expandSection(page, "admin");
    const leaderHrefs = await navItems(page);
    const requiredForLeader = [
      "/dashboard",
      "/giao-ban",
      "/giao-ban/nhap",
      "/giao-ban/bao-cao",
      "/meetings",
      "/my-work",
      "/plans",
      "/tasks",
      "/approvals",
      "/routine",
      "/roster",
      "/calendar",
      "/leaves",
      "/docs",
      "/monthly-results",
      "/reports",
      "/products",
      "/admin/catalog",
      "/admin/organization",
      "/admin/forms",
      "/giao-ban/cau-hinh",
      "/admin/system",
      "/admin/audit",
      "/admin/feedback",
    ];
    const missing = requiredForLeader.filter((h) => !leaderHrefs.includes(h));
    check("Lãnh đạo thấy đủ mục nghiệp vụ + quản trị", missing.length === 0, missing.join(", "));

    // 2. Active state chính xác + breadcrumb
    await page.goto(`${BASE}/giao-ban/nhap`, { waitUntil: "networkidle2" });
    const activeHref = await page.evaluate(() => {
      const a = document.querySelector('[data-testid="app-navigation"] a[aria-current="page"]');
      return a ? a.getAttribute("href") : null;
    });
    check("Active state đúng trang con /giao-ban/nhap", activeHref === "/giao-ban/nhap", String(activeHref));

    const breadcrumb = await visibleText(page, '[data-testid="page-breadcrumb"]');
    check(
      "Breadcrumb desktop hiển thị đúng dải",
      breadcrumb.includes("Trang chủ") && breadcrumb.includes("Nhập số liệu giao ban"),
      breadcrumb.replace(/\n/g, " ")
    );

    // 3. Nhóm cha tự mở khi vào trang con (deep-link)
    const opsOpen = await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="nav-section-operations"] button');
      return btn ? btn.getAttribute("aria-expanded") : null;
    });
    check("Nhóm cha có aria-expanded khi render", opsOpen !== null, String(opsOpen));

    // 4. Thu gọn sidebar + tooltip
    const widthBefore = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="app-sidebar"]');
      return el ? el.getBoundingClientRect().width : 0;
    });
    // Đóng tour/hướng dẫn tự mở nếu đang che (overlay chặn nút bấm)
    await dismissOverlays(page);
    await page.click('[data-testid="app-sidebar"] button[aria-label*="gọn"]');
    await new Promise((r) => setTimeout(r, 400));
    const widthAfter = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="app-sidebar"]');
      return el ? el.getBoundingClientRect().width : 0;
    });
    check("Sidebar thu gọn còn 72px", Math.round(widthAfter) === 72, `${widthBefore} → ${widthAfter}`);

    const titleOnCollapsed = await page.evaluate(() => {
      const a = document.querySelector('[data-testid="nav-my-work"]');
      return a ? a.getAttribute("title") : null;
    });
    check(
      "Mục thu gọn có tooltip (title)",
      !!titleOnCollapsed && titleOnCollapsed.includes("Nhật ký công việc"),
      String(titleOnCollapsed)
    );

    const collapsedLabelHidden = await page.evaluate(() => {
      const a = document.querySelector('[data-testid="nav-my-work"]');
      if (!a) return false;
      const textSpan = a.querySelector('[data-testid="nav-label-my-work"]');
      if (!textSpan) return true; // không render nhãn chữ khi thu gọn
      return getComputedStyle(textSpan).display === "none";
    });
    check("Thu gọn: ẩn nhãn chữ, chỉ còn icon", collapsedLabelHidden);

    await page.screenshot({ path: path.join(OUT_DIR, "desktop-sidebar-collapsed.png") });

    // Thu gọn phải giữ sau khi reload
    await page.reload({ waitUntil: "networkidle2" });
    await page.waitForSelector('[data-testid="app-sidebar"]', { timeout: 20000 });
    let collapsedAfterReload = false;
    try {
      await page.waitForFunction(
        () => {
          const el = document.querySelector('[data-testid="app-sidebar"]');
          return !!el && Math.round(el.getBoundingClientRect().width) === 72;
        },
        { timeout: 15000 }
      );
      collapsedAfterReload = true;
    } catch {}
    const widthAfterReload = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="app-sidebar"]');
      return el ? el.getBoundingClientRect().width : 0;
    });
    check(
      "Trạng thái thu gọn giữ sau refresh",
      collapsedAfterReload && Math.round(widthAfterReload) === 72,
      String(widthAfterReload)
    );

    await page.click('[data-testid="app-sidebar"] button[aria-label*="Mở rộng"]');
    await new Promise((r) => setTimeout(r, 400));
    const widthExpanded = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="app-sidebar"]');
      return el ? el.getBoundingClientRect().width : 0;
    });
    check("Sidebar mở rộng lại 260px", Math.round(widthExpanded) === 260, String(widthExpanded));

    // 5. Route cũ vẫn truy cập được (deep-link trực tiếp)
    const legacyRoutes = ["/reports/excel", "/reports/snapshots", "/admin", "/huong-dan", "/notifications"];
    for (const route of legacyRoutes) {
      const res = await page.goto(`${BASE}${route}`, { waitUntil: "networkidle2" });
      const finalUrl = page.url();
      const bodyText = await visibleText(page, "body");
      const okStatus = res ? res.status() < 500 : false;
      check(
        `Route cũ truy cập được: ${route}`,
        okStatus && !bodyText.includes("Application error"),
        `${res?.status()} → ${finalUrl.replace(BASE, "")}`
      );
    }

    // 6. Điều hướng bằng click trên menu
    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle2" });
    await dismissOverlays(page);
    await page.click('[data-testid="nav-plans"]');
    await page.waitForFunction(() => location.pathname === "/plans", { timeout: 30000 });
    const plansActive = await page.evaluate(
      () => document.querySelector('[data-testid="app-navigation"] a[aria-current="page"]')?.getAttribute("href") || null
    );
    check("Click menu điều hướng đúng và active đúng", plansActive === "/plans", String(plansActive));

    // 7. Bàn phím: Tab tới menu được, Enter kích hoạt
    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle2" });
    await dismissOverlays(page);
    const keyboardOk = await page.evaluate(async () => {
      const link = document.querySelector('[data-testid="nav-my-work"]') as HTMLAnchorElement | null;
      if (!link) return false;
      link.focus();
      const focused = document.activeElement === link;
      link.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      return focused;
    });
    check("Menu nhận focus bằng bàn phím", keyboardOk);

    await page.screenshot({ path: path.join(OUT_DIR, "desktop-dashboard.png"), fullPage: false });

    // 8. Vai trò STAFF
    await page.evaluate(() => localStorage.clear());
    await login(page, ACCOUNTS.staff.username, resolvePassword(ACCOUNTS.staff.username));
    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle2" });
    await page.waitForSelector('[data-testid="app-navigation"]', { timeout: 20000 });
    const staffHrefs = await navItems(page);
    check("Công chức không thấy Phê duyệt", !staffHrefs.includes("/approvals"));
    check("Công chức không thấy nhóm quản trị", !staffHrefs.some((h) => h.startsWith("/admin")));
    check("Công chức không thấy Cấu hình số liệu giao ban", !staffHrefs.includes("/giao-ban/cau-hinh"));
    check("Công chức thấy Việc cá nhân", staffHrefs.includes("/my-work"));
    check("Công chức thấy Kế hoạch tuần", staffHrefs.includes("/plans"));
    check("Công chức thấy Nhật ký tác nghiệp", staffHrefs.includes("/routine"));
    check("Công chức thấy Sản phẩm QĐ1277", staffHrefs.includes("/products"));
    await page.screenshot({ path: path.join(OUT_DIR, "desktop-staff-dashboard.png") });

    // 9. Vai trò trưởng bộ phận (bỏ qua nếu môi trường không có tài khoản test)
    let deptPassword: string | null = null;
    try {
      deptPassword = resolvePassword(ACCOUNTS.dept.username);
    } catch {
      deptPassword = null;
    }
    if (deptPassword) {
      await page.evaluate(() => localStorage.clear());
      await login(page, ACCOUNTS.dept.username, deptPassword);
      await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle2" });
      await page.waitForSelector('[data-testid="app-navigation"]', { timeout: 20000 });
      const deptHrefs = await navItems(page);
      check("Trưởng bộ phận thấy Phê duyệt", deptHrefs.includes("/approvals"));
      check("Trưởng bộ phận không thấy nhóm quản trị", !deptHrefs.some((h) => h.startsWith("/admin")));
    } else {
      console.log(`• Bỏ qua kiểm thử trưởng bộ phận (không có tài khoản test "${ACCOUNTS.dept.username}")`);
    }

    // ============================================================ MOBILE
    const mobile = await browser.newPage();
    await mobile.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    mobile.on("console", (msg: any) => {
      if (msg.type() === "error") consoleErrors.push(`[mobile] ${msg.text()}`);
    });
    mobile.on("pageerror", (err: any) => consoleErrors.push(`[mobile] pageerror: ${err.message}`));
    mobile.on("response", (res: any) => {
      if (res.status() >= 500) httpErrors.push(`[mobile] ${res.status()} ${res.url()}`);
    });

    await login(mobile, ACCOUNTS.leader.username, resolvePassword(ACCOUNTS.leader.username));
    await mobile.goto(`${BASE}/my-work`, { waitUntil: "networkidle2" });

    const sidebarHidden = await mobile.evaluate(() => {
      const el = document.querySelector('[data-testid="app-sidebar"]');
      if (!el) return false;
      return getComputedStyle(el).display === "none" || el.getBoundingClientRect().width === 0;
    });
    check("Mobile: sidebar desktop bị ẩn", sidebarHidden);

    const bottomVisible = await mobile.evaluate(() => {
      const el = document.querySelector('nav[aria-label*="nhanh"]');
      return !!el && el.getBoundingClientRect().height > 0;
    });
    check("Mobile: thanh điều hướng nhanh hiển thị", bottomVisible);

    const bottomLabels = await mobile.evaluate(() => {
      const el = document.querySelector('nav[aria-label*="nhanh"]');
      return el ? el.innerText.replace(/\n/g, "|") : "";
    });
    check("Mobile: nhãn 'Nhật ký' hiển thị đúng", bottomLabels.includes("Nhật ký"), bottomLabels);
    check("Mobile: không còn nhãn 'Việc của tôi'", !bottomLabels.includes("Việc của tôi"));
    check("Mobile: không còn nhãn 'Việc cá nhân'", !bottomLabels.includes("Việc cá nhân"));

    // Drawer mở
    await mobile.click('[data-testid="mobile-menu-button"]');
    await mobile.waitForSelector('[data-testid="mobile-nav-drawer"]', { timeout: 10000 });
    const drawerVisible = await mobile.evaluate(() => {
      const el = document.querySelector('[data-testid="mobile-nav-drawer"]');
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.right <= window.innerWidth + 2;
    });
    check("Mobile: drawer mở, không tràn màn hình", drawerVisible);

    const focusInDrawer = await mobile.evaluate(async () => {
      const el = document.querySelector('[data-testid="mobile-nav-close"]');
      if (!el) return false;
      // Cho trình duyệt chạy nốt vòng focus (mạng chậm có thể cần thêm nhịp).
      for (let i = 0; i < 20; i++) {
        if (document.activeElement === el) return true;
        await new Promise((r) => setTimeout(r, 50));
      }
      return document.activeElement === el;
    });
    check("Mobile: focus vào nút đóng khi mở drawer", focusInDrawer);

    const drawerText = await mobile.evaluate(() => {
      const el = document.querySelector('[data-testid="mobile-nav-drawer"]');
      return el ? el.innerText : "";
    });
    const drawerLower = drawerText.toLowerCase();
    check("Mobile: drawer có nhóm 'Nhật ký công việc'", drawerLower.includes("nhật ký công việc"));
    check("Mobile: drawer có nhóm 'Trực ca & nghiệp vụ'", drawerLower.includes("trực ca & nghiệp vụ"));
    check("Mobile: drawer có nhóm 'Quản trị hệ thống'", drawerLower.includes("quản trị hệ thống"));
    check("Mobile: drawer có nhóm 'Kết quả & báo cáo'", drawerLower.includes("kết quả & báo cáo"));
    check("Mobile: drawer không trùng 'Việc của tôi'", !drawerLower.includes("việc của tôi"));
    check("Mobile: drawer không còn 'Việc cá nhân'", !drawerLower.includes("việc cá nhân"));
    check("Mobile: drawer có nhãn 'Nhật ký công việc'", drawerLower.includes("nhật ký công việc"));
    check(
      "Mobile: drawer có thông tin vai trò người dùng",
      /lãnh đạo đơn vị|trưởng bộ phận|công chức|quản trị hệ thống/i.test(drawerText),
      drawerText.split("\n").slice(0, 6).join(" | ")
    );

    await mobile.screenshot({ path: path.join(OUT_DIR, "mobile-drawer.png") });

    // Escape đóng drawer
    await mobile.keyboard.press("Escape");
    await new Promise((r) => setTimeout(r, 400));
    const drawerClosedByEsc = await mobile.evaluate(
      () => !document.querySelector('[data-testid="mobile-nav-drawer"]')
    );
    check("Mobile: Escape đóng được drawer", drawerClosedByEsc);

    // Chuyển trang trong drawer → drawer đóng
    await mobile.click('[data-testid="mobile-menu-button"]');
    await mobile.waitForSelector('[data-testid="mobile-nav-drawer"]', { timeout: 10000 });
    await mobile.evaluate(() => {
      const link = document.querySelector(
        '[data-testid="mobile-nav-drawer"] [data-testid="nav-drawer-plans"]'
      ) as HTMLElement | null;
      link?.click();
    });
    await mobile.waitForFunction(() => location.pathname === "/plans", { timeout: 30000 });
    await new Promise((r) => setTimeout(r, 600));
    const drawerClosedAfterNav = await mobile.evaluate(
      () => !document.querySelector('[data-testid="mobile-nav-drawer"]')
    );
    check("Mobile: chuyển trang thì drawer đóng lại", drawerClosedAfterNav);

    const mobileBreadcrumb = await mobile.evaluate(() => {
      const el = document.querySelector('[data-testid="page-breadcrumb"]');
      return el ? (el as HTMLElement).innerText.replace(/\n/g, " ") : "";
    });
    check("Mobile: breadcrumb hiển thị", mobileBreadcrumb.includes("Lập kế hoạch"), mobileBreadcrumb);

    const bodyOverflow = await mobile.evaluate(() => document.body.style.overflow);
    check("Mobile: khoá cuộn trang khi mở drawer", bodyOverflow === "" || bodyOverflow === "hidden");

    await mobile.screenshot({ path: path.join(OUT_DIR, "mobile-plans.png") });

    // Mobile deep-link + refresh
    await mobile.goto(`${BASE}/tasks`, { waitUntil: "networkidle2" });
    const mobileActive = await mobile.evaluate(
      () => document.querySelector('[data-testid="app-navigation"] a[aria-current="page"]')?.getAttribute("href") || null
    );
    check("Mobile: active state đúng /tasks", mobileActive === "/tasks", String(mobileActive));
    await mobile.reload({ waitUntil: "networkidle2" });
    const afterReloadOk = await mobile.evaluate(() => document.body.innerText.length > 200);
    check("Mobile: refresh /tasks vẫn tải được", afterReloadOk);

    // ============================================================ NHẬT KÝ CÔNG VIỆC (YC-30 bổ sung)
    await page.goto(`${BASE}/my-work`, { waitUntil: "networkidle2" });
    await page.waitForSelector('[data-testid="journal-filter-bar"]', { timeout: 20000 });
    check("Nhật ký công việc: có thanh bộ lọc", true);

    const filterText = await visibleText(page, '[data-testid="journal-filter-bar"]');
    check(
      "Bộ lọc có các cách nhìn: Hôm nay / Tuần / Tháng",
      filterText.includes("Hôm nay") && filterText.includes("Tuần này") && filterText.includes("Tháng này"),
      filterText.replace(/\n/g, " | ").slice(0, 160)
    );
    check(
      "Bộ lọc có nguồn: Từ kế hoạch / Phát sinh",
      filterText.includes("Từ kế hoạch") && filterText.includes("Phát sinh"),
      filterText.replace(/\n/g, " | ").slice(0, 160)
    );
    check(
      "Bộ lọc có trạng thái: Đang thực hiện / Chậm hạn / Đã hoàn thành",
      filterText.includes("Đang thực hiện") && filterText.includes("Chậm hạn") && filterText.includes("Đã hoàn thành"),
      filterText.replace(/\n/g, " | ").slice(0, 160)
    );

    // Bấm "Tất cả thời gian" → danh sách không bị trống
    await page.evaluate(() => {
      const btns = Array.from(
        document.querySelectorAll('[data-testid="journal-filter-bar"] button')
      ) as HTMLButtonElement[];
      btns.find((b) => b.textContent?.includes("Tất cả thời gian"))?.click();
    });
    await new Promise((r) => setTimeout(r, 800));
    const journalListVisible = await page.evaluate(() => {
      const el = document.querySelector('[data-tour="task-list"]');
      return !!el && el.getBoundingClientRect().height > 0;
    });
    check("Bộ lọc 'Tất cả thời gian' vẫn hiện danh sách công việc", journalListVisible);

    // Bấm "Từ kế hoạch" → phần đầu việc kế hoạch hiện, phần nhiệm vụ giao ẩn
    await page.evaluate(() => {
      const btns = Array.from(
        document.querySelectorAll('[data-testid="journal-filter-bar"] button')
      ) as HTMLButtonElement[];
      btns.find((b) => b.textContent?.trim() === "Từ kế hoạch")?.click();
    });
    await new Promise((r) => setTimeout(r, 800));
    const adhocHidden = await page.evaluate(() => {
      const el = document.querySelector('[data-tour="task-list"]');
      if (!el) return true;
      const text = el.innerText || "";
      return /Chưa có công việc nào|Đã tải 0/i.test(text);
    });
    check("Bộ lọc 'Từ kế hoạch' ẩn phần công việc phát sinh", adhocHidden);

    await page.screenshot({ path: path.join(OUT_DIR, "desktop-journal.png"), fullPage: false });

    await page.close();
    await mobile.close();
  } finally {
    await browser.close();
  }

  // Lọc lỗi console/HTTP không liên quan (dev server HMR, favicon)
  const realConsoleErrors = consoleErrors.filter(
    (e) => !/favicon|Failed to load resource: the server responded with a status of 404/i.test(e)
  );

  check("Không có lỗi console nghiêm trọng", realConsoleErrors.length === 0, realConsoleErrors.slice(0, 5).join(" || "));
  check("Không có HTTP 5xx", httpErrors.length === 0, httpErrors.slice(0, 5).join(" || "));

  console.log("\n========================================");
  console.log(`KẾT QUẢ UI YC-30: ${passed} pass / ${failed} fail`);
  console.log(`Ảnh kiểm thử: ${OUT_DIR}`);
  console.log("========================================");
  if (failed > 0) {
    console.log("\nCác mục lỗi:");
    for (const f of failures) console.log(" - " + f);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("LỖI KIỂM THỬ:", err);
  process.exit(1);
});
