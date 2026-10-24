/**
 * V3 remediation Task 3.2 — /api/health phải báo commit release thật.
 *
 * Trước đây health chỉ đọc VERCEL_GIT_COMMIT_SHA, nên deploy bằng Vercel CLI
 * luôn trả "dev" và không đối chiếu được bản đang chạy.
 *
 * Chạy: npx tsx scripts/test-v3-health-commit.ts
 */
import { getReleaseInfo } from "../src/server/release-info";

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

function main() {
  console.log("=== V3 TASK 3.2 — HEALTH COMMIT ===\n");

  // 1. Deploy qua Git: VERCEL_GIT_COMMIT_SHA thắng, cắt 7 ký tự.
  const git = getReleaseInfo({
    VERCEL_GIT_COMMIT_SHA: "abcdef123",
    RELEASE_SHA: "999999999",
    VERCEL_ENV: "production",
  });
  check("Git SHA thắng RELEASE_SHA", git.commit === "abcdef1", git.commit);
  check("Git SHA cắt đúng 7 ký tự", git.commit.length === 7, String(git.commit.length));
  check("env = production", git.env === "production", git.env);

  // 2. Deploy CLI: không có Git SHA thì fallback RELEASE_SHA.
  const cli = getReleaseInfo({ RELEASE_SHA: "123456789", VERCEL_ENV: "production" });
  check("Fallback RELEASE_SHA", cli.commit === "1234567", cli.commit);
  check("Fallback không trả dev", cli.commit !== "dev", cli.commit);

  // 3. Local: không có SHA nào thì giữ "dev".
  const local = getReleaseInfo({});
  check("Không có SHA → dev", local.commit === "dev", local.commit);
  check("Không có VERCEL_ENV → local", local.env === "local", local.env);
  check("Local không có deploymentId", local.deploymentId === undefined, String(local.deploymentId));

  // 4. Deployment ID không bao giờ được dùng làm commit.
  const deploymentOnly = getReleaseInfo({ VERCEL_DEPLOYMENT_ID: "dpl_abc123456" });
  check("Chỉ có deployment ID → commit vẫn là dev", deploymentOnly.commit === "dev", deploymentOnly.commit);
  check(
    "deployment ID nằm ở trường riêng",
    deploymentOnly.deploymentId === "dpl_abc123456",
    String(deploymentOnly.deploymentId)
  );

  const both = getReleaseInfo({
    VERCEL_GIT_COMMIT_SHA: "abcdef123",
    VERCEL_DEPLOYMENT_ID: "dpl_abc123456",
  });
  check("Có cả hai: commit = Git SHA", both.commit === "abcdef1", both.commit);
  check("Có cả hai: commit không phải deployment ID", both.commit !== "dpl_abc", both.commit);
  check("Có cả hai: deploymentId giữ nguyên", both.deploymentId === "dpl_abc123456", String(both.deploymentId));

  // 5. Chuỗi rỗng/khoảng trắng không được coi là SHA.
  const blank = getReleaseInfo({ VERCEL_GIT_COMMIT_SHA: "   ", RELEASE_SHA: "" });
  check("SHA rỗng → dev", blank.commit === "dev", blank.commit);

  // 6. Không lộ secret: helper chỉ đọc các biến release công khai.
  const noisy = getReleaseInfo({
    DATABASE_URL: "postgres://secret",
    JWT_SECRET: "secret",
    VERCEL_GIT_COMMIT_SHA: "abcdef123",
  });
  check(
    "Không trả secret ngoài commit/env/deploymentId",
    Object.keys(noisy).sort().join(",") === "commit,env",
    Object.keys(noisy).sort().join(",")
  );
}

main();

console.log(`\n=== KẾT QUẢ: ${pass} pass / ${fail} fail ===`);
if (failures.length) failures.forEach((f) => console.log("  - " + f));
process.exit(fail === 0 ? 0 : 1);
