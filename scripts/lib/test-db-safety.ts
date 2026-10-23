/**
 * Chốt an toàn cho test/QA: chỉ cho phép kết nối tới database kiểm thử cục bộ.
 *
 * Không thay thế kiểm tra của môi trường Production; mục đích là chặn test ghi
 * nhầm vào database không phải fixture của worktree.
 */
const TEST_DB_PATTERN =
  /^talung_v3_(fixture|phase_a_qa|integration|demo|phase_b|phase_c|task_approval|roster|approval_impl)(_[a-z0-9_]+)?$/;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function isLocalTestDatabaseUrl(rawUrl: string | undefined | null): boolean {
  if (!rawUrl) return false;
  try {
    const url = new URL(rawUrl);
    if (!LOCAL_HOSTS.has(url.hostname.toLowerCase())) return false;
    const database = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    return TEST_DB_PATTERN.test(database);
  } catch {
    return false;
  }
}

export function assertLocalTestDatabase(rawUrl: string | undefined | null, scriptName: string): string {
  if (!isLocalTestDatabaseUrl(rawUrl)) {
    throw new Error(
      `TỪ CHỐI CHẠY ${scriptName}: DATABASE_URL/DIRECT_URL phải trỏ database kiểm thử cục bộ ` +
        `(localhost, tên talung_v3_fixture / talung_v3_phase_a_qa / talung_v3_<session>...). ` +
        `Không chạy test ghi dữ liệu trên Production.`
    );
  }
  return rawUrl as string;
}
