/**
 * YC-24 — Kiểm thử GIAO DIỆN thật (puppeteer) + chụp ảnh nghiệm thu (môi trường test cục bộ).
 *
 * Phủ các kịch bản người dùng thật (desktop 1440×900 + mobile 390×844):
 *  S1  Phân công 1 người / 1 vị trí qua ma trận tuần
 *  S2  Nhiều người cùng một vị trí (2 ô)
 *  S3  Nhiều nhóm nhiệm vụ trong cùng một ngày
 *  S4  Đổi người thực hiện — bắt buộc lý do (chặn khi thiếu, lưu khi đủ)
 *  S5  Cảnh báo trùng đơn nghỉ đã duyệt (hiện TRƯỚC khi lưu + bảng cảnh báo sau khi lưu)
 *  S6  Cảnh báo trùng phân công trong ngày (hiện TRƯỚC khi lưu + bảng cảnh báo)
 *  S7  Xem theo tuần / theo ngày; lọc theo bộ phận / cán bộ / vị trí; mobile không tràn ngang
 *  S8  Quyền theo vai trò trên UI (Lãnh đạo đơn vị / Cán bộ xem / SYSTEM_ADMIN bị chặn)
 *  S9  Bền vững dữ liệu: F5 + đăng nhập lại
 *  S10 Xuất Excel ngay trên UI (tải file thật về máy, đọc lại kiểm tra nội dung)
 *  S12 Mở danh mục vị trí (không sửa dữ liệu) — lịch sử phân công giữ nguyên
 *  PA-B Bảng phân công độc lập theo TỪNG BỘ PHẬN: chọn bộ phận (quick switch + trạng thái đã/chưa lập),
 *       dữ liệu không lẫn giữa các bộ phận, nhãn/tiêu đề thể hiện đúng bộ phận đang xem.
 *  Dọn sạch dữ liệu test sau khi chạy (qua API + DB cục bộ).
 *
 * Chạy:
 *   $env:DATABASE_URL="postgresql://postgres:postgres@localhost:54329/talung_dev"; $env:DIRECT_URL=$env:DATABASE_URL;
 *   $env:TEST_BASE_URL="http://localhost:3100"; npx tsx scripts/test-yc24-ui.ts
 */
import puppeteer, { Browser, Page } from "puppeteer-core";
import { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";
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
const DB_URL = process.env.DIRECT_URL || process.env.DATABASE_URL || "";
if (!DB_URL.includes("localhost:54329")) {
  console.error("❌ CHẶN AN TOÀN: script chỉ chạy với DB test cục bộ (localhost:54329).");
  process.exit(1);
}
const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });
const PASSWORD = "LocalTest@2026";
const OUT_DIR = path.resolve("demo-ops/screenshots-yc24");
const SUMMARY_FILE = path.resolve("demo-ops/yc24-tests/ui-test-summary.json");

const RANGE_FROM = "2026-10-12";
const RANGE_TO = "2026-10-26";
const WEEK1 = "2026-10-12"; // tuần chứa ngày nghỉ 17/10
const WEEK2 = "2026-10-19"; // tuần chính của kịch bản
const D19 = "2026-10-19";
const D17 = "2026-10-17";

let passed = 0;
let failed = 0;
const failures: string[] = [];

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

