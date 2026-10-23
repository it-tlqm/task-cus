/**
 * S5 / YC-13 — Kiểm thử Roster notes (chạy trên DB test talung_v3_roster, port 3115).
 *
 * Phạm vi:
 *  - Ghi chú per-person qua DutyRoster.notes: lưu/đọc/sửa/xóa (null) + giới hạn độ dài.
 *  - Audit old/new cho ghi chú; audit vẫn ghi khi đổi người kèm lý do; ghi chú không bị mất khi đổi người.
 *  - Giữ nguyên server check trùng/kiêm nhiệm: cùng nhóm trực trong ngày vẫn trả overlapCount > 1 + cảnh báo text.
 *  - Trực trưa tách nhóm: 1 trực thường + 1 trực trưa không bị coi là trùng phân công.
 *  - Phân quyền: STAFF không được sửa ghi chú/đổi người.
 *  - Xuất Excel vẫn chạy (không đổi template).
 *
 * Chạy:
 *   $env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/talung_v3_roster"
 *   $env:TEST_BASE_URL="http://localhost:3115"
 *   npx tsx scripts/test-yc13-roster-notes.ts
 */
import { PrismaClient } from "@prisma/client";

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
const TEST_DATE = "2026-12-15";
const TEST_DATE_2 = "2026-12-16";
const TAG = "[YC13-TEST]";

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

async function cleanup() {
  for (const id of createdIds) {
    await prisma.dutyRoster.deleteMany({ where: { id } }).catch(() => {});
  }
  createdIds.length = 0;
}

