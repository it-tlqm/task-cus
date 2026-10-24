/**
 * UX Phase 2B1 — nhiều tag TX trên một RoutineEntry + workDate/shift.
 *
 * Chỉ chạy trên database kiểm thử cục bộ (assertLocalTestDatabase). Không Production.
 *
 *   $env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/talung_v3_integration_2b1"
 *   $env:DIRECT_URL=$env:DATABASE_URL
 *   $env:TEST_BASE_URL="http://localhost:3113"
 *   npx tsx scripts/test-ux-phase2b1-routine-tags.ts
 */
import { createRequire } from "node:module";
import { assertLocalTestDatabase } from "./lib/test-db-safety";
import { todayInVietnam } from "../src/server/work-dates";
import { computeScorePreview } from "../src/server/monthly-score";
import { getIsoWeekFromDate, isDateWithinPeriod } from "../src/lib/period-helper";

const creq = createRequire(import.meta.url);
const { PrismaClient } = creq("@prisma/client");
const dbUrl = assertLocalTestDatabase(
  process.env.DIRECT_URL || process.env.DATABASE_URL || "",
  "test-ux-phase2b1-routine-tags"
);
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const BASE = process.env.TEST_BASE_URL || "http://localhost:3113";
const PASSWORD = process.env.V3_DEMO_PASSWORD || "LocalTest@2026";
const TMP = "[2B1-TEST]";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`[PASS] ${name}${detail ? " - " + detail : ""}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? " - " + detail : ""}`);
    console.log(`[FAIL] ${name}${detail ? " - " + detail : ""}`);
  }
}

async function login(username: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: PASSWORD }),
  });
  const json = await res.json().catch(() => ({}));
  if (!json.token) throw new Error(`Đăng nhập ${username} lỗi HTTP ${res.status}`);
  return json.token as string;
}

const H = (token: string) => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});

const createdEntryIds: string[] = [];
const createdWorkItemIds: string[] = [];
const createdWeekPeriodIds: string[] = [];
let lockedPeriodBackup: { id: string; isLocked: boolean } | null = null;
const legacyPeriodIds: string[] = [];

