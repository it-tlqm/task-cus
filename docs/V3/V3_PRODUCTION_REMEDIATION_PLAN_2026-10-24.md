# KẾ HOẠCH SỬA LỖI & NÂNG CẤP V3.2 — 24/10/2026

**Trạng thái:** `DRAFT — CHỜ CHỦ DỰ ÁN DUYỆT`  
**Baseline code:** tag `v3.2-production-2026-10-24`, commit `b2d9ae6`  
**Production hiện tại:** `dpl_HjAkRQJT7iHQ6szfzNxxRfqLvj9V` — V3.2, flags `V3_YC10_QUALITY` và `V3_YC11_PRECHECK` **OFF**  
**Phạm vi:** sửa các phát hiện audit ngày 24/10/2026; không mở lại quyết định nghiệp vụ đã chốt, không thêm tính năng mới, không merge `main`, không reset Production.  
**Nguyên tắc:** sửa đúng lỗi, test trước khi sửa, mỗi phase một release gate riêng, có rollback.

---

## 1. Mục tiêu và thứ tự ưu tiên

| Ưu tiên | Mục tiêu | Lý do |
|---|---|---|
| P0 | Không lộ quality cho collaborator; ngày/giờ Việt Nam đúng; không thể xoá minh chứng bằng token tĩnh; có kiểm soát migration/backup | Lỗi bảo mật, sai số liệu, nguy cơ mất dữ liệu |
| P1 | Giảm rủi ro chiếm token; thu hồi quyền tức thời; AI không lộ số liệu ngoài phạm vi; middleware không bị bypass; có test hồi quy | Lỗi bảo mật/defense-in-depth và nợ kiểm thử |
| P2 | Hợp nhất thư viện JWT; health có commit thật | Giảm nợ bảo trì, tăng khả năng truy vết |

**Không làm trong kế hoạch này:**

- Không bật `V3_YC10_QUALITY` hoặc `V3_YC11_PRECHECK` trên Production.
- Không đổi mã/ý nghĩa YC-01 → YC-13.
- Không sửa dữ liệu Production, không chạy migration, không reset tài khoản.
- Không thay đổi quy tắc D5/B1/B2/C1/E8/E12/E13 đã chốt.
- Không dùng `prisma migrate deploy`, `db push` hoặc `--accept-data-loss` trên Production.

---

## 2. Phase 0 — Chốt nền an toàn (0,5 ngày)

### Task 0.1 — Tạo nhánh sửa lỗi từ đúng tag Production

**Người làm:** S0  
**Việc làm:**

```bash
git fetch --tags
git switch -c codex/v3-remediation-p0 v3.2-production-2026-10-24
git status --short          # phải sạch
git rev-parse --short HEAD  # ghi lại SHA nền
```

**Điều kiện nhận:** nhánh tạo từ tag, không từ `main`, không có file Production nào bị sửa ngoài phạm vi.

### Task 0.2 — Chụp bằng chứng và xác nhận flags

**Người làm:** S0 + Ops  
**Việc làm:**

- Ghi lại deployment ID `dpl_HjAkRQJT7iHQ6szfzNxxRfqLvj9V`.
- Xác nhận trên Vercel: `V3_YC10_QUALITY` và `V3_YC11_PRECHECK` không được set hoặc set `false`.
- Chạy health read-only: `GET https://task-cus.vercel.app/api/health`.
- Không đọc/ghi DB Production nếu chưa có quyền và lệnh riêng.

**Bằng chứng:** `docs/evidence/release/REMEDIATION_BASELINE_2026-10-24.md`.

### Task 0.3 — Chốt môi trường test

**Người làm:** S0 + S1  
**Việc làm:**

- Dùng database fixture riêng, không dùng Production.
- Xác nhận có tài khoản fixture `demold01`, `democb01`, `democb02` hoặc tạo fixture tương đương.
- Test server chạy cổng riêng, ghi lại `TEST_BASE_URL`.
- Không đưa connection string/mật khẩu vào repo hoặc chat.

