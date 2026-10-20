"use client";

import React, { useState } from "react";
import Link from "next/link";
import { HELP } from "@/data/page-help";

/**
 * Sơ đồ hướng dẫn tương tác: bấm vào từng phần của hệ thống
 * để xem ngay hướng dẫn chi tiết phần đó.
 */
const MAP: Array<{ hub: string; icon: string; routes: string[] }> = [
  {
    hub: "Tổng quan & điều hành",
    icon: "dashboard",
    routes: ["/dashboard", "/giao-ban", "/giao-ban/nhap", "/giao-ban/bao-cao", "/meetings"],
  },
  { hub: "Nhật ký công việc", icon: "menu_book", routes: ["/my-work", "/notifications"] },
  {
    hub: "Lập kế hoạch & công việc",
    icon: "account_tree",
    routes: ["/plans", "/tasks", "/approvals"],
  },
  {
    hub: "Trực ca & nghiệp vụ",
    icon: "badge",
    routes: ["/routine", "/roster", "/calendar", "/leaves", "/docs"],
  },
  {
    hub: "Kết quả & báo cáo",
    icon: "query_stats",
    routes: ["/monthly-results", "/reports", "/reports/excel", "/reports/snapshots"],
  },
  { hub: "Danh mục & quy định", icon: "inventory_2", routes: ["/products"] },
  {
    hub: "Quản trị hệ thống",
    icon: "admin_panel_settings",
    routes: [
      "/admin/catalog",
      "/admin/organization",
      "/admin/forms",
      "/giao-ban/cau-hinh",
      "/admin/system",
      "/admin/audit",
      "/admin/feedback",
    ],
  },
];

const FLOW_LABEL: Record<string, string> = {
  "/my-work": "Nhật ký công việc",
  "/tasks": "Công việc phát sinh",
  "/monthly-results": "Kết quả công tác tháng",
  "/plans": "Lập kế hoạch",
  "/approvals": "Phê duyệt",
  "/meetings": "Biên bản giao ban",
  "/docs": "Sổ văn bản",
  "/routine": "Nhật ký tác nghiệp",
  "/calendar": "Lịch công tác",
  "/roster": "Lịch trực",
  "/leaves": "Nghỉ phép & công tác",
  "/reports": "Báo cáo & tổng hợp",
  "/reports/excel": "Xuất Excel",
  "/reports/snapshots": "Số đã chốt",
  "/products": "Sản phẩm QĐ1277",
  "/dashboard": "Bảng điều hành",
  "/notifications": "Thông báo",
  "/giao-ban": "Số liệu giao ban",
  "/giao-ban/nhap": "Nhập số liệu giao ban",
  "/giao-ban/bao-cao": "Báo cáo giao ban",
  "/giao-ban/cau-hinh": "Cấu hình số liệu giao ban",
  "/admin/organization": "Tổ chức & nhân sự",
  "/admin/catalog": "Danh mục công việc",
  "/admin/forms": "Biểu mẫu & quy trình",
  "/admin/system": "Cấu hình hệ thống",
  "/admin/audit": "Nhật ký hệ thống",
  "/admin/feedback": "Góp ý & báo lỗi",
};

export default function GuidePage() {
  const [selected, setSelected] = useState<string>("/my-work");
  const help = HELP[selected];

  return (
    <div className="flex flex-col w-full p-4 lg:p-6 space-y-4 pb-20 max-w-3xl">
      <div>
        <span className="px-2 py-0.5 text-xs font-semibold rounded bg-teal-100 text-teal-900 border border-teal-200">
          Sơ đồ sử dụng
        </span>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">Bấm vào từng phần để xem hướng dẫn</h1>
        <p className="text-sm text-slate-600">Chạm vào ô nào, hướng dẫn chi tiết phần đó hiện ngay bên dưới.</p>
      </div>

      <div className="flex flex-col gap-3">
        {MAP.map((g) => (
          <section key={g.hub} className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-teal-800 text-[18px]">{g.icon}</span>
              {g.hub}
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {g.routes.map((r) => (
                <button
                  key={r}
                  onClick={() => {
                    setSelected(r);
                    document.getElementById("guide-detail")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                  }}
                  className={`px-3 py-2 rounded-lg text-xs font-bold border transition-all active:scale-95 ${
                    selected === r
                      ? "bg-teal-800 text-white border-teal-800 shadow"
                      : "bg-slate-50 text-slate-700 border-slate-200"
                  }`}
                >
                  {FLOW_LABEL[r] || r}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      {help && (
        <section id="guide-detail" className="bg-teal-50/60 rounded-xl border-2 border-teal-700 shadow-sm p-4 flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-bold text-slate-900">{help.title}</h2>
            <Link
              href={selected}
              className="px-3 py-1.5 rounded-lg bg-teal-800 text-white text-xs font-bold shrink-0"
            >
              Mở trang này ›
            </Link>
          </div>
          <ol className="list-decimal list-inside text-sm text-slate-800 flex flex-col gap-1.5">
            {help.bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ol>
          {help.modals && help.modals.length > 0 && (
            <div className="flex flex-col gap-1.5 pt-2 border-t border-teal-200">
              <span className="text-xs font-bold text-teal-900 uppercase">Trong các cửa sổ thao tác</span>
              {help.modals.map((m) => (
                <p key={m.name} className="text-sm text-slate-800">
                  <strong>{m.name}: </strong>
                  <span className="text-slate-600">{m.tip}</span>
                </p>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col gap-2">
        <h2 className="font-bold text-slate-900">Hỏi nhanh đáp gọn</h2>
        {[
          ["Không thấy nút Duyệt / Giao việc?", "Nút chỉ hiện với tài khoản được phân quyền. Công chức chỉ thấy việc của mình — đúng thiết kế, không phải lỗi."],
          ["Bấm mãi mà việc không mất khỏi danh sách?", "Việc chỉ xong khi lãnh đạo duyệt. Báo hoàn thành xong thì chờ — có tin báo khi được duyệt."],
          ["Quên mật khẩu?", "Báo trực tiếp lãnh đạo đơn vị hoặc quản trị hệ thống để đặt lại — không tự đăng ký tài khoản mới."],
          ["Số liệu tháng sai, muốn sửa?", "Mở lại bản ghi trong Kết quả công tác tháng và Sửa — mọi lần sửa đều lưu vết, kỳ đã chốt thì không sửa được."],
          ["Gặp lỗi hoặc muốn góp ý?", "Bấm nút Góp ý ở góc phải dưới màn hình — chọn Góp ý/Báo lỗi/Đề xuất, ghi vài dòng là gửi thẳng tới lãnh đạo và kỹ thuật, kèm sẵn màn hình bạn đang mở."],
        ].map(([q, a]) => (
          <div key={q} className="text-sm">
            <p className="font-bold text-slate-900">{q}</p>
            <p className="text-slate-600">{a}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
