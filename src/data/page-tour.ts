/**
 * Kịch bản tour từng bước theo màn hình: khung sáng di chuyển đến từng
 * khu vực, có nút Trước / Tiếp / Bỏ qua. Chỉ làm cho màn hình cán bộ
 * dùng hằng ngày; trang khác vẫn dùng bảng hướng dẫn "?" thường.
 */
export interface TourStep {
  /** Giá trị data-tour của phần tử cần chỉ. Thiếu (do quyền) thì tự bỏ qua. */
  target: string;
  title: string;
  text: string;
}

export const PAGE_TOUR: Record<string, TourStep[]> = {
  "/my-work": [
    { target: "time-filter", title: "Lọc theo hạn", text: "Hôm nay / Tuần này / Tháng để xem việc đến hạn đúng kỳ. Muốn xem hết thì bấm Tất cả." },
    { target: "task-list", title: "Danh sách việc", text: "Mỗi thẻ là 1 việc: mã, hạn, tiến độ. Việc mới có nút Nhận việc màu xanh." },
    { target: "fab-add", title: "Tự thêm việc", text: "Nút tròn góc phải để tự tạo việc cho chính mình, không cần qua lãnh đạo." },
  ],
  "/tasks": [
    { target: "search", title: "Tìm việc", text: "Gõ mã hoặc tên — tìm trên toàn hệ thống, không chỉ trang đang xem." },
    { target: "task-table", title: "Bảng việc đơn vị", text: "Hết trang bấm Xem thêm ở cuối bảng. Cột Thao tác của lãnh đạo chỉ hiện khi bạn được phân quyền." },
    { target: "create-btn", title: "Giao việc (lãnh đạo)", text: "Chọn chủ trì, thêm người phối hợp, kèm ảnh/văn bản. Gõ vài từ khóa để AI soạn nháp nếu đã bật." },
  ],
  "/leaves": [
    { target: "add-btn", title: "Báo nghỉ", text: "Chọn loại nghỉ, ngày đi – ngày về, lý do và người bàn giao rồi Gửi." },
    { target: "leave-list", title: "Theo dõi đơn", text: "Đơn Chờ duyệt thì tự Hủy được. Duyệt/Từ chối xong có tin báo về máy." },
  ],
  "/monthly-results": [
    { target: "add-btn", title: "Ghi kết quả tháng", text: "Tìm mã SP để được tính hệ số quy đổi. Không có mã thì để trống, ghi chờ đối chiếu." },
    { target: "summary", title: "Số tổng hợp", text: "Xem tổng giao/hoàn thành, việc thiếu số liệu, việc chờ đối chiếu mã." },
    { target: "export-btns", title: "Xuất báo cáo", text: "2 nút: Bảng 1 + 01A và Kế hoạch 02C. Mở file bằng Excel để kiểm tra." },
  ],
  "/routine": [
    { target: "log-form", title: "Ghi nhật ký ca", text: "Ghi việc đã làm, doanh nghiệp, số container thực tế. Hai chỉ tiêu hồ sơ được để trống." },
    { target: "log-list", title: "Sổ đã ghi", text: "Các ca đã ghi trong kỳ. Ca không phát sinh thì xác nhận Không phát sinh." },
  ],
  "/dashboard": [
    { target: "quick-actions", title: "Thao tác nhanh", text: "Giao việc khẩn, xuất báo cáo, tóm tắt AI — chỉ hiện nút bạn được phép dùng." },
    { target: "kpi-cards", title: "Số điều hành", text: "Việc trễ, chờ duyệt, đơn nghỉ chờ duyệt — bấm vào số để xem chi tiết." },
  ],
  "/plans": [
    { target: "workflow-actions", title: "Trình — Duyệt — Ban hành", text: "Dự thảo thì Trình duyệt. Đã duyệt thì Ban hành hiệu lực. Kế hoạch duyệt rồi chỉ sửa qua Trình duyệt bổ sung." },
    { target: "plan-items", title: "Hạng mục kế hoạch", text: "Bấm vào từng hạng mục để xem đầu việc và nhiệm vụ liên kết." },
  ],
  "/approvals": [
    { target: "filter-tabs", title: "Lọc theo loại", text: "Kế hoạch, kết quả, lùi hạn — bấm từng tab để lọc." },
    { target: "approval-list", title: "Duyệt từng hồ sơ", text: "Mở hồ sơ, xem kỹ rồi Duyệt hoặc Trả lại kèm lý do." },
  ],
  "/reports": [
    { target: "export-btns", title: "Xuất và chốt", text: "Chọn mẫu A (tuần) hoặc B (chi tiết) để tải. Nút Chốt khóa số kỳ — kiểm tra kỹ trước khi bấm." },
    { target: "report-table", title: "Bảng xem trước", text: "Đúng mẫu Excel 8 cột. Nút toàn màn hình ở góc để xem rộng." },
  ],
  "/products": [
    { target: "search", title: "Tìm sản phẩm", text: "Gõ mã SP, tên nhiệm vụ hoặc sản phẩm — gõ từ 2 ký tự." },
    { target: "product-table", title: "Danh mục", text: "Xem hệ số quy đổi từng sản phẩm. Hết trang bấm Sau." },
  ],
  "/calendar": [
    { target: "month-grid", title: "Lịch tháng", text: "Chấm xanh là hạn việc, chấm vàng là nghỉ đã duyệt." },
  ],
  "/roster": [
    { target: "roster-week", title: "Lịch phân công", text: "Ma trận Vị trí × Ngày (trên điện thoại xem theo thẻ ngày). Bấm ô để xem phiếu phân công — Lãnh đạo đơn vị mới sửa được." },
    { target: "roster-toolbar", title: "Bộ lọc & xuất", text: "Lọc theo bộ phận / cán bộ / vị trí. Lãnh đạo đơn vị có thêm nút Danh mục vị trí và Xuất Excel theo kỳ." },
  ],
  "/meetings": [
    { target: "add-btn", title: "Lập biên bản (lãnh đạo)", text: "Lập biên bản họp, rồi thêm từng kết luận bên trong." },
    { target: "meeting-list", title: "Danh sách họp", text: "Mở biên bản để thêm kết luận và chuyển thành việc." },
  ],
  "/docs": [
    { target: "add-btn", title: "Vào sổ (lãnh đạo)", text: "Ghi văn bản đến/đi: số hiệu, trích yếu, người giữ, hạn." },
    { target: "doc-list", title: "Tra cứu", text: "Tìm theo số hiệu hoặc trích yếu. Cần thì chuyển thành việc." },
  ],
  "/notifications": [
    { target: "filter-tabs", title: "Lọc thông báo", text: "Tất cả, giao việc, phê duyệt, nhắc hạn." },
    { target: "push-toggle", title: "Bật tin về máy", text: "Mỗi máy bấm 1 lần để nhận tin cả khi tắt màn hình." },
  ],
};

export function getTour(pathname: string): TourStep[] | null {
  if (PAGE_TOUR[pathname]) return PAGE_TOUR[pathname];
  return null;
}

export const TOUR_START_EVENT = "hqtl-start-tour";
