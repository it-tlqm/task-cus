"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserCheck, CalendarDays, BookOpen, LayoutDashboard } from "lucide-react";

export function BottomNav() {
  const pathname = usePathname();

  if (pathname === "/login") return null;

  const navItems = [
    { name: "Công việc", href: "/my-work", icon: UserCheck },
    { name: "Kế hoạch", href: "/plans", icon: CalendarDays },
    { name: "Nhật ký", href: "/routine", icon: BookOpen },
    { name: "Tổng quan", href: "/dashboard", icon: LayoutDashboard },
  ];

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-border-default pb-safe shadow-lg">
      <div className="h-14 flex items-center justify-around">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors ${
                isActive ? "text-secondary font-bold" : "text-slate-500 hover:text-primary"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] mt-0.5">{item.name}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
