/**
 * V3 remediation Task 1.3 — AN TOÀN ENDPOINT DỌN KHO STORAGE.
 *
 * Kiểm chứng (hoàn toàn thuần, KHÔNG gọi Supabase Storage thật):
 *  1. Mặc định TẮT: thiếu `STORAGE_PURGE_ENABLED` ⇒ 404, token rỗng, allowlist rỗng.
 *  2. Token: thiếu/sai ⇒ 403; so sánh timing-safe; token rỗng không bao giờ hợp lệ.
 *  3. Allowlist: chỉ bucket được liệt kê tường minh; `work-evidence` bị chặn cứng
 *     kể cả khi ops lỡ thêm vào allowlist.
 *  4. Dry-run mặc định: chỉ xoá khi body có `dryRun: false`.
 *  5. Source: không còn token tĩnh, không fallback bucket, audit trước/sau khi xoá.
 *
 * Chạy: npx tsx scripts/test-v3-purge-safety.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isBucketAllowed,
  isHardBlockedBucket,
  isPurgeExecutionRequested,
  isPurgeTokenValid,
  loadStoragePurgeConfig,
  resolveStoragePurgeRequest,
} from "../src/server/storage-purge-policy";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTE_REL = "src/app/api/admin/system/purge-storage/route.ts";
const POLICY_REL = "src/server/storage-purge-policy.ts";
const TEST_REL = "scripts/test-v3-purge-safety.ts";

/** Token tĩnh cũ — ghép chuỗi để chính file test không chứa literal bị cấm. */
const FORBIDDEN_STATIC_TOKEN = ["PURGE", "2026", "10", "22"].join("-");

/** Token kiểm thử cục bộ, không phải bí mật thật. */
const TEST_TOKEN = "local-only-test-token";

