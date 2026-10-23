/**
 * YC-10 Phase 2 — UI evidence (desktop + 390px mobile).
 * Tạo fixture cục bộ, chụp màn hình, rồi dọn fixture.
 *
 * Yêu cầu server chạy với V3_YC10_QUALITY=true (port 3117).
 */
import fs from "fs";
import path from "path";
import { createRequire } from "node:module";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { assertLocalTestDatabase } from "./lib/test-db-safety";

const creq = createRequire(import.meta.url);
const { PrismaClient } = creq("@prisma/client");
const dbUrl = assertLocalTestDatabase(
  process.env.DIRECT_URL || process.env.DATABASE_URL || "",
  "test-yc10-ui"
);
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
const BASE = process.env.TEST_BASE_URL || "http://localhost:3117";
const PASSWORD = process.env.TEST_PASSWORD || "LocalTest@2026";
const OUT_DIR = path.join(process.cwd(), "docs", "evidence", "phase2");
const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  path.join(process.env.LOCALAPPDATA || "", "Google/Chrome/Application/chrome.exe"),
];
const EXEC = CHROME_CANDIDATES.find((p) => p && fs.existsSync(p));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) {
    pass++;
    console.log(`  [PASS] ${name}${detail ? " - " + detail : ""}`);
  } else {
    fail++;
    console.log(`  [FAIL] ${name}${detail ? " - " + detail : ""}`);
  }
};

async function login(username: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: PASSWORD }),
  });
  const json = await res.json().catch(() => ({}));
  if (!json.token) throw new Error(`login ${username} HTTP ${res.status}`);
  return json.token as string;
}

async function newPage(browser: Browser, token: string, width: number, height: number): Promise<Page> {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.setCookie({ name: "token", value: token, domain: "localhost", path: "/" } as any);
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem(
        "hqtl-tour-done",
        JSON.stringify({ "/tasks": true, "/my-work": true, "/approvals": true })
      );
    } catch {}
  });
  return page;
}

async function dismissHelp(page: Page) {
  await sleep(1200);
  await page.evaluate(() => {
    for (const b of Array.from(document.querySelectorAll("button"))) {
      const t = b.textContent || "";
      if (t.includes("Rồi, tôi tự làm được") || t.includes("Đã hiểu")) {
        (b as HTMLButtonElement).click();
      }
    }
  });
  await sleep(300);
}

async function openApprovalCard(page: Page, code: string) {
  return await page.evaluate((code) => {
    const candidates = Array.from(document.querySelectorAll("div")).filter((el) => {
      if (!(el.textContent || "").includes(code)) return false;
      const buttons = Array.from(el.querySelectorAll("button"));
      return buttons.some((b) => (b.textContent || "").includes("Chấp thuận"));
    });
    candidates.sort(
      (a, b) => a.querySelectorAll("*").length - b.querySelectorAll("*").length
    );
    const card = candidates[0];
    if (!card) return false;
    const button = Array.from(card.querySelectorAll("button")).find((b) =>
      (b.textContent || "").includes("Chấp thuận")
    );
    if (!button) return false;
    (button as HTMLButtonElement).click();
    return true;
  }, code);
}