**Điều kiện nhận:** chạy được một test E12 hiện có trên fixture trước khi sửa.

---

## 3. Phase 1 — P0 hotfix (1–2 ngày)

### Task 1.1 — Chặn collaborator xem quality trong lịch sử hợp nhất

**Người làm:** S4  
**File:**

- `src/server/task-history.ts`
- `src/app/api/tasks/[id]/history/route.ts`
- `scripts/test-v3-e12-unified-history.ts` hoặc test mới `scripts/test-v3-quality-history-visibility.ts`

**Thiết kế:**

1. Thêm interface vào `task-history.ts`:

```ts
export interface TaskHistoryAccess {
  viewer: SessionUser;
  ownerId?: string | null;
  unitId?: string | null;
}
```

2. Đổi chữ ký:

```ts
export async function getTaskUnifiedHistory(
  taskId: string,
  filters: TaskHistoryFilters = {},
  access?: TaskHistoryAccess
): Promise<TaskHistoryResult>
```

3. Sau khi có `approvalCase`, chỉ cho quality khi người xem được phép:

```ts
const canSeeQuality = access?.viewer
  ? await canViewApprovalQuality(access.viewer, {
      ownerId: access.ownerId ?? null,
      submitterId: approvalCase?.submittedById ?? null,
      deciderId: approvalCase?.decidedById ?? null,
      unitId: approvalCase?.unitId ?? access.unitId ?? null,
    })
  : false;
```

4. Khi tạo entry `APPROVAL_DECISION`:

```ts
qualityPercent: canSeeQuality ? d.qualityPercent ?? null : null,
```

Không truyền `access` thì mặc định **ẩn** quality (fail closed).

5. Route `/api/tasks/[id]/history` sau `verifyTaskAccess` truyền:

```ts
const history = await getTaskUnifiedHistory(taskId, filters, {
  viewer: user,
  ownerId: access.task?.ownerId ?? null,
  unitId: access.task?.unitId ?? null,
});
```

**Test bắt buộc:**

- Collaborator `democb02` gọi history của task có quality `80`:
  - HTTP 200 (vẫn được xem lịch sử),
  - không có `qualityPercent: 80`, trường phải là `null`.
- Owner `democb01` gọi cùng task: thấy `80`.
- `UNIT_LEADER` gọi: thấy `80`.
- Flag `V3_YC10_QUALITY` OFF: mọi người thấy `null`.
- Chạy lại toàn bộ `test-v3-e12-unified-history.ts`.

**Commit:** `fix(e12): an quality voi collaborator trong lich su hop nhat`

**Điều kiện nhận:** test mới đỏ trước khi sửa, xanh sau khi sửa; không đổi response ngoài trường quality.

---

### Task 1.2 — Chuẩn hoá ngày/giờ Việt Nam cho toàn bộ server

**Người làm:** S0 (helper) + S2 (dashboard/AI) + S4 (notifications/remind)  
**File:**

- `src/server/work-dates.ts`
- `src/app/api/dashboard/kpi/route.ts`
- `src/app/api/ai/route.ts`
- `src/server/notifications.ts`
- `src/app/api/tasks/[id]/remind/route.ts`
- `src/app/api/reports/export/route.ts` (nếu đang dùng ngày server)
- `scripts/test-v3-timezone.ts`

**Thiết kế:**

1. Trong `work-dates.ts`, thêm helper có thể inject thời gian:

```ts
export function todayInVietnam(now: Date = new Date()): string {
  const vn = new Date(now.getTime() + 7 * 3600_000);
  return vn.toISOString().slice(0, 10);
}

export function vietnamDayRange(now: Date = new Date()): {
  date: string;
  start: Date;
  end: Date;
} {
  const date = todayInVietnam(now);
  return {
    date,
    start: new Date(`${date}T00:00:00+07:00`),
    end: new Date(`${date}T23:59:59.999+07:00`),
  };
}
```

2. Dashboard `period=today`:

