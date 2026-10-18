/**
 * YC-23 + YC-25 — Kiểm thử API trên môi trường TEST CỤC BỘ (localhost:3100 + PostgreSQL nhúng).
 *
 * Phạm vi (13 mục nghiệm thu, phần API):
 *  1. Cán bộ A/B chỉ thấy đầu việc bộ phận mình (YC-25)
 *  2. API chặn vượt phạm vi (403) khi xem/tạo/chọn chéo bộ phận
 *  3. Trưởng bộ phận thêm/sửa/ngừng dùng đầu việc của bộ phận mình (409 khi trùng tên)
 *  4. Chọn mẫu thường xuyên (48 mẫu) khi tạo đầu việc kế hoạch
 *  5. Chọn sản phẩm QĐ1277 khi tạo đầu việc kế hoạch
 *  6. Tìm sản phẩm phía máy chủ (3.386 dòng, phân trang)
 *  7. Dữ liệu bền vững (GET lại thấy liên kết đã lưu — phần F5 kiểm thử qua UI)
 *  8. Sửa danh mục bộ phận không viết lại nội dung kế hoạch cũ (snapshot)
 *  9. Không phát sinh Task trùng khi chọn danh mục
 * 10. Không ghi nhận/tính điểm trùng: POST trùng → trả bản ghi cũ; PATCH trùng → 409
 * 11. Excel export regression (Bảng 1 + 02C) — HTTP 200, tệp XLSX hợp lệ
 * 12. Bảo toàn lịch sử: xoá đầu việc bộ phận đã dùng → chuyển INACTIVE, kế hoạch cũ nguyên vẹn
 * 13. Quyền SYSTEM_ADMIN bị chặn với danh mục nghiệp vụ (nếu tìm thấy tài khoản test)
 *
 * Chạy:
 *   $env:DATABASE_URL="postgresql://postgres:postgres@localhost:54329/talung_dev"; $env:DIRECT_URL=$env:DATABASE_URL; $env:TEST_BASE_URL="http://localhost:3100"; npx tsx scripts/test-yc23-25-api.ts
 */
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3100";
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } } });

const TAG = "[TEST-YC2325]";
const YEAR = 2026;
const MONTH = 10;

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`✅ [PASS] ${name}${detail ? " — " + detail : ""}`);
  } else {
    failed++;
    failures.push(name + (detail ? " — " + detail : ""));
    console.log(`❌ [FAIL] ${name}${detail ? " — " + detail : ""}`);
  }
}

/** Đọc mật khẩu tài khoản DEMO từ demo-ops/demo-secrets.json (không nhúng mật khẩu vào mã nguồn). */
function demoSecret(username: string): string {
  const file = path.resolve("demo-ops/demo-secrets.json");
  if (!fs.existsSync(file)) {
    throw new Error(`Thieu ${file} — mat khau tai khoan DEMO khong nam trong ma nguon`);
  }
  const json = JSON.parse(fs.readFileSync(file, "utf-8"));
  const acc = (json.accounts || []).find((a: any) => a.username === username);
  if (!acc) throw new Error(`Khong thay tai khoan DEMO ${username} trong demo-secrets.json`);
  return process.env[`DEMO_${username.toUpperCase()}_PASSWORD`] || acc.password;
}

async function login(username: string, password: string) {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`Đăng nhập ${username} thất bại (HTTP ${res.status})`);
  const json = await res.json();
  return { token: json.token as string, user: json.user as any };
}

function api(token: string) {
  return async (path: string, init: RequestInit = {}) => {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init.headers || {}),
      },
    });
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { status: res.status, json };
  };
}

