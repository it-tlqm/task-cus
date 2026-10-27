/* One-time repair for Vietnamese strings corrupted by shell redirection. */
const fs = require("fs");

const globalPairs = [
  ["ph?n quy?n", "phân quyền"],
  ["Ph?n quy?n", "Phân quyền"],
  ["Nh?t k? h? th?ng", "Nhật ký hệ thống"],
  ["C?u h?nh h? th?ng", "Cấu hình hệ thống"],
  ["B?o v? d? li?u", "Bảo vệ dữ liệu"],
  ["Mã băm m? ki?m tra to?n v?n", "Mã kiểm tra toàn vẹn"],
  ["m? ki?m tra to?n v?n", "mã kiểm tra toàn vẹn"],
  ["M? ki?m tra to?n v?n", "Mã kiểm tra toàn vẹn"],
  ["băm m? ki?m tra to?n v?n", "băm mã kiểm tra toàn vẹn"],
  ["nh?t k? h? th?ng", "nhật ký hệ thống"],
  ["H?I QUAN T? L?NG", "HẢI QUAN TÀ LÙNG"],
];

const filePairs = {
  "src/app/my-work/page.tsx": [
    ["C?ng vi?c c?a t?i", "Công việc của tôi"],
    ["S?n s?ng", "Sẵn sàng"],
    ["? Ca ch?nh 07:30 - 17:00", "· Ca chính 07:30 - 17:00"],
    ["L?m m?i", "Làm mới"],
    ["H?m nay (", "Hôm nay ("],
    ["T?t c?", "Tất cả"],
    ["C?n x? l?", "Cần xử lý"],
    ["??u vi?c", "đầu việc"],
    ["?u ti?n cao", "ưu tiên cao"],
    ["Kh?ng c? vi?c g?p", "Không có việc gấp"],
    ["S?p ??n h?n", "Sắp đến hạn"],
    ["Qu? h?n", "Quá hạn"],
    ["Ch?m ${myStats.maxOverdueDays} ng?y", "Chậm ${myStats.maxOverdueDays} ngày"],
    ["??ng h?n", "Đúng hạn"],
    ["Ch? ph? duy?t", "Chờ phê duyệt"],
    ["?? n?p", "đã nộp"],
    ["Ch? Tr??ng BP k?", "Chờ Trưởng BP ký"],
  ],
  "src/app/reports/page.tsx": [
    ["K? {periodLabels.weekShort}: d? li?u ?ang m?", "Kỳ {periodLabels.weekShort}: dữ liệu đang mở"],
    ["Tr?c tuy?n", "Trực tuyến"],
    ["Tu?n 40: ?? ch?t s? li?u", "Tuần 40: đã chốt số liệu"],
    ["?? ch?t", "Đã chốt"],
    ["B?o c?o", "Báo cáo"],
    ["M?u b?o c?o", "Mẫu báo cáo"],
    ["Kho ?? ch?t", "Kho đã chốt"],
    ["Mã băm m? ki?m tra to?n v?n", "Mã kiểm tra toàn vẹn"],
    ["m? ki?m tra to?n v?n", "mã kiểm tra toàn vẹn"],
    ["M? ki?m tra to?n v?n", "Mã kiểm tra toàn vẹn"],
    ["băm m? ki?m tra to?n v?n", "băm mã kiểm tra toàn vẹn"],
    ["bảng nh?t k? h? th?ng hệ thống", "bảng nhật ký hệ thống"],
    ["Mã Kiểm Tra Toàn Vẹn m? ki?m tra to?n v?n", "Mã kiểm tra toàn vẹn"],
    ["Mã băm m? ki?m tra to?n v?n (64 hex)", "Mã kiểm tra toàn vẹn (64 hex)"],
    ["Mã Kiểm Tra Toàn Vẹn m? ki?m tra to?n v?n (64 hex lowercase)", "Mã kiểm tra toàn vẹn (64 hex lowercase)"],
  ],
  "src/app/admin/audit/page.tsx": [
    ["C?u h?nh h? th?ng", "Cấu hình hệ thống"],
    ["Nh?t k? h? th?ng", "Nhật ký hệ thống"],
    ["B?o v? d? li?u", "Bảo vệ dữ liệu"],
    ["Theo d?i thao t?c thay ??i d? li?u, c?p ph?t quy?n, xu?t b?o c?o v? truy c?p b?t th??ng.", "Theo dõi thao tác thay đổi dữ liệu, cấp phát quyền, xuất báo cáo và truy cập bất thường."],
  ],
  "src/app/admin/permissions/page.tsx": [
    ["Ph?n quy?n", "Phân quyền"],
    ["Qu?n tr?", "Quản trị"],
    ["Vai tr?, quy?n theo ch?c n?ng, ph?m vi qu?n l? v? nh?t k? thay ??i.", "Vai trò, quyền theo chức năng, phạm vi quản lý và nhật ký thay đổi."],
  ],
  "src/app/admin/system/page.tsx": [
    ["Phân quyền ph?n quy?n", "Phân quyền"],
    ["Ma trận Phân quyền (ph?n quy?n)", "Ma trận phân quyền"],
    ["MA TRẬN PHÂN QUYỀN ph?n quy?n", "MA TRẬN PHÂN QUYỀN"],
    ["ma trận phân quyền ph?n quy?n", "ma trận phân quyền"],
    ["ph?n quy?n", "phân quyền"],
  ],
  "src/app/admin/organization/page.tsx": [
    ["ph?n quy?n", "phân quyền"],
  ],
  "src/app/login/page.tsx": [
    ["H?I QUAN T? L?NG", "HẢI QUAN TÀ LÙNG"],
  ],
};

for (const [file, pairs] of Object.entries(filePairs)) {
  if (!fs.existsSync(file)) continue;
  let text = fs.readFileSync(file, "utf8");
  for (const [from, to] of [...pairs, ...globalPairs]) text = text.split(from).join(to);
  fs.writeFileSync(file, text);
}
console.log("encoding repair done");
