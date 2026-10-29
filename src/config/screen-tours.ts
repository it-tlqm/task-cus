export interface ScreenTourStep {
  selectors: string[];
  eyebrow: string;
  title: string;
  body: string;
}

export interface ScreenTour {
  id: string;
  name: string;
  pathPrefixes: string[];
  steps: ScreenTourStep[];
}

const GENERIC_STEPS: ScreenTourStep[] = [
  {
    selectors: ['[data-tour="page-header"]', "main h1", "h1", "main"],
    eyebrow: "Màn hình này",
    title: "Bạn đang ở đâu",
    body: "Phần tiêu đề cho biết tên màn hình, mô tả ngắn và các nút thao tác chính.",
  },
  {
    selectors: ['[data-tour="page-actions"]', '[data-tour="page-header"]', "main"],
    eyebrow: "Thao tác",
    title: "Làm việc ngay trên màn hình",
    body: "Các nút bên phải là thao tác chính: thêm mới, làm mới, xuất file hoặc mở cấu hình.",
  },
  {
    selectors: ['[data-tour="page-content"]', "main"],
    eyebrow: "Nội dung",
    title: "Khu vực dữ liệu",
    body: "Bảng, bộ lọc và biểu đồ bên dưới là nơi xem và xử lý dữ liệu của màn hình này.",
  },
];

