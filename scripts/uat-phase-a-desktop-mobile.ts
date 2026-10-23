/**
 * S1 — UAT Desktop/Mobile Phase A (YC-03/04/05) trên dữ liệu kiểm thử.
 *
 * Kịch bản thật trên UI:
 *  1. Lãnh đạo đơn vị tạo kế hoạch DRAFT (đơn vị Nghiệp vụ A) + hạng mục đầu tiên.
 *  2. Thêm đầu việc, sửa đầu việc trên Desktop.
 *  3. Trình duyệt; kiểm tra chặn tự phê duyệt.
 *  4. Trưởng bộ phận A trả lại kèm lý do.
 *  5. Cán bộ/lãnh đạo sửa lại và trình lại.
 *  6. Trưởng bộ phận A phê duyệt.
 *  7. Mobile 390×844: chọn kế hoạch, không tràn ngang, thêm đầu việc.
 *
 * Chạy (server đã chạy ở TEST_BASE_URL):
 *   $env:TEST_BASE_URL="http://localhost:3111"
 *   $env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/talung_v3_phase_a_qa"
 *   $env:DIRECT_URL=$env:DATABASE_URL
 *   npx tsx scripts/uat-phase-a-desktop-mobile.ts
 */
import puppeteer, { Browser, BrowserContext, Page } from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { assertLocalTestDatabase } from "./lib/test-db-safety";

const BASE = process.env.TEST_BASE_URL || "http://localhost:3111";
const PASSWORD = process.env.TEST_PASSWORD || "LocalTest@2026";
const TAG = `[QA-UAT-${Date.now().toString(36).toUpperCase()}]`;
const PLAN_TITLE = `${TAG} Kế hoạch công tác tuần`;
const ITEM_TITLE = `${TAG} Tiếp nhận và kiểm tra hồ sơ`;
const ITEM_EDITED = `${TAG} Tiếp nhận, kiểm tra và luân chuyển hồ sơ`;
const MOBILE_ITEM_TITLE = `${TAG} Đầu việc tạo trên Mobile`;

