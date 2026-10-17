/**
 * Nội dung hướng dẫn theo màn hình cho nút "?" nổi toàn app.
 * Ngắn gọn kiểu end-user: làm gì → bấm đâu → xong thì sao.
 */
export interface PageHelp {
  title: string;
  bullets: string[];
  modals?: Array<{ name: string; tip: string }>;
}

export const HELP: Record<string, PageHelp> = {
  "/plans": {
    title: "Kế hoạch tuần",
    bullets: [
      "Trình tự: Dự thảo → Trình duyệt → Phê duyệt → Ban hành hiệu lực.",
      "Kế hoạch đã duyệt chỉ sửa qua nút Trình duyệt bổ sung.",
      "Kỳ đã chốt số thì khóa mọi thêm/sửa trong kỳ đó.",
    ],
    modals: [
      { name: "Thêm đầu việc", tip: "Chọn từ 48 mẫu hoặc tự ghi. Kế hoạch đã duyệt thì nút này chặn — dùng Trình duyệt bổ sung." },
      { name: "Trả lại", tip: "Lãnh đạo ghi rõ lý do để người lập sửa lại." },
      { name: "Trình duyệt bổ sung", tip: "Mở khóa kế hoạch đã duyệt để thêm/bớt việc, lịch sử phiên bản được niêm lại." },
    ],
  },
  "/approvals": {
    title: "Phê duyệt",
    bullets: [
      "Chỉ hiện việc/kế hoạch/đơn đang chờ bạn duyệt.",
      "Duyệt xong không duyệt lại được. Từ chối phải ghi lý do.",
    ],
    modals: [
      { name: "Duyệt kế hoạch", tip: "Xem kỹ hạng mục rồi mới ký. Trả lại thì ghi ý kiến chỉ đạo." },
      { name: "Duyệt lùi hạn", tip: "Đồng ý thì hạn việc tự đổi sang hạn mới, có ghi vết." },
    ],
  },
  "/routine": {
    title: "Nhật ký ca trực",
    bullets: [
      "Ghi việc đã làm trong ca: nội dung, doanh nghiệp, số container thực tế.",
      "Hai chỉ tiêu hồ sơ không bắt buộc — để trống được.",
      "Ca không phát sinh thì bấm xác nhận Không phát sinh.",
    ],
    modals: [
      { name: "Ghi nhật ký", tip: "Số container để trống, nhập số thật — không điền sẵn." },
      { name: "Form Builder (quản trị)", tip: "Chỉ quản trị động vào mẫu biểu. Đổi trường bắt buộc ảnh hưởng cả đơn vị." },
    ],
  },
  "/reports": {
    title: "Báo cáo tuần",
    bullets: [
      "Xem trước đúng mẫu Excel 8 cột trước khi tải.",
      "Nút Chốt chỉ hiện với người được quyền; chốt rồi là khóa số kỳ đó.",
      "Nút toàn màn hình ở góc bảng để xem rộng (bấm lại để thoát).",
    ],
    modals: [
      { name: "Chốt số liệu", tip: "Chốt là khóa kỳ + băm SHA-256 chống sửa. Kiểm tra kỹ số trước khi bấm." },
      { name: "Trình tạo mẫu", tip: "Đổi cách gom nhóm và nhãn hiển thị của file xuất. Lưu cấu hình để dùng chung." },
    ],
  },
  "/reports/excel": {
    title: "Xuất Excel",
    bullets: [
      "Mẫu A là kế hoạch tuần gốc 8 cột, Mẫu B là chi tiết từng đầu việc.",
      "Chọn đúng kỳ rồi mới tải. File lỗi mở thì báo quản trị.",
    ],
  },
  "/reports/snapshots": {
    title: "Số liệu đã chốt",
    bullets: [
      "Mỗi kỳ chốt 1 bản, có mã băm SHA-256 để đối soát.",
      "Bấm vào bản để xem chi tiết và tải lại file đúng thời điểm chốt.",
      "Bản đã chốt không ai sửa/xóa được.",
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
    modals: [
      { name: "Ghi nhận kết quả", tip: "Tìm mã SP bằng vài từ khóa. Hệ số được chốt theo danh mục lúc ghi, sau này đổi hệ số cũng không ảnh hưởng bản ghi cũ." },
    ],
  },
  "/leaves": {
    title: "Nghỉ phép & công tác",
    bullets: [
      "Bấm Báo nghỉ, chọn loại, ngày, lý do, người bàn giao (nếu có).",
      "Chờ lãnh đạo duyệt — có tin báo về máy, không cần hỏi lại.",
      "Đơn đang chờ thì tự Hủy được.",
    ],
    modals: [
      { name: "Báo nghỉ", tip: "Ghi rõ ngày đi – ngày về và việc bàn giao để người nhận biết làm gì." },
      { name: "Từ chối (lãnh đạo)", tip: "Bắt buộc ghi lý do để cán bộ biết đường sửa/báo lại." },
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
    modals: [
      { name: "Xếp lịch trực", tip: "Chọn đúng ngày, ca, điểm trực. Lưu xong nếu trùng nghỉ sẽ báo vàng ngay." },
    ],
  },
  "/meetings": {
    title: "Biên bản giao ban",
    bullets: [
      "Lập biên bản, thêm từng kết luận (gán người, hạn).",
      "Bấm Chuyển thành nhiệm vụ — việc tự sinh, người được giao nhận tin ngay.",
      "Có thể dán biên bản thô để AI tách kết luận (kiểm tra tay trước khi chuyển).",
    ],
    modals: [
      { name: "Thêm kết luận", tip: "Ghi 1 việc 1 dòng, gán chủ trì + hạn luôn để chuyển nhanh." },
      { name: "Xóa nhiệm vụ trùng", tip: "Chỉ dùng khi 2 việc giống hệt nhau. Ghi rõ giữ lại mã nào." },
    ],
  },
  "/docs": {
    title: "Sổ văn bản",
    bullets: [
      "Vào sổ văn bản đến/đi: số hiệu, trích yếu, người giữ, hạn.",
      "Tìm theo số hiệu hoặc trích yếu. Lãnh đạo chuyển văn bản thành việc khi cần.",
    ],
    modals: [
      { name: "Vào sổ", tip: "Số hiệu + trích yếu là bắt buộc. Gán người xử lý thì họ nhận tin ngay." },
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
  "/admin/organization": {
    title: "Tổ chức & Nhân sự (quản trị)",
    bullets: [
      "Đổi tên, thêm/xóa đơn vị — đơn vị còn người hoặc dữ liệu thì không xóa được.",
      "Thêm cán bộ, cấp tài khoản, đổi vai trò trong phạm vi. Mọi thao tác đều ghi audit.",
      "Đổi vai trò xong người đó phải đăng nhập lại mới có hiệu lực.",
    ],
    modals: [
      { name: "Cấp tài khoản", tip: "1 người 1 tài khoản. Mật khẩu mới báo riêng, không gửi vào nhóm chat." },
      { name: "Điều chuyển", tip: "Chuyển đơn vị thì quyền theo đơn vị cũ tự hết hiệu lực." },
    ],
  },
  "/admin/catalog": {
    title: "Mẫu công việc tuần (quản trị)",
    bullets: [
      "48 mẫu dùng chung khi lập kế hoạch. Ngừng mẫu nào thì kế hoạch cũ không ảnh hưởng.",
      "Duyệt chính thức toàn bộ khi danh mục đã chuẩn.",
    ],
  },
  "/admin/forms": {
    title: "Biểu mẫu & Quy trình (quản trị)",
    bullets: [
      "Sửa mẫu nhật ký ca: thêm/bớt trường, đổi bắt buộc hay không.",
      "Đổi xong thì ca mới dùng mẫu mới, ca cũ giữ nguyên.",
    ],
  },
  "/admin/system": {
    title: "Cấu hình hệ thống (quản trị)",
    bullets: [
      "Đổi giờ nhắc hạn, tên đơn vị hiển thị, bật/tắt tính năng.",
      "Đụng vào đây ảnh hưởng cả hệ thống — đổi xong kiểm tra lại ngay.",
    ],
  },
  "/admin/audit": {
    title: "Nhật ký hệ thống (quản trị)",
    bullets: [
      "Tra ai làm gì, lúc nào: đăng nhập, giao việc, duyệt, xuất file...",
      "Lọc theo người, hành động, thời gian. Chỉ xem, không sửa/xóa được.",
    ],
  },
  "/admin/feedback": {
    title: "Góp ý & Báo lỗi (lãnh đạo, kỹ thuật)",
    bullets: [
      "Toàn bộ phản hồi công chức gửi từ nút Góp ý trong app — kèm màn hình lúc gửi để soi đúng chỗ.",
      "Xem xong bấm Đánh dấu đã xử lý (ghi chú tùy chọn) để không sót; còn vướng thì Mở lại.",
      "Tab Mới / Đã xử lý / Tất cả có số đếm; ô tìm kiếm gõ không dấu vẫn ra.",
    ],
  },
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
    modals: [
      { name: "Cập nhật tiến độ", tip: "Kéo thanh 5%, ghi kết quả. Tick trình duyệt (hoặc chọn 100%) thì việc sang Chờ duyệt." },
      { name: "Sửa giao việc (lãnh đạo)", tip: "Đổi chủ trì, phối hợp, hạn, ưu tiên — lưu đúng bản ghi cũ, ghi vết ai sửa." },
      { name: "Thêm việc cá nhân", tip: "Tự tạo việc cho chính mình, không cần qua lãnh đạo." },
    ],
  },
  "/tasks": {
    title: "Việc đơn vị",
    bullets: [
      "Danh sách việc toàn đơn vị trong phạm vi của bạn.",
      "Ô tìm kiếm tìm theo mã hoặc tên trên toàn hệ thống (không chỉ trang hiện tại).",
      "Hết trang bấm Xem thêm. Lãnh đạo có thêm nút giao việc và duyệt.",
    ],
    modals: [
      { name: "Giao việc mới", tip: "Chọn chủ trì + thêm người phối hợp (không trùng, không trùng chủ trì). Kèm ảnh/văn bản nếu có. Gõ vài từ khóa, AI soạn nháp giúp khi đã bật." },
      { name: "Duyệt kết quả", tip: "Chỉ hiện việc đang Chờ duyệt. Duyệt xong không duyệt lại được." },
      { name: "Gia hạn / Đôn đốc", tip: "Duyệt đề nghị lùi hạn của cán bộ, hoặc nhắc việc trễ." },
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
      "Gặp vướng mắc: bấm nút Góp ý (góc phải dưới màn hình) để báo lỗi/góp ý — lãnh đạo và kỹ thuật nhận được ngay.",
      "Cần giúp thêm: mở Hướng dẫn 5 phút ở menu Tổng quan.",
    ],
  };
}
