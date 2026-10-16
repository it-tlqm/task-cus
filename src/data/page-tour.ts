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
};

export function getTour(pathname: string): TourStep[] | null {
  if (PAGE_TOUR[pathname]) return PAGE_TOUR[pathname];
  return null;
}

export const TOUR_START_EVENT = "hqtl-start-tour";
