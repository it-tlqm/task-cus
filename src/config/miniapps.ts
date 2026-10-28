/**
 * Danh mục miniapp nghiệp vụ — nguồn duy nhất cho Kho ứng dụng, app switcher
 * và cách xác định app hiện tại từ URL.
 *
 * Không tách deploy: mỗi miniapp vẫn là một vùng route trong cùng ứng dụng,
 * dùng chung đăng nhập, phân quyền và CSDL. Registry là ranh giới để sau này
 * có thể tách thành app riêng nếu cần.
 */

export type MiniappCategoryId = "dieu-hanh" | "nghiep-vu" | "bao-cao" | "quan-tri";

export interface MiniappCategory {
  id: MiniappCategoryId;
  label: string;
  description: string;
}

export const MINIAPP_CATEGORIES: MiniappCategory[] = [
  { id: "dieu-hanh", label: "Điều hành", description: "Nắm tình hình và lịch công tác" },
  { id: "nghiep-vu", label: "Nghiệp vụ", description: "Công việc, giao ban, kế hoạch, ca trực" },
  { id: "bao-cao", label: "Báo cáo & tài liệu", description: "Kết xuất, kết quả tháng, tài liệu" },
  { id: "quan-tri", label: "Quản trị", description: "Tổ chức, phân quyền, cấu hình" },
];

export type MiniappAccent = "navy" | "red" | "gold" | "teal";

export type MiniappIconName =
  | "layout-dashboard"
  | "clipboard-list"
  | "bar-chart-3"
  | "calendar-days"
  | "calendar-range"
  | "file-text"
  | "pie-chart"
  | "book-open-check"
  | "building-2"
  | "shield-check"
  | "folder-kanban"
  | "package"
  | "circle-help";

export interface Miniapp {
  id: string;
  name: string;
  description: string;
  href: string;
  icon: MiniappIconName;
  accent: MiniappAccent;
  category: MiniappCategoryId;
  /** Các tiền tố URL thuộc app; tiền tố dài nhất thắng. */
  paths: string[];
  keywords: string[];
  /** Chỉ các vai trò này thấy app (bỏ trống = mọi vai trò). */
  roles?: string[];
  /** Chỉ cần MỘT quyền trong danh sách là thấy app. */
  permissions?: string[];
}