export const SCREEN_TOURS: ScreenTour[] = [
  {
    id: "store",
    name: "Kho ứng dụng",
    pathPrefixes: ["/store"],
    steps: [
      {
        selectors: ['[data-tour="store-hero"]'],
        eyebrow: "Kho ứng dụng",
        title: "Chọn ứng dụng để bắt đầu",
        body: "Mỗi nghiệp vụ là một ứng dụng riêng. Số ứng dụng, số đã ghim và số dùng gần đây nằm ngay trên đầu trang.",
      },
      {
        selectors: ['[data-tour="store-search"]'],
        eyebrow: "Tìm nhanh",
        title: "Tìm hoặc lọc theo nhóm",
        body: "Gõ tên ứng dụng hoặc chọn nhóm Điều hành, Nghiệp vụ, Báo cáo, Quản trị để thu hẹp danh sách.",
      },
      {
        selectors: ['[data-tour="store-grid"]'],
        eyebrow: "Thẻ ứng dụng",
        title: "Mở app, ghim và dùng lối tắt",
        body: "Bấm thẻ để mở app. Ngôi sao để ghim. Các nút nhỏ trên thẻ mở thẳng nghiệp vụ con như Nhập số liệu hoặc Cấu hình.",
      },
    ],
  },
  {
    id: "dashboard",
    name: "Tổng quan điều hành",
    pathPrefixes: ["/v5"],
    steps: [
      {
        selectors: ['[data-tour="page-header"]'],
        eyebrow: "Tổng quan",
        title: "Nắm tình hình trong một màn hình",
        body: "Chọn Tuần này, Tháng này hoặc Năm nay để xem đúng kỳ cần làm việc.",
      },
      {
        selectors: ['[data-tour="dashboard-summary"]'],
        eyebrow: "Số thu",
        title: "Bảng tổng hợp số thu",
        body: "Các chỉ tiêu BTC, UBND, kế hoạch tháng, so sánh tháng trước và cùng kỳ nằm ngay trên bảng tổng hợp.",
      },
      {
        selectors: ['[data-tour="dashboard-kpi"]', '[data-tour="dashboard-summary"]'],
        eyebrow: "Điều hành",
        title: "KPI và biểu đồ",
        body: "Các thẻ KPI và biểu đồ giúp thấy nhanh tiến độ, cơ cấu thuế và điểm cần chú ý.",
      },
    ],
  },
  {
    id: "giao-ban",
    name: "Giao ban số liệu",
    pathPrefixes: ["/v5/giao-ban"],
    steps: [
      {
        selectors: ['[data-tour="page-header"]'],
        eyebrow: "Giao ban",
        title: "Số liệu giao ban",
        body: "Chọn Tuần, Tháng, Quý, Năm và chuyển tab để xem tổng hợp, chi tiết, so sánh hoặc nhận xét.",
      },
      {
        selectors: ['[data-tour="giao-ban-tabs"]', '[data-tour="giao-ban-summary"]'],
        eyebrow: "Các góc nhìn",
        title: "Tổng hợp, chi tiết, so sánh",
        body: "Tab Tổng hợp ưu tiên bảng số thu; tab Theo chỉ tiêu xem toàn bộ; tab So sánh xem biểu đồ.",
      },
      {
        selectors: ['[data-tour="giao-ban-summary"]'],
        eyebrow: "Bảng số thu",
        title: "Đọc số liệu theo phân loại",
        body: "Bảng tách Ô tô, Than cốc, Hàng hóa khác và tổng cộng. Cột USD và số xe giúp đối chiếu nhanh.",
      },
    ],
  },
  {
    id: "entry",
    name: "Nhập số liệu",
    pathPrefixes: ["/v5/giao-ban/nhap"],
    steps: [
      {
        selectors: ['[data-tour="page-header"]'],
        eyebrow: "Nhập số liệu",
        title: "Chỉ nhập chỉ tiêu được phân công",
        body: "Màn hình chỉ hiện chỉ tiêu bạn có quyền nhập. Số liệu được lưu tại ngày cuối kỳ.",
      },
      {
        selectors: ['[data-tour="entry-period"]'],
        eyebrow: "Chọn kỳ",
        title: "Ngày, tuần, tháng, quý, năm",
        body: "Chọn đúng kỳ trước khi nhập. Có thể dùng nút mũi tên để chuyển kỳ trước/sau.",
      },
      {
        selectors: ['[data-tour="entry-modes"]'],
        eyebrow: "Kiểu nhập",
        title: "Phát sinh hoặc Lũy kế",
        body: "Chọn Phát sinh nếu nhập số trong kỳ; chọn Lũy kế nếu nhập tổng đến cuối kỳ — hệ thống tự quy đổi.",
      },
    ],
  },
  {
    id: "my-work",
    name: "Công việc của tôi",
    pathPrefixes: ["/my-work"],
    steps: [
      {
        selectors: ['[data-tour="page-header"]'],
        eyebrow: "Công việc",
        title: "Việc của bạn trong ngày",
        body: "Trang này tổng hợp việc được giao, việc phối hợp, hạn chót và tiến độ của bạn.",
      },
      {
        selectors: ['[data-tour="my-work-kpi"]'],
        eyebrow: "KPI",
        title: "Cần xử lý, sắp hạn, quá hạn",
        body: "Bốn thẻ KPI cho biết ngay việc nào cần ưu tiên và việc nào đang chờ duyệt.",
      },
      {
        selectors: ['[data-tour="time-filter"]'],
        eyebrow: "Lọc",
        title: "Hôm nay, tuần này, tháng này",
        body: "Dùng bộ lọc thời gian và tìm kiếm để thu hẹp danh sách việc.",
      },
      {
        selectors: ['[data-tour="task-list"]'],
        eyebrow: "Danh sách",
        title: "Mở việc để cập nhật",
        body: "Bấm vào việc để xem chi tiết, cập nhật tiến độ, báo hoàn thành hoặc xin gia hạn.",
      },
    ],
  },
  {
    id: "tasks",
    name: "Công việc",
    pathPrefixes: ["/tasks"],
    steps: [
      {
        selectors: ['[data-tour="page-header"]'],
        eyebrow: "Công việc",
        title: "Toàn bộ việc phát sinh",
        body: "Theo dõi việc theo trạng thái, ưu tiên, người phụ trách và hạn xử lý.",
      },
      {
        selectors: ['[data-tour="page-actions"]', '[data-tour="page-content"]'],
        eyebrow: "Thao tác",
        title: "Tạo và lọc việc",
        body: "Dùng nút thêm mới, bộ lọc và tìm kiếm để làm việc nhanh.",
      },
      {
        selectors: ['[data-tour="page-content"]'],
        eyebrow: "Danh sách",
        title: "Bảng công việc",
        body: "Bấm vào từng dòng để mở chi tiết, cập nhật kết quả hoặc chuyển trạng thái.",
      },
    ],
  },
  {
    id: "plans",
    name: "Kế hoạch",
    pathPrefixes: ["/plans"],
    steps: [
      {
        selectors: ['[data-tour="page-header"]'],
        eyebrow: "Kế hoạch",
        title: "Kế hoạch tuần, tháng",
        body: "Chọn kế hoạch, xem theo ngày/tuần/tháng hoặc Gantt để theo dõi tiến độ.",
      },
      {
        selectors: ['[data-tour="plans-toolbar"]'],
        eyebrow: "Bộ lọc",
        title: "Lọc theo phụ trách, ưu tiên",
        body: "Thanh lọc dính khi cuộn giúp đổi góc nhìn nhanh mà không mất vị trí.",
      },
      {
        selectors: ['[data-tour="plans-content"]'],
        eyebrow: "Nội dung",
        title: "Bảng hoặc Gantt",
        body: "Bảng hiển thị chi tiết; Gantt cho thấy thanh thời gian và mốc hôm nay.",
      },
    ],
  },
  {
    id: "reports",
    name: "Báo cáo",
    pathPrefixes: ["/reports"],
    steps: [
      {
        selectors: ['[data-tour="page-header"]'],
        eyebrow: "Báo cáo",
        title: "Báo cáo và kết xuất",
        body: "Xem trước báo cáo, chốt kỳ và xuất Mẫu A hoặc Mẫu B.",
      },
      {
        selectors: ['[data-tour="report-tabs"]', '[data-tour="export-btns"]'],
        eyebrow: "Chọn chế độ",
        title: "Báo cáo, mẫu báo cáo, kho đã chốt",
        body: "Chuyển tab để xem báo cáo, cấu hình mẫu hoặc mở các bản đã chốt.",
      },
      {
        selectors: ['[data-tour="export-btns"]'],
        eyebrow: "Kết xuất",
        title: "Xuất file và chốt kỳ",
        body: "Tải Mẫu A/B hoặc chốt kỳ. Mọi lượt xuất và chốt đều được ghi nhật ký.",
      },
    ],
  },
  {
    id: "routine",
    name: "Nhật ký ca trực",
    pathPrefixes: ["/routine"],
    steps: [
      {
        selectors: ['[data-tour="page-header"]'],
        eyebrow: "Ca trực",
        title: "Ghi nhật ký tác nghiệp",
        body: "Ghi nhận hoạt động theo ca và biểu mẫu; dữ liệu doanh nghiệp, container được lưu cùng.",
      },
      {
        selectors: ['[data-tour="page-actions"]', '[data-tour="page-content"]'],
        eyebrow: "Thao tác",
        title: "Chọn ca và biểu mẫu",
        body: "Dùng bộ lọc ngày/ca, sau đó thêm bản ghi hoặc mở bản ghi có sẵn.",
      },
      {
        selectors: ['[data-tour="page-content"]'],
        eyebrow: "Danh sách",
        title: "Bản ghi trong ca",
        body: "Bấm vào bản ghi để xem/sửa; trạng thái không phát sinh được giữ riêng.",
      },
    ],
  },
  {
    id: "notifications",
    name: "Thông báo",
    pathPrefixes: ["/notifications"],
    steps: [
      {
        selectors: ['[data-tour="page-header"]'],
        eyebrow: "Thông báo",
        title: "Việc mới và nhắc hạn",
        body: "Thông báo giao việc, phê duyệt, nhắc hạn và thay đổi dữ liệu liên quan đến bạn.",
      },
      {
        selectors: ['[data-tour="notifications-filter"]', '[data-tour="page-content"]'],
        eyebrow: "Lọc",
        title: "Tất cả, chưa đọc, giao việc",
        body: "Dùng các chip để chỉ xem nhóm thông báo cần xử lý.",
      },
      {
        selectors: ['[data-tour="notifications-feed"]', '[data-tour="page-content"]'],
        eyebrow: "Danh sách",
        title: "Mở thông báo để xử lý",
        body: "Bấm vào thông báo để mở đúng việc, kế hoạch hoặc hồ sơ liên quan.",
      },
    ],
  },
  {
    id: "admin-config",
    name: "Cấu hình nghiệp vụ",
    pathPrefixes: ["/admin/config"],
    steps: [
      {
        selectors: ['[data-tour="config-domains"]'],
        eyebrow: "Cấu hình",
        title: "Chọn nhóm cần sửa",
        body: "Mỗi nhóm là một lớp cấu hình: nhãn, thông báo, đánh giá, báo cáo, quy trình, chất lượng dữ liệu.",
      },
      {
        selectors: ['[data-tour="config-scope"]'],
        eyebrow: "Phạm vi",
        title: "Toàn hệ thống, đơn vị, vai trò",
        body: "Chọn phạm vi trước khi sửa. Cấu hình hẹp hơn sẽ ghi đè cấu hình chung.",
      },
      {
        selectors: ['[data-tour="config-editor"]'],
        eyebrow: "Soạn và phát hành",
        title: "Lưu nháp rồi phát hành",
        body: "Sửa JSON, bấm Lưu nháp để kiểm tra, sau đó Phát hành. Khôi phục sẽ quay về mặc định.",
      },
    ],
  },
  {
    id: "report-templates",
    name: "Kho mẫu báo cáo",
    pathPrefixes: ["/admin/report-templates"],
    steps: [
      {
        selectors: ['[data-tour="template-upload"]'],
        eyebrow: "Kho mẫu",
        title: "Thêm mẫu Word/Excel",
        body: "Chọn tên, loại báo cáo, phiên bản và file .docx hoặc .xlsx.",
      },
      {
        selectors: ['[data-tour="template-list"]'],
        eyebrow: "Danh sách",
        title: "Chọn mẫu đang áp dụng",
        body: "Ngôi sao để chọn mẫu áp dụng; nút tải để tải lại; thùng rác để xóa.",
      },
    ],
  },
  {
    id: "help",
    name: "Hướng dẫn",
    pathPrefixes: ["/huong-dan"],
    steps: [
      {
        selectors: ['[data-tour="page-header"]'],
        eyebrow: "Hướng dẫn",
        title: "Sổ tay sử dụng",
        body: "Chọn từng phần để xem hướng dẫn chi tiết.",
      },
      {
        selectors: ['[data-tour="help-map"]', '[data-tour="page-content"]'],
        eyebrow: "Theo màn hình",
        title: "Mỗi màn hình một tour riêng",
        body: "Bấm vào nhóm màn hình để mở hướng dẫn, hoặc dùng nút Hướng dẫn trên thanh trên cùng.",
      },
    ],
  },
];

/** Chọn tour dài nhất khớp với đường dẫn hiện tại. */
export function findScreenTour(pathname: string | null | undefined): ScreenTour {
  if (pathname) {
    let best: ScreenTour | null = null;
    let bestLength = -1;
    for (const tour of SCREEN_TOURS) {
      for (const prefix of tour.pathPrefixes) {
        const match = pathname === prefix || pathname.startsWith(`${prefix}/`);
        if (match && prefix.length > bestLength) {
          best = tour;
          bestLength = prefix.length;
        }
      }
    }
    if (best) return best;
  }
  return {
    id: "generic",
    name: "Hướng dẫn màn hình",
    pathPrefixes: [],
    steps: GENERIC_STEPS,
  };
}
