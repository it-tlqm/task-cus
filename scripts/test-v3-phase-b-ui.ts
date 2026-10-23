/**
 * S2 — Phase B UI smoke (YC-01/02): Dashboard + /giao-ban dùng cùng khối so sánh,
 * cấu hình chỉ tiêu có nguồn/căn cứ/trạng thái, mobile không tràn ngang.
 *
 * Chỉ chạy với DB/API kiểm thử:
 *   DATABASE_URL=...talung_v3_phase_b
 *   TEST_BASE_URL=http://localhost:3112
 */
import puppeteer, { Browser, Page } from "puppeteer-core";
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  path.join(process.env.LOCALAPPDATA || "", "Google/Chrome/Application/chrome.exe"),
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  path.join(process.env.LOCALAPPDATA || "", "Microsoft/Edge/Application/msedge.exe"),
];
const CHROME_PATH = CHROME_CANDIDATES.find((p) => p && fs.existsSync(p)) || CHROME_CANDIDATES[0];

const DB_URL = process.env.DIRECT_URL || process.env.DATABASE_URL || "";
if (!DB_URL.includes("talung_v3_phase_b")) {
  throw new Error("TỪ CHỐI CHẠY: chỉ dùng database kiểm thử talung_v3_phase_b.");
}
const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3112";
if (!/^http:\/\/localhost:3112\/?$/.test(BASE_URL)) {
  throw new Error("TỪ CHỐI CHẠY: TEST_BASE_URL phải là http://localhost:3112.");
}
const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });
const PASSWORD = process.env.TEST_PASSWORD || "LocalTest@2026";
const OUT_DIR = path.resolve("docs/evidence/phase-b");
fs.mkdirSync(OUT_DIR, { recursive: true });

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`[PASS] ${name}${detail ? " — " + detail : ""}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? " — " + detail : ""}`);
    console.log(`[FAIL] ${name}${detail ? " — " + detail : ""}`);
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (s: string | null | undefined) => (s || "").replace(/\s+/g, " ").trim();

async function loginToken(username: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: PASSWORD }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!json.token) throw new Error(`Đăng nhập ${username} thất bại (HTTP ${res.status})`);
  return json.token;
}

async function newPage(browser: Browser, token: string, width: number, height: number, mobile = false): Promise<Page> {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  await page.setCookie({ name: "token", value: token, domain: "localhost", path: "/" } as any);
  page.setDefaultTimeout(60000);
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem(
        "hqtl-tour-done",
        JSON.stringify({
          "/dashboard": true,
          "/giao-ban": true,
          "/giao-ban/nhap": true,
          "/giao-ban/cau-hinh": true,
        })
      );
    } catch {
      /* ignore */
    }
  });
  return page;
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(OUT_DIR, name), fullPage: false });
  console.log(`   • ảnh: ${path.join("docs/evidence/phase-b", name)}`);
}

async function textOf(page: Page, selector: string): Promise<string> {
  return norm(
    await page.$eval(selector, (el) => (el as HTMLElement).innerText).catch(() => "")
  );
}

async function pageOverflowX(page: Page): Promise<number> {
  return page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth));
}

