/**
 * YC-24 — Kiểm thử API THẬT trên môi trường test cục bộ (localhost:3100 + PostgreSQL local).
 *
 * 12 kịch bản (phần API; phần UI do scripts/test-yc24-ui.ts):
 *  S1  Phân công 1 người / 1 vị trí (snapshot nội dung; chống trùng ô)
 *  S2  Nhiều người cùng một vị trí (nhiều ô)
 *  S3  Nhiều nhóm nhiệm vụ trong cùng một ngày
 *  S4  Đổi người thực hiện — bắt buộc lý do (≥3 ký tự) + lưu vết audit
 *  S5  Cán bộ có đơn nghỉ đã duyệt — cảnh báo mềm, không chặn
 *  S6  Trùng phân công trong ngày — cờ overlapCount + cảnh báo
 *  S8  Ma trận quyền API (staff / trưởng bộ phận / lãnh đạo đơn vị / SYSTEM_ADMIN)
 *  S10 Xuất Excel đúng mẫu (cấu trúc khối in, không lặp dữ liệu, không trộn ngày)
 *  S12 Không tạo Task từ phân công; không thay đổi lịch sử khi sửa danh mục
 *  + Backward-compat dữ liệu cũ (không positionId), thông tin tổng hợp ngày, dọn dẹp sau test.
 *
 * Chạy:
 *   $env:DATABASE_URL="postgresql://postgres:postgres@localhost:54329/talung_dev"; $env:DIRECT_URL=$env:DATABASE_URL;
 *   $env:TEST_BASE_URL="http://localhost:3100"; npx tsx scripts/test-yc24-api.ts
 */
import { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3100";
const DB_URL = process.env.DIRECT_URL || process.env.DATABASE_URL || "";
if (!DB_URL.includes("localhost:54329")) {
  console.error("❌ CHẶN AN TOÀN: script chỉ chạy với DB test cục bộ (localhost:54329).");
  process.exit(1);
}
const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });
const PASSWORD = "LocalTest@2026";
const OUT_DIR = path.resolve("demo-ops/yc24-tests");

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

interface ApiResult {
  status: number;
  json: any;
  res: Response;
}

async function api(method: string, urlPath: string, token?: string, body?: any): Promise<ApiResult> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
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

/** Chờ dev server sẵn sàng (Next biên dịch theo yêu cầu). */
async function waitForServer(): Promise<void> {
  for (let i = 1; i <= 60; i++) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) {
        console.log(`• Dev server sẵn sàng (lần thử ${i}).`);
        return;
      }
    } catch {
      // chưa lên — thử lại
    }
    await sleep(2000);
  }
  throw new Error("Dev server không phản hồi sau 120 giây");
}

// ---------- Tiện ích đọc ô "gốc" của vùng merge (tránh đếm trùng dữ liệu merged) ----------
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

function countIn(texts: string[], needle: string): number {
  let n = 0;
  for (const t of texts) {
    let idx = 0;
    while ((idx = t.indexOf(needle, idx)) !== -1) {
      n++;
      idx += needle.length;
    }
  }
  return n;
}

/** Đếm số DÒNG "người thực hiện" kết thúc đúng bằng tên cán bộ (tránh trùng chuỗi con giữa các tên). */
function countPersonLines(texts: string[], fullName: string): number {
  let n = 0;
  for (const cellText of texts) {
    for (const line of cellText.split("\n")) {
      const t = line.trim();
      if (t.endsWith(fullName) && /(Đ|đ)\/c\s/.test(t)) n++;
    }
  }
  return n;
}

const TEST_FROM = new Date(2026, 9, 16, 0, 0, 0); // 16/10/2026 (bao gồm ngày nghỉ 17-18 để test cảnh báo)
const TEST_TO = new Date(2026, 9, 26, 23, 59, 59);
const ISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

