# Release: nhập phát sinh hoặc lũy kế (Production 28/10/2026)

## Phạm vi

Chỉ nâng cấp phần nhập số liệu giao ban:

- Chỉ tiêu cấu hình **Lũy kế ngày** có 2 kiểu nhập:
  - **Phát sinh** (mặc định): số phát sinh trong kỳ.
  - **Lũy kế**: tổng lũy kế đến cuối kỳ.
- Nhập phát sinh được hệ thống cộng vào lũy kế trước kỳ rồi lưu.
- Mở lại màn hình hiển thị số phát sinh của kỳ; bấm **Lũy kế** để xem tổng đã lưu.
- Không thêm cột, không migration CSDL.
- Không đổi cách tính của chỉ tiêu **Số phát sinh**.

## Deploy

- Branch: `release/metrics-dual-input`
- Commit: `3570b2b` (cherry-pick `eab6c86` + bản 2 kiểu nhập)
- Deployment: `dpl_48CtoYZxPRnSMdkrAXYnnXueAH4q`
- Health: `db=up`

## Kích hoạt

Production hiện **chưa có chỉ tiêu nào** ở kiểu Lũy kế. Muốn thấy 2 lựa chọn:

1. Vào **Cấu hình giao ban → Nhóm & chỉ tiêu**.
2. Chọn chỉ tiêu, đặt **Kiểu: Lũy kế ngày**.
3. Tạo mốc **Số mở đầu kỳ** trước ngày bắt đầu nhập.
4. Vào **Nhập số liệu** — mỗi dòng hiện **Phát sinh / Lũy kế**.

Không chuyển các chỉ tiêu đang có dữ liệu (Thu NSNN, xe, USD…) sang Lũy kế nếu chưa có kế hoạch chuyển đổi dữ liệu, vì cách cộng số sẽ thay đổi.

## Rollback

Quay lại deployment trước:

- `dpl_5UwoUvCFVXqCyZVF59fBeRCxK1gj`

## Kiểm thử

| Bộ test | Kết quả |
| --- | --- |
| Nhập 2 kiểu | 15/15 |
| Lũy kế ngày | 11/11 |
| Encoding | PASS |
| `tsc --noEmit` | PASS |
| `pnpm build` | PASS |

## Không nằm trong đợt này

- Kho ứng dụng (miniapp store), nhập Excel, các thay đổi UX mới vẫn ở local, chưa deploy.
