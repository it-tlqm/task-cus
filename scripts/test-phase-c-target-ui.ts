/**
 * S3 — Phase C: UI smoke cho target-only (D7=A).
 *
 * Chỉ chạy localhost:3113 + DB talung_v3_phase_c.
 * Tạo 1 target test qua UI, kiểm tra D5 pending, confirm/lock/history, /giao-ban,
 * mobile overflow; dọn DB và khôi phục mật khẩu tài khoản test.
 */
import puppeteer, { Browser, Page } from "puppeteer-core";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";

const DB_URL = process.env.DIRECT_URL || process.env.DATABASE_URL || "";
if (!DB_URL.includes("talung_v3_phase_c") && !DB_URL.includes("talung_v3_fixture_integration")) {
  throw new Error("TỪ CHỐI: chỉ dùng talung_v3_phase_c hoặc talung_v3_fixture_integration.");
}
const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3113";
if (!/^http:\/\/localhost:(3113|3118)\/?$/.test(BASE_URL)) throw new Error("TỪ CHỐI: TEST_BASE_URL phải là localhost:3113 hoặc localhost:3118.");
const PASSWORD = process.env.TEST_PASSWORD || "LocalTest@2026";
const USERNAME = process.env.TEST_USERNAME || "cb016";
const HASH_FILE = process.env.TEST_OLD_HASH_FILE || "C:\\Users\\thanhnx\\AppData\\Local\\Temp\\opencode\\s3-cb016-hash.json";
const OUT_DIR = path.resolve("docs/evidence/multi-session/S3/target-only");
fs.mkdirSync(OUT_DIR, { recursive: true });

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  path.join(process.env.LOCALAPPDATA || "", "Google/Chrome/Application/chrome.exe"),
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  path.join(process.env.LOCALAPPDATA || "", "Microsoft/Edge/Application/msedge.exe"),
];
const CHROME_PATH = CHROME_CANDIDATES.find((p) => p && fs.existsSync(p)) || CHROME_CANDIDATES[0];
const prisma = new PrismaClient();

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    passed++;
    console.log(`PASS  ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`FAIL  ${name}${detail === undefined ? "" : ` :: ${JSON.stringify(detail)}`}`);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE_URL}/login`, { cache: "no-store" });
      if (res.ok || res.status === 307 || res.status === 308) return;
    } catch {
      /* server chưa lên */
    }
    await sleep(1000);
  }
  throw new Error(`Server ${BASE_URL} không sẵn sàng sau 60s.`);
}

async function loginToken(): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!json.token) throw new Error(`Đăng nhập ${USERNAME} thất bại (HTTP ${res.status}): ${json.error || ""}`);
  return json.token;
}

