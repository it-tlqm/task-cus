/**
 * Cấu hình điều hướng dùng chung cho sidebar desktop và drawer mobile.
 *
 * Nguyên tắc:
 * - Chỉ khai báo route đang tồn tại trong ứng dụng; không tạo menu cho trang giả.
 * - Quyền hiển thị ở đây chỉ là lớp UI. API/backend vẫn là lớp kiểm soát cuối cùng.
 * - Giữ nguyên href cũ để bookmark/deep-link không bị hỏng.
 */

export interface NavigationAccess {
  /** Chỉ lãnh đạo đơn vị/bộ phận (canApprove). */
  leadersOnly?: boolean;
  /** Chỉ nhóm quản trị (lãnh đạo đơn vị hoặc SYSTEM_ADMIN). */
  adminOnly?: boolean;
  /** Một quyền cụ thể, ví dụ catalog.manage. */
  permission?: string;
  /** Có ít nhất một trong các quyền này. */
  permissionsAny?: string[];
  /** Cần quyền xuất báo cáo. */
  requireExport?: boolean;
  /** Cần quyền chốt kỳ. */
  requireLock?: boolean;
  /** Ẩn mục này với các vai trò cụ thể (ví dụ UNIT_LEADER). */
  hiddenForRoles?: string[];
}

export interface NavigationItem {
  id: string;
  label: string;
  href: string;
  icon: string;
  description?: string;
  access?: NavigationAccess;
  /** Chỉ active khi đúng pathname, dùng cho route cha có route con riêng. */
  exact?: boolean;
}

export interface NavigationSection {
  id: string;
  label: string;
  icon: string;
  /** Mặc định mở; nhóm quản trị mặc định đóng để sidebar gọn. */
  defaultOpen?: boolean;
  access?: NavigationAccess;
  items: NavigationItem[];
}

export interface NavigationAccessContext {
  role: string;
  can: (permission: string) => boolean;
  isLeader: boolean;
  isAdmin: boolean;
  canExport: boolean;
  canLock: boolean;
}

