/**
 * YC-23 + YC-25 — Kiểm thử GIAO DIỆN thật + chụp ảnh nghiệm thu (môi trường test cục bộ).
 *
 * Kịch bản (desktop 1440×900 + mobile 390×844):
 *  1. Cán bộ democb01 mở /plans → modal thêm đầu việc với 2 cột A/B song song
 *  2. Chọn nhanh mẫu thường xuyên (Cột A) → tự điền tên đầu việc
 *  3. Chọn sản phẩm (Cột B, tìm phía máy chủ) → hiện chip "Đã chọn"
 *  4. Chọn đầu việc riêng của bộ phận (YC-25) → thay tên, bỏ chọn Cột A (loại trừ nhau)
 *  5. Lưu → bảng hiện badge "BỘ PHẬN:" + "SP:"; F5 tải lại vẫn còn (bền vững)
 *  6. Mobile: modal xếp dọc 2 cột, không tràn ngang
 *  7. Trưởng bộ phận cb001: nút quản lý danh mục + thêm đầu việc vào danh mục bộ phận qua modal
 *  8. /monthly-results: liên kết đầu việc kế hoạch khi ghi kết quả; ghi trùng → thông báo chống trùng
 *
 * Chạy: $env:TEST_BASE_URL="http://localhost:3100"; npx tsx scripts/test-yc23-25-ui.ts
 */
import puppeteer, { Browser, Page } from "puppeteer-core";
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  path.join(process.env.LOCALAPPDATA || "", "Google/Chrome/Application/chrome.exe"),
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  path.join(process.env.LOCALAPPDATA || "", "Microsoft/Edge/Application/msedge.exe"),
];
const CHROME_PATH = CHROME_CANDIDATES.find((p) => p && fs.existsSync(p)) || CHROME_CANDIDATES[0];
const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3100";
const OUT_DIR = path.resolve("demo-ops/screenshots-yc23-25");
const IDS_FILE = path.resolve("demo-ops/yc23-25-test-ids.json");

const STAFF_USERNAME = "democb01";
const LEADER_USERNAME = "cb001";

/** Doc mat khau tai khoan DEMO tu demo-ops/demo-secrets.json (khong nhung mat khau vao ma nguon). */
function demoSecret(username: string): string {
  const file = path.resolve("demo-ops/demo-secrets.json");
  if (!fs.existsSync(file)) {
    throw new Error(`Thieu ${file} - mat khau tai khoan DEMO khong nam trong ma nguon`);
  }
  const json = JSON.parse(fs.readFileSync(file, "utf-8"));
  const acc = (json.accounts || []).find((a: any) => a.username === username);
  if (!acc) throw new Error(`Khong thay tai khoan DEMO ${username} trong demo-secrets.json`);
  return process.env[`DEMO_${username.toUpperCase()}_PASSWORD`] || acc.password;
}