async function postRoutine(token: string, body: Record<string, unknown>) {
  const res = await fetch(`${BASE}/api/routine`, {
    method: "POST",
    headers: H(token),
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

let selectionModeBackup: { id: string; selectionMode: string } | null = null;

async function main() {
  console.log("=== UX 2B1 — NHIỀU TAG TX + NGÀY/CA ===\n");

  // ---- 0. Migration/backfill state (chạy sau khi migration đã áp lên DB kiểm thử) ----
  const totalEntries = await prisma.routineEntry.count();
  const totalTags = await prisma.routineEntryCatalogTag.count();
  const missingDates = await prisma.routineEntry.count({ where: { workDate: null } });
  const missingShifts = await prisma.routineEntry.count({ where: { shift: null } });
  check(
    "0. Backfill đủ workDate/shift cho dữ liệu cũ",
    totalEntries > 0 && missingDates === 0 && missingShifts === 0,
    `entries=${totalEntries} tags=${totalTags} missingDate=${missingDates} missingShift=${missingShifts}`
  );

  const legacyEntries = await prisma.routineEntry.findMany({
    where: { catalogEntryId: { not: null } },
    select: {
      id: true,
      catalogEntryId: true,
      catalogTags: { select: { catalogEntryId: true, sortOrder: true } },
    },
  });
  check(
    "0. catalogEntryId cũ được backfill thành tag chính",
    legacyEntries.length > 0 &&
      legacyEntries.every((entry) =>
        entry.catalogTags.some(
          (tag) => tag.catalogEntryId === entry.catalogEntryId && tag.sortOrder === 0
        )
      ),
    `legacy=${legacyEntries.length}`
  );

  // Cùng biểu thức backfill của migration: timestamp UTC gần 23:00Z phải sang NGÀY KẾ TIẾP ở VN.
  const vnDateNearMidnight = await prisma.$queryRawUnsafe<Array<{ vn_date: string }>>(
    `SELECT (('2026-10-15 23:30:00'::timestamp AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text AS vn_date`
  );
  const vnDateBeforeMidnight = await prisma.$queryRawUnsafe<Array<{ vn_date: string }>>(
    `SELECT (('2026-10-15 16:30:00'::timestamp AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text AS vn_date`
  );
  check(
    "0. Backfill dùng ngày VN: 23:30Z → hôm sau, 16:30Z → cùng ngày",
    vnDateNearMidnight[0]?.vn_date === "2026-10-16" &&
      vnDateBeforeMidnight[0]?.vn_date === "2026-10-15",
    `${vnDateNearMidnight[0]?.vn_date} / ${vnDateBeforeMidnight[0]?.vn_date}`
  );

  // ---- Chuẩn bị người dùng/kỳ/danh mục ----
  const token = await login("democb01");
  const meRes = await fetch(`${BASE}/api/auth/me`, { headers: H(token) });
  const meJson = await meRes.json().catch(() => ({}));
  const person = meJson?.user;
  check(
    "1. Đăng nhập và có hồ sơ cán bộ",
    meRes.status === 200 && !!person?.personId,
    `HTTP ${meRes.status}`
  );

  const period = await prisma.reportingPeriod.findFirst({
    where: {
      type: "MONTH",
      isLocked: false,
      snapshots: { none: { status: "LOCKED" } },
    },
    orderBy: { startAt: "desc" },
  });
  check("1. Có kỳ tháng chưa chốt", !!period, period?.title || "");

  const txEntries = await prisma.workCatalogEntry.findMany({
    where: { status: "ACTIVE", version: { status: "ACTIVE" } },
    orderBy: [{ departmentOrder: "asc" }, { sortOrder: "asc" }],
    take: 3,
    select: { id: true, code: true, title: true, department: true },
  });
  const products = await prisma.productItem.findMany({
    where: { status: "ACTIVE" },
    orderBy: { code: "asc" },
    take: 3,
    select: { id: true, code: true, taskName: true },
  });
  check("1. Có đủ 3 tag TX + 3 sản phẩm QĐ1277", txEntries.length === 3 && products.length === 3);

  const targetDate = "2026-10-15";
  const otherDate = "2026-10-16";
  const uniqueTitle = `${TMP} một bản ghi nhiều tag ${Date.now()}`;
  const entriesBefore = await prisma.routineEntry.count({
    where: { personId: person.personId, periodId: period!.id },
  });
  const monthlyBefore = await prisma.monthlyWorkResult.count({ where: { personId: person.personId } });

  // ---- 2. Một entry với 3 TX + 3 SP: 1 row, 3 tags, 3 sản phẩm ----
  const { res: createRes, json: createJson } = await postRoutine(token, {
    periodId: period!.id,
    title: uniqueTitle,
    notes: "Kiểm thử nhiều tag — không tạo nhiều bản ghi",
    occurrenceStatus: "OCCURRED",
    progressPercent: 100,
    catalogEntryIds: txEntries.map((entry) => entry.id),
    workDate: targetDate,
    shift: "SANG",
    productItemId: products[0].id,
    proposedProducts: products.map((product) => ({
      productItemId: product.id,
      quantity: 2,
      unit: "bộ",
    })),
  });
  const entryId = createJson?.routineEntry?.id;
  if (entryId) createdEntryIds.push(entryId);
  check(
    "2. Tạo nhật ký 3 TX + 3 SP thành công",
    createRes.status === 201 && !!entryId,
    `HTTP ${createRes.status} ${createJson?.error || ""}`
  );

  const entriesAfter = await prisma.routineEntry.count({
    where: { personId: person.personId, periodId: period!.id },
  });
  check(
    "2. Chỉ tăng ĐÚNG 1 RoutineEntry (không sinh 3 bản ghi)",
    entriesAfter === entriesBefore + 1,
    `${entriesBefore} -> ${entriesAfter}`
  );

  const created = entryId
    ? await prisma.routineEntry.findUnique({
        where: { id: entryId },
        include: {
          catalogTags: { orderBy: { sortOrder: "asc" } },
          workItem: { include: { linkedProducts: true } },
        },
      })
    : null;
  if (created?.workItemId) createdWorkItemIds.push(created.workItemId);

  check("2. Lưu đúng 3 tag TX", created?.catalogTags.length === 3, `tags=${created?.catalogTags.length}`);
  check(
    "2. Tag giữ đúng thứ tự chọn và tag đầu là catalogEntryId chính",
    created?.catalogTags.map((tag) => tag.catalogEntryId).join(",") === txEntries.map((entry) => entry.id).join(",") &&
      created?.catalogEntryId === txEntries[0].id
  );
  check(
    "2. workDate/shift lưu đúng ngày/ca",
    created?.workDate?.toISOString().slice(0, 10) === targetDate && created?.shift === "SANG",
    `${created?.workDate?.toISOString().slice(0, 10)} / ${created?.shift}`
  );
  const proposedSaved = created?.proposedProducts ? JSON.parse(created.proposedProducts) : [];
  check("2. Giữ nguyên 3 sản phẩm QĐ1277 đề xuất", proposedSaved.length === 3);
  check(
    "2. 1277 vẫn dùng WorkItemProduct PROPOSED (không sinh tag 1277 mới)",
    created?.workItem?.linkedProducts.length === 3 &&
      created?.workItem?.linkedProducts.every((product) => product.reviewState === "PROPOSED"),
    `workItemProducts=${created?.workItem?.linkedProducts.length}`
  );

  const monthlyAfter = await prisma.monthlyWorkResult.count({ where: { personId: person.personId } });
  check("2. Không tự sinh kết quả tháng/điểm khi gắn nhiều tag", monthlyAfter === monthlyBefore);

  // ---- 3. GET trả đủ tag/ngày/ca và lọc theo ngày ----
  const getRes = await fetch(`${BASE}/api/routine?id=${entryId}&hideDemo=0`, { headers: H(token) });
  const getJson = await getRes.json().catch(() => ({}));
  const getEntry = Array.isArray(getJson.entries) ? getJson.entries[0] : null;
  check(
    "3. GET trả catalogTags + workDate + shift",
    getRes.status === 200 &&
      getEntry?.catalogTags?.length === 3 &&
      getEntry?.workDate === targetDate &&
      getEntry?.shift === "SANG",
    `tags=${getEntry?.catalogTags?.length} date=${getEntry?.workDate} shift=${getEntry?.shift}`
  );

  const byDateRes = await fetch(`${BASE}/api/routine?hideDemo=0&workDate=${targetDate}`, {
    headers: H(token),
  });
  const byDateJson = await byDateRes.json().catch(() => ({}));
  const idsOnDate = (byDateJson.entries || []).map((entry: any) => entry.id);
  check("3. Lọc workDate trả bản ghi vừa tạo", byDateRes.status === 200 && idsOnDate.includes(entryId));

  const otherDateRes = await fetch(`${BASE}/api/routine?hideDemo=0&workDate=${otherDate}`, {
    headers: H(token),
  });
  const otherDateJson = await otherDateRes.json().catch(() => ({}));
  const idsOnOtherDate = (otherDateJson.entries || []).map((entry: any) => entry.id);
  check("3. Lọc workDate khác không trả bản ghi", otherDateRes.status === 200 && !idsOnOtherDate.includes(entryId));

  // ---- 3b. "Tất cả ngày" phải có cap, không trả toàn bộ lịch sử ----
  const capRes = await fetch(`${BASE}/api/routine?hideDemo=0&limit=1`, { headers: H(token) });
  const capJson = await capRes.json().catch(() => ({}));
  check(
    "3b. Query không ngày có cap + hasMore",
    capRes.status === 200 &&
      Array.isArray(capJson.entries) &&
      capJson.entries.length === 1 &&
      capJson.hasMore === true &&
      capJson.limit === 1,
    `HTTP ${capRes.status} n=${capJson.entries?.length} hasMore=${capJson.hasMore} limit=${capJson.limit}`
  );
  const capMaxRes = await fetch(`${BASE}/api/routine?hideDemo=0&limit=9999`, { headers: H(token) });
  const capMaxJson = await capMaxRes.json().catch(() => ({}));
  check(
    "3b. Limit bị chặn tối đa 500",
    capMaxRes.status === 200 &&
      capMaxJson.limit === 500 &&
      Array.isArray(capMaxJson.entries) &&
      capMaxJson.entries.length <= 500,
    `limit=${capMaxJson.limit} n=${capMaxJson.entries?.length}`
  );
  const boundedRes = await fetch(`${BASE}/api/routine?hideDemo=0&workDate=${targetDate}`, {
    headers: H(token),
  });
  const boundedJson = await boundedRes.json().catch(() => ({}));
  check(
    "3b. Query theo ngày không bị cap và hasMore=false",
    boundedRes.status === 200 && boundedJson.hasMore === false && boundedJson.limit === null
  );

  const wideRangeRes = await fetch(
    `${BASE}/api/routine?hideDemo=0&from=2026-09-01&to=2026-10-31`,
    { headers: H(token) }
  );
  check("3b. Từ chối range quá 31 ngày", wideRangeRes.status === 400, `HTTP ${wideRangeRes.status}`);

  const maxRangeRes = await fetch(
    `${BASE}/api/routine?hideDemo=0&from=2026-10-01&to=2026-10-31`,
    { headers: H(token) }
  );
  const maxRangeJson = await maxRangeRes.json().catch(() => ({}));
  check(
    "3b. Range đúng 31 ngày được phép",
    maxRangeRes.status === 200 && maxRangeJson.hasMore === false && maxRangeJson.limit === null
  );

  const oneSidedRes = await fetch(`${BASE}/api/routine?hideDemo=0&from=2026-01-01&limit=1`, {
    headers: H(token),
  });
  const oneSidedJson = await oneSidedRes.json().catch(() => ({}));
  check(
    "3b. Range một phía vẫn bị cap 500",
    oneSidedRes.status === 200 &&
      oneSidedJson.limit === 1 &&
      oneSidedJson.entries?.length <= 1,
    `limit=${oneSidedJson.limit} n=${oneSidedJson.entries?.length}`
  );

  // ---- 4. Legacy catalogEntryId vẫn hoạt động ----
  const legacyTitle = `${TMP} legacy một tag ${Date.now()}`;
  const legacyCreate = await postRoutine(token, {
    periodId: period!.id,
    title: legacyTitle,
    occurrenceStatus: "OCCURRED",
    catalogEntryId: txEntries[1].id,
    workDate: targetDate,
    shift: "CHIEU",
  });
  const legacyId = legacyCreate.json?.routineEntry?.id;
  if (legacyId) createdEntryIds.push(legacyId);
  const legacyEntry = legacyId
    ? await prisma.routineEntry.findUnique({
        where: { id: legacyId },
        include: { catalogTags: true, workItem: true },
      })
    : null;
  if (legacyEntry?.workItemId) createdWorkItemIds.push(legacyEntry.workItemId);
  check(
    "4. POST legacy catalogEntryId tạo đúng 1 tag + tag chính",
    legacyCreate.res.status === 201 &&
      legacyEntry?.catalogTags.length === 1 &&
      legacyEntry?.catalogTags[0].catalogEntryId === txEntries[1].id &&
      legacyEntry?.catalogEntryId === txEntries[1].id
  );

  // UI hiện gửi đồng thời catalogEntryIds + catalogEntryId (tag đầu) — không được coi là trùng.
  const comboTitle = `${TMP} combo legacy + array ${Date.now()}`;
  const comboTags = [txEntries[0].id, txEntries[2].id];
  const comboCreate = await postRoutine(token, {
    periodId: period!.id,
    title: comboTitle,
    occurrenceStatus: "OCCURRED",
    catalogEntryIds: comboTags,
    catalogEntryId: comboTags[0],
    workDate: targetDate,
    shift: "SANG",
  });
  const comboId = comboCreate.json?.routineEntry?.id;
  if (comboId) createdEntryIds.push(comboId);
  const comboEntry = comboId
    ? await prisma.routineEntry.findUnique({
        where: { id: comboId },
        include: { catalogTags: { orderBy: { sortOrder: "asc" } }, workItem: true },
      })
    : null;
  if (comboEntry?.workItemId) createdWorkItemIds.push(comboEntry.workItemId);
  check(
    "4b. Payload UI (catalogEntryIds + catalogEntryId trùng tag đầu) tạo đúng 2 tag",
    comboCreate.res.status === 201 &&
      comboEntry?.catalogTags.length === 2 &&
      comboEntry?.catalogEntryId === comboTags[0]
  );

  // ---- 5. Từ chối tag trùng/không tồn tại/ngoài phạm vi ----
  const beforeInvalid = await prisma.routineEntry.count();
  const dup = await postRoutine(token, {
    periodId: period!.id,
    title: `${TMP} tag trùng ${Date.now()}`,
    occurrenceStatus: "OCCURRED",
    catalogEntryIds: [txEntries[0].id, txEntries[0].id],
  });
  check("5. Từ chối tag TX trùng lặp", dup.res.status === 400, `HTTP ${dup.res.status}`);

  const invalid = await postRoutine(token, {
    periodId: period!.id,
    title: `${TMP} tag không tồn tại ${Date.now()}`,
    occurrenceStatus: "OCCURRED",
    catalogEntryIds: ["00000000-0000-4000-8000-000000000000"],
  });
  check("5. Từ chối tag TX không tồn tại", invalid.res.status === 400, `HTTP ${invalid.res.status}`);
  check(
    "5. Request lỗi không tạo bản ghi",
    (await prisma.routineEntry.count()) === beforeInvalid,
    `before=${beforeInvalid}`
  );

  // Unique (routineEntryId, catalogEntryId) ở tầng DB
  let uniqueRejected = false;
  try {
    await prisma.routineEntryCatalogTag.create({
      data: {
        routineEntryId: entryId,
        catalogEntryId: txEntries[0].id,
        sortOrder: 99,
      },
    });
  } catch (error: any) {
    uniqueRejected = error?.code === "P2002";
  }
  check("5. Unique (routineEntryId, catalogEntryId) chặn tag trùng ở DB", uniqueRejected);

  // Ngoài phạm vi: tạm chuyển version sang MAPPED (không mapping) rồi khôi phục
  const activeVersion = await prisma.workCatalogVersion.findFirst({
    where: { status: "ACTIVE" },
    select: { id: true, selectionMode: true },
  });
  if (activeVersion) {
    selectionModeBackup = { id: activeVersion.id, selectionMode: activeVersion.selectionMode };
    await prisma.workCatalogVersion.update({
      where: { id: activeVersion.id },
      data: { selectionMode: "MAPPED" },
    });
    const outOfScope = await postRoutine(token, {
      periodId: period!.id,
      title: `${TMP} ngoài phạm vi ${Date.now()}`,
      occurrenceStatus: "OCCURRED",
      catalogEntryIds: [txEntries[0].id],
    });
    check("5. Từ chối tag TX ngoài phạm vi bộ phận (MAPPED)", outOfScope.res.status === 400, `HTTP ${outOfScope.res.status}`);
    await prisma.workCatalogVersion.update({
      where: { id: activeVersion.id },
      data: { selectionMode: activeVersion.selectionMode },
    });
    selectionModeBackup = null;
  }

  // ---- 6. Mặc định ngày VN hôm nay + CA_NGAY; danh sách rỗng hợp lệ ----
  const defaultTitle = `${TMP} mặc định ngày ca ${Date.now()}`;
  const defaultCreate = await postRoutine(token, {
    periodId: period!.id,
    title: defaultTitle,
    occurrenceStatus: "OCCURRED",
    catalogEntryIds: [],
  });
  const defaultId = defaultCreate.json?.routineEntry?.id;
  if (defaultId) createdEntryIds.push(defaultId);
  const defaultEntry = defaultId
    ? await prisma.routineEntry.findUnique({
        where: { id: defaultId },
        include: { catalogTags: true, workItem: true },
      })
    : null;
  if (defaultEntry?.workItemId) createdWorkItemIds.push(defaultEntry.workItemId);
  check(
    "6. Không chọn tag vẫn tạo được bản ghi (ad-hoc, 0 tag)",
    defaultCreate.res.status === 201 && defaultEntry?.catalogTags.length === 0
  );
  check(
    "6. Mặc định workDate = ngày VN hôm nay, shift = CA_NGAY",
    defaultEntry?.workDate?.toISOString().slice(0, 10) === todayInVietnam() &&
      defaultEntry?.shift === "CA_NGAY",
    `${defaultEntry?.workDate?.toISOString().slice(0, 10)} / ${defaultEntry?.shift}`
  );

  const badShift = await postRoutine(token, {
    periodId: period!.id,
    title: `${TMP} ca sai ${Date.now()}`,
    occurrenceStatus: "OCCURRED",
    shift: "TOI",
  });
  check("6. Từ chối ca không hợp lệ", badShift.res.status === 400);

  const badDate = await postRoutine(token, {
    periodId: period!.id,
    title: `${TMP} ngày sai ${Date.now()}`,
    occurrenceStatus: "OCCURRED",
    workDate: "2026-02-31",
  });
  check("6. Từ chối ngày không tồn tại", badDate.res.status === 400);

  const periodsBeforeEmptyDate = await prisma.reportingPeriod.count();
  const emptyDate = await postRoutine(token, {
    periodId: period!.id,
    title: `${TMP} ngày rỗng ${Date.now()}`,
    occurrenceStatus: "OCCURRED",
    workDate: "",
  });
  const nullDate = await postRoutine(token, {
    periodId: period!.id,
    title: `${TMP} ngày null ${Date.now()}`,
    occurrenceStatus: "OCCURRED",
    workDate: null,
  });
  check("6. Từ chối workDate rỗng/null khi client có gửi field", emptyDate.res.status === 400 && nullDate.res.status === 400);
  check(
    "6. Ngày rỗng không tạo kỳ mồ côi",
    (await prisma.reportingPeriod.count()) === periodsBeforeEmptyDate
  );

  // 400 do tag sai cũng không được tạo kỳ tuần mới.
  const periodsBeforeInvalidTag = await prisma.reportingPeriod.count();
  const invalidTagNewWeek = await postRoutine(token, {
    title: `${TMP} tag sai kỳ mới ${Date.now()}`,
    occurrenceStatus: "OCCURRED",
    workDate: "2026-12-07",
    catalogEntryIds: ["00000000-0000-4000-8000-000000000000"],
  });
  check(
    "6. 400 tag sai không tạo kỳ mới",
    invalidTagNewWeek.res.status === 400 &&
      (await prisma.reportingPeriod.count()) === periodsBeforeInvalidTag
  );

  // ---- 7. Công thức điểm tháng không đổi ----
  const score = computeScorePreview([
    { factor: 5.4, assignedQty: 3, completedQty: 3, lateDays: 0, reworkCount: 0 },
    { factor: 2.3, assignedQty: 100, completedQty: 95, lateDays: 1, reworkCount: 1 },
  ]);
  check(
    "7. Công thức điểm tháng giữ nguyên",
    score.totalAssignedConverted === 246.2 &&
      score.totalCompletedConverted === 234.7 &&
      score.score70 === 56.38 &&
      score.official === false
  );

  // ---- 8. workDate quyết định kỳ báo cáo (không dùng kỳ tuần mới nhất) ----
  const periodDate = "2025-03-10";
  const periodDateNextDay = "2025-03-11";
  const expectedWeek = getIsoWeekFromDate(new Date(`${periodDate}T12:00:00+07:00`));
  const periodBefore = await prisma.reportingPeriod.findFirst({
    where: { type: "WEEK", startAt: expectedWeek.startAt },
    select: { id: true },
  });

  const periodCreate = await postRoutine(token, {
    title: `${TMP} kỳ theo ngày ${Date.now()}`,
    occurrenceStatus: "OCCURRED",
    workDate: periodDate,
    shift: "SANG",
  });
  const periodEntryId = periodCreate.json?.routineEntry?.id;
  if (periodEntryId) createdEntryIds.push(periodEntryId);
  const periodEntry = periodEntryId
    ? await prisma.routineEntry.findUnique({
        where: { id: periodEntryId },
        include: { workItem: true },
      })
    : null;
  if (periodEntry?.workItemId) createdWorkItemIds.push(periodEntry.workItemId);
  const resolvedPeriod = periodEntry
    ? await prisma.reportingPeriod.findUnique({ where: { id: periodEntry.periodId } })
    : null;
  check(
    "8. workDate lịch sử tự phân giải đúng kỳ TUẦN tương ứng",
    periodCreate.res.status === 201 &&
      resolvedPeriod?.type === "WEEK" &&
      resolvedPeriod.startAt.getTime() === expectedWeek.startAt.getTime() &&
      resolvedPeriod.endAt.getTime() === expectedWeek.endInclusive.getTime(),
    `HTTP ${periodCreate.res.status} period=${resolvedPeriod?.title || "?"}`
  );
  check(
    "8. Ngày làm việc nằm trong kỳ đã phân giải",
    !!periodEntry &&
      !!resolvedPeriod &&
      isDateWithinPeriod(periodEntry.workDate!, resolvedPeriod.startAt, resolvedPeriod.endAt)
  );
  if (!periodBefore && resolvedPeriod && resolvedPeriod.startAt.getTime() === expectedWeek.startAt.getTime()) {
    createdWeekPeriodIds.push(resolvedPeriod.id);
  }

  // Kỳ do client gửi nhưng KHÔNG chứa workDate → từ chối, không ghi sai kỳ.
  const mismatchPeriod = await postRoutine(token, {
    periodId: period!.id,
    title: `${TMP} sai kỳ ${Date.now()}`,
    occurrenceStatus: "OCCURRED",
    workDate: periodDate,
  });
  check("8. Từ chối workDate nằm ngoài periodId client gửi", mismatchPeriod.res.status === 400, `HTTP ${mismatchPeriod.res.status}`);

  // Kỳ đã chốt (isLocked) phải chặn ghi, kể cả khi ngày tự phân giải.
  if (resolvedPeriod) {
    lockedPeriodBackup = { id: resolvedPeriod.id, isLocked: resolvedPeriod.isLocked };
    await prisma.reportingPeriod.update({
      where: { id: resolvedPeriod.id },
      data: { isLocked: true },
    });
    const lockedRes = await postRoutine(token, {
      title: `${TMP} kỳ khóa ${Date.now()}`,
      occurrenceStatus: "OCCURRED",
      workDate: periodDate,
    });
    check("8. Kỳ đã chốt trả 423 khi workDate tự phân giải vào kỳ đó", lockedRes.res.status === 423, `HTTP ${lockedRes.res.status}`);
    await prisma.reportingPeriod.update({
      where: { id: resolvedPeriod.id },
      data: { isLocked: resolvedPeriod.isLocked },
    });
    lockedPeriodBackup = null;
  }

  // ---- 9. NOT_OCCURRED: cùng kỳ nhưng khác ngày/ca được phép ----
  const notOccurredTitle = `${TMP} không phát sinh theo ngày ${Date.now()}`;
  const notOccurredBase = {
    title: notOccurredTitle,
    occurrenceStatus: "NOT_OCCURRED",
    shift: "CA_NGAY",
  };
  const monday = await postRoutine(token, { ...notOccurredBase, workDate: periodDate });
  const tuesday = await postRoutine(token, { ...notOccurredBase, workDate: periodDateNextDay });
  for (const created of [monday, tuesday]) {
    const id = created.json?.routineEntry?.id;
    if (id) createdEntryIds.push(id);
  }
  check(
    "9. NOT_OCCURRED thứ Hai + thứ Ba trong cùng kỳ đều được ghi",
    monday.res.status === 201 && tuesday.res.status === 201,
    `HTTP ${monday.res.status}/${tuesday.res.status}`
  );

  const duplicateImmediate = await postRoutine(token, { ...notOccurredBase, workDate: periodDate });
  check("9. NOT_OCCURRED trùng ngày/ca bị chặn ngay", duplicateImmediate.res.status === 409, `HTTP ${duplicateImmediate.res.status}`);

  await new Promise((resolve) => setTimeout(resolve, 3200));
  const duplicateAfterWindow = await postRoutine(token, { ...notOccurredBase, workDate: periodDate });
  check(
    "9. Unique NOT_OCCURRED theo ngày/ca vẫn chặn sau cửa sổ 3 giây",
    duplicateAfterWindow.res.status === 409 &&
      String(duplicateAfterWindow.json?.error || "").includes("cùng ngày và ca"),
    `HTTP ${duplicateAfterWindow.res.status} ${duplicateAfterWindow.json?.error || ""}`
  );

  const otherShift = await postRoutine(token, { ...notOccurredBase, workDate: periodDate, shift: "SANG" });
  const otherShiftId = otherShift.json?.routineEntry?.id;
  if (otherShiftId) createdEntryIds.push(otherShiftId);
  check("9. NOT_OCCURRED cùng ngày nhưng khác ca được phép", otherShift.res.status === 201, `HTTP ${otherShift.res.status}`);

  // Gắn workItemId của các entry NOT_OCCURRED vào cleanup (không xóa work item của người khác).
  const notOccurredIds = [monday, tuesday, otherShift]
    .map((created) => created.json?.routineEntry?.id)
    .filter(Boolean);
  if (notOccurredIds.length > 0) {
    const rows = await prisma.routineEntry.findMany({
      where: { id: { in: notOccurredIds } },
      select: { workItemId: true },
    });
    for (const row of rows) {
      if (row.workItemId) createdWorkItemIds.push(row.workItemId);
    }
  }

  // ---- 10. Tuần legacy kết thúc Chủ nhật 23:59Z không được nuốt Thứ Hai ----
  const legacyWeekTitle = `${TMP} LEGACY 19-25/10 end 23:59Z ${Date.now()}`;
  const legacyWeek = await prisma.reportingPeriod.create({
    data: {
      type: "WEEK",
      title: legacyWeekTitle,
      startAt: new Date("2026-10-19T00:00:00.000Z"),
      endAt: new Date("2026-10-25T23:59:59.999Z"),
      isLocked: false,
    },
  });
  legacyPeriodIds.push(legacyWeek.id);

  const assertWeekAttribution = async (vnDate: string, label: string) => {
    const expected = getIsoWeekFromDate(new Date(`${vnDate}T12:00:00+07:00`));
    const periodBeforeDate = await prisma.reportingPeriod.findFirst({
      where: { type: "WEEK", startAt: expected.startAt },
      select: { id: true },
    });
    const created = await postRoutine(token, {
      title: `${TMP} tuần VN ${vnDate} ${Date.now()}`,
      occurrenceStatus: "OCCURRED",
      workDate: vnDate,
      shift: "SANG",
    });
    const createdId = created.json?.routineEntry?.id;
    if (createdId) createdEntryIds.push(createdId);
    const entry = createdId
      ? await prisma.routineEntry.findUnique({
          where: { id: createdId },
          include: { workItem: true, period: true },
        })
      : null;
    if (entry?.workItemId) createdWorkItemIds.push(entry.workItemId);
    const correctWeek =
      created.res.status === 201 &&
      !!entry?.period &&
      entry.period.startAt.getTime() === expected.startAt.getTime() &&
      entry.period.endAt.getTime() === expected.endInclusive.getTime();
    check(
      `${label} ${vnDate} gán đúng tuần ${expected.weekNumber}`,
      correctWeek,
      `HTTP ${created.res.status} period=${entry?.period?.title || "?"}`
    );
    if (!periodBeforeDate && entry?.periodId) createdWeekPeriodIds.push(entry.periodId);
    return { entry, status: created.res.status };
  };

  await assertWeekAttribution("2026-10-25", "10.");
  await assertWeekAttribution("2026-10-26", "10.");
  await assertWeekAttribution("2026-11-01", "10.");

  // Legacy tuần 44 (26/10–01/11 end 23:59Z) xuất hiện TRƯỚC khi ghi 02/11.
  const legacyWeek44 = await prisma.reportingPeriod.create({
    data: {
      type: "WEEK",
      title: `${TMP} LEGACY 26/10-01/11 end 23:59Z ${Date.now()}`,
      startAt: new Date("2026-10-26T00:00:00.000Z"),
      endAt: new Date("2026-11-01T23:59:59.999Z"),
      isLocked: false,
    },
  });
  legacyPeriodIds.push(legacyWeek44.id);
  await assertWeekAttribution("2026-11-02", "10. (sau legacy week44)");

  // ---- 11. Legacy periodId: chấp nhận cùng tuần, từ chối sang tuần sau ----
  const acceptedLegacy = await postRoutine(token, {
    periodId: legacyWeek.id,
    title: `${TMP} legacy period 20/10 được nhận ${Date.now()}`,
    occurrenceStatus: "OCCURRED",
    workDate: "2026-10-20",
  });
  const acceptedEntryId = acceptedLegacy.json?.routineEntry?.id;
  if (acceptedEntryId) createdEntryIds.push(acceptedEntryId);
  const acceptedEntry = acceptedEntryId
    ? await prisma.routineEntry.findUnique({
        where: { id: acceptedEntryId },
        include: { workItem: true },
      })
    : null;
  if (acceptedEntry?.workItemId) createdWorkItemIds.push(acceptedEntry.workItemId);
  check(
    "11. Chấp nhận periodId legacy 19–25/10 cho ngày 20/10 (cùng tuần ISO)",
    acceptedLegacy.res.status === 201 && acceptedEntry?.periodId === legacyWeek.id,
    `HTTP ${acceptedLegacy.res.status}`
  );

  const rejectedLegacy = await postRoutine(token, {
    periodId: legacyWeek.id,
    title: `${TMP} legacy period 26/10 bị từ chối ${Date.now()}`,
    occurrenceStatus: "OCCURRED",
    workDate: "2026-10-26",
  });
  check(
    "11. Từ chối periodId legacy 19–25/10 cho ngày 26/10 (tuần kế tiếp)",
    rejectedLegacy.res.status === 400,
    `HTTP ${rejectedLegacy.res.status}`
  );

  // ---- 12. Không được bypass tuần đã khóa qua kỳ legacy misaligned ----
  const lockedLegacyTitle = `${TMP} LEGACY LOCKED week44 26/10-01/11 ${Date.now()}`;
  const lockedLegacy = await prisma.reportingPeriod.create({
    data: {
      type: "WEEK",
      title: lockedLegacyTitle,
      startAt: new Date("2026-10-26T00:00:00.000Z"),
      endAt: new Date("2026-11-01T23:59:59.999Z"),
      isLocked: true,
    },
  });
  legacyPeriodIds.push(lockedLegacy.id);
  const periodsBeforeLockedWrite = await prisma.reportingPeriod.count();
  const lockedWrite = await postRoutine(token, {
    title: `${TMP} ghi vào tuần khóa ${Date.now()}`,
    occurrenceStatus: "OCCURRED",
    workDate: "2026-10-28",
  });
  check(
    "12. Ghi vào tuần có legacy week44 đã khóa trả 423",
    lockedWrite.res.status === 423,
    `HTTP ${lockedWrite.res.status}`
  );
  check(
    "12. Tuần khóa không tạo thêm kỳ song song",
    (await prisma.reportingPeriod.count()) === periodsBeforeLockedWrite
  );

  // ---- 13. P2002 title conflict: đọc lại, không trả lỗi 400 giả khi kỳ đúng ----
  // Tạo kỳ cùng title chuẩn nhưng khoảng ngày sai → helper phải 400, không crash 500.
  const conflictDate = "2027-02-01";
  const conflictWeek = getIsoWeekFromDate(new Date(`${conflictDate}T12:00:00+07:00`));
  const conflictPeriod = await prisma.reportingPeriod.create({
    data: {
      type: "WEEK",
      title: conflictWeek.standardTitle,
      startAt: new Date("2020-01-06T00:00:00.000Z"),
      endAt: new Date("2020-01-12T23:59:59.999Z"),
      isLocked: false,
    },
  });
  legacyPeriodIds.push(conflictPeriod.id);
  const periodsBeforeConflict = await prisma.reportingPeriod.count();
  const conflictWrite = await postRoutine(token, {
    title: `${TMP} title conflict ${Date.now()}`,
    occurrenceStatus: "OCCURRED",
    workDate: conflictDate,
  });
  check(
    "13. P2002 title conflict misaligned trả 400 (không 500), không tạo kỳ",
    conflictWrite.res.status === 400 &&
      (await prisma.reportingPeriod.count()) === periodsBeforeConflict,
    `HTTP ${conflictWrite.res.status}`
  );
}

async function cleanup() {
  if (selectionModeBackup) {
    await prisma.workCatalogVersion
      .update({
        where: { id: selectionModeBackup.id },
        data: { selectionMode: selectionModeBackup.selectionMode },
      })
      .catch(() => {});
  }
  if (lockedPeriodBackup) {
    await prisma.reportingPeriod
      .update({
        where: { id: lockedPeriodBackup.id },
        data: { isLocked: lockedPeriodBackup.isLocked },
      })
      .catch(() => {});
  }
  if (createdEntryIds.length) {
    await prisma.routineEntry.deleteMany({ where: { id: { in: createdEntryIds } } }).catch(() => {});
  }
  if (createdWorkItemIds.length) {
    await prisma.personalWorkItem.deleteMany({ where: { id: { in: createdWorkItemIds } } }).catch(() => {});
  }
  // Chỉ xóa kỳ tuần do test tạo và đã không còn bản ghi nào tham chiếu.
  for (const periodId of createdWeekPeriodIds) {
    const refs = await prisma.routineEntry.count({ where: { periodId } }).catch(() => 1);
    if (refs === 0) {
      await prisma.reportingPeriod.delete({ where: { id: periodId } }).catch(() => {});
    }
  }
  for (const periodId of legacyPeriodIds) {
    const refs = await prisma.routineEntry.count({ where: { periodId } }).catch(() => 1);
    if (refs === 0) {
      await prisma.reportingPeriod.delete({ where: { id: periodId } }).catch(() => {});
    }
  }
}

main()
  .catch((error) => {
    failed++;
    failures.push(String(error?.stack || error));
    console.error(error);
  })
  .finally(async () => {
    try {
      await cleanup();
    } finally {
      await prisma.$disconnect();
    }
    console.log(`\n=== KẾT QUẢ: ${passed} pass / ${failed} fail ===`);
    if (failed > 0) {
      console.log(failures.join("\n"));
      process.exitCode = 1;
    }
  });