export const NAVIGATION_SECTIONS: NavigationSection[] = [
  {
    id: "overview",
    label: "Tổng quan & điều hành",
    icon: "dashboard",
    items: [
      {
        id: "dashboard",
        label: "Tổng quan",
        href: "/v5",
        icon: "space_dashboard",
        description: "Chỉ số điều hành, thuế, kim ngạch và tình hình đơn vị",
      },
      {
        id: "giao-ban",
        label: "Giao ban",
        href: "/v5/giao-ban",
        icon: "monitoring",
        description: "Số liệu nghiệp vụ theo ngày, tuần, tháng",
        exact: true,
      },
      {
        id: "giao-ban-nhap",
        label: "Nhập số liệu giao ban",
        href: "/v5/giao-ban/nhap",
        icon: "edit_note",
      },
      {
        id: "giao-ban-bao-cao",
        label: "Báo cáo giao ban",
        href: "/giao-ban/bao-cao",
        icon: "article",
        description: "Tổng hợp và xuất báo cáo Word",
      },
      {
        id: "meetings",
        label: "Biên bản giao ban",
        href: "/meetings",
        icon: "forum",
        description: "Biên bản họp và kết luận chỉ đạo",
      },
    ],
  },
  {
    // YC-30 (bổ sung 20/10) — "Công việc" là đầu mối ghi nhận & theo dõi
    // công việc thực tế. "Kế hoạch" ở đây là THÀNH PHẦN LẬP KẾ HOẠCH/TỔNG HỢP
    // trong luồng công việc (route /plans giữ nguyên, không xoá kế hoạch đã lập).
    id: "journal",
    label: "Công việc",
    icon: "menu_book",
    items: [
      {
        id: "plans",
        label: "Kế hoạch",
        href: "/plans",
        icon: "event_note",
        description: "Lập và tổng hợp kế hoạch tuần của bộ phận",
      },
      {
        id: "my-work",
        label: "Việc của tôi",
        href: "/my-work",
        icon: "assignment_ind",
        description: "Việc được giao, việc tự tạo, hạn xử lý, kết quả và minh chứng",
      },
      {
        id: "tasks",
        label: "Giao việc",
        href: "/tasks",
        icon: "bolt",
        description: "Giao việc, theo dõi tiến độ và duyệt kết quả",
      },
      {
        id: "work-item-reviews",
        label: "Xác nhận công việc",
        href: "/work-item-reviews",
        icon: "verified",
        description: "Công việc cán bộ gửi lên chờ bạn xác nhận hoặc trả lại",
        access: { leadersOnly: true },
      },
      {
        id: "approvals",
        label: "Duyệt & xác nhận",
        href: "/approvals",
        icon: "fact_check",
        description: "Hồ sơ, kế hoạch và kết quả chờ lãnh đạo xử lý",
        access: { leadersOnly: true },
      },
    ],
  },
  {
    id: "operations",
    label: "Trực ca & nghiệp vụ",
    icon: "badge",
    items: [
      {
        id: "routine",
        label: "Nhật ký tác nghiệp",
        href: "/routine",
        icon: "history_edu",
        description: "Ghi nhận khối lượng công việc và biểu mẫu nghiệp vụ",
        access: { hiddenForRoles: ["UNIT_LEADER"] },
      },
      {
        id: "roster",
        label: "Lịch trực",
        href: "/roster",
        icon: "schedule",
        description: "Phân công nhiệm vụ và lịch trực theo tuần",
      },
      {
        id: "calendar",
        label: "Lịch công tác",
        href: "/calendar",
        icon: "calendar_month",
      },
      {
        id: "leaves",
        label: "Nghỉ phép & công tác",
        href: "/leaves",
        icon: "beach_access",
      },
      {
        id: "docs",
        label: "Sổ văn bản",
        href: "/docs",
        icon: "mail",
        description: "Văn bản đến, đi và theo dõi xử lý",
      },
    ],
  },
  {
    id: "results",
    label: "Kết quả & báo cáo",
    icon: "query_stats",
    items: [
      {
        id: "monthly-results",
        label: "Kết quả công tác tháng",
        href: "/monthly-results",
        icon: "assessment",
        description: "Sản phẩm thực tế, bảng 1, biểu 01A và kế hoạch 02C",
      },
      {
        id: "reports",
        label: "Báo cáo & tổng hợp",
        href: "/reports",
        icon: "table_view",
        description: "Xem trước mẫu báo cáo theo kỳ",
      },
      {
        id: "reports-excel",
        label: "Xuất Excel",
        href: "/reports/excel",
        icon: "download",
        description: "Tải báo cáo theo mẫu (mở đúng tab xuất)",
        access: { requireExport: true },
      },
      {
        id: "reports-snapshots",
        label: "Số liệu đã chốt",
        href: "/reports/snapshots",
        icon: "verified",
        description: "Kho bản chốt số liệu theo kỳ (mở đúng tab)",
        access: { requireLock: true },
      },
    ],
  },
  {
    id: "admin",
    label: "Quản trị hệ thống",
    icon: "admin_panel_settings",
    defaultOpen: false,
    access: { adminOnly: true },
    items: [
      {
        id: "admin-catalog",
        label: "Danh mục & sản phẩm",
        href: "/admin/catalog",
        icon: "list_alt",
        description: "Danh mục công việc thường xuyên và sản phẩm QĐ1277",
        access: { permission: "catalog.manage" },
      },
      {
        id: "admin-permissions",
        label: "Phân quyền",
        href: "/admin/permissions",
        icon: "manage_accounts",
        description: "Vai trò, quyền, phạm vi quản lý và nhật ký cấp quyền",
        access: { permission: "org.manage" },
      },
      {
        id: "admin-supervisions",
        label: "Quan hệ phụ trách",
        href: "/admin/supervisions",
        icon: "account_tree",
        description: "Khai báo ai phụ trách cho ai theo kỳ (YC-35)",
        access: { permission: "org.manage" },
      },
      {
        id: "admin-organization",
        label: "Tổ chức & nhân sự",
        href: "/admin/organization",
        icon: "corporate_fare",
        access: { permissionsAny: ["org.manage", "users.manage"] },
      },
      {
        id: "admin-forms",
        label: "Biểu mẫu & quy trình",
        href: "/admin/forms",
        icon: "rule_folder",
        access: { permission: "form.manage" },
      },
      {
        id: "giao-ban-config",
        label: "Cấu hình số liệu giao ban",
        href: "/giao-ban/cau-hinh",
        icon: "tune",
        // YC-02: quyền nghiệp vụ riêng, không dùng system.config kỹ thuật.
        access: { permission: "metrics.config" },
      },
      {
        id: "admin-system",
        label: "Cấu hình hệ thống",
        href: "/admin/system",
        icon: "settings",
        access: { adminOnly: true },
      },
      {
        id: "admin-audit",
        label: "Nhật ký hệ thống",
        href: "/admin/audit",
        icon: "manage_history",
        access: { permission: "audit.view" },
      },
      {
        id: "admin-feedback",
        label: "Góp ý & báo lỗi",
        href: "/admin/feedback",
        icon: "campaign",
        access: { adminOnly: true },
      },
    ],
  },
];

