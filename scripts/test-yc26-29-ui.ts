/**
 * test-yc26-29-ui.ts — Kiểm thử GIAO DIỆN thật (puppeteer) cho gói YC-26 → YC-29.
 *
 * Kịch bản:
 *  S1  YC-27: tìm CB-014 trong ô chọn người mới (tìm theo mã và theo tên KHÔNG DẤU), thấy đơn vị công tác
 *  S2  YC-28: chọn nhiều chỉ tiêu bằng checkbox — mặc định KHÔNG chọn sẵn, tìm kiếm, lọc nhóm,
 *      chọn tất cả đang lọc / bỏ chọn trong phạm vi lọc, đếm số đã chọn, bước xác nhận trước khi lưu,
 *      lưu hàng loạt, F5 giữ nguyên
 *  S3  YC-26: bảng so sánh kết quả thu trên trang Số liệu giao ban (đủ 5 dòng, "Chưa có dữ liệu đối chiếu",
 *      không lộ nhãn [DEMO])
 *  S4  YC-29: bảng Dashboard (Trong ngày/Tuần/Lũy kế tháng/Lũy kế năm/Trạng thái), "—" ≠ 0,
 *      đối chiếu số với API, F5 + đăng nhập lại
 *  S5  Mobile 390×844: trang không tràn ngang, bảng cuộn trong khung, ô chọn người/chỉ tiêu dùng được
 *  S6  Phân quyền: cán bộ thường không mở được Cấu hình số liệu; vẫn xem được Dashboard
 *  S7  P0: cảnh báo mềm khi nhập giá trị bất thường (banner trên trang nhập liệu, không chặn lưu)
 *
 * Chạy:
 *   $env:DATABASE_URL="postgresql://postgres:postgres@localhost:54329/talung_dev"; $env:DIRECT_URL=$env:DATABASE_URL;
 *   npx tsx scripts/test-yc26-29-ui.ts
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
const DB_URL = process.env.DIRECT_URL || process.env.DATABASE_URL || "";
if (!DB_URL.includes("localhost:54329")) {
  console.error("❌ CHẶN AN TOÀN: script chỉ chạy với DB test cục bộ (localhost:54329).");
  process.exit(1);
}
const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });
const PASSWORD = "LocalTest@2026";
const OUT_DIR = path.resolve("demo-ops/screenshots-yc2629");
const SUMMARY_FILE = path.resolve("demo-ops/yc2629-tests/ui-summary.json");
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(path.dirname(SUMMARY_FILE), { recursive: true });

let passed = 0;
let failed = 0;
const failures: string[] = [];
const startedAt = new Date();

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
const norm = (s: string | null | undefined) => (s || "").replace(/\s+/g, " ").trim();

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

async function apiJson(pathname: string, token: string, method = "GET", body?: any) {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE_URL}${pathname}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function newPage(browser: Browser, token: string, width: number, height: number, mobile = false): Promise<Page> {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  await page.setCookie({ name: "token", value: token, domain: "localhost", path: "/" } as any);
  page.setDefaultTimeout(25000);
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem(
        "hqtl-tour-done",
        JSON.stringify({
          "/plans": true,
          "/monthly-results": true,
          "/dashboard": true,
          "/roster": true,
          "/my-work": true,
          "/giao-ban": true,
          "/giao-ban/nhap": true,
          "/giao-ban/cau-hinh": true,
        })
      );
    } catch {}
  });
  return page;
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(OUT_DIR, name) });
  console.log(`   📸 ${name}`);
}

async function exists(page: Page, sel: string): Promise<boolean> {
  return (await page.$(sel)) !== null;
}
/** Bấm bằng evaluate để tránh bị re-render/overlay chen ngang. */
async function eClick(page: Page, sel: string): Promise<boolean> {
  return await page.evaluate((s) => {
    const el = document.querySelector(s) as HTMLElement | null;
    if (!el) return false;
    el.click();
    return true;
  }, sel);
}
async function textOf(page: Page, sel: string): Promise<string> {
  return await page.$eval(sel, (el: any) => el.innerText || el.textContent || "").catch(() => "");
}
async function clickText(page: Page, selector: string, text: string): Promise<boolean> {
  return await page.evaluate(
    (sel, t) => {
      const els = Array.from(document.querySelectorAll(sel)) as HTMLElement[];
      const el = els.find((e) => (e.innerText || e.textContent || "").includes(t));
      if (!el) return false;
      el.click();
      return true;
    },
    selector,
    text
  );
}
async function pageOverflowX(page: Page): Promise<{ scrollWidth: number; clientWidth: number }> {
  return await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
}
async function setNativeValue(page: Page, sel: string, value: string) {
  await page.$eval(
    sel,
    (el: any, v) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
      setter.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    value
  );
}