const dbUrl = assertLocalTestDatabase(
  process.env.DIRECT_URL || process.env.DATABASE_URL || "",
  "uat-phase-a-desktop-mobile"
);
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const OUT_DIR = path.resolve("docs/evidence/phase-a-qa");
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

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${name}${detail ? " — " + detail : ""}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? " — " + detail : ""}`);
    console.log(`  [FAIL] ${name}${detail ? " — " + detail : ""}`);
  }
}

async function login(username: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: PASSWORD }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!json.token) throw new Error(`Đăng nhập ${username} lỗi HTTP ${res.status}`);
  return json as { token: string; user: any };
}

async function openSession(browser: Browser, token: string, width: number, height: number) {
  const context: BrowserContext = await (browser as any).createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.setCookie({ name: "token", value: token, domain: "localhost", path: "/" } as any);
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem("hqtl-tour-done", JSON.stringify({ "/plans": true }));
    } catch {}
  });
  return { context, page };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Chờ font Material Symbols tải xong trước khi đo layout/chụp ảnh (tránh ligature chữ làm tràn ngang). */
async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await sleep(900);
}

async function shot(page: Page, name: string, fullPage = false) {
  const dest = path.join(OUT_DIR, name);
  await settle(page);
  await page.screenshot({ path: dest, fullPage });
  console.log(`  📸 ${name}`);
}

async function clickByText(page: Page, selector: string, text: string) {
  const clicked = await page.evaluate(
    (sel, expected) => {
      const nodes = Array.from(document.querySelectorAll(sel)) as HTMLElement[];
      const node = nodes.find((n) => (n.textContent || "").replace(/\s+/g, " ").includes(expected));
      if (!node) return false;
      node.click();
      return true;
    },
    selector,
    text
  );
  if (!clicked) throw new Error(`Không tìm thấy ${selector} chứa "${text}"`);
}

async function selectPlan(page: Page, title: string, testId = "plan-select") {
  const value = await page.$$eval(
    `[data-testid="${testId}"] option`,
    (options, target) => (options as HTMLOptionElement[]).find((o) => (o.textContent || "").includes(target))?.value || "",
    title
  );
  if (!value) throw new Error(`Không thấy kế hoạch "${title}" trong ${testId}`);
  await page.select(`[data-testid="${testId}"]`, value);
  await new Promise((r) => setTimeout(r, 1500));
  return value;
}

async function setInput(page: Page, selector: string, value: string) {
  await page.$eval(
    selector,
    (el, v) => {
      const input = el as HTMLInputElement | HTMLTextAreaElement;
      const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      setter?.call(input, v);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    },
    value
  );
}

async function bodyHas(page: Page, text: string, timeout = 15000) {
  await page.waitForFunction((t) => (document.body.innerText || "").includes(t), { timeout }, text);
}

async function createPlan(page: Page, unitCode: string) {
  await page.goto(`${BASE}/plans`, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector('[data-testid="create-plan-btn"]', { timeout: 20000 });
  await page.click('[data-testid="create-plan-btn"]');
  await page.waitForSelector('[data-testid="plan-form-title"]', { timeout: 10000 });

  const unitValue = await page.$$eval(
    '[data-testid="plan-form-unit"] option',
    (options, code) => (options as HTMLOptionElement[]).find((o) => (o.textContent || "").includes(code))?.value || "",
    unitCode
  );
  if (!unitValue) throw new Error(`Không thấy đơn vị ${unitCode} trong form tạo kế hoạch`);
  await page.select('[data-testid="plan-form-unit"]', unitValue);
  await clickByText(page, "button", "Tuần");
  await setInput(page, '[data-testid="plan-form-date"]', "2026-10-23");
  await setInput(page, '[data-testid="plan-form-title"]', PLAN_TITLE);
  await setInput(page, '[data-testid="plan-form-first-item"]', "I. Công tác trọng tâm");
  await page.click('[data-testid="plan-form-submit"]');
  await page.waitForFunction(() => !document.querySelector('[data-testid="plan-form-submit"]'), { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 1800));
  await selectPlan(page, PLAN_TITLE);
  await bodyHas(page, PLAN_TITLE);
}

async function addWorkItem(page: Page, title: string, buttonTestId = "add-work-item-btn") {
  await page.waitForSelector(`[data-testid="${buttonTestId}"]`, { timeout: 20000 });
  await page.click(`[data-testid="${buttonTestId}"]`);
  await page.waitForSelector('[data-testid="modal-title-input"]', { timeout: 15000 });

  const itemValue = await page.$$eval(
    '[data-testid="modal-plan-item-select"] option',
    (options) => (options as HTMLOptionElement[]).find((o) => o.value)?.value || ""
  );
  if (itemValue) await page.select('[data-testid="modal-plan-item-select"]', itemValue);

  const personValue = await page.$$eval(
    '[data-testid="modal-person-select"] option',
    (options) =>
      (options as HTMLOptionElement[]).find((o) => (o.textContent || "").includes("DEMO-CB-01"))?.value || "",
  );
  if (personValue) await page.select('[data-testid="modal-person-select"]', personValue);

  await setInput(page, '[data-testid="modal-title-input"]', title);
  await page.click('[data-testid="modal-submit-btn"]');
  await page.waitForFunction(() => !document.querySelector('[data-testid="modal-submit-btn"]'), { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 1200));
  await bodyHas(page, title);
}

async function editWorkItem(page: Page, oldTitle: string, newTitle: string) {
  const clicked = await page.evaluate((title) => {
    const headings = Array.from(document.querySelectorAll("h4"));
    const heading = headings.find((h) => (h.textContent || "").includes(title));
    const box = heading?.closest("div.p-3.rounded-lg") || heading?.parentElement;
    const button = Array.from(box?.querySelectorAll("button") || []).find((b) =>
      (b.textContent || "").includes("Sửa")
    );
    if (!button) return false;
    button.click();
    return true;
  }, oldTitle);
  if (!clicked) throw new Error(`Không tìm thấy nút Sửa cho "${oldTitle}"`);
  await page.waitForSelector('[data-testid="modal-title-input"]', { timeout: 10000 });
  await setInput(page, '[data-testid="modal-title-input"]', newTitle);
  await page.click('[data-testid="modal-submit-btn"]');
  await page.waitForFunction(() => !document.querySelector('[data-testid="modal-submit-btn"]'), { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 1200));
  await bodyHas(page, newTitle);
}

async function submitPlan(page: Page) {
  await clickByText(page, "button", "Trình duyệt kế hoạch");
  await bodyHas(page, "Không thể tự phê duyệt");
}

async function main() {
  console.log("=== S1 — UAT PHASE A DESKTOP/MOBILE ===\n");
  const leader = await login("demold01");
  const deptLeader = await login("demolda01");

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--window-size=1440,900"],
  });

  let planId = "";
  const workItemIds: string[] = [];
  const planIds: string[] = [];

  try {
    // ---------------- Desktop: tạo kế hoạch + đầu việc ----------------
    console.log("[1] Desktop — tạo kế hoạch, thêm/sửa đầu việc");
    const owner = await openSession(browser, leader.token, 1440, 900);
    const page = owner.page;
    await createPlan(page, "BP_NGHIEPVU_A");
    const plan = await prisma.plan.findFirst({ where: { title: PLAN_TITLE }, orderBy: { createdAt: "desc" } });
    planId = plan?.id || "";
    planIds.push(planId);
    check("Tạo kế hoạch DRAFT trên Desktop", !!plan && plan.status === "DRAFT", `status=${plan?.status}`);
    await shot(page, "01-desktop-plan-created.png", true);

    await addWorkItem(page, ITEM_TITLE);
    const createdItem = await prisma.personalWorkItem.findFirst({
      where: { title: ITEM_TITLE },
      orderBy: { createdAt: "desc" },
      include: { person: { select: { code: true } } },
    });
    if (createdItem) workItemIds.push(createdItem.id);
    check(
      "Thêm đầu việc đúng hạng mục/kỳ/người phụ trách trên Desktop",
      !!createdItem && createdItem.planItemId !== null && createdItem.person.code === "DEMO-CB-01",
      `person=${createdItem?.person.code || "?"}`
    );
    await shot(page, "02-desktop-work-item-added.png", true);

    await editWorkItem(page, ITEM_TITLE, ITEM_EDITED);
    const editedItem = createdItem
      ? await prisma.personalWorkItem.findUnique({ where: { id: createdItem.id } })
      : null;
    check("Sửa đầu việc trên Desktop", editedItem?.title === ITEM_EDITED, editedItem?.title || "");
    await shot(page, "03-desktop-work-item-edited.png", true);

    // ---------------- Mobile (khi kế hoạch còn DRAFT) ----------------
    console.log("[1b] Mobile 390×844 — chọn kế hoạch, không tràn ngang, thêm đầu việc");
    const mobile = await openSession(browser, leader.token, 390, 844);
    const mobilePage = mobile.page;
    await mobilePage.goto(`${BASE}/plans`, { waitUntil: "networkidle2", timeout: 60000 });
    await mobilePage.waitForSelector('[data-testid="plan-select-mobile"]', { timeout: 20000 });
    await selectPlan(mobilePage, PLAN_TITLE, "plan-select-mobile");
    await bodyHas(mobilePage, PLAN_TITLE);
    await settle(mobilePage);
    const noOverflow = await mobilePage.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1
    );
    check("Mobile không tràn ngang", noOverflow, `scrollWidth=${await mobilePage.evaluate(() => document.documentElement.scrollWidth)}`);
    await shot(mobilePage, "08-mobile-plan.png", true);

    await mobilePage.click('[data-testid="add-work-item-btn-mobile"]');
    await mobilePage.waitForSelector('[data-testid="modal-title-input"]', { timeout: 15000 });
    const modalFits = await mobilePage.evaluate(() => {
      const modal = document.querySelector('[data-testid="modal-title-input"]')?.closest("div.fixed");
      if (!modal) return false;
      const rect = modal.getBoundingClientRect();
      return rect.width <= window.innerWidth + 1 && rect.right <= window.innerWidth + 1;
    });
    check("Hộp thoại thêm đầu việc nằm trong khung Mobile", modalFits);
    const mobileItemValue = await mobilePage.$$eval(
      '[data-testid="modal-plan-item-select"] option',
      (options) => (options as HTMLOptionElement[]).find((o) => o.value)?.value || ""
    );
    if (mobileItemValue) await mobilePage.select('[data-testid="modal-plan-item-select"]', mobileItemValue);
    const mobilePersonValue = await mobilePage.$$eval(
      '[data-testid="modal-person-select"] option',
      (options) =>
        (options as HTMLOptionElement[]).find((o) => (o.textContent || "").includes("DEMO-CB-01"))?.value || ""
    );
    if (mobilePersonValue) await mobilePage.select('[data-testid="modal-person-select"]', mobilePersonValue);
    await setInput(mobilePage, '[data-testid="modal-title-input"]', MOBILE_ITEM_TITLE);
    await shot(mobilePage, "09-mobile-add-work-item.png", false);
    await mobilePage.click('[data-testid="modal-submit-btn"]');
    await mobilePage.waitForFunction(() => !document.querySelector('[data-testid="modal-submit-btn"]'), { timeout: 20000 });
    await new Promise((r) => setTimeout(r, 1200));
    const mobileItem = await prisma.personalWorkItem.findFirst({
      where: { title: MOBILE_ITEM_TITLE },
      orderBy: { createdAt: "desc" },
    });
    if (mobileItem) workItemIds.push(mobileItem.id);
    check("Thêm đầu việc trên Mobile", !!mobileItem, mobileItem ? "đã lưu" : "không thấy bản ghi");
    await shot(mobilePage, "10-mobile-work-item-added.png", true);

    // ---------------- Trình duyệt + chặn tự duyệt ----------------
    await submitPlan(page);
    const submitted = await prisma.plan.findUnique({ where: { id: planId } });
    check("Trình duyệt kế hoạch — SUBMITTED", submitted?.status === "SUBMITTED", `status=${submitted?.status}`);
    check("Chặn tự phê duyệt hiển thị trên UI", true);
    await shot(page, "04-desktop-submitted-self-approval-blocked.png", true);

    // ---------------- Trưởng bộ phận trả lại ----------------
    console.log("[2] Desktop — trưởng bộ phận A trả lại kèm lý do");
    const approver = await openSession(browser, deptLeader.token, 1440, 900);
    const approvePage = approver.page;
    await approvePage.goto(`${BASE}/plans`, { waitUntil: "networkidle2", timeout: 60000 });
    await selectPlan(approvePage, PLAN_TITLE);
    await bodyHas(approvePage, "Phê duyệt kế hoạch");
    await shot(approvePage, "05-desktop-approver-actions.png", true);

    await clickByText(approvePage, "button", "Trả lại");
    await approvePage.waitForSelector("textarea", { timeout: 10000 });
    await approvePage.type("textarea", "Đề nghị bổ sung căn cứ và đầu việc phối hợp.");
    await clickByText(approvePage, "button", "Xác nhận trả lại");
    await new Promise((r) => setTimeout(r, 1800));
    const returned = await prisma.plan.findUnique({ where: { id: planId } });
    check("Trưởng bộ phận trả lại kế hoạch — RETURNED", returned?.status === "RETURNED", `status=${returned?.status}`);
    await shot(approvePage, "06-desktop-returned.png", true);

    // ---------------- Sửa lại + trình lại ----------------
    console.log("[3] Desktop — sửa sau trả lại và trình lại");
    await page.reload({ waitUntil: "networkidle2", timeout: 60000 });
    await selectPlan(page, PLAN_TITLE);
    await bodyHas(page, "YÊU CẦU CHỈNH SỬA");
    await editWorkItem(page, ITEM_EDITED, `${ITEM_EDITED} (bổ sung)`);
    const editedAfterReturn = createdItem
      ? await prisma.personalWorkItem.findUnique({ where: { id: createdItem.id } })
      : null;
    check("Sửa đầu việc sau khi bị trả lại", editedAfterReturn?.title.includes("(bổ sung)") === true);
    await clickByText(page, "button", "Trình duyệt kế hoạch");
    await bodyHas(page, "Không thể tự phê duyệt");
    const resubmitted = await prisma.plan.findUnique({ where: { id: planId } });
    check("Trình lại kế hoạch — SUBMITTED", resubmitted?.status === "SUBMITTED", `status=${resubmitted?.status}`);

    // ---------------- Phê duyệt ----------------
    console.log("[4] Desktop — trưởng bộ phận A phê duyệt");
    await approvePage.reload({ waitUntil: "networkidle2", timeout: 60000 });
    await selectPlan(approvePage, PLAN_TITLE);
    await bodyHas(approvePage, "Phê duyệt kế hoạch");
    await clickByText(approvePage, "button", "Phê duyệt kế hoạch");
    await new Promise((r) => setTimeout(r, 1800));
    const approved = await prisma.plan.findUnique({ where: { id: planId } });
    check("Trưởng bộ phận phê duyệt — APPROVED", approved?.status === "APPROVED", `status=${approved?.status}`);
    await shot(approvePage, "07-desktop-approved.png", true);

    console.log(`\n=== KẾT QUẢ UAT: ${passed} PASS / ${failed} FAIL ===`);
    if (failures.length) failures.forEach((f) => console.log("  - " + f));
    if (failed > 0) process.exitCode = 1;
  } finally {
    // Dọn dữ liệu UAT theo thứ tự khóa ngoại.
    if (workItemIds.length) {
      await prisma.workItemProduct.deleteMany({ where: { workItemId: { in: workItemIds } } }).catch(() => {});
      await prisma.workItemAssignment.deleteMany({ where: { workItemId: { in: workItemIds } } }).catch(() => {});
      await prisma.workItemReview.deleteMany({ where: { workItemId: { in: workItemIds } } }).catch(() => {});
      await prisma.planItem.updateMany({ where: { workItemId: { in: workItemIds } }, data: { workItemId: null } }).catch(() => {});
      await prisma.personalWorkItem.deleteMany({ where: { id: { in: workItemIds } } }).catch(() => {});
    }
    if (planIds.filter(Boolean).length) {
      await prisma.approvalDecision.deleteMany({ where: { case: { caseType: "PLAN", resourceId: { in: planIds } } } }).catch(() => {});
      await prisma.approvalCase.deleteMany({ where: { caseType: "PLAN", resourceId: { in: planIds } } }).catch(() => {});
      await prisma.planVersion.deleteMany({ where: { planId: { in: planIds } } }).catch(() => {});
      await prisma.planItem.deleteMany({ where: { planId: { in: planIds } } }).catch(() => {});
      await prisma.plan.deleteMany({ where: { id: { in: planIds } } }).catch(() => {});
    }
    await browser.close();
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error("LỖI UAT:", error?.message);
  await prisma.$disconnect();
  process.exitCode = 1;
});
