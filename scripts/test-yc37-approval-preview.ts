/**
 * test-yc37-approval-preview.ts — Kiểm thử YC-37 (bước XEM TRƯỚC) trên Production.
 *
 * Kiểm thử CHỈ ĐỌC (không ghi quyết định, không đổi trạng thái nghiệp vụ):
 *  1. Lãnh đạo đơn vị xem trước hồ sơ → có quyền quyết định, đủ thông tin.
 *  2. Xem trước 2 lần → kết quả giống nhau (không ghi trạng thái).
 *  3. Xem trước KHÔNG làm đổi trạng thái nhiệm vụ (vẫn WAITING_REVIEW).
 *  4. Cán bộ không có quyền quyết định (canDecide = false).
 *  5. Quản trị kỹ thuật bị từ chối.
 *  6. Loại hồ sơ không hợp lệ → 400.
 *  7. Quyết định "không đồng ý" thiếu lý do → 400 và KHÔNG đổi trạng thái.
 *  8. Lịch sử quyết định được ghi (audit event APPROVAL_PREVIEW_VIEW).
 *
 * Chạy:
 *   $env:TEST_BASE_URL="https://task-cus.vercel.app"
 *   npx tsx scripts/test-yc37-approval-preview.ts
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
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function main() {
  console.log(`Đích: ${BASE}\n`);

  const leader = await login("demold01");
  const staff = await login("democb01");

  // Tìm một hồ sơ công việc đang chờ nghiệm thu
  const listRes = await api(leader, "/api/tasks?status=WAITING_REVIEW&pageSize=10");
  const list = Array.isArray(listRes.json) ? listRes.json : listRes.json?.data || [];
  check("Có hồ sơ công việc chờ nghiệm thu để kiểm thử", list.length > 0, `${list.length} hồ sơ`);
  if (list.length === 0) {
    console.log("\nKẾT QUẢ: không có hồ sơ để kiểm thử — dừng.");
    process.exit(1);
  }
  const task = list[0];

  // 1) Lãnh đạo xem trước
  const p1 = await api(leader, `/api/approvals/TASK_RESULT/${task.id}/preview`);
  check("Lãnh đạo xem trước hồ sơ được", p1.status === 200, `HTTP ${p1.status}`);
  const preview = p1.json?.data;
  if (!preview) {
    console.log("Không có dữ liệu preview:", JSON.stringify(p1.json).slice(0, 400));
    process.exit(1);
  }
  check("Preview đủ thông tin cốt lõi", !!preview.code && !!preview.title, `${preview.code} — ${preview.title}`);
  check("Có thông tin người trình", !!preview.submitter?.fullName, preview.submitter?.fullName);
  check("Có thông tin hạn xử lý", !!preview.deadline?.current, String(preview.deadline?.current));
  check("Có trạng thái quyết định", !!preview.permissions, JSON.stringify(preview.permissions));
  check("Lãnh đạo có quyền quyết định", preview.permissions?.canDecide === true);
  check("Preview có mảng lịch sử", Array.isArray(preview.history));
  check("Preview có danh sách tệp đính kèm", Array.isArray(preview.attachments));
  check(
    "Tệp đính kèm trả endpoint có kiểm tra quyền (không lộ URL public)",
    preview.attachments.every((a: any) => String(a.downloadUrl).startsWith("/api/")),
    preview.attachments.map((a: any) => a.downloadUrl).join(", ")
  );

  // 2) Xem trước 2 lần → giống nhau
  const p2 = await api(leader, `/api/approvals/TASK_RESULT/${task.id}/preview`);
  check(
    "Xem trước 2 lần cho kết quả nhất quán (không ghi trạng thái)",
    p2.status === 200 &&
      p2.json?.data?.code === preview.code &&
      p2.json?.data?.caseStatus === preview.caseStatus,
    `${preview.caseStatus} → ${p2.json?.data?.caseStatus}`
  );

  // 3) Trạng thái nhiệm vụ KHÔNG đổi sau khi xem trước
  const after = await api(leader, `/api/tasks?status=WAITING_REVIEW&pageSize=10`);
  const afterList = Array.isArray(after.json) ? after.json : after.json?.data || [];
  const stillThere = afterList.some((t: any) => t.id === task.id);
  check(
    "Xem trước KHÔNG tự phê duyệt (nhiệm vụ vẫn chờ nghiệm thu)",
    stillThere,
    `status hiện tại=${task.status}`
  );

  // 4) Cán bộ không có quyền quyết định
  const ps = await api(staff, `/api/approvals/TASK_RESULT/${task.id}/preview`);
  if (ps.status === 200) {
    check(
      "Cán bộ xem được nhưng KHÔNG có quyền quyết định",
      ps.json?.data?.permissions?.canDecide === false,
      JSON.stringify(ps.json?.data?.permissions)
    );
  } else {
    check("Cán bộ bị từ chối khi xem hồ sơ ngoài phạm vi", ps.status === 403, `HTTP ${ps.status}`);
  }

  // 5) Quản trị kỹ thuật bị từ chối
  let adminToken: string | null = null;
  try {
    adminToken = await login("admin");
  } catch {
    /* không có tài khoản admin demo trên Production → bỏ qua */
  }
  if (adminToken) {
    const pa = await api(adminToken, `/api/approvals/TASK_RESULT/${task.id}/preview`);
    check("Quản trị kỹ thuật bị từ chối truy cập nghiệp vụ", pa.status === 403, `HTTP ${pa.status}`);
  } else {
    console.log("• Bỏ qua kiểm tra quản trị kỹ thuật (không có tài khoản demo)");
  }

  // 6) Loại hồ sơ không hợp lệ
  const pBad = await api(leader, `/api/approvals/INVALID_TYPE/${task.id}/preview`);
  check("Loại hồ sơ không hợp lệ bị từ chối", pBad.status === 400, `HTTP ${pBad.status}`);

  // 7) Quyết định thiếu lý do / nội dung → 400, trạng thái không đổi
  const dNoReason = await api(leader, `/api/approvals/TASK_RESULT/${task.id}/decision`, {
    method: "POST",
    body: JSON.stringify({ action: "REJECT" }),
  });
  check(
    "Không đồng ý thiếu lý do bị từ chối (400)",
    dNoReason.status === 400,
    `HTTP ${dNoReason.status}`
  );
  const dNoContent = await api(leader, `/api/approvals/TASK_RESULT/${task.id}/decision`, {
    method: "POST",
    body: JSON.stringify({ action: "CLARIFY" }),
  });
  check(
    "Yêu cầu giải trình thiếu nội dung bị từ chối (400)",
    dNoContent.status === 400,
    `HTTP ${dNoContent.status}`
  );
  const after2 = await api(leader, `/api/tasks?status=WAITING_REVIEW&pageSize=10`);
  const afterList2 = Array.isArray(after2.json) ? after2.json : after2.json?.data || [];
  check(
    "Quyết định lỗi KHÔNG làm thay đổi trạng thái hồ sơ",
    afterList2.some((t: any) => t.id === task.id),
    `còn ${afterList2.length} hồ sơ chờ nghiệm thu`
  );

  // 8) Audit ghi lại lượt xem trước
  const audit = await api(leader, "/api/admin/audit?limit=50");
  const auditRows = Array.isArray(audit.json?.events)
    ? audit.json.events
    : Array.isArray(audit.json)
      ? audit.json
      : audit.json?.data || [];
  const hasPreviewAudit = auditRows.some(
    (a: any) => a.action === "APPROVAL_PREVIEW_VIEW" && a.resourceId
  );
  check(
    "Ghi nhật ký lượt xem trước (APPROVAL_PREVIEW_VIEW)",
    hasPreviewAudit,
    `${auditRows.length} sự kiện gần nhất (HTTP ${audit.status})`
  );

  console.log("\n========================================");
  console.log(`KẾT QUẢ XEM TRƯỚC YC-37: ${passed} pass / ${failed} fail`);
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