```ts
const range = vietnamDayRange();
periodStart = range.start;
periodEnd = range.end;
selectedPeriodTitle = `Hôm nay (${formatVnDate(range.date)})`;
```

3. AI quota và nhãn:

```ts
const range = vietnamDayRange();
const start = range.start;
const label = `tuần ${formatVnDate(now)}`;
```

4. Notifications:

```ts
const todayStr = todayInVietnam(now);
const deadlineDateStr = vnDateOnly(t.currentDeadline);
content: `... Hạn xử lý: ${formatVnDate(t.currentDeadline)} ...`
```

5. Remind route: dùng `todayInVietnam()` và `formatVnDate()` cho nội dung/idempotency.

6. Bổ sung `TZ=Asia/Ho_Chi_Minh` trên Vercel như lớp bảo vệ, nhưng **không thay** code helper.

**Test bắt buộc:**

- `TZ=UTC`, giả lập `2026-10-24T23:00:00.000Z` (06:00 VN ngày 25/10):
  - `vietnamDayRange(now).date === "2026-10-25"`,
  - `start` là `2026-10-24T17:00:00.000Z`,
  - `end` là `2026-10-25T16:59:59.999Z`.
- Dashboard `period=today` phải dùng start/end trên.
- Notification idempotency dùng ngày VN, không dùng `toISOString().slice(0,10)`.
- AI label hiển thị `25/10/2026`, không phải `24/10/2026`.

**Commit:** `fix(time): dung ngay Viet Nam cho dashboard, AI, notification, remind`

**Điều kiện nhận:** không còn `toLocaleDateString("vi-VN")` không có `timeZone` trong các route nghiệp vụ đã sửa.

---

### Task 1.3 — Vô hiệu hoá/giới hạn endpoint purge-storage

**Người làm:** S0 + Ops  
**File:**

- `src/app/api/admin/system/purge-storage/route.ts`
- `src/server/storage-purge-policy.ts` (mới, nếu tách policy)
- `scripts/test-v3-purge-safety.ts`

**Thiết kế an toàn tối thiểu:**

1. Xoá token tĩnh `PURGE-2026-10-22` khỏi source.
2. Endpoint mặc định **không hoạt động** trên Production:
   - yêu cầu `STORAGE_PURGE_ENABLED=true`,
   - yêu cầu header `x-purge-token` khớp `STORAGE_PURGE_TOKEN` (so sánh timing-safe),
   - yêu cầu bucket nằm trong `STORAGE_PURGE_BUCKETS` (mặc định rỗng; chỉ cho `task-attachments` nếu ops cần).
3. Bỏ fallback sang `work-evidence`; nếu bucket không truy cập được thì trả lỗi, không tự đổi bucket.
4. Mặc định dry-run; chỉ xoá khi body có `dryRun: false` và token hợp lệ.
5. Audit ghi `bucketUsed`, `objects`, `deleted`, `failed`; audit trước và sau khi xoá.
6. Không cho `work-evidence` qua endpoint này; nếu cần dọn minh chứng phải có quy trình riêng, backup và phê duyệt.

**Test bắt buộc:**

- Không set `STORAGE_PURGE_ENABLED` → 404/403, không liệt kê object.
- Set enabled nhưng thiếu/sai token → 403.
- Bucket ngoài allowlist (`work-evidence`) → 400.
- Dry-run không gọi DELETE.
- Không còn token tĩnh trong source.

**Commit:** `fix(storage): vo hieu hoa purge mac dinh va gioi han bucket`

**Điều kiện nhận:** không thể xoá object nếu chưa có env + token + bucket allowlist; test không chạm dữ liệu thật.

---

### Task 1.4 — Kiểm soát migration và backup Production

**Người làm:** S0 + Ops/DBA  
**File/tài liệu:**

- `docs/release/PRODUCTION_MIGRATION_LEDGER_2026-10-24.md` (mới)
- `docs/release/MIGRATION_RULES.md` (mới)
- `docs/release/PREFLIGHT_PRODUCTION_AUDIT.sql` (bổ sung check ledger)
- `docs/evidence/release/BACKUP_RESTORE_REMEDIATION_2026-10-24.md` (mới)

