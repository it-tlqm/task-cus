# Release: nhập phát sinh hoặc lũy kế (Production 28/10/2026)

## Phạm vi

Nâng cấp phần nhập số liệu giao ban cho **mọi chỉ tiêu phát sinh (FLOW)**:

- Mỗi dòng có 2 kiểu nhập:
  - **Phát sinh** (mặc định): số phát sinh trong kỳ.
  - **Lũy kế**: tổng lũy kế đến cuối kỳ.
- Người dùng chọn linh hoạt từng dòng, không phải vào Cấu hình đổi chỉ tiêu.
- Hệ thống tự quy đổi về đúng dạng lưu:

| Dạng lưu | Nhập phát sinh | Nhập lũy kế |
| --- | --- | --- |
| Số phát sinh | Giữ nguyên | Trừ lũy kế đầu kỳ để ra phát sinh |
| Lũy kế ngày | Cộng vào lũy kế đầu kỳ | Giữ nguyên |

- Chọn **Lũy kế** sẽ hiện dòng **Lũy kế trước kỳ** để đối chiếu.
- Chỉ tiêu **Số dư** (BALANCE) giữ nguyên một kiểu nhập.
- Không thêm cột, không migration CSDL.
- Báo cáo vẫn tính theo dạng lưu của chỉ tiêu, không thay đổi số liệu cũ.

## Deploy

- Branch: `release/metrics-dual-input`
- Commit: `8b3fe41`
- Deployment: `dpl_3q3CK93CrKLtqrQvndSct1Q11oWF`
- Health: `db=up`

Bản trước đó (chỉ cho chỉ tiêu cấu hình Lũy kế): `dpl_48CtoYZxPRnSMdkrAXYnnXueAH4q`.

## Kích hoạt

Không cần cấu hình thêm. Vào **Nhập số liệu**, mọi chỉ tiêu phát sinh đều có nút **Phát sinh / Lũy kế**.

- Mặc định **Phát sinh**.
- Nếu chọn **Lũy kế** mà dòng **Lũy kế trước kỳ** hiện 0 hoặc sai, kiểm tra mốc **YEAR/OPENING** trước khi lưu.

## Rollback

- Quay lại bản ngay trước: `dpl_48CtoYZxPRnSMdkrAXYnnXueAH4q`
- Quay lại bản trước toàn bộ đợt: `dpl_5UwoUvCFVXqCyZVF59fBeRCxK1gj`

## Kiểm thử

| Bộ test | Kết quả |
| --- | --- |
| Nhập 2 kiểu | 20/20 |
| Lũy kế ngày | 11/11 |
| Encoding | PASS |
| `tsc --noEmit` | PASS |
| `pnpm build` | PASS |

## Không nằm trong đợt này

- Kho ứng dụng (miniapp store), nhập Excel, các thay đổi UX mới vẫn ở local, chưa deploy.
