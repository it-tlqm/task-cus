/**
 * YC-11 / YC-10 Phase 2b — UI smoke + evidence (desktop 1440 + mobile 390).
 * Yêu cầu server chạy với V3_YC11_PRECHECK=true và V3_YC10_QUALITY=true.
 * Fixture chỉ trên DB test cục bộ; dọn sau khi chạy.
 */
import fs from "fs";
import path from "path";
import { createRequire } from "node:module";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { assertLocalTestDatabase } from "./lib/test-db-safety";

const creq = createRequire(import.meta.url);
const { PrismaClient } = creq("@prisma/client");
const bcrypt = creq("bcryptjs");
const dbUrl = assertLocalTestDatabase(
  process.env.DIRECT_URL || process.env.DATABASE_URL || "",
  "test-yc11-ui"
);
process.env.DATABASE_URL = dbUrl;
process.env.DIRECT_URL = dbUrl;
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const BASE = process.env.TEST_BASE_URL || "http://localhost:3117";
const PASSWORD = process.env.TEST_PASSWORD || "LocalTest@2026";
const OUT_DIR = path.join(process.cwd(), "docs", "evidence", "phase3");
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

const createdTaskIds: string[] = [];
const createdPersonIds: string[] = [];
const createdAccountIds: string[] = [];
const createdSupervisionIds: string[] = [];
const TAG = `YC11UI-${Date.now().toString(36).toUpperCase()}`;

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
const H = (t: string) => ({ Authorization: `Bearer ${t}`, "Content-Type": "application/json" });

async function newPage(
  browser: Browser,
  token: string,
  width: number,
  height: number,
  seenPaths: string[] = []
): Promise<Page> {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.setCookie({ name: "token", value: token, domain: "localhost", path: "/" } as any);
  await page.evaluateOnNewDocument((paths) => {
    try {
      localStorage.setItem(
        "hqtl-tour-done",
        JSON.stringify({ "/tasks": true, "/my-work": true, "/approvals": true })
      );
      const seen: Record<string, boolean> = {};
      for (const p of paths) seen[p] = true;
      localStorage.setItem("hqtl-seen-pages", JSON.stringify(seen));
    } catch {}
  }, seenPaths);
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
  await sleep(250);
}

async function createTempPerson(input: { suffix: string; unitId: string; fullName: string }) {
  const role = await prisma.role.findUnique({ where: { code: "STAFF" } });
  if (!role) throw new Error("thiếu role STAFF");
  const person = await prisma.person.create({
    data: {
      code: `${TAG}-${input.suffix}`.toUpperCase(),
      fullName: input.fullName,
      status: "ACTIVE",
      assignments: { create: [{ unitId: input.unitId, isPrimary: true }] },
    },
  });
  createdPersonIds.push(person.id);
  const username = `yc11ui${input.suffix}${TAG.slice(-4)}`.toLowerCase().replace(/[^a-z0-9]/g, "");
  const account = await prisma.account.create({
    data: {
      personId: person.id,
      username,
      passwordHash: await bcrypt.hash(PASSWORD, 10),
      status: "ACTIVE",
      roleGrants: { create: [{ roleId: role.id, scopeType: "DEPARTMENT" }] },
    },
  });
  createdAccountIds.push(account.id);
  return { person, account, username };
}

async function addSupervision(managerPersonId: string, subordinatePersonId: string, offsetDays = 0) {
  const row = await prisma.personSupervision.create({
    data: {
      managerPersonId,
      subordinatePersonId,
      scopeType: "UNIT",
      effectiveFrom: new Date(Date.now() - (10 + offsetDays) * 86400000),
      status: "CONFIRMED",
    },
  });
  createdSupervisionIds.push(row.id);
}