async function main() {
  // ----- dữ liệu nền -----
  const leader = await loginToken("demold01");
  const staff = await loginToken("democb01");
  const cb = await prisma.person.findFirstOrThrow({ where: { code: "CB-014" } });
  const herBefore = await prisma.metricEntryAssignment.findMany({ where: { personId: cb.id, metricId: { not: null } } });
  const herMetricIds = new Set(herBefore.map((a) => a.metricId));
  const freeMetrics = await prisma.metricDefinition.findMany({
    where: { active: true, id: { notIn: Array.from(herMetricIds).filter(Boolean) as string[] } },
    orderBy: { code: "asc" },
    take: 3,
  });
  if (freeMetrics.length < 2) throw new Error("Không đủ chỉ tiêu trống để test UI");
  const testMetricA = freeMetrics[0];
  const testMetricB = freeMetrics[1];

  const summary = await apiJson("/api/metrics/summary?scope=dashboard&year=2026&month=10&week=42&quarter=4", leader);
  const thuDash = (summary.json?.groups || []).flatMap((g: any) => g.metrics).find((m: any) => m.code === "THU_NSNN");
  const scale = thuDash?.displayScale || 1;
  const dec = thuDash?.decimals || 0;
  const fmtCell = (v: number | null) =>
    v === null || v === undefined ? "—" : (v / scale).toLocaleString("vi-VN", { minimumFractionDigits: dec, maximumFractionDigits: dec });

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--lang=vi-VN"],
  });

  try {
    // ============================================================
    // S1 — YC-27: tìm CB-014 (desktop)
    // ============================================================
    console.log("\n[S1] YC-27 — Tìm cán bộ CB-014 trong ô chọn người");
    const p1 = await newPage(browser, leader, 1440, 900);
    await p1.goto(`${BASE_URL}/giao-ban/cau-hinh`, { waitUntil: "networkidle0", timeout: 90000 });
    await p1.waitForFunction(() => document.body.innerText.includes("Phân công nhập"), { timeout: 30000 });
    await clickText(p1, "button", "Phân công nhập");
    await p1.waitForSelector('[data-testid="assign-person-button"]', { timeout: 20000 });

    await eClick(p1, '[data-testid="assign-person-button"]');
    await p1.waitForSelector('[data-testid="assign-person-search"]', { timeout: 10000 });
    await p1.type('[data-testid="assign-person-search"]', "be hoai chau", { delay: 15 });
    await p1.waitForSelector('[data-testid="assign-person-option-CB-014"]', { timeout: 10000 });
    const optText = norm(await textOf(p1, '[data-testid="assign-person-option-CB-014"]'));
    check("S1a. Gõ tên KHÔNG DẤU vẫn tìm thấy CB-014", optText.includes("Bế Hoài Châu"), optText);
    check("S1b. Kết quả kèm đơn vị công tác", optText.includes("Kế toán, MGH"), optText);
    await shot(p1, "S1_yc27_tim_cb014.png");

    await eClick(p1, '[data-testid="assign-person-option-CB-014"]');
    const personBtnText = norm(await textOf(p1, '[data-testid="assign-person-button"]'));
    check("S1c. Chọn xong hiển thị đúng 'CB-014 — Bế Hoài Châu'", personBtnText.includes("CB-014 — Bế Hoài Châu"), personBtnText);

    await eClick(p1, '[data-testid="assign-person-button"]');
    await setNativeValue(p1, '[data-testid="assign-person-search"]', "");
    await p1.type('[data-testid="assign-person-search"]', "CB-014", { delay: 15 });
    await p1.waitForSelector('[data-testid="assign-person-option-CB-014"]', { timeout: 10000 });
    check("S1d. Tìm theo MÃ CB-014 cũng ra đúng người", true);
    await eClick(p1, '[data-testid="assign-person-option-CB-014"]');

    // ============================================================
    // S2 — YC-28: chọn nhiều chỉ tiêu + xác nhận + lưu + F5
    // ============================================================
    console.log("\n[S2] YC-28 — Bộ chọn nhiều chỉ tiêu");
    await p1.select('[data-testid="assign-scope-select"]', "metric");
    await p1.waitForSelector('[data-testid="assign-metric-picker"]', { timeout: 10000 });
    const count0 = norm(await textOf(p1, '[data-testid="assign-selected-count"]'));
    check("S2a. Mặc định KHÔNG chọn sẵn chỉ tiêu nào (không tự chọn cả 49)", count0 === "0", `count=${count0}`);

    const confirmChecked = await p1.evaluate(() => {
      const labels = Array.from(document.querySelectorAll("label"));
      const l = labels.find((x) => (x.innerText || "").includes("Được xác nhận"));
      const input = l?.querySelector("input") as HTMLInputElement | null;
      return input ? input.checked : null;
    });
    check("S2b. Không tự bật 'Được xác nhận' cho hàng loạt", confirmChecked === false, `checked=${confirmChecked}`);

    await p1.type('[data-testid="assign-metric-search"]', "thu nsnn", { delay: 15 });
    check("S2c. Tìm chỉ tiêu không dấu theo tên/mã", await exists(p1, '[data-testid="assign-metric-THU_NSNN"]'));
    await setNativeValue(p1, '[data-testid="assign-metric-search"]', "");
    await sleep(200);

    // lọc theo nhóm của testMetricA rồi chọn cả nhóm
    await p1.select('[data-testid="assign-metric-picker"] select', testMetricA.groupId || "__all");
    await sleep(200);
    const selectAllText = norm(await textOf(p1, '[data-testid="assign-select-all"]'));
    const nInScope = Number((selectAllText.match(/\((\d+)\)/) || [])[1] || "0");
    check("S2d. Nút chọn tất cả hiển thị đúng số lượng chỉ tiêu đang lọc", nInScope >= 1, `n=${nInScope}`);
    await eClick(p1, '[data-testid="assign-select-all"]');
    await sleep(200);
    const countAll = norm(await textOf(p1, '[data-testid="assign-selected-count"]'));
    check("S2e. 'Chọn tất cả đang lọc' chọn đúng N chỉ tiêu trong phạm vi", countAll === String(nInScope), `count=${countAll} expected=${nInScope}`);
    await eClick(p1, '[data-testid="assign-clear-scope"]');
    await sleep(200);
    const countClear = norm(await textOf(p1, '[data-testid="assign-selected-count"]'));
    check("S2f. 'Bỏ chọn trong phạm vi lọc' đưa về 0", countClear === "0", `count=${countClear}`);
    await p1.select('[data-testid="assign-metric-picker"] select', "__all");
    await sleep(200);

    // chọn đúng 2 chỉ tiêu trống của CB-014
    for (const m of [testMetricA, testMetricB]) {
      await setNativeValue(p1, '[data-testid="assign-metric-search"]', "");
      await p1.type('[data-testid="assign-metric-search"]', m.code, { delay: 10 });
      await sleep(200);
      await eClick(p1, `[data-testid="assign-metric-${m.code}"]`);
    }
    await sleep(200);
    const count2 = norm(await textOf(p1, '[data-testid="assign-selected-count"]'));
    check("S2g. Đếm đúng số chỉ tiêu đã chọn (2)", count2 === "2", `count=${count2}`);
    await shot(p1, "S2_yc28_chon_nhieu_chi_tieu.png");

    await eClick(p1, '[data-testid="assign-submit"]');
    await p1.waitForSelector('[data-testid="assign-confirm-bar"]', { timeout: 10000 });
    const confirmText = norm(await textOf(p1, '[data-testid="assign-confirm-bar"]'));
    check("S2h. Có bước xác nhận rõ ràng trước khi lưu", confirmText.includes("Xác nhận lưu phân công") && confirmText.includes("2"), confirmText);
    await shot(p1, "S2b_yc28_xac_nhan_luu.png");

    await eClick(p1, '[data-testid="assign-confirm-save"]');
    await p1.waitForFunction(() => document.body.innerText.includes("Đã lưu phân công"), { timeout: 20000 });
    await sleep(1500);
    const countAfterSave = norm(await textOf(p1, '[data-testid="assign-selected-count"]'));
    check("S2i. Lưu xong ô chọn được xoá trắng (0)", countAfterSave === "0", `count=${countAfterSave}`);

    const dbNew = await prisma.metricEntryAssignment.findMany({
      where: { personId: cb.id, metricId: { in: [testMetricA.id, testMetricB.id] }, createdAt: { gte: startedAt } },
    });
    check("S2j. DB có đúng 2 phân công mới cho CB-014", dbNew.length === 2, `rows=${dbNew.length}`);
    const dbDup = await prisma.metricEntryAssignment.count({ where: { personId: cb.id, metricId: testMetricA.id } });
    check("S2k. Không sinh bản ghi trùng", dbDup === 1, `rows=${dbDup}`);

    await p1.reload({ waitUntil: "networkidle0" });
    await clickText(p1, "button", "Phân công nhập");
    await p1.waitForSelector('[data-testid="assign-person-button"]', { timeout: 20000 });
    const tableText = norm(await p1.evaluate(() => document.body.innerText));
    check(
      "S2l. F5 xong bảng phân công hiển thị 2 chỉ tiêu vừa gán",
      tableText.includes(testMetricA.name) && tableText.includes(testMetricB.name),
      `${testMetricA.name} / ${testMetricB.name}`
    );

    // ============================================================
    // S3 — YC-26: bảng so sánh (desktop)
    // ============================================================
    console.log("\n[S3] YC-26 — Bảng so sánh kết quả thu");
    const p2 = await newPage(browser, leader, 1440, 900);
    await p2.goto(`${BASE_URL}/giao-ban`, { waitUntil: "networkidle0", timeout: 90000 });
    await p2.waitForSelector('[data-testid="comparison-section"]', { timeout: 30000 });
    const compText = norm(await textOf(p2, '[data-testid="comparison-section"]'));
    for (const label of [
      "Chỉ tiêu Bộ Tài chính (năm)",
      "Chỉ tiêu UBND tỉnh (năm)",
      "Kế hoạch tháng",
      "So với tháng trước",
      "So với cùng kỳ năm trước",
    ]) {
      check(`S3. Có dòng "${label}"`, compText.includes(label));
    }
    check("S3a. Chưa có nguồn đối chiếu → hiển thị 'Chưa có dữ liệu đối chiếu'", compText.includes("Chưa có dữ liệu đối chiếu"));
    check("S3b. Không hiển thị nhãn dữ liệu [DEMO] như số liệu chính thức", !compText.toUpperCase().includes("[DEMO"));
    // YC-26 (bổ sung): cảnh báo DEMO + nhãn quy tắc chờ xác nhận + chip chỉ tiêu DEMO
    check("S3c. Cảnh báo dữ liệu DEMO hiển thị tại khu vực số liệu", await exists(p2, '[data-testid="data-quality-warning"]'));
    const dqText = norm(await textOf(p2, '[data-testid="data-quality-warning"]'));
    check(
      "S3d. Cảnh báo nêu rõ 'không sử dụng làm số liệu báo cáo chính thức'",
      dqText.includes("không sử dụng làm số liệu báo cáo chính thức"),
      dqText.slice(0, 120)
    );
    check(
      "S3e. Nhãn quy tắc đối chiếu 'CHƯA XÁC NHẬN' hiển thị ở bảng so sánh",
      norm(await textOf(p2, '[data-testid="comparison-rule-pending"]')).includes("CHƯA XÁC NHẬN")
    );
    const demoChips = await p2.$$eval('[data-testid^="target-demo-"]', (els) => els.map((e) => (e.textContent || "").trim()));
    check(
      "S3f. Chỉ tiêu giao DEMO không hiển thị như chỉ tiêu chính thức (nhãn Demo, không khoe %)",
      demoChips.length > 0 && demoChips.every((t) => t.startsWith("Demo") && !t.includes("%")),
      `${demoChips.length} chip, ví dụ: ${demoChips.slice(0, 2).join(" · ")}`
    );
    await shot(p2, "S3_yc26_bang_so_sanh.png");

    // ============================================================
    // S4 — YC-29: bảng Dashboard (desktop) + F5 + đăng nhập lại
    // ============================================================
    console.log("\n[S4] YC-29 — Bảng Dashboard");
    const checkDashboard = async (page: Page, tag: string) => {
      await page.waitForSelector('[data-testid="dashboard-tax-table"]', { timeout: 30000 });
      await page.waitForSelector('[data-testid="dash-row-THU_NSNN"]', { timeout: 30000 });
      const head = norm(await textOf(page, '[data-testid="dashboard-tax-table"] thead'));
      for (const h of ["Chỉ tiêu", "Trong ngày", "Tuần", "Lũy kế tháng", "Lũy kế năm", "Trạng thái"]) {
        check(`${tag} Có cột "${h}"`, head.includes(h), head);
      }
      const status = norm(await textOf(page, '[data-testid="dash-status-THU_NSNN"]'));
      check(`${tag} Trạng thái tháng hiển thị đúng (Đã chốt báo cáo)`, status === "Đã chốt báo cáo", status);
      const cells = await page.$$eval('[data-testid="dash-row-THU_NSNN"] td', (tds) => tds.map((t) => (t.innerText || "").trim()));
      check(`${tag} Trong ngày chưa nhập → hiển thị "—" (khác 0)`, cells[1] === "—", `cell="${cells[1]}"`);
      check(`${tag} Lũy kế tháng khớp số API`, norm(cells[3]) === fmtCell(thuDash.cols.month), `ui="${cells[3]}" api="${fmtCell(thuDash.cols.month)}"`);
      check(`${tag} Có ít nhất 1 dòng nhóm chỉ tiêu`, (await page.$$eval('[data-testid="dashboard-tax-table"] tbody tr', (r) => r.length)) > 3);
      check(`${tag} Cảnh báo dữ liệu DEMO hiển thị tại khu vực số liệu`, await exists(page, '[data-testid="data-quality-warning"]'));
    };
    const p3 = await newPage(browser, leader, 1440, 900);
    await p3.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle0", timeout: 90000 });
    await checkDashboard(p3, "S4.");
    await shot(p3, "S4_yc29_bang_dashboard.png");
    await p3.reload({ waitUntil: "networkidle0" });
    await checkDashboard(p3, "S4-F5.");

    const leader2 = await loginToken("demold01");
    const p3b = await newPage(browser, leader2, 1440, 900);
    await p3b.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle0", timeout: 90000 });
    await checkDashboard(p3b, "S4-relogin.");

    // ============================================================
    // S5 — Mobile 390×844
    // ============================================================
    console.log("\n[S5] Mobile 390×844");
    const pm = await newPage(browser, leader, 390, 844, true);
    await pm.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle0", timeout: 90000 });
    await pm.waitForSelector('[data-testid="dashboard-tax-table"]', { timeout: 30000 });
    const ov1 = await pageOverflowX(pm);
    check("S5a. Trang Dashboard mobile không tràn ngang", ov1.scrollWidth <= ov1.clientWidth + 2, `sw=${ov1.scrollWidth} cw=${ov1.clientWidth}`);
    const innerScroll = await pm.evaluate(() => {
      const table = document.querySelector('[data-testid="dashboard-tax-table"]') as HTMLElement;
      const wrap = table?.parentElement as HTMLElement;
      return wrap ? { scrollW: wrap.scrollWidth, clientW: wrap.clientWidth, overflowX: getComputedStyle(wrap).overflowX } : null;
    });
    check("S5b. Bảng chỉ cuộn trong khung (overflow-x)", !!innerScroll && innerScroll.overflowX === "auto", JSON.stringify(innerScroll));
    check("S5b2. Cảnh báo DEMO vẫn hiển thị trên mobile", await exists(pm, '[data-testid="data-quality-warning"]'));
    await shot(pm, "S5_yc29_dashboard_mobile.png");

    await pm.goto(`${BASE_URL}/giao-ban`, { waitUntil: "networkidle0", timeout: 90000 });
    await pm.waitForSelector('[data-testid="comparison-section"]', { timeout: 30000 });
    const ov2 = await pageOverflowX(pm);
    check("S5c. Trang giao ban mobile không tràn ngang", ov2.scrollWidth <= ov2.clientWidth + 2, `sw=${ov2.scrollWidth} cw=${ov2.clientWidth}`);
    await shot(pm, "S5b_yc26_giao_ban_mobile.png");

    await pm.goto(`${BASE_URL}/giao-ban/cau-hinh`, { waitUntil: "networkidle0", timeout: 90000 });
    await clickText(pm, "button", "Phân công nhập");
    await pm.waitForSelector('[data-testid="assign-person-button"]', { timeout: 20000 });
    await eClick(pm, '[data-testid="assign-person-button"]');
    await pm.waitForSelector('[data-testid="assign-person-search"]', { timeout: 10000 });
    await pm.type('[data-testid="assign-person-search"]', "CB-014", { delay: 15 });
    await pm.waitForSelector('[data-testid="assign-person-option-CB-014"]', { timeout: 10000 });
    const ov3 = await pageOverflowX(pm);
    check("S5d. Trang cấu hình phân công mobile không tràn ngang", ov3.scrollWidth <= ov3.clientWidth + 2, `sw=${ov3.scrollWidth} cw=${ov3.clientWidth}`);
    await shot(pm, "S5c_yc27_chon_cb014_mobile.png");
    await eClick(pm, '[data-testid="assign-person-option-CB-014"]');
    await pm.select('[data-testid="assign-scope-select"]', "metric");
    await pm.waitForSelector('[data-testid="assign-metric-picker"]', { timeout: 10000 });
    check("S5e. Bộ chọn nhiều chỉ tiêu dùng được trên mobile", await exists(pm, '[data-testid="assign-select-all"]'));
    await shot(pm, "S5d_yc28_chon_chi_tieu_mobile.png");

    // ============================================================
    // S6 — Phân quyền
    // ============================================================
    console.log("\n[S6] Phân quyền cán bộ thường");
    const ps = await newPage(browser, staff, 1440, 900);
    await ps.goto(`${BASE_URL}/giao-ban/cau-hinh`, { waitUntil: "networkidle0", timeout: 90000 });
    await sleep(1500);
    const staffText = norm(await ps.evaluate(() => document.body.innerText));
    check("S6a. Cán bộ thường bị chặn khỏi Cấu hình số liệu", staffText.includes("Chỉ lãnh đạo/quản trị được cấu hình"), staffText.slice(0, 120));
    check("S6b. Không thấy ô chọn người phân công", !(await exists(ps, '[data-testid="assign-person-picker"]')));
    await ps.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle0", timeout: 90000 });
    await ps.waitForSelector('[data-testid="dashboard-tax-table"]', { timeout: 30000 });
    check("S6c. Cán bộ thường vẫn xem được bảng số liệu giao ban", true);

    // ============================================================
    // S7 — P0: cảnh báo mềm trên trang nhập liệu
    // ============================================================
    console.log("\n[S7] P0 — Cảnh báo nhập số lũy kế vào ô phát sinh ngày");
    const p4 = await newPage(browser, leader, 1440, 900);
    await p4.goto(`${BASE_URL}/giao-ban/nhap`, { waitUntil: "networkidle0", timeout: 90000 });
    await p4.waitForFunction(() => !document.body.innerText.includes("Đang tải"), { timeout: 30000 });
    await sleep(800);
    const typed = await p4.evaluate(() => {
      const spans = Array.from(document.querySelectorAll("span")) as HTMLElement[];
      const metricSpan = spans.find((s) => (s.textContent || "").trim().startsWith("Thu NSNN"));
      if (!metricSpan) return false;
      const block = metricSpan.closest("div.px-4") as HTMLElement;
      const clsSpan = Array.from(block.querySelectorAll("span")).find((s) => (s.textContent || "").trim() === "Ô tô");
      const input = clsSpan?.parentElement?.querySelector("input") as HTMLInputElement | null;
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "897309948092");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    });
    check("S7a. Nhập được giá trị lớn vào ô Thu NSNN / Ô tô", typed);
    await clickText(p4, "button", "Lưu số liệu");
    await p4.waitForSelector('[data-testid="save-warnings"]', { timeout: 30000 });
    const warnText = norm(await textOf(p4, '[data-testid="save-warnings"]'));
    check("S7b. Hiện banner cảnh báo với nội dung 'số lũy kế'", /lũy kế/i.test(warnText), warnText.slice(0, 180));
    check("S7c. Cảnh báo nói rõ số liệu VẪN ĐÃ LƯU (không chặn)", warnText.includes("VẪN ĐÃ LƯU"));
    await shot(p4, "S7_p0_canh_bao_nhap_luy_ke.png");

    const todayStart = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
    const savedToday = await prisma.metricDailyEntry.count({ where: { entryDate: { gte: todayStart } } });
    check("S7d. Bản ghi vẫn được lưu dù có cảnh báo", savedToday >= 1, `entries today=${savedToday}`);
  } catch (e: any) {
    console.error("❌ LỖI KỊCH BẢN:", e?.message || e);
    if (e?.stack) console.error(String(e.stack).split("\n").slice(0, 4).join("\n"));
    failed++;
    failures.push(`Lỗi kịch bản: ${e?.message || e}`);
  } finally {
    await browser.close();
    // ----- dọn dẹp -----
    const cb2 = await prisma.person.findFirst({ where: { code: "CB-014" } });
    if (cb2) {
      const del = await prisma.metricEntryAssignment.deleteMany({
        where: { personId: cb2.id, metricId: { not: null }, createdAt: { gte: startedAt } },
      });
      if (del.count) console.log(`• Đã xoá ${del.count} phân công do UI test tạo.`);
    }
    const todayStart = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
    const thu = await prisma.metricDefinition.findFirst({ where: { code: "THU_NSNN" } });
    if (thu) {
      const entries = await prisma.metricDailyEntry.findMany({ where: { metricId: thu.id, entryDate: { gte: todayStart } }, select: { id: true } });
      if (entries.length) {
        const ids = entries.map((e) => e.id);
        await prisma.metricEntryRevision.deleteMany({ where: { entryId: { in: ids } } });
        const r = await prisma.metricDailyEntry.deleteMany({ where: { id: { in: ids } } });
        console.log(`• Đã xoá ${r.count} bản ghi ngày do UI test tạo (+ lịch sử sửa).`);
      }
    }
    await prisma.$disconnect();
    fs.writeFileSync(
      SUMMARY_FILE,
      JSON.stringify({ passed, failed, failures, at: new Date().toISOString() }, null, 2),
      "utf8"
    );
    console.log(`\n================ KẾT QUẢ UI ================\n✅ PASS: ${passed}   ❌ FAIL: ${failed}`);
    if (failures.length) console.log("Thất bại:\n- " + failures.join("\n- "));
    console.log(`Ảnh: ${OUT_DIR}`);
    process.exit(failed > 0 ? 1 : 0);
  }
}

main().catch(async (e) => {
  console.error("❌ LỖI CHẠY UI TEST:", e?.message || e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