**Việc làm:**

1. Lập ledger thủ công cho 7 migration đã áp:
   - tên migration,
   - SHA-256,
   - thời điểm áp,
   - người thực hiện,
   - kết quả/row count,
   - ghi chú `Production không có _prisma_migrations`.
2. Ghi rõ quy tắc:
   - không chạy `prisma migrate deploy`;
   - mỗi file SQL chạy riêng, `ON_ERROR_STOP=1`;
   - migration mới phải idempotent (`IF NOT EXISTS`, `DO $$`) hoặc có preflight object check;
   - backup + restore thử trước mỗi lần migration;
   - partial apply → STOP, restore, không chạy lại mù.
3. Bật backup định kỳ/PITR nếu gói Supabase cho phép; nếu không, lập lịch `pg_dump` tự động và lưu ngoài repo.
4. Diễn tập restore vào database clone; ghi số bảng/dòng/FK và kết quả `restore_mismatches = 0`.
5. Không sửa migration đã áp; nếu cần guard cho môi trường mới, tạo migration mới có kiểm tra.

**Điều kiện nhận:** có ledger, có backup ID/SHA, có biên bản restore; không có thay đổi schema trong Phase 1.

---

## 4. Phase 2 — P1 hardening (2–3 ngày)

### Task 2.1 — Bỏ JWT khỏi localStorage, thêm CSP

**Người làm:** S0 + S1 (UI test)  
**File:**

- `src/app/login/page.tsx`
- `src/app/change-password/page.tsx` (nếu còn remove token)
- `next.config.mjs`
- `scripts/test-v3-auth-storage.ts` (Puppeteer, mới)

**Việc làm:**

1. Bỏ:
   - `localStorage.setItem("token", ...)`,
   - `localStorage.setItem("currentUser", ...)`,
   - các `removeItem` không còn cần thiết.
2. Giữ cookie `HttpOnly` làm cơ chế xác thực chính; kiểm tra `/api/auth/me` vẫn hoạt động.
3. Giữ token trong JSON login **chỉ để tương thích test/API client**; web không lưu token. Nếu chủ dự án đồng ý bỏ hẳn, tách endpoint token cho API client.
4. Thêm header CSP/HSTS trong `next.config.mjs`:
   - `default-src 'self'`;
   - `script-src 'self' 'unsafe-inline'` (ghi chú: có thể siết bằng nonce sau);
   - `style-src 'self' 'unsafe-inline'`;
   - `img-src 'self' data: blob: https://*.supabase.co`;
   - `connect-src 'self' https://*.supabase.co https://generativelanguage.googleapis.com`;
   - `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`.
5. Test Preview trước khi lên Production; CSP không được chặn logo/font/AI/Supabase.

**Test bắt buộc:**

- Sau login, `localStorage` không có `token`, không có `currentUser`.
- Refresh trang vẫn dùng được cookie.
- Response có `Content-Security-Policy`.
- Các màn hình chính không lỗi console/CSP.

**Commit:** `fix(auth): bo token khoi localStorage va them CSP`

---

### Task 2.2 — Bỏ cache xác thực 60 giây

**Người làm:** S0  
**File:**

- `src/server/auth.ts`
- `scripts/test-v3-auth-revocation.ts` (mới)

**Việc làm:**

- Xoá `authMemoryCache`, `CachedAuth`, `pruneAuthCache`, `AUTH_CACHE_MAX`.
- `authenticateRequest` đọc DB mỗi request như hiện tại, không trả cache.
- Ghi chú hiệu năng: 37 tài khoản, truy vấn account có index; theo dõi p95 sau deploy. Nếu p95 tăng bất thường, mới cân nhắc cache ngắn có invalidation, không quay lại 60 giây mặc định.

**Test bắt buộc:**

