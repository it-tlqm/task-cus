# PRODUCTION DEPLOY — V3.1 (24/10/2026)

**Trạng thái:** `DEPLOYED — TECHNICAL SMOKE PASS — UAT OWNER PENDING`  
**Production:** `https://task-cus.vercel.app`  
**Vercel project:** `tlqm/task-cus`  
**Deployment:** `dpl_Gg2qYjXRYzu9tw3ZUry2LLQy89Yw` (`task-qh3jyo1a1-tlqm.vercel.app`)  
**Previous production (rollback target):** `dpl_Yt2otYSTSduGiMEmHbPnLGQWbmLy` (`task-iyy8t8qsr-tlqm.vercel.app`)  
**Local RC runtime:** `1765aab` / tag `v3.1-rc-2026-10-24`  
**Flags:** `V3_YC10_QUALITY` OFF, `V3_YC11_PRECHECK` OFF  
**Production writes:** DB additive migrations + Vercel deployment; không reset dữ liệu, không đổi tài khoản.

---

## 1. Preflight Production (read-only)

- `_prisma_migrations`: **NULL** (đúng dự đoán; không dùng `prisma migrate deploy`).
- `personal_work_items.idempotency_key`: **đã có**; unique index **chưa có**; duplicate groups **0**.
- Các bảng/cột V3 còn lại: **chưa có**.
- Counts trước migration:
  - people 37, accounts 37, tasks 14, task_updates 7,
    approval_cases 3, approval_decisions 3, personal_work_items 26,
    metric_plan_targets 0, metric_baselines 0, metric_daily_entries 23.
- `person_supervisions`: **0** → YC-11 phải để OFF; không thể UAT pre-check thật.

## 2. Backup + restore rehearsal

- Backup logical (Supabase CLI): schema + data, lưu ngoài repo, ACL chỉ user hiện tại.
- SHA-256:
  - schema: `f6a41ba1ac26a51a1e33aa188ba7a6b23477315f977e044141db16e4ed0635e0`
  - data: `1ba3e8496b3caebaf44b57c6e50ddbbfec79e06fe7f62db3bbc8e4c1431656fe`
- Restore vào DB local `talung_v3_prod_rehearsal_20261024`: **PASS**, counts khớp Production.
- Áp 6 migration trên bản restore: **PASS**; `prisma migrate diff` với schema: **No difference**.
- Không dùng `prisma migrate deploy`, không `db push`, không reset.

## 3. Migration Production (manual, theo thứ tự)

| # | Migration | Kết quả |
|---|---|---|
| 1 | `20261023120000_v3_phase_a_planning` | PASS; unique index đã tạo |
| 2 | `20261023150000_v3_phase_b_revenue` | PASS |
| 3 | `20261023160000_v3_phase_b_data_source` | PASS |
| 4 | `20261023170000_v3_task_participant_results` | PASS |
| 5 | `20261023180000_v3_approval_quality` | PASS |
| 6 | `20261023190000_v3_approval_precheck_route` | PASS |

Sau migration:
- Counts dữ liệu nghiệp vụ **không đổi**.
- 7 bảng V3 mới tồn tại; cột `quality_percent`, `subject_person_id`, `participant_event_id`, `data_source`, `comparison_kind` tồn tại.
- Permissions `metrics.config`, `metrics.entry_all` tồn tại.
- `person_supervisions` vẫn 0.

## 4. Deploy code

- Vercel CLI `vercel --prod --yes` từ integration; build PASS.
- Alias `https://task-cus.vercel.app` → deployment mới.
- `/api/health`: `status=ok`, `db=up`, `env=production`.
  - Lưu ý: health trả `commit=dev` vì deploy trực tiếp bằng CLI, không qua Git; **deployment ID là mốc traceability**.
- `/login`: HTTP 200.
- Route V3 mới kiểm tra không auth: các route trả **401** (không 404) → code V3.1 đã live.

## 5. Technical smoke

| Kiểm tra | Kết quả |
|---|---|
| Health | PASS (`db=up`) |
| Login page | HTTP 200 |
| `/api/metrics/targets` không auth | 401 (route mới live) |
| `/api/approvals/quality-adjustments/x/decision` | 401 |
| `/api/tasks/x/participant-results/y/precheck` | 401 |
| DB counts sau deploy | Không đổi |

## 6. Chưa làm / cần chủ dự án

- **UAT tài khoản thật** trên Production/Preview; chưa chạy.
- `V3_YC10_QUALITY`/`V3_YC11_PRECHECK` **chưa bật**; muốn bật phải UAT + xác minh `person_supervisions` thật.
- Không seed supervision; không reset tài khoản.
- D5/B-C-3, S5 E13, B1/B2/C1, E8/E12 vẫn ngoài scope.

## 7. Rollback

- **Code:** rollback Vercel về `dpl_Yt2otYSTSduGiMEmHbPnLGQWbmLy`:
  `vercel rollback dpl_Yt2otYSTSduGiMEmHbPnLGQWbmLy`
- **DB:** schema additive, code cũ tương thích; ưu tiên rollback code, không drop bảng/cột.
- Nếu buộc rollback schema: chỉ sau khi có phê duyệt + backup; Phase 1/2 có thể mất dữ liệu phát sinh sau deploy.
- Backup logical còn giữ đến khi UAT/ổn định; xóa theo quy trình sau sign-off.
