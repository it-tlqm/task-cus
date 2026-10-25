# BẢNG ĐIỀU HÀNH V4 — SPEC THIẾT KẾ LẠI (25/10/2026)

**Trạng thái:** `DRAFT — CHỜ CHỦ DỰ ÁN DUYỆT MOCKUP`

**Phạm vi:** thiết kế lại `/dashboard`; không thay đổi công thức số liệu, quyền, schema trong bước này.

**Hướng đã chốt:**

- Ưu tiên **Lãnh đạo đơn vị**.
- Có dashboard theo vai trò.
- Dùng **Recharts** cho biểu đồ.
- Bảng vẫn giữ làm lớp chi tiết/đối chiếu.

---

## 1. Mục tiêu

Dashboard hiện tại đang **table-first**: người dùng phải đọc bảng mới hiểu tình hình. Mục tiêu mới:

1. Nhìn 5–10 giây thấy ngay: thu NSNN, tiến độ chỉ tiêu, nhiệm vụ, quá hạn, quality, cảnh báo.
2. Chuyển nhanh giữa **Tổng quan / Biểu đồ / Bảng / So sánh**.
3. Bấm KPI/cảnh báo để drill-down đúng danh sách.
4. Cấu hình widget/biểu đồ theo vai trò, không hard-code từng màn.
5. Mobile vẫn dùng được, không tràn ngang ngoài bảng chi tiết.

## 2. Người dùng & ưu tiên

| Vai trò | Cần thấy trước | Không cần |
|---|---|---|
| **UNIT_LEADER** | Thu NSNN vs chỉ tiêu, nhiệm vụ toàn đơn vị, quá hạn, quality, cảnh báo, xếp hạng bộ phận | Chi tiết từng cá nhân nếu không drill-down |
| **DEPARTMENT_LEADER** | Việc bộ phận, quá hạn, tải công việc, quality tuyến mình duyệt | Thu NSNN toàn đơn vị nếu không được xem |
| **STAFF** | Việc của tôi, hạn, quality kết quả của tôi, thông báo | Số liệu thu/ngân sách, quality người khác |
| **SYSTEM_ADMIN** | Trạng thái hệ thống, cấu hình, audit | Dữ liệu nghiệp vụ chi tiết |