const EXTRA_TRAILS: Record<string, { label: string; section?: string }> = {
  "/": { label: "Bảng điều hành" },
  "/notifications": { label: "Thông báo" },
  "/huong-dan": { label: "Hướng dẫn sử dụng" },
  "/admin": { label: "Quản trị hệ thống" },
  "/reports/excel": { label: "Xuất báo cáo Excel", section: "Kết quả & báo cáo" },
  "/reports/snapshots": { label: "Bản chốt số liệu", section: "Kết quả & báo cáo" },
};

function allowed(access: NavigationAccess | undefined, ctx: NavigationAccessContext): boolean {
  if (!access) return true;
  if (access.adminOnly && !ctx.isAdmin) return false;
  if (access.leadersOnly && !ctx.isLeader) return false;
  if (access.permission && !ctx.can(access.permission)) return false;
  if (access.permissionsAny?.length && !access.permissionsAny.some((p) => ctx.can(p))) return false;
  if (access.requireExport && !ctx.canExport) return false;
  if (access.requireLock && !ctx.canLock) return false;
  if (access.hiddenForRoles?.includes(ctx.role)) return false;
  return true;
}

export function filterNavigation(ctx: NavigationAccessContext): NavigationSection[] {
  return NAVIGATION_SECTIONS.filter((section) => allowed(section.access, ctx))
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => allowed(item.access, ctx)),
    }))
    .filter((section) => section.items.length > 0);
}

export function isItemActive(pathname: string, item: NavigationItem): boolean {
  if (item.href === "/dashboard") {
    return pathname === "/dashboard" || pathname === "/";
  }
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

export function findActiveNavigation(pathname: string) {
  for (const section of NAVIGATION_SECTIONS) {
    for (const item of section.items) {
      if (isItemActive(pathname, item)) return { section, item };
    }
  }
  return null;
}

export interface BreadcrumbEntry {
  label: string;
  href?: string;
}

export function getBreadcrumbTrail(pathname: string): BreadcrumbEntry[] {
  const home: BreadcrumbEntry = { label: "Trang chủ", href: "/v5" };
  const special = EXTRA_TRAILS[pathname];
  const active = findActiveNavigation(pathname);

  if (!active) {
    return special ? [home, { label: special.label }] : [home, { label: "Không gian làm việc" }];
  }

  const { section, item } = active;
  let current = item.label;

  if (pathname.startsWith("/tasks/")) current = "Chi tiết nhiệm vụ";
  else if (pathname.startsWith("/meetings/")) current = "Chi tiết biên bản";
  else if (pathname === "/reports/excel") current = "Xuất báo cáo Excel";
  else if (pathname === "/reports/snapshots") current = "Bản chốt số liệu";

  if (item.href === "/dashboard") return [home, { label: current }];

  const sectionLabel = special?.section || section.label;
  // Nhóm và mục trùng tên (vd nhóm "Nhật ký công việc" / mục "Nhật ký công việc") → chỉ hiện 1 cấp.
  if (sectionLabel.trim().toLowerCase() === current.trim().toLowerCase()) {
    return [home, { label: current }];
  }
  return [home, { label: sectionLabel }, { label: current }];
}

/** Dùng cho kiểm thử tự động: toàn bộ href khai báo trong menu. */
export const NAVIGATION_HREFS = NAVIGATION_SECTIONS.flatMap((section) =>
  section.items.map((item) => item.href)
);

