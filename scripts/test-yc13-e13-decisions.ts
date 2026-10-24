/**
 * S5 / YC-13 — E13 (V3.2) — Kiểm thử QUYẾT ĐỊNH ĐÃ DUYỆT, chạy trên DB test talung_v3_roster, port 3115.
 *
 * Phủ 3 quyết định:
 *  - A0: KHÔNG cho ghi chú trên ô trống (không có người).
 *        API reject 400 với thông điệp rõ ràng; không tạo bản ghi; ghi chú của dòng đã có người giữ nguyên.
 *  - B2: Excel có SHEET PHỤ LỤC riêng "Ghi chú lịch trực" (ngày/bộ phận/người/vị trí/ghi chú);
 *        các sheet in chính thức (Bìa, Phân công N) KHÔNG bị thay đổi nội dung/định dạng.
 *  - C0: giữ thao tác "Đổi người" tách riêng, bắt buộc lý do + audit; không đổi người kiểu inline mất lý do.
 *
 * Chạy:
 *   $env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/talung_v3_roster"
 *   $env:TEST_BASE_URL="http://localhost:3115"
 *   npx tsx scripts/test-yc13-e13-decisions.ts
 */
import { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";

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
const TEST_DATE = "2026-12-20";
const TAG = "[E13-TEST]";
const ANNEX_SHEET = "Ghi chú lịch trực";
const NOTE_TEXT = `${TAG} Bàn giao ca sáng — kiểm tra hồ sơ`;
const NOTE_TEXT_2 = `${TAG} Ghi chú cập nhật trên dòng đã có người`;

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

async function api(method: string, urlPath: string, token?: string, body?: any) {
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

async function exportWorkbook(token: string, unitId: string): Promise<{ status: number; wb: ExcelJS.Workbook | null; bytes: number }> {
  const res = await fetch(
    `${BASE_URL}/api/rosters/export?from=${TEST_DATE}&to=${TEST_DATE}&unitId=${unitId}&cover=0`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const buf = Buffer.from(await res.arrayBuffer());
  if (res.status !== 200) return { status: res.status, wb: null, bytes: buf.length };
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  return { status: res.status, wb, bytes: buf.length };
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

async function latestAudit(resourceId: string, action = "ROSTER_UPDATE") {
  return prisma.auditEvent.findFirst({
    where: { action, resourceType: "DutyRoster", resourceId },
    orderBy: { timestamp: "desc" },
  });
}

function sheetNamesOf(wb: ExcelJS.Workbook): string[] {
  return wb.worksheets.map((w) => w.name);
}

/** Ảnh chụp toàn bộ giá trị ô + chiều cao dòng + merge của 1 sheet — để chứng minh sheet chính thức không đổi. */
function sheetSnapshot(ws: ExcelJS.Worksheet) {
  const cells: Record<string, string> = {};
  ws.eachRow({ includeEmpty: true }, (row, r) => {
    row.eachCell({ includeEmpty: true }, (cell, c) => {
      cells[`${r}:${c}`] = JSON.stringify(cell.value ?? null);
    });
  });
  const heights: Record<string, number | undefined> = {};
  ws.eachRow({ includeEmpty: true }, (_row, r) => {
    heights[String(r)] = ws.getRow(r).height;
  });
  return {
    cells,
    heights,
    merges: ((ws as any).model?.merges as string[]) || [],
    pageSetup: {
      paperSize: (ws.pageSetup as any)?.paperSize,
      orientation: (ws.pageSetup as any)?.orientation,
      fitToPage: (ws.pageSetup as any)?.fitToPage,
      fitToWidth: (ws.pageSetup as any)?.fitToWidth,
      fitToHeight: (ws.pageSetup as any)?.fitToHeight,
    },
  };
}

function allSheetTexts(ws: ExcelJS.Worksheet): string[] {
  const out: string[] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (cell.value === null || cell.value === undefined) return;
      if (typeof cell.value === "object" && (cell.value as any).richText) {
        out.push((cell.value as any).richText.map((t: any) => t.text).join(""));
      } else {
        out.push(String(cell.value));
      }
    });
  });
  return out;
}

async function cleanup() {
  for (const id of createdIds) {
    await prisma.dutyRoster.deleteMany({ where: { id } }).catch(() => {});
  }
  createdIds.length = 0;
}