/** Mat khau cb001/cb002 do scripts/demo-local-test-accounts.ts dat (chi chay voi DB cuc bo). */
function deptLeaderSecret(): string {
  return process.env.DEPT_LEADER_TEST_PASSWORD || "LocalTest@2026";
}
const DEMO_DEPT_TITLE = "[DEMO] Đối chiếu chứng từ kho ngoại quan";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`✅ [PASS] ${name}${detail ? " — " + detail : ""}`);
  } else {
    failed++;
    console.log(`❌ [FAIL] ${name}${detail ? " — " + detail : ""}`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Chuẩn hóa NFC để so khớp chuỗi tiếng Việt (tránh lệch tổ hợp ký tự giữa các tệp nguồn). */
const norm = (s: string | null | undefined) => (s || "").normalize("NFC");

/** Bảo đảm có kế hoạch [DEMO] DRAFT cho Tuần hiện tại để thao tác được trên UI (DB test chưa có kế hoạch). */
async function ensureDemoPlan(): Promise<{ planId: string; planItemId: string }> {
  const dbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL || "";
  if (!dbUrl.includes("localhost:54329")) {
    throw new Error("CHẶN AN TOÀN: script chỉ chạy với DB test cục bộ (localhost:54329).");
  }
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    const period = await prisma.reportingPeriod.findFirst({
      where: { type: "WEEK", isLocked: false },
      orderBy: { startAt: "desc" },
    });
    if (!period) throw new Error("Không tìm thấy kỳ WEEK chưa khóa trong DB test");
    const unit = await prisma.orgUnit.findUniqueOrThrow({ where: { code: "BP_NGHIEPVU_A" } });
    const leaderAcc = await prisma.account.findUniqueOrThrow({ where: { username: "cb001" } });

    let plan = await prisma.plan.findFirst({
      where: { periodId: period.id, unitId: unit.id, title: { contains: "[DEMO" } },
    });
    if (!plan) {
      plan = await prisma.plan.create({
        data: {
          periodId: period.id,
          unitId: unit.id,
          creatorId: leaderAcc.personId,
          title: `[DEMO-YC2325] Kế hoạch công tác ${period.title}`,
          status: "DRAFT",
        },
      });
      console.log(`• Đã tạo kế hoạch DEMO: ${plan.title}`);
    } else {
      console.log(`• Dùng kế hoạch DEMO sẵn có: ${plan.title}`);
    }

    let planItem = await prisma.planItem.findFirst({
      where: { planId: plan.id },
      orderBy: { sortOrder: "asc" },
    });
    if (!planItem) {
      planItem = await prisma.planItem.create({
        data: {
          planId: plan.id,
          title: "[DEMO-YC2325] Nội dung công tác tuần (khung để thêm đầu việc)",
          sortOrder: 1,
        },
      });
      console.log("• Đã tạo PlanItem DEMO cho kế hoạch.");
    }
    return { planId: plan.id, planItemId: planItem.id };
  } finally {
    await prisma.$disconnect();
  }
}

async function loginToken(username: string, password: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`Đăng nhập ${username} thất bại (HTTP ${res.status})`);
  const json: any = await res.json();
  return json.token;
}

async function newPage(browser: Browser, token: string, width: number, height: number): Promise<Page> {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.setCookie({ name: "token", value: token, domain: "localhost", path: "/" } as any);
  // Tắt tour hướng dẫn tự động (coi như đã hoàn thành onboarding) để thao tác như người dùng thật
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem(
        "hqtl-tour-done",
        JSON.stringify({ "/plans": true, "/monthly-results": true, "/dashboard": true })
      );
    } catch {}
  });
  return page;
}

async function shot(page: Page, name: string, fullPage = false) {
  const dest = path.join(OUT_DIR, name);
  await page.screenshot({ path: dest, fullPage });
  console.log(`   📸 ${name}`);
  return dest;
}

