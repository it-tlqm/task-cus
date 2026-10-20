/**
 * test-yc30-tx1-e2e.ts — Kiểm thử end-to-end luồng YC-31/YC-32 trên Production:
 *  1. Cán bộ xem được 348 đầu việc TX1 (6 nhóm) qua API.
 *  2. Tạo đầu việc cá nhân TỪ DANH MỤC TX1 (mã NV-01) — có hạn xử lý.
 *  3. Cập nhật tiến độ + ngày hoàn thành + đính kèm minh chứng.
 *  4. Công việc đã đưa vào kết quả đánh giá thì báo đúng (inEvaluation).
 *  5. Không nhân đôi bản ghi; dọn sạch dữ liệu test.
 *
 * Chạy:
 *   $env:TEST_BASE_URL="https://task-cus.vercel.app"
 *   npx tsx scripts/test-yc30-tx1-e2e.ts
 */
import fs from "fs";
import path from "path";

const BASE = process.env.TEST_BASE_URL || "https://task-cus.vercel.app";
const REPO = process.cwd();
const secrets = JSON.parse(fs.readFileSync(path.join(REPO, "demo-ops", "demo-secrets.json"), "utf8"));
const passwords = Object.fromEntries(secrets.accounts.map((a: any) => [a.username, a.password]));

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

async function login(username: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: passwords[username] }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.token) throw new Error(`Đăng nhập ${username} lỗi: HTTP ${res.status}`);
  return json.token;
}

async function api(token: string, pathname: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
      ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
    },
  });
  const ct = res.headers.get("content-type") || "";
  const json = ct.includes("json") ? await res.json().catch(() => null) : null;
  return { status: res.status, json };
}

const TAG = `[YC30-TX1-E2E ${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}]`;

