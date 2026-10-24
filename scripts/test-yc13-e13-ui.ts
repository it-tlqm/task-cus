/**
 * S5 / YC-13 — E13 (V3.2) — Kiểm thử GIAO DIỆN THẬT (puppeteer) trên DB test talung_v3_roster, port 3115.
 *
 * Phủ 2 quyết định có hành vi UI:
 *  - A0: ô TRỐNG không có nút/ô nhập ghi chú; ghi chú chỉ thuộc dòng đã có người;
 *        không phát sinh request ghi chú cho ô trống; dòng đã có người vẫn hiển thị ghi chú.
 *  - C0: giữ thao tác "Đổi người" TÁCH RIÊNG (không để dropdown thay thế làm thao tác chính),
 *        bắt buộc lý do, lưu vết audit; đổi người không làm mất ghi chú.
 *
 * Chạy:
 *   $env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/talung_v3_roster"
 *   $env:TEST_BASE_URL="http://localhost:3115"
 *   npx tsx scripts/test-yc13-e13-ui.ts
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
const TEST_DATE = "2026-12-21";
const TAG = "[UI-E13]";
const OUT_DIR = path.resolve("docs/evidence/multi-session/s5-yc13-e13");

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

async function selectUnit(page: Page, unitId: string) {
  const hasSelect = await page.$('[data-testid="roster-unit-select"]');
  if (hasSelect) {
    await page.select('[data-testid="roster-unit-select"]', unitId);
    await sleep(600);
    await waitLoaded(page);
  }
}

async function openEditor(page: Page) {
  await page.click('[data-testid="roster-view-day"]');
  await page.waitForSelector('[data-testid="roster-day-input"]', { timeout: 10000 });
  await setInput(page, '[data-testid="roster-day-input"]', TEST_DATE);
  await sleep(800);
  await waitLoaded(page);
  await page.click('[data-testid="roster-btn-edit-day"]');
  await page.waitForSelector('[data-testid="editor-modal"]', { timeout: 10000 });
  await sleep(300);
}

async function newPage(browser: Browser, token: string, width: number, height: number): Promise<Page> {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
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
    where: { unitId: unit.id, status: "ACTIVE", code: { in: ["YC24-04", "YC24-02"] } },
    select: { id: true, code: true, title: true },
  });
  const posOne = positions.find((p) => p.code === "YC24-04");
  const posTwo = positions.find((p) => p.code === "YC24-02");
  if (!posOne || !posTwo) throw new Error("Thiếu danh mục vị trí test (YC24-04/02)");

  const people = await prisma.person.findMany({
    where: { account: { username: { in: ["democb01", "democb02", "cb003"] } } },
    select: { id: true, fullName: true, account: { select: { username: true } } },
  });
  const p1 = people.find((p) => p.account?.username === "democb01");
  const p2 = people.find((p) => p.account?.username === "democb02");
  const p3 = people.find((p) => p.account?.username === "cb003");
  if (!p1 || !p2 || !p3) throw new Error("Thiếu người test democb01/democb02/cb003");

  const dayStart = new Date(`${TEST_DATE}T00:00:00`);
  const dayEnd = new Date(`${TEST_DATE}T23:59:59`);
  const existing = await prisma.dutyRoster.count({ where: { date: { gte: dayStart, lte: dayEnd } } });
  if (existing > 0) {
    console.error(`❌ Đã có ${existing} bản ghi trong ngày test ${TEST_DATE}. Dừng để không xóa dữ liệu lạ.`);
    process.exit(1);
  }

  const token = await login("demold01");
  const NOTE_A = `${TAG} Ghi chú dòng có người`;
  const NOTE_B = `${TAG} Ghi chú dòng thứ hai`;
  const noteRequests: Array<{ method: string; body: any }> = [];

  try {
    // Seed: 2 dòng đã có người + ghi chú; ô YC24-02 slot 1 để TRỐNG.
    const c1 = await api("POST", "/api/rosters", token, {
      unitId: unit.id,
      date: TEST_DATE,
      personId: p1.id,
      positionId: posOne.id,
      slotOrder: 0,
      notes: NOTE_A,
    });
    if (c1.json?.data?.id) createdIds.push(c1.json.data.id);
    const c2 = await api("POST", "/api/rosters", token, {
      unitId: unit.id,
      date: TEST_DATE,
      personId: p2.id,
      positionId: posTwo.id,
      slotOrder: 0,
      notes: NOTE_B,
    });
    if (c2.json?.data?.id) createdIds.push(c2.json.data.id);
    check("S0. Seed 2 dòng có người + ghi chú", c1.status === 201 && c2.status === 201, `HTTP ${c1.status}/${c2.status}`);
    const rowId = c1.json.data.id as string;

    const browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1440,1000"],
      defaultViewport: null,
    });

    try {
      const page = await newPage(browser, token, 1440, 1000);
      page.on("request", (req) => {
        if (!req.url().includes("/api/rosters") || !["POST", "PATCH"].includes(req.method())) return;
        try {
          const body = JSON.parse(req.postData() || "{}");
          if (body && body.notes !== undefined) noteRequests.push({ method: req.method(), body });
        } catch {
          // bỏ qua request không phải JSON
        }
      });

      await page.goto(`${BASE_URL}/roster`, { waitUntil: "networkidle2", timeout: 60000 });
      await waitLoaded(page);
      await page.reload({ waitUntil: "networkidle2", timeout: 60000 });
      await waitLoaded(page);
      await selectUnit(page, unit.id);
      await waitLoaded(page);
      await openEditor(page);

      // ============ A0 — Ô TRỐNG KHÔNG CÓ GHI CHÚ ============
      check("A0-1. Editor hiển thị dòng ô trống YC24-02-1", !!(await page.$('[data-testid="slot-row-YC24-02-1"]')));
      check(
        "A0-2. Ô trống hiển thị trạng thái '— trống —'",
        (await textOf(page, '[data-testid="slot-row-YC24-02-1"]')).includes("— trống —"),
        (await textOf(page, '[data-testid="slot-row-YC24-02-1"]')).slice(0, 80)
      );
      check(
        "A0-3. Ô trống KHÔNG có nút Ghi chú",
        !(await page.$('[data-testid="slot-notes-YC24-02-1"]'))
      );
      check(
        "A0-4. Ô trống KHÔNG có ô nhập ghi chú (không thể mở panel ghi chú)",
        !(await page.$('[data-testid="slot-notes-input-YC24-02-1"]')) &&
          !(await page.$('[data-testid="slot-notes-view-YC24-02-1"]'))
      );
      const emptyRowIcons = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-testid="slot-row-YC24-02-1"] .material-symbols-outlined')).map((el) =>
          (el.textContent || "").trim()
        )
      );
      check("A0-5. Ô trống không có icon/thao tác ghi chú", !emptyRowIcons.includes("sticky_note_2"), emptyRowIcons.join(","));
      check(
        "A0-6. Dòng ĐÃ CÓ NGƯỜI vẫn hiển thị ghi chú",
        (await textOf(page, '[data-testid="slot-notes-view-YC24-04-0"]')).includes(NOTE_A)
      );
      check(
        "A0-7. Không có nút Ghi chú nào gắn với ô trống trong toàn phiếu",
        (await page.evaluate(() =>
          Array.from(document.querySelectorAll('[data-testid^="slot-row-"]')).filter(
            (row) => row.textContent?.includes("— trống —") && !!row.querySelector('[data-testid^="slot-notes-"]')
          ).length
        )) === 0
      );
      await page.$eval('[data-testid="editor-pos-YC24-02"]', (el) => (el as HTMLElement).scrollIntoView({ block: "center" }));
      await sleep(250);
      await shot(page, "01-editor-empty-slot-no-note-controls.png", false);

      // ============ C0 — ĐỔI NGƯỜI TÁCH RIÊNG + BẮT BUỘC LÝ DO ============
      check(
        "C0-1. Dòng đã có người có nút 'Đổi người' tách riêng",
        (await textOf(page, '[data-testid="slot-change-YC24-04-0"]')).includes("Đổi người")
      );
      check(
        "C0-2. Chưa bấm 'Đổi người' thì KHÔNG hiện dropdown thay thế (không phải thao tác chính)",
        !(await page.$('[data-testid="slot-select-YC24-04-0"]'))
      );
      await page.$eval('[data-testid="editor-pos-YC24-04"]', (el) => (el as HTMLElement).scrollIntoView({ block: "center" }));
      await page.click('[data-testid="slot-change-YC24-04-0"]');
      await page.waitForSelector('[data-testid="slot-select-YC24-04-0"]', { timeout: 5000 });
      check("C0-3. Bấm 'Đổi người' mới mở dropdown thay thế", !!(await page.$('[data-testid="slot-select-YC24-04-0"]')));
      await page.select('[data-testid="slot-select-YC24-04-0"]', p3.id);
      await page.waitForSelector('[data-testid="slot-reason-YC24-04-0"]', { timeout: 5000 });
      check("C0-4. Chọn người mới thì hiện ô lý do bắt buộc", !!(await page.$('[data-testid="slot-reason-YC24-04-0"]')));
      await shot(page, "02-editor-change-person-reason-required.png", false);

      const beforeChange = await prisma.dutyRoster.findUnique({ where: { id: rowId }, select: { personId: true, notes: true } });
      await page.click('[data-testid="slot-save-YC24-04-0"]');
      await page.waitForFunction(() => document.body.innerText.includes("Đổi người thực hiện phải ghi lý do"), {
        timeout: 10000,
      });
      const afterNoReason = await prisma.dutyRoster.findUnique({ where: { id: rowId }, select: { personId: true, notes: true } });
      check(
        "C0-5. Lưu đổi người thiếu lý do bị chặn (toast + DB không đổi)",
        afterNoReason?.personId === beforeChange?.personId && afterNoReason?.notes === beforeChange?.notes
      );

      const reason = `${TAG} Điều động theo phân công mới`;
      await setInput(page, '[data-testid="slot-reason-YC24-04-0"]', reason);
      await page.click('[data-testid="slot-save-YC24-04-0"]');
      await page.waitForFunction(() => document.body.innerText.includes("Đã đổi người thực hiện"), { timeout: 10000 });
      const afterChange = await prisma.dutyRoster.findUnique({
        where: { id: rowId },
        select: { personId: true, notes: true, reason: true },
      });
      check(
        "C0-6. Đổi người có lý do → lưu đúng người + lý do",
        afterChange?.personId === p3.id && afterChange?.reason === reason,
        `person="${afterChange?.personId}" reason="${afterChange?.reason}"`
      );
      check("C0-7. Đổi người qua UI giữ nguyên ghi chú", afterChange?.notes === NOTE_A, `notes="${afterChange?.notes}"`);
      const auditChange = await prisma.auditEvent.findFirst({
        where: { action: "ROSTER_UPDATE", resourceType: "DutyRoster", resourceId: rowId },
        orderBy: { timestamp: "desc" },
      });
      check(
        "C0-8. Audit UI đổi người có old/new person + lý do + old notes",
        (auditChange?.oldData as any)?.personId === p1.id &&
          (auditChange?.newData as any)?.personId === p3.id &&
          String((auditChange?.newData as any)?.reason || "").includes(TAG) &&
          (auditChange?.oldData as any)?.notes === NOTE_A,
        JSON.stringify({ old: auditChange?.oldData, new: auditChange?.newData })
      );
      check(
        "C0-9. Sau khi đổi người, dòng vẫn ở đúng ô (không tạo dòng mới)",
        (await prisma.dutyRoster.count({
          where: { date: { gte: dayStart, lte: dayEnd }, positionId: posOne.id, slotOrder: 0 },
        })) === 1
      );
      await page.waitForFunction(() => !document.body.innerText.includes("Đã đổi người thực hiện"), { timeout: 15000 });
      // Chờ toast lỗi (lần lưu thiếu lý do) tan hẳn để ảnh nghiệm thu chỉ còn trạng thái sau khi đổi người.
      await page
        .waitForFunction(() => !document.body.innerText.includes("Đổi người thực hiện phải ghi lý do"), { timeout: 12000 })
        .catch(() => {});

      // A0 (tiếp): không có request POST ghi chú nào thiếu personId trong suốt phiên UI.
      const badPost = noteRequests.filter((r) => r.method === "POST" && !(typeof r.body?.personId === "string" && r.body.personId.trim()));
      check(
        "A0-8. UI không gửi request ghi chú cho ô trống (không POST notes thiếu personId)",
        badPost.length === 0,
        `noteRequests=${noteRequests.length}, badPost=${badPost.length}`
      );
      const orphanRows = await prisma.dutyRoster.count({
        where: { date: { gte: dayStart, lte: dayEnd }, positionId: posTwo.id, slotOrder: 1 },
      });
      check("A0-9. Không có bản ghi ghi chú mồ côi ở ô trống YC24-02 slot 1", orphanRows === 0, `rows=${orphanRows}`);

      // Đóng editor (toast có thể phủ nút đóng).
      await page.evaluate(() => (document.querySelector('[data-testid="editor-close"]') as HTMLElement | null)?.click());
      await page.waitForFunction(() => !document.querySelector('[data-testid="editor-modal"]'), { timeout: 5000 });
      await shot(page, "03-day-sheet-notes-after-change.png", true);
      await page.close();
    } finally {
      await browser.close();
    }
  } catch (err: any) {
    console.error("Lỗi kiểm thử UI E13:", err?.message || err);
    failed++;
    failures.push(`EXCEPTION: ${err?.message || err}`);
  } finally {
    for (const id of createdIds) {
      await api("DELETE", `/api/rosters?id=${id}&reason=${encodeURIComponent(`${TAG} Dọn sau kiểm thử UI`)}`, token).catch(() => {});
    }
    await cleanup();
    const leftovers = await prisma.dutyRoster.count({ where: { date: { gte: dayStart, lte: dayEnd } } });
    check("Z9. Dọn sạch dữ liệu kiểm thử UI", leftovers === 0, `còn ${leftovers} bản ghi`);
    await prisma.$disconnect();
  }

  console.log(`\n===== KẾT QUẢ UI E13: ${passed} PASS / ${failed} FAIL =====`);
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
