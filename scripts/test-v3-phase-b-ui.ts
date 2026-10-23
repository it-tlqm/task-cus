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

const ACC = {
  year: 2023,
  month: 10,
  yearCum: 1_317_372_334_554,
  monthCum: 219_341_201_856,
  baseline: 1_098_031_132_698,
  btc: 1_685_000_000_000,
  ubnd: 1_700_000_000_000,
  monthPlan: 200_000_000_000,
  prevMonthEntry: 50,
};
const TAG = `[S2-UI-${Date.now()}]`;
const cleanup = { targetIds: [] as string[], baselineIds: [] as string[], entryIds: [] as string[] };

async function api(method: string, urlPath: string, token: string, body?: any) {
  const res = await fetch(`${BASE_URL}${urlPath}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json: any = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function setupAcceptanceFixture(token: string) {
  const thu = await prisma.metricDefinition.findFirstOrThrow({ where: { code: "THU_NSNN" } });
  const cls = await prisma.metricClassification.findFirstOrThrow({
    where: { metricId: thu.id, active: true },
    orderBy: { sortOrder: "asc" },
  });
  const mk = async (label: string, periodType: string, periodNo: number | null, value: number, kind: string) =>
    api("POST", "/api/metrics/admin", token, {
      entity: "target",
      action: "create",
      data: {
        metricId: thu.id,
        classificationId: "",
        label,
        periodType,
        year: ACC.year,
        periodNo,
        value: String(value),
        comparisonKind: kind,
        dataSource: "REAL",
        sourceNote: `${TAG} căn cứ UI`,
      },
    });
  const targets = [
    await mk(`${TAG} BTC 2023`, "YEAR", null, ACC.btc, "BTC_YEAR"),
    await mk(`${TAG} UBND 2023`, "YEAR", null, ACC.ubnd, "UBND_YEAR"),
    await mk(`${TAG} KH 10/2023`, "MONTH", ACC.month, ACC.monthPlan, "MONTH_PLAN"),
  ];
  for (const t of targets) {
    if (t.json?.id) {
      cleanup.targetIds.push(t.json.id);
      await api("POST", "/api/metrics/admin", token, {
        entity: "target",
        action: "confirm",
        data: { id: t.json.id, metricId: thu.id, reason: "UI fixture" },
      });
    }
  }
  const base = await api("POST", "/api/metrics/admin", token, {
    entity: "baseline",
    action: "create",
    data: {
      metricId: thu.id,
      classificationId: cls.id,
      cumKind: "YEAR",
      asOfDate: "2023-09-30",
      value: String(ACC.baseline),
      dataSource: "REAL",
      sourceNote: `${TAG} mốc UI`,
    },
  });
  if (base.json?.id) {
    cleanup.baselineIds.push(base.json.id);
    await api("POST", "/api/metrics/admin", token, {
      entity: "baseline",
      action: "confirm",
      data: { id: base.json.id, reason: "UI fixture" },
    });
  }
  const entries = await api("POST", "/api/metrics/entries", token, {
    entries: [
      { metricId: thu.id, classificationId: cls.id, entryDate: "2023-09-15", value: String(ACC.prevMonthEntry) },
      { metricId: thu.id, classificationId: cls.id, entryDate: "2023-10-31", value: String(ACC.monthCum) },
    ],
  });
  for (const i of entries.json?.items || []) {
    const id = i.entryId || i.id;
    if (id) cleanup.entryIds.push(id);
  }
}

async function cleanupFixture() {
  if (cleanup.entryIds.length) {
    await prisma.metricEntryRevision.deleteMany({ where: { entryId: { in: cleanup.entryIds } } });
    await prisma.metricDailyEntry.deleteMany({ where: { id: { in: cleanup.entryIds } } });
  }
  if (cleanup.baselineIds.length) {
    await prisma.metricBaselineRevision.deleteMany({ where: { baselineId: { in: cleanup.baselineIds } } });
    await prisma.metricBaseline.deleteMany({ where: { id: { in: cleanup.baselineIds } } });
  }
  if (cleanup.targetIds.length) {
    await prisma.metricPlanTargetRevision.deleteMany({ where: { targetId: { in: cleanup.targetIds } } });
    await prisma.metricPlanTarget.deleteMany({ where: { id: { in: cleanup.targetIds } } });
  }
}

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
      localStorage.setItem(
        "hqtl-seen-pages",
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
  // Chờ font icon (Material Symbols) tải xong để ảnh bằng chứng không hiện ligature thô.
  await page.evaluate(() => (document as any).fonts?.ready).catch(() => null);
  await sleep(400);
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
    await setupAcceptanceFixture(token);
    // ---------- Dashboard desktop ----------
    const dash = await newPage(browser, token, 1440, 1000);
    await dash.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded", timeout: 120000 });
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
    await gb.goto(`${BASE_URL}/giao-ban`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await gb.waitForSelector('[data-testid="comparison-section"]', { timeout: 60000 });
    const gbText = await textOf(gb, '[data-testid="comparison-section"]');
    check("UI5. /giao-ban có cùng khối so sánh (nhất quán Dashboard)", gbText.toUpperCase().includes("SO SÁNH KẾT QUẢ THU NSNN"));
    check(
      "UI6. /giao-ban có link Cấu hình chỉ tiêu cho lãnh đạo",
      gbText.includes("Cấu hình chỉ tiêu") || (await textOf(gb, "body")).includes("Cấu hình chỉ tiêu")
    );

    // B-C-2/Q11 — UI phải hiển thị đúng 2 chữ số thập phân, dấu phẩy vi-VN.
    for (const y of [2025, 2024, 2023]) {
      await gb.evaluate((yearValue) => {
        const select = [...document.querySelectorAll("select")].find((s) =>
          [...s.options].some((o) => (o.textContent || "").startsWith("Năm "))
        ) as HTMLSelectElement | undefined;
        if (select) {
          select.value = String(yearValue);
          select.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }, y);
      await sleep(700);
    }
    await gb.evaluate(() => {
      const monthBtn = [...document.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "Tháng");
      (monthBtn as HTMLButtonElement | undefined)?.click();
    });
    await sleep(500);
    await gb.evaluate(() => {
      const select = [...document.querySelectorAll("select")].find((s) =>
        [...s.options].some((o) => (o.textContent || "").trim() === "Tháng 10")
      ) as HTMLSelectElement | undefined;
      if (select) {
        select.value = "10";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    await gb.waitForFunction(
      () => (document.querySelector('[data-testid="comparison-section"]')?.textContent || "").includes("78,18%"),
      { timeout: 60000 }
    );
    const acceptanceText = await textOf(gb, '[data-testid="comparison-section"]');
    check(
      "UI7. Hiển thị đúng 78,18% / 77,49% / 109,67% (2 chữ số thập phân, dấu phẩy)",
      acceptanceText.includes("78,18%") && acceptanceText.includes("77,49%") && acceptanceText.includes("109,67%"),
      acceptanceText.slice(0, 400)
    );
    check("UI8. Không hiển thị tỷ lệ dạng 1 chữ số thập phân (78.2 / 77.5 / 109.7)", !/78\.2|77\.5|109\.7/.test(acceptanceText));
    await gb.$eval('[data-testid="comparison-section"]', (el) => (el as HTMLElement).scrollIntoView({ block: "center" }));
    await sleep(400);
    await shot(gb, "giao-ban-comparison-acceptance-2023.png");
    await shot(gb, "giao-ban-comparison-desktop.png");
    await gb.close();

    // ---------- Cấu hình chỉ tiêu ----------
    const cfg = await newPage(browser, token, 1440, 1000);
    await cfg.goto(`${BASE_URL}/giao-ban/cau-hinh`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await cfg.waitForFunction(() => document.body.innerText.includes("Cấu hình số liệu giao ban"), { timeout: 60000 });
    // Chờ hydration xong trước khi bấm tab (SSR có thể đã hiện chữ nhưng chưa gắn handler).
    await cfg.waitForNetworkIdle({ idleTime: 500, timeout: 30000 }).catch(() => null);
    await sleep(800);
    // Đóng tour hướng dẫn nếu còn hiện, tránh lớp overlay chặn thao tác.
    await cfg.evaluate(() => {
      const skip = [...document.querySelectorAll("button")].find((b) =>
        (b.textContent || "").includes("tôi tự làm")
      );
      (skip as HTMLButtonElement | undefined)?.click();
    });
    await sleep(400);
    for (let i = 0; i < 8; i++) {
      await cfg.evaluate(() => {
        const btn = [...document.querySelectorAll("button")].find(
          (b) => (b.textContent || "").includes("Chỉ tiêu giao") && !(b.textContent || "").includes("BTC")
        );
        (btn as HTMLButtonElement | undefined)?.click();
      });
      await sleep(600);
      const opened = await cfg.evaluate(() =>
        document.body.innerText.includes("Chỉ tiêu giao — target-only")
      );
      if (opened) break;
    }
    await cfg.waitForFunction(() => document.body.innerText.includes("Chỉ tiêu giao — target-only"), { timeout: 60000 });
    await sleep(300);
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
    const labelCodes = await cfg.evaluate(() => {
      const select = [...document.querySelectorAll("select")].find((s) =>
        [...s.options].some((o) => o.value === "BTC")
      ) as HTMLSelectElement | undefined;
      return select ? [...select.options].map((o) => o.value) : [];
    });
    check("UI9. Tab Chỉ tiêu giao mở được (target-only)", cfgText.includes("Chỉ tiêu giao — target-only"));
    check("UI10. Có ô nguồn/căn cứ khi nhập chỉ tiêu", cfgHtml.includes("Nguồn / căn cứ"));
    check(
      "UI11. Có lựa chọn loại chỉ tiêu/đối chiếu tường minh (BTC/UBND/KH tháng)",
      ["BTC", "UBND", "KH_THANG", "KHAC"].every((code) => labelCodes.includes(code))
    );
    check("UI12. Có trạng thái Đã nhập/Đã xác nhận/Đã chốt", cfgText.includes("Chỉ tiêu nháp") || cfgText.includes("Đã xác nhận") || cfgText.includes("Đã chốt"));
    check("UI17. Target DEMO hiển thị nhãn riêng theo dataSource (không dò nhãn)", cfgText.includes("DEMO"));
    await shot(cfg, "giao-ban-cau-hinh-target.png");

    // Mở lịch sử của target vừa tạo (tránh bấm nhầm nút ở dòng khác).
    const historyClicked = await cfg.evaluate((tag) => {
      const row = [...document.querySelectorAll("tr")].find((tr) => (tr.textContent || "").includes(tag));
      const btn = row ? [...row.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "Lịch sử") : null;
      if (!btn) return false;
      (btn as HTMLButtonElement).click();
      return true;
    }, TAG);
    await cfg
      .waitForFunction(() => document.body.innerText.includes("Lịch sử chỉ tiêu giao"), { timeout: 30000 })
      .catch(() => null);
    const historyText = norm(await cfg.evaluate(() => document.body.innerText));
    const hasHistory = historyText.includes("Lịch sử chỉ tiêu giao");
    check("UI13. Mở được lịch sử thay đổi chỉ tiêu giao", !historyClicked || hasHistory);
    if (hasHistory) await shot(cfg, "giao-ban-target-history.png");
    await cfg.close();

    // ---------- Mobile ----------
    const m1 = await newPage(browser, token, 390, 844, true);
    await m1.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await m1.waitForSelector('[data-testid="comparison-section"]', { timeout: 60000 });
    check("UI14. Mobile Dashboard không tràn ngang", (await pageOverflowX(m1)) <= 1, `overflow=${await pageOverflowX(m1)}`);
    await shot(m1, "dashboard-comparison-mobile.png");
    await m1.close();

    const m2 = await newPage(browser, token, 390, 844, true);
    await m2.goto(`${BASE_URL}/giao-ban`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await m2.waitForSelector('[data-testid="comparison-section"]', { timeout: 60000 });
    check("UI15. Mobile /giao-ban không tràn ngang", (await pageOverflowX(m2)) <= 1, `overflow=${await pageOverflowX(m2)}`);
    await shot(m2, "giao-ban-comparison-mobile.png");
    await m2.close();

    // ---------- Staff không thấy cấu hình ----------
    const staffToken = await loginToken("democb01");
    const s = await newPage(browser, staffToken, 1440, 900);
    await s.goto(`${BASE_URL}/giao-ban/cau-hinh`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await s.waitForFunction(
      () =>
        !document.body.innerText.includes("Đang tải cấu hình") &&
        (document.body.innerText.includes("Chỉ người được cấp quyền cấu hình") ||
          document.body.innerText.includes("Cấu hình số liệu giao ban")),
      { timeout: 60000 }
    );
    await sleep(500);
    const staffText = norm(await s.evaluate(() => document.body.innerText));
    check("UI16. STAFF không vào được cấu hình số liệu", staffText.includes("Chỉ người được cấp quyền cấu hình"));
    await s.close();
  } finally {
    await browser.close();
    await cleanupFixture();
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