async function createTask(input: {
  suffix: string;
  title: string;
  ownerId: string;
  unitId: string;
  collaboratorIds?: string[];
  withParticipantRows?: boolean;
  status?: string;
}) {
  const todayNoon = new Date();
  todayNoon.setHours(12, 0, 0, 0);
  const task = await prisma.task.create({
    data: {
      code: `${TAG}-${input.suffix}`,
      title: input.title,
      ownerId: input.ownerId,
      unitId: input.unitId,
      status: input.status || "IN_PROGRESS",
      priority: "Trung bình",
      originalDeadline: todayNoon,
      currentDeadline: todayNoon,
      actualResultText: "Đã hoàn thành nội dung theo yêu cầu.",
      assignees:
        input.collaboratorIds && input.collaboratorIds.length > 0
          ? { create: input.collaboratorIds.map((personId) => ({ personId, role: "COLLABORATOR" })) }
          : undefined,
    },
  });
  createdTaskIds.push(task.id);
  if (input.withParticipantRows) {
    await prisma.taskParticipantResult.createMany({
      data: [
        { taskId: task.id, personId: input.ownerId, role: "OWNER", partStatus: "NOT_STARTED", legacy: false },
        ...(input.collaboratorIds || []).map((personId) => ({
          taskId: task.id,
          personId,
          role: "COLLABORATOR",
          partStatus: "NOT_STARTED",
          legacy: false,
        })),
      ],
    });
  }
  return task;
}

async function submitPart(token: string, taskId: string, text: string) {
  const res = await fetch(`${BASE}/api/tasks/${taskId}/participant-results`, {
    method: "POST",
    headers: H(token),
    body: JSON.stringify({
      action: "SUBMIT",
      partResultText: text,
      partCompletedOn: new Date().toISOString().slice(0, 10),
      partProgressPercent: 100,
    }),
  });
  if (res.status !== 201) throw new Error(`submit part HTTP ${res.status}`);
}

async function cleanup() {
  try {
    if (createdTaskIds.length > 0) {
      await prisma.approvalCase.deleteMany({
        where: { caseType: "TASK_RESULT", resourceId: { in: createdTaskIds } },
      });
      await prisma.task.deleteMany({ where: { id: { in: createdTaskIds } } });
    }
    if (createdSupervisionIds.length > 0) {
      await prisma.personSupervision.deleteMany({ where: { id: { in: createdSupervisionIds } } });
    }
    if (createdAccountIds.length > 0) {
      await prisma.account.deleteMany({ where: { id: { in: createdAccountIds } } });
    }
    if (createdPersonIds.length > 0) {
      await prisma.person.deleteMany({ where: { id: { in: createdPersonIds } } });
    }
  } catch (err: any) {
    console.warn("cleanup warning:", err?.message || err);
  }
}

async function clickTestId(page: Page, testId: string) {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
    if (!el) return false;
    el.click();
    return true;
  }, testId);
}