async function cleanup() {
  // Xoá dữ liệu test các lần chạy trước (chỉ bản ghi gắn nhãn TEST)
  const testPwis = await prisma.personalWorkItem.findMany({
    where: {
      OR: [{ title: { startsWith: TAG } }, { deptWorkItem: { title: { startsWith: TAG } } }],
    },
    select: { id: true },
  });
  const ids = testPwis.map((x) => x.id);
  if (ids.length > 0) {
    await prisma.monthlyWorkResult.deleteMany({ where: { workItemId: { in: ids } } });
    await prisma.personalWorkItem.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.monthlyWorkResult.deleteMany({ where: { title: { startsWith: TAG } } });
  await prisma.departmentWorkItem.deleteMany({ where: { title: { startsWith: TAG } } });
  console.log(`• Dọn dữ liệu test cũ: ${ids.length} đầu việc, các bản ghi gắn nhãn ${TAG}\n`);
}

async function main() {
  console.log("=================================================================");
  console.log("YC-23 + YC-25 — KIỂM THỬ API (môi trường test cục bộ)");
  console.log("=================================================================\n");

  await cleanup();

  // Kỳ công tác tuần đang mở (Tuần 42 không khoá)
  const period = await prisma.reportingPeriod.findFirst({ where: { type: "WEEK", isLocked: false }, orderBy: { startAt: "desc" } });
  if (!period) throw new Error("Không tìm thấy kỳ WEEK chưa khoá trong DB test");
  console.log(`• Kỳ dùng cho test: ${period.title} (id=${period.id.slice(0, 8)}…)\n`);

  const unitA = await prisma.orgUnit.findUnique({ where: { code: "BP_NGHIEPVU_A" } });
  const unitB = await prisma.orgUnit.findUnique({ where: { code: "BP_GIAMSAT_B" } });
  if (!unitA || !unitB) throw new Error("Thiếu đơn vị test BP_NGHIEPVU_A / BP_GIAMSAT_B");

  // Mật khẩu tài khoản DEMO đọc từ demo-ops/demo-secrets.json (không nhúng vào mã nguồn).
  // Mật khẩu cb001/cb002 do scripts/demo-local-test-accounts.ts đặt (chỉ chạy với DB cục bộ).
  const deptLeaderPassword = process.env.DEPT_LEADER_TEST_PASSWORD || "LocalTest@2026";
  const staffA = await login("democb01", demoSecret("democb01")); // STAFF @ BP_NGHIEPVU_A
  const staffB = await login("democb02", demoSecret("democb02")); // STAFF @ BP_GIAMSAT_B
  const leaderA = await login("cb001", deptLeaderPassword); // DEPARTMENT_LEADER @ BP_NGHIEPVU_A
  const leaderB = await login("cb002", deptLeaderPassword); // DEPARTMENT_LEADER @ BP_GIAMSAT_B
  const unitLeader = await login("demold01", demoSecret("demold01")); // UNIT_LEADER
  console.log("• Đã đăng nhập: democb01, democb02, cb001, cb002, demold01\n");

  const sA = api(staffA.token);
  const sB = api(staffB.token);
  const lA = api(leaderA.token);
  const lB = api(leaderB.token);
  const uL = api(unitLeader.token);

  // =========================================================================
  // 1–2. Phạm vi danh mục bộ phận
  // =========================================================================
  const g1 = await sA(`/api/department-work-items?status=ACTIVE`);
  check("1a. Cán bộ A xem danh mục bộ phận mình", g1.status === 200 && Array.isArray(g1.json?.data), `HTTP ${g1.status}, ${g1.json?.data?.length ?? 0} mục`);
  check(
    "1b. Cán bộ A chỉ thấy đầu việc của bộ phận A",
    (g1.json?.data || []).length > 0 && (g1.json?.data || []).every((x: any) => x.unitId === unitA.id),
    `${(g1.json?.data || []).filter((x: any) => x.unitId !== unitA.id).length} mục lạ`
  );
  check("1c. Cán bộ A không có quyền quản lý danh mục (canManage=false)", g1.json?.canManage === false);
  check(
    "1d. Nhãn bộ phận cho UI nhận đúng (units)",
    Array.isArray(g1.json?.units) && g1.json.units.length === 1 && g1.json.units[0]?.id === unitA.id
  );

  const g2 = await sB(`/api/department-work-items?status=ACTIVE`);
  check(
    "2a. Cán bộ B chỉ thấy đầu việc của bộ phận B",
    g2.status === 200 && (g2.json?.data || []).length > 0 && (g2.json?.data || []).every((x: any) => x.unitId === unitB.id),
    `${(g2.json?.data || []).length} mục`
  );
  const crossView = await sA(`/api/department-work-items?unitId=${unitB.id}&status=ACTIVE`);
  check("2b. Cán bộ A xem chéo bộ phận B → 403", crossView.status === 403, `HTTP ${crossView.status}`);
  const staffCreate = await sA(`/api/department-work-items`, { method: "POST", body: JSON.stringify({ unitId: unitA.id, title: `${TAG} Cán bộ tự thêm` }) });
  check("2c. Cán bộ (STAFF) không được thêm đầu việc danh mục → 403", staffCreate.status === 403, `HTTP ${staffCreate.status}`);
  const crossLead = await lA(`/api/department-work-items?unitId=${unitB.id}&status=ALL`);
  check("2d. Trưởng bộ phận A xem danh mục bộ phận B → 403", crossLead.status === 403, `HTTP ${crossLead.status}`);
  const crossLeadCreate = await lA(`/api/department-work-items`, { method: "POST", body: JSON.stringify({ unitId: unitB.id, title: `${TAG} Trưởng A thêm cho B` }) });
  check("2e. Trưởng bộ phận A thêm đầu việc cho bộ phận B → 403", crossLeadCreate.status === 403, `HTTP ${crossLeadCreate.status}`);

  // =========================================================================
  // 3. Trưởng bộ phận quản lý danh mục bộ phận mình
  // =========================================================================
  const create1 = await lA(`/api/department-work-items`, {
    method: "POST",
    body: JSON.stringify({ unitId: unitA.id, title: `${TAG} Kiểm tra hồ sơ ưu tiên`, description: "test" }),
  });
  check("3a. Trưởng bộ phận A thêm đầu việc mới → 201", create1.status === 201, `HTTP ${create1.status} ${create1.json?.error || ""}`);
  const deptItemId = create1.json?.data?.id as string;

  const dupCreate = await lA(`/api/department-work-items`, {
    method: "POST",
    body: JSON.stringify({ unitId: unitA.id, title: `${TAG} Kiểm tra hồ sơ ưu tiên` }),
  });
  check("3b. Thêm trùng tên trong cùng bộ phận → 409", dupCreate.status === 409, `HTTP ${dupCreate.status}`);

  const patch1 = await lA(`/api/department-work-items`, {
    method: "PATCH",
    body: JSON.stringify({ id: deptItemId, title: `${TAG} Kiểm tra hồ sơ ưu tiên (đã sửa)` }),
  });
  check("3c. Sửa tên đầu việc bộ phận → 200", patch1.status === 200 && patch1.json?.data?.title?.includes("(đã sửa)"), `HTTP ${patch1.status}`);

  const patchDisable = await lA(`/api/department-work-items`, { method: "PATCH", body: JSON.stringify({ id: deptItemId, status: "INACTIVE" }) });
  const patchEnable = await lA(`/api/department-work-items`, { method: "PATCH", body: JSON.stringify({ id: deptItemId, status: "ACTIVE" }) });
  check(
    "3d. Ngừng sử dụng rồi kích hoạt lại được",
    patchDisable.status === 200 && patchDisable.json?.data?.status === "INACTIVE" && patchEnable.status === 200 && patchEnable.json?.data?.status === "ACTIVE"
  );

  const leaderBPatch = await lB(`/api/department-work-items`, { method: "PATCH", body: JSON.stringify({ id: deptItemId, title: "x" }) });
  check("3e. Trưởng bộ phận B sửa đầu việc bộ phận A → 403", leaderBPatch.status === 403, `HTTP ${leaderBPatch.status}`);

  const ulList = await uL(`/api/department-work-items?status=ALL`);
  check(
    "3f. Lãnh đạo đơn vị: canManage=true, thấy nhiều bộ phận",
    ulList.status === 200 && ulList.json?.canManage === true && (ulList.json?.units || []).length > 1,
    `${(ulList.json?.units || []).length} đơn vị`
  );

  // =========================================================================
  // 4–5–7. Chọn mẫu thường xuyên / sản phẩm / danh mục bộ phận khi tạo đầu việc kế hoạch
  // =========================================================================
  const templatesRes = await sA(`/api/catalog/templates`);
  const templates = templatesRes.json?.data || templatesRes.json || [];
  check("4a. Danh mục 48 mẫu thường xuyên tải được", templatesRes.status === 200 && Array.isArray(templates) && templates.length >= 40, `${templates.length} mẫu`);
  const tpl = templates[0];

  const pwiTpl = await sA(`/api/personal-work-items`, {
    method: "POST",
    body: JSON.stringify({ personId: staffA.user.personId, periodId: period.id, templateId: tpl.id, title: `${TAG} Đầu việc từ mẫu ${tpl.code}` }),
  });
  check(
    "4b. Tạo đầu việc từ mẫu thường xuyên → 201, liên kết mẫu đúng",
    pwiTpl.status === 201 && pwiTpl.json?.data?.templateId === tpl.id,
    `HTTP ${pwiTpl.status} ${pwiTpl.json?.error || ""}`
  );

  const prodSearch = await sA(`/api/products?search=${encodeURIComponent("giám sát")}&page=1&pageSize=8`);
  check(
    "6a. Tìm sản phẩm phía máy chủ (từ khoá có dấu) trả kết quả + phân trang",
    prodSearch.status === 200 && (prodSearch.json?.data || []).length > 0 && (prodSearch.json?.pagination?.total || 0) > 0,
    `total=${prodSearch.json?.pagination?.total}`
  );
  const prodSearchNoAccent = await sA(`/api/products?search=${encodeURIComponent("giam sat")}&page=1&pageSize=8`);
  check(
    "6b. Tìm không dấu vẫn ra kết quả (unaccent)",
    prodSearchNoAccent.status === 200 && (prodSearchNoAccent.json?.data || []).length > 0,
    `total=${prodSearchNoAccent.json?.pagination?.total}`
  );
  const product = prodSearch.json?.data?.[0];

  const pwiProd = await sA(`/api/personal-work-items`, {
    method: "POST",
    body: JSON.stringify({ personId: staffA.user.personId, periodId: period.id, productItemId: product.id, title: `${TAG} Đầu việc gắn SP ${product.code}` }),
  });
  check(
    "5a. Tạo đầu việc gắn sản phẩm QĐ1277 → 201, liên kết sản phẩm đúng",
    pwiProd.status === 201 && pwiProd.json?.data?.productItemId === product.id,
    `HTTP ${pwiProd.status} ${pwiProd.json?.error || ""}`
  );

  const pwiDeptAuto = await sA(`/api/personal-work-items`, {
    method: "POST",
    body: JSON.stringify({ personId: staffA.user.personId, periodId: period.id, deptWorkItemId: deptItemId, productItemId: product.id }),
  });
  const deptItemNow = await prisma.departmentWorkItem.findUnique({ where: { id: deptItemId } });
  check(
    "5b. Tạo đầu việc từ danh mục bộ phận (không nhập tên) → tự điền tên theo danh mục, gắn SP tuỳ chọn",
    pwiDeptAuto.status === 201 &&
      pwiDeptAuto.json?.data?.deptWorkItemId === deptItemId &&
      pwiDeptAuto.json?.data?.title === deptItemNow?.title &&
      pwiDeptAuto.json?.data?.productItemId === product.id,
    `HTTP ${pwiDeptAuto.status} ${pwiDeptAuto.json?.error || ""}`
  );
  const pwiDeptId = pwiDeptAuto.json?.data?.id as string;

  const bothSources = await sA(`/api/personal-work-items`, {
    method: "POST",
    body: JSON.stringify({ personId: staffA.user.personId, periodId: period.id, templateId: tpl.id, deptWorkItemId: deptItemId }),
  });
  check("5c. Chọn đồng thời mẫu 48 + danh mục bộ phận → 400 (hai nguồn loại trừ nhau)", bothSources.status === 400, `HTTP ${bothSources.status}`);

  const crossDeptPwi = await sB(`/api/personal-work-items`, {
    method: "POST",
    body: JSON.stringify({ personId: staffB.user.personId, periodId: period.id, deptWorkItemId: deptItemId }),
  });
  check("5d. Cán bộ B chọn đầu việc danh mục bộ phận A → 403", crossDeptPwi.status === 403, `HTTP ${crossDeptPwi.status}`);

  const inactiveOk = await prisma.departmentWorkItem.update({ where: { id: deptItemId }, data: { status: "INACTIVE" } });
  const disabledPick = await sA(`/api/personal-work-items`, {
    method: "POST",
    body: JSON.stringify({ personId: staffA.user.personId, periodId: period.id, deptWorkItemId: deptItemId }),
  });
  await prisma.departmentWorkItem.update({ where: { id: deptItemId }, data: { status: "ACTIVE" } });
  check(
    "5e. Đầu việc bộ phận đã NGỪNG SỬ DỤNG không chọn được để tạo mới → 400",
    inactiveOk.status === "INACTIVE" && disabledPick.status === 400,
    `HTTP ${disabledPick.status}`
  );

  // =========================================================================
  // 7. Bền vững sau khi lưu (phần API của kiểm thử F5)
  // =========================================================================
  const relist = await sA(`/api/personal-work-items?personId=${staffA.user.personId}&periodId=${period.id}`);
  const relisted = (relist.json?.data || []).find((x: any) => x.id === pwiDeptId);
  check(
    "7a. Gọi lại API (tương đương F5) thấy đủ liên kết đã lưu",
    relist.status === 200 && !!relisted && relisted.deptWorkItem?.id === deptItemId && relisted.product?.id === product.id,
    relisted ? `deptWorkItem=${!!relisted.deptWorkItem}, product=${!!relisted.product}` : "không thấy bản ghi"
  );

  const monthFilter = await sA(`/api/personal-work-items?personId=${staffA.user.personId}&year=${YEAR}&month=${MONTH}`);
  check(
    "7b. Lọc đầu việc theo tháng (year/month) phục vụ liên kết kết quả tháng",
    monthFilter.status === 200 && (monthFilter.json?.data || []).some((x: any) => x.id === pwiDeptId),
    `${(monthFilter.json?.data || []).length} đầu việc trong tháng`
  );

  // =========================================================================
  // 8. Sửa danh mục không viết lại nội dung kế hoạch cũ
  // =========================================================================
  const patchRename = await lA(`/api/department-work-items`, {
    method: "PATCH",
    body: JSON.stringify({ id: deptItemId, title: `${TAG} Kiểm tra hồ sơ ưu tiên (đổi lần 2)` }),
  });
  const afterRename = await prisma.personalWorkItem.findUnique({ where: { id: pwiDeptId } });
  const snapshotTitle = pwiDeptAuto.json?.data?.title as string;
  check(
    "8a. Đổi tên đầu việc danh mục → nội dung đầu việc trong kế hoạch cũ GIỮ NGUYÊN (snapshot)",
    patchRename.status === 200 && afterRename?.title === snapshotTitle && afterRename?.title !== patchRename.json?.data?.title,
    `kế hoạch="${afterRename?.title}" vs danh mục="${patchRename.json?.data?.title}"`
  );

  // =========================================================================
  // 9. Không phát sinh Task trùng
  // =========================================================================
  const taskCountBefore = await prisma.task.count();
  const pwiExtra = await sA(`/api/personal-work-items`, {
    method: "POST",
    body: JSON.stringify({ personId: staffA.user.personId, periodId: period.id, deptWorkItemId: deptItemId }),
  });
  const taskCountAfter = await prisma.task.count();
  check(
    "9a. Chọn danh mục đầu việc KHÔNG tự tạo Task (không phát sinh \"nhiệm vụ\" trùng)",
    pwiExtra.status === 201 && taskCountBefore === taskCountAfter,
    `Task trước=${taskCountBefore}, sau=${taskCountAfter}`
  );

  // =========================================================================
  // 10. Ghi nhận kết quả tháng: liên kết + chống trùng
  // =========================================================================
  const post1 = await sA(`/api/monthly-results`, {
    method: "POST",
    body: JSON.stringify({ personId: staffA.user.personId, periodYear: YEAR, periodMonth: MONTH, workItemId: pwiDeptId, title: `${TAG} Kết quả từ đầu việc`, completedQty: 1 }),
  });
  check(
    "10a. Ghi kết quả tháng có liên kết đầu việc → 200/201, tự kế thừa sản phẩm từ kế hoạch",
    (post1.status === 200 || post1.status === 201) && post1.json?.data?.workItemId === pwiDeptId && post1.json?.data?.productItemId === product.id,
    `HTTP ${post1.status} ${post1.json?.error || ""}`
  );

  const post2 = await sA(`/api/monthly-results`, {
    method: "POST",
    body: JSON.stringify({ personId: staffA.user.personId, periodYear: YEAR, periodMonth: MONTH, workItemId: pwiDeptId, title: `${TAG} Kết quả từ đầu việc (ghi lại)`, completedQty: 2 }),
  });
  const dupRows = await prisma.monthlyWorkResult.count({ where: { workItemId: pwiDeptId, periodYear: YEAR, periodMonth: MONTH } });
  check(
    "10b. Ghi lại cùng đầu việc + cùng sản phẩm trong tháng → trả bản ghi cũ (deduplicated), DB vẫn 1 dòng",
    post2.json?.deduplicated === true && dupRows === 1,
    `deduplicated=${post2.json?.deduplicated}, rows=${dupRows}`
  );

  const crossPerson = await sB(`/api/monthly-results`, {
    method: "POST",
    body: JSON.stringify({ personId: staffB.user.personId, periodYear: YEAR, periodMonth: MONTH, workItemId: pwiDeptId, title: `${TAG} B ghi cho đầu việc của A` }),
  });
  check("10c. Cán bộ B ghi kết quả cho đầu việc kế hoạch của A → 400", crossPerson.status === 400, `HTTP ${crossPerson.status}`);

  const extraRow = await sA(`/api/monthly-results`, {
    method: "POST",
    body: JSON.stringify({ personId: staffA.user.personId, periodYear: YEAR, periodMonth: MONTH, title: `${TAG} Bản ghi phụ để thử PATCH` }),
  });
  const extraId = extraRow.json?.data?.id as string;
  const patchDup = await sA(`/api/monthly-results`, {
    method: "PATCH",
    body: JSON.stringify({ id: extraId, workItemId: pwiDeptId, productItemId: product.id }),
  });
  check("10d. PATCH gắn trùng đầu việc + sản phẩm vào bản ghi khác → 409", patchDup.status === 409, `HTTP ${patchDup.status}`);
  await sA(`/api/monthly-results?id=${extraId}`, { method: "DELETE" });

  const getMonthly = await sA(`/api/monthly-results?year=${YEAR}&month=${MONTH}&personId=${staffA.user.personId}`);
  const linked = (getMonthly.json?.data || []).find((x: any) => x.workItemId === pwiDeptId);
  check(
    "10e. Danh sách kết quả tháng hiển thị đầu việc liên kết",
    getMonthly.status === 200 && !!linked && linked.workItem?.title === afterRename?.title,
    linked ? `workItem="${linked.workItem?.title}"` : "không thấy"
  );

  // =========================================================================
  // 11. Excel export regression (Bảng 1 + 02C)
  // =========================================================================
  for (const tplName of ["bang1", "02c"] as const) {
    const res = await fetch(`${BASE_URL}/api/monthly-export`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${staffA.token}` },
      body: JSON.stringify({ personId: staffA.user.personId, year: YEAR, month: MONTH, template: tplName }),
    });
    let isXlsx = false;
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      isXlsx = buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b; // "PK" — ZIP/XLSX
    }
    check(`11. Excel export "${tplName}" → 200 + tệp XLSX hợp lệ (hồi quy sau fix 500)`, res.ok && isXlsx, `HTTP ${res.status}`);
  }

  // =========================================================================
  // 12. Bảo toàn lịch sử: xoá đầu việc đã dùng → INACTIVE
  // =========================================================================
  const delUsed = await lA(`/api/department-work-items?id=${deptItemId}`, { method: "DELETE" });
  const deptAfterDel = await prisma.departmentWorkItem.findUnique({ where: { id: deptItemId } });
  const planAfterDel = await prisma.personalWorkItem.findUnique({ where: { id: pwiDeptId } });
  check(
    "12a. Xoá đầu việc danh mục ĐÃ dùng trong kế hoạch → chuyển INACTIVE, không xoá cứng",
    delUsed.status === 200 && deptAfterDel?.status === "INACTIVE" && (delUsed.json?.message || "").includes("NGỪNG SỬ DỤNG"),
    `HTTP ${delUsed.status} status=${deptAfterDel?.status}`
  );
  check(
    "12b. Đầu việc trong kế hoạch cũ GIỮ NGUYÊN liên kết và nội dung sau khi danh mục ngừng dùng",
    planAfterDel?.deptWorkItemId === deptItemId && planAfterDel?.title === pwiDeptAuto.json?.data?.title,
    `title="${planAfterDel?.title}"`
  );

  // Xoá một đầu việc chưa dùng → xoá cứng
  const unused = await lA(`/api/department-work-items`, { method: "POST", body: JSON.stringify({ unitId: unitA.id, title: `${TAG} Bản nháp chưa dùng` }) });
  const unusedId = unused.json?.data?.id as string;
  const delUnused = await lA(`/api/department-work-items?id=${unusedId}`, { method: "DELETE" });
  const unusedAfter = await prisma.departmentWorkItem.findUnique({ where: { id: unusedId } });
  check("12c. Xoá đầu việc CHƯA dùng → xoá khỏi danh mục", delUnused.status === 200 && unusedAfter === null, `HTTP ${delUnused.status}`);

  // =========================================================================
  // 13. SYSTEM_ADMIN bị chặn (nếu xác định được tài khoản)
  // =========================================================================
  const sysGrant = await prisma.roleGrant.findFirst({
    where: { role: { code: "SYSTEM_ADMIN" } },
    include: { account: true },
  });
  if (sysGrant?.account?.username) {
    const sysPassword = process.env.SYSTEM_ADMIN_TEST_PASSWORD;
    if (sysPassword) {
      try {
        const sys = await login(sysGrant.account.username, sysPassword);
        const sysApi = api(sys.token);
        const r1 = await sysApi(`/api/department-work-items?status=ALL`);
        const r2 = await sysApi(`/api/monthly-export`, { method: "POST", body: JSON.stringify({ year: YEAR, month: MONTH, template: "bang1" }) });
        check("13a. SYSTEM_ADMIN bị chặn danh mục đầu việc bộ phận → 403", r1.status === 403, `HTTP ${r1.status}`);
        check("13b. SYSTEM_ADMIN bị chặn xuất/nghiệp vụ kết quả tháng → 403", r2.status === 403, `HTTP ${r2.status}`);
      } catch (e: any) {
        console.log(`⚠️  Bỏ qua mục 13: không đăng nhập được tài khoản SYSTEM_ADMIN (${e.message})`);
      }
    } else {
      console.log(`⚠️  Bỏ qua mục 13: tài khoản SYSTEM_ADMIN "${sysGrant.account.username}" không có mật khẩu test (đặt SYSTEM_ADMIN_TEST_PASSWORD để chạy).`);
    }
  }

  // Xuất ID các bản ghi chính để script UI (test-yc23-25-ui.ts) dùng lại
  const idsFile = path.resolve("demo-ops/yc23-25-test-ids.json");
  fs.mkdirSync(path.dirname(idsFile), { recursive: true });
  fs.writeFileSync(
    idsFile,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        year: YEAR,
        month: MONTH,
        staffAPersonId: staffA.user.personId,
        staffBPersonId: staffB.user.personId,
        unitAId: unitA.id,
        unitBId: unitB.id,
        departmentItemId: deptItemId,
        departmentItemStatusAfterTest: deptAfterDel?.status,
        pwiDeptId: pwiDeptId,
        pwiProductId: pwiProd.json?.data?.id,
        pwiTemplateId: pwiTpl.json?.data?.id,
        productItemId: product.id,
        productCode: product.code,
      },
      null,
      2
    )
  );
  console.log(`\n• Đã ghi ID kiểm thử: ${idsFile}`);

  console.log("\n=================================================================");
  console.log(`KẾT QUẢ: ${passed} PASS / ${failed} FAIL`);
  if (failures.length > 0) {
    console.log("Các mục lỗi:");
    failures.forEach((f) => console.log("  - " + f));
  }
  console.log("=================================================================");
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("LỖI TEST:", e);
    process.exitCode = 2;
  })
  .finally(() => prisma.$disconnect());
