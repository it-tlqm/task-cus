/**
 * Thông tin release đang chạy, dùng cho `/api/health`.
 *
 * Thứ tự ưu tiên commit:
 *  1. `VERCEL_GIT_COMMIT_SHA` — deploy qua Git.
 *  2. `RELEASE_SHA` — deploy bằng CLI, ops truyền `git rev-parse --short HEAD`.
 *  3. `"dev"` — chạy local.
 *
 * `VERCEL_DEPLOYMENT_ID` chỉ được trả ở trường riêng, không bao giờ dùng làm commit.
 * Helper thuần (nhận env) để test được không cần DB/Next runtime.
 */

export type ReleaseEnv = Record<string, string | undefined>;

export type ReleaseInfo = {
  /** 7 ký tự đầu của SHA release, hoặc "dev" khi chạy local. */
  commit: string;
  /** Môi trường Vercel (`production`/`preview`/`development`), hoặc "local". */
  env: string;
  /** ID deployment của Vercel, chỉ để đối chiếu — không phải commit. */
  deploymentId?: string;
};

const COMMIT_LENGTH = 7;

/** Giá trị đầu tiên không rỗng sau khi trim. */
function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

export function getReleaseInfo(env: ReleaseEnv = process.env): ReleaseInfo {
  const sha = firstNonEmpty(env.VERCEL_GIT_COMMIT_SHA, env.RELEASE_SHA);
  const deploymentId = firstNonEmpty(env.VERCEL_DEPLOYMENT_ID);

  return {
    commit: (sha ?? "dev").slice(0, COMMIT_LENGTH),
    env: firstNonEmpty(env.VERCEL_ENV) ?? "local",
    ...(deploymentId ? { deploymentId } : {}),
  };
}
