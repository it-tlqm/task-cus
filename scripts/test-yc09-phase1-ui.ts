/**
 * YC-09 Phase 1 — UI smoke: collaborator chỉ thấy "Báo phần việc của tôi",
 * không thấy nút nộp kết quả chung; participant panel hiển thị.
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
  "test-yc09-phase1-ui"
);
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
const BASE = process.env.TEST_BASE_URL || "http://localhost:3116";
const PASSWORD = process.env.TEST_PASSWORD || "LocalTest@2026";
const OUT_DIR = path.join(process.cwd(), "docs", "evidence", "phase1");
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
      localStorage.setItem("hqtl-tour-done", JSON.stringify({ "/tasks": true, "/my-work": true }));
    } catch {}
  });
  return page;
}

async function main() {
  if (!EXEC) throw new Error("Không tìm thấy Chrome/Edge để chạy UI smoke.");
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const owner = await prisma.account.findUnique({
    where: { username: "democb01" },
    include: { person: { include: { assignments: { where: { isPrimary: true } } } } },
  });
  const collab = await prisma.account.findUnique({
    where: { username: "democb02" },
    include: { person: { include: { assignments: { where: { isPrimary: true } } } } },
  });
  if (!owner || !collab) throw new Error("Thiếu tài khoản fixture.");
  const unitId = owner.person.assignments[0]?.unitId || collab.person.assignments[0]!.unitId;

  const task = await prisma.task.create({
    data: {
      code: `YC09-UI-${Date.now().toString(36).toUpperCase()}`,
      title: "[YC09-UI] Nhiệm vụ kiểm tra giao diện phần việc",
      ownerId: owner.personId,
      unitId,
      status: "IN_PROGRESS",
      priority: "Trung bình",
      originalDeadline: new Date("2026-12-31T00:00:00.000Z"),
      currentDeadline: new Date("2026-12-31T00:00:00.000Z"),
      assignees: { create: [{ personId: collab.personId, role: "COLLABORATOR" }] },
    },
  });
  await prisma.taskParticipantResult.createMany({
    data: [
      { taskId: task.id, personId: owner.personId, role: "OWNER", partStatus: "NOT_STARTED", legacy: false },
      { taskId: task.id, personId: collab.personId, role: "COLLABORATOR", partStatus: "IN_PROGRESS", partProgressPercent: 50, legacy: false },
    ],
  });

  const token = await login("democb02");
  const browser = await puppeteer.launch({
    executablePath: EXEC,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--window-size=1440,900"],
  });
  const errors: string[] = [];
  try {
    const page = await newPage(browser, token, 1440, 900);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${BASE}/tasks/${task.id}`, { waitUntil: "networkidle2", timeout: 60000 });
    await page.waitForSelector('[data-testid="task-participants"]', { timeout: 30000 });
    await sleep(1200);
    const text = await page.evaluate(() => document.body.innerText);
    check("UI1. Participant panel hiển thị", text.includes("Phần việc theo người"));
    check("UI2. Collaborator thấy 'Báo phần việc của tôi'", text.includes("Báo phần việc của tôi"));
    check("UI3. Collaborator KHÔNG thấy nút nộp kết quả chung", !text.includes("Báo cáo tiến độ / Nộp kết quả"));
    await page.screenshot({ path: path.join(OUT_DIR, "01-collaborator-task-desktop.png"), fullPage: true });

    const mobile = await newPage(browser, token, 390, 844);
    await mobile.goto(`${BASE}/tasks/${task.id}`, { waitUntil: "networkidle2", timeout: 60000 });
    await mobile.waitForSelector('[data-testid="task-participants"]', { timeout: 30000 });
    await sleep(900);
    await mobile.screenshot({ path: path.join(OUT_DIR, "02-collaborator-task-mobile.png"), fullPage: true });
    check("UI4. Mobile render participant panel", true);
    check("UI5. Không có page error", errors.length === 0, errors.join(" | ").slice(0, 300));
  } finally {
    await browser.close();
    await prisma.approvalCase.deleteMany({
      where: { caseType: "TASK_RESULT", resourceId: task.id },
    });
    await prisma.task.delete({ where: { id: task.id } }).catch(() => null);
    await prisma.$disconnect();
  }

  console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
  if (fail > 0) process.exitCode = 1;
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exitCode = 1;
});
