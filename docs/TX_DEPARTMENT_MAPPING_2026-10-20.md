# ĐỐI CHIẾU 6 NHÓM NGUỒN DANH MỤC TX → ĐƠN VỊ THẬT (20/10/2026)

Tệp nguồn: `Danh mục TX.xlsx`, sheet `DM CV thường xuyên` (ngoài Git).
Tổng: **143 đầu việc / 6 nhóm nguồn**. Tên nhóm giữ **nguyên văn** theo tệp Hải quan gửi, kể cả lỗi chính tả “Bộ phân…”.

## Bảng 3 cột để Hải quan xác nhận

| 1. Tên nhóm nguồn (nguyên văn) | 2. Bộ phận/đơn vị đích trong `org_units` Production | 3. Phạm vi cán bộ được thấy/chọn sau khi kích hoạt |
|---|---|---|
| `Bộ phân Nghiệp vụ Hải quan` — **73** | Đề xuất: `BP_NGHIEPVU_A` — “Bộ phận Nghiệp vụ A (Thủ tục Hải quan)”. **Chưa xác nhận.** | Cán bộ có phân công đang hiệu lực tại đơn vị đích; lãnh đạo trong phạm vi được tạo cho cán bộ thuộc đơn vị đó. |
| `Bộ phân TH & Báo cáo` — **42** | Đề xuất: `BP_TONGHOP_D` — “Bộ phận Tổng hợp & Báo cáo D”. **Chưa xác nhận.** | Cán bộ có phân công đang hiệu lực tại đơn vị đích. |
| `Bộ phân Phúc tập & KT STQ` — **2** | Có đơn vị gần tên: `BỘ PHẬN PHÚC TẬP _ KTSTQ` (tên hiển thị “Tổng hợp”). Cần xác nhận có phải đơn vị đích hay chỉ là nhóm công việc. **Chưa xác nhận.** | Chỉ cán bộ thuộc đơn vị được xác nhận; không gộp tự động với nhóm TH & Báo cáo. |
| `Bộ phận CNTT` — **5** | **Không có `org_units` tương ứng.** Có thể là nhóm công việc/chức năng, không phải đơn vị tổ chức. | **Chưa kích hoạt.** Không tự tạo `org_units`; không phát cho toàn bộ cán bộ. |
| `Bộ phân điều tra CBL` — **13** | **Không có `org_units` tương ứng.** Có thể là nhóm công việc/chức năng. | **Chưa kích hoạt.** Không tự tạo `org_units`; không phát cho toàn bộ cán bộ. |
| `Công tác Đảng` — **8** | **Không có `org_units` tương ứng.** Có thể là nhóm công việc xuyên bộ phận. | **Chưa kích hoạt.** Không tự tạo `org_units`; không phát cho toàn bộ cán bộ. |

## Quy tắc đang áp dụng trong mã

- `WorkCatalogDepartmentMapping` là nguồn sự thật duy nhất cho việc kích hoạt theo bộ phận:
  - `department` = tên nhóm nguồn (duy nhất);
  - `unitId` = đơn vị thật, có thể null;
  - `isActive` mặc định `false`;
  - ràng buộc CHECK: không được `isActive=true` khi `unitId` null.
- Chỉ nhóm có mapping `isActive=true` **và** có ít nhất một đầu việc TX `ACTIVE` trong phiên bản đang áp dụng mới được hiển thị cho cán bộ thuộc đơn vị đó.
- Nhóm chưa xác nhận/không ánh xạ: **UNACTIVATED**, không hiển thị cho bất kỳ cán bộ nào; không ảnh hưởng đến 48 mẫu cũ của bộ phận khác.
- Bộ phận chưa kích hoạt TX vẫn dùng được nguồn hiện tại (48 mẫu cũ/YC-25) — không bị “chết” lựa chọn.
- Khi một bộ phận đã kích hoạt TX, 48 mẫu cũ chỉ bị ẩn đối với **cán bộ thuộc bộ phận đó**; đầu việc lịch sử giữ nguyên liên kết.
- Kích hoạt là theo **đơn vị đích của người nhận đầu việc**, không theo phạm vi của người tạo. Lãnh đạo tạo cho cán bộ thì kiểm tra bộ phận của cán bộ, không dùng bộ phận của lãnh đạo.
- Có thể tắt một mapping bất kỳ lúc nào; dữ liệu TX đã nhập và đầu việc đã liên kết không bị xóa.

## Việc Hải quan cần trả lời (B2)

1. Ba nhóm đầu (73, 42, 2) có đúng là đơn vị trong `org_units` như đề xuất không?
2. Ba nhóm `CNTT`, `điều tra CBL`, `Công tác Đảng` là **bộ phận tổ chức** hay **nhóm công việc/chức năng**?
3. Nếu là nhóm công việc: ai được thấy/chọn, và có cần tạo đơn vị mới (có mã, cấp, lãnh đạo) hay chỉ gắn vào đơn vị hiện có?
4. Có nhóm nào cần gộp vào nhau hoặc tách khỏi tên nguồn không?

Cho đến khi có xác nhận, **không nhập/kích hoạt** các nhóm này trên Production. Việc deploy mã nguồn có thể tách khỏi việc nhập danh mục, nhưng tính năng minh chứng vẫn phụ thuộc bucket private.