async function main() {
  if (!EXEC) throw new Error("Không tìm thấy Chrome/Edge để chạy UI evidence.");
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const owner = await prisma.account.findUnique({
    where: { username: "democb01" },
    include: { person: { include: { assignments: { where: { isPrimary: true } } } } },
  });
  const collab = await prisma.account.findUnique({
    where: { username: "democb02" },
    include: { person: { include: { assignments: { where: { isPrimary: true } } } } },
  });
  const leader = await prisma.account.findUnique({
    where: { username: "demold01" },
    include: { person: { include: { assignments: { where: { isPrimary: true } } } } },
  });
  if (!owner || !collab || !leader) throw new Error("Thiếu tài khoản fixture.");
  const unitId = owner.person.assignments[0]?.unitId || collab.person.assignments[0]!.unitId;
  const tag = Date.now().toString(36).toUpperCase();

  const pending = await prisma.task.create({
    data: {
      code: `YC10-UI-P-${tag}`,
      title: "[YC10-UI] Nhiệm vụ chờ nghiệm thu — chọn mức chất lượng",
      ownerId: owner.personId,
      unitId,
      status: "WAITING_REVIEW",
      priority: "Trung bình",
      originalDeadline: new Date("2026-12-31T00:00:00.000Z"),
      currentDeadline: new Date("2026-12-31T00:00:00.000Z"),
      actualResultText: "Đã hoàn thành đầy đủ nội dung, trình lãnh đạo nghiệm thu.",
      assignees: { create: [{ personId: collab.personId, role: "COLLABORATOR" }] },
    },
  });

  const completed = await prisma.task.create({
    data: {
      code: `YC10-UI-C-${tag}`,
      title: "[YC10-UI] Nhiệm vụ đã nghiệm thu — lịch sử chất lượng",
      ownerId: owner.personId,
      unitId,
      status: "COMPLETED",
      priority: "Trung bình",
      originalDeadline: new Date("2026-12-31T00:00:00.000Z"),
      currentDeadline: new Date("2026-12-31T00:00:00.000Z"),
      actualResultText: "Kết quả đã được nghiệm thu hoàn thành.",
      assignees: { create: [{ personId: collab.personId, role: "COLLABORATOR" }] },
    },
  });

  const caseRow = await prisma.approvalCase.create({
    data: {
      caseType: "TASK_RESULT",
      resourceId: completed.id,
      resourceCode: completed.code,
      title: completed.title,
      unitId,
      submittedById: owner.personId,
      status: "AGREED",
      currentRound: 1,
      decidedById: leader.personId,
      decidedAt: new Date("2026-10-23T09:00:00.000Z"),
    },
  });
  const decision = await prisma.approvalDecision.create({
    data: {
      caseId: caseRow.id,
      round: 1,
      action: "AGREE",
      reason: "Đồng ý nghiệm thu",
      qualityPercent: 65,
      actorId: leader.id,
      actorPersonId: leader.personId,
      createdAt: new Date("2026-10-23T09:00:00.000Z"),
    },
  });
  await prisma.approvalQualityAdjustment.create({
    data: {
      caseId: caseRow.id,
      decisionId: decision.id,
      revision: 1,
      oldQualityPercent: 65,
      newQualityPercent: 80,
      reason: "Bổ sung minh chứng theo kết luận họp",
      requestedById: owner.personId,
      requestedByAccountId: owner.id,
      requestedAt: new Date("2026-10-23T10:00:00.000Z"),
      status: "APPROVED",
      decidedById: leader.personId,
      decidedByAccountId: leader.id,
      decidedAt: new Date("2026-10-23T11:00:00.000Z"),
      decisionNote: "Đồng ý điều chỉnh",
    },
  });

  const tokOwner = await login("democb01");
  const tokCollab = await login("democb02");
  const tokLeader = await login("demold01");

  const browser = await puppeteer.launch({
    executablePath: EXEC,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--window-size=1440,900"],
  });
  const errors: string[] = [];
  try {
    // ---------- Desktop: ApprovalPreviewModal chọn quality ----------
    const page = await newPage(browser, tokLeader, 1440, 900);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${BASE}/approvals`, { waitUntil: "networkidle2", timeout: 60000 });
    await dismissHelp(page);
    await page.waitForFunction(
      (code) => document.body.innerText.includes(code),
      { timeout: 30000 },
      pending.code
    );
    const clicked = await openApprovalCard(page, pending.code);
    check("UI1. Mở được preview từ hàng đợi duyệt", clicked === true);
    await page.waitForSelector('[data-testid="quality-select-block"]', { timeout: 30000 });
    await sleep(800);
    const modalText = await page.evaluate(() => document.body.innerText);
    check("UI2. Modal có select quality + cảnh báo bắt buộc", modalText.includes("Mức chất lượng kết quả"));
    check(
      "UI3. AGREE thiếu quality hiển thị lỗi bắt buộc",
      modalText.includes("Bắt buộc chọn mức chất lượng")
    );
    await page.screenshot({
      path: path.join(OUT_DIR, "01-approval-quality-required-desktop.png"),
      fullPage: false,
    });
    await page.select('[data-testid="quality-select"]', "65");
    await sleep(500);
    const selectedText = await page.evaluate(() => document.body.innerText);
    check("UI4. Chọn 65 không còn cảnh báo bắt buộc", !selectedText.includes("Bắt buộc chọn mức chất lượng"));
    await page.screenshot({
      path: path.join(OUT_DIR, "02-approval-quality-selected-desktop.png"),
      fullPage: false,
    });
    check("UI5. Không có page error", errors.length === 0, errors.join(" | "));
    await page.close();

    // ---------- Mobile 390px: cùng modal ----------
    const mobile = await newPage(browser, tokLeader, 390, 844);
    await mobile.goto(`${BASE}/approvals`, { waitUntil: "networkidle2", timeout: 60000 });
    await dismissHelp(mobile);
    await mobile.waitForFunction(
      (code) => document.body.innerText.includes(code),
      { timeout: 30000 },
      pending.code
    );
    const mobileClicked = await openApprovalCard(mobile, pending.code);
    check("UI6a. Mở được preview trên mobile", mobileClicked === true);
    await mobile.waitForSelector('[data-testid="quality-select-block"]', { timeout: 30000 });
    await mobile.select('[data-testid="quality-select"]', "65");
    await sleep(600);
    const overflow = await mobile.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    check(
      "UI6. Mobile 390px không tràn ngang",
      overflow.scrollWidth <= overflow.clientWidth + 1,
      JSON.stringify(overflow)
    );
    const mobileBlock = await mobile.$('[data-testid="quality-select-block"]');
    check("UI6b. Mobile có khối chọn chất lượng", mobileBlock !== null);
    if (mobileBlock) {
      await mobileBlock.evaluate((el: any) => el.scrollIntoView({ block: "center" }));
      await sleep(400);
    }
    await mobile.screenshot({
      path: path.join(OUT_DIR, "03-approval-quality-mobile-390.png"),
      fullPage: false,
    });
    await mobile.close();

    // ---------- Desktop: Task detail quality + adjustment ----------
    const taskPage = await newPage(browser, tokOwner, 1440, 900);
    await taskPage.goto(`${BASE}/tasks/${completed.id}`, { waitUntil: "networkidle2", timeout: 60000 });
    await taskPage.waitForSelector('[data-testid="task-quality-summary"]', { timeout: 30000 });
    await dismissHelp(taskPage);
    await sleep(600);
    const taskText = await taskPage.evaluate(() => document.body.innerText);
    check("UI7. Task detail hiển thị quality gốc/hiệu lực", taskText.includes("Hiệu lực: 80%") && taskText.includes("Gốc: 65%"));
    check("UI8. Task detail có lịch sử điều chỉnh", taskText.includes("Bổ sung minh chứng theo kết luận họp"));
    check(
      "UI9. Owner thấy form yêu cầu điều chỉnh",
      (await taskPage.$('[data-testid="task-quality-adjustment-select"]')) !== null
    );
    await taskPage.screenshot({
      path: path.join(OUT_DIR, "04-task-quality-history-desktop.png"),
      fullPage: true,
    });
    const formEl = await taskPage.$('[data-testid="task-quality-adjustment-submit"]');
    if (formEl) {
      await formEl.scrollIntoView();
      await sleep(300);
      await taskPage.screenshot({
        path: path.join(OUT_DIR, "05-task-quality-adjustment-form-desktop.png"),
        fullPage: false,
      });
    }
    await taskPage.close();

    // ---------- Mobile: Task detail quality ----------
    const taskMobile = await newPage(browser, tokOwner, 390, 844);
    await taskMobile.goto(`${BASE}/tasks/${completed.id}`, { waitUntil: "networkidle2", timeout: 60000 });
    await taskMobile.waitForSelector('[data-testid="task-quality-summary"]', { timeout: 30000 });
    await dismissHelp(taskMobile);
    await sleep(600);
    const mobileOverflow = await taskMobile.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    check(
      "UI10. Task quality mobile 390px không tràn ngang",
      mobileOverflow.scrollWidth <= mobileOverflow.clientWidth + 1,
      JSON.stringify(mobileOverflow)
    );
    const mobileQuality = await taskMobile.$('[data-testid="task-quality-summary"]');
    check("UI10b. Mobile có panel quality", mobileQuality !== null);
    if (mobileQuality) {
      await mobileQuality.evaluate((el: any) => el.scrollIntoView({ block: "center" }));
      await sleep(400);
    }
    await taskMobile.screenshot({
      path: path.join(OUT_DIR, "06-task-quality-mobile-390.png"),
      fullPage: false,
    });
    await taskMobile.close();

    // ---------- Collaborator không thấy quality ----------
    const collabPage = await newPage(browser, tokCollab, 1440, 900);
    await collabPage.goto(`${BASE}/tasks/${completed.id}`, { waitUntil: "networkidle2", timeout: 60000 });
    await dismissHelp(collabPage);
    await sleep(600);
    const hasQuality = await collabPage.$('[data-testid="task-quality-summary"]');
    const collabText = await collabPage.evaluate(() => document.body.innerText);
    check("UI11. Collaborator KHÔNG thấy panel quality", hasQuality === null);
    check("UI12. Collaborator không thấy giá trị hiệu lực 80%", !collabText.includes("Hiệu lực: 80%"));
    await collabPage.screenshot({
      path: path.join(OUT_DIR, "07-collaborator-no-quality-desktop.png"),
      fullPage: true,
    });
    await collabPage.close();

    console.log(`\n=== UI EVIDENCE ${pass} PASS / ${fail} FAIL ===`);
  } finally {
    await browser.close();
    try {
      await prisma.approvalCase.deleteMany({ where: { resourceId: { in: [pending.id, completed.id] } } });
      await prisma.task.deleteMany({ where: { id: { in: [pending.id, completed.id] } } });
    } catch (e) {
      console.error("[CLEANUP]", e);
    }
    await prisma.$disconnect();
  }
  if (fail > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exitCode = 1;
});
