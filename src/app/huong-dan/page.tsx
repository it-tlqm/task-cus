"use client";

import React, { useState } from "react";
import Link from "next/link";
import { HELP } from "@/data/page-help";

/**
 * Sơ đồ hướng dẫn tương tác: bấm vào từng phần của hệ thống
 * để xem ngay hướng dẫn chi tiết phần đó.
 */
const MAP: Array<{ hub: string; icon: string; routes: string[] }> = [
  { hub: "Công Việc", icon: "assignment_ind", routes: ["/my-work", "/tasks", "/monthly-results", "/plans", "/approvals", "/meetings", "/docs"] },
  { hub: "Lịch & Nghỉ", icon: "calendar_month", routes: ["/routine", "/calendar", "/roster", "/leaves"] },
  { hub: "Báo Cáo", icon: "query_stats", routes: ["/reports", "/reports/excel", "/reports/snapshots"] },
  { hub: "Danh Mục", icon: "inventory_2", routes: ["/products"] },
  { hub: "Tổng Quan", icon: "space_dashboard", routes: ["/dashboard", "/notifications"] },
  { hub: "Quản Trị", icon: "settings", routes: ["/admin/organization", "/admin/catalog", "/admin/forms", "/admin/system", "/admin/audit"] },
];

const FLOW_LABEL: Record<string, string> = {
  "/my-work": "Việc của tôi",
  "/tasks": "Việc đơn vị",
  "/monthly-results": "Việc tháng",
  "/plans": "Kế hoạch tuần",
  "/approvals": "Phê duyệt",
  "/meetings": "Giao ban",
  "/docs": "Sổ văn bản",
  "/routine": "Nhật ký ca",
  "/calendar": "Lịch công tác",
  "/roster": "Lịch trực",
  "/leaves": "Nghỉ phép",
  "/reports": "Báo cáo tuần",
  "/reports/excel": "Xuất Excel",
  "/reports/snapshots": "Số đã chốt",
  "/products": "Sản phẩm QĐ",
  "/dashboard": "Bảng điều hành",
  "/notifications": "Thông báo",
  "/admin/organization": "Tổ chức",
  "/admin/catalog": "Mẫu tuần",
  "/admin/forms": "Biểu mẫu",
  "/admin/system": "Cấu hình",
  "/admin/audit": "Audit",
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
          ["Số liệu tháng sai, muốn sửa?", "Mở lại bản ghi trong Việc tháng và Sửa — mọi lần sửa đều lưu vết, kỳ đã chốt thì không sửa được."],
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