async function main() {
  console.log("=== S2 PHASE B UI SMOKE ===");
  console.log(`API: ${BASE_URL}`);
  const token = await loginToken("demold01");
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    // ---------- Dashboard desktop ----------
    const dash = await newPage(browser, token, 1440, 1000);
    await dash.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle0", timeout: 120000 });
    await dash.waitForSelector('[data-testid="comparison-section"]', { timeout: 60000 });
    const dashText = await textOf(dash, '[data-testid="comparison-section"]');
    check("UI1. Dashboard có khối So sánh kết quả thu NSNN", dashText.toUpperCase().includes("SO SÁNH KẾT QUẢ THU NSNN"));
    check(
      "UI2. Dashboard có đủ 5 dòng đối chiếu",
      ["Chỉ tiêu Bộ Tài chính", "Chỉ tiêu UBND tỉnh", "Kế hoạch tháng HQTL", "So với tháng trước", "So với cùng kỳ năm trước"].every((x) =>
        dashText.includes(x)
      )
    );
    check("UI3. Dashboard ghi rõ kỳ trước/cùng kỳ CHỜ CHỐT (B1)", dashText.includes("CHỜ CHỐT (B1)"));
    check("UI4. Dashboard không hiện nhãn [DEMO] trong khối so sánh", !dashText.includes("[DEMO]"));
    await shot(dash, "dashboard-comparison-desktop.png");
    await dash.close();

    // ---------- /giao-ban desktop ----------
    const gb = await newPage(browser, token, 1440, 1000);
    await gb.goto(`${BASE_URL}/giao-ban`, { waitUntil: "networkidle0", timeout: 120000 });
    await gb.waitForSelector('[data-testid="comparison-section"]', { timeout: 60000 });
    const gbText = await textOf(gb, '[data-testid="comparison-section"]');
    check("UI5. /giao-ban có cùng khối so sánh (nhất quán Dashboard)", gbText.toUpperCase().includes("SO SÁNH KẾT QUẢ THU NSNN"));
    check(
      "UI6. /giao-ban có link Cấu hình chỉ tiêu cho lãnh đạo",
      gbText.includes("Cấu hình chỉ tiêu") || (await textOf(gb, "body")).includes("Cấu hình chỉ tiêu")
    );
    await shot(gb, "giao-ban-comparison-desktop.png");
    await gb.close();

    // ---------- Cấu hình chỉ tiêu ----------
    const cfg = await newPage(browser, token, 1440, 1000);
    await cfg.goto(`${BASE_URL}/giao-ban/cau-hinh`, { waitUntil: "networkidle0", timeout: 120000 });
    await cfg.waitForFunction(() => document.body.innerText.includes("Cấu hình số liệu giao ban"), { timeout: 60000 });
    await cfg.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find((b) => (b.textContent || "").includes("Chỉ tiêu giao"));
      (btn as HTMLButtonElement | undefined)?.click();
    });
    await sleep(500);
    // Chọn THU_NSNN trong ô "chọn chỉ tiêu" để thấy danh sách target/trạng thái/lịch sử.
    await cfg.evaluate(() => {
      const select = [...document.querySelectorAll("select")].find((s) =>
        [...s.options].some((o) => (o.textContent || "").includes("Thu NSNN"))
      ) as HTMLSelectElement | undefined;
      if (select) {
        const opt = [...select.options].find((o) => (o.textContent || "").includes("Thu NSNN"));
        if (opt) {
          select.value = opt.value;
          select.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    });
    await sleep(800);
    const cfgText = norm(await cfg.evaluate(() => document.body.innerText));
    const cfgHtml = await cfg.content();
    check("UI7. Tab Chỉ tiêu giao mở được", cfgText.includes("Chỉ tiêu giao (BTC / UBND / KH tháng"));
    check("UI8. Có ô nguồn/căn cứ khi nhập chỉ tiêu", cfgHtml.includes("Nguồn / căn cứ"));
    check(
      "UI9. Có lựa chọn loại đối chiếu tường minh (BTC/UBND cho kỳ Năm)",
      cfgHtml.includes("Chỉ tiêu BTC (năm)") && cfgHtml.includes("Chỉ tiêu UBND tỉnh (năm)")
    );
    check("UI10. Có trạng thái Đã nhập/Đã xác nhận/Đã chốt", cfgText.includes("Đã nhập / chưa xác nhận") || cfgText.includes("Đã xác nhận") || cfgText.includes("Đã chốt"));
    await shot(cfg, "giao-ban-cau-hinh-target.png");

    // Mở lịch sử của target DEMO đầu tiên nếu có
    const historyClicked = await cfg.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "Lịch sử");
      if (!btn) return false;
      (btn as HTMLButtonElement).click();
      return true;
    });
    await sleep(800);
    const hasHistory = (await cfg.$('[data-testid="metric-history-modal"]')) !== null;
    check("UI11. Mở được lịch sử thay đổi chỉ tiêu giao", !historyClicked || hasHistory);
    if (hasHistory) await shot(cfg, "giao-ban-target-history.png");
    await cfg.close();

    // ---------- Mobile ----------
    const m1 = await newPage(browser, token, 390, 844, true);
    await m1.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle0", timeout: 120000 });
    await m1.waitForSelector('[data-testid="comparison-section"]', { timeout: 60000 });
    check("UI12. Mobile Dashboard không tràn ngang", (await pageOverflowX(m1)) <= 1, `overflow=${await pageOverflowX(m1)}`);
    await shot(m1, "dashboard-comparison-mobile.png");
    await m1.close();

    const m2 = await newPage(browser, token, 390, 844, true);
    await m2.goto(`${BASE_URL}/giao-ban`, { waitUntil: "networkidle0", timeout: 120000 });
    await m2.waitForSelector('[data-testid="comparison-section"]', { timeout: 60000 });
    check("UI13. Mobile /giao-ban không tràn ngang", (await pageOverflowX(m2)) <= 1, `overflow=${await pageOverflowX(m2)}`);
    await shot(m2, "giao-ban-comparison-mobile.png");
    await m2.close();

    // ---------- Staff không thấy cấu hình ----------
    const staffToken = await loginToken("democb01");
    const s = await newPage(browser, staffToken, 1440, 900);
    await s.goto(`${BASE_URL}/giao-ban/cau-hinh`, { waitUntil: "networkidle0", timeout: 120000 });
    await sleep(800);
    const staffText = norm(await s.evaluate(() => document.body.innerText));
    check("UI14. STAFF không vào được cấu hình số liệu", staffText.includes("Chỉ người được cấp quyền cấu hình"));
    await s.close();
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }

  console.log(`\n=== KẾT QUẢ UI: ${passed} PASS / ${failed} FAIL ===`);
  if (failed) {
    for (const f of failures) console.log(" - " + f);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("LỖI UI TEST:", err);
  process.exitCode = 1;
});