- Login tài khoản fixture.
- Admin đặt `account.status = INACTIVE` (chỉ fixture).
- Gọi `/api/auth/me` ngay lập tức → 401, không cần chờ 60 giây.
- Khôi phục trạng thái fixture sau test.
- Test tương tự với đổi role/unit nếu có fixture.

**Commit:** `fix(auth): thu hoi quyen ngay, bo cache 60s`

---

### Task 2.3 — Scope số nghỉ phép trong AI summary

**Người làm:** S0 + S2  
**File:**

- `src/app/api/ai/route.ts`
- `scripts/test-v3-ai-summary-scope.ts` (mới hoặc mở rộng test AI hiện có)

**Thiết kế:**

```ts
const leaveApproved = await prisma.leaveRequest.count({
  where: {
    status: "APPROVED",
    ...(authorizedUnits === "ALL"
      ? {}
      : {
          person: {
            assignments: {
              some: {
                isPrimary: true,
                unitId: { in: authorizedUnits },
              },
            },
          },
        }),
  },
});
```

**Test bắt buộc:**

- Tạo leave APPROVED cho người thuộc đơn vị A và đơn vị B (fixture).
- `UNIT_LEADER` đơn vị A gọi `op=summarize`: chỉ đếm leave của A.
- `DEPARTMENT_LEADER` scope `ALL`: đếm cả A và B.
- Không gọi AI thật trong test; mock/không cần nếu chỉ kiểm tra số liệu đầu vào. Nếu AI bắt buộc, dùng test env riêng và không tính chi phí.

**Commit:** `fix(ai): scope so nghi phep theo don vi`

---

### Task 2.4 — Sửa middleware bỏ qua auth cho path có dấu chấm

**Người làm:** S0  
**File:**

- `src/middleware.ts`
- `scripts/test-v3-middleware-paths.ts` (mới)

**Việc làm:**

- Bỏ `pathname.includes(".")`.
- Chỉ cho public:
  - `/_next` (matcher đã loại static),
  - `/images`, `/fonts`,
  - `favicon.ico`, `robots.txt`, `sitemap.xml`, `manifest.json` (nếu có).
- Không dùng regex đuôi file chung cho API; API phải đi qua auth.
- Giữ nguyên `PUBLIC_API_PREFIXES` chỉ gồm login/me/health.

**Test bắt buộc:**

- Chưa đăng nhập, `GET /admin/system/foo.bar` → 307 về `/login` (không phải 404 do bypass).
- Chưa đăng nhập, `GET /api/tasks/<id>.json` → 401 từ middleware/route.
- `GET /images/logo.png` → 200.
- `GET /_next/static/...` → 200.
- Đăng nhập bình thường vẫn vào được trang nghiệp vụ.

**Commit:** `fix(middleware): bo bypass auth theo dau cham`

---

### Task 2.5 — Bổ sung test hồi quy và gate

**Người làm:** S1  
**File:**

- `scripts/test-v3-quality-history-visibility.ts`
- `scripts/test-v3-timezone.ts`
- `scripts/test-v3-purge-safety.ts`
- `scripts/test-v3-auth-storage.ts`
- `scripts/test-v3-auth-revocation.ts`
- `scripts/test-v3-ai-summary-scope.ts`
- `scripts/test-v3-middleware-paths.ts`

**Việc làm:**

