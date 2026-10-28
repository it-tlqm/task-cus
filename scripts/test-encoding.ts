import fs from "fs";
import path from "path";

const root = process.cwd();
const files = [
  "src/app/login/page.tsx",
  "src/app/my-work/page.tsx",
  "src/app/reports/page.tsx",
  "src/app/admin/audit/page.tsx",
  "src/app/admin/permissions/page.tsx",
  "src/app/admin/system/page.tsx",
  "src/app/admin/organization/page.tsx",
];

const forbidden = [
  "C?ng vi?c",
  "S?n s?ng",
  "C?n x? l?",
  "S?p ??n h?n",
  "Qu? h?n",
  "Ch? ph? duy?t",
  "24 gi?",
  "h? s?",
  "T?t c?",
  "?u ti?n",
  "Kh?ng c? vi?c",
  "ph?n quy?n",
  "Ph?n quy?n",
  "Qu?n tr?",
  "m? ki?m tra",
  "M? ki?m tra",
  "b?ng nh?t",
  "Nh?t k? h? th?ng",
  "B?o v? d? li?u",
  "Tr?c tuy?n",
  "M?u b?o c?o",
  "H?I QUAN",
  "T? L?NG",
  "C?u h?nh h? th?ng",
];

let failures = 0;
function check(label: string, ok: boolean) {
  console.log(`${ok ? "[PASS]" : "[FAIL]"} ${label}`);
  if (!ok) failures++;
}

for (const file of files) {
  const full = path.join(root, file);
  const source = fs.readFileSync(full, "utf8");
  check(`${file} không có ký tự lỗi U+FFFD`, !source.includes("\uFFFD"));
  for (const token of forbidden) {
    if (source.includes(token)) {
      check(`${file} không còn "${token}"`, false);
    }
  }
}

const myWork = fs.readFileSync(
  path.join(root, "src/app/my-work/page.tsx"),
  "utf8"
);
check(
  "My Work hiển thị đúng tên người dùng và bộ phận",
  (myWork.includes("{currentUser.fullName} · {currentUser.unitName}") ||
    myWork.includes("{currentUser.fullName} · {currentUser.personCode} · {currentUser.unitName}")) &&
    !myWork.includes("{currentUser.fullName} ? {currentUser.unitName}")
);
check("My Work có nhãn 24 giờ", myWork.includes("24 giờ"));
check("My Work có nhãn hồ sơ", myWork.includes("hồ sơ"));

const login = fs.readFileSync(path.join(root, "src/app/login/page.tsx"), "utf8");
check("Đăng nhập có tên đơn vị đúng", login.includes("HẢI QUAN TÀ LÙNG"));

console.log(`\nKẾT QUẢ: ${failures === 0 ? "PASS" : "FAIL"} (${failures} lỗi)`);
process.exit(failures === 0 ? 0 : 1);