async function loginToken(username: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Đăng nhập ${username} thất bại (HTTP ${res.status})`);
  const json: any = await res.json();
  return json.token;
}

async function apiGet(urlPath: string, token: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${BASE_URL}${urlPath}`, { headers: { Authorization: `Bearer ${token}` } });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function apiDelete(urlPath: string, token: string): Promise<number> {
  const res = await fetch(`${BASE_URL}${urlPath}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  return res.status;
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

async function shot(page: Page, name: string, fullPage = false) {
  await page.screenshot({ path: path.join(OUT_DIR, name), fullPage });
  console.log(`   📸 ${name}`);
}

async function waitLoaded(page: Page) {
  await page.waitForFunction(() => !document.body.innerText.includes("Đang tải phân công…"), { timeout: 15000 });
  await sleep(250);
}

async function weekLabelText(page: Page): Promise<string> {
  return await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll("span")).find((s) => (s.textContent || "").trim().startsWith("Tuần "));
    return el ? (el.textContent || "").trim() : "";
  });
}

/** Đi tới tuần chứa ngày targetISO bằng nút kỳ trước/kỳ sau. */
async function gotoWeek(page: Page, targetISO: string): Promise<void> {
  const target = new Date(`${targetISO}T00:00:00`);
  for (let i = 0; i < 10; i++) {
    const label = norm(await weekLabelText(page));
    const m = label.match(/Tuần (\d{1,2})\/(\d{1,2})/);
    if (!m) throw new Error("Không đọc được nhãn tuần: " + label);
    const cur = new Date(target.getFullYear(), Number(m[2]) - 1, Number(m[1]));
    const diff = Math.round((target.getTime() - cur.getTime()) / (7 * 86400000));
    if (diff === 0) {
      await sleep(700); // chờ hiệu ứng tải của lần điều hướng trước bộc lộ rồi mới chờ xong
      await waitLoaded(page);
      return;
    }
    await page.click(diff > 0 ? '[data-testid="roster-next"]' : '[data-testid="roster-prev"]');
    await sleep(700);
  }
  throw new Error("Không tới được tuần mong muốn");
}

/** Bấm ô ma trận mở phiếu phân công (có thử lại nếu bị đua lúc ma trận đang tải lại). */
async function openEditorAt(page: Page, iso: string, code: string): Promise<boolean> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.click(`[data-testid="roster-cell-${iso}-${code}"]`);
    try {
      await page.waitForSelector('[data-testid="editor-modal"]', { timeout: 5000 });
      return true;
    } catch {
      await sleep(600);
    }
  }
  return false;
}

/** Gán giá trị cho input React (date/number/text) theo cách kích hoạt onChange. */
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

async function textOf(page: Page, selector: string): Promise<string> {
  return await page.$eval(selector, (el) => (el as HTMLElement).innerText);
}

/** Đọc text an toàn (không có phần tử → chuỗi rỗng), đã chuẩn hóa NFC. */
async function safeText(page: Page, selector: string): Promise<string> {
  try {
    return norm(await textOf(page, selector));
  } catch {
    return "";
  }
}

/** Panel cảnh báo phân công mặc định thu gọn — mở ra trước khi đọc nội dung. */
async function openWarnings(page: Page): Promise<void> {
  const expanded = await page
    .$eval('[data-testid="roster-warnings-toggle"]', (el) => el.getAttribute("aria-expanded"))
    .catch(() => null);
  if (expanded !== "true") {
    await page.click('[data-testid="roster-warnings-toggle"]');
    await sleep(250);
  }
}

/** Đọc giá trị ô "gốc" của vùng merge (tránh đếm trùng dữ liệu merged) — dùng khi đọc file tải về. */
function rc(addr: string): { r: number; c: number } {
  const m = addr.replace(/\$/g, "").match(/^([A-Z]+)(\d+)$/);
  if (!m) return { r: 0, c: 0 };
  let c = 0;
  for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
  return { r: Number(m[2]), c };
}
function masterTexts(ws: ExcelJS.Worksheet): string[] {
  const merges: string[] = ((ws as any).model?.merges as string[]) || [];
  const skip = new Set<string>();
  for (const mg of merges) {
    const [a, b] = mg.split(":");
    if (!a || !b) continue;
    const p1 = rc(a);
    const p2 = rc(b);
    for (let r = p1.r; r <= p2.r; r++) {
      for (let c = p1.c; c <= p2.c; c++) {
        if (r === p1.r && c === p1.c) continue;
        skip.add(`${r},${c}`);
      }
    }
  }
  const out: string[] = [];
  ws.eachRow((row, rowNum) => {
    row.eachCell({ includeEmpty: false }, (cell, colNum) => {
      if (skip.has(`${rowNum},${colNum}`)) return;
      const v = cell.value;
      if (typeof v === "string") out.push(v);
    });
  });
  return out;
}

async function waitBodyText(page: Page, text: string, timeout = 8000): Promise<boolean> {
  try {
    await page.waitForFunction((t: string) => document.body.innerText.includes(t), { timeout }, text);
    return true;
  } catch {
    return false;
  }
}

async function exists(page: Page, selector: string): Promise<boolean> {
  return (await page.$(selector)) !== null;
}

/** Chờ dải bộ phận sẵn sàng (selector cho nhiều bộ phận / nhãn tĩnh khi chỉ một bộ phận). */
async function waitUnitReady(page: Page, kind: "select" | "static") {
  await page.waitForSelector(
    kind === "select" ? '[data-testid="roster-unit-select"]' : '[data-testid="roster-unit-static"]',
    { timeout: 30000 }
  );
  await sleep(400);
}

/** Đếm số ô ma trận ổn định (chờ hết nhịp tải lại sau khi chọn bộ phận). */
async function countCellsStable(page: Page, expected: number): Promise<number> {
  let n = 0;
  for (let i = 0; i < 12; i++) {
    n = await page.$$eval('[data-testid^="roster-cell-"]', (els) => els.length);
    if (n === expected) return n;
    await sleep(400);
  }
  return n;
}

/** Chọn bộ phận A trên dải chọn bộ phận (bảng phân công theo bộ phận). */
async function selectUnitA(page: Page, unitAId: string) {
  await page.select('[data-testid="roster-unit-select"]', unitAId);
  await sleep(900);
  await waitLoaded(page);
}

let cleanupNeeded = true;

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(SUMMARY_FILE), { recursive: true });

  console.log("=================================================================");
  console.log("YC-24 — KIỂM THỬ GIAO DIỆN (localhost) + CHỤP ẢNH");
  console.log("=================================================================\n");

  // ---------- Dọn dữ liệu test cũ + nạp dữ liệu nền ----------
  const seedCodes = ["YC24-01", "YC24-02", "YC24-03", "YC24-04", "YC24-05", "YC24-06", "YC24-07", "YC24-08"];
  const cleanBefore = await prisma.dutyRoster.deleteMany({
    where: { date: { gte: new Date(2026, 9, 12), lte: new Date(2026, 9, 26, 23, 59, 59) } },
  });
  await prisma.dutyDayInfo.deleteMany({ where: { date: { gte: new Date(2026, 9, 12), lte: new Date(2026, 9, 26, 23, 59, 59) } } });
  await prisma.dutyPosition.deleteMany({ where: { code: { startsWith: "YC24-" }, NOT: { code: { in: seedCodes } } } });
  if (cleanBefore.count > 0) console.log(`• Đã dọn ${cleanBefore.count} bản ghi test cũ (12–26/10).`);

  const aPersons = await prisma.person.findMany({
    where: { status: "ACTIVE", assignments: { some: { isPrimary: true, unit: { code: "BP_NGHIEPVU_A" } } } },
    select: { id: true, fullName: true },
    orderBy: { fullName: "asc" },
    take: 5,
  });
  if (aPersons.length < 4) throw new Error("Cần tối thiểu 4 cán bộ bộ phận Nghiệp vụ A trong DB test");
  const [pa1, pa2, pa3, pa4] = aPersons;

  const leave = await prisma.leaveRequest.findFirst({
    where: { status: "APPROVED", startDate: { lte: new Date(2026, 9, 18, 23, 59, 59) }, endDate: { gte: new Date(2026, 9, 12) } },
    select: { personId: true, type: true, startDate: true, endDate: true, person: { select: { fullName: true } } },
  });
  if (!leave) throw new Error("Không có đơn nghỉ đã duyệt trong tuần 12–18/10 để test cảnh báo");

  const unitB = await prisma.orgUnit.findUniqueOrThrow({ where: { code: "BP_GIAMSAT_B" }, select: { id: true, name: true } });
  const unitA = await prisma.orgUnit.findUniqueOrThrow({ where: { code: "BP_NGHIEPVU_A" }, select: { id: true, name: true } });

  console.log(`• Cán bộ A dùng cho test: ${aPersons.map((p) => p.fullName).join(", ")}`);
  console.log(`• Người có đơn nghỉ: ${leave.person.fullName} (${leave.type})\n`);

  const tLeader = await loginToken("demold01");
  const tStaff = await loginToken("democb01");
  const tAdmin = await loginToken("demoadmin01");

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--window-size=1440,900"],
  });

  const pageErrors: string[] = [];
  pageErrors.length = 0;

  try {
    // =====================================================================
    // P1 — Lãnh đạo đơn vị mở trang (desktop): tuần hiện tại, ma trận đủ nhóm
    // =====================================================================
    console.log("[P1] Lãnh đạo đơn vị — mở /roster (desktop 1440×900)\n");
    const page = await newPage(browser, tLeader, 1440, 900);
    page.on("pageerror", (e) => pageErrors.push(`P1: ${e.message}`));
    await page.goto(`${BASE_URL}/roster`, { waitUntil: "networkidle0", timeout: 60000 });
    await page.waitForSelector('[data-testid="roster-page"]', { timeout: 30000 });
    await waitLoaded(page);
    check("P1a. Trang lịch trực tải được, tiêu đề đúng", (await textOf(page, "h1")).includes("Phân công nhiệm vụ"));
    const week0 = norm(await weekLabelText(page));
    // Tuần hiện tại (Thứ 2 → Chủ nhật) tính động theo ngày chạy — không cứng ngày
    const nowD = new Date();
    const monD = new Date(nowD);
    monD.setDate(nowD.getDate() - ((nowD.getDay() + 6) % 7));
    const sunD = new Date(monD);
    sunD.setDate(monD.getDate() + 6);
    const ddmm = (x: Date) => `${String(x.getDate()).padStart(2, "0")}/${String(x.getMonth() + 1).padStart(2, "0")}`;
    check(`P1b. Mặc định mở tuần hiện tại (${ddmm(monD)}–${ddmm(sunD)})`, week0.includes(ddmm(monD)) && week0.includes(ddmm(sunD)), week0);
    // Phương án B: Lãnh đạo đơn vị có dải chọn bộ phận + trạng thái đã/chưa lập bảng
    await waitUnitReady(page, "select");
    check(
      "P1e. Lãnh đạo đơn vị thấy bộ phận selector + dải trạng thái các bộ phận",
      (await exists(page, '[data-testid="roster-unit-status"]')) && (await exists(page, '[data-testid="roster-unit-chip-BP_NGHIEPVU_A"]'))
    );
    await selectUnitA(page, unitA.id);
    const unitLabel0 = norm(await safeText(page, '[data-testid="roster-unit-label"]'));
    check("P1f. Nhãn 'Bộ phận đang xem' hiển thị đúng bộ phận A", unitLabel0.includes(norm(unitA.name)), unitLabel0);
    const cellCount0 = await countCellsStable(page, 56);
    check("P1c. Ma trận đủ 8 nhóm nhiệm vụ × 7 ngày = 56 ô (bộ phận A)", cellCount0 === 56, `${cellCount0} ô`);
    check("P1d. Nút phân công / danh mục / xuất Excel hiện đủ cho Lãnh đạo đơn vị",
      (await exists(page, '[data-testid="roster-btn-assign"]')) &&
      (await exists(page, '[data-testid="roster-btn-catalog"]')) &&
      (await exists(page, '[data-testid="roster-btn-export"]')));
    await shot(page, "01-roster-week-desktop.png", true);

    // =====================================================================
    // P2–P4 — S1/S2/S3: phân công qua ma trận (tuần 19–25/10)
    // =====================================================================
    console.log("\n[P2–P4] S1/S2/S3 — Phân công qua ma trận tuần 19–25/10\n");
    await gotoWeek(page, WEEK2);
    if (!(await openEditorAt(page, D19, "YC24-04"))) throw new Error("Không mở được phiếu phân công từ ô ma trận");
    const editorTitle = norm(await textOf(page, '[data-testid="editor-title"]'));
    check("P2a. Bấm ô trên ma trận mở phiếu phân công đúng ngày", editorTitle.includes("19/10/2026"), editorTitle);
    const dateVal = await page.$eval('[data-testid="editor-date-input"]', (el: any) => el.value);
    check("P2b. Phiếu phân công hiển thị đúng ngày trên ô đã bấm", dateVal === D19, dateVal);

    await page.select(`[data-testid="slot-select-YC24-04-0"]`, pa2.id);
    await page.click(`[data-testid="slot-save-YC24-04-0"]`);
    check("P2c. Lưu phân công 1 người / 1 vị trí — thông báo thành công", await waitBodyText(page, "Đã phân công nhiệm vụ."));
    await sleep(600);
    const rowText1 = norm(await textOf(page, `[data-testid="slot-row-YC24-04-0"]`));
    check("P2d. Phiếu hiện người vừa phân công vào đúng ô", rowText1.includes(norm(pa2.fullName)), `ô YC24-04: ${pa2.fullName}`);

    // S2 — hai ô cùng vị trí (YC24-02 có 2 ô)
    await page.select(`[data-testid="slot-select-YC24-02-0"]`, pa3.id);
    await page.click(`[data-testid="slot-save-YC24-02-0"]`);
    await waitBodyText(page, "Đã phân công nhiệm vụ.");
    await sleep(500);
    await page.select(`[data-testid="slot-select-YC24-02-1"]`, pa4.id);
    await page.click(`[data-testid="slot-save-YC24-02-1"]`);
    await sleep(700);
    const row02 = norm(await textOf(page, `[data-testid="slot-row-YC24-02-0"]`)) + "\n" + norm(await textOf(page, `[data-testid="slot-row-YC24-02-1"]`));
    check("P3a. Nhiều người cùng một vị trí — 2 ô điền 2 người khác nhau qua UI", row02.includes(norm(pa3.fullName)) && row02.includes(norm(pa4.fullName)));

    // S3 — nhóm nhiệm vụ khác trong cùng ngày
    await page.select(`[data-testid="slot-select-YC24-01-0"]`, pa1.id);
    await page.click(`[data-testid="slot-save-YC24-01-0"]`);
    await sleep(700);
    await page.click('[data-testid="editor-close"]');
    await sleep(500);
    await shot(page, "02-editor-assign.png");
    const c04 = norm(await textOf(page, `[data-testid="roster-cell-${D19}-YC24-04"]`));
    const c02 = norm(await textOf(page, `[data-testid="roster-cell-${D19}-YC24-02"]`));
    const c01 = norm(await textOf(page, `[data-testid="roster-cell-${D19}-YC24-01"]`));
    check("P3b. Ma trận sau phân công: đủ 3 nhóm nhiệm vụ trong ngày 19/10",
      c04.includes(norm(pa2.fullName)) && c02.includes(norm(pa3.fullName)) && c02.includes(norm(pa4.fullName)) && c01.includes(norm(pa1.fullName)));
    await shot(page, "03-matrix-multi.png", true);

    // =====================================================================
    // P5–P6 — S9: F5 và đăng nhập lại — dữ liệu vẫn còn
    // =====================================================================
    console.log("\n[P5–P6] S9 — Bền vững sau F5 và đăng nhập lại\n");
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForSelector('[data-testid="roster-page"]', { timeout: 30000 });
    await waitUnitReady(page, "select");
    await selectUnitA(page, unitA.id);
    await gotoWeek(page, WEEK2);
    const reloadC02 = norm(await textOf(page, `[data-testid="roster-cell-${D19}-YC24-02"]`));
    check("P5. Sau F5 dữ liệu phân công vẫn hiển thị đúng", reloadC02.includes(norm(pa3.fullName)) && reloadC02.includes(norm(pa4.fullName)));

    const tLeader2 = await loginToken("demold01");
    await page.setCookie({ name: "token", value: tLeader2, domain: "localhost", path: "/" } as any);
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForSelector('[data-testid="roster-page"]', { timeout: 30000 });
    await waitUnitReady(page, "select");
    await selectUnitA(page, unitA.id);
    await gotoWeek(page, WEEK2);
    const reloginC04 = norm(await textOf(page, `[data-testid="roster-cell-${D19}-YC24-04"]`));
    check("P6. Đăng nhập lại (phiên mới) dữ liệu vẫn còn", reloginC04.includes(norm(pa2.fullName)));

    // =====================================================================
    // P7 — S4: đổi người thực hiện bắt buộc lý do
    // =====================================================================
    console.log("\n[P7] S4 — Đổi người thực hiện kèm lý do (bắt buộc)\n");
    if (!(await openEditorAt(page, D19, "YC24-04"))) throw new Error("Không mở được phiếu phân công (P7)");
    await page.select(`[data-testid="slot-select-YC24-04-0"]`, pa1.id);
    await sleep(400);
    check("P7a. Chọn người khác → hiện ô nhập lý do thay đổi", await exists(page, '[data-testid="slot-reason-YC24-04-0"]'));
    await page.click(`[data-testid="slot-save-YC24-04-0"]`);
    check("P7b. Thiếu lý do → bị chặn kèm thông báo", await waitBodyText(page, "phải ghi lý do"));
    await setInput(page, `[data-testid="slot-reason-YC24-04-0"]`, "Thay đổi theo phân công của Lãnh đạo đội");
    await page.click(`[data-testid="slot-save-YC24-04-0"]`);
    check("P7c. Đủ lý do → lưu thành công (có lưu vết)", await waitBodyText(page, "Đã đổi người thực hiện (có lưu vết)."));
    await sleep(600);
    const rowChanged = norm(await textOf(page, `[data-testid="slot-row-YC24-04-0"]`));
    check("P7d. Phiếu hiện người mới + lý do gần nhất", rowChanged.includes(norm(pa1.fullName)) && rowChanged.includes("Thay đổi theo phân công"));
    await shot(page, "04-change-reason.png");

    // =====================================================================
    // P8 — S6: trùng phân công (cùng người, 2 vị trí trong ngày) — cảnh báo trước khi lưu
    // =====================================================================
    console.log("\n[P8] S6 — Cảnh báo trùng phân công trong ngày\n");
    await page.select(`[data-testid="slot-select-YC24-05-0"]`, pa1.id);
    await sleep(500);
    const warnBefore = await safeText(page, '[data-testid="slot-warn-YC24-05-0"]');
    check("P8a. Cảnh báo trùng phân công hiện NGAY khi chọn (trước khi lưu)", warnBefore.includes("trùng phân công"));
    await page.click(`[data-testid="slot-save-YC24-05-0"]`);
    await sleep(900);
    await page.click('[data-testid="editor-close"]');
    await sleep(600);
    const warningsCollapsed = await page
      .$eval('[data-testid="roster-warnings-toggle"]', (el) => el.getAttribute("aria-expanded"))
      .catch(() => null);
    check("P8b0. Bảng cảnh báo phân công mặc định thu gọn", warningsCollapsed === "false", String(warningsCollapsed));
    await openWarnings(page);
    const warnPanel = norm(await textOf(page, '[data-testid="roster-warnings"]'));
    check("P8b. Bảng cảnh báo trên trang liệt kê ca trùng", warnPanel.includes(norm(pa1.fullName)) && /được phân công \d+ vị trí trong ngày/.test(warnPanel), warnPanel.slice(0, 120));
    await shot(page, "05-overlap-warning.png", true);

    // =====================================================================
    // P9 — S5: trùng đơn nghỉ đã duyệt (tuần 12–18/10, ngày 17/10)
    // =====================================================================
    console.log("\n[P9] S5 — Cảnh báo trùng đơn nghỉ đã duyệt\n");
    await gotoWeek(page, WEEK1);
    if (!(await openEditorAt(page, D17, "YC24-01"))) throw new Error("Không mở được phiếu phân công (P9)");
    await page.select(`[data-testid="slot-select-YC24-01-0"]`, leave.personId);
    await sleep(500);
    const leaveWarn = await safeText(page, '[data-testid="slot-warn-YC24-01-0"]');
    check("P9a. Cảnh báo đơn nghỉ đã duyệt hiện NGAY khi chọn người (trước khi lưu)", leaveWarn.includes("đơn nghỉ đã duyệt"), leaveWarn.slice(0, 80));
    await page.click(`[data-testid="slot-save-YC24-01-0"]`);
    check("P9b. Vẫn cho lưu (cảnh báo mềm, không chặn)", await waitBodyText(page, "Đã phân công nhiệm vụ."));
    await sleep(800);
    await page.click('[data-testid="editor-close"]');
    await sleep(500);
    await openWarnings(page);
    const leavePanel = norm(await textOf(page, '[data-testid="roster-warnings"]'));
    check("P9c. Bảng cảnh báo ghi rõ người + ngày trùng đơn nghỉ", leavePanel.includes(norm(leave.person.fullName)) && leavePanel.includes("trùng đơn nghỉ đã duyệt"));
    const cell17 = norm(await textOf(page, `[data-testid="roster-cell-${D17}-YC24-01"]`));
    check("P9d. Ma trận hiện người được phân công ngày 17/10", cell17.includes(norm(leave.person.fullName)));
    await shot(page, "06-leave-clash.png", true);

    // =====================================================================
    // P10 — S7: xem theo ngày + nhập thông tin tổng hợp ngày
    // =====================================================================
    console.log("\n[P10] S7 — Xem theo ngày + thông tin tổng hợp ngày\n");
    await gotoWeek(page, WEEK2);
    await page.click('[data-testid="roster-view-day"]');
    await page.waitForSelector('[data-testid="roster-day-form"]', { timeout: 10000 });
    await setInput(page, '[data-testid="roster-day-input"]', D19);
    await sleep(900);
    await waitLoaded(page);
    const formText = norm(await textOf(page, '[data-testid="roster-day-form"]'));
    check("P10a. Phiếu ngày hiển thị đúng ngày 19/10 và đủ người đang phân công (pa1 thay pa2 từ P7)",
      formText.includes("19 tháng 10 năm 2026") && formText.includes(norm(pa1.fullName)) && formText.includes(norm(pa3.fullName)) && formText.includes(norm(pa4.fullName)));
    await setInput(page, '[data-testid="dayinfo-total"]', "24");
    await setInput(page, '[data-testid="dayinfo-present"]', "22");
    await setInput(page, '[data-testid="dayinfo-absent"]', "2");
    await setInput(page, '[data-testid="dayinfo-reason"]', "01 nghỉ phép, 01 đi công tác");
    await page.click('[data-testid="dayinfo-save"]');
    check("P10b. Lưu thông tin tổng hợp ngày thành công", await waitBodyText(page, "Đã lưu thông tin tổng hợp ngày."));
    await sleep(800);
    await waitLoaded(page);
    const totalVal = await page.$eval('[data-testid="dayinfo-total"]', (el: any) => el.value);
    check("P10c. Số liệu tổng hợp ngày được lưu và hiện lại", totalVal === "24", `Tổng số công chức = ${totalVal}`);
    await shot(page, "07-day-view.png", true);

    // =====================================================================
    // P11 — S7: lọc theo bộ phận / cán bộ / vị trí (tuần)
    // =====================================================================
    console.log("\n[P11] S7 — Bộ lọc tuần: bộ phận / cán bộ / vị trí\n");
    await page.click('[data-testid="roster-view-week"]');
    await waitLoaded(page);
    await gotoWeek(page, WEEK2);
    // Phương án B: chuyển sang bộ phận B → bảng của A không còn hiển thị (không lẫn dữ liệu giữa các bộ phận)
    await page.select('[data-testid="roster-unit-select"]', unitB.id);
    await sleep(900);
    await waitLoaded(page);
    const bHasA = await exists(page, `[data-testid="roster-cell-${D19}-YC24-04"]`);
    const bLabel = norm(await safeText(page, '[data-testid="roster-unit-label"]'));
    check(
      "P11a. Chuyển sang bộ phận B → nhãn đổi theo bộ phận + bảng của A không còn hiển thị",
      !bHasA && bLabel.includes(norm(unitB.name)),
      `nhãn="${bLabel}", ô A còn hiển thị=${bHasA}`
    );
    check(
      "P11a2. Bộ phận B (chưa có danh mục) hiện thông báo chưa thiết lập danh mục",
      await exists(page, '[data-testid="roster-empty-catalog"]')
    );
    // Quay lại bộ phận A
    await selectUnitA(page, unitA.id);
    await countCellsStable(page, 56);
    // Lọc theo cán bộ (client)
    await page.select('[data-testid="roster-filter-person"]', pa1.id);
    await sleep(500);
    const pFilter04 = norm(await textOf(page, `[data-testid="roster-cell-${D19}-YC24-04"]`));
    const pFilter02 = norm(await textOf(page, `[data-testid="roster-cell-${D19}-YC24-02"]`));
    check("P11b. Lọc theo cán bộ → chỉ còn dòng của người đó", pFilter04.includes(norm(pa1.fullName)) && pFilter02.includes("—"));
    // Lọc theo vị trí (client)
    await page.select('[data-testid="roster-filter-person"]', "");
    await page.select('[data-testid="roster-filter-position"]', "yc24-pos-04");
    await sleep(500);
    const posFilter04 = norm(await textOf(page, `[data-testid="roster-cell-${D19}-YC24-04"]`));
    const posFilter05 = norm(await textOf(page, `[data-testid="roster-cell-${D19}-YC24-05"]`));
    check("P11c. Lọc theo vị trí → chỉ hiện phân công của vị trí đó", posFilter04.includes(norm(pa1.fullName)) && posFilter05.includes("—"));
    await page.select('[data-testid="roster-filter-position"]', "");
    await sleep(500);
    await shot(page, "08-filters.png");

    // =====================================================================
    // P12 — S12: mở danh mục vị trí (chỉ xem) + S10: xuất Excel tải thật
    // =====================================================================
    console.log("\n[P12] S12/S10 — Danh mục vị trí + xuất Excel ngay trên UI\n");
    await page.click('[data-testid="roster-btn-catalog"]');
    await page.waitForSelector('[data-testid="catalog-modal"]', { timeout: 10000 });
    const catalogCodes = await page.$$eval('[data-testid^="catalog-pos-"]', (els) => els.map((e) => e.getAttribute("data-testid")));
    check("P12a. Danh mục vị trí mở được, đủ 8 vị trí mẫu", catalogCodes.length === 8, catalogCodes.join(", ").slice(0, 120));
    const catText = norm(await textOf(page, '[data-testid="catalog-modal"]'));
    check("P12a2. Danh mục hiển thị ĐÚNG bộ phận đang xem (không lẫn bộ phận khác)", catText.includes(norm(unitA.name)), catText.slice(0, 100));
    check("P12a3. Nút khôi phục 8 vị trí mẫu hiện cho Lãnh đạo đơn vị", await exists(page, '[data-testid="catalog-seed-btn"]'));
    await shot(page, "09-catalog.png");
    await page.click('[data-testid="catalog-close"]');
    await sleep(400);

    await page.click('[data-testid="roster-btn-export"]');
    await page.waitForSelector('[data-testid="export-dialog"]', { timeout: 10000 });
    check(
      "P12a4. Hộp thoại Xuất Excel ghi rõ ĐÚNG bộ phận sẽ xuất (A)",
      norm(await textOf(page, '[data-testid="export-dialog"]')).includes(norm(unitA.name))
    );
    await setInput(page, '[data-testid="export-from"]', D19);
    await setInput(page, '[data-testid="export-to"]', "2026-10-25");
    // Dọn file tải về của lần chạy trước để nhận diện file mới
    for (const f of fs.readdirSync(OUT_DIR)) {
      if (f.endsWith(".xlsx") || f.endsWith(".crdownload")) {
        try { fs.unlinkSync(path.join(OUT_DIR, f)); } catch {}
      }
    }
    // Bật tải file thật về thư mục OUT_DIR qua CDP
    const beforeFiles = new Set(fs.readdirSync(OUT_DIR));
    const cdp = await page.createCDPSession();
    await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: OUT_DIR, eventsEnabled: true } as any);
    const respP = page.waitForResponse((r) => r.url().includes("/api/rosters/export") && r.request().method() === "GET", { timeout: 30000 });
    await page.click('[data-testid="export-download"]');
    const exportResp = await respP;
    check("P12b. Gọi API xuất Excel từ UI thành công (HTTP 200)", exportResp.status() === 200, `HTTP ${exportResp.status()}`);
    check("P12c. Thông báo tạo file thành công", await waitBodyText(page, "Đã tạo file Excel phân công."));
    await shot(page, "10-export-dialog.png");

    // Chờ file tải về máy
    let dlFile: string | null = null;
    for (let i = 0; i < 16 && !dlFile; i++) {
      await sleep(600);
      const now = fs.readdirSync(OUT_DIR).filter((f) => !beforeFiles.has(f) && !f.endsWith(".png") && !f.endsWith(".crdownload"));
      if (now.length > 0) dlFile = now[0];
    }
    check("P12d. File .xlsx tải thật về máy từ nút Xuất Excel", !!dlFile, dlFile || "(không thấy file mới)");
    if (dlFile) {
      const dlPath = path.join(OUT_DIR, dlFile);
      await sleep(1200); // chờ Chrome ghi xong
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(dlPath);
      const names = wb.worksheets.map((w) => w.name);
      const texts = wb.worksheets.flatMap((ws) => masterTexts(ws));
      const joined = norm(texts.join("\n"));
      const day19 = (joined.match(/Ngày 19 tháng 10 năm 2026/g) || []).length;
      check("P12e. File tải về đúng cấu trúc mẫu (bìa + trang khối in, ngày 19/10 xuất đúng 1 lần)",
        names[0] === "Bìa" && names.length >= 3 && day19 === 1,
        `${names.join(" | ")} — ngày 19/10: ${day19}`);
      check("P12f. Nội dung file tải về có tên người vừa phân công + tiêu đề nhiệm vụ",
        joined.includes(norm(pa1.fullName)) && joined.includes("Trả hồ sơ hải quan"));
      check(
        "P12g. File tải về có tiêu đề thể hiện đúng bộ phận A (không hardcode 'Bộ phận Nghiệp vụ')",
        joined.includes(`PHÂN CÔNG NHIỆM VỤ ${norm(unitA.name).toUpperCase()}`),
        unitA.name
      );
      fs.renameSync(dlPath, path.join(OUT_DIR, "ui-export-download.xlsx"));
      console.log("   📄 Đã lưu file tải về: ui-export-download.xlsx");
    }
    await page.click('[data-testid="export-dialog"] [aria-label="Đóng"]').catch(() => {});

    // =====================================================================
    // P13 — S8: Cán bộ (STAFF) chỉ xem — không có nút điều chỉnh
    // =====================================================================
    console.log("\n[P13] S8 — Cán bộ chỉ xem, không có quyền sửa trên UI\n");
    const staffPage = await newPage(browser, tStaff, 1440, 900);
    staffPage.on("pageerror", (e) => pageErrors.push(`P13: ${e.message}`));
    await staffPage.goto(`${BASE_URL}/roster`, { waitUntil: "networkidle0", timeout: 60000 });
    await staffPage.waitForSelector('[data-testid="roster-matrix"]', { timeout: 30000 });
    await waitUnitReady(staffPage, "static");
    await waitLoaded(staffPage);
    const staffCells = await countCellsStable(staffPage, 56);
    check("P13a. Cán bộ xem được ma trận tuần (mặc định đúng bộ phận của mình)", staffCells === 56, `${staffCells} ô`);
    const staffLabel = norm(await safeText(staffPage, '[data-testid="roster-unit-static"]'));
    check(
      "P13d. Cán bộ thấy nhãn bộ phận tĩnh (không có selector chuyển bộ phận)",
      staffLabel.includes(norm(unitA.name)) && !(await exists(staffPage, '[data-testid="roster-unit-select"]')),
      staffLabel
    );
    check("P13b. Cán bộ KHÔNG có nút Phân công / Danh mục / Xuất Excel",
      !(await exists(staffPage, '[data-testid="roster-btn-assign"]')) &&
      !(await exists(staffPage, '[data-testid="roster-btn-catalog"]')) &&
      !(await exists(staffPage, '[data-testid="roster-btn-export"]')));
    await staffPage.click(`[data-testid="roster-cell-${D19}-YC24-01"]`).catch(() => {});
    await sleep(500);
    check("P13c. Bấm ô trên ma trận của cán bộ KHÔNG mở phiếu chỉnh sửa", !(await exists(staffPage, '[data-testid="editor-modal"]')));
    await shot(staffPage, "11-staff-view.png", true);
    await staffPage.close();

    // =====================================================================
    // P14 — S8: SYSTEM_ADMIN bị chặn
    // =====================================================================
    console.log("\n[P14] S8 — SYSTEM_ADMIN bị chặn truy cập nghiệp vụ\n");
    const adminPage = await newPage(browser, tAdmin, 1440, 900);
    adminPage.on("pageerror", (e) => pageErrors.push(`P14: ${e.message}`));
    await adminPage.goto(`${BASE_URL}/roster`, { waitUntil: "networkidle0", timeout: 60000 });
    await adminPage.waitForSelector('[data-testid="roster-page"]', { timeout: 30000 });
    const adminToast = await waitBodyText(adminPage, "Quản trị kỹ thuật không có quyền xem lịch trực", 8000);
    const adminCells = await adminPage.$$eval('[data-testid^="roster-cell-"]', (els) => els.length);
    check("P14. SYSTEM_ADMIN nhận thông báo bị chặn và không thấy dữ liệu nghiệp vụ", adminToast && adminCells === 0, `toast=${adminToast}, ô=${adminCells}`);
    await shot(adminPage, "12-admin-blocked.png");
    await adminPage.close();

    // =====================================================================
    // P15 — S7: mobile 390×844 — không tràn ngang, xem/chỉnh trong quyền
    // =====================================================================
    console.log("\n[P15] S7 — Mobile 390×844 không tràn ngang\n");
    const mPage = await newPage(browser, tLeader, 390, 844, true);
    mPage.on("pageerror", (e) => pageErrors.push(`P15: ${e.message}`));
    await mPage.goto(`${BASE_URL}/roster`, { waitUntil: "networkidle0", timeout: 60000 });
    await mPage.waitForSelector('[data-testid="roster-mobile"]', { timeout: 30000 });
    await waitUnitReady(mPage, "select");
    await selectUnitA(mPage, unitA.id);
    const mLabel = norm(await safeText(mPage, '[data-testid="roster-unit-label"]'));
    check("P15g. Mobile hiển thị rõ bộ phận đang xem (A)", mLabel.includes(norm(unitA.name)), mLabel);
    await gotoWeek(mPage, WEEK2);
    const ovf1 = await mPage.evaluate(() => ({ sw: document.scrollingElement!.scrollWidth, iw: window.innerWidth }));
    check("P15a. Tuần mobile: không tràn ngang", ovf1.sw <= ovf1.iw + 2, `scrollWidth=${ovf1.sw}, viewport=${ovf1.iw}`);
    check("P15b. Thẻ ngày 19/10 hiện phân công vừa lưu", norm(await textOf(mPage, `[data-testid="roster-day-card-${D19}"]`)).includes(norm(pa1.fullName)));
    await shot(mPage, "13-mobile-week.png", true);
    // Mở ngày từ thẻ
    const dayCardEl = await mPage.$(`[data-testid="roster-day-card-${D19}"]`);
    await dayCardEl!.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await sleep(400);
    const cardBtns = await mPage.$$(`[data-testid="roster-day-card-${D19}"] button`);
    await cardBtns[0].click();
    await mPage.waitForSelector('[data-testid="roster-day-form"]', { timeout: 10000 });
    await sleep(600);
    const ovf2 = await mPage.evaluate(() => ({ sw: document.scrollingElement!.scrollWidth, iw: window.innerWidth }));
    check("P15c. Phiếu ngày mobile: không tràn ngang", ovf2.sw <= ovf2.iw + 2, `scrollWidth=${ovf2.sw}`);
    check("P15d. Phiếu ngày mobile có dữ liệu + nút chỉnh sửa trong quyền Lãnh đạo", (await exists(mPage, '[data-testid="roster-btn-edit-day"]')));
    await shot(mPage, "14-mobile-day.png", true);
    const editDayBtn = await mPage.$('[data-testid="roster-btn-edit-day"]');
    await editDayBtn!.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await sleep(300);
    await editDayBtn!.click();
    await mPage.waitForSelector('[data-testid="editor-modal"]', { timeout: 10000 });
    const ovf3 = await mPage.evaluate(() => ({ sw: document.scrollingElement!.scrollWidth, iw: window.innerWidth }));
    check("P15e. Phiếu phân công mobile mở được, không tràn ngang", ovf3.sw <= ovf3.iw + 2, `scrollWidth=${ovf3.sw}`);
    await mPage.click('[data-testid="editor-close"]');
    await mPage.close();
    // Cán bộ trên mobile: không có nút phân công trong thẻ ngày
    const mStaff = await newPage(browser, tStaff, 390, 844, true);
    mStaff.on("pageerror", (e) => pageErrors.push(`P15f: ${e.message}`));
    await mStaff.goto(`${BASE_URL}/roster`, { waitUntil: "networkidle0", timeout: 60000 });
    await mStaff.waitForSelector('[data-testid="roster-mobile"]', { timeout: 30000 });
    await waitUnitReady(mStaff, "static");
    await waitLoaded(mStaff);
    const assignBtns = await mStaff.$$eval('[data-testid^="roster-day-assign-"]', (els) => els.length);
    check("P15f. Cán bộ trên mobile không có nút phân công trong thẻ ngày", assignBtns === 0, `${assignBtns} nút`);
    await mStaff.close();

    // =====================================================================
    // P16 — Dọn dẹp
    // =====================================================================
    console.log("\n[P16] Dọn dẹp dữ liệu test\n");
    const tClean = await loginToken("demold01");
    let delOk = 0;
    for (const u of [unitA.id, unitB.id]) {
      const list = await apiGet(`/api/rosters?from=${RANGE_FROM}&to=${RANGE_TO}&unitId=${u}`, tClean);
      for (const r of list.json?.data || []) {
        const st = await apiDelete(`/api/rosters?id=${r.id}&reason=Dọn dẹp sau kiểm thử giao diện`, tClean);
        if (st === 200) delOk++;
      }
    }
    const leftAfterApi = (await prisma.dutyRoster.count({ where: { date: { gte: new Date(2026, 9, 12), lte: new Date(2026, 9, 26, 23, 59, 59) } } }));
    await prisma.dutyRoster.deleteMany({ where: { date: { gte: new Date(2026, 9, 12), lte: new Date(2026, 9, 26, 23, 59, 59) } } });
    await prisma.dutyDayInfo.deleteMany({ where: { date: { gte: new Date(2026, 9, 12), lte: new Date(2026, 9, 26, 23, 59, 59) } } });
    const posCount = await prisma.dutyPosition.count();
    const finalList = await apiGet(`/api/rosters?from=${RANGE_FROM}&to=${RANGE_TO}&unitId=${unitA.id}`, tClean);
    check("P16a. Dọn sạch phân công test qua API", leftAfterApi === 0 && (finalList.json?.data || []).length === 0, `xóa ${delOk} bản ghi, còn lại ${leftAfterApi}`);
    check("P16b. Danh mục vẫn nguyên 8 vị trí mẫu (UI chỉ xem, không sửa)", posCount === 8, `${posCount} vị trí`);
    cleanupNeeded = false;

    // ---------- Lỗi trang ----------
    check("P17. Không có lỗi runtime (uncaught) trên các trang đã kiểm thử", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | ") || "không có");
  } finally {
    await browser.close();
  }

  const summary = { passed, failed, failures, at: new Date().toISOString() };
  fs.writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2));
  console.log("\n=================================================================");
  console.log(`KẾT QUẢ UI: ${passed} PASS / ${failed} FAIL`);
  if (failed > 0) {
    console.log("Các mục FAIL:");
    for (const f of failures) console.log("  - " + f);
  }
  console.log("=================================================================");
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error("❌ LỖI CHẠY TEST UI:", e.message);
  if (cleanupNeeded) {
    try {
      const t = await loginToken("demold01");
      const list = await apiGet(`/api/rosters?from=${RANGE_FROM}&to=${RANGE_TO}&unitId=${unitA.id}`, t);
      for (const r of list.json?.data || []) {
        await apiDelete(`/api/rosters?id=${r.id}&reason=Dọn dẹp sau kiểm thử giao diện (lỗi giữa chừng)`, t);
      }
      await prisma.dutyRoster.deleteMany({ where: { date: { gte: new Date(2026, 9, 12), lte: new Date(2026, 9, 26, 23, 59, 59) } } });
      await prisma.dutyDayInfo.deleteMany({ where: { date: { gte: new Date(2026, 9, 12), lte: new Date(2026, 9, 26, 23, 59, 59) } } });
      console.log("• Đã dọn dữ liệu test do lỗi giữa chừng.");
    } catch {}
  }
  await prisma.$disconnect();
  process.exit(1);
});