async function clickCardButton(page: Page, code: string, text: string) {
  return page.evaluate(
    (code, text) => {
      const candidates = Array.from(document.querySelectorAll("div")).filter((el) => {
        if (!(el.textContent || "").includes(code)) return false;
        return Array.from(el.querySelectorAll("button")).some((b) =>
          (b.textContent || "").includes(text)
        );
      });
      candidates.sort((a, b) => a.querySelectorAll("*").length - b.querySelectorAll("*").length);
      const card = candidates[0];
      if (!card) return false;
      const button = Array.from(card.querySelectorAll("button")).find((b) =>
        (b.textContent || "").includes(text)
      );
      if (!button) return false;
      (button as HTMLButtonElement).click();
      return true;
    },
    code,
    text
  );
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
  if (!owner || !collab || !leader) throw new Error("Thiếu fixture demo.");
  const unitA = owner.person.assignments[0]!.unitId;
  const unitB = collab.person.assignments[0]!.unitId;

  const pre = await createTempPerson({
    suffix: "pre",
    unitId: unitA,
    fullName: `${TAG} Pre-checker`,
  });
  await addSupervision(pre.person.id, owner.personId, 1);
  await addSupervision(pre.person.id, collab.personId, 2);

  const tokOwner = await login("democb01");
  const tokCollab = await login("democb02");
  const tokLeader = await login("demold01");
  const tokPre = await login(pre.username);

  // Quick approve fixtures: legacy (no participant rows) => final-only + quality.
  const quickDesktop = await createTask({
    suffix: "QD",
    title: "[YC11-UI] Duyệt nhanh có chọn chất lượng",
    ownerId: owner.personId,
    unitId: unitA,
    withParticipantRows: false,
    status: "WAITING_REVIEW",
  });
  const quickMobile = await createTask({
    suffix: "QM",
    title: "[YC11-UI] Duyệt nhanh mobile 390",
    ownerId: owner.personId,
    unitId: unitA,
    withParticipantRows: false,
    status: "WAITING_REVIEW",
  });

  // Pre-check fixture: owner + collaborator, both pre-checked by same person.
  const precheckDesktop = await createTask({
    suffix: "PD",
    title: "[YC11-UI] Nhiệm vụ kiểm tra sơ bộ desktop",
    ownerId: owner.personId,
    unitId: unitA,
    collaboratorIds: [collab.personId],
    withParticipantRows: true,
  });
  await submitPart(tokOwner, precheckDesktop.id, "Chủ trì đã xong phần tổng hợp.");
  await submitPart(tokCollab, precheckDesktop.id, "Phối hợp đã xong phần chuyên môn.");

  const precheckMobile = await createTask({
    suffix: "PM",
    title: "[YC11-UI] Nhiệm vụ kiểm tra sơ bộ mobile 390",
    ownerId: owner.personId,
    unitId: unitA,
    collaboratorIds: [collab.personId],
    withParticipantRows: true,
  });
  await submitPart(tokOwner, precheckMobile.id, "Chủ trì đã xong phần mobile.");
  await submitPart(tokCollab, precheckMobile.id, "Phối hợp đã xong phần mobile.");

  const browser = await puppeteer.launch({
    executablePath: EXEC,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--window-size=1440,900"],
  });

  try {
    // ---------- 1. Quick approve desktop: modal + quality ----------
    console.log("\n--- Quick approve desktop ---");
    const page1 = await newPage(browser, tokLeader, 1440, 900, ["/my-work"]);
    await page1.goto(`${BASE}/my-work`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await dismissHelp(page1);
    await page1.type('input[placeholder="Tìm theo mã việc, tên việc..."]', quickDesktop.code);
    await page1.waitForFunction((code) => document.body.innerText.includes(code), { timeout: 30000 }, quickDesktop.code);
    const clicked1 = await clickCardButton(page1, quickDesktop.code, "Duyệt hoàn thành");
    check("U1 quick approve button opens picker (not legacy confirm)", clicked1);
    await page1.waitForSelector('[data-testid="quick-approve-quality-modal"]', { timeout: 15000 });
    check("U2 quality modal visible", true);
    const options = await page1.$$eval(
      '[data-testid="quick-approve-quality-select"] option',
      (els) => els.map((e) => (e as HTMLOptionElement).value)
    );
    check(
      "U3 quality options 65..100 step 5",
      ["65", "70", "75", "80", "85", "90", "95", "100"].every((v) => options.includes(v))
    );
    await page1.screenshot({ path: path.join(OUT_DIR, "01-quick-approve-desktop-modal.png") });
    await page1.select('[data-testid="quick-approve-quality-select"]', "65");
    await page1.click('[data-testid="quick-approve-confirm"]');
    await page1.waitForFunction(
      () => !document.querySelector('[data-testid="quick-approve-quality-modal"]'),
      { timeout: 20000 }
    );
    await sleep(800);
    const quickRow = await prisma.task.findUnique({ where: { id: quickDesktop.id } });
    const quickCase = await prisma.approvalCase.findFirst({
      where: { caseType: "TASK_RESULT", resourceId: quickDesktop.id },
      include: { decisions: true },
    });
    check("U4 quick approve completes Task", quickRow?.status === "COMPLETED", quickRow?.status);
    check("U5 quick approve sends quality 65", quickCase?.decisions?.[0]?.qualityPercent === 65, String(quickCase?.decisions?.[0]?.qualityPercent));
    await page1.close();

    // ---------- 2. Quick approve mobile 390 ----------
    console.log("\n--- Quick approve mobile 390 ---");
    const page2 = await newPage(browser, tokLeader, 390, 844, ["/my-work"]);
    await page2.goto(`${BASE}/my-work`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await dismissHelp(page2);
    await page2.type('input[placeholder="Tìm theo mã việc, tên việc..."]', quickMobile.code);
    await page2.waitForFunction((code) => document.body.innerText.includes(code), { timeout: 30000 }, quickMobile.code);
    const clicked2 = await clickCardButton(page2, quickMobile.code, "Duyệt hoàn thành");
    check("U6 mobile quick approve opens picker", clicked2);
    await page2.waitForSelector('[data-testid="quick-approve-quality-modal"]', { timeout: 15000 });
    const mobileMetrics = await page2.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      modalWidth: document.querySelector('[data-testid="quick-approve-quality-modal"] > div')?.getBoundingClientRect().width ?? 0,
    }));
    check(
      "U7 mobile 390 no horizontal overflow",
      mobileMetrics.scrollWidth <= mobileMetrics.clientWidth && mobileMetrics.modalWidth <= 390,
      JSON.stringify(mobileMetrics)
    );
    await page2.screenshot({ path: path.join(OUT_DIR, "02-quick-approve-mobile-390.png") });
    await page2.select('[data-testid="quick-approve-quality-select"]', "70");
    await page2.click('[data-testid="quick-approve-confirm"]');
    await page2.waitForFunction(
      () => !document.querySelector('[data-testid="quick-approve-quality-modal"]'),
      { timeout: 20000 }
    );
    await sleep(600);
    const quickMobileRow = await prisma.task.findUnique({ where: { id: quickMobile.id } });
    check("U8 mobile quick approve completes Task", quickMobileRow?.status === "COMPLETED", quickMobileRow?.status);
    await page2.close();

    // ---------- 3. Pre-check desktop ----------
    console.log("\n--- Pre-check desktop ---");
    const page3 = await newPage(browser, tokPre, 1440, 900, [`/tasks/${precheckDesktop.id}`]);
    await page3.goto(`${BASE}/tasks/${precheckDesktop.id}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await dismissHelp(page3);
    await page3.waitForSelector('[data-testid="task-precheck-panel"]', { timeout: 30000 });
    const panelText = await page3.$eval('[data-testid="task-precheck-panel"]', (el) => el.textContent || "");
    check("U9 pre-check panel visible", panelText.includes("Kiểm tra sơ bộ"));
    check("U10 pre-check pass button visible", !!(await page3.$(`[data-testid="precheck-pass-${owner.personId}"]`)));
    await page3.screenshot({ path: path.join(OUT_DIR, "03-precheck-desktop-panel.png") });
    const clickedPass1 = await clickTestId(page3, `precheck-pass-${owner.personId}`);
    check("U11 pre-check PASS click dispatched", clickedPass1);
    await page3.waitForFunction(
      (personId) =>
        !!document.querySelector(`[data-testid="precheck-status-${personId}"]`)?.textContent?.includes("Pre-check đạt"),
      { timeout: 20000 },
      owner.personId
    );
    await sleep(400);
    await page3.screenshot({ path: path.join(OUT_DIR, "04-precheck-desktop-after-pass.png") });
    const clickedPass2 = await clickTestId(page3, `precheck-pass-${collab.personId}`);
    check("U12 pre-check PASS collaborator dispatched", clickedPass2);
    await page3.waitForFunction(
      (personId) =>
        !!document.querySelector(`[data-testid="precheck-status-${personId}"]`)?.textContent?.includes("Pre-check đạt"),
      { timeout: 20000 },
      collab.personId
    );
    await sleep(400);
    const afterPassPanel = await page3.$eval('[data-testid="task-precheck-panel"]', (el) => el.textContent || "");
    check("U13 both parts pre-checked panel", afterPassPanel.includes("đã đủ") || afterPassPanel.includes("Tất cả phần bắt buộc"));
    await page3.close();

    // Owner sees ready state.
    const page4 = await newPage(browser, tokOwner, 1440, 900, [`/tasks/${precheckDesktop.id}`]);
    await page4.goto(`${BASE}/tasks/${precheckDesktop.id}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await dismissHelp(page4);
    await page4.waitForSelector('[data-testid="task-precheck-panel"]', { timeout: 30000 });
    const ownerPanel = await page4.$eval('[data-testid="task-precheck-panel"]', (el) => el.textContent || "");
    check("U14 owner sees ready-to-submit blocker state", ownerPanel.includes("Tất cả phần bắt buộc") || ownerPanel.includes("đã đủ"));
    await page4.screenshot({ path: path.join(OUT_DIR, "05-owner-precheck-ready-desktop.png") });
    await page4.close();

    // Submit overall via API, then final approver sees pre-check history in modal.
    const submitRes = await fetch(`${BASE}/api/tasks/${precheckDesktop.id}/submit-overall`, {
      method: "POST",
      headers: H(tokOwner),
      body: JSON.stringify({ actualResultText: "Kết quả chung sau kiểm tra sơ bộ." }),
    });
    check("U15 owner submits overall after pre-check", submitRes.status === 201, String(submitRes.status));

    const page5 = await newPage(browser, tokLeader, 1440, 900, ["/approvals"]);
    await page5.goto(`${BASE}/approvals`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await dismissHelp(page5);
    await page5.waitForFunction((code) => document.body.innerText.includes(code), { timeout: 30000 }, precheckDesktop.code);
    const opened = await clickCardButton(page5, precheckDesktop.code, "Chấp thuận");
    check("U16 final approver opens preview", opened);
    await page5.waitForSelector('[data-testid="approval-precheck-summary"]', { timeout: 20000 });
    const summaryText = await page5.$eval('[data-testid="approval-precheck-summary"]', (el) => el.textContent || "");
    check("U17 preview shows pre-check history", summaryText.includes("YC11-UI") || summaryText.includes("Pre-check đạt"));
    await page5.screenshot({ path: path.join(OUT_DIR, "06-approval-precheck-history-desktop.png") });
    // Chọn rõ hành động Đồng ý (không phụ thuộc initialAction của card).
    await page5.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find((b) =>
        (b.textContent || "").trim().startsWith("Đồng ý")
      );
      if (btn) (btn as HTMLButtonElement).click();
    });
    await sleep(300);
    await page5.select('[data-testid="quality-select"]', "65");
    await sleep(300);
    const submitDecision = await clickTestId(page5, "approval-submit-decision");
    check("U18 final decision button available", submitDecision);
    await page5.waitForFunction(
      () => !document.querySelector('[data-testid="approval-submit-decision"]'),
      { timeout: 20000 }
    );
    await sleep(1800);
    const finalRow = await prisma.task.findUnique({ where: { id: precheckDesktop.id } });
    check("U19 final decision completes pre-checked Task", finalRow?.status === "COMPLETED", finalRow?.status);
    await page5.close();

    // ---------- 4. Pre-check mobile 390 ----------
    console.log("\n--- Pre-check mobile 390 ---");
    const page6 = await newPage(browser, tokPre, 390, 844, [`/tasks/${precheckMobile.id}`]);
    await page6.goto(`${BASE}/tasks/${precheckMobile.id}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await dismissHelp(page6);
    await page6.waitForSelector('[data-testid="task-precheck-panel"]', { timeout: 30000 });
    const mobilePreMetrics = await page6.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    check(
      "U20 pre-check mobile 390 no horizontal overflow",
      mobilePreMetrics.scrollWidth <= mobilePreMetrics.clientWidth,
      JSON.stringify(mobilePreMetrics)
    );
    check("U21 mobile pre-check pass button visible", !!(await page6.$(`[data-testid="precheck-pass-${owner.personId}"]`)));
    await page6.screenshot({ path: path.join(OUT_DIR, "07-precheck-mobile-390.png") });
    await page6.close();
  } finally {
    await browser.close();
    await cleanup();
  }

  console.log(`\n=== KẾT QUẢ UI: ${pass} PASS / ${fail} FAIL ===`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch(async (err) => {
    console.error("\nLỖI UI TEST:", err);
    await cleanup();
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
