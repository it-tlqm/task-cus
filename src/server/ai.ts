/**
 * AI hỗ trợ (Gemini) — chỉ gợi ý/tóm tắt, KHÔNG quyết định thay người.
 * - Không gửi điểm cá nhân, không gửi cả DB: chỉ văn bản người dùng dán + số tổng hợp.
 * - Thiếu API key → mọi endpoint trả {enabled:false}, UI tự ẩn nút.
 */
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export function aiEnabled(): boolean {
  return !!process.env.GOOGLE_GENERATIVE_AI_KEY;
}

async function callGemini(prompt: string): Promise<string> {
  const key = process.env.GOOGLE_GENERATIVE_AI_KEY;
  if (!key) throw new Error("Máy chủ chưa cấu hình AI (thiếu API key)");
  // Model cố định trong code: Flash mới nhất (chất lượng tốt, ~20 lượt/ngày miễn phí),
  // hết lượt (429) → tự lùi Flash Lite (~500 lượt/ngày), người dùng không thấy gián đoạn.
  const tryModels = ["gemini-flash-latest", "gemini-flash-lite-latest"];
  let lastErr = "";
  for (const model of tryModels) {
    const res = await fetch(`${API_BASE}/${model}:generateContent`, {
      method: "POST",
      // Header theo khuyến nghị của Google (thay cho ?key= trên URL)
      headers: { "Content-Type": "application/json", "X-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
      }),
    });
    if (res.ok) {
      const json = await res.json();
      const text = json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
      if (text.trim()) return text.trim();
      lastErr = "AI trả về rỗng";
      continue;
    }
    lastErr = `AI lỗi ${res.status}`;
    if (res.status === 429 || res.status >= 500) continue; // thử model dự phòng
    const detail = await res.text().catch(() => "");
    throw new Error(`AI lỗi ${res.status}: ${detail.slice(0, 200)}`);
  }
  throw new Error(lastErr || "AI bận, thử lại sau");
}

/** Soạn nháp chỉ đạo từ vài từ khóa của người giao việc. */
export async function draftDirective(idea: string): Promise<{ title: string; content: string }> {
  const raw = await callGemini(
    `Bạn hỗ trợ cán bộ Hải quan cửa khẩu soạn ý chỉ đạo công việc. Từ ý tưởng sau, viết NGẮN GỌN:\n` +
    `Dòng 1 bắt đầu bằng "TIÊUĐỀ: " là tên đầu việc (dưới 80 ký tự, rõ việc + đối tượng).\n` +
    `Các dòng sau bắt đầu bằng "NỘIDUNG: " là 2-4 câu: việc cần làm, yêu cầu cụ thể, kết quả mong muốn.\n` +
    `Tiếng Việt, giọng văn bản hành chính, không thêm lời chào/kết luận.\nÝ tưởng: ${idea.slice(0, 500)}`
  );
  const titleM = raw.match(/TIÊUĐỀ:\s*(.+)/);
  const contentM = raw.match(/NỘIDUNG:\s*([\s\S]+)/);
  return {
    title: (titleM?.[1] || "").trim().slice(0, 120),
    content: (contentM?.[1] || raw).trim().slice(0, 1000),
  };
}

/** Tách biên bản thô thành các đầu việc kết luận (1 dòng 1 việc). */
export async function extractConclusions(minutes: string): Promise<string[]> {
  const raw = await callGemini(
    `Bạn đọc biên bản họp giao ban Hải quan và trích các KẾT LUẬN GIAO VIỆC (việc phải làm, có người chịu trách nhiệm hoặc hạn).\n` +
    `Trả về MỖI kết luận 1 dòng, mỗi dòng bắt đầu bằng "- ". Không đánh số khác, không thêm lời dẫn/kết, tối đa 20 dòng, mỗi dòng dưới 200 ký tự.\n` +
    `Bỏ qua nội dung báo cáo thuần túy không phát sinh việc.\nBiên bản:\n${minutes.slice(0, 4000)}`
  );
  return raw
    .split("\n")
    .map((l) => l.replace(/^[-\s*•\d.)\s]+/, "").trim())
    .filter((l) => l.length >= 5)
    .slice(0, 20);
}
export async function summarizePeriod(input: {
  label: string;
  total: number; completed: number; inProgress: number; overdue: number;
  waiting: number; leaveApproved: number; onDutyNotes?: string;
}): Promise<string> {
  const donePct = input.total > 0 ? Math.round((input.completed / input.total) * 100) : 100;
  return callGemini(
    `Bạn viết báo cáo giao ban cho Hải quan cửa khẩu. Từ số liệu sau, viết 1 đoạn 5-7 câu tiếng Việt, ` +
    `giọng hành chính ngắn gọn: nêu kết quả, điểm tồn tại (trễ/chờ duyệt), và 1 câu kiến nghị. ` +
    `Không bịa thêm số liệu ngoài số đã cho, không xếp loại cá nhân.\n` +
    `Kỳ: ${input.label}. Tổng đầu việc: ${input.total}. Hoàn thành: ${input.completed} (${donePct}%). ` +
    `Đang làm: ${input.inProgress}. Quá hạn: ${input.overdue}. Chờ duyệt: ${input.waiting}. ` +
    `Lượt nghỉ đã duyệt: ${input.leaveApproved}.${input.onDutyNotes ? ` Ghi chú trực: ${input.onDutyNotes.slice(0, 200)}` : ""}`
  );
}