## 3. Cấu trúc màn hình

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Header: Bảng điều hành · Đơn vị · Ngày · User                        │
├──────────────────────────────────────────────────────────────────────┤
│ Filter bar: Đơn vị | Hôm nay/Tuần/Tháng/Năm | Tổng quan/Biểu đồ/... │
├──────────────────────────────────────────────────────────────────────┤
│ KPI 1 Thu NSNN │ KPI 2 Nhiệm vụ │ KPI 3 Chờ duyệt │ KPI 4 Quality   │
├───────────────────────────────────────────┬──────────────────────────┤
│ Biểu đồ xu hướng thu + target             │ Vòng tiến độ chỉ tiêu    │
├───────────────────────────────────────────┼──────────────────────────┤
│ Nhiệm vụ theo trạng thái                  │ Cảnh báo / việc cần làm  │
├───────────────────────────────────────────┼──────────────────────────┤
│ Xếp hạng đơn vị / tải việc                │ Phân bố quality (YC-10)  │
├───────────────────────────────────────────┴──────────────────────────┤
│ Bảng chi tiết (collapsible) — drill-down, export                     │
└──────────────────────────────────────────────────────────────────────┘
```

### Header
- Tên màn hình + tên đơn vị.
- Ngày cập nhật / trạng thái dữ liệu.
- User menu.

### Filter bar
- Đơn vị (nếu có quyền).
- Kỳ: Hôm nay, Tuần, Tháng, Năm.
- Kiểu xem: **Tổng quan | Biểu đồ | Bảng | So sánh**.
- Nút Xuất / In.
- Sticky khi cuộn.

### KPI cards
Mỗi card:
- Nhãn.
- Số lớn.
- So sánh kỳ trước.
- Trạng thái: Đạt / Chưa đạt / Chưa cấu hình.
- Bấm → mở danh sách chi tiết đã lọc.

KPI mặc định:
1. Thu NSNN / chỉ tiêu.
2. Nhiệm vụ đang thực hiện / tổng.
3. Quá hạn / chờ duyệt.
4. Quality trung bình (chỉ hiện khi YC-10 bật và có quyền).

## 4. Các kiểu xem

### 4.1 Tổng quan
- KPI cards.
- 1 biểu đồ xu hướng chính.
- 1 vòng tiến độ chỉ tiêu.
- 3–4 widget phụ.
- 3 cảnh báo ưu tiên.

### 4.2 Biểu đồ
- Grid 2 cột.
- Người dùng chọn widget từ danh sách.
- Mỗi widget có tooltip, legend, filter.
- Có nút “Xem dạng bảng” cho từng chart.

### 4.3 Bảng
- Bảng số liệu hiện tại, giữ nguyên khả năng đối chiếu.
- Sticky header, sort, filter.
- Export Excel.
- Không hiển thị quá 10 dòng mặc định; “Xem tất cả”.

### 4.4 So sánh
- B1-A same-day comparison.
- Grouped bar: thực tế vs tháng trước vs cùng kỳ.
- Waterfall: chênh lệch so với chỉ tiêu.
- Ghi rõ “Chưa đủ kỳ”, “Chưa cấu hình”; không hiện 0%.

## 5. Widget catalog

| Mã | Widget | Kiểu | Nguồn | Quyền mặc định |
|---|---|---|---|---|
| `revenue-kpi` | Thu NSNN / chỉ tiêu | KPI + progress | metrics summary | leader |
| `revenue-trend` | Xu hướng thu | line + bar | metrics entries | leader |
| `revenue-structure` | Cơ cấu thu | stacked bar/donut | metrics groups | leader |
| `target-gap` | Chênh lệch chỉ tiêu | waterfall | targets/baselines | leader |
| `task-status` | Trạng thái nhiệm vụ | donut/stacked | tasks | leader/dept/staff |
| `overdue-by-unit` | Quá hạn theo đơn vị | horizontal bar | tasks | leader |
| `workload-heatmap` | Tải việc theo tuần/người | heatmap | tasks | leader/dept |
| `quality-distribution` | Phân bố quality | histogram | approvals | leader/decider |
| `alerts` | Việc cần làm | list | tasks/notifications/metrics | all |
| `detail-table` | Bảng chi tiết | table | metrics/tasks | all |

## 6. Dashboard theo vai trò

### UNIT_LEADER
- KPI: Thu NSNN, nhiệm vụ, quá hạn, quality.
- Charts: revenue trend, target gap, task status, overdue by unit, workload heatmap, quality distribution.
- Alerts: chỉ tiêu chưa cấu hình, quá hạn, chờ duyệt lâu, quality thấp.
- Table: chi tiết chỉ tiêu + nhiệm vụ.

### DEPARTMENT_LEADER
- KPI: nhiệm vụ bộ phận, quá hạn, chờ duyệt, quality tuyến mình.
- Charts: task status, workload, quality distribution.
- Không mặc định thấy revenue toàn đơn vị.

### STAFF
- KPI: việc của tôi, sắp hạn, quality kết quả của tôi.
- Charts: tiến độ cá nhân, lịch sử quality.
- Không thấy số liệu thu/ngân sách.

### SYSTEM_ADMIN
- KPI: health, job lỗi, cấu hình thiếu, audit.
- Không thấy dữ liệu nghiệp vụ.

## 7. Data contract

Đề xuất API tổng hợp:

```http
GET /api/dashboard/overview?period=today|week|month|year&unitId=...
```

Trả về:

```json
{
  "period": { "key": "month", "label": "Tháng 10/2026", "start": "...", "end": "..." },
  "kpis": {
    "revenue": { "value": 2651813870360, "target": 3391000000000, "progressPercent": 78.18, "state": "CONFIGURED" },
    "tasks": { "total": 14, "inProgress": 5, "overdue": 3, "waiting": 5 },
    "quality": { "average": 84, "count": 7, "enabled": true }
  },
  "series": {
    "revenueByDay": [{ "date": "2026-10-01", "actual": 0, "target": 0 }],
    "taskByStatus": [{ "status": "IN_PROGRESS", "count": 5 }]
  },
  "alerts": [{ "level": "warning", "message": "2 chỉ tiêu chưa cấu hình", "href": "..." }]
}
```

- Tất cả số liệu aggregate ở server, có scope.
- Không trả dữ liệu quality cho người không có quyền.
- `state = NOT_CONFIGURED` riêng với `0`.
- Có `dataUpdatedAt` để hiển thị “Số liệu đến …”.

## 8. Cấu hình dashboard

Giai đoạn đầu dùng `SystemConfig` JSON:

```json
{
  "roleCode": "UNIT_LEADER",
  "name": "Dashboard lãnh đạo",
  "widgets": [
    { "code": "revenue-kpi", "size": "sm", "order": 1 },
    { "code": "revenue-trend", "size": "lg", "order": 2, "chart": "line" }
  ],
  "version": 1,
  "status": "PUBLISHED"
}
```

Sau này nếu cần version/rollback riêng mới tách bảng `DashboardTemplate`.

Quy tắc:
- Chỉ admin có `dashboard.config` được sửa.
- Có preview trước publish.
- Audit old/new.
- Không cho widget vượt quyền của role.
- Có template mặc định; người dùng có thể chọn view nhưng không sửa cấu hình hệ thống nếu không có quyền.

## 9. Giao diện & accessibility

- Palette: navy `#1E40AF`, blue `#3B82F6`, amber `#D97706`, background `#F8FAFC`, text `#1E3A8A`, border `#DBEAFE`.
- Font: Fira Sans; số liệu dùng Fira Code/tabular.
- Không dùng màu làm tín hiệu duy nhất; luôn có nhãn/icon.
- Chart có `aria-label`, bảng fallback.
- Focus ring rõ; touch target ≥44px.
- Tôn trọng `prefers-reduced-motion`; không nhấp nháy.
- Mobile 375/390: KPI 2 cột, chart 1 cột, bảng cuộn ngang có chỉ báo.
- Desktop 1440: grid 12 cột, tối đa 2–3 chart/hàng.