(async () => {
  await waitForServer();
  console.log(`\nDB=${dbName} · BASE_URL=${BASE_URL} · DATE=${TEST_DATE}\n`);

  // Dọn dữ liệu test cũ nếu có, nhưng KHÔNG đụng dữ liệu ngoài phạm vi ngày test.
  const existing = await prisma.dutyRoster.count({
    where: { date: { gte: new Date(`${TEST_DATE}T00:00:00`), lte: new Date(`${TEST_DATE_2}T23:59:59`) } },
  });
  if (existing > 0) {
    console.error(`❌ Có ${existing} bản ghi đã tồn tại trong ngày test ${TEST_DATE}..${TEST_DATE_2}. Dừng để không xóa dữ liệu lạ.`);
    process.exit(1);
  }

  const unit = await prisma.orgUnit.findFirst({ where: { code: "BP_NGHIEPVU_A" }, select: { id: true, name: true } });
  if (!unit) throw new Error("Không tìm thấy bộ phận test BP_NGHIEPVU_A");
  const positions = await prisma.dutyPosition.findMany({
    where: { unitId: unit.id, status: "ACTIVE", code: { in: ["YC24-04", "YC24-02", "YC24-08"] } },
    select: { id: true, code: true, title: true, slots: true },
  });
  const posOne = positions.find((p) => p.code === "YC24-04");
  const posTwo = positions.find((p) => p.code === "YC24-02");
  const posNoon = positions.find((p) => p.code === "YC24-08");
  if (!posOne || !posTwo || !posNoon) throw new Error("Thiếu danh mục vị trí test (YC24-04/02/08)");

  const people = await prisma.person.findMany({
    where: { account: { username: { in: ["democb01", "democb02"] } } },
    select: { id: true, fullName: true, account: { select: { username: true } } },
  });
  const p1 = people.find((p) => p.account?.username === "democb01");
  const p2 = people.find((p) => p.account?.username === "democb02");
  if (!p1 || !p2) throw new Error("Thiếu người test democb01/democb02");

  const tLeader = await login("demold01");
  const tStaff = await login("democb01");

  try {
    // S1 — tạo phân công kèm ghi chú per-person
    const create1 = await api("POST", "/api/rosters", tLeader, {
      unitId: unit.id,
      date: TEST_DATE,
      personId: p1.id,
      positionId: posOne.id,
      slotOrder: 0,
      notes: `  ${TAG} Ghi chú ban đầu  `,
    });
    const row1 = create1.json?.data;
    if (row1?.id) createdIds.push(row1.id);
    check("S1a. Tạo phân công kèm ghi chú → 201", create1.status === 201, `HTTP ${create1.status}`);
    check("S1b. Ghi chú được trim và trả về đúng", row1?.notes === `${TAG} Ghi chú ban đầu`, `notes="${row1?.notes}"`);
    const createAudit = row1?.id ? await latestAudit(row1.id, "ROSTER_CREATE") : null;
    check(
      "S1c. Audit ROSTER_CREATE có newData.notes",
      !!createAudit && (createAudit.newData as any)?.notes === `${TAG} Ghi chú ban đầu`
    );

    // S2 — đọc lại qua GET
    const get1 = await api("GET", `/api/rosters?from=${TEST_DATE}&to=${TEST_DATE}&unitId=${unit.id}`, tLeader);
    const read1 = (get1.json?.data || []).find((r: any) => r.id === row1?.id);
    check("S2. GET trả lại ghi chú per-person", get1.status === 200 && read1?.notes === `${TAG} Ghi chú ban đầu`);

    // S3 — sửa ghi chú, audit old/new
    const note2 = `${TAG} Bàn giao ca sáng, kiêm nhiệm kiểm tra hồ sơ`;
    const patch1 = await api("PATCH", "/api/rosters", tLeader, { id: row1.id, notes: note2 });
    check("S3a. Sửa ghi chú → 200", patch1.status === 200 && patch1.json?.data?.notes === note2, `HTTP ${patch1.status}`);
    const auditNote1 = await latestAudit(row1.id);
    check(
      "S3b. Audit ghi chú old/new đúng",
      (auditNote1?.oldData as any)?.notes === `${TAG} Ghi chú ban đầu` && (auditNote1?.newData as any)?.notes === note2,
      `old="${(auditNote1?.oldData as any)?.notes}" new="${(auditNote1?.newData as any)?.notes}"`
    );

    const note3 = `${TAG} Cập nhật lần 2 — theo dõi ca chiều`;
    const patch2 = await api("PATCH", "/api/rosters", tLeader, { id: row1.id, notes: note3 });
    const auditNote2 = await latestAudit(row1.id);
    check(
      "S3c. Sửa lần 2: audit old là giá trị lần trước, new là giá trị mới",
      patch2.status === 200 && (auditNote2?.oldData as any)?.notes === note2 && (auditNote2?.newData as any)?.notes === note3,
      `old="${(auditNote2?.oldData as any)?.notes}" new="${(auditNote2?.newData as any)?.notes}"`
    );

    // S4 — xóa ghi chú về null + chặn ghi chú quá dài
    const patchEmpty = await api("PATCH", "/api/rosters", tLeader, { id: row1.id, notes: "" });
    check("S4a. Xóa ghi chú (chuỗi rỗng) → notes=null", patchEmpty.status === 200 && patchEmpty.json?.data?.notes === null);
    const longNote = "x".repeat(1001);
    const patchLong = await api("PATCH", "/api/rosters", tLeader, { id: row1.id, notes: longNote });
    check("S4b. Ghi chú > 1000 ký tự bị chặn 400", patchLong.status === 400, `HTTP ${patchLong.status}`);

    // S5 — phân quyền: STAFF không sửa ghi chú
    const staffPatch = await api("PATCH", "/api/rosters", tStaff, { id: row1.id, notes: `${TAG} staff sửa trộm` });
    check("S5. STAFF không được sửa ghi chú (403)", staffPatch.status === 403, `HTTP ${staffPatch.status}`);

    // S6 — server vẫn phát hiện trùng/kiêm nhiệm cùng nhóm trực
    const create2 = await api("POST", "/api/rosters", tLeader, {
      unitId: unit.id,
      date: TEST_DATE,
      personId: p1.id,
      positionId: posTwo.id,
      slotOrder: 0,
      notes: `${TAG} Dòng thứ 2 cùng ngày`,
    });
    const row2 = create2.json?.data;
    if (row2?.id) createdIds.push(row2.id);
    check(
      "S6a. Phân công cùng người/ngày/khác ô vẫn được lưu (cảnh báo mềm, không chặn)",
      create2.status === 201,
      `HTTP ${create2.status}`
    );
    check(
      "S6b. Server trả overlapCount > 1 cho trùng nhóm trực (cảnh báo mềm, không chặn)",
      (row2?.overlapCount || 0) > 1,
      `overlap=${row2?.overlapCount}, warning="${create2.json?.crossWarning || ""}"`
    );
    const get2 = await api("GET", `/api/rosters?from=${TEST_DATE}&to=${TEST_DATE}&unitId=${unit.id}`, tLeader);
    const read2 = (get2.json?.data || []).find((r: any) => r.id === row2?.id);
    check("S6c. GET vẫn trả overlapCount > 1 (không ẩn xung đột ở server)", (read2?.overlapCount || 0) > 1);

    // S7 — trực trưa tách nhóm: cùng người + cùng ngày vẫn là 1 trực trưa, không cộng dồn với trực thường
    const createNoon = await api("POST", "/api/rosters", tLeader, {
      unitId: unit.id,
      date: TEST_DATE,
      personId: p1.id,
      positionId: posNoon.id,
      slotOrder: 0,
      notes: `${TAG} Trực trưa riêng`,
    });
    const rowNoon = createNoon.json?.data;
    if (rowNoon?.id) createdIds.push(rowNoon.id);
    check(
      "S7. Trực trưa cùng người không bị coi là trùng với trực thường (overlapCount=1)",
      createNoon.status === 201 && rowNoon?.overlapCount === 1,
      `HTTP ${createNoon.status}, overlap=${rowNoon?.overlapCount}`
    );

    // S8 — đổi người có lý do, ghi chú giữ nguyên + audit old/new
    await api("PATCH", "/api/rosters", tLeader, { id: row1.id, notes: `${TAG} Ghi chú trước khi đổi người` });
    const noReason = await api("PATCH", "/api/rosters", tLeader, { id: row1.id, personId: p2.id });
    check("S8a. Đổi người thiếu lý do → 400", noReason.status === 400, `HTTP ${noReason.status}`);
    const change = await api("PATCH", "/api/rosters", tLeader, {
      id: row1.id,
      personId: p2.id,
      reason: `${TAG} Điều động theo phân công mới`,
    });
    check("S8b. Đổi người kèm lý do → 200", change.status === 200, `HTTP ${change.status}`);
    check(
      "S8c. Đổi người giữ nguyên ghi chú của dòng phân công",
      change.json?.data?.notes === `${TAG} Ghi chú trước khi đổi người`,
      `notes="${change.json?.data?.notes}"`
    );
    const auditChange = await latestAudit(row1.id);
    check(
      "S8d. Audit đổi người có old/new person + lý do + old notes",
      (auditChange?.oldData as any)?.personId === p1.id &&
        (auditChange?.newData as any)?.personId === p2.id &&
        String((auditChange?.newData as any)?.reason || "").includes(TAG) &&
        (auditChange?.oldData as any)?.notes === `${TAG} Ghi chú trước khi đổi người`
    );

    // S9 — xuất Excel vẫn hoạt động (không đổi template)
    const exp = await fetch(`${BASE_URL}/api/rosters/export?from=${TEST_DATE}&to=${TEST_DATE}&unitId=${unit.id}&cover=0`, {
      headers: { Authorization: `Bearer ${tLeader}` },
    });
    const expBuf = await exp.arrayBuffer();
    check(
      "S9. Xuất Excel theo bộ phận vẫn 200 và có file .xlsx",
      exp.status === 200 &&
        (exp.headers.get("content-type") || "").includes("spreadsheetml") &&
        expBuf.byteLength > 1000,
      `HTTP ${exp.status}, bytes=${expBuf.byteLength}`
    );

    // S10 — gỡ phân công: audit giữ nội dung cũ (gồm notes)
    const del = await api("DELETE", `/api/rosters?id=${row1.id}&reason=${encodeURIComponent(`${TAG} Dọn sau kiểm thử`)}`, tLeader);
    check("S10a. Gỡ phân công → 200", del.status === 200, `HTTP ${del.status}`);
    const auditDel = await latestAudit(row1.id, "ROSTER_DELETE");
    check(
      "S10b. Audit ROSTER_DELETE giữ oldData.notes",
      (auditDel?.oldData as any)?.notes === `${TAG} Ghi chú trước khi đổi người`,
      `old.notes="${(auditDel?.oldData as any)?.notes}"`
    );

    // Dọn các dòng còn lại
    for (const id of [row2?.id, rowNoon?.id].filter(Boolean) as string[]) {
      await api("DELETE", `/api/rosters?id=${id}&reason=${encodeURIComponent(`${TAG} Dọn sau kiểm thử`)}`, tLeader);
    }
    const leftovers = await prisma.dutyRoster.count({ where: { id: { in: createdIds } } });
    check("S11. Dọn sạch dữ liệu kiểm thử", leftovers === 0, `còn ${leftovers} bản ghi`);
    createdIds.length = 0;
  } catch (err: any) {
    console.error("Lỗi kiểm thử:", err?.message || err);
    failed++;
    failures.push(`EXCEPTION: ${err?.message || err}`);
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }

  console.log(`\n===== KẾT QUẢ: ${passed} PASS / ${failed} FAIL =====`);
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
