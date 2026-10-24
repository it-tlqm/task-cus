# PRODUCTION DEPLOY — V3.2 (24/10/2026)

**Trạng thái:** `DEPLOYED — TECHNICAL SMOKE PASS — UAT OWNER PENDING`  
**Production:** `https://task-cus.vercel.app`  
**Vercel project:** `tlqm/task-cus`  
**Deployment:** `dpl_HjAkRQJT7iHQ6szfzNxxRfqLvj9V` (`task-l7yi3j5m7-tlqm.vercel.app`)  
**Previous production (rollback):** `dpl_Gg2qYjXRYzu9tw3ZUry2LLQy89Yw` (V3.1)  
**Local code:** `codex/v3.2-integration` @ `3ff30aa` (V3.2 decisions)  
**Flags:** `V3_YC10_QUALITY` OFF, `V3_YC11_PRECHECK` OFF.

---

## 1. Quyết định đã triển khai

- **D5-A:** `metric_target_rules`; `THU_NSNN` YEAR `HIGHER_IS_BETTER/CUMULATIVE/YEAR_START`; MONTH `.../MONTH_START`; 5 chỉ tiêu còn lại `NOT_SET/PENDING_BUSINESS_INPUT`.
- **B1-A:** kỳ trước/cùng kỳ so cùng số ngày; chưa đủ kỳ ghi “Chưa đủ kỳ”, không 0%.
- **B2-A:** điều chỉnh lũy kế có lý do + audit old/new; dùng `canEnter/canConfirm`.
- **C1-A:** chỉ `THU_NSNN` YEAR/MONTH được gán chỉ tiêu; chỉ tiêu khác “Chưa có quy tắc gán”.
- **E8-A:** trả lại giữ nguyên tiến độ, bắt buộc lý do.
- **E12-A:** lịch sử hợp nhất TaskUpdate + ApprovalDecision + ParticipantEvent, có nhãn nguồn.
- **E13:** A0 không ghi chú ô trống; B2 sheet phụ Excel; C0 giữ “Đổi người” tách riêng.

## 2. Backup Production trước migration

- Schema SHA-256: `a948a1440d6147c2358cbd734cb4c351dc3be2d28b1a926a862d06e0b645af5e`
- Data SHA-256: `9fbad61f560cf91c1865a8780f469ce1101d851f45b87cf44d1e1d452fb1c306`
- Lưu ngoài repo, ACL user; restore vào `talung_v3_v32_rehearsal` PASS.
- Apply migration `20261023200000_v32_metrics_decisions` trên bản restore: PASS; counts không đổi; `prisma migrate diff` No difference.

## 3. Migration Production

- `20261023200000_v32_metrics_decisions` — **PASS**.
- Tạo `metric_target_rules`; 17 rules.
- Counts sau migration không đổi:
  - people 37, accounts 37, tasks 14, personal_work_items 26,
    metric_plan_targets 0, metric_baselines 0, metric_daily_entries 23.
- `person_supervisions` vẫn **0** → YC-11 tiếp tục OFF.

## 4. Deploy code

- Vercel `vercel --prod --yes`: build PASS; alias `https://task-cus.vercel.app`.
- `/api/health`: `status=ok`, `db=up`, `env=production` (`commit=dev` do deploy CLI).
- `/login`: 200; `/giao-ban` chưa đăng nhập: 307 (đúng).
- Route V3.2 live: `/api/tasks/[id]/history` 401; `/api/metrics/baseline-adjustments` 401; `/api/metrics/summary` 401 khi chưa auth.

## 5. Technical smoke

| Kiểm tra | Kết quả |
|---|---|
| Health DB | PASS |
| Login page | 200 |
| `/giao-ban` redirect auth | 307 |
| Route history/baseline-adjustments mới | 401 (live) |
| DB counts sau deploy | Không đổi |
| 17 target rules | PASS |

## 6. Còn lại

- UAT tài khoản thật: `/giao-ban`, `/giao-ban/cau-hinh`, `/my-work` + task detail, `/roster`, Excel export.
- Production hiện **0 target/baseline**; D5/B2 chỉ có hiệu lực khi nhập REAL target/baseline. DEMO không dùng để tính %.
- YC-10/YC-11 vẫn OFF; không bật khi `person_supervisions=0`.
- D1/D6/D8/D9/E9? (các quyết định cũ ngoài V3.2) vẫn giữ trạng thái trước đó.

## 7. Rollback

- Code: `vercel rollback dpl_Gg2qYjXRYzu9tw3ZUry2LLQy89Yw`.
- DB: `metric_target_rules` additive; code V3.1 không đọc bảng này. Không cần drop khi rollback code.
- Nếu buộc rollback schema: chỉ sau phê duyệt; bảng chỉ chứa rules, không ảnh hưởng dữ liệu nghiệp vụ.