/** Che tên cá nhân của tài khoản đang đăng nhập khỏi ảnh chụp (đọc tên thật từ API — không nhúng vào mã nguồn). */
async function redactSessionName(page: Page, token: string) {
  try {
    const res = await fetch(`${BASE_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    const json: any = await res.json();
    const name: string = json?.user?.fullName || "";
    if (!name || name.length < 4) return;
    await page.evaluate((n) => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode() as Text | null;
      while (node) {
        if (node.nodeValue && node.nodeValue.includes(n)) {
          node.nodeValue = node.nodeValue.split(n).join("[đã che tên cá nhân]");
        }
        node = walker.nextNode() as Text | null;
      }
    }, name);
  } catch {
    // Không chặn kiểm thử nếu API /me lỗi
  }
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const ids: any = fs.existsSync(IDS_FILE) ? JSON.parse(fs.readFileSync(IDS_FILE, "utf-8")) : {};
  console.log("=================================================================");
  console.log("YC-23 + YC-25 — KIỂM THỬ GIAO DIỆN (localhost) + CHỤP ẢNH");
  console.log("=================================================================\n");

  // Bảo đảm có kế hoạch DRAFT để thao tác (chạm DB test cục bộ; có chốt an toàn)
  await ensureDemoPlan();

  const staffToken = await loginToken(STAFF_USERNAME, demoSecret(STAFF_USERNAME));
  const leaderToken = await loginToken(LEADER_USERNAME, deptLeaderSecret());

  // Dọn đầu việc do test UI lần trước tạo (chỉ đúng người + đúng đầu việc [DEMO] đã chọn)
  if (ids.staffAPersonId) {
    const listRes = await fetch(
      `${BASE_URL}/api/personal-work-items?personId=${ids.staffAPersonId}&year=2026&month=10`,
      { headers: { Authorization: `Bearer ${staffToken}` } }
    );
    const listJson: any = await listRes.json();
    for (const wi of listJson.data || []) {
      if (wi.title === DEMO_DEPT_TITLE && wi.deptWorkItem?.title === DEMO_DEPT_TITLE) {
        await fetch(`${BASE_URL}/api/personal-work-items?id=${wi.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${staffToken}` },
        });
        console.log(`• Dọn đầu việc UI test cũ: ${wi.id}`);
      }
    }
  }

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--window-size=1440,900"],
  });

  const pageErrors: string[] = [];

  try {
    // =====================================================================
    // PHẦN 1 — CÁN BỘ (DEMOCB01): modal 2 cột + chọn nguồn + lưu + F5
    // =====================================================================
    console.log("\n[PHẦN 1] Cán bộ democb01 — modal chọn đầu việc 2 cột (desktop 1440×900)\n");
    const page = await newPage(browser, staffToken, 1440, 900);
    page.on("pageerror", (e) => pageErrors.push(`[desktop] ${e.message}`));

    await page.goto(`${BASE_URL}/plans`, { waitUntil: "networkidle2", timeout: 45000 });
    await page.waitForSelector('[data-testid="add-work-item-btn"]', { timeout: 20000 });
    await sleep(2000);
    await shot(page, "01-desktop-plans.png", true);

    await page.click('[data-testid="add-work-item-btn"]');
    await page.waitForSelector('[data-testid="catalog-picker"]', { timeout: 15000 });
    await sleep(800);

    // Bố cục 2 cột song song trên desktop
    const layout = await page.evaluate(() => {
      const a = document.querySelector('[data-testid="picker-col-routine"]')!.getBoundingClientRect();
      const b = document.querySelector('[data-testid="picker-col-product"]')!.getBoundingClientRect();
      const deptSel = document.querySelector('[data-testid="modal-dept-item-select"]') as HTMLSelectElement;
      return {
        aX: Math.round(a.x), aY: Math.round(a.y), bX: Math.round(b.x), bY: Math.round(b.y),
        sideBySide: Math.abs(a.y - b.y) < 30 && b.x > a.x + 100,
        deptOptions: Array.from(deptSel.options).map((o) => o.text),
      };
    });
    check("1a. Modal mở với khu vực chọn danh mục (2 cột)", true);
    check("1b. Cột A (thường xuyên) và Cột B (sản phẩm) song song ngang hàng trên desktop", layout.sideBySide, `A(${layout.aX},${layout.aY}) B(${layout.bX},${layout.bY})`);
    check(
      "1c. Dropdown ① có đầu việc [DEMO] của bộ phận Nghiệp vụ A",
      layout.deptOptions.some((t) => t.includes("[DEMO] Kiểm tra hồ sơ tờ khai nhập khẩu")),
      `${layout.deptOptions.length} lựa chọn`
    );
    await shot(page, "02-desktop-modal-two-cols.png");

    // Chọn mẫu thường xuyên ở Cột A
    await page.type('[data-testid="picker-col-routine-search"]', "TTHQ");
    await sleep(500);
    const firstTpl = await page.evaluate(() => {
      const btn = document.querySelector('[data-testid^="picker-tpl-"]') as HTMLElement;
      return btn ? { testid: btn.getAttribute("data-testid"), text: btn.innerText } : null;
    });
    check("2a. Tìm nhanh Cột A với từ khoá 'TTHQ' có kết quả", !!firstTpl, firstTpl?.text.split("\n")[0] || "");
    if (!firstTpl) throw new Error("Không có mẫu Cột A để chọn");
    await page.click(`[data-testid="${firstTpl!.testid}"]`);
    await sleep(500);
    let titleVal = await page.$eval('[data-testid="modal-title-input"]', (el: any) => el.value);
    check("2b. Chọn mẫu Cột A → tự điền tên đầu việc", titleVal.trim().length > 0 && firstTpl!.text.includes(titleVal), `tên="${titleVal.slice(0, 60)}..."`);
    await shot(page, "03-desktop-routine-selected.png");

    // Tìm sản phẩm phía máy chủ ở Cột B
    await page.type('[data-testid="picker-col-product-search"]', "giám sát");
    await page.waitForSelector('[data-testid^="picker-product-"]', { timeout: 15000 });
    await sleep(600);
    const firstProd = await page.evaluate(() => {
      const btn = document.querySelector('[data-testid^="picker-product-"]') as HTMLElement;
      const totalText = btn ? btn.parentElement?.parentElement?.innerText || "" : "";
      return btn ? { testid: btn.getAttribute("data-testid"), text: btn.innerText, totalText } : null;
    });
    check("3a. Tìm sản phẩm Cột B từ khoá 'giám sát' (tìm phía máy chủ) có kết quả", !!firstProd);
    if (!firstProd) throw new Error("Không có sản phẩm Cột B để chọn");
    await page.click(`[data-testid="${firstProd!.testid}"]`);
    await sleep(500);
    const prodChip = await page.evaluate(() => {
      const col = document.querySelector('[data-testid="picker-col-product"]')!;
      const chip = Array.from(col.querySelectorAll("div")).find((d) => d.textContent?.startsWith("Đã chọn:"));
      return chip ? chip.textContent : null;
    });
    check("3b. Chọn sản phẩm → hiện chip 'Đã chọn: <mã> — <tên>'", !!prodChip && prodChip.startsWith("Đã chọn:"), prodChip || "");
    await shot(page, "04-desktop-product-selected.png");

    // Chọn đầu việc riêng của bộ phận (YC-25)
    const deptOptionValue = await page.evaluate((label) => {
      const sel = document.querySelector('[data-testid="modal-dept-item-select"]') as HTMLSelectElement;
      const opt = Array.from(sel.options).find((o) => o.text.includes(label));
      return opt ? opt.value : null;
    }, DEMO_DEPT_TITLE);
    if (!deptOptionValue) throw new Error("Không tìm thấy đầu việc [DEMO] trong dropdown bộ phận");
    await page.select('[data-testid="modal-dept-item-select"]', deptOptionValue);
    await sleep(600);
    titleVal = await page.$eval('[data-testid="modal-title-input"]', (el: any) => el.value);
    const routineCleared = await page.$eval('[data-testid="modal-template-select"]', (el: any) => el.value === "");
    check("4a. Chọn đầu việc bộ phận → tự thay tên theo danh mục bộ phận", titleVal === DEMO_DEPT_TITLE, `tên="${titleVal}"`);
    check("4b. Hai nguồn loại trừ nhau: chọn bộ phận thì bỏ chọn Cột A", routineCleared);
    const prodStill = await page.evaluate(() => {
      const col = document.querySelector('[data-testid="picker-col-product"]')!;
      return Array.from(col.querySelectorAll("div")).some((d) => d.textContent?.startsWith("Đã chọn:"));
    });
    check("4c. Sản phẩm (Cột B) độc lập — vẫn giữ khi chọn đầu việc bộ phận", prodStill);
    await shot(page, "05-desktop-dept-selected.png");

    // Lưu
    await page.click('[data-testid="modal-submit-btn"]');
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="catalog-picker"]'),
      { timeout: 20000 }
    );
    await sleep(2500);
    const savedRow = await page.evaluate((t) => {
      const rows = Array.from(document.querySelectorAll("tr"));
      const row = rows.find((r) => r.textContent?.includes(t));
      return row ? row.innerText : null;
    }, DEMO_DEPT_TITLE);
    check("5a. Lưu thành công — đầu việc xuất hiện trong bảng kế hoạch", !!savedRow, savedRow ? savedRow.replace(/\n/g, " | ").slice(0, 120) : "không thấy dòng");
    check("5b. Bảng hiện badge 'BỘ PHẬN:' với tên đầu việc danh mục", !!savedRow && norm(savedRow).includes("BỘ PHẬN:"));
    check("5c. Bảng hiện badge 'SP:' với mã sản phẩm đã chọn", !!savedRow && norm(savedRow).includes("SP:"));
    await shot(page, "06-desktop-saved-row.png", true);

    // F5 — bền vững
    await page.reload({ waitUntil: "networkidle2", timeout: 45000 });
    await page.waitForSelector('[data-testid="add-work-item-btn"]', { timeout: 20000 });
    await sleep(2500);
    const afterReload = await page.evaluate((t) => {
      const rows = Array.from(document.querySelectorAll("tr"));
      const row = rows.find((r) => r.textContent?.includes(t));
      return row ? row.innerText : null;
    }, DEMO_DEPT_TITLE);
    check("6. F5 tải lại trang — đầu việc + badge BỘ PHẬN/SP vẫn còn (dữ liệu bền vững)", !!afterReload && norm(afterReload).includes("BỘ PHẬN:") && norm(afterReload).includes("SP:"));
    await shot(page, "07-desktop-after-reload.png", true);
    await page.close();

    // =====================================================================
    // PHẦN 2 — MOBILE 390×844: modal xếp dọc, không tràn ngang
    // =====================================================================
    console.log("\n[PHẦN 2] Mobile 390×844 — modal xếp dọc, không tràn ngang\n");
    const mpage = await newPage(browser, staffToken, 390, 844);
    mpage.on("pageerror", (e) => pageErrors.push(`[mobile] ${e.message}`));
    await mpage.goto(`${BASE_URL}/plans`, { waitUntil: "networkidle2", timeout: 45000 });
    await sleep(2500);
    const overflowX = await mpage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check("7a. Trang /plans trên mobile không tràn ngang", overflowX <= 2, `tràn ${overflowX}px`);
    await shot(mpage, "08-mobile-plans.png", true);

    await mpage.waitForSelector('[data-testid="add-work-item-btn-mobile"]', { timeout: 20000 });
    await mpage.click('[data-testid="add-work-item-btn-mobile"]');
    await mpage.waitForSelector('[data-testid="catalog-picker"]', { timeout: 15000 });
    await sleep(800);
    const mobileLayout = await mpage.evaluate(() => {
      const a = document.querySelector('[data-testid="picker-col-routine"]')!.getBoundingClientRect();
      const b = document.querySelector('[data-testid="picker-col-product"]')!.getBoundingClientRect();
      const modal = document.querySelector('[data-testid="catalog-picker"]')!;
      const pickerRect = modal.getBoundingClientRect();
      return {
        stacked: Math.abs(a.x - b.x) < 10 && b.y > a.y + a.height - 10,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        pickerRight: Math.round(pickerRect.right), viewportW: window.innerWidth,
      };
    });
    check("7b. Modal mobile: Cột A và Cột B xếp dọc (không song song)", mobileLayout.stacked, JSON.stringify(mobileLayout));
    check("7c. Modal mobile không tràn ngang (picker nằm trong màn hình)", mobileLayout.overflow <= 2 && mobileLayout.pickerRight <= mobileLayout.viewportW + 2);
    await shot(mpage, "09-mobile-modal-stacked.png");
    await mpage.close();

    // =====================================================================
    // PHẦN 3 — TRƯỞNG BỘ PHẬN (CB001): quản lý danh mục bộ phận
    // =====================================================================
    console.log("\n[PHẦN 3] Trưởng bộ phận cb001 — quản lý danh mục đầu việc bộ phận\n");
    const lpage = await newPage(browser, leaderToken, 1440, 900);
    lpage.on("pageerror", (e) => pageErrors.push(`[leader] ${e.message}`));
    await lpage.goto(`${BASE_URL}/plans`, { waitUntil: "networkidle2", timeout: 45000 });
    await lpage.waitForSelector('[data-testid="open-dept-catalog-manager-toolbar"]', { timeout: 20000 });
    check("8a. Trưởng bộ phận thấy nút quản lý danh mục bộ phận trên thanh công cụ", true);
    await lpage.click('[data-testid="open-dept-catalog-manager-toolbar"]');
    await lpage.waitForSelector('[data-testid="dept-form-title"]', { timeout: 15000 });
    await sleep(1200);
    const mgrInfo = await lpage.evaluate(() => {
      const sel = document.querySelector('[data-testid="dept-manager-unit-select"]') as HTMLSelectElement;
      const rows = document.querySelectorAll('[data-testid^="dept-manage-row-"]');
      return { units: sel ? Array.from(sel.options).map((o) => o.text) : [], rowCount: rows.length };
    });
    check("8b. Modal quản lý hiện danh sách đầu việc của bộ phận phụ trách", mgrInfo.rowCount >= 3 && mgrInfo.units.length <= 1);
    await redactSessionName(lpage, leaderToken);
    await shot(lpage, "10-leader-manager-modal.png");

    const uiItemTitle = "[TEST-YC2325-UI] Đầu việc thêm từ giao diện";
    await lpage.type('[data-testid="dept-form-title"]', uiItemTitle);
    await lpage.type('[data-testid="dept-form-desc"]', "Tạo bởi script kiểm thử UI — sẽ được dọn sau khi test");
    await lpage.click('[data-testid="dept-form-submit"]');
    await lpage.waitForFunction(
      (t) => document.body.innerText.includes(t),
      { timeout: 15000 },
      uiItemTitle
    );
    await sleep(1200);
    const addedRow = await lpage.evaluate((t) => {
      const row = Array.from(document.querySelectorAll('[data-testid^="dept-manage-row-"]')).find((r) => r.textContent?.includes(t));
      return row ? row.innerText.replace(/\n/g, " | ") : null;
    }, uiItemTitle);
    check("8c. Thêm đầu việc mới vào danh mục bộ phận qua giao diện → xuất hiện trong danh sách", !!addedRow, addedRow || "");
    await redactSessionName(lpage, leaderToken);
    await shot(lpage, "11-leader-item-added.png");
    await lpage.close();

    // Dọn đầu việc UI vừa tạo (chưa dùng → xoá cứng qua API)
    const dList: any = await (await fetch(`${BASE_URL}/api/department-work-items?status=ALL`, { headers: { Authorization: `Bearer ${leaderToken}` } })).json();
    const uiItem = (dList.data || []).find((x: any) => x.title === uiItemTitle);
    if (uiItem) {
      await fetch(`${BASE_URL}/api/department-work-items?id=${uiItem.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${leaderToken}` } });
      console.log("• Đã dọn đầu việc UI test khỏi danh mục bộ phận");
    }

    // =====================================================================
    // PHẦN 4 — /monthly-results: liên kết đầu việc + chống ghi trùng
    // =====================================================================
    console.log("\n[PHẦN 4] Ghi nhận kết quả tháng — liên kết đầu việc kế hoạch\n");
    if (!ids.pwiDeptId) {
      console.log("⚠️  Không có demo-ops/yc23-25-test-ids.json (chạy scripts/test-yc23-25-api.ts trước) — bỏ qua phần 4.");
    } else {
      const rpage = await newPage(browser, staffToken, 1440, 900);
      rpage.on("pageerror", (e) => pageErrors.push(`[results] ${e.message}`));
      await rpage.goto(`${BASE_URL}/monthly-results`, { waitUntil: "networkidle2", timeout: 45000 });
      await rpage.waitForSelector('[data-tour="add-btn"]', { timeout: 20000 });
      await sleep(2000);
      await rpage.click('[data-tour="add-btn"]');
      await rpage.waitForSelector('[data-testid="work-item-select"]', { timeout: 15000 });
      await sleep(1500);
      const wiOptions = await rpage.evaluate(() => {
        const sel = document.querySelector('[data-testid="work-item-select"]') as HTMLSelectElement;
        return Array.from(sel.options).map((o) => ({ v: o.value, t: o.text }));
      });
      check("9a. Modal kết quả tháng có dropdown liên kết đầu việc trong kế hoạch (theo tháng)", wiOptions.length > 1, `${wiOptions.length - 1} đầu việc`);
      const opt = wiOptions.find((o) => o.v === ids.pwiDeptId);
      check("9b. Đầu việc đã tạo từ kiểm thử API xuất hiện đúng trong danh sách", !!opt, opt?.t.slice(0, 70) || "");
      if (opt) {
        await rpage.select('[data-testid="work-item-select"]', ids.pwiDeptId);
        await sleep(600);
        const filledTitle = await rpage.$eval('input[placeholder*="Nhập tên nhiệm vụ"]', (el: any) => el.value);
        check("9c. Chọn đầu việc → tự điền tên nhiệm vụ", filledTitle.trim().length > 0, `"${filledTitle.slice(0, 60)}"`);
        await shot(rpage, "12-monthly-modal-linked.png");
        const submitBtn = await rpage.evaluateHandle(() =>
          Array.from(document.querySelectorAll("button")).find((b) => b.innerText.includes("Lưu kết quả"))
        );
        await (submitBtn as any).click();
        await sleep(2500);
        const toastText = await rpage.evaluate(() => document.body.innerText);
        check(
          "9d. Ghi lại đầu việc đã có kết quả trong tháng → thông báo chống ghi trùng",
          toastText.includes("chống ghi trùng") || toastText.includes("đã được ghi nhận trong tháng"),
          toastText.includes("chống ghi trùng") ? "thấy thông báo chống trùng" : "không thấy thông báo"
        );
        await shot(rpage, "13-monthly-dedupe-toast.png");
      }
      await rpage.close();
    }

    // =====================================================================
    console.log("\n-----------------------------------------------------------------");
    check("10. Không có lỗi JS trên trang trong suốt quá trình kiểm thử UI", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    console.log(`\nKẾT QUẢ UI: ${passed} PASS / ${failed} FAIL`);
    console.log(`Ảnh lưu tại: ${OUT_DIR}`);
    if (failed > 0) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error("LỖI TEST UI:", e);
  process.exitCode = 2;
});
