/**
 * Nội dung hướng dẫn theo màn hình cho nút "?" nổi toàn app.
 * Ngắn gọn kiểu end-user: làm gì → bấm đâu → xong thì sao.
 */
export interface PageHelp {
  title: string;
  bullets: string[];
}

const HELP: Record<string, PageHelp> = {
  "/dashboard": {
    title: "Bảng điều hành",
    bullets: [
      "Nhìn số tổng quan: việc trễ, chờ duyệt, đơn nghỉ chờ duyệt.",
      "Nút Giao nhiệm vụ đột xuất: giao nhanh việc khẩn trong ngày.",
      "Nút Tóm tắt AI (nếu hiện): đọc nhận định nhanh trước giờ giao ban.",
    ],
  },
  "/my-work": {
    title: "Việc của tôi",
    bullets: [
      "Việc mới có nút Nhận việc — bấm để xác nhận đã nhận.",
      "Bấm Cập nhật tiến độ, kéo thanh theo mức 5%, ghi vài dòng kết quả.",
      "Xong việc bấm Báo hoàn thành, chờ lãnh đạo duyệt là xong.",
      "Pill Hôm nay / Tuần / Tháng để lọc theo hạn, Tất cả để xem hết.",
    ],
  },
  "/tasks": {
    title: "Việc đơn vị",
    bullets: [
      "Danh sách việc toàn đơn vị trong phạm vi của bạn.",
      "Ô tìm kiếm tìm theo mã hoặc tên trên toàn hệ thống (không chỉ trang hiện tại).",
      "Hết trang bấm Xem thêm. Lãnh đạo có thêm nút giao việc và duyệt.",
    ],
  },
  "/plans": {
    title: "Kế hoạch tuần",
    bullets: [
      "Trình tự: Dự thảo → Trình duyệt → Phê duyệt → Ban hành hiệu lực.",
      "Kế hoạch đã duyệt chỉ sửa qua nút Trình duyệt bổ sung.",
      "Kỳ đã chốt số thì khóa mọi thêm/sửa trong kỳ đó.",
    ],
  },
  "/approvals": {
    title: "Phê duyệt",
    bullets: [
      "Chỉ hiện việc/kế hoạch/đơn đang chờ bạn duyệt.",
      "Duyệt xong không duyệt lại được. Từ chối phải ghi lý do.",
    ],
  },
  "/routine": {
    title: "Nhật ký ca trực",
    bullets: [
      "Ghi việc đã làm trong ca: nội dung, doanh nghiệp, số container thực tế.",
      "Hai chỉ tiêu hồ sơ không bắt buộc — để trống được.",
      "Ca không phát sinh thì bấm xác nhận Không phát sinh.",
    ],
  },
  "/reports": {
    title: "Báo cáo tuần",
    bullets: [
      "Xem trước đúng mẫu Excel 8 cột trước khi tải.",
      "Nút Chốt chỉ hiện với người được quyền; chốt rồi là khóa số kỳ đó.",
      "Nút toàn màn hình ở góc bảng để xem rộng (bấm lại để thoát).",
    ],
  },
  "/products": {
    title: "Sản phẩm QĐ1277",
    bullets: [
      "Tra mã SP, tên nhiệm vụ, hệ số quy đổi. Gõ từ 2 ký tự để tìm.",
      "Danh mục chỉ để tra cứu — không ai sửa hệ số trên app.",
      "Dùng mã SP khi ghi kết quả tháng để được tính quy đổi.",
    ],
  },
  "/monthly-results": {
    title: "Việc tháng của tôi",
    bullets: [
      "Cuối tháng: bấm Ghi nhận kết quả, chọn mã SP (không có thì để trống, ghi chờ đối chiếu).",
      "Nhập số lượng, ngày xong, số văn bản minh chứng rồi Lưu.",
      "Thẻ điểm là tính thử tham khảo — chưa phải điểm chính thức.",
      "2 nút xuất: Bảng 1 + 01A và Kế hoạch 02C (mở bằng Excel).",
    ],
  },
  "/leaves": {
    title: "Nghỉ phép & công tác",
    bullets: [
      "Bấm Báo nghỉ, chọn loại, ngày, lý do, người bàn giao (nếu có).",
      "Chờ lãnh đạo duyệt — có tin báo về máy, không cần hỏi lại.",
      "Đơn đang chờ thì tự Hủy được.",
    ],
  },
  "/calendar": {
    title: "Lịch công tác",
    bullets: [
      "Chấm xanh là hạn việc, chấm vàng là nghỉ đã duyệt.",
      "Bấm vào ngày để xem chi tiết, bấm việc để nhảy sang nhiệm vụ.",
    ],
  },
  "/roster": {
    title: "Lịch trực ca",
    bullets: [
      "Xem ai trực ngày nào, ca nào, điểm nào.",
      "Chỉ lãnh đạo xếp/xóa. Cờ vàng Trùng nghỉ đã duyệt nghĩa là người đó có đơn nghỉ trùng ngày — báo lãnh đạo đổi ca.",
    ],
  },
  "/meetings": {
    title: "Biên bản giao ban",
    bullets: [
      "Lập biên bản, thêm từng kết luận (gán người, hạn).",
      "Bấm Chuyển thành nhiệm vụ — việc tự sinh, người được giao nhận tin ngay.",
      "Có thể dán biên bản thô để AI tách kết luận (kiểm tra tay trước khi chuyển).",
    ],
  },
  "/docs": {
    title: "Sổ văn bản",
    bullets: [
      "Vào sổ văn bản đến/đi: số hiệu, trích yếu, người giữ, hạn.",
      "Tìm theo số hiệu hoặc trích yếu. Lãnh đạo chuyển văn bản thành việc khi cần.",
    ],
  },
  "/notifications": {
    title: "Thông báo",
    bullets: [
      "Mọi việc giao, duyệt, nhắc hạn đều về đây.",
      "Bấm Bật thông báo về điện thoại để nhận tin cả khi tắt màn hình (mỗi máy bấm 1 lần).",
      "iPhone cần thêm web vào Màn hình chính mới nhận được.",
    ],
  },
};

export function getPageHelp(pathname: string): PageHelp {
  if (HELP[pathname]) return HELP[pathname];
  // Trang chi tiết /tasks/xxx, /meetings/xxx... dùng help của trang cha
  const parent = "/" + pathname.split("/").filter(Boolean)[0];
  if (parent && HELP[parent || ""]) return HELP[parent];
  return {
    title: "Hướng dẫn nhanh",
    bullets: [
      "Nút nào bạn không được dùng thì không hiện — đúng thiết kế, không phải lỗi.",
      "Thao tác xong mà chưa thấy đổi, bấm Làm mới hoặc F5.",
      "Cần giúp thêm: mở Hướng dẫn 5 phút ở menu Tổng quan.",
    ],
  };
}
