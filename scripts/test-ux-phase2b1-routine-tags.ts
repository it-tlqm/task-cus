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
  if (createdEntryIds.length) {
    await prisma.routineEntry.deleteMany({ where: { id: { in: createdEntryIds } } }).catch(() => {});
  }
  if (createdWorkItemIds.length) {
    await prisma.personalWorkItem.deleteMany({ where: { id: { in: createdWorkItemIds } } }).catch(() => {});
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
