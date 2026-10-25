/**
 * UX Phase 2B1 — UI smoke: chọn N tag TX bằng chip, ngày/ca mặc định VN.
 * Chỉ chạy trên server dev local trỏ database kiểm thử.
 *
 *   $env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/talung_v3_integration_2b1"
 *   $env:TEST_BASE_URL="http://localhost:3113"
 *   npx tsx scripts/test-ux-phase2b1-routine-ui.ts
 */
import puppeteer from "puppeteer-core";
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { assertLocalTestDatabase } from "./lib/test-db-safety";
import { todayInVietnam } from "../src/server/work-dates";

const creq = createRequire(import.meta.url);
const { PrismaClient } = creq("@prisma/client");
const dbUrl = assertLocalTestDatabase(
  process.env.DIRECT_URL || process.env.DATABASE_URL || "",
  "test-ux-phase2b1-routine-ui"
);
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const BASE = process.env.TEST_BASE_URL || "http://localhost:3113";
const PASSWORD = process.env.V3_DEMO_PASSWORD || "LocalTest@2026";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`[PASS] ${name}${detail ? " - " + detail : ""}`);
  } else {
    failed++;
    console.log(`[FAIL] ${name}${detail ? " - " + detail : ""}`);
  }
}

async function main() {
  console.log("=== UX 2B1 — UI SMOKE ===\n");

  const txEntries = await prisma.workCatalogEntry.findMany({
    where: { status: "ACTIVE", version: { status: "ACTIVE" } },
    orderBy: [{ departmentOrder: "asc" }, { sortOrder: "asc" }],
    take: 2,
    select: { id: true, code: true, title: true },
  });
  if (txEntries.length < 2) throw new Error("Không đủ 2 đầu việc TX ACTIVE để test UI");

  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--window-size=1440,1000"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  try {
    // Lấy cookie phiên bằng API (tránh phụ thuộc thời điểm hydration của trang login),
    // sau đó mở trực tiếp trang nhật ký như người dùng đã đăng nhập.
    const loginRes = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "democb01", password: PASSWORD }),
    });
    if (!loginRes.ok) throw new Error(`Đăng nhập API lỗi HTTP ${loginRes.status}`);
    const setCookies = loginRes.headers.getSetCookie?.() || [];
    const tokenCookie = setCookies.find((cookie) => cookie.startsWith("token="));
    if (!tokenCookie) throw new Error("Không nhận được cookie phiên đăng nhập");
    const tokenValue = tokenCookie.split(";")[0].slice("token=".length);
    await page.setCookie({
      name: "token",
      value: tokenValue,
      url: BASE,
      httpOnly: true,
      sameSite: "Lax",
    });

    await page.goto(`${BASE}/routine`, { waitUntil: "networkidle2", timeout: 120000 });
    // TourGuide có thể phủ overlay lên nút khai báo ở lần đầu vào trang.
    await page.waitForSelector('[data-testid="routine-declaration-toggle"]', { timeout: 120000 });
    await page
      .waitForFunction(
        () =>
          Array.from(document.querySelectorAll("button")).some(
            (button) => button.textContent?.trim() === "Bỏ qua"
          ),
        { timeout: 10000 }
      )
      .catch(() => {});
    await page.evaluate(() => {
      const skip = Array.from(document.querySelectorAll("button")).find(
        (button) => button.textContent?.trim() === "Bỏ qua"
      );
      skip?.click();
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    // UX 3B: với công chức, form khai báo mặc định thu gọn — mở trước khi thao tác.
    await page.waitForSelector('[data-testid="routine-declaration-toggle"]', { timeout: 120000 });
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const toggleCollapsed = await page.$eval(
      '[data-testid="routine-declaration-toggle"]',
      (el) => el.getAttribute("aria-expanded")
    );
    check(
      "0. Form khai báo mặc định thu gọn với công chức",
      toggleCollapsed === "false",
      `aria-expanded=${toggleCollapsed}`
    );
    const panelHidden = await page.$eval(
      '[data-testid="routine-declaration-panel"]',
      (el) => el.hasAttribute("hidden")
    );
    check("0. Panel khai báo ẩn khi chưa mở", panelHidden === true);
    await page.click('[data-testid="routine-declaration-toggle"]');
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="routine-declaration-toggle"]')
          ?.getAttribute("aria-expanded") === "true",
      { timeout: 30000 }
    );
    await page.waitForSelector('[data-testid="routine-catalog-picker"]', { timeout: 120000 });
    // Dev server hydrate không đồng bộ; chờ một nhịp trước khi thao tác input có state React.
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const today = todayInVietnam();
    const entryDateValue = await page.$eval('[data-testid="routine-entry-date"]', (el: any) => el.value);
    const filterDateValue = await page.$eval('[data-testid="routine-filter-date"]', (el: any) => el.value);
    const shiftValue = await page.$eval('[data-testid="routine-work-shift"]', (el: any) => el.value);
    check("1. Ngày ghi nhận mặc định là hôm nay theo giờ VN", entryDateValue === today, `${entryDateValue}`);
    check("1. Bộ lọc danh sách mặc định hôm nay", filterDateValue === today, `${filterDateValue}`);
    check("1. Ca mặc định là CA_NGAY", shiftValue === "CA_NGAY", shiftValue);

    const listTitle = await page.$eval('[data-testid="routine-list-title"]', (el) => el.textContent || "");
    check(
      "1b. Tiêu đề danh sách không gộp ca (ca chỉ hiển thị trên từng dòng)",
      listTitle.includes("Ngày") && !/·\s*Ca\b/.test(listTitle),
      listTitle.trim()
    );
    const filterAllChecked = await page.$eval(
      '[data-testid="routine-filter-all"]',
      (el: any) => el.checked
    );
    check("1b. Mặc định không bật 'Tất cả ngày'", filterAllChecked === false);

    // Đổi ngày ghi nhận KHÔNG được tự đổi bộ lọc xem danh sách.
    const [todayYear, todayMonth, todayDay] = today.split("-").map(Number);
    const yesterday = new Date(Date.UTC(todayYear, todayMonth - 1, todayDay - 1))
      .toISOString()
      .slice(0, 10);
    await page.evaluate((value) => {
      const input = document.querySelector('[data-testid="routine-entry-date"]') as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, yesterday);
    await page.waitForSelector('[data-testid="routine-entry-date-warning"]', { timeout: 30000 });
    const filterAfterEntryDateChange = await page.$eval(
      '[data-testid="routine-filter-date"]',
      (el: any) => el.value
    );
    check(
      "1c. Đổi ngày ghi nhận không đổi ngày lọc; có cảnh báo backdate",
      filterAfterEntryDateChange === today,
      `filter=${filterAfterEntryDateChange}`
    );
    await page.evaluate(() => {
      document.querySelector<HTMLButtonElement>('[data-testid="routine-entry-date-today"]')?.click();
    });
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="routine-entry-date-warning"]'),
      { timeout: 30000 }
    );

    // "Tất cả ngày": xem lịch sử, khóa ô ngày lọc.
    await page.evaluate(() => {
      document.querySelector<HTMLInputElement>('[data-testid="routine-filter-all"]')?.click();
    });
    await page.waitForFunction(
      () =>
        (document.querySelector('[data-testid="routine-filter-date"]') as HTMLInputElement)?.disabled === true,
      { timeout: 30000 }
    );
    const allDatesTitle = await page.$eval(
      '[data-testid="routine-list-title"]',
      (el) => el.textContent || ""
    );
    check("1d. Có chế độ 'Tất cả ngày' khi xem lịch sử", allDatesTitle.includes("Tất cả ngày"));
    await page.evaluate(() => {
      document.querySelector<HTMLInputElement>('[data-testid="routine-filter-all"]')?.click();
    });
    await page.waitForFunction(
      () =>
        (document.querySelector('[data-testid="routine-filter-date"]') as HTMLInputElement)?.disabled === false,
      { timeout: 30000 }
    );

    // Ngày ghi nhận rỗng không được âm thầm fallback về hôm nay.
    await page.evaluate(() => {
      const input = document.querySelector('[data-testid="routine-entry-date"]') as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.waitForSelector('[data-testid="routine-entry-date-required"]', { timeout: 30000 });
    const dateRequired = await page.$eval('[data-testid="routine-entry-date"]', (el: any) => el.required);
    check("1e. Ngày ghi nhận rỗng bị chặn (required + cảnh báo)", dateRequired === true);
    await page.evaluate(() => {
      document.querySelector<HTMLButtonElement>('[data-testid="routine-entry-date-today"]')?.click();
    });
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="routine-entry-date-required"]'),
      { timeout: 30000 }
    );

    for (const entry of txEntries) {
      await page.click('[data-testid="routine-tx-search"]');
      await page.type('[data-testid="routine-tx-search"]', entry.code);
      await page.waitForSelector(`[data-testid="routine-tx-option-${entry.code}"]`, { timeout: 60000 });
      // Chờ React hoàn tất một nhịp render trước khi bấm (dev server hydrate không đồng bộ).
      await new Promise((resolve) => setTimeout(resolve, 600));
      await page.evaluate((code) => {
        const button = document.querySelector<HTMLButtonElement>(
          `[data-testid="routine-tx-option-${code}"]`
        );
        button?.click();
      }, entry.code);
      try {
        await page.waitForSelector(`[data-testid="routine-tx-chip-${entry.code}"]`, { timeout: 30000 });
      } catch (error) {
        const state = await page.evaluate(() => ({
          chips: Array.from(document.querySelectorAll('[data-testid^="routine-tx-chip-"]')).map(
            (el) => el.getAttribute("data-testid")
          ),
          search: (document.querySelector('[data-testid="routine-tx-search"]') as HTMLInputElement)?.value,
          pickerText: document
            .querySelector('[data-testid="routine-catalog-picker"]')
            ?.textContent?.slice(0, 800),
        }));
        console.log("DEBUG STATE", state);
        console.log("CONSOLE ERRORS", consoleErrors);
        console.log("PAGE ERRORS", pageErrors);
        throw error;
      }
    }

    const chipCount = await page.$$eval('[data-testid^="routine-tx-chip-"]', (els) => els.length);
    check("2. Chọn 2 tag TX tạo 2 chip (không thay thế tag trước)", chipCount === 2, `chips=${chipCount}`);

    const titleValue = await page.$eval('[data-testid="routine-title"]', (el: any) => el.value);
    check(
      "2. Nội dung công việc được điền từ tag đầu tiên",
      titleValue.trim() === txEntries[0].title.trim(),
      titleValue
    );

    await page.evaluate((code) => {
      document
        .querySelector<HTMLButtonElement>(`[data-testid="routine-tx-remove-${code}"]`)
        ?.click();
    }, txEntries[1].code);
    await page.waitForFunction(
      (code) => !document.querySelector(`[data-testid="routine-tx-chip-${code}"]`),
      { timeout: 30000 },
      txEntries[1].code
    );
    const afterRemove = await page.$$eval('[data-testid^="routine-tx-chip-"]', (els) => els.length);
    check("3. Bỏ một chip chỉ bỏ đúng tag đó", afterRemove === 1, `chips=${afterRemove}`);

    const screenshotDir = path.resolve(".superpowers/sdd/ux-phase2");
    fs.mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({
      path: path.join(screenshotDir, "task-2b1-routine-picker.png"),
      fullPage: false,
    });
    check("4. Không có lỗi runtime trên trang", pageErrors.length === 0, pageErrors.join(" | "));
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }

  console.log(`\n=== KẾT QUẢ UI: ${passed} pass / ${failed} fail ===`);
  if (failed > 0) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