const BASE_ENV: NodeJS.ProcessEnv = {
  STORAGE_PURGE_ENABLED: "true",
  STORAGE_PURGE_TOKEN: TEST_TOKEN,
  STORAGE_PURGE_BUCKETS: "task-attachments",
};

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`  [PASS] ${name}${detail ? " - " + detail : ""}`);
  } else {
    fail++;
    failures.push(`${name}${detail ? " - " + detail : ""}`);
    console.log(`  [FAIL] ${name}${detail ? " - " + detail : ""}`);
  }
}

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function main() {
  console.log("=== V3 TASK 1.3 — PURGE STORAGE AN TOÀN ===\n");

  // ---------------------------------------------------------------------------
  // A. Mặc định an toàn: tắt, không token, không bucket.
  // ---------------------------------------------------------------------------
  const defaults = loadStoragePurgeConfig({});
  check("A1. Mặc định TẮT khi thiếu STORAGE_PURGE_ENABLED", defaults.enabled === false);
  check("A2. Mặc định token rỗng", defaults.token === "");
  check("A3. Mặc định allowlist rỗng", defaults.buckets.length === 0, JSON.stringify(defaults.buckets));

  check(
    "A4. Chỉ giá trị 'true' mới bật (TRUE/1/yes đều TẮT)",
    loadStoragePurgeConfig({ ...BASE_ENV, STORAGE_PURGE_ENABLED: "TRUE" }).enabled === false &&
      loadStoragePurgeConfig({ ...BASE_ENV, STORAGE_PURGE_ENABLED: "1" }).enabled === false &&
      loadStoragePurgeConfig({ ...BASE_ENV, STORAGE_PURGE_ENABLED: "yes" }).enabled === false &&
      loadStoragePurgeConfig({ ...BASE_ENV, STORAGE_PURGE_ENABLED: "true" }).enabled === true
  );

  const parsed = loadStoragePurgeConfig({
    STORAGE_PURGE_ENABLED: "true",
    STORAGE_PURGE_TOKEN: "  abc  ",
    STORAGE_PURGE_BUCKETS: " task-attachments , , other-bucket ",
  });
  check("A5. Token được trim", parsed.token === "abc", parsed.token);
  check(
    "A6. Allowlist tách dấu phẩy, bỏ phần tử rỗng",
    JSON.stringify(parsed.buckets) === JSON.stringify(["task-attachments", "other-bucket"]),
    JSON.stringify(parsed.buckets)
  );

  // ---------------------------------------------------------------------------
  // B. Token: timing-safe, không chấp nhận rỗng.
  // ---------------------------------------------------------------------------
  check("B1. Token rỗng không hợp lệ khi cấu hình rỗng", isPurgeTokenValid("", "") === false);
  check("B2. Token gửi rỗng bị từ chối", isPurgeTokenValid("", TEST_TOKEN) === false);
  check("B3. Cấu hình token rỗng luôn từ chối", isPurgeTokenValid(TEST_TOKEN, "") === false);
  check("B4. Token đúng được chấp nhận", isPurgeTokenValid(TEST_TOKEN, TEST_TOKEN) === true);
  check("B5. Token sai bị từ chối", isPurgeTokenValid(TEST_TOKEN + "x", TEST_TOKEN) === false);
  check(
    "B6. Token sai khác độ dài không ném lỗi",
    isPurgeTokenValid("x", TEST_TOKEN) === false &&
      isPurgeTokenValid("x".repeat(5000), TEST_TOKEN) === false
  );
  check(
    "B7. Token Unicode so sánh đúng",
    isPurgeTokenValid("mật-khẩu-2026", "mật-khẩu-2026") === true &&
      isPurgeTokenValid("mật-khẩu-2027", "mật-khẩu-2026") === false
  );
  check("B8. Token dài vẫn so sánh đúng", isPurgeTokenValid("a".repeat(4096), "a".repeat(4096)) === true);

  // ---------------------------------------------------------------------------
  // C. Allowlist bucket + chặn cứng work-evidence.
  // ---------------------------------------------------------------------------
  const allowTask = loadStoragePurgeConfig(BASE_ENV);
  check("C1. Bucket được liệt kê tường minh được phép", isBucketAllowed("task-attachments", allowTask) === true);
  check("C2. Bucket ngoài allowlist bị từ chối", isBucketAllowed("other-bucket", allowTask) === false);
  check("C3. Bucket rỗng bị từ chối", isBucketAllowed("", allowTask) === false);
  check("C4. Khoảng trắng quanh tên bucket được bỏ", isBucketAllowed("  task-attachments  ", allowTask) === true);
  check(
    "C5. Tên bucket phân biệt hoa/thường (liệt kê tường minh)",
    isBucketAllowed("TASK-ATTACHMENTS", allowTask) === false
  );
  check("C6. work-evidence bị chặn cứng", isHardBlockedBucket("work-evidence") === true);
  check(
    "C7. work-evidence biến thể hoa/thường/khoảng trắng vẫn bị chặn",
    isHardBlockedBucket(" Work-Evidence ") === true && isHardBlockedBucket("WORK-EVIDENCE") === true
  );
  const allowEvidenceEnv: NodeJS.ProcessEnv = {
    ...BASE_ENV,
    STORAGE_PURGE_BUCKETS: "work-evidence,task-attachments",
  };
  const allowEvidence = loadStoragePurgeConfig(allowEvidenceEnv);
  check(
    "C8. work-evidence bị từ chối KỂ CẢ khi lỡ nằm trong allowlist",
    isBucketAllowed("work-evidence", allowEvidence) === false
  );
  check(
    "C9. work-evidence biến thể cũng bị từ chối dù allowlist có work-evidence",
    isBucketAllowed("WORK-EVIDENCE", allowEvidence) === false
  );

  // ---------------------------------------------------------------------------
  // D. Dry-run mặc định.
  // ---------------------------------------------------------------------------
  check("D1. Không body ⇒ dry-run", isPurgeExecutionRequested(undefined) === false);
  check("D2. Body rỗng ⇒ dry-run", isPurgeExecutionRequested({}) === false);
  check("D3. dryRun=true ⇒ dry-run", isPurgeExecutionRequested({ dryRun: true }) === false);
  check("D4. dryRun kiểu chuỗi 'false' ⇒ vẫn dry-run", isPurgeExecutionRequested({ dryRun: "false" }) === false);
  check("D5. dryRun=0 ⇒ vẫn dry-run", isPurgeExecutionRequested({ dryRun: 0 }) === false);
  check("D6. Chỉ dryRun=false (boolean) mới cho phép xoá", isPurgeExecutionRequested({ dryRun: false }) === true);

  // ---------------------------------------------------------------------------
  // E. Quyết định truy cập: 404 → 403 → 400, bucket chỉ khi được liệt kê.
  // ---------------------------------------------------------------------------
  const disabled = resolveStoragePurgeRequest({
    env: {},
    token: TEST_TOKEN,
    bucket: "task-attachments",
  });
  check(
    "E1. Thiếu STORAGE_PURGE_ENABLED ⇒ 404 (ẩn endpoint)",
    disabled.ok === false && disabled.status === 404,
    disabled.ok ? "ok" : `HTTP ${disabled.status}`
  );

  const disabledFlag = resolveStoragePurgeRequest({
    env: { ...BASE_ENV, STORAGE_PURGE_ENABLED: "false" },
    token: TEST_TOKEN,
    bucket: "task-attachments",
  });
  check(
    "E2. STORAGE_PURGE_ENABLED=false ⇒ 404 dù token/bucket đúng",
    disabledFlag.ok === false && disabledFlag.status === 404
  );

  const noConfiguredToken = resolveStoragePurgeRequest({
    env: { STORAGE_PURGE_ENABLED: "true", STORAGE_PURGE_BUCKETS: "task-attachments" },
    token: "bat-ky",
    bucket: "task-attachments",
  });
  check(
    "E3. Bật nhưng chưa cấu hình token ⇒ 403",
    noConfiguredToken.ok === false && noConfiguredToken.status === 403
  );

  const missingHeader = resolveStoragePurgeRequest({ env: BASE_ENV, token: null, bucket: "task-attachments" });
  check(
    "E4. Thiếu header x-purge-token ⇒ 403",
    missingHeader.ok === false && missingHeader.status === 403
  );

  const wrongHeader = resolveStoragePurgeRequest({
    env: BASE_ENV,
    token: "sai-token",
    bucket: "task-attachments",
  });
  check("E5. Sai token ⇒ 403", wrongHeader.ok === false && wrongHeader.status === 403);

  const noBucket = resolveStoragePurgeRequest({ env: BASE_ENV, token: TEST_TOKEN });
  check("E6. Không chỉ định bucket ⇒ 400 (không có mặc định)", noBucket.ok === false && noBucket.status === 400);

  const evidence = resolveStoragePurgeRequest({
    env: allowEvidenceEnv,
    token: TEST_TOKEN,
    bucket: "work-evidence",
  });
  check(
    "E7. work-evidence dù nằm trong allowlist ⇒ 400",
    evidence.ok === false && evidence.status === 400
  );

  const notListed = resolveStoragePurgeRequest({
    env: BASE_ENV,
    token: TEST_TOKEN,
    bucket: "other-bucket",
  });
  check("E8. Bucket ngoài allowlist ⇒ 400", notListed.ok === false && notListed.status === 400);

  const allowed = resolveStoragePurgeRequest({
    env: BASE_ENV,
    token: TEST_TOKEN,
    bucket: " task-attachments ",
  });
  check(
    "E9. Đủ env + token + allowlist ⇒ cho phép đúng bucket",
    allowed.ok === true && allowed.bucket === "task-attachments",
    allowed.ok ? allowed.bucket : `HTTP ${allowed.status}`
  );

  const emptyBucket = resolveStoragePurgeRequest({ env: BASE_ENV, token: TEST_TOKEN, bucket: "   " });
  check("E10. Bucket rỗng/khoảng trắng ⇒ 400", emptyBucket.ok === false && emptyBucket.status === 400);

  // ---------------------------------------------------------------------------
  // F. Kiểm tra source: không token tĩnh, không fallback, audit trước/sau.
  // ---------------------------------------------------------------------------
  const route = read(ROUTE_REL);
  const policy = read(POLICY_REL);
  const testSrc = read(TEST_REL);

  check(
    "F1. Không còn token tĩnh trong route/policy/test",
    !route.includes(FORBIDDEN_STATIC_TOKEN) &&
      !policy.includes(FORBIDDEN_STATIC_TOKEN) &&
      !testSrc.includes(FORBIDDEN_STATIC_TOKEN)
  );
  check(
    "F2. Route không còn CONFIRM_TOKEN/body.confirm",
    !route.includes("CONFIRM_TOKEN") && !route.includes("body.confirm")
  );
  check(
    "F3. Route không có bucket mặc định/fallback",
    !route.includes("SUPABASE_STORAGE_BUCKET") &&
      !route.includes('|| "task-attachments"') &&
      !route.includes('|| "work-evidence"') &&
      !route.includes('["task-attachments", "work-evidence"]') &&
      !route.includes("for (const cand")
  );
  check("F4. Route dùng policy resolveStoragePurgeRequest", route.includes("resolveStoragePurgeRequest"));
  check(
    "F5. Route đọc header x-purge-token",
    /x-purge-token/i.test(route)
  );
  check(
    "F6. Route dùng isPurgeExecutionRequested (dry-run mặc định)",
    route.includes("isPurgeExecutionRequested(body)")
  );

  const startedIdx = route.indexOf("STORAGE_PURGE_STARTED");
  const deleteIdx = route.indexOf('method: "DELETE"');
  const executedIdx = route.indexOf("STORAGE_PURGE_EXECUTED");
  check(
    "F7. Audit trước khi xoá, audit sau khi xoá",
    startedIdx >= 0 && deleteIdx >= 0 && executedIdx >= 0 && startedIdx < deleteIdx && deleteIdx < executedIdx,
    `started=${startedIdx}, delete=${deleteIdx}, executed=${executedIdx}`
  );

  const dryRunIdx = route.indexOf("if (!execute)");
  check(
    "F8. DELETE chỉ nằm trong nhánh execute (sau nhánh dry-run)",
    dryRunIdx >= 0 && deleteIdx > dryRunIdx,
    `dryRun=${dryRunIdx}, delete=${deleteIdx}`
  );
  check(
    "F9. Audit ghi bucketUsed/objects/deleted/failed",
    route.includes("bucketUsed") &&
      route.includes("objects:") &&
      route.includes("deleted:") &&
      route.includes("failed:")
  );
  check("F10. Policy so sánh token timing-safe", policy.includes("timingSafeEqual"));
  check(
    "F11. Policy chặn cứng work-evidence",
    policy.includes("work-evidence") && /HARD_BLOCK/i.test(policy)
  );
  const denyIdx = route.indexOf("if (!access.ok)");
  const listCallIdx = route.indexOf("await listObjects(");
  check(
    "F12. Chặn policy (tắt/token/bucket) trước khi liệt kê Storage",
    denyIdx >= 0 && listCallIdx > denyIdx,
    `deny=${denyIdx}, list=${listCallIdx}`
  );

  console.log(`\n=== KẾT QUẢ: ${pass} pass / ${fail} fail ===`);
  if (fail > 0) {
    console.log("Thất bại:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exit(fail === 0 ? 0 : 1);
}

main();