async function api(method: string, urlPath: string, token: string, body?: unknown) {
  const res = await fetch(`${BASE_URL}${urlPath}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
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
        JSON.stringify({ "/giao-ban": true, "/giao-ban/cau-hinh": true })
      );
      localStorage.setItem(
        "hqtl-seen-pages",
        JSON.stringify({ "/giao-ban": true, "/giao-ban/cau-hinh": true })
      );
    } catch {
      /* ignore */
    }
  });
  return page;
}

async function shot(page: Page, name: string) {
  await page.evaluate(() => (document as any).fonts?.ready).catch(() => null);
  await sleep(300);
  await page.screenshot({ path: path.join(OUT_DIR, name), fullPage: false });
  console.log(`   • ảnh: ${path.join("docs/evidence/multi-session/S3/target-only", name)}`);
}

async function clickButtonByText(page: Page, text: string, scopeSelector?: string): Promise<boolean> {
  return page.evaluate(
    ({ text, scopeSelector }) => {
      const root = scopeSelector ? document.querySelector(scopeSelector) : document;
      const buttons = [...(root?.querySelectorAll("button") || [])];
      const btn = (buttons.find((b) => (b.textContent || "").trim() === text) ||
        buttons.find((b) => (b.textContent || "").includes(text))) as HTMLButtonElement | undefined;
      if (!btn) return false;
      btn.click();
      return true;
    },
    { text, scopeSelector }
  );
}

async function openTargetTab(page: Page): Promise<boolean> {
  for (let i = 0; i < 8; i++) {
    await clickButtonByText(page, "Chỉ tiêu giao");
    await sleep(600);
    const text = await page.evaluate(() => document.body.innerText);
    if (text.includes("Chỉ tiêu giao — target-only")) return true;
  }
  return false;
}

async function setControlledValue(page: Page, selector: string, value: string) {
  await page.evaluate(
    ({ selector, value }) => {
      const el = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
      if (!el) throw new Error(`Không thấy ${selector}`);
      const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      setter?.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },
    { selector, value }
  );
}

async function main() {
  await waitForServer();
  let token: string;
  try {
    token = await loginToken();
  } catch {
    const account = await prisma.account.findUnique({ where: { username: USERNAME }, select: { id: true, passwordHash: true } });
    if (!account) throw new Error(`Không có account ${USERNAME}.`);
    fs.writeFileSync(HASH_FILE, JSON.stringify({ username: USERNAME, id: account.id, passwordHash: account.passwordHash }), "utf8");
    await prisma.account.update({ where: { id: account.id }, data: { passwordHash: await bcrypt.hash(PASSWORD, 10) } });
    token = await loginToken();
  }
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const tag = `S3-UI-${Date.now()}`;
  let targetId: string | null = null;
  let beforeTargetIds = new Set<string>();

  try {
    const cfg = await newPage(browser, token, 1440, 900);
    await cfg.goto(`${BASE_URL}/giao-ban/cau-hinh`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await cfg.waitForFunction(() => document.body.innerText.includes("Cấu hình số liệu giao ban"), { timeout: 60000 });
    await cfg.waitForNetworkIdle({ idleTime: 500, timeout: 30000 }).catch(() => null);
    await sleep(500);
    const opened = await openTargetTab(cfg);
    check("UI0. Mở được tab Chỉ tiêu giao", opened);
    await cfg.waitForNetworkIdle({ idleTime: 500, timeout: 30000 }).catch(() => null);

    const cfgText = await cfg.evaluate(() => document.body.innerText);
    check("UI1. Target tab dùng manager target-only", cfgText.includes("API /api/metrics/targets") || cfgText.includes("/api/metrics/targets"));
    check("UI2. V3.2/D5-A hiển thị quy tắc THU_NSNN", cfgText.includes("V3.2/D5-A") && cfgText.includes("THU_NSNN"));
    check("UI3. Quyền metrics.config được ghi rõ", cfgText.includes("metrics.config"));

    // Chọn THU_NSNN trong select của manager.
    const selected = await cfg.evaluate(() => {
      const select = [...document.querySelectorAll("select")].find((s) =>
        [...s.options].some((o) => (o.textContent || "").includes("THU_NSNN"))
      ) as HTMLSelectElement | undefined;
      if (!select) return false;
      const opt = [...select.options].find((o) => (o.textContent || "").includes("THU_NSNN"));
      if (!opt) return false;
      select.value = opt.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    });
    check("UI4. Chọn được THU_NSNN", selected);
    await cfg.waitForFunction(() => document.body.innerText.includes("DEMO"), { timeout: 60000 });
    check("UI5. Target DEMO hiện badge riêng", (await cfg.evaluate(() => document.body.innerText)).includes("DEMO"));

    const metric = await prisma.metricDefinition.findFirstOrThrow({ where: { code: "THU_NSNN" } });
    const beforeList = await api("GET", `/api/metrics/targets?metricId=${encodeURIComponent(metric.id)}`, token);
    beforeTargetIds = new Set((beforeList.json.targets || []).map((t: any) => String(t.id)));

    // Điền form tạo target.
    await clickButtonByText(cfg, "Tạo mới");
    await cfg.waitForSelector('input[placeholder="VD: Chỉ tiêu BTC năm 2026"]', { timeout: 30000 });
    await setControlledValue(cfg, 'input[placeholder="VD: Chỉ tiêu BTC năm 2026"]', `${tag} KHAC`);
    await cfg.evaluate((tag) => {
      const selects = [...document.querySelectorAll("select")] as HTMLSelectElement[];
      const labelSelect = selects.find((s) => [...s.options].some((o) => o.value === "KHAC"));
      if (labelSelect) {
        labelSelect.value = "KHAC";
        labelSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
      const year = document.querySelector('input[type="number"]') as HTMLInputElement | null;
      if (year) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(year, "2026");
        year.dispatchEvent(new Event("input", { bubbles: true }));
        year.dispatchEvent(new Event("change", { bubbles: true }));
      }
      const value = document.querySelector('input[placeholder="VD: 1685000000000"]') as HTMLInputElement | null;
      if (value) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(value, "1234");
        value.dispatchEvent(new Event("input", { bubbles: true }));
        value.dispatchEvent(new Event("change", { bubbles: true }));
      }
      const source = document.querySelector('textarea[placeholder="VD: Quyết định giao chỉ tiêu số ... (mock)"]') as HTMLTextAreaElement | null;
      if (source) {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
        setter?.call(source, `${tag} nguồn UI test`);
        source.dispatchEvent(new Event("input", { bubbles: true }));
        source.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return tag;
    }, tag);
    await sleep(300);
    const saved = await clickButtonByText(cfg, "Lưu nháp (PROPOSED)");
    check("UI6. Bấm Lưu nháp (PROPOSED)", saved);
    await cfg.waitForFunction((tag) => document.body.innerText.includes(tag), { timeout: 60000 }, tag);
    await cfg.waitForNetworkIdle({ idleTime: 500, timeout: 30000 }).catch(() => null);

    const list = await api("GET", `/api/metrics/targets?metricId=${encodeURIComponent(metric.id)}`, token);
    const created = (list.json.targets || []).find(
      (t: any) => t.label === `${tag} KHAC` && !beforeTargetIds.has(String(t.id))
    );
    targetId = created?.id || null;
    check("UI7. Target tạo qua UI có trong API", Boolean(targetId));
    check("UI8. Target PROPOSED + D5-A THU_NSNN đã duyệt", created?.status === "PROPOSED" && created?.rules?.officialPercentAllowed === true && created?.rules?.direction === "HIGHER_IS_BETTER" && created?.rules?.baselineScope === "YEAR_START");
    await shot(cfg, "01-cau-hinh-target.png");

    // Confirm row.
    const confirmedClicked = await cfg.evaluate((tag) => {
      const row = [...document.querySelectorAll("tr")].find((tr) => (tr.textContent || "").includes(tag));
      const btn = row ? [...row.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "Xác nhận") : null;
      if (!btn) return false;
      (btn as HTMLButtonElement).click();
      return true;
    }, tag);
    check("UI9. Có nút Xác nhận cho PROPOSED", confirmedClicked);
    await cfg.waitForFunction((tag) => {
      const row = [...document.querySelectorAll("tr")].find((tr) => (tr.textContent || "").includes(tag));
      return Boolean(row && (row.textContent || "").includes("Đã xác nhận"));
    }, { timeout: 60000 }, tag);

    const lockedClicked = await cfg.evaluate((tag) => {
      const row = [...document.querySelectorAll("tr")].find((tr) => (tr.textContent || "").includes(tag));
      const btn = row ? [...row.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "Chốt") : null;
      if (!btn) return false;
      (btn as HTMLButtonElement).click();
      return true;
    }, tag);
    check("UI10. Có nút Chốt cho CONFIRMED", lockedClicked);
    await cfg.waitForFunction((tag) => {
      const row = [...document.querySelectorAll("tr")].find((tr) => (tr.textContent || "").includes(tag));
      return Boolean(row && (row.textContent || "").includes("Đã chốt"));
    }, { timeout: 60000 }, tag);

    const historyClicked = await cfg.evaluate((tag) => {
      const row = [...document.querySelectorAll("tr")].find((tr) => (tr.textContent || "").includes(tag));
      const btn = row ? [...row.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "Lịch sử") : null;
      if (!btn) return false;
      (btn as HTMLButtonElement).click();
      return true;
    }, tag);
    check("UI11. Mở được lịch sử target", historyClicked);
    await cfg.waitForFunction(() => document.body.innerText.includes("Lịch sử chỉ tiêu giao"), { timeout: 30000 });
    const historyText = await cfg.evaluate(() => document.body.innerText);
    check("UI12. Lịch sử có CREATE/CONFIRM/LOCK", ["CREATE", "CONFIRM", "LOCK"].every((a) => historyText.includes(a)));
    await shot(cfg, "02-target-history.png");
    await cfg.close();

    // /giao-ban target display D5.
    const gb = await newPage(browser, token, 1440, 900);
    await gb.goto(`${BASE_URL}/giao-ban`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await gb.waitForFunction(() => document.body.innerText.includes("Số liệu giao ban"), { timeout: 60000 });
    await gb.waitForFunction(
      () => !document.body.innerText.includes("Đang tải số liệu") && document.body.innerText.includes("Thu NSNN"),
      { timeout: 60000 }
    );
    await gb.waitForNetworkIdle({ idleTime: 500, timeout: 30000 }).catch(() => null);
    const gbText = await gb.evaluate(() => document.body.innerText);
    check("UI13. /giao-ban hiển thị target test", gbText.includes(`${tag} KHAC`));
    check("UI14. /giao-ban hiển thị trạng thái Đã chốt", gbText.includes("Đã chốt"));
    check("UI15. /giao-ban không còn '% chờ B-C-3'; chỉ tiêu chưa duyệt ghi lý do", !gbText.includes("% chờ B-C-3") && gbText.includes("Chưa có quy tắc gán chỉ tiêu"));
    await shot(gb, "03-giao-ban-target.png");
    await gb.close();

    // Mobile target tab không tràn trang.
    const mob = await newPage(browser, token, 390, 844, true);
    await mob.goto(`${BASE_URL}/giao-ban/cau-hinh`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await mob.waitForFunction(() => document.body.innerText.includes("Cấu hình số liệu giao ban"), { timeout: 60000 });
    const mobileOpened = await openTargetTab(mob);
    check("UI15a. Mobile mở được tab Chỉ tiêu giao", mobileOpened);
    await mob.waitForNetworkIdle({ idleTime: 500, timeout: 30000 }).catch(() => null);
    const overflow = await mob.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth));
    check("UI16. Mobile target tab không tràn ngang", overflow <= 1, `overflow=${overflow}`);
    await shot(mob, "04-mobile-target.png");
    await mob.close();
  } finally {
    await browser.close();
    // Dọn target test (kể cả LOCKED) + revision/audit; không đụng target khác.
    if (!targetId) {
      const found = await prisma.metricPlanTarget.findFirst({
        where: { label: `${tag} KHAC`, id: { notIn: Array.from(beforeTargetIds) } },
        select: { id: true },
      });
      targetId = found?.id || null;
    }
    if (targetId) {
      await prisma.metricPlanTargetRevision.deleteMany({ where: { targetId } });
      await prisma.metricPlanTarget.deleteMany({ where: { id: targetId } });
      await prisma.auditEvent.deleteMany({
        where: { resourceType: "MetricConfig", resourceId: targetId, action: { startsWith: "METRIC_ADMIN_TARGET_" } },
      });
    }
    // Khôi phục hash cb016 đã lưu trước test.
    if (fs.existsSync(HASH_FILE)) {
      try {
        const saved = JSON.parse(fs.readFileSync(HASH_FILE, "utf8"));
        if (saved.username === USERNAME && saved.passwordHash) {
          await prisma.account.update({ where: { username: USERNAME }, data: { passwordHash: saved.passwordHash } });
          console.log("RESTORE: đã khôi phục mật khẩu", USERNAME);
        }
      } catch (e) {
        console.error("RESTORE PASSWORD FAILED:", e);
      }
    }
    await prisma.$disconnect();
  }

  console.log(`\n[TỔNG HỢP] PASS ${passed}/${passed + failed}, FAIL ${failed}`);
  if (failed > 0) {
    console.log("Failures:", failures.join(" | "));
    process.exitCode = 1;
  }
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
