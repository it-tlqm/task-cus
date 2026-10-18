/**
 * YC-24 — Danh mục vị trí/nhiệm vụ chuẩn theo mẫu "Sổ phân công nhiệm vụ công tác giám sát quản lý"
 * (docs/Dữ liệu-file-hai-quan-gui/so phan cong nhiem vu.xls — sheet ND, 8 nhóm nhiệm vụ).
 *
 * Nguyên tắc:
 * - Thứ tự = số TT trên biểu in; số ô (người) và nhãn ô bám ĐÚNG mẫu, không tự suy diễn thêm.
 * - Bản ghi phân công lưu BẢN SAO tiêu đề/nhãn tại thời điểm phân công, nên chỉnh danh mục
 *   về sau không làm thay đổi lịch sử phân công đã ghi.
 */

export interface DutySlotDef {
  /** Khóa ô trong vị trí (ổn định): s1, s2, nc, xc, t1..t6 */
  k: string;
  /** Nhãn hiển thị trên biểu (null = ô không nhãn, chỉ là dòng "Đ/c ...") */
  l: string | null;
}

export interface DutyPositionDef {
  id: string;
  code: string;
  title: string;
  detail: string | null;
  slots: DutySlotDef[];
  sortOrder: number;
}

/** 8 nhóm nhiệm vụ theo đúng mẫu Excel (cột "Nhiệm vụ được phân công"). */
export const DUTY_POSITION_SEEDS: DutyPositionDef[] = [
  {
    id: "yc24-pos-01",
    code: "YC24-01",
    title: "Trực lãnh đạo",
    detail: null,
    slots: [{ k: "s1", l: null }],
    sortOrder: 1,
  },
  {
    id: "yc24-pos-02",
    code: "YC24-02",
    title: "Đăng ký tờ khai hải quan:",
    detail: "Kiểm tra Thuế, lệ phí HQ & Đối chiếu phí cơ sở hạ tầng",
    slots: [
      { k: "s1", l: null },
      { k: "s2", l: null },
    ],
    sortOrder: 2,
  },
  {
    id: "yc24-pos-03",
    code: "YC24-03",
    title: "Tiếp nhận, kiểm tra hồ sơ hải quan",
    detail: null,
    slots: [
      { k: "s1", l: null },
      { k: "s2", l: null },
    ],
    sortOrder: 3,
  },
  {
    id: "yc24-pos-04",
    code: "YC24-04",
    title: "Trả hồ sơ hải quan",
    detail: null,
    slots: [{ k: "s1", l: null }],
    sortOrder: 4,
  },
  {
    id: "yc24-pos-05",
    code: "YC24-05",
    title: "Giám sát hàng hóa XNK & PTVT (Barie số 1)",
    detail: null,
    slots: [
      { k: "s1", l: null },
      { k: "s2", l: null },
    ],
    sortOrder: 5,
  },
  {
    id: "yc24-pos-06",
    code: "YC24-06",
    title: "Giám sát hành lý, hàng hóa của CDBG, hành khách XNC & máy soi hành lý",
    detail: null,
    slots: [
      { k: "nc", l: "NC" },
      { k: "xc", l: "XC" },
    ],
    sortOrder: 6,
  },
  {
    id: "yc24-pos-07",
    code: "YC24-07",
    title: "Trực CNTT (hồi báo/ IT)",
    detail: null,
    slots: [{ k: "s1", l: null }],
    sortOrder: 7,
  },
  {
    id: "yc24-pos-08",
    code: "YC24-08",
    title: "Trực trưa:",
    detail: null,
    slots: [
      { k: "t1", l: "Vị trí cửa Nhập cảnh" },
      { k: "t2", l: "Vị trí cửa Xuất cảnh" },
      { k: "t3", l: "Vị trí Barie số 1" },
      { k: "t4", l: "Vị trí bãi Phú Anh" },
      { k: "t5", l: "Vị trí bãi Sơn Cảng" },
      { k: "t6", l: "Vị trí bãi BA & XNK" },
    ],
    sortOrder: 8,
  },
];

/** Đọc an toàn cột slots (Json) từ DB về mảng DutySlotDef. */
export function parseSlots(raw: unknown): DutySlotDef[] {
  if (!Array.isArray(raw)) return [];
  const out: DutySlotDef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const k = String((item as any).k ?? "").trim();
    if (!k) continue;
    const lRaw = (item as any).l;
    const l = lRaw === null || lRaw === undefined ? null : String(lRaw);
    out.push({ k, l });
  }
  return out;
}

/** Khóa chống trùng ô: "<positionId>#<slotOrder>" — NULL với bản ghi cũ không thuộc biểu. */
export function slotKeyOf(positionId: string, slotOrder: number): string {
  return `${positionId}#${slotOrder}`;
}

/** Chuẩn hóa + kiểm tra dữ liệu ô do người dùng nhập (tối đa 12 ô/vị trí, khóa không trùng). */
export function validateSlotsInput(
  raw: unknown
): { ok: true; slots: DutySlotDef[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: "Danh sách ô phải là mảng có ít nhất 1 ô" };
  }
  if (raw.length > 12) {
    return { ok: false, error: "Một vị trí tối đa 12 ô" };
  }
  const seen = new Set<string>();
  const slots: DutySlotDef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return { ok: false, error: "Ô không hợp lệ" };
    const k = String((item as any).k ?? "").trim();
    if (!k || k.length > 20) return { ok: false, error: "Khóa ô không hợp lệ (1–20 ký tự)" };
    if (seen.has(k)) return { ok: false, error: `Khóa ô bị trùng: ${k}` };
    seen.add(k);
    const lRaw = (item as any).l;
    const l = lRaw === null || lRaw === undefined || String(lRaw).trim() === "" ? null : String(lRaw).trim();
    if (l && l.length > 120) return { ok: false, error: "Nhãn ô quá dài (tối đa 120 ký tự)" };
    slots.push({ k, l });
  }
  return { ok: true, slots };
}