## 10. Hiệu năng

- Aggregate server-side; không tải toàn bộ entries về client.
- Cache ngắn 30–60 giây cho dashboard; invalidate sau khi nhập/chốt số liệu.
- Lazy-load chart dưới màn hình.
- Giới hạn series điểm (ví dụ 90 ngày) và có “Xem thêm”.
- Không query N+1; một API overview + các API drill-down riêng.

## 11. Tiêu chí nghiệm thu

- Lãnh đạo thấy đúng 4 KPI và 4 widget chính trong 10 giây.
- Bấm KPI “quá hạn” mở danh sách đúng.
- Chuyển Tổng quan/Biểu đồ/Bảng/So sánh không mất filter.
- Chart có tooltip, legend, bảng fallback.
- “Chưa cấu hình” không hiện 0%.
- Quality chỉ hiện với người có quyền.
- Mobile 390 không tràn ngang (trừ bảng có scroll).
- Không thay đổi số liệu so với bảng hiện tại.
- Có ít nhất 1 template cho UNIT_LEADER và 1 cho STAFF.

## 12. Phase triển khai

1. **Spec + mockup** (bước này).
2. **Nền tảng**: API overview, layout, filter, KPI cards, view switcher.
3. **Biểu đồ lõi**: revenue trend, target progress, task status, alerts.
4. **Widget mở rộng**: quality, heatmap, xếp hạng, so sánh.
5. **Admin config + template vai trò**.
6. **UAT desktop/mobile + đối chiếu số liệu + accessibility**.

## 13. Câu hỏi còn mở

1. KPI “Nhiệm vụ” ưu tiên tổng số hay chỉ số đang thực hiện/quá hạn?
2. Quality trên dashboard lấy trung bình tháng hay chỉ kỳ đang chọn?
3. Có cần dark mode không?
4. Có cần dashboard in A4/PDF không?
5. Có cần người dùng tự chọn widget hay chỉ admin cấu hình template?
