/**
 * RED test cho Slice 1: centralize status-transition guard.
 * Kiểm tra pure function assertTaskStatusTransition (chưa tồn tại -> phải FAIL khi chạy).
 * Chạy: npx tsx scripts/test-task-transitions.ts (không cần DB).
 */
import { assertTaskStatusTransition } from "../src/server/task-transitions";

let pass = 0;
let fail = 0;

function expectThrow(name: string, fn: () => void, expectedCode: number) {
  try {
    fn();
    fail++;
    console.log(`[FAIL] ${name}: kỳ vọng lỗi ${expectedCode} nhưng không ném lỗi`);
  } catch (err: any) {
    if (err.statusCode === expectedCode) {
      pass++;
      console.log(`[PASS] ${name}`);
    } else {
      fail++;
      console.log(`[FAIL] ${name}: mã lỗi ${err.statusCode ?? "?"} (kỳ vọng ${expectedCode}): ${err.message}`);
    }
  }
}

function expectOk(name: string, fn: () => void) {
  try {
    fn();
    pass++;
    console.log(`[PASS] ${name}`);
  } catch (err: any) {
    fail++;
    console.log(`[FAIL] ${name}: ném lỗi ngoài ý muốn: ${err.message}`);
  }
}

// P1-1: cán bộ không tự nghiệm thu COMPLETED
expectThrow(
  "non-leader không được set COMPLETED",
  () => assertTaskStatusTransition({ currentStatus: "WAITING_REVIEW", targetStatus: "COMPLETED", deadlineChanged: false, isLeader: false }),
  403
);
expectThrow(
  "non-leader không được set DONE",
  () => assertTaskStatusTransition({ currentStatus: "IN_PROGRESS", targetStatus: "DONE", deadlineChanged: false, isLeader: false }),
  403
);
expectOk(
  "leader được set COMPLETED",
  () => assertTaskStatusTransition({ currentStatus: "WAITING_REVIEW", targetStatus: "COMPLETED", deadlineChanged: false, isLeader: true })
);
// Luồng hợp lệ của cán bộ vẫn mở
expectOk(
  "non-leader được báo hoàn thành WAITING_REVIEW",
  () => assertTaskStatusTransition({ currentStatus: "IN_PROGRESS", targetStatus: "WAITING_REVIEW", deadlineChanged: false, isLeader: false })
);
expectOk(
  "non-leader được cập nhật IN_PROGRESS",
  () => assertTaskStatusTransition({ currentStatus: "NOT_STARTED", targetStatus: "IN_PROGRESS", deadlineChanged: false, isLeader: false })
);
expectThrow(
  "non-leader không được trả WAITING_REVIEW về IN_PROGRESS",
  () => assertTaskStatusTransition({ currentStatus: "WAITING_REVIEW", targetStatus: "IN_PROGRESS", deadlineChanged: false, isLeader: false }),
  403
);
// P1-2: dời hạn trực tiếp
expectThrow(
  "non-leader không được đổi deadline trực tiếp",
  () => assertTaskStatusTransition({ currentStatus: "IN_PROGRESS", targetStatus: null, deadlineChanged: true, isLeader: false }),
  403
);
expectOk(
  "leader được đổi deadline trực tiếp (có ghi lịch sử)",
  () => assertTaskStatusTransition({ currentStatus: "IN_PROGRESS", targetStatus: null, deadlineChanged: true, isLeader: true })
);
// Trạng thái cuối không mở lại tùy tiện
expectThrow(
  "không duyệt lại task đã COMPLETED",
  () => assertTaskStatusTransition({ currentStatus: "COMPLETED", targetStatus: "COMPLETED", deadlineChanged: false, isLeader: true }),
  400
);
expectOk(
  "cập nhật tiến độ thuần túy (không đổi status/deadline) luôn cho phép",
  () => assertTaskStatusTransition({ currentStatus: "IN_PROGRESS", targetStatus: null, deadlineChanged: false, isLeader: false })
);

console.log(`\n== KẾT QUẢ: ${pass} PASS / ${fail} FAIL ==`);
process.exit(fail > 0 ? 1 : 0);