export const MINIAPPS: Miniapp[] = [
  {
    id: "tong-quan",
    name: "Tổng quan điều hành",
    description: "Số thu, chỉ tiêu, biểu đồ và tình hình công việc trong ngày.",
    href: "/v5",
    icon: "layout-dashboard",
    accent: "navy",
    category: "dieu-hanh",
    paths: ["/v5"],
    keywords: ["dashboard", "tổng quan", "số thu", "chỉ tiêu", "biểu đồ"],
  },
  {
    id: "cong-viec",
    name: "Công việc",
    description: "Việc được giao, tiến độ, phê duyệt và công chức nhận việc.",
    href: "/my-work",
    icon: "clipboard-list",
    accent: "red",
    category: "nghiep-vu",
    paths: ["/my-work", "/tasks", "/approvals", "/work-item-reviews"],
    keywords: ["công việc", "task", "tiến độ", "phê duyệt", "nhận việc"],
  },
  {
    id: "giao-ban",
    name: "Giao ban số liệu",
    description: "Nhập số liệu, cấu hình chỉ tiêu và báo cáo giao ban.",
    href: "/v5/giao-ban",
    icon: "bar-chart-3",
    accent: "gold",
    category: "nghiep-vu",
    paths: ["/v5/giao-ban", "/giao-ban"],
    keywords: ["giao ban", "số liệu", "thuế", "usd", "báo cáo giao ban"],
  },
  {
    id: "ke-hoach",
    name: "Kế hoạch",
    description: "Kế hoạch tuần, tháng, Gantt và phân công đầu việc.",
    href: "/plans",
    icon: "calendar-days",
    accent: "navy",
    category: "nghiep-vu",
    paths: ["/plans"],
    keywords: ["kế hoạch", "plan", "gantt", "tuần", "tháng"],
  },
  {
    id: "nhat-ky",
    name: "Nhật ký ca trực",
    description: "Ghi nhận hoạt động nghiệp vụ theo ca và biểu mẫu.",
    href: "/routine",
    icon: "book-open-check",
    accent: "teal",
    category: "nghiep-vu",
    paths: ["/routine"],
    keywords: ["nhật ký", "ca trực", "routine", "biểu mẫu"],
    roles: ["DEPARTMENT_LEADER", "STAFF"],
  },
  {
    id: "lich-cong-tac",
    name: "Lịch công tác",
    description: "Lịch, cuộc họp, lịch trực và nghỉ phép của đơn vị.",
    href: "/calendar",
    icon: "calendar-range",
    accent: "navy",
    category: "dieu-hanh",
    paths: ["/calendar", "/meetings", "/roster", "/leaves"],
    keywords: ["lịch", "họp", "trực", "nghỉ phép"],
  },
  {
    id: "bao-cao",
    name: "Báo cáo",
    description: "Xem trước, chốt kỳ và xuất báo cáo công tác.",
    href: "/reports",
    icon: "file-text",
    accent: "red",
    category: "bao-cao",
    paths: ["/reports"],
    keywords: ["báo cáo", "report", "excel", "word", "chốt kỳ"],
  },
  {
    id: "ket-qua-thang",
    name: "Kết quả tháng",
    description: "Tổng hợp kết quả, điểm và xếp loại theo tháng.",
    href: "/monthly-results",
    icon: "pie-chart",
    accent: "gold",
    category: "bao-cao",
    paths: ["/monthly-results"],
    keywords: ["kết quả", "tháng", "điểm", "xếp loại"],
  },
  {
    id: "tai-lieu",
    name: "Tài liệu",
    description: "Kho tài liệu, biểu mẫu và văn bản nghiệp vụ.",
    href: "/docs",
    icon: "folder-kanban",
    accent: "teal",
    category: "bao-cao",
    paths: ["/docs"],
    keywords: ["tài liệu", "văn bản", "biểu mẫu", "docs"],
  },
  {
    id: "san-pham",
    name: "Sản phẩm",
    description: "Sản phẩm, hồ sơ và kết quả đầu ra của đơn vị.",
    href: "/products",
    icon: "package",
    accent: "navy",
    category: "bao-cao",
    paths: ["/products"],
    keywords: ["sản phẩm", "hồ sơ", "product"],
  },
  {
    id: "nhan-su",
    name: "Nhân sự & tổ chức",
    description: "Cán bộ, đơn vị, chức vụ và phân công công tác.",
    href: "/admin/organization",
    icon: "building-2",
    accent: "navy",
    category: "quan-tri",
    paths: ["/admin/organization"],
    keywords: ["nhân sự", "tổ chức", "cán bộ", "đơn vị", "chức vụ"],
    permissions: ["org.manage", "users.manage"],
  },
  {
    id: "quan-tri",
    name: "Quản trị hệ thống",
    description: "Phân quyền, danh mục, biểu mẫu, giám sát và nhật ký hệ thống.",
    href: "/admin",
    icon: "shield-check",
    accent: "red",
    category: "quan-tri",
    paths: ["/admin"],
    keywords: ["quản trị", "phân quyền", "danh mục", "audit", "cấu hình"],
    permissions: ["org.manage", "users.manage", "audit.view", "system.config", "form.manage", "catalog.manage"],
  },
  {
    id: "huong-dan",
    name: "Hướng dẫn",
    description: "Hướng dẫn sử dụng và quy trình thao tác nghiệp vụ.",
    href: "/huong-dan",
    icon: "circle-help",
    accent: "teal",
    category: "quan-tri",
    paths: ["/huong-dan"],
    keywords: ["hướng dẫn", "trợ giúp", "help"],
  },
];

export const MINIAPP_ACCENTS: Record<
  MiniappAccent,
  { tile: string; soft: string; text: string; border: string; dot: string }
> = {
  navy: {
    tile: "bg-v5-accent text-white",
    soft: "bg-v5-accent-soft",
    text: "text-v5-accent",
    border: "border-v5-accent/25",
    dot: "bg-v5-accent",
  },
  red: {
    tile: "bg-v5-danger text-white",
    soft: "bg-v5-danger-soft",
    text: "text-v5-danger",
    border: "border-v5-danger/25",
    dot: "bg-v5-danger",
  },
  gold: {
    tile: "bg-v5-gold text-v5-ink",
    soft: "bg-v5-gold-soft",
    text: "text-v5-gold-ink",
    border: "border-v5-gold/40",
    dot: "bg-v5-gold",
  },
  teal: {
    tile: "bg-[#0F766E] text-white",
    soft: "bg-[#0F766E]/10",
    text: "text-[#0F766E]",
    border: "border-[#0F766E]/25",
    dot: "bg-[#0F766E]",
  },
};

/** Tìm app theo URL — tiền tố dài nhất thắng (ví dụ /admin/organization > /admin). */
export function findMiniappByPath(pathname: string | null | undefined): Miniapp | null {
  if (!pathname) return null;
  let best: Miniapp | null = null;
  let bestLength = -1;
  for (const app of MINIAPPS) {
    for (const prefix of app.paths) {
      const match = pathname === prefix || pathname.startsWith(`${prefix}/`);
      if (match && prefix.length > bestLength) {
        best = app;
        bestLength = prefix.length;
      }
    }
  }
  return best;
}

export function miniappCategoryLabel(id: MiniappCategoryId): string {
  return MINIAPP_CATEGORIES.find((category) => category.id === id)?.label || id;
}