(async () => {
  await waitForServer();
  console.log(`\nDB=${dbName} · BASE_URL=${BASE_URL} · DATE=${TEST_DATE}\n`);

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
    where: { account: { username: { in: ["democb01", "democb02", "cb003"] } } },
    select: { id: true, fullName: true, account: { select: { username: true } } },
  });
  const p1 = people.find((p) => p.account?.username === "democb01");
  const p2 = people.find((p) => p.account?.username === "democb02");
  const p3 = people.find((p) => p.account?.username === "cb003");
  if (!p1 || !p2 || !p3) throw new Error("Thiếu người test democb01/democb02/cb003");

  const tLeader = await login("demold01");

  const dayStart = new Date(`${TEST_DATE}T00:00:00`);
  const dayEnd = new Date(`${TEST_DATE}T23:59:59`);
  const existing = await prisma.dutyRoster.count({ where: { date: { gte: dayStart, lte: dayEnd } } });
  if (existing > 0) {
    console.error(`❌ Đã có ${existing} bản ghi trong ngày test ${TEST_DATE}. Dừng để không xóa dữ liệu lạ.`);
    process.exit(1);
  }

  try {
    // ==================== A0 — KHÔNG ghi chú cho ô trống ====================
    console.log("[A0] Ghi chú trên ô trống bị từ chối\n");
    const countBefore = await prisma.dutyRoster.count({ where: { date: { gte: dayStart, lte: dayEnd } } });
    const auditBefore = await prisma.auditEvent.count({ where: { action: "ROSTER_CREATE", resourceType: "DutyRoster" } });

    const orphan1 = await api("POST", "/api/rosters", tLeader, {
      unitId: unit.id,
      date: TEST_DATE,
      positionId: posOne.id,
      slotOrder: 0,
      notes: `${TAG} ghi chú mồ côi`,
    });
    check(
      "A0-1. POST ghi chú khi KHÔNG có personId → 400",
      orphan1.status === 400,
      `HTTP ${orphan1.status} "${orphan1.json?.error || ""}"`
    );
    check(
      "A0-2. Thông điệp lỗi rõ ràng (ô chưa có người / không thể lưu ghi chú)",
      /chưa có người/i.test(String(orphan1.json?.error || "")) &&
        /không thể lưu ghi chú/i.test(String(orphan1.json?.error || "")),
      String(orphan1.json?.error || "")
    );

    const orphan2 = await api("POST", "/api/rosters", tLeader, {
      unitId: unit.id,
      date: TEST_DATE,
      personId: "   ",
      positionId: posTwo.id,
      slotOrder: 1,
      notes: `${TAG} ghi chú mồ côi 2`,
    });
    check("A0-3. POST personId rỗng/khoảng trắng + notes → 400", orphan2.status === 400, `HTTP ${orphan2.status}`);

    const orphan3 = await api("POST", "/api/rosters", tLeader, {
      unitId: unit.id,
      date: TEST_DATE,
      personId: null,
      positionId: posTwo.id,
      slotOrder: 0,
      notes: `${TAG} ghi chú mồ côi 3`,
    });
    check("A0-4. POST personId=null + notes → 400", orphan3.status === 400, `HTTP ${orphan3.status}`);

    const blankNotes = await api("POST", "/api/rosters", tLeader, {
      unitId: unit.id,
      date: TEST_DATE,
      positionId: posTwo.id,
      slotOrder: 0,
      notes: "   ",
    });
    check(
      "A0-5. Ghi chú rỗng không bị coi là ghi chú — vẫn báo thiếu người (400)",
      blankNotes.status === 400 && !/không thể lưu ghi chú/i.test(String(blankNotes.json?.error || "")),
      `HTTP ${blankNotes.status} "${blankNotes.json?.error || ""}"`
    );

    const countAfter = await prisma.dutyRoster.count({ where: { date: { gte: dayStart, lte: dayEnd } } });
    const auditAfter = await prisma.auditEvent.count({ where: { action: "ROSTER_CREATE", resourceType: "DutyRoster" } });
    check("A0-6. Không tạo bản ghi nào cho ô trống", countAfter === countBefore, `before=${countBefore} after=${countAfter}`);
    check("A0-7. Không ghi audit ROSTER_CREATE cho yêu cầu bị từ chối", auditAfter === auditBefore, `before=${auditBefore} after=${auditAfter}`);

    // ==================== B2 — sheet phụ lục Excel ====================
    console.log("\n[B2] Sheet phụ lục ghi chú trong Excel\n");
    const create = await api("POST", "/api/rosters", tLeader, {
      unitId: unit.id,
      date: TEST_DATE,
      personId: p1.id,
      positionId: posOne.id,
      slotOrder: 0,
      notes: `  ${NOTE_TEXT}  `,
    });
    const rowId = create.json?.data?.id as string | undefined;
    if (rowId) createdIds.push(rowId);
    check("B2-0. Tạo dòng đã có người + ghi chú → 201", create.status === 201 && !!rowId, `HTTP ${create.status}`);
    check("B2-0b. Ghi chú được trim", create.json?.data?.notes === NOTE_TEXT, `notes="${create.json?.data?.notes}"`);

    // A0 (tiếp): yêu cầu ghi chú mồ côi không làm mất ghi chú của dòng đã có người.
    const orphanAgain = await api("POST", "/api/rosters", tLeader, {
      unitId: unit.id,
      date: TEST_DATE,
      positionId: posTwo.id,
      slotOrder: 1,
      notes: `${TAG} ghi chú mồ côi lần 2`,
    });
    const afterOrphanGet = await api("GET", `/api/rosters?from=${TEST_DATE}&to=${TEST_DATE}&unitId=${unit.id}`, tLeader);
    const keptRow = (afterOrphanGet.json?.data || []).find((r: any) => r.id === rowId);
    check(
      "A0-8. Ghi chú của dòng đã có người KHÔNG bị ảnh hưởng bởi yêu cầu ô trống",
      orphanAgain.status === 400 && keptRow?.notes === NOTE_TEXT,
      `HTTP ${orphanAgain.status}, notes="${keptRow?.notes}"`
    );

    const exp1 = await exportWorkbook(tLeader, unit.id);
    check("B2-1. Xuất Excel kèm ghi chú → 200 + file .xlsx", exp1.status === 200 && (exp1.wb?.worksheets.length || 0) > 0, `HTTP ${exp1.status}, bytes=${exp1.bytes}`);
    const wb1 = exp1.wb!;
    const names1 = sheetNamesOf(wb1);
    check(
      "B2-2. Giữ sheet in chính thức + có sheet phụ lục cuối file",
      names1[0] === "Phân công 1" && names1[names1.length - 1] === ANNEX_SHEET,
      names1.join(" | ")
    );
    const official1 = wb1.getWorksheet("Phân công 1")!;
    const annex = wb1.getWorksheet(ANNEX_SHEET)!;
    check("B2-3. Sheet phụ lục tồn tại và không trùng tên", !!annex && wb1.worksheets.filter((w) => w.name === ANNEX_SHEET).length === 1);

    const annexTexts = allSheetTexts(annex);
    const annexJoined = annexTexts.join("\n");
    check(
      "B2-4. Tiêu đề phụ lục + cột ngày/bộ phận/người/vị trí/ghi chú",
      annexJoined.includes("PHỤ LỤC GHI CHÚ LỊCH TRỰC") &&
        ["STT", "Ngày", "Bộ phận", "Người thực hiện", "Vị trí / nhiệm vụ", "Ghi chú"].every((h) => annexJoined.includes(h)),
      annexTexts.slice(0, 12).join(" | ")
    );
    const annexRow = [1, 2, 3, 4, 5, 6, 7].map((c) => annex.getCell(7, c).value as any);
    check(
      "B2-5. Dòng phụ lục đủ ngày/bộ phận/người/vị trí/ô/ghi chú",
      String(annexRow[1]) === "20/12/2026" &&
        String(annexRow[2]) === unit.name.toUpperCase() &&
        String(annexRow[3]) === p1.fullName &&
        String(annexRow[4]) === posOne.title &&
        String(annexRow[6]) === NOTE_TEXT,
      annexRow.map((v) => String(v)).join(" | ")
    );
    const officialJoined = allSheetTexts(official1).join("\n");
    check(
      "B2-6. Ghi chú KHÔNG bị chèn vào sheet in chính thức",
      !officialJoined.includes(NOTE_TEXT),
      officialJoined.includes(NOTE_TEXT) ? "phát hiện ghi chú trong sheet chính thức" : "không có ghi chú trong sheet chính thức"
    );
    const snapBefore = sheetSnapshot(official1);
    const annexPageSetup = annex.pageSetup as any;
    check(
      "B2-7. Phụ lục có thiết lập in riêng (A4 ngang, vừa 1 trang rộng)",
      annexPageSetup.paperSize === 9 && annexPageSetup.orientation === "landscape" && annexPageSetup.fitToPage === true && annexPageSetup.fitToWidth === 1,
      JSON.stringify({ paperSize: annexPageSetup.paperSize, orientation: annexPageSetup.orientation, fitToWidth: annexPageSetup.fitToWidth })
    );

    // Xóa ghi chú → xuất lại: sheet chính thức phải GIỐNG HỆT (nội dung/merge/chiều cao/thiết lập in).
    const clear = await api("PATCH", "/api/rosters", tLeader, { id: rowId, notes: "" });
    check("B2-8. Xóa ghi chú về null (dòng vẫn tồn tại)", clear.status === 200 && clear.json?.data?.notes === null, `HTTP ${clear.status}`);
    const exp2 = await exportWorkbook(tLeader, unit.id);
    const wb2 = exp2.wb!;
    const names2 = sheetNamesOf(wb2);
    check(
      "B2-9. Không có ghi chú → KHÔNG tạo sheet phụ lục (số trang in như cũ)",
      exp2.status === 200 && !names2.includes(ANNEX_SHEET) && names2.join("|") === "Phân công 1",
      names2.join(" | ")
    );
    const official2 = wb2.getWorksheet("Phân công 1")!;
    const snapAfter = sheetSnapshot(official2);
    check(
      "B2-10. Sheet in chính thức KHÔNG đổi khi có/không có ghi chú (giá trị ô + merge)",
      JSON.stringify(snapBefore.cells) === JSON.stringify(snapAfter.cells) &&
        JSON.stringify(snapBefore.merges) === JSON.stringify(snapAfter.merges),
      `cells=${Object.keys(snapBefore.cells).length}`
    );
    check(
      "B2-11. Chiều cao dòng + thiết lập in của sheet chính thức không đổi",
      JSON.stringify(snapBefore.heights) === JSON.stringify(snapAfter.heights) &&
        JSON.stringify(snapBefore.pageSetup) === JSON.stringify(snapAfter.pageSetup),
      JSON.stringify(snapAfter.pageSetup)
    );

    const exportAudit = await prisma.auditEvent.findFirst({
      where: { action: "ROSTER_EXPORT", resourceType: "DutyRoster" },
      orderBy: { timestamp: "desc" },
    });
    check(
      "B2-12. Audit xuất Excel có notesRows (0 khi không còn ghi chú)",
      (exportAudit?.newData as any)?.notesRows === 0 && (exportAudit?.newData as any)?.unitId === unit.id,
      JSON.stringify(exportAudit?.newData)
    );

    // Ghi chú lại trên dòng đã có người (A0 positive + chuẩn bị C0).
    const reNote = await api("PATCH", "/api/rosters", tLeader, { id: rowId, notes: NOTE_TEXT });
    check(
      "A0-9. Dòng ĐÃ CÓ NGƯỜI vẫn lưu ghi chú bình thường",
      reNote.status === 200 && reNote.json?.data?.notes === NOTE_TEXT,
      `HTTP ${reNote.status}`
    );

    // ==================== C0 — "Đổi người" tách riêng, bắt buộc lý do + audit ====================
    console.log("\n[C0] Đổi người phải có lý do + audit\n");
    const beforeChange = await prisma.dutyRoster.findUnique({ where: { id: rowId }, select: { personId: true, notes: true, slotKey: true } });
    const noReason = await api("PATCH", "/api/rosters", tLeader, { id: rowId, personId: p2.id });
    check("C0-1. Đổi người không có lý do → 400", noReason.status === 400, `HTTP ${noReason.status} "${noReason.json?.error || ""}"`);
    const shortReason = await api("PATCH", "/api/rosters", tLeader, { id: rowId, personId: p2.id, reason: "ab" });
    check("C0-2. Lý do < 3 ký tự → 400", shortReason.status === 400, `HTTP ${shortReason.status} "${shortReason.json?.error || ""}"`);
    const unchanged = await prisma.dutyRoster.findUnique({ where: { id: rowId }, select: { personId: true, notes: true } });
    check(
      "C0-3. Bị từ chối thì KHÔNG đổi người, không mất ghi chú",
      unchanged?.personId === beforeChange?.personId && unchanged?.notes === beforeChange?.notes,
      `person="${unchanged?.personId}" notes="${unchanged?.notes}"`
    );

    const reason = `${TAG} Điều động theo phân công mới`;
    const changed = await api("PATCH", "/api/rosters", tLeader, { id: rowId, personId: p2.id, reason });
    check("C0-4. Đổi người kèm lý do → 200", changed.status === 200, `HTTP ${changed.status}`);
    const afterChange = await prisma.dutyRoster.findUnique({
      where: { id: rowId },
      select: { personId: true, notes: true, reason: true, slotKey: true },
    });
    check(
      "C0-5. Lưu đúng người mới + lý do + giữ ghi chú",
      afterChange?.personId === p2.id && afterChange?.reason === reason && afterChange?.notes === NOTE_TEXT,
      `person="${afterChange?.personId}" reason="${afterChange?.reason}" notes="${afterChange?.notes}"`
    );
    check(
      "C0-6. Đổi người là cập nhật TẠI CHỖ (cùng id/ô), không tạo dòng mới",
      afterChange?.slotKey === beforeChange?.slotKey &&
        (await prisma.dutyRoster.count({ where: { id: rowId, slotKey: beforeChange?.slotKey } })) === 1 &&
        (await prisma.dutyRoster.count({ where: { date: { gte: dayStart, lte: dayEnd }, slotKey: beforeChange?.slotKey } })) === 1
    );
    const auditChange = await latestAudit(rowId);
    check(
      "C0-7. Audit đổi người có old/new person + reason + old notes",
      (auditChange?.oldData as any)?.personId === p1.id &&
        (auditChange?.newData as any)?.personId === p2.id &&
        String((auditChange?.newData as any)?.reason || "").includes(TAG) &&
        (auditChange?.oldData as any)?.notes === NOTE_TEXT,
      JSON.stringify({ old: auditChange?.oldData, new: auditChange?.newData })
    );

    // Ghi chú sau khi đổi người vẫn cập nhật được và audit old/new đúng.
    const noteAfterChange = await api("PATCH", "/api/rosters", tLeader, { id: rowId, notes: NOTE_TEXT_2 });
    const auditNote = await latestAudit(rowId);
    check(
      "C0-8. Sau khi đổi người, ghi chú vẫn sửa được + audit old/new",
      noteAfterChange.status === 200 &&
        noteAfterChange.json?.data?.notes === NOTE_TEXT_2 &&
        (auditNote?.oldData as any)?.notes === NOTE_TEXT &&
        (auditNote?.newData as any)?.notes === NOTE_TEXT_2,
      `HTTP ${noteAfterChange.status}`
    );

    // Phân quyền: STAFF không đổi người / không sửa ghi chú.
    const tStaff = await login("democb01");
    const staffChange = await api("PATCH", "/api/rosters", tStaff, { id: rowId, personId: p3.id, reason: `${TAG} staff đổi trộm` });
    const staffNote = await api("PATCH", "/api/rosters", tStaff, { id: rowId, notes: `${TAG} staff ghi chú trộm` });
    check(
      "C0-9. STAFF không được đổi người / sửa ghi chú (403)",
      staffChange.status === 403 && staffNote.status === 403,
      `HTTP ${staffChange.status}/${staffNote.status}`
    );

    // Phiên bản Excel sau khi đổi người vẫn có phụ lục đúng người mới.
    const exp3 = await exportWorkbook(tLeader, unit.id);
    const annex3 = exp3.wb!.getWorksheet(ANNEX_SHEET);
    check(
      "B2-13. Phụ lục cập nhật theo người mới sau khi đổi người",
      !!annex3 && String(annex3.getCell(7, 4).value) === p2.fullName && String(annex3.getCell(7, 7).value) === NOTE_TEXT_2,
      annex3 ? `${annex3.getCell(7, 4).value} | ${annex3.getCell(7, 7).value}` : "thiếu sheet phụ lục"
    );
  } catch (err: any) {
    console.error("Lỗi kiểm thử:", err?.message || err);
    failed++;
    failures.push(`EXCEPTION: ${err?.message || err}`);
  } finally {
    await cleanup();
    const leftovers = await prisma.dutyRoster.count({ where: { date: { gte: dayStart, lte: dayEnd } } });
    check("Z9. Dọn sạch dữ liệu kiểm thử", leftovers === 0, `còn ${leftovers} bản ghi`);
    await prisma.$disconnect();
  }

  console.log(`\n===== KẾT QUẢ E13: ${passed} PASS / ${failed} FAIL =====`);
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
