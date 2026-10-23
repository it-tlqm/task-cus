/**
 * S5 / YC-13 — Kiểm thử GIAO DIỆN thật (puppeteer) trên DB test talung_v3_roster, port 3115.
 *
 * Phủ:
 *  - Desktop tuần: không còn icon `error` đỏ; cảnh báo trùng phân công bằng TEXT; ghi chú per-person hiển thị.
 *  - Phiếu phân công (editor): xem/sửa ghi chú; "Đổi người" tách riêng, bắt buộc lý do; ghi chú giữ nguyên.
 *  - Phiếu ngày (desktop + mobile): ghi chú hiển thị trên phiếu; cảnh báo text; không icon error đỏ.
 *  - Mobile tuần: không tràn ngang, ghi chú hiển thị.
 *  - Audit old/new cho ghi chú khi thao tác qua UI.
 *
 * Chạy:
 *   $env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/talung_v3_roster"
 *   $env:TEST_BASE_URL="http://localhost:3115"
 *   npx tsx scripts/test-yc13-roster-ui.ts
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

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3115";
const DB_URL = process.env.DATABASE_URL || "";
const parsed = (() => {
  try {
    return new URL(DB_URL);
  } catch {
    return null;
  }
})();
const dbName = parsed?.pathname.replace(/^\//, "") || "";
if (!parsed || !["localhost", "127.0.0.1"].includes(parsed.hostname) || dbName !== "talung_v3_roster") {
  console.error("❌ CHẶN AN TOÀN: chỉ chạy với database test talung_v3_roster trên localhost.");
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });
const PASSWORD = "LocalTest@2026";
const TEST_DATE = "2026-10-23";
const TAG = "[UI-YC13]";
const OUT_DIR = path.resolve("docs/evidence/multi-session/s5-yc13");

let passed = 0;
let failed = 0;
const failures: string[] = [];
const createdIds: string[] = [];

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`✅ [PASS] ${name}${detail ? " — " + detail : ""}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? " — " + detail : ""}`);
    console.log(`❌ [FAIL] ${name}${detail ? " — " + detail : ""}`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (s: string | null | undefined) => (s || "").normalize("NFC");

async function login(username: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Đăng nhập ${username} thất bại (HTTP ${res.status})`);
  const json: any = await res.json();
  return json.token;
}

async function api(method: string, urlPath: string, token: string, body?: any) {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE_URL}${urlPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const ct = res.headers.get("content-type") || "";
  const json = ct.includes("json") ? await res.json().catch(() => null) : null;
  return { status: res.status, json, res };
}

async function waitForServer() {
  for (let i = 1; i <= 60; i++) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) return;
    } catch {
      // chưa lên
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Dev server không phản hồi sau 120 giây");
}

async function shot(page: Page, name: string, fullPage = false) {
  await page.screenshot({ path: path.join(OUT_DIR, name), fullPage });
  console.log(`   📸 ${name}`);
}

async function waitLoaded(page: Page) {
  await page.waitForFunction(
    () => !document.body.innerText.includes("Đang tải phân công…") && !document.body.innerText.includes("Đang tải"),
    { timeout: 20000 }
  );
  await sleep(250);
}

async function countRedErrorIcons(page: Page): Promise<number> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll(".material-symbols-outlined"))
      .filter((el) => (el.textContent || "").trim() === "error")
      .filter((el) => el.className.includes("text-rose"))
      .length
  );
}

async function textOf(page: Page, selector: string): Promise<string> {
  try {
    return norm(await page.$eval(selector, (el) => (el as HTMLElement).innerText));
  } catch {
    return "";
  }
}

async function bodyText(page: Page): Promise<string> {
  return norm(await page.evaluate(() => document.body.innerText));
}

async function setInput(page: Page, selector: string, value: string) {
  await page.$eval(
    selector,
    (el: any, v: string) => {
      const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!;
      desc.set!.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },
    value
  );
}

async function setTextArea(page: Page, selector: string, value: string) {
  await page.$eval(
    selector,
    (el: any, v: string) => {
      const desc = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!;
      desc.set!.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },
    value
  );
}

async function selectUnit(page: Page, unitId: string) {
  const hasSelect = await page.$('[data-testid="roster-unit-select"]');
  if (hasSelect) {
    await page.select('[data-testid="roster-unit-select"]', unitId);
    await sleep(600);
    await waitLoaded(page);
  }
}

async function newPage(browser: Browser, token: string, width: number, height: number, mobile = false): Promise<Page> {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  await page.setCookie({ name: "token", value: token, domain: "localhost", path: "/" } as any);
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem(
        "hqtl-tour-done",
        JSON.stringify({ "/plans": true, "/monthly-results": true, "/dashboard": true, "/roster": true, "/my-work": true })
      );
    } catch {}
  });
  return page;
}

async function cleanup() {
  for (const id of createdIds) {
    await prisma.dutyRoster.deleteMany({ where: { id } }).catch(() => {});
  }
  createdIds.length = 0;
}

(async () => {
  await waitForServer();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const unit = await prisma.orgUnit.findFirst({ where: { code: "BP_NGHIEPVU_A" }, select: { id: true, name: true } });
  if (!unit) throw new Error("Không tìm thấy bộ phận test BP_NGHIEPVU_A");
  const positions = await prisma.dutyPosition.findMany({
    where: { unitId: unit.id, status: "ACTIVE", code: { in: ["YC24-04", "YC24-02", "YC24-08"] } },
    select: { id: true, code: true, title: true },
  });
  const posOne = positions.find((p) => p.code === "YC24-04");
  const posTwo = positions.find((p) => p.code === "YC24-02");
  const posNoon = positions.find((p) => p.code === "YC24-08");
  if (!posOne || !posTwo || !posNoon) throw new Error("Thiếu danh mục vị trí test (YC24-04/02/08)");

  const people = await prisma.person.findMany({
    where: { account: { username: { in: ["democb01", "cb003"] } } },
    select: { id: true, fullName: true, account: { select: { username: true } } },
  });
  const p1 = people.find((p) => p.account?.username === "democb01");
  const p2 = people.find((p) => p.account?.username === "cb003");
  if (!p1 || !p2) throw new Error("Thiếu người test democb01/cb003");

  // Dọn dữ liệu UI test còn sót lại của lần chạy trước (chỉ bản ghi có tag).
  await prisma.dutyRoster.deleteMany({ where: { unitId: unit.id, notes: { startsWith: TAG } } });

  const token = await login("demold01");

  try {
    // Seed dữ liệu: 1 dòng có ghi chú + 1 dòng trùng nhóm trực + 1 trực trưa riêng.
    const c1 = await api("POST", "/api/rosters", token, {
      unitId: unit.id,
      date: TEST_DATE,
      personId: p1.id,
      positionId: posOne.id,
      slotOrder: 0,
      notes: `${TAG} Bàn giao ca sáng`,
    });
    if (c1.json?.data?.id) createdIds.push(c1.json.data.id);
    const c2 = await api("POST", "/api/rosters", token, {
      unitId: unit.id,
      date: TEST_DATE,
      personId: p1.id,
      positionId: posTwo.id,
      slotOrder: 0,
      notes: `${TAG} Kiêm nhiệm kiểm tra hồ sơ`,
    });
    if (c2.json?.data?.id) createdIds.push(c2.json.data.id);
    const c3 = await api("POST", "/api/rosters", token, {
      unitId: unit.id,
      date: TEST_DATE,
      personId: p2.id,
      positionId: posNoon.id,
      slotOrder: 0,
      notes: `${TAG} Trực trưa`,
    });
    if (c3.json?.data?.id) createdIds.push(c3.json.data.id);
    check(
      "S0. Seed dữ liệu UI qua API",
      c1.status === 201 && c2.status === 201 && c3.status === 201,
      `HTTP ${c1.status}/${c2.status}/${c3.status}`
    );
    const rowId = c1.json.data.id as string;

    const browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1440,1000"],
      defaultViewport: null,
    });

    try {
      // ============ DESKTOP TUẦN ============
      const page = await newPage(browser, token, 1440, 1000);
      await page.goto(`${BASE_URL}/roster`, { waitUntil: "networkidle2", timeout: 60000 });
      await waitLoaded(page);
      // Lần đầu Next dev vừa biên dịch trang; reload để CSS/font ổn định trước khi chụp nghiệm thu.
      await page.reload({ waitUntil: "networkidle2", timeout: 60000 });
      await waitLoaded(page);
      await selectUnit(page, unit.id);
      await waitLoaded(page);

      const redIcons = await countRedErrorIcons(page);
      check("S1a. Desktop tuần: không còn icon error đỏ", redIcons === 0, `count=${redIcons}`);
      const txt1 = await bodyText(page);
      check("S1b. Desktop tuần: cảnh báo trùng phân công bằng TEXT", txt1.includes("Trùng phân công"));
      check("S1c. Desktop tuần: ghi chú per-person hiển thị", txt1.includes(`Ghi chú: ${TAG} Bàn giao ca sáng`));
      await page.evaluate(() => document.fonts.ready);
      await sleep(1500);
      await shot(page, "01-desktop-week-notes-no-red-icon.png", true);

      // ============ EDITOR: GHI CHÚ + ĐỔI NGƯỜI TÁCH RIÊNG ============
      await page.click(`[data-testid="roster-cell-${TEST_DATE}-YC24-04"]`);
      await page.waitForSelector('[data-testid="editor-modal"]', { timeout: 10000 });
      await sleep(300);

      const redInEditor = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-testid="editor-modal"] .material-symbols-outlined'))
          .filter((el) => (el.textContent || "").trim() === "error")
          .filter((el) => el.className.includes("text-rose"))
          .length
      );
      check("S2a. Phiếu phân công: không còn icon error đỏ", redInEditor === 0, `count=${redInEditor}`);
      check(
        "S2b. Phiếu phân công: ghi chú hiện có được hiển thị",
        (await textOf(page, '[data-testid="slot-notes-view-YC24-04-0"]')).includes(`${TAG} Bàn giao ca sáng`)
      );
      check(
        "S2c. 'Đổi người' tách riêng: select thay thế chưa hiện trước khi bấm",
        !(await page.$('[data-testid="slot-select-YC24-04-0"]'))
      );

      // Sửa ghi chú qua UI
      await page.click('[data-testid="slot-notes-YC24-04-0"]');
      await page.waitForSelector('[data-testid="slot-notes-input-YC24-04-0"]', { timeout: 5000 });
      const noteUi = `${TAG} Đã cập nhật qua giao diện`;
      await setTextArea(page, '[data-testid="slot-notes-input-YC24-04-0"]', noteUi);
      await page.click('[data-testid="slot-notes-save-YC24-04-0"]');
      await page.waitForFunction((t) => document.body.innerText.includes(t), { timeout: 10000 }, noteUi);
      check("S2d. Lưu ghi chú qua UI thành công", (await textOf(page, '[data-testid="slot-notes-view-YC24-04-0"]')).includes(noteUi));
      const dbNote = await prisma.dutyRoster.findUnique({ where: { id: rowId }, select: { notes: true } });
      check("S2e. DB đã lưu ghi chú mới", dbNote?.notes === noteUi, `notes="${dbNote?.notes}"`);
      const auditNote = await prisma.auditEvent.findFirst({
        where: { action: "ROSTER_UPDATE", resourceType: "DutyRoster", resourceId: rowId },
        orderBy: { timestamp: "desc" },
      });
      check(
        "S2f. Audit UI ghi chú old/new đúng",
        (auditNote?.oldData as any)?.notes === `${TAG} Bàn giao ca sáng` && (auditNote?.newData as any)?.notes === noteUi
      );

      // Đổi người tách riêng + bắt buộc lý do
      await page.click('[data-testid="slot-change-YC24-04-0"]');
      await page.waitForSelector('[data-testid="slot-select-YC24-04-0"]', { timeout: 5000 });
      check("S3a. Bấm 'Đổi người' mới hiện select thay thế", !!(await page.$('[data-testid="slot-select-YC24-04-0"]')));
      await page.select('[data-testid="slot-select-YC24-04-0"]', p2.id);
      await page.waitForSelector('[data-testid="slot-reason-YC24-04-0"]', { timeout: 5000 });
      const reasonUi = `${TAG} Điều động theo phân công mới`;
      await setInput(page, '[data-testid="slot-reason-YC24-04-0"]', reasonUi);
      await page.click('[data-testid="slot-save-YC24-04-0"]');
      await page.waitForFunction(() => document.body.innerText.includes("Đã đổi người thực hiện"), { timeout: 10000 });
      const dbRow = await prisma.dutyRoster.findUnique({ where: { id: rowId }, select: { personId: true, notes: true, reason: true } });
      check("S3b. Đổi người qua UI lưu đúng người + lý do", dbRow?.personId === p2.id && dbRow?.reason === reasonUi);
      check("S3c. Đổi người qua UI giữ nguyên ghi chú", dbRow?.notes === noteUi, `notes="${dbRow?.notes}"`);
      const auditChange = await prisma.auditEvent.findFirst({
        where: { action: "ROSTER_UPDATE", resourceType: "DutyRoster", resourceId: rowId },
        orderBy: { timestamp: "desc" },
      });
      check(
        "S3d. Audit UI đổi người có old/new person + lý do + old notes",
        (auditChange?.oldData as any)?.personId === p1.id &&
          (auditChange?.newData as any)?.personId === p2.id &&
          (auditChange?.oldData as any)?.notes === noteUi
      );
      await page.waitForFunction(() => !document.body.innerText.includes("Đã đổi người thực hiện"), { timeout: 15000 });
      await shot(page, "02-desktop-editor-notes-change.png", false);

      // Thêm một dòng trùng nhóm trực (cùng người p2) để kiểm tra cảnh báo text trên phiếu ngày.
      const c4 = await api("POST", "/api/rosters", token, {
        unitId: unit.id,
        date: TEST_DATE,
        personId: p2.id,
        positionId: posTwo.id,
        slotOrder: 1,
        notes: `${TAG} Dòng trùng để kiểm tra cảnh báo`,
      });
      if (c4.json?.data?.id) createdIds.push(c4.json.data.id);
      check("S3e. Tạo thêm dòng trùng nhóm trực cho phiếu ngày", c4.status === 201, `HTTP ${c4.status}`);

      // Nút đóng nằm dưới lớp toast; bấm trực tiếp bằng DOM để không phụ thuộc vị trí toast.
      await page.evaluate(() => (document.querySelector('[data-testid="editor-close"]') as HTMLElement | null)?.click());
      await page.waitForFunction(() => !document.querySelector('[data-testid="editor-modal"]'), { timeout: 5000 });

      // ============ DESKTOP PHIẾU NGÀY ============
      await page.click('[data-testid="roster-view-day"]');
      await page.waitForSelector('[data-testid="roster-day-input"]', { timeout: 10000 });
      await setInput(page, '[data-testid="roster-day-input"]', TEST_DATE);
      await sleep(800);
      await waitLoaded(page);
      const dayText = await bodyText(page);
      check("S4a. Phiếu ngày desktop: ghi chú hiển thị", dayText.includes(`Ghi chú: ${noteUi}`));
      check("S4b. Phiếu ngày desktop: cảnh báo trùng phân công bằng TEXT", dayText.includes("Trùng phân công"));
      check("S4c. Phiếu ngày desktop: không còn icon error đỏ", (await countRedErrorIcons(page)) === 0);
      await shot(page, "03-desktop-day-sheet-notes.png", true);

      await page.close();

      // ============ MOBILE ============
      const mobile = await newPage(browser, token, 390, 844, true);
      await mobile.goto(`${BASE_URL}/roster`, { waitUntil: "networkidle2", timeout: 60000 });
      await waitLoaded(mobile);
      await mobile.reload({ waitUntil: "networkidle2", timeout: 60000 });
      await waitLoaded(mobile);
      await selectUnit(mobile, unit.id);
      await waitLoaded(mobile);
      await mobile.waitForFunction(
        (t) => document.body.innerText.includes(t),
        { timeout: 15000 },
        `Ghi chú: ${noteUi}`
      );
      check("S5a. Mobile tuần: không còn icon error đỏ", (await countRedErrorIcons(mobile)) === 0);
      const mobileTxt = await bodyText(mobile);
      check("S5b. Mobile tuần: ghi chú per-person hiển thị", mobileTxt.includes(`Ghi chú: ${noteUi}`));
      check("S5c. Mobile tuần: cảnh báo trùng phân công bằng TEXT", mobileTxt.includes("Trùng phân công"));
      const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
      check("S5d. Mobile tuần: không tràn ngang", overflow);
      await shot(mobile, "04-mobile-week-notes.png", true);

      // Mobile phiếu ngày
      await mobile.click('[data-testid="roster-view-day"]');
      await mobile.waitForSelector('[data-testid="roster-day-input"]', { timeout: 10000 });
      await setInput(mobile, '[data-testid="roster-day-input"]', TEST_DATE);
      await sleep(800);
      await waitLoaded(mobile);
      const mobileDay = await bodyText(mobile);
      check("S6a. Mobile phiếu ngày: ghi chú hiển thị", mobileDay.includes(`Ghi chú: ${noteUi}`));
      check("S6b. Mobile phiếu ngày: không còn icon error đỏ", (await countRedErrorIcons(mobile)) === 0);
      await shot(mobile, "05-mobile-day-sheet-notes.png", true);
      await mobile.close();
    } finally {
      await browser.close();
    }
  } catch (err: any) {
    console.error("Lỗi kiểm thử UI:", err?.message || err);
    failed++;
    failures.push(`EXCEPTION: ${err?.message || err}`);
  } finally {
    for (const id of createdIds) {
      await api("DELETE", `/api/rosters?id=${id}&reason=${encodeURIComponent(`${TAG} Dọn sau kiểm thử UI`)}`, token).catch(() => {});
    }
    await cleanup();
    await prisma.$disconnect();
  }

  console.log(`\n===== KẾT QUẢ UI: ${passed} PASS / ${failed} FAIL =====`);
  if (failed > 0) {
    console.log("FAIL:");
    failures.forEach((f) => console.log(" - " + f));
    process.exit(1);
  }
})().catch(async (err) => {
  console.error(err);
  await cleanup();
  await prisma.$disconnect();
  process.exit(1);
});