- Mỗi test có header mô tả, dùng fixture, không dùng Production.
- Thêm vào checklist release, không chỉ chạy thủ công.
- Chạy tối thiểu:
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm build`
  - `npx prisma validate`
  - các test P0/P1
  - regression S4/S6/E8/E12 liên quan
- Ghi log PASS/FAIL vào `docs/evidence/release/REMEDIATION_TEST_2026-10-24.md`.

**Điều kiện nhận:** test mới đỏ trước fix (với các lỗi đã biết), xanh sau fix; không có test nào bị skip để lấy green.

---

## 5. Phase 3 — P2 nâng cấp (0,5–1 ngày, có thể tách release)

### Task 3.1 — Hợp nhất thư viện JWT

**Người làm:** S0  
**File:** `src/server/auth.ts`, `src/middleware.ts`, `package.json`

**Việc làm:**

- Dùng `jose` cho cả ký và verify server; bỏ `jsonwebtoken` + `@types/jsonwebtoken`.
- `signToken`/`verifyToken` có thể chuyển async; cập nhật callers.
- Test login, middleware, API auth, logout, change-password.

**Điều kiện nhận:** chỉ còn một thư viện JWT; toàn bộ test auth PASS. Nếu rủi ro cao, hoãn sang release sau, không chặn P0/P1.

### Task 3.2 — Health báo đúng commit

**Người làm:** S0 + Ops  
**File:** `src/app/api/health/route.ts`, release runbook

**Việc làm:**

- Health trả `commit = process.env.VERCEL_GIT_COMMIT_SHA || process.env.RELEASE_SHA || "dev"`.
- Khi deploy CLI, truyền `RELEASE_SHA` từ `git rev-parse --short HEAD`; hoặc chuyển deploy qua Git integration.
- Ghi deployment ID + commit vào biên bản release.

**Điều kiện nhận:** `/api/health` trên Production trả đúng SHA của bản deploy, không còn `dev`.

---

## 6. Ma trận test và lệnh chạy

> Thay `$TEST_BASE_URL` và `$TEST_DATABASE_URL` bằng fixture; không dùng Production.

| Test | Lệnh | Gate |
|---|---|---|
| Typecheck | `pnpm typecheck` | P0/P1 |
| Lint | `pnpm lint` | P0/P1 |
| Prisma validate | `npx prisma validate` | P0/P1 |
| Build | `pnpm build` | P0/P1 |
| E12 history cũ | `TEST_BASE_URL=$TEST_BASE_URL DATABASE_URL=$TEST_DATABASE_URL npx tsx scripts/test-v3-e12-unified-history.ts` | P0 |
| Quality visibility | `... npx tsx scripts/test-v3-quality-history-visibility.ts` | P0 |
| Timezone | `TZ=UTC npx tsx scripts/test-v3-timezone.ts` | P0 |
| Purge safety | `... npx tsx scripts/test-v3-purge-safety.ts` | P0 |
| Auth storage/CSP | `... npx tsx scripts/test-v3-auth-storage.ts` | P1 |
| Auth revocation | `... npx tsx scripts/test-v3-auth-revocation.ts` | P1 |
| AI scope | `... npx tsx scripts/test-v3-ai-summary-scope.ts` | P1 |
| Middleware paths | `... npx tsx scripts/test-v3-middleware-paths.ts` | P1 |
| Regression S4/S6/E8/E12 | theo release plan hiện có | trước Production |

**Không chấp nhận:** test pass bằng cách bỏ assertion, skip test, tăng timeout vô hạn hoặc dùng dữ liệu Production.

---

## 7. Release, rollback và theo dõi

### 7.1. Release P0

1. Branch `codex/v3-remediation-p0` đã review + test xanh.
2. Backup Production + xác nhận restore (dù P0 không đổi schema).
3. Deploy Preview/Staging; smoke:
   - collaborator history không thấy quality;
   - dashboard `today` đúng ngày VN;
   - notification/remind đúng ngày;
   - purge route bị chặn mặc định;
   - health OK, flags OFF.
4. Chủ dự án duyệt lệnh deploy Production.
5. Deploy Vercel; ghi deployment ID; health/smoke; theo dõi 24h.

### 7.2. Release P1

- Có thể gộp một release sau P0 nếu P0 ổn định.
- Bắt buộc test CSP trên Preview trước khi Production.
- Không đổi schema.

### 7.3. Rollback

- Code: quay về `dpl_HjAkRQJT7iHQ6szfzNxxRfqLvj9V` (V3.2).
- Env: bỏ `STORAGE_PURGE_ENABLED`, `STORAGE_PURGE_TOKEN`, `STORAGE_PURGE_BUCKETS`, `TZ` nếu gây lỗi.
- Không có migration P0/P1 nên không cần rollback schema.
- Nếu P2 JWT gây lỗi đăng nhập: rollback code ngay, giữ dữ liệu.

### 7.4. Theo dõi sau deploy

- 5xx, 401/403 bất thường, login fail, approval/history, notification, AI.
- Không có lời gọi `purge-storage` ngoài ops.
- Không có quality value mới ngoài ý muốn.
- Kiểm tra p95 auth sau khi bỏ cache (Task 2.2).

---

## 8. Phân công và thời gian dự kiến

| Phase | Việc | Owner | Thời gian |
|---|---|---|---|
| 0 | Baseline, fixture, flags | S0/S1 | 0,5 ngày |
| 1.1 | Quality history | S4 | 0,5 ngày |
| 1.2 | Timezone | S0 + S2 + S4 | 0,5–1 ngày |
| 1.3 | Purge safety | S0 + Ops | 0,5 ngày |
| 1.4 | Migration/backup | S0 + Ops | 0,5 ngày (song song) |
| 2.1 | localStorage + CSP | S0 + S1 | 0,5 ngày |
| 2.2 | Auth cache | S0 | 0,25 ngày |
| 2.3 | AI scope | S0 + S2 | 0,25 ngày |
| 2.4 | Middleware | S0 | 0,25 ngày |
| 2.5 | Test gate | S1 | 0,5–1 ngày |
| 3.1 | JWT library | S0 | 0,5 ngày (tùy chọn) |
| 3.2 | Health commit | S0/Ops | 0,25 ngày |

**Tổng:** P0 khoảng 2 ngày làm việc; P1 khoảng 2–3 ngày; P2 khoảng 1 ngày.

---

## 9. Quyết định cần chủ dự án/ops chốt

1. **Purge-storage:** tắt hẳn endpoint trên Production hay giữ bằng env + token + allowlist? Khuyến nghị: tắt hẳn, chuyển sang script local có backup.
2. **PITR/backup:** gói Supabase hiện tại có bật PITR được không; nếu không, chấp nhận lịch `pg_dump` tự động nào?
3. **CSP:** xác nhận domain Supabase/AI đang dùng để không chặn logo/font/AI.
4. **Token trong login response:** giữ cho API client hay bỏ hẳn? Khuyến nghị: web không lưu; API client tách endpoint riêng.
5. **Bỏ auth cache:** chấp nhận tăng một truy vấn DB mỗi request để thu hồi quyền ngay?
6. **Hợp nhất JWT:** làm trong P2 hay để release sau?

---

## 10. Điều kiện hoàn thành

- [ ] P0 tests xanh; collaborator không thấy quality.
- [ ] Dashboard/AI/notification/remind đúng ngày VN tại 06:00.
- [ ] Purge route không thể xoá nếu thiếu env/token/allowlist; không còn token tĩnh.
- [ ] Có migration ledger + backup/restore evidence.
- [ ] Không còn JWT trong localStorage; CSP hoạt động.
- [ ] Tài khoản bị disable bị chặn ngay.
- [ ] AI summary không lộ leave ngoài phạm vi.
- [ ] Middleware không bypass path có dấu chấm.
- [ ] Test hồi quy được thêm vào release checklist.
- [ ] Flags YC-10/YC-11 vẫn OFF.
- [ ] Có biên bản deploy, rollback ID và theo dõi 24h.

---

## 11. Ghi chú triển khai

- Không sửa migration đã áp; mọi thay đổi schema (nếu có) phải là migration mới, có backup/restore.
- Không commit credential, connection string, token hay dữ liệu Production.
- Mỗi task một commit nhỏ, thông điệp rõ; không gộp P0/P1 vào một commit lớn.
- Nếu một task không thể test trên fixture, dừng và bổ sung fixture trước khi sửa.
- Mọi thay đổi Production phải có lệnh riêng của chủ dự án; kế hoạch này không phải lệnh deploy.