let cleanupNeeded = true;

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  await waitForServer();

  console.log("=================================================================");
  console.log("YC-24 — KIỂM THỬ API (localhost) + XUẤT EXCEL");
  console.log("=================================================================\n");

  // ---------- Dọn dữ liệu test cũ trong khoảng test + vị trí test ngoài mẫu ----------
  const seedCodes = ["YC24-01", "YC24-02", "YC24-03", "YC24-04", "YC24-05", "YC24-06", "YC24-07", "YC24-08"];
  const clean0 = await prisma.dutyRoster.deleteMany({ where: { date: { gte: TEST_FROM, lte: TEST_TO } } });
  await prisma.dutyDayInfo.deleteMany({ where: { date: { gte: TEST_FROM, lte: TEST_TO } } });
  await prisma.dutyPosition.deleteMany({ where: { code: { startsWith: "YC24-" }, NOT: { code: { in: seedCodes } } } });
  if (clean0.count > 0) console.log(`• Đã dọn ${clean0.count} bản ghi phân công test cũ trong khoảng 16–26/10.`);

  // ---------- Tài khoản + dữ liệu nền ----------
  const accRows = await prisma.account.findMany({
    where: { username: { in: ["cb001", "cb002", "cb003", "cb004", "cb005", "cb006", "democb01", "democb02", "demold01", "demoadmin01"] } },
    select: {
      username: true,
      personId: true,
      person: {
        select: {
          fullName: true,
          assignments: { where: { isPrimary: true }, select: { unit: { select: { id: true, code: true } } } },
        },
      },
    },
  });
  const accOf = (u: string) => {
    const a = accRows.find((x) => x.username === u);
    if (!a) throw new Error(`Thiếu tài khoản local ${u}`);
    return { id: a.personId, name: a.person.fullName, unitId: a.person.assignments[0]?.unit?.id || null, unitCode: a.person.assignments[0]?.unit?.code || null };
  };

  const deptA = accOf("cb001");
  const deptB = accOf("cb002");
  const staff = accOf("democb01");
  const unitLeader = accOf("demold01");
  const admin = accOf("demoadmin01");
  const pB = accOf("democb02");

  // Cán bộ đơn vị A (5 người) — lấy từ DB, không phụ thuộc tên cụ thể
  const aPersons = await prisma.person.findMany({
    where: { status: "ACTIVE", assignments: { some: { isPrimary: true, unit: { code: "BP_NGHIEPVU_A" } } } },
    select: { id: true, fullName: true },
    orderBy: { fullName: "asc" },
    take: 5,
  });
  if (aPersons.length < 5) throw new Error("Cần tối thiểu 5 cán bộ bộ phận Nghiệp vụ A trong DB test");
  const [p1, p2, p3, p4, p5] = aPersons.map((p) => ({ id: p.id, name: p.fullName }));

  // Đơn nghỉ đã duyệt trong khoảng test (dùng cho S5)
  const leave = await prisma.leaveRequest.findFirst({
    where: { status: "APPROVED", startDate: { lte: TEST_TO }, endDate: { gte: TEST_FROM } },
    select: { personId: true, type: true, startDate: true, endDate: true, person: { select: { fullName: true } } },
  });
  if (!leave) throw new Error("Không có đơn nghỉ đã duyệt trong khoảng 16–26/10 để test cảnh báo (S5)");
  const leaveDate = new Date(leave.startDate);

  // Danh mục vị trí
  const posRows = await prisma.dutyPosition.findMany({ orderBy: { sortOrder: "asc" } });
  const POS: Record<string, any> = {};
  posRows.forEach((p) => (POS[p.code] = p));
  for (const c of seedCodes) if (!POS[c]) throw new Error(`Thiếu vị trí mẫu ${c} — chạy scripts/apply-yc24-ddl.ts trước`);

  console.log(`• Đơn vị: A=${deptA.unitCode} B=${deptB.unitCode}; cán bộ test A: ${aPersons.map((x) => x.fullName).join(", ")}`);
  console.log(`• Đơn nghỉ test: ${leave.person.fullName} (${leave.type}) từ ${ISO(new Date(leave.startDate))}\n`);

  // ---------- Đăng nhập ----------
  const tDeptA = await login("cb001");
  const tDeptB = await login("cb002");
  const tStaff = await login("democb01");
  const tLeader = await login("demold01");
  const tAdmin = await login("demoadmin01");
  check("A0. Đăng nhập 5 vai trò test thành công", !!(tDeptA && tDeptB && tStaff && tLeader && tAdmin));

  const taskCountBefore = await prisma.task.count();

  // =====================================================================
  // S8 (phần xem) — Quyền truy cập GET + phạm vi dữ liệu
  // =====================================================================
  console.log("\n[S8] Ma trận quyền — phần xem\n");
  const adminGet = await api("GET", `/api/rosters?from=2026-10-19&to=2026-10-25`, tAdmin);
  check("S8a. SYSTEM_ADMIN bị chặn xem lịch trực (403)", adminGet.status === 403, `HTTP ${adminGet.status}`);

  const adminPos = await api("GET", "/api/rosters/positions", tAdmin);
  check("S8b. SYSTEM_ADMIN bị chặn xem danh mục vị trí (403)", adminPos.status === 403, `HTTP ${adminPos.status}`);

  const staffGet = await api("GET", `/api/rosters?from=2026-10-19&to=2026-10-25`, tStaff);
  check("S8c. Cán bộ xem được lịch trực trong phạm vi đơn vị (200)", staffGet.status === 200);
  check(
    "S8d. Cán bộ chỉ thấy đơn vị của mình trong bộ lọc đơn vị",
    Array.isArray(staffGet.json?.units) && staffGet.json.units.length === 1 && staffGet.json.units[0].id === staff.unitId,
    `${staffGet.json?.units?.length || 0} đơn vị`
  );
  check("S8e. Cán bộ xem được danh mục vị trí (200, ≥8 vị trí mẫu)", staffGet.json?.positions?.length >= 8);

  const leaderGet = await api("GET", `/api/rosters?from=2026-10-19&to=2026-10-25`, tLeader);
  check(
    "S8f. Lãnh đạo đơn vị thấy toàn bộ đơn vị nghiệp vụ",
    leaderGet.status === 200 && Array.isArray(leaderGet.json?.units) && leaderGet.json.units.length >= 6,
    `${leaderGet.json?.units?.length || 0} đơn vị`
  );

  // =====================================================================
  // S1 — Phân công 1 người / 1 vị trí + chống trùng ô
  // =====================================================================
  console.log("\n[S1] Phân công 1 người / 1 vị trí\n");
  const s1 = await api("POST", "/api/rosters", tDeptA, {
    date: "2026-10-19",
    personId: p1.id,
    positionId: POS["YC24-04"].id,
    slotOrder: 0,
  });
  const s1Row = s1.json?.data;
  check("S1a. Trưởng bộ phận phân công được vào ô biểu (201)", s1.status === 201, `HTTP ${s1.status}`);
  check(
    "S1b. Bản ghi lưu BẢN SAO nội dung vị trí (title/order/ô) tại thời điểm phân công",
    s1Row?.positionTitle === POS["YC24-04"].title &&
      s1Row?.positionOrder === POS["YC24-04"].sortOrder &&
      s1Row?.slotKey === `${POS["YC24-04"].id}#0` &&
      s1Row?.slotLabel === null,
    `title="${s1Row?.positionTitle}" slotKey="${s1Row?.slotKey}"`
  );
  check("S1c. Bản ghi tự gắn đơn vị chính của cán bộ được phân công", s1Row?.unitId === deptA.unitId);

  const s1dup = await api("POST", "/api/rosters", tDeptA, {
    date: "2026-10-19",
    personId: p2.id,
    positionId: POS["YC24-04"].id,
    slotOrder: 0,
  });
  check("S1d. Chống trùng ô: phân công lại đúng ô/ngày đã có người → 409", s1dup.status === 409, `HTTP ${s1dup.status}`);

  const noAuth = await api("POST", "/api/rosters", undefined, { date: "2026-10-19", personId: p1.id, positionId: POS["YC24-01"].id, slotOrder: 0 });
  check("S1e. Không đăng nhập → 401", noAuth.status === 401, `HTTP ${noAuth.status}`);

  const adminPost = await api("POST", "/api/rosters", tAdmin, { date: "2026-10-19", personId: p1.id, positionId: POS["YC24-01"].id, slotOrder: 0 });
  check("S1f. SYSTEM_ADMIN không được phân công (403)", adminPost.status === 403, `HTTP ${adminPost.status}`);

  const staffPost = await api("POST", "/api/rosters", tStaff, { date: "2026-10-19", personId: p1.id, positionId: POS["YC24-01"].id, slotOrder: 0 });
  check("S1g. Cán bộ không được phân công (403)", staffPost.status === 403, `HTTP ${staffPost.status}`);

  const badSlot = await api("POST", "/api/rosters", tDeptA, { date: "2026-10-19", personId: p2.id, positionId: POS["YC24-04"].id, slotOrder: 5 });
  check("S1h. Ô ngoài phạm vi vị trí → 400", badSlot.status === 400, `HTTP ${badSlot.status}`);

  // =====================================================================
  // S2 — Nhiều người cùng một vị trí (nhiều ô)
  // =====================================================================
  console.log("\n[S2] Nhiều người cùng một vị trí\n");
  const s2a = await api("POST", "/api/rosters", tDeptA, { date: "2026-10-19", personId: p2.id, positionId: POS["YC24-02"].id, slotOrder: 0 });
  const s2b = await api("POST", "/api/rosters", tDeptA, { date: "2026-10-19", personId: p3.id, positionId: POS["YC24-02"].id, slotOrder: 1 });
  check("S2a. Ô 1 của vị trí 2 ô: phân công người thứ nhất (201)", s2a.status === 201);
  check("S2b. Ô 2 cùng vị trí: phân công người thứ hai (201)", s2b.status === 201);
  check(
    "S2c. Hai ô cùng vị trí nhưng khác người, khác slotKey",
    s2a.json?.data?.personId !== s2b.json?.data?.personId && s2a.json?.data?.slotKey !== s2b.json?.data?.slotKey
  );

  const s2day = await api("GET", "/api/rosters?from=2026-10-19&to=2026-10-19", tDeptA);
  const s2rows = (s2day.json?.data || []).filter((r: any) => r.positionId === POS["YC24-02"].id);
  check("S2d. GET theo ngày trả đủ 2 dòng của vị trí 2 ô", s2rows.length === 2, `${s2rows.length} dòng`);

  // Đơn vị B phân công cán bộ B (kiểm tra phạm vi dữ liệu 2 đơn vị)
  const bRow = await api("POST", "/api/rosters", tDeptB, { date: "2026-10-19", personId: pB.id, positionId: POS["YC24-06"].id, slotOrder: 0 });
  check("S2e. Trưởng bộ phận B phân công cán bộ B vào ô có nhãn (NC) thành công", bRow.status === 201 && bRow.json?.data?.slotLabel === "NC", `HTTP ${bRow.status}, nhãn="${bRow.json?.data?.slotLabel}"`);

  // =====================================================================
  // S3 — Nhiều nhóm nhiệm vụ trong cùng một ngày
  // =====================================================================
  console.log("\n[S3] Nhiều nhóm nhiệm vụ trong cùng một ngày (20/10)\n");
  const s3a = await api("POST", "/api/rosters", tDeptA, { date: "2026-10-20", personId: p4.id, positionId: POS["YC24-01"].id, slotOrder: 0 });
  const s3b = await api("POST", "/api/rosters", tDeptA, { date: "2026-10-20", personId: p1.id, positionId: POS["YC24-05"].id, slotOrder: 0 });
  const s3c = await api("POST", "/api/rosters", tDeptA, { date: "2026-10-20", personId: p2.id, positionId: POS["YC24-07"].id, slotOrder: 0 });
  const s3day = await api("GET", "/api/rosters?from=2026-10-20&to=2026-10-20", tDeptA);
  const s3rows = s3day.json?.data || [];
  const s3posIds = new Set(s3rows.map((r: any) => r.positionId));
  check(
    "S3a. Một ngày có nhiều nhóm nhiệm vụ khác nhau (3 nhóm, 3 cán bộ)",
    s3a.status === 201 && s3b.status === 201 && s3c.status === 201 && s3rows.length === 3 && s3posIds.size === 3,
    `${s3rows.length} dòng / ${s3posIds.size} nhóm`
  );
  check(
    "S3b. Thứ tự trả về theo số TT trên biểu (1 → 5 → 7)",
    s3rows.map((r: any) => r.positionOrder).join(",") === "1,5,7",
    s3rows.map((r: any) => r.positionOrder).join(",")
  );

  // =====================================================================
  // S4 — Đổi người thực hiện (bắt buộc lý do) + lưu vết
  // =====================================================================
  console.log("\n[S4] Đổi người thực hiện — bắt buộc lý do + lưu vết\n");
  const s4noReason = await api("PATCH", "/api/rosters", tDeptA, { id: s1Row!.id, personId: p2.id });
  check("S4a. Đổi người KHÔNG ghi lý do → 400", s4noReason.status === 400, `HTTP ${s4noReason.status}`);

  const s4short = await api("PATCH", "/api/rosters", tDeptA, { id: s1Row!.id, personId: p2.id, reason: "ab" });
  check("S4b. Lý do quá ngắn (2 ký tự) → 400", s4short.status === 400, `HTTP ${s4short.status}`);

  const s4cross = await api("PATCH", "/api/rosters", tDeptA, { id: s1Row!.id, personId: pB.id, reason: "Đổi sang cán bộ bộ phận khác" });
  check("S4c. Đổi sang cán bộ NGOÀI phạm vi bộ phận → 403", s4cross.status === 403, `HTTP ${s4cross.status}`);

  const s4 = await api("PATCH", "/api/rosters", tDeptA, { id: s1Row!.id, personId: p2.id, reason: "Điều chỉnh theo phân công mới của Lãnh đạo đội" });
  check("S4d. Đổi người kèm lý do hợp lệ → 200", s4.status === 200, `HTTP ${s4.status}`);
  check(
    "S4e. Bản ghi cập nhật đúng người mới + giữ nguyên vị trí/ô",
    s4.json?.data?.personId === p2.id && s4.json?.data?.positionId === POS["YC24-04"].id && s4.json?.data?.slotOrder === 0
  );

  const auditUpd = await prisma.auditEvent.findFirst({
    where: { action: "ROSTER_UPDATE", resourceId: s1Row!.id },
    orderBy: { timestamp: "desc" },
  });
  const auOld: any = auditUpd?.oldData || {};
  const auNew: any = auditUpd?.newData || {};
  check(
    "S4f. Lưu vết audit: người cũ → người mới + lý do được ghi lại",
    !!auditUpd && auOld.personId === p1.id && auNew.personId === p2.id && String(auNew.reason).includes("Điều chỉnh"),
    `old=${auOld.personId?.slice(0, 8)}… new=${auNew.personId?.slice(0, 8)}…`
  );

  // =====================================================================
  // S5 — Cán bộ có đơn nghỉ đã duyệt (cảnh báo mềm)
  // =====================================================================
  console.log("\n[S5] Cán bộ có đơn nghỉ đã duyệt — cảnh báo, không chặn\n");
  const s5 = await api("POST", "/api/rosters", tLeader, {
    date: ISO(leaveDate),
    personId: leave.personId,
    positionId: POS["YC24-01"].id,
    slotOrder: 0,
  });
  check("S5a. Vẫn CHO LƯU phân công (không chặn cứng) → 201", s5.status === 201, `HTTP ${s5.status}`);
  check("S5b. Phản hồi kèm cảnh báo trùng đơn nghỉ đã duyệt", !!s5.json?.warning && !!s5.json?.data?.leaveClash, `${s5.json?.warning || "(không có cảnh báo)"}`);

  const s5day = await api("GET", `/api/rosters?from=${ISO(leaveDate)}&to=${ISO(leaveDate)}`, tLeader);
  const s5row = (s5day.json?.data || []).find((r: any) => r.personId === leave.personId);
  check("S5c. GET kèm cờ leaveClash trên dòng bị trùng", !!s5row?.leaveClash, `leaveClash=${JSON.stringify(s5row?.leaveClash)}`);
  check(
    "S5d. GET trả danh sách đơn nghỉ đã duyệt trong kỳ (cho cảnh báo trước khi lưu ở UI)",
    Array.isArray(s5day.json?.leaves) && s5day.json.leaves.some((l: any) => l.personId === leave.personId)
  );

  // =====================================================================
  // S6 — Trùng phân công trong ngày (một người nhiều vị trí)
  // =====================================================================
  console.log("\n[S6] Trùng phân công trong ngày\n");
  await api("POST", "/api/rosters", tDeptA, { date: "2026-10-21", personId: p2.id, positionId: POS["YC24-02"].id, slotOrder: 0 });
  await api("POST", "/api/rosters", tDeptA, { date: "2026-10-21", personId: p2.id, positionId: POS["YC24-03"].id, slotOrder: 0 });
  const s6day = await api("GET", "/api/rosters?from=2026-10-21&to=2026-10-21", tDeptA);
  const s6rows = (s6day.json?.data || []).filter((r: any) => r.personId === p2.id);
  check("S6a. Cho phép một cán bộ nhiều vị trí trong ngày (không chặn cứng)", s6rows.length === 2, `${s6rows.length} dòng`);
  check("S6b. Cờ overlapCount = 2 để UI cảnh báo trùng phân công", s6rows.every((r: any) => r.overlapCount === 2));

  // =====================================================================
  // S8 (phần sửa) — Danh mục vị trí: quyền + snapshot + ngừng sử dụng
  // =====================================================================
  console.log("\n[S8] Ma trận quyền — phần sửa danh mục + snapshot\n");
  const catDept = await api("PATCH", "/api/rosters/positions", tDeptA, { id: POS["YC24-01"].id, title: "Trực lãnh đạo (đổi thử)" });
  check("S8g. Trưởng bộ phận KHÔNG được sửa danh mục vị trí (403)", catDept.status === 403, `HTTP ${catDept.status}`);
  const catStaff = await api("PATCH", "/api/rosters/positions", tStaff, { id: POS["YC24-01"].id, title: "Trực lãnh đạo (đổi thử)" });
  check("S8h. Cán bộ KHÔNG được sửa danh mục vị trí (403)", catStaff.status === 403, `HTTP ${catStaff.status}`);
  const catAdmin = await api("PATCH", "/api/rosters/positions", tAdmin, { id: POS["YC24-01"].id, title: "Trực lãnh đạo (đổi thử)" });
  check("S8i. SYSTEM_ADMIN KHÔNG được sửa danh mục vị trí (403)", catAdmin.status === 403, `HTTP ${catAdmin.status}`);

  const catLeader = await api("PATCH", "/api/rosters/positions", tLeader, { id: POS["YC24-01"].id, title: "Trực lãnh đạo (KIỂM THỬ)" });
  check("S8j. Lãnh đạo đơn vị sửa được danh mục (200)", catLeader.status === 200, `HTTP ${catLeader.status}`);

  const snapCheck = await api("GET", `/api/rosters?from=${ISO(leaveDate)}&to=2026-10-20`, tLeader);
  const snapRow = (snapCheck.json?.data || []).find((r: any) => r.positionId === POS["YC24-01"].id);
  check(
    "S12a. Sửa danh mục KHÔNG làm thay đổi lịch sử: bản ghi cũ giữ nguyên tiêu đề đã ghi",
    !!snapRow && snapRow.positionTitle === POS["YC24-01"].title,
    `bản ghi="${snapRow?.positionTitle}" — danh mục mới="Trực lãnh đạo (KIỂM THỬ)"`
  );

  await api("PATCH", "/api/rosters/positions", tLeader, { id: POS["YC24-01"].id, title: POS["YC24-01"].title });
  const catBack = await prisma.dutyPosition.findUnique({ where: { id: POS["YC24-01"].id } });
  check("S12b. Khôi phục tên danh mục về nguyên trạng", norm(catBack?.title) === norm(POS["YC24-01"].title));

  await api("PATCH", "/api/rosters/positions", tLeader, { id: POS["YC24-07"].id, status: "INACTIVE" });
  const inactivePost = await api("POST", "/api/rosters", tDeptA, { date: "2026-10-22", personId: p3.id, positionId: POS["YC24-07"].id, slotOrder: 0 });
  check("S8k. Vị trí ngừng sử dụng: KHÔNG cho phân công mới (400)", inactivePost.status === 400, `HTTP ${inactivePost.status}`);
  await api("PATCH", "/api/rosters/positions", tLeader, { id: POS["YC24-07"].id, status: "ACTIVE" });
  const reactivated = await prisma.dutyPosition.findUnique({ where: { id: POS["YC24-07"].id } });
  check("S8l. Bật lại trạng thái vị trí về ACTIVE", reactivated?.status === "ACTIVE");

  const seedAgain = await api("POST", "/api/rosters/positions", tLeader, { action: "seed-defaults" });
  check("S8m. Khôi phục vị trí mẫu là idempotent (đủ 8 mẫu → tạo thêm 0)", seedAgain.status === 200 && seedAgain.json?.created === 0, `created=${seedAgain.json?.created}`);

  const newPos = await api("POST", "/api/rosters/positions", tLeader, { title: "[TEST] Vị trí kiểm thử tự động YC-24", detail: "Dòng phụ kiểm thử", slots: [{ k: "s1", l: null }] });
  check("S8n. Lãnh đạo đơn vị tạo vị trí mới (201, mã tự sinh)", newPos.status === 201 && /^YC24-\d+$/.test(newPos.json?.data?.code || ""), `mã=${newPos.json?.data?.code}`);
  const newPosId = newPos.json?.data?.id;
  const newPosSlot = await api("PATCH", "/api/rosters/positions", tLeader, { id: newPosId, slots: [{ k: "s1", l: null }, { k: "s2", l: "K2" }] });
  check("S8o. Sửa số ô + nhãn ô của vị trí (200)", newPosSlot.status === 200 && Array.isArray(newPosSlot.json?.data?.slots) && newPosSlot.json.data.slots.length === 2);
  const newPosAssign = await api("POST", "/api/rosters", tDeptA, { date: "2026-10-22", personId: p4.id, positionId: newPosId, slotOrder: 1 });
  check("S8p. Phân công ngay vào vị trí mới, đúng ô có nhãn (201, nhãn K2)", newPosAssign.status === 201 && newPosAssign.json?.data?.slotLabel === "K2", `HTTP ${newPosAssign.status}`);

  // =====================================================================
  // Thông tin tổng hợp ngày (Tổng số công chức / Có mặt / Vắng / Lý do)
  // =====================================================================
  console.log("\n[Phần bổ sung] Thông tin tổng hợp ngày\n");
  const diStaff = await api("PUT", "/api/rosters/day-info", tStaff, { date: "2026-10-19", totalStaff: 24 });
  check("B1. Cán bộ không được sửa thông tin tổng hợp ngày (403)", diStaff.status === 403, `HTTP ${diStaff.status}`);
  const diAdmin = await api("PUT", "/api/rosters/day-info", tAdmin, { date: "2026-10-19", totalStaff: 24 });
  check("B2. SYSTEM_ADMIN không được sửa thông tin tổng hợp ngày (403)", diAdmin.status === 403, `HTTP ${diAdmin.status}`);
  const diBad = await api("PUT", "/api/rosters/day-info", tDeptA, { date: "2026-10-19", totalStaff: -5 });
  check("B3. Số liệu âm → 400", diBad.status === 400, `HTTP ${diBad.status}`);
  const diPut = await api("PUT", "/api/rosters/day-info", tDeptA, {
    date: "2026-10-19",
    totalStaff: 24,
    presentStaff: 22,
    absentCount: 2,
    absentReason: "01 nghỉ phép, 01 đi công tác",
  });
  check("B4. Trưởng bộ phận lưu thông tin tổng hợp ngày (200)", diPut.status === 200, `HTTP ${diPut.status}`);
  const diPut2 = await api("PUT", "/api/rosters/day-info", tDeptA, { date: "2026-10-19", notes: "Lưu lần 2 (upsert)" });
  check("B5. Lưu lần 2 cùng ngày KHÔNG tạo bản ghi trùng (upsert)", diPut2.status === 200 && diPut2.json?.data?.id === diPut.json?.data?.id);
  const diGet = await api("GET", "/api/rosters/day-info?from=2026-10-19&to=2026-10-25", tDeptA);
  check(
    "B6. GET thông tin ngày trả đúng số liệu đã nhập",
    (diGet.json?.data || []).some((d: any) => d.presentStaff === 22 && d.absentCount === 2 && String(d.absentReason).includes("nghỉ phép"))
  );

  // =====================================================================
  // Backward-compat: dữ liệu cũ không gắn vị trí (ca trực cũ)
  // =====================================================================
  console.log("\n[Backward-compat] Bản ghi cũ không gắn vị trí\n");
  const legacy = await api("POST", "/api/rosters", tDeptA, { date: "2026-10-23", shift: "SANG", post: "Kiểm tra hồ sơ", personId: p1.id });
  check("C1. Vẫn nhận body cũ (date/shift/post) → 201, slotKey rỗng", legacy.status === 201 && legacy.json?.data?.slotKey === null && legacy.json?.data?.positionId === null, `HTTP ${legacy.status}`);
  const legacyGet = await api("GET", "/api/rosters?from=2026-10-23&to=2026-10-23", tDeptA);
  check("C2. Dữ liệu cũ hiện trong GET theo ngày", (legacyGet.json?.data || []).length === 1);

  // =====================================================================
  // S10 — Xuất Excel đúng mẫu
  // =====================================================================
  console.log("\n[S10] Xuất Excel theo mẫu\n");
  const staffExport = await api("GET", "/api/rosters/export?from=2026-10-19&to=2026-10-25", tStaff);
  check("S10a. Cán bộ (không có quyền reports.export) bị chặn xuất (403)", staffExport.status === 403, `HTTP ${staffExport.status}`);
  const longExport = await api("GET", "/api/rosters/export?from=2026-10-01&to=2026-11-15", tDeptA);
  check("S10b. Khoảng xuất > 31 ngày → 400", longExport.status === 400, `HTTP ${longExport.status}`);

  const exportRes = await fetch(`${BASE_URL}/api/rosters/export?from=2026-10-17&to=2026-10-25`, {
    headers: { Authorization: `Bearer ${tDeptA}` },
  });
  check("S10c. Trưởng bộ phận xuất được file .xlsx (200)", exportRes.status === 200, `HTTP ${exportRes.status}`);
  const buf = Buffer.from(await exportRes.arrayBuffer());
  const xlsxPath = path.join(OUT_DIR, "export-17-25.xlsx");
  fs.writeFileSync(xlsxPath, buf);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsxPath);
  const sheetNames = wb.worksheets.map((w) => w.name);
  check(
    "S10d. File có trang bìa + các trang khối in (9 ngày → 3 trang khối)",
    sheetNames[0] === "Bìa" && wb.worksheets.length === 4,
    sheetNames.join(" | ")
  );
  const coverTexts = masterTexts(wb.getWorksheet("Bìa")!);
  check(
    "S10e. Trang bìa đúng mẫu (tên sổ + NĂM của kỳ xuất)",
    coverTexts.some((t) => t.includes("2026")) && coverTexts.some((t) => /phân công nhiệm vụ/i.test(t)),
    coverTexts.slice(0, 3).join(" / ")
  );

  const daySheets = ["Phân công 1", "Phân công 2", "Phân công 3"].map((n) => wb.getWorksheet(n)!).filter(Boolean);
  const allTexts = daySheets.flatMap((ws) => masterTexts(ws));
  const joined = allTexts.join("\n");

  let dateOk = true;
  const dateDetail: string[] = [];
  for (let d = 17; d <= 25; d++) {
    const line = `Ngày ${d} tháng 10 năm 2026`;
    const n = countIn(allTexts, line);
    if (n !== 1) dateOk = false;
    dateDetail.push(`${d}:${n}`);
  }
  check("S10f. Mỗi ngày xuất hiện ĐÚNG 1 khối (không nhân bản vùng mẫu lặp)", dateOk, dateDetail.join(" "));

  // Người thực hiện: đếm số lần xuất hiện = số phân công thật của người đó trong kỳ (chỉ đơn vị A)
  const rangeRows = await prisma.dutyRoster.findMany({
    where: { date: { gte: new Date(2026, 9, 17), lte: new Date(2026, 9, 25, 23, 59, 59) }, unitId: deptA.unitId },
    select: { personId: true, person: { select: { fullName: true } } },
  });
  const expectedByPerson = new Map<string, { name: string; n: number }>();
  for (const r of rangeRows) {
    const e = expectedByPerson.get(r.personId) || { name: r.person.fullName, n: 0 };
    e.n++;
    expectedByPerson.set(r.personId, e);
  }
  let personOk = true;
  const personDetail: string[] = [];
  for (const [, e] of expectedByPerson) {
    const cnt = countPersonLines(allTexts, e.name);
    if (cnt !== e.n) personOk = false;
    personDetail.push(`${e.name}: ${cnt}/${e.n}`);
  }
  check("S10g. Người thực hiện xuất hiện đúng số lần = số ô được phân công (không trùng, không sót)", personOk && expectedByPerson.size > 0, personDetail.join("; "));

  check("S10h. Cán bộ đơn vị B KHÔNG lọt vào file xuất của đơn vị A", !joined.includes(pB.name), pB.name);
  check(
    "S10i. Ô tổng hợp ngày chỉ điền khi đã nhập (19/10) và đúng số liệu",
    joined.includes("Tổng số công chức:24Có mặt:22Vắng:2") && joined.includes("01 nghỉ phép, 01 đi công tác")
  );
  check(
    "S10j. Ngày chưa nhập tổng hợp in dòng chấm mẫu (không bịa số)",
    joined.includes("Tổng số công chức:………Có mặt:……Vắng:……………") || joined.includes("Tổng số công chức:……"),
    ""
  );
  const legacyTaskCount = countIn(allTexts, "Kiểm tra hồ sơ");
  const legacyPersonCount = countPersonLines(allTexts, p1.name);
  check(
    "S10k. Bản ghi cũ (không vị trí) được in nối tiếp trong khối ngày 23/10",
    legacyTaskCount >= 1 && legacyPersonCount >= 2,
    `task="${legacyTaskCount} lần", người "${p1.name}": ${legacyPersonCount} dòng (kỳ vọng ≥2: 1 vị trí + 1 bản ghi cũ)`
  );

  const ps1 = daySheets[0].pageSetup || {};
  check(
    "S10l. Cấu trúc in: A4 ngang, vừa 1 trang rộng × 1 trang cao",
    (ps1 as any).paperSize === 9 && (ps1 as any).orientation === "landscape" && (ps1 as any).fitToPage === true && (ps1 as any).fitToWidth === 1 && (ps1 as any).fitToHeight === 1,
    JSON.stringify({ paperSize: (ps1 as any).paperSize, orientation: (ps1 as any).orientation, fitToPage: (ps1 as any).fitToPage })
  );
  const heights = [5, 6, 7, 8, 9, 10, 11, 12].map((r) => daySheets[0].getRow(r).height);
  check(
    "S10m. Chiều cao dòng bám mẫu (5..12: 30.75 / 42.75 / 40.5 / 29.25 / 45.75 / 42.75 / 26.25 / 99.75)",
    JSON.stringify(heights) === JSON.stringify([30.75, 42.75, 40.5, 29.25, 45.75, 42.75, 26.25, 99.75]),
    JSON.stringify(heights)
  );
  const merges0: string[] = ((daySheets[0] as any).model?.merges as string[]) || [];
  const sameRowMergeRows = (col1: "A" | "D", col2: "C" | "F"): number[] =>
    merges0
      .map((m) => m.match(new RegExp(`^${col1}(\\d+):${col2}(\\d+)$`)))
      .filter((m): m is RegExpMatchArray => !!m && m[1] === m[2])
      .map((m) => Number(m[1]))
      .sort((a, b) => a - b);
  const consecRuns = (rows: number[]): number[][] => {
    const out: number[][] = [];
    for (const r of rows) {
      const last = out[out.length - 1];
      if (last && r === last[last.length - 1] + 1) last.push(r);
      else out.push([r]);
    }
    return out;
  };
  const runsA = consecRuns(sameRowMergeRows("A", "C")).map((r) => r.length).sort((a, b) => a - b);
  const runsD = consecRuns(sameRowMergeRows("D", "F")).map((r) => r.length).sort((a, b) => a - b);
  check(
    "S10n. Vùng gộp ô bám mẫu: mỗi cột có 2 cụm tiêu đề (3 dòng) + 2 cụm cuối khối (5 dòng)",
    JSON.stringify(runsA) === "[3,3,5,5]" &&
      JSON.stringify(runsD) === "[3,3,5,5]" &&
      merges0.includes("A1:C1") &&
      merges0.includes("D3:F3"),
    `A=[${runsA.join(",")}] D=[${runsD.join(",")}]`
  );

  // Xuất gọn: bỏ trang bìa + chỉ ngày có phân công
  const exportSkip = await fetch(`${BASE_URL}/api/rosters/export?from=2026-10-17&to=2026-10-25&skipEmpty=1&cover=0`, {
    headers: { Authorization: `Bearer ${tDeptA}` },
  });
  const bufSkip = Buffer.from(await exportSkip.arrayBuffer());
  fs.writeFileSync(path.join(OUT_DIR, "export-skip.xlsx"), bufSkip);
  const wbSkip = new ExcelJS.Workbook();
  await wbSkip.xlsx.load(bufSkip as any);
  const skipNames = wbSkip.worksheets.map((w) => w.name);
  const skipTexts = wbSkip.worksheets.flatMap((ws) => masterTexts(ws));
  check(
    "S10o. Bỏ trang bìa + bỏ ngày trống: không có 'Bìa', không còn ngày 24-25/10",
    !skipNames.includes("Bìa") && !skipTexts.some((t) => t.includes("Ngày 24 tháng 10")) && !skipTexts.some((t) => t.includes("Ngày 25 tháng 10")),
    skipNames.join(" | ")
  );

  // Xuất theo từng ngày (đúng 1 khối)
  const dayExport = await fetch(`${BASE_URL}/api/rosters/export?from=2026-10-19&to=2026-10-19`, { headers: { Authorization: `Bearer ${tDeptA}` } });
  const wbDay = new ExcelJS.Workbook();
  const dayBuf = Buffer.from(await dayExport.arrayBuffer());
  const dayTmp = path.join(OUT_DIR, "export-19-19.xlsx");
  fs.writeFileSync(dayTmp, dayBuf);
  await wbDay.xlsx.readFile(dayTmp);
  const daySheet = wbDay.worksheets.find((w) => w.name !== "Bìa")!;
  const dayTexts = masterTexts(daySheet);
  check(
    "S10p. Xuất một ngày: đúng 1 khối của ngày đó, các ngày khác không xuất hiện",
    countIn(dayTexts, "Ngày 19 tháng 10 năm 2026") === 1 && !dayTexts.some((t) => t.includes("Ngày 20 tháng 10"))
  );

  // =====================================================================
  // S12 — Không tạo Task; dữ liệu cũ độc lập
  // =====================================================================
  console.log("\n[S12] Không tạo Task từ phân công\n");
  const taskCountAfter = await prisma.task.count();
  check("S12c. Phân công nhiệm vụ KHÔNG tạo Task (bảng tasks không đổi)", taskCountAfter === taskCountBefore, `${taskCountBefore} → ${taskCountAfter}`);

  // =====================================================================
  // S8 — Phạm vi dữ liệu khi xem (2 đơn vị)
  // =====================================================================
  console.log("\n[S8] Phạm vi dữ liệu theo đơn vị\n");
  const dayScope = await api("GET", "/api/rosters?from=2026-10-19&to=2026-10-19", tDeptB);
  check(
    "S8q. Trưởng bộ phận B chỉ thấy phân công thuộc bộ phận B",
    dayScope.status === 200 && (dayScope.json?.data || []).length > 0 && (dayScope.json?.data || []).every((r: any) => r.unitId === deptB.unitId),
    `${dayScope.json?.data?.length || 0} dòng`
  );
  const crossView = await api("GET", `/api/rosters?from=2026-10-19&to=2026-10-19&unitId=${deptA.unitId}`, tDeptB);
  check("S8r. Xem lịch đơn vị ngoài phạm vi → 403", crossView.status === 403, `HTTP ${crossView.status}`);
  const crossViewExport = await api("GET", `/api/rosters/export?from=2026-10-19&to=2026-10-19&unitId=${deptA.unitId}`, tDeptB);
  check("S8s. Xuất lịch đơn vị ngoài phạm vi → 403", crossViewExport.status === 403, `HTTP ${crossViewExport.status}`);
  const staffScope = await api("GET", "/api/rosters?from=2026-10-19&to=2026-10-19", tStaff);
  check(
    "S8t. Cán bộ A chỉ thấy dữ liệu bộ phận A",
    (staffScope.json?.data || []).length > 0 && (staffScope.json?.data || []).every((r: any) => r.unitId === staff.unitId)
  );

  // =====================================================================
  // DELETE + audit + dọn dẹp
  // =====================================================================
  console.log("\n[DELETE] Gỡ phân công + lưu vết\n");
  const bRowId = bRow.json?.data?.id;
  const delOther = await api("DELETE", `/api/rosters?id=${s1Row!.id}`, tDeptB);
  check("D1. Trưởng bộ phận B không gỡ được phân công của bộ phận A (403)", delOther.status === 403, `HTTP ${delOther.status}`);
  const delStaff = await api("DELETE", `/api/rosters?id=${bRowId}`, tStaff);
  check("D2. Cán bộ không gỡ được phân công (403)", delStaff.status === 403, `HTTP ${delStaff.status}`);
  const delOk = await api("DELETE", `/api/rosters?id=${bRowId}&reason=Kiểm thử chức năng gỡ`, tDeptB);
  check("D3. Trưởng bộ phận gỡ phân công của bộ phận mình (200)", delOk.status === 200, `HTTP ${delOk.status}`);
  const auditDel = await prisma.auditEvent.findFirst({ where: { action: "ROSTER_DELETE", resourceId: bRowId }, orderBy: { timestamp: "desc" } });
  check("D4. Lưu vết audit khi gỡ phân công (có nội dung cũ + lý do)", !!auditDel && String((auditDel.newData as any)?.reason || "").includes("Kiểm thử"));

  const auditCreateCount = await prisma.auditEvent.count({ where: { action: "ROSTER_CREATE", resourceId: s1Row!.id } });
  check("D5. Audit phân công lần đầu được ghi cho bản ghi S1", auditCreateCount >= 1);

  // ---------- Dọn dẹp toàn bộ dữ liệu test (qua API + DB local) ----------
  console.log("\n[Dọn dẹp] Xóa dữ liệu test, trả DB về trạng thái trước test\n");
  const remaining = await prisma.dutyRoster.findMany({ where: { date: { gte: TEST_FROM, lte: TEST_TO } }, select: { id: true } });
  let deleted = 0;
  for (const r of remaining) {
    const res = await api("DELETE", `/api/rosters?id=${r.id}&reason=Dọn dẹp sau kiểm thử tự động`, tLeader);
    if (res.status === 200) deleted++;
  }
  const leftoverRows = await prisma.dutyRoster.count({ where: { date: { gte: TEST_FROM, lte: TEST_TO } } });
  await prisma.dutyRoster.deleteMany({ where: { date: { gte: TEST_FROM, lte: TEST_TO } } });
  await prisma.dutyDayInfo.deleteMany({ where: { date: { gte: TEST_FROM, lte: TEST_TO } } });
  const posClean = await prisma.dutyPosition.deleteMany({ where: { code: { startsWith: "YC24-" }, NOT: { code: { in: seedCodes } } } });
  check("E1. Dọn sạch phân công test qua API (còn lại: 0)", leftoverRows === 0, `đã xóa ${deleted}/${remaining.length} qua API`);
  check("E2. Dọn vị trí test tự sinh + thông tin ngày test", posClean.count >= 1);

  const finalGet = await api("GET", `/api/rosters?from=2026-10-16&to=2026-10-26`, tLeader);
  check("E3. Sau dọn dẹp: khoảng test trống hoàn toàn", (finalGet.json?.data || []).length === 0, `${finalGet.json?.data?.length || 0} dòng`);
  const posCount = await prisma.dutyPosition.count();
  check("E4. Danh mục còn đúng 8 vị trí mẫu", posCount === 8, `${posCount} vị trí`);
  cleanupNeeded = false;

  // ---------- Tổng kết ----------
  const summary = { passed, failed, failures, at: new Date().toISOString() };
  fs.writeFileSync(path.join(OUT_DIR, "api-test-summary.json"), JSON.stringify(summary, null, 2));
  console.log("\n=================================================================");
  console.log(`KẾT QUẢ API: ${passed} PASS / ${failed} FAIL`);
  if (failed > 0) {
    console.log("Các mục FAIL:");
    for (const f of failures) console.log("  - " + f);
  }
  console.log("=================================================================");
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error("❌ LỖI CHẠY TEST:", e.message);
  if (cleanupNeeded) {
    try {
      await prisma.dutyRoster.deleteMany({ where: { date: { gte: TEST_FROM, lte: TEST_TO } } });
      await prisma.dutyDayInfo.deleteMany({ where: { date: { gte: TEST_FROM, lte: TEST_TO } } });
      await prisma.dutyPosition.deleteMany({ where: { code: { startsWith: "YC24-" }, NOT: { code: { in: ["YC24-01", "YC24-02", "YC24-03", "YC24-04", "YC24-05", "YC24-06", "YC24-07", "YC24-08"] } } } });
      console.log("• Đã dọn dữ liệu test do lỗi giữa chừng.");
    } catch {}
  }
  await prisma.$disconnect();
  process.exit(1);
});
