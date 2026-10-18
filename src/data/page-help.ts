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
  "/giao-ban": {
    title: "Số liệu giao ban",
    bullets: [
      "Số liệu tự cộng từ các bản ghi nhập theo ngày: Tuần – Tháng – Quý – Năm.",
      "Chọn kỳ ở thanh phía trên; cột đang xem được tô nổi bật.",
      "Chip % là tỷ lệ hoàn thành so với chỉ tiêu giao (do lãnh đạo cấu hình).",
      "Nhãn 'Thiếu N ngày' = các ngày trong tuần chưa có số liệu (rê chuột xem ngày).",
      "Tab Nhận xét: nhập nội dung theo mục (II, III…) cho đúng kỳ đang chọn.",
    ],
  },
  "/giao-ban/nhap": {
    title: "Nhập số liệu",
    bullets: [
      "Mặc định là hôm nay; đổi ngày bằng ô ngày hoặc mũi tên trái/phải.",
      "Chỉ hiện các chỉ tiêu bạn được phân công — ô bị khóa là số liệu đã gửi/xác nhận.",
      "Nhập xong bấm nút Lưu số liệu ở thanh dưới cùng (chỉ lưu các ô đã thay đổi).",
      "Chỉ tiêu có nhãn CẦN KIỂM TRA: sau khi nhập bấm Gửi kiểm tra để lãnh đạo xác nhận.",
      "Biểu tượng đồng hồ cạnh ô số = xem lịch sử sửa (giá trị cũ → mới, người sửa).",
    ],
  },
  "/giao-ban/cau-hinh": {
    title: "Cấu hình số liệu giao ban",
    bullets: [
      "Nhóm & chỉ tiêu: thêm/sửa/ẩn chỉ tiêu, đơn vị hiển thị, phân loại (Ô tô, Than cốc…), công thức tự tính.",
      "Quy trình kiểm tra bật/tắt bằng ô 'Cần kiểm tra' — không cần sửa code.",
      "Chỉ tiêu giao: nhập BTC/UBND/KH tháng… để hệ thống tự tính %.",
      "Mốc lũy kế: nhập giá trị đã có đến một ngày — hệ thống chỉ cộng phần sau mốc (chống cộng trùng).",
      "Phân công nhập: chọn người + phạm vi (nhóm/chỉ tiêu) + số ngày được nhập bù.",
      "Cấu trúc báo cáo: sắp xếp các khối của báo cáo giao ban (tiêu đề / bảng số liệu / nội dung) — thứ tự nhỏ hiển thị trước.",
    ],
  },
  "/giao-ban/bao-cao": {
    title: "Báo cáo giao ban (xuất Word)",
    bullets: [
      "Chọn kỳ (Tuần/Tháng/Quý/Năm) — báo cáo tự ghép từ số liệu đã nhập + nội dung nhận xét của kỳ đó.",
      "Dấu '…' trong bảng = chưa nhập số liệu (không hiển thị 0 giả).",
      "Sửa Tiêu đề/Phụ đề/Thời gian họp nếu cần, bấm 'Tải Word' để xuất file .docx theo mẫu.",
      "Lãnh đạo bấm 'Lưu phiên bản' để chốt: bản đã lưu là ảnh chụp, số liệu sửa sau không làm thay đổi bản đã xuất.",
      "Cấu trúc các mục trong báo cáo sửa tại Cấu hình → tab 'Cấu trúc báo cáo'.",
    ],
  },
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
    title: "Phân công nhiệm vụ & lịch trực",
    bullets: [
      "Bám biểu mẫu Sổ phân công nhiệm vụ: xem theo tuần (ma trận Vị trí × Ngày) hoặc theo ngày (phiếu in đúng mẫu).",
      "Lãnh đạo đơn vị bấm vào ô để phân công; đổi người thực hiện phải ghi lý do — hệ thống lưu vết đầy đủ.",
      "Cảnh báo vàng (không tự xóa): người có đơn nghỉ đã duyệt trùng ngày, hoặc một người được phân công nhiều vị trí trong ngày.",
      "Nút Danh mục vị trí (lãnh đạo đơn vị) và Xuất Excel theo kỳ/ngày giữ đúng cấu trúc mẫu để in.",
    ],
    modals: [
      { name: "Phiếu phân công", tip: "Chọn cán bộ cho từng vị trí của ngày; cảnh báo nghỉ phép / trùng phân công hiện ngay khi chọn, trước khi lưu." },
      { name: "Danh mục vị trí", tip: "Sửa tên/mô tả vị trí không làm thay đổi lịch sử phân công đã ghi." },
      { name: "Xuất Excel", tip: "Chọn Từ ngày – Đến ngày; mỗi ngày một khối in riêng, không trộn ngày." },
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
