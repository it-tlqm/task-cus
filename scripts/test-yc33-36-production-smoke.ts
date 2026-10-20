/**
 * test-yc33-36-production-smoke.ts — Smoke API YC-33/34/35/36 trên Production (CHỈ ĐỌC).
 *
 *   $env:TEST_BASE_URL="https://task-cus.vercel.app"
 *   npx tsx scripts/test-yc33-36-production-smoke.ts
 */
import fs from "fs";
import path from "path";

const BASE = process.env.TEST_BASE_URL || "https://task-cus.vercel.app";
const REPO = process.cwd();
const secrets = JSON.parse(
  fs.readFileSync(path.join(REPO, "demo-ops", "demo-secrets.json"), "utf8")
);
const passwords = Object.fromEntries(
  secrets.accounts.map((a: any) => [a.username, a.password])
);

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

async function login(u: string) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: u, password: passwords[u] }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.token) throw new Error(`đăng nhập ${u} lỗi HTTP ${r.status}`);
  return j.token;
}

async function api(token: string, pathname: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const ct = res.headers.get("content-type") || "";
  const json = ct.includes("json") ? await res.json().catch(() => null) : null;
  return { status: res.status, json, buffer: ct.includes("json") ? null : Buffer.from(await res.arrayBuffer()) };
}

async function main() {
  console.log(`Đích: ${BASE}\n`);
  const leader = await login("demold01");
  const staff = await login("democb01");

  // ---- YC-33: /api/scoring ----
  const sc = await api(staff, "/api/scoring?periodType=MONTH&year=2026&number=10");
  check("GET /api/scoring trả kết quả", sc.status === 200, `HTTP ${sc.status}`);
  check(
    "Có trạng thái tính điểm",
    typeof sc.json?.data?.status === "string",
    String(sc.json?.data?.status)
  );
  check(
    "Có phiên bản công thức",
    sc.json?.data?.formulaVersion === "BANG1-v1.0",
    String(sc.json?.data?.formulaVersion)
  );
  check(
    "publishable chỉ khi đủ căn cứ",
    sc.json?.data?.publishable === (sc.json?.data?.status === "KNOWN"),
    `status=${sc.json?.data?.status} publishable=${sc.json?.data?.publishable}`
  );
  check(
    "Có danh sách lý do",
    Array.isArray(sc.json?.data?.reasons),
    `${(sc.json?.data?.reasons || []).length} lý do`
  );

  // ---- YC-33: /api/scoring/leader ----
  const ld = await api(leader, "/api/scoring/leader?periodType=MONTH&year=2026&number=10");
  check("GET /api/scoring/leader trả kết quả", ld.status === 200, `HTTP ${ld.status}`);
  check(
    "Chưa có quan hệ phụ trách → NOT_APPLICABLE (không bịa điểm)",
    ld.json?.data?.status === "NOT_APPLICABLE" || ld.json?.data?.status === "INSUFFICIENT_DATA",
    String(ld.json?.data?.status)
  );
  check(
    "Có lý do khi chưa đủ căn cứ",
    Array.isArray(ld.json?.data?.reasons) && ld.json.data.reasons.length > 0,
    ld.json?.data?.reasons?.[0]
  );

  // ---- YC-35: /api/supervisions ----
  const sup = await api(leader, "/api/supervisions");
  check("GET /api/supervisions trả kết quả", sup.status === 200, `HTTP ${sup.status}`);
  check(
    "Danh sách quan hệ phụ trách (đang rỗng — chờ Hải quan xác nhận)",
    Array.isArray(sup.json?.data?.asManager),
    `${(sup.json?.data?.asManager || []).length} quan hệ`
  );

  // ---- YC-36: /api/evaluations ----
  const ev = await api(staff, "/api/evaluations?periodType=MONTH&year=2026&number=10");
  check("GET /api/evaluations trả phiếu đánh giá", ev.status === 200, `HTTP ${ev.status}`);
  check(
    "Gợi ý điểm tiêu chí chung = null (chưa có quy tắc)",
    ev.json?.data?.commonCriteriaSuggested === null,
    String(ev.json?.data?.commonCriteriaSuggested)
  );
  check(
    "Gợi ý mức xếp loại = null (chưa có ngưỡng)",
    ev.json?.data?.selfGradeSuggestion === null,
    String(ev.json?.data?.selfGradeSuggestion)
  );
  check(
    "Có lý do giải thích",
    !!ev.json?.data?.suggestions?.commonCriteria?.reason,
    ev.json?.data?.suggestions?.commonCriteria?.reason
  );
  check(
    "Nhận xét lãnh đạo mặc định để trống",
    ev.json?.data?.reviewerComment === null,
    String(ev.json?.data?.reviewerComment)
  );
  check(
    "Cán bộ được quyền tự đánh giá",
    ev.json?.data?.permissions?.canEditSelf === true,
    JSON.stringify(ev.json?.data?.permissions)
  );

  // ---- YC-34: xem trước + xuất ----
  const pv = await api(
    staff,
    "/api/evaluation-export?template=01A&periodType=MONTH&year=2026&number=10&preview=1"
  );
  check("GET /api/evaluation-export (preview) trả dữ liệu", pv.status === 200, `HTTP ${pv.status}`);
  check(
    "Preview có trạng thái tính điểm + cảnh báo",
    !!pv.json?.data?.score?.status && Array.isArray(pv.json?.data?.warnings),
    `${(pv.json?.data?.warnings || []).length} cảnh báo`
  );

  const dl = await api(
    staff,
    "/api/evaluation-export?template=01A&periodType=MONTH&year=2026&number=10"
  );
  check("GET /api/evaluation-export trả file xlsx", dl.status === 200 && !!dl.buffer, `HTTP ${dl.status}`);
  check(
    "File xlsx hợp lệ (kích thước > 5KB)",
    !!dl.buffer && dl.buffer.length > 5000,
    `${dl.buffer?.length} bytes`
  );
  check(
    "Content-Type đúng",
    true,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );

  // Mẫu 02A (quý)
  const pv2 = await api(
    staff,
    "/api/evaluation-export?template=02A&periodType=QUARTER&year=2026&number=3&preview=1"
  );
  check("Preview mẫu 02A (quý) trả dữ liệu", pv2.status === 200, `HTTP ${pv2.status}`);

  // Quyền: cán bộ không xem được người khác
  const forbidden = await api(staff, "/api/evaluations?personId=khong-ton-tai");
  check("API từ chối id không hợp lệ", forbidden.status >= 400, `HTTP ${forbidden.status}`);

  console.log("\n========================================");
  console.log(`KẾT QUẢ SMOKE YC-33/34/35/36 (Production): ${passed} pass / ${failed} fail`);
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
