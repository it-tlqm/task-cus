import { resolveNotificationDisplay } from "../src/lib/notification-display";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean) => {
  if (ok) { pass++; console.log(`[PASS] ${name}`); }
  else { fail++; console.log(`[FAIL] ${name}`); }
};

const base = {
  type: "TASK_WAITING_REVIEW",
  tag: "CHỜ NGHIỆM THU",
  tagType: "warning" as const,
  title: "Nhiệm vụ chờ nghiệm thu: [T-001]",
  content: "Chờ nghiệm thu",
  actionUrl: "/approvals",
  actionLabel: "Nghiệm thu kết quả",
  task: { id: "task-1", code: "T-001", title: "Kiểm tra hồ sơ", status: "WAITING_REVIEW" },
};

const waiting = resolveNotificationDisplay(base);
check("Chờ duyệt giữ nhãn", waiting.tag === "CHỜ NGHIỆM THU" && waiting.tagType === "warning");

const approved = resolveNotificationDisplay({ ...base, task: { ...base.task, status: "COMPLETED" } });
check("Đã duyệt đổi nhãn", approved.tag === "ĐÃ PHÊ DUYỆT" && approved.tagType === "success");
check("Đã duyệt đổi tiêu đề", approved.title.includes("đã được phê duyệt"));
check("Đã duyệt mở trang nhiệm vụ", approved.actionUrl === "/tasks/task-1");

const done = resolveNotificationDisplay({ ...base, task: { ...base.task, status: "DONE" } });
check("DONE cũng là đã duyệt", done.tag === "ĐÃ PHÊ DUYỆT");

const canceled = resolveNotificationDisplay({ ...base, task: { ...base.task, status: "CANCELED" } });
check("Đã hủy đổi nhãn", canceled.tag === "ĐÃ HỦY" && canceled.tagType === "danger");

const returned = resolveNotificationDisplay({ ...base, task: { ...base.task, status: "IN_PROGRESS" } });
check("Trả lại đổi nhãn", returned.tag === "ĐÃ XỬ LÝ");

const noTask = resolveNotificationDisplay({ ...base, task: null });
check("Không tìm thấy nhiệm vụ thì giữ nguyên", noTask.tag === "CHỜ NGHIỆM THU");

const otherType = resolveNotificationDisplay({ ...base, type: "TASK_COMPLETED" });
check("Thông báo khác không bị đổi", otherType.tag === "CHỜ NGHIỆM THU");

console.log(`\nKẾT QUẢ: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
