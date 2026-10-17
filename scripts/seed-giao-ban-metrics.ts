/**
 * Seed cấu hình "Số liệu giao ban" (YC-16 → YC-22) — CHẠY ĐƯỢC NHIỀU LẦN, AN TOÀN:
 * - Chỉ TẠO nếu mã chưa tồn tại; KHÔNG sửa/ghi đè cấu hình đã được chỉnh trên giao diện.
 * - Không seed bất kỳ số liệu/chỉ tiêu giao/mốc lũy kế nào (để Hải quan tự nhập).
 *
 * Chạy: npx tsx scripts/seed-giao-ban-metrics.ts
 */
import { prisma } from "../src/server/db";

interface MetricSeed {
  code: string;
  name: string;
  unitType: "VND" | "USD" | "COUNT";
  unitLabel?: string;
  displayScale?: number;
  decimals?: number;
  valueKind?: "FLOW" | "BALANCE" | "DERIVED";
  derivation?: { terms: { metricCode: string; sign: number }[]; includeBaseline: boolean };
  requireConfirm?: boolean;
  showOnDashboard?: boolean;
  dashboardOrder?: number;
  allowBackdateDays?: number;
  expectDaily?: boolean;
  note?: string;
  classifications?: { code: string; label: string }[];
}

const GROUPS: { code: string; name: string; note?: string; metrics: MetricSeed[] }[] = [
  {
    code: "THUE",
    name: "Quản lý thuế",
    metrics: [
      {
        code: "THU_NSNN",
        name: "Thu NSNN (số thuế phát sinh)",
        unitType: "VND",
        unitLabel: "đồng",
        decimals: 0,
        showOnDashboard: true,
        dashboardOrder: 1,
        note: "Một chỉ tiêu tổng, tách theo phân loại. Nếu Hải quan xác nhận 'Thu NSNN' là khái niệm khác thì tạo thêm chỉ tiêu mới trên giao diện.",
        classifications: [
          { code: "O_TO", label: "Ô tô" },
          { code: "THAN_COC", label: "Than cốc" },
          { code: "KHAC", label: "Hàng hóa khác" },
        ],
      },
      { code: "OTO_XE", name: "Số lượng xe ô tô nhập khẩu", unitType: "COUNT", unitLabel: "xe", decimals: 0 },
      {
        code: "TRI_GIA_USD",
        name: "Trị giá hàng hóa nhập khẩu",
        unitType: "USD",
        unitLabel: "USD",
        decimals: 2,
        classifications: [
          { code: "O_TO", label: "Ô tô" },
          { code: "THAN_COC", label: "Than cốc" },
        ],
      },
      { code: "MGH_HOAN_BO", name: "Miễn giảm, hoàn thuế — số bộ hồ sơ", unitType: "COUNT", unitLabel: "bộ", decimals: 0 },
      { code: "MGH_HOAN_TIEN", name: "Miễn giảm, hoàn thuế — số tiền", unitType: "VND", unitLabel: "đồng", decimals: 0 },
      { code: "MGH_KT_BO", name: "Không thu — số bộ hồ sơ", unitType: "COUNT", unitLabel: "bộ", decimals: 0 },
      { code: "MGH_KT_TIEN", name: "Không thu — số tiền", unitType: "VND", unitLabel: "đồng", decimals: 0 },
      { code: "PHI_PS", name: "Phí hải quan — số phát sinh phải thu trong kỳ", unitType: "VND", unitLabel: "đồng", decimals: 0 },
      { code: "PHI_THU", name: "Phí hải quan — số đã thu trong kỳ", unitType: "VND", unitLabel: "đồng", decimals: 0 },
      {
        code: "PHI_LK_THU",
        name: "Phí hải quan — lũy kế số đã thu",
        unitType: "VND",
        unitLabel: "đồng",
        decimals: 0,
        valueKind: "DERIVED",
        derivation: { terms: [{ metricCode: "PHI_THU", sign: 1 }], includeBaseline: true },
        note: "Cần xác nhận 'mốc' (số dư liệu) trên giao diện để tính lũy kế",
      },
      {
        code: "PHI_CON",
        name: "Phí hải quan — còn phải thu cuối kỳ",
        unitType: "VND",
        unitLabel: "đồng",
        decimals: 0,
        valueKind: "DERIVED",
        derivation: {
          terms: [
            { metricCode: "PHI_PS", sign: 1 },
            { metricCode: "PHI_THU", sign: -1 },
          ],
          includeBaseline: true,
        },
        note: "= Mốc còn phải thu + phát sinh − đã thu (sau ngày mốc)",
      },
      {
        code: "NO_THUE",
        name: "Nợ thuế",
        unitType: "VND",
        unitLabel: "đồng",
        decimals: 0,
        valueKind: "BALANCE",
        expectDaily: false,
        note: "Kiểu 'số dư thời điểm' — nếu Hải quan muốn theo dõi đầu kỳ/đã thu/cuối kỳ thì đổi cấu hình trên giao diện",
      },
      { code: "XOA_NO", name: "Xóa nợ thuế — số tiền (lũy kế)", unitType: "VND", unitLabel: "đồng", decimals: 0, expectDaily: false },
    ],
  },
  {
    code: "KIM_NGACH",
    name: "Kim ngạch & giám sát",
    metrics: [
      { code: "DN_PS", name: "Số doanh nghiệp phát sinh", unitType: "COUNT", unitLabel: "DN", decimals: 0, note: "Quy ước đếm do Hải quan chốt" },
      { code: "XNK_TK", name: "XNK — số lượng tờ khai", unitType: "COUNT", unitLabel: "tờ khai", decimals: 0 },
      { code: "XNK_USD", name: "XNK — kim ngạch", unitType: "USD", unitLabel: "USD", decimals: 2 },
      { code: "GS_TK", name: "Giám sát — số lượng tờ khai", unitType: "COUNT", unitLabel: "tờ khai", decimals: 0 },
      { code: "GS_USD", name: "Giám sát — kim ngạch", unitType: "USD", unitLabel: "USD", decimals: 2 },
      { code: "CDB_KHACH", name: "Cư dân biên giới — lượt hành khách xuất nhập cảnh", unitType: "COUNT", unitLabel: "lượt", decimals: 0 },
      { code: "CDB_TK", name: "Cư dân biên giới — tờ khai", unitType: "COUNT", unitLabel: "tờ khai", decimals: 0 },
      { code: "CDB_USD", name: "Cư dân biên giới — kim ngạch", unitType: "USD", unitLabel: "USD", decimals: 2 },
    ],
  },
  {
    code: "THAM_VAN",
    name: "Tham vấn trị giá",
    metrics: [
      { code: "TV_TK", name: "Tờ khai tham vấn trong kỳ", unitType: "COUNT", unitLabel: "tờ khai", decimals: 0 },
      {
        code: "TV_CHO",
        name: "Tờ khai chờ tham vấn",
        unitType: "COUNT",
        unitLabel: "tờ khai",
        decimals: 0,
        valueKind: "BALANCE",
        expectDaily: false,
        note: "Kiểu 'số dư thời điểm' — nhập số đang chờ",
      },
    ],
  },
  {
    code: "QLRR",
    name: "Quản lý rủi ro",
    metrics: [
      { code: "RR_KH", name: "Hồ sơ xử lý thông tin — theo kế hoạch giao", unitType: "COUNT", unitLabel: "hồ sơ", decimals: 0 },
      { code: "RR_NGOAI", name: "Hồ sơ xử lý thông tin — ngoài kế hoạch", unitType: "COUNT", unitLabel: "hồ sơ", decimals: 0 },
      {
        code: "RR_TONG",
        name: "Hồ sơ xử lý thông tin — tổng",
        unitType: "COUNT",
        unitLabel: "hồ sơ",
        decimals: 0,
        valueKind: "DERIVED",
        derivation: {
          terms: [
            { metricCode: "RR_KH", sign: 1 },
            { metricCode: "RR_NGOAI", sign: 1 },
          ],
          includeBaseline: false,
        },
      },
      { code: "RR_TIN", name: "Số tin thiết lập tiêu chí", unitType: "COUNT", unitLabel: "tin", decimals: 0 },
    ],
  },
  {
    code: "KSBL",
    name: "Kiểm soát chống buôn lậu",
    metrics: [
      { code: "KS_BG", name: "Bắt giữ, xử lý", unitType: "COUNT", unitLabel: "vụ", decimals: 0 },
      { code: "KS_VPHC", name: "Chủ trì xử lý VPHC", unitType: "COUNT", unitLabel: "vụ", decimals: 0 },
      { code: "KS_VPHC_KS", name: "Vi phạm kiểm soát hải quan", unitType: "COUNT", unitLabel: "vụ", decimals: 0 },
      { code: "KS_VPHC_TT", name: "Vi phạm thủ tục hải quan", unitType: "COUNT", unitLabel: "vụ", decimals: 0 },
      { code: "KS_PHAT", name: "Số tiền phạt VPHC", unitType: "VND", unitLabel: "đồng", decimals: 0 },
      { code: "KS_HS", name: "Chủ trì xử lý hình sự", unitType: "COUNT", unitLabel: "vụ", decimals: 0 },
      { code: "KS_PH", name: "Phối hợp bắt giữ, xử lý", unitType: "COUNT", unitLabel: "vụ", decimals: 0 },
      { code: "KS_TUYEN", name: "Tuyên truyền vận động quần chúng", unitType: "COUNT", unitLabel: "cuộc", decimals: 0 },
      { code: "KS_TUAN", name: "Tuần tra, kiểm soát hải quan", unitType: "COUNT", unitLabel: "lượt", decimals: 0 },
      { code: "KS_DTNCNTH", name: "Lập hồ sơ đối tượng nghiệp vụ trọng điểm", unitType: "COUNT", unitLabel: "hồ sơ", decimals: 0 },
      { code: "KS_CA", name: "Xác lập chuyên án", unitType: "COUNT", unitLabel: "chuyên án", decimals: 0 },
      { code: "KS_MM", name: "Sử dụng máy móc, thiết bị chuyên dùng", unitType: "COUNT", unitLabel: "lượt", decimals: 0 },
      { code: "KS_CHO_GIO", name: "Huấn luyện chó nghiệp vụ — số giờ", unitType: "COUNT", unitLabel: "giờ", decimals: 0 },
      { code: "KS_CHO_LAN", name: "Huấn luyện chó nghiệp vụ — số lần", unitType: "COUNT", unitLabel: "lần", decimals: 0 },
    ],
  },
  {
    code: "TONG_HOP",
    name: "Tổng hợp & kiểm tra sau thông quan",
    metrics: [
      { code: "KT_CUOC", name: "Số cuộc kiểm tra sau thông quan", unitType: "COUNT", unitLabel: "cuộc", decimals: 0 },
      { code: "KT_QD", name: "Quyết định kiểm tra sau thông quan", unitType: "COUNT", unitLabel: "QĐ", decimals: 0 },
      { code: "KT_TB", name: "Thông báo kết quả kiểm tra sau thông quan", unitType: "COUNT", unitLabel: "TB", decimals: 0 },
      { code: "KT_QD_AN", name: "Quyết định ấn định thuế", unitType: "COUNT", unitLabel: "QĐ", decimals: 0 },
      { code: "KT_TIEN_AN", name: "Số tiền ấn định thuế", unitType: "VND", unitLabel: "đồng", decimals: 0 },
      { code: "KT_TIEN_CN", name: "Số tiền chậm nộp", unitType: "VND", unitLabel: "đồng", decimals: 0 },
      { code: "KT_QD_XP", name: "Quyết định xử phạt VPHC (KS sau thông quan)", unitType: "COUNT", unitLabel: "QĐ", decimals: 0 },
      { code: "KT_TIEN_XP", name: "Số tiền phạt qua kiểm tra sau thông quan", unitType: "VND", unitLabel: "đồng", decimals: 0 },
    ],
  },
];

