"use client";

import React from "react";
import Link from "next/link";

/**
 * Hướng dẫn 5 phút cho end user: 3 luồng chính + giải đáp nhanh.
 * Ngôn từ dân dã, không thuật ngữ kỹ thuật.
 */
const FLOWS = [
  {
    title: "1. Nhận việc và báo xong (mỗi ngày)",
    icon: "assignment_ind",
    steps: [
      "Mở Việc của tôi — việc mới có nút Nhận việc, bấm để xác nhận.",
      "Bấm Cập nhật tiến độ, kéo thanh theo mức 5%, ghi vài dòng kết quả.",
      "Xong việc bấm Báo hoàn thành, chờ lãnh đạo duyệt là xong.",
    ],
    link: { href: "/my-work", label: "Mở Việc của tôi" },
  },
  {
    title: "2. Xin nghỉ / đi công tác",
    icon: "beach_access",
    steps: [
      "Mở Nghỉ phép & công tác, bấm Báo nghỉ, chọn loại, ngày, lý do.",
      "Ghi người bàn giao nếu có việc dở dang.",
      "Chờ lãnh đạo duyệt — có tin báo về máy, không cần hỏi lại.",
    ],
    link: { href: "/leaves", label: "Mở Nghỉ phép" },
  },
  {
    title: "3. Ghi kết quả tháng (cuối tháng)",
    icon: "assessment",
    steps: [
      "Mở Việc tháng của tôi, bấm Ghi nhận kết quả.",
      "Gõ tên sản phẩm để chọn mã SP đúng (không có mã thì để trống, ghi chú chờ đối chiếu).",
      "Nhập số lượng, ngày xong, số văn bản minh chứng rồi Lưu.",
    ],
    link: { href: "/monthly-results", label: "Mở Việc tháng" },
  },
];

const FAQ = [
  {
    q: "Không thấy nút Duyệt / Giao việc?",
    a: "Nút chỉ hiện với tài khoản được phân quyền. Công chức chỉ thấy việc của mình — đúng thiết kế, không phải lỗi.",
  },
  {
    q: "Bấm mãi mà việc không mất khỏi danh sách?",
    a: "Việc chỉ xong khi lãnh đạo duyệt. Báo hoàn thành xong thì chờ — có tin báo khi được duyệt.",
  },
  {
    q: "Quên mật khẩu?",
    a: "Báo trực tiếp lãnh đạo đơn vị hoặc quản trị hệ thống để đặt lại — không tự đăng ký tài khoản mới.",
  },
  {
    q: "Số liệu tháng sai, muốn sửa?",
    a: "Mở lại bản ghi trong Việc tháng và Sửa — mọi lần sửa đều lưu vết, kỳ đã chốt thì không sửa được.",
  },
];

export default function GuidePage() {
  return (
    <div className="flex flex-col w-full p-4 lg:p-6 space-y-4 pb-20 max-w-3xl">
      <div>
        <span className="px-2 py-0.5 text-xs font-semibold rounded bg-teal-100 text-teal-900 border border-teal-200">
          Đọc 1 lần là dùng được
        </span>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">Hướng dẫn sử dụng 5 phút</h1>
        <p className="text-sm text-slate-600">Phần mềm có 3 việc chính dưới đây. Ngoài ra cứ bấm vào xem — nút nào mình không được dùng thì không hiện.</p>
      </div>

      {FLOWS.map((f) => (
        <section key={f.title} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col gap-2">
          <h2 className="font-bold text-slate-900 flex items-center gap-2">
            <span className="material-symbols-outlined text-teal-800">{f.icon}</span>
            {f.title}
          </h2>
          <ol className="list-decimal list-inside text-sm text-slate-700 flex flex-col gap-1">
            {f.steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
          <Link href={f.link.href} className="self-start px-3 py-1.5 rounded-lg bg-teal-800 text-white text-xs font-bold">
            {f.link.label} ›
          </Link>
        </section>
      ))}

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col gap-2">
        <h2 className="font-bold text-slate-900">Hỏi nhanh đáp gọn</h2>
        {FAQ.map((item) => (
          <div key={item.q} className="text-sm">
            <p className="font-bold text-slate-900">{item.q}</p>
            <p className="text-slate-600">{item.a}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