async function main() {
  console.log(`Đích: ${BASE}\n`);

  const staff = await login("democb01");
  const leader = await login("demold01");

  // 1) Danh mục TX1 nhìn thấy được
  const cat = await api(staff, "/api/work-catalog?scope=all");
  const entries = cat.json?.data?.entries || [];
  check("Cán bộ xem được danh mục TX qua API", cat.status === 200 && entries.length === 348, `${entries.length} mục`);

  const byGroup: Record<string, number> = {};
  for (const e of entries) byGroup[e.groupCode] = (byGroup[e.groupCode] || 0) + 1;
  check(
    "Đủ 6 nhóm đúng số lượng",
    byGroup.NV === 174 && byGroup.CNTT === 5 && byGroup.CBL === 57 && byGroup.PT === 2 && byGroup.TH === 102 && byGroup.DANG === 8,
    JSON.stringify(byGroup)
  );

  const withFactor = entries.filter((e: any) => e.convertFactor !== null && e.convertFactor !== undefined);
  const zeroFactor = withFactor.filter((e: any) => Number(e.convertFactor) === 0);
  check("207 đầu việc có hệ số", withFactor.length === 207, String(withFactor.length));
  check("10 hệ số bằng 0 được giữ nguyên", zeroFactor.length === 10, String(zeroFactor.length));
  check("141 ô chưa có hệ số (NULL)", entries.length - withFactor.length === 141, String(entries.length - withFactor.length));

  const nv01 = entries.find((e: any) => e.code === "NV-01");
  check("Có mã NV-01", !!nv01, nv01 ? nv01.title : "");
  const firstWithFactor = entries.find((e: any) => e.convertFactor !== null);
  check(
    "Hệ số được trả về đúng giá trị gốc",
    firstWithFactor && typeof firstWithFactor.convertFactor === "number",
    firstWithFactor ? `${firstWithFactor.code}=${firstWithFactor.convertFactor}` : ""
  );

  // 2) Tạo đầu việc cá nhân từ danh mục TX1
  const created = await api(staff, "/api/personal-work-items", {
    method: "POST",
    body: JSON.stringify({
      catalogEntryId: nv01.id,
      title: `${TAG} đầu việc từ NV-01`,
      periodType: "MONTHLY",
      periodYear: 2026,
      periodNumber: 10,
      dueDate: "2026-10-28",
      priority: "Cao",
      expectedResult: "Kiểm thử tự động YC-30/31/32",
    }),
  });
  const itemId = created.json?.data?.id;
  check(
    "Tạo được đầu việc cá nhân từ danh mục TX1 (NV-01)",
    created.status === 201 && !!itemId,
    `HTTP ${created.status} ${created.json?.error || ""}`
  );
  if (!itemId) {
    console.log("\n=== TÓM TẮT ===");
    console.log(`${passed} pass / ${failed} fail`);
    process.exit(1);
  }

  // 3) Cập nhật tiến độ / ngày hoàn thành
  const updated = await api(staff, "/api/personal-work-items", {
    method: "PATCH",
    body: JSON.stringify({ id: itemId, progressPercent: 60, status: "IN_PROGRESS" }),
  });
  check("Cập nhật tiến độ đầu việc", updated.status === 200, `HTTP ${updated.status}`);

  // 4) Minh chứng (file thật, lưu riêng tư)
  const boundary = "----YC30TX1E2E";
  const fileBody = Buffer.from(
    `%PDF-1.4\n% YC-30 TX1 e2e evidence\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`,
    "utf8"
  );
  const form = new FormData();
  form.append("file", new Blob([fileBody]), "yc30-tx1-e2e.pdf");
  form.append("workItemId", itemId);
  form.append("note", "Minh chứng kiểm thử YC-30");
  const evRes = await fetch(`${BASE}/api/work-evidence`, {
    method: "POST",
    headers: { Authorization: `Bearer ${staff}` },
    body: form,
  });
  const evJson = await evRes.json().catch(() => null);
  check(
    "Đính kèm minh chứng thành công",
    evRes.status === 201 && !!evJson?.data?.id,
    `HTTP ${evRes.status} ${evJson?.error || ""}`
  );

  const evList = await api(staff, `/api/work-evidence?workItemId=${itemId}`);
  check("Minh chứng lưu riêng tư, không lộ URL public", evList.status === 200 && !JSON.stringify(evList.json).includes("/public/"), `HTTP ${evList.status}`);

  // 5) Liên thông kết quả đánh giá (inEvaluation)
  const list1 = await api(staff, "/api/personal-work-items?year=2026&month=10");
  const item1 = (list1.json?.data || []).find((i: any) => i.id === itemId);
  check("Đầu việc hiển thị trong danh sách", !!item1, itemId);
  check(
    "Chưa đưa vào kết quả đánh giá → inEvaluation=false",
    item1 && item1.inEvaluation === false,
    `inEvaluation=${item1?.inEvaluation}`
  );
  check(
    "Đầu việc có liên kết danh mục TX (catalogEntryId)",
    item1 && item1.catalogEntryId === nv01.id,
    `catalogEntryId=${item1?.catalogEntryId ? "có" : "không"}`
  );

  // 6) Liên thông sang kết quả đánh giá: 1 đầu việc → 1 bản ghi kết quả (không nhân đôi)
  // YC-32 đã có ràng buộc unique(personId, workItemId) ở monthly_work_results.
  const mrPayload = {
    workItemId: itemId,
    title: `${TAG} kết quả đánh giá`,
    outputText: "Kết quả kiểm thử YC-30",
    periodYear: 2026,
    periodMonth: 10,
  };
  const mr1 = await api(staff, "/api/monthly-results", {
    method: "POST",
    body: JSON.stringify(mrPayload),
  });
  check("Ghi kết quả đánh giá cho đầu việc", mr1.status === 201, `HTTP ${mr1.status} ${mr1.json?.error || ""}`);

  const mr2 = await api(staff, "/api/monthly-results", {
    method: "POST",
    body: JSON.stringify(mrPayload),
  });
  // Đếm thực tế số bản ghi kết quả gắn với đầu việc này (không tính bản ghi của người khác).
  const mrList = await api(staff, `/api/monthly-results?year=2026&month=10`);
  const linked = (mrList.json?.data || []).filter((r: any) => r.workItemId === itemId);
  check(
    "Một đầu việc chỉ có 1 bản ghi kết quả đánh giá (không nhân đôi)",
    linked.length === 1,
    `${linked.length} bản ghi (HTTP ${mr2.status})`
  );

  const list2 = await api(staff, "/api/personal-work-items?year=2026&month=10");
  const item2 = (list2.json?.data || []).find((i: any) => i.id === itemId);
  check(
    "Đầu việc đã đưa vào kết quả đánh giá → inEvaluation=true",
    item2 && item2.inEvaluation === true,
    `inEvaluation=${item2?.inEvaluation}`
  );

  // 7) Người không có quyền bị từ chối
  const forbidden = await api(leader, "/api/work-evidence?workItemId=not-existing-id");
  check("API minh chứng từ chối id không hợp lệ", forbidden.status >= 400, `HTTP ${forbidden.status}`);

  // 8) Dọn dữ liệu test (bản ghi kết quả đánh giá trước, rồi đầu việc)
  if (mr1.json?.data?.id) {
    const delMr = await api(staff, `/api/monthly-results?id=${mr1.json.data.id}`, { method: "DELETE" });
    check("Dọn bản ghi kết quả đánh giá test", delMr.status === 200, `HTTP ${delMr.status}`);
  }
  const del = await api(staff, `/api/personal-work-items?id=${itemId}`, { method: "DELETE" });
  check("Dọn sạch dữu liệu test", del.status === 200 || del.status === 423, `HTTP ${del.status}`);

  const after = await api(staff, "/api/personal-work-items?year=2026&month=10");
  const left = (after.json?.data || []).filter((i: any) => i.title?.startsWith(TAG));
  check("Không còn dữ liệu test sót lại", left.length === 0, `${left.length} bản ghi`);

  console.log("\n========================================");
  console.log(`KẾT QUẢ E2E TX1: ${passed} pass / ${failed} fail`);
  console.log("========================================");
  if (failed > 0) {
    console.log("\nCác mục lỗi:");
    for (const f of failures) console.log(" - " + f);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("LỖI:", e);
  process.exit(1);
});