const SECTIONS: { code: string; title: string; groupCode?: string }[] = [
  { code: "KSBL_II", title: "II. Đánh giá công tác kiểm soát chống buôn lậu" },
  { code: "KTSTQ_III1", title: "III.1. Phúc tập hồ sơ & kiểm tra sau thông quan" },
  { code: "VP_III2", title: "III.2. Công tác Văn phòng" },
  { code: "HTQT_III3", title: "III.3. Công tác hợp tác quốc tế" },
  { code: "PS_III4", title: "III.4. Các công tác phát sinh khác" },
  { code: "DANG_IV", title: "IV. Công tác Đảng – Đoàn thể" },
  { code: "XOA_NO_15", title: "1.5. Xóa nợ thuế (chi tiết)", groupCode: "THUE" },
];

async function main() {
  let createdGroups = 0;
  let createdMetrics = 0;
  let createdClasses = 0;
  let createdSections = 0;

  const metricIdByCode = new Map<string, string>();

  for (let gi = 0; gi < GROUPS.length; gi++) {
    const g = GROUPS[gi];
    let group = await prisma.metricGroup.findUnique({ where: { code: g.code } });
    if (!group) {
      group = await prisma.metricGroup.create({ data: { code: g.code, name: g.name, sortOrder: (gi + 1) * 10, note: g.note } });
      createdGroups++;
      console.log("  + nhóm:", g.name);
    }

    for (let mi = 0; mi < g.metrics.length; mi++) {
      const m = g.metrics[mi];
      let metric = await prisma.metricDefinition.findUnique({ where: { code: m.code } });
      if (!metric) {
        let derivation: any = null;
        if (m.valueKind === "DERIVED" && m.derivation) {
          const terms = m.derivation.terms
            .map((t) => {
              const id = metricIdByCode.get(t.metricCode);
              return id ? { metricId: id, sign: t.sign } : null;
            })
            .filter(Boolean);
          derivation = { terms, includeBaseline: m.derivation.includeBaseline };
        }
        metric = await prisma.metricDefinition.create({
          data: {
            groupId: group.id,
            code: m.code,
            name: m.name,
            unitType: m.unitType,
            unitLabel: m.unitLabel ?? null,
            displayScale: m.displayScale ?? 1,
            decimals: m.decimals ?? 0,
            valueKind: m.valueKind ?? "FLOW",
            derivation: derivation,
            requireConfirm: m.requireConfirm ?? false,
            showOnDashboard: m.showOnDashboard ?? false,
            dashboardOrder: m.dashboardOrder ?? 0,
            allowBackdateDays: m.allowBackdateDays ?? 0,
            expectDaily: m.expectDaily ?? true,
            note: m.note ?? null,
            sortOrder: (mi + 1) * 10,
          },
        });
        createdMetrics++;
      }
      metricIdByCode.set(m.code, metric.id);

      if (m.classifications) {
        for (let ci = 0; ci < m.classifications.length; ci++) {
          const c = m.classifications[ci];
          const dup = await prisma.metricClassification.findUnique({
            where: { metricId_code: { metricId: metric.id, code: c.code } },
          });
          if (!dup) {
            await prisma.metricClassification.create({
              data: { metricId: metric.id, code: c.code, label: c.label, sortOrder: (ci + 1) * 10 },
            });
            createdClasses++;
          }
        }
      }
    }
  }

  for (let si = 0; si < SECTIONS.length; si++) {
    const s = SECTIONS[si];
    const dup = await prisma.narrativeSection.findUnique({ where: { code: s.code } });
    if (!dup) {
      const group = s.groupCode ? await prisma.metricGroup.findUnique({ where: { code: s.groupCode } }) : null;
      await prisma.narrativeSection.create({
        data: { code: s.code, title: s.title, groupId: group?.id ?? null, sortOrder: (si + 1) * 10 },
      });
      createdSections++;
    }
  }

  console.log(
    `SEED DONE — nhóm mới: ${createdGroups}, chỉ tiêu mới: ${createdMetrics}, phân loại mới: ${createdClasses}, mục nhận xét mới: ${createdSections}`
  );
  console.log("Đã có sẵn (không đụng vào):", (await prisma.metricDefinition.count()) - createdMetrics, "chỉ tiêu");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
