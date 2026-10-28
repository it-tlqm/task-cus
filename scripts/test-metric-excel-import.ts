import {
  buildImportTemplateRows,
  normalizeKey,
  parseImportNumber,
  parseImportRows,
  type ImportMetricOption,
} from "../src/lib/metric-excel-import";

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "[PASS]" : "[FAIL]"} ${label}${ok || detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  if (ok) pass++;
  else fail++;
}

console.log("=== Chuẩn hoá & đọc số ===");
check("Bỏ dấu tiếng Việt", normalizeKey("Mã chỉ tiêu") === "ma chi tieu");
check("Số có dấu chấm hàng nghìn", parseImportNumber("1.363.106.886.324") === "1363106886324");
check("Số thập phân kiểu Việt Nam", parseImportNumber("236.643.983,94") === "236643983.94");
check("Số thập phân kiểu Excel", parseImportNumber("1234.56") === "1234.56");
check("Số có khoảng trắng", parseImportNumber("1 234") === "1234");
check("Số âm", parseImportNumber("-26,92") === "-26.92");
check("Chuỗi không phải số", parseImportNumber("abc") === null);
check("Chuỗi rỗng", parseImportNumber("") === null);

const metrics: ImportMetricOption[] = [
  {
    id: "m-tax",
    code: "THU_NSNN",
    name: "Thu NSNN",
    canEnter: true,
    values: [{ classificationId: "", label: "" }],
  },
  {
    id: "m-car",
    code: "OTO_XE",
    name: "Xe ô tô",
    canEnter: true,
    values: [
      { classificationId: "c-car", label: "Xe ô tô" },
      { classificationId: "c-other", label: "Hàng hóa khác" },
    ],
  },
  {
    id: "m-usd",
    code: "USD",
    name: "Thu USD",
    canEnter: true,
    values: [{ classificationId: "", label: "" }],
  },
  {
    id: "m-hidden",
    code: "AN",
    name: "Chỉ tiêu ẩn",
    canEnter: false,
    values: [{ classificationId: "", label: "" }],
  },
];

console.log("\n=== Đọc bảng Excel ===");
const parsed = parseImportRows(
  [
    { "Mã chỉ tiêu": "THU_NSNN", "Giá trị": "265.075.753.626" },
    { "Ma chi tieu": "OTO_XE", "Phan loai": "Xe ô tô", "Gia tri": "604" },
    { "Mã chỉ tiêu": "OTO_XE", "Phân loại": "hàng hóa khác", "Giá trị": "1.234,5", "Ghi chú": "tạm tính" },
    { "Mã chỉ tiêu": "THU_NSNN", "Giá trị": "" },
    { "Mã chỉ tiêu": "KHONG_CO", "Giá trị": "10" },
    { "Mã chỉ tiêu": "OTO_XE", "Giá trị": "10" },
    { "Mã chỉ tiêu": "OTO_XE", "Phân loại": "Hàng hóa khác", "Giá trị": "10" },
    { "Mã chỉ tiêu": "OTO_XE", "Phân loại": "Sai loại", "Giá trị": "10" },
    { "Mã chỉ tiêu": "USD", "Giá trị": "mười" },
    { "Mã chỉ tiêu": "AN", "Giá trị": "5" },
  ],
  metrics
);

check("Nhận đúng số dòng hợp lệ", parsed.rows.length === 3, parsed.rows.map((r) => r.code));
check("Đọc đúng chỉ tiêu một phân loại", parsed.rows[0]?.metricId === "m-tax" && parsed.rows[0]?.value === "265075753626");
check("Đọc đúng phân loại có dấu", parsed.rows[1]?.classificationId === "c-car");
check("Đọc đúng phân loại không dấu", parsed.rows[2]?.classificationId === "c-other");
check("Giữ ghi chú", parsed.rows[2]?.note === "tạm tính");
check("Bỏ qua dòng trống", parsed.skipped >= 1, parsed.skipped);
check("Báo mã không tồn tại", parsed.errors.some((e) => e.includes("KHONG_CO")));
check("Báo thiếu phân loại khi có nhiều loại", parsed.errors.some((e) => e.includes("nhiều phân loại")));
check("Báo phân loại sai", parsed.errors.some((e) => e.includes("Sai loại")));
check("Báo trùng dòng", parsed.errors.some((e) => e.includes("bị trùng")));
check("Chặn chỉ tiêu không có quyền nhập", parsed.errors.some((e) => e.includes('"AN"')));
check("Sai số bị từ chối", parsed.errors.some((e) => e.includes("không phải số")));

console.log("\n=== File mẫu ===");
const template = buildImportTemplateRows(metrics, (id) => (id === "m-tax" ? "đồng" : "xe"));
check("Chỉ sinh dòng cho chỉ tiêu được nhập", template.length === 4, template.length);
check("Có cột giá trị để trống", template.every((row) => row["Giá trị"] === ""));
check("Có đơn vị hiển thị", template.some((row) => row["Đơn vị"] === "đồng"));

console.log(`\nKẾT QUẢ: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
