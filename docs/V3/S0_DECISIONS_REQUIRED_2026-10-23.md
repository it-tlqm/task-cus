# S0 — QUYẾT ĐỊNH CẦN CHỦ DỰ ÁN CHỐT (SAU HANDOFF S3/S6)

**Ngày:** 23/10/2026  
**Trạng thái:** S0 đã review handoff S3 và S6; **không merge code**; chờ quyết định nghiệp vụ.  
**Nguyên tắc:** S0 không tự chốt quy tắc nghiệp vụ; chỉ chốt phần điều phối/kỹ thuật được master plan cho phép.

---

## 1. Kết quả review handoff

| Session | HEAD | Phạm vi thay đổi | Test S0 đã chạy | Kết luận |
|---|---|---|---|---|
| **S3 — Phase C** | `8af7a66` | Docs + 1 script đọc DB read-only + 1 pure test; **không schema/API** | `test-phase-c-contract-proposal.ts`: **43/43 PASS**; `tsc --noEmit`: **PASS** | **WAIT_CONTRACT** — chưa merge |
| **S6 — Business Spec** | `af197d7` | Chỉ 2 tài liệu spec/handoff; **không code/schema/migration/DB** | Docs-only; không có runtime test | **SPEC COMPLETE** — chưa merge |

Cả hai worktree sạch; `PRODUCTION_TOUCHED: NO`.

---

## 2. Phần S0 đã chốt (điều phối/kỹ thuật)

Các mục này không thay đổi quy tắc nghiệp vụ:

1. **Q3 — owner schema/API:** chọn **A**. S2 sở hữu schema shared + `src/server/metrics.ts`; sau khi S2 merge schema, S3 chỉ sửa target UI/helper/test trong phạm vi được giao. S3 không sửa `metrics.ts`/schema trước contract.
2. **Q7 — cảnh báo “Thiếu N ngày”:** chưa bật khi chưa có lịch nghiệp vụ; hiển thị “Số ngày có bản ghi” và khoảng dữ liệu thực tế. Không đổi `expectDaily` hàng loạt.
3. **Q11 — định dạng:** giữ 2 chữ số thập phân, dấu `,` vi-VN; không tính thì `—` + lý do, không hiển thị `0%`.
4. **Q12 — phạm vi hiển thị:** `/giao-ban` trước; Dashboard/báo cáo Word chỉ sau khi UX/lãnh đạo chốt.
5. **Guardrail S6:** không tạo `TEAM_LEADER`/`DEPUTY_LEADER`, không seed `person_supervisions`, không đưa quality vào QĐ1277/Bảng 1, không mặc định 100%.

---

## 3. Quyết định nghiệp vụ cần chủ dự án chốt — S3 (YC-06/07)

| Mã | Câu hỏi | Đề xuất S3 | Ảnh hưởng nếu chưa chốt |
|---|---|---|---|
| **Q1** | Phạm vi chỉ tiêu: toàn cục hay theo đơn vị/phòng ban? | Toàn cục cho MVP; per-unit là migration riêng | Không xác định được schema target/entry |
| **Q2** | Target có cần `DRAFT → CONFIRMED`? | Có nếu % dùng chính thức; cho tạm tính khi DRAFT | Không xác định target nào được tính % |
| **Q4** | Chính sách %: target 0/âm, thiếu kỳ, chưa xác nhận, làm tròn | Không tính khi thiếu/0/âm; 2 chữ số; 0 đã xác nhận + target >0 = 0,00% | UI/API dễ trả 0% hoặc % sai |
| **Q5** | Một enum hay hai trục `recordState + coverage`? | Hai trục, map 6 nhãn | Không biểu diễn được thiếu kỳ/không phát sinh/không áp dụng |
| **Q6** | Nghĩa lũy kế/snapshot cho `PHI_*`, `XOA_NO`, `NO_THUE`, `TV_CHO` | `measureMode`/`baselineScope` tường minh; chưa chốt thì “chưa có quy tắc” | Nguy cơ cộng trùng hoặc sai kỳ |
| **Q8** | Quyền target: `isMetricsAdmin` hay quyền riêng? | Quyền nghiệp vụ riêng; SYSTEM_ADMIN không mặc nhiên | Vi phạm nguyên tắc không dùng `system.config` |
| **Q9** | Cờ DEMO/chính thức ở API | `isOfficial`/`dataSource`; không regex `[DEMO]` | Số DEMO có thể lọt báo cáo |
| **Q10** | Danh sách chỉ tiêu giao, chu kỳ, chiều đánh giá (C1) | `PENDING_C1`; không tự gán | Không thể tính đạt/vượt chính thức |

**Q3, Q7, Q11, Q12:** S0 đã chốt theo mục 2.

---

## 4. Quyết định nghiệp vụ cần chủ dự án chốt — S6 (YC-09/10/11)

| Mã | Câu hỏi | Đề xuất S6 |
|---|---|---|
| **E9.1** | Per-person chỉ cho Task hay cả PersonalWorkItem có phân công? | Chỉ Task giai đoạn 1 |
| **E9.2** | Chủ trì nộp chung khi nào? | Khi tất cả phần bắt buộc đã báo; ngoại lệ có audit |
| **E9.4** | Collaborator có được ghi nhận điểm tháng? | Không giai đoạn 1, tránh tính trùng |
| **E10.1** | Quality cho kết quả Task hay từng người? | Kết quả Task |
| **E10.2** | Bắt buộc chọn quality khi AGREE? | Bắt buộc với `TASK_RESULT`; không với REJECT/CLARIFY |
| **E10.5** | Quality chỉ hiển thị hay vào điểm/export chính thức? | Chỉ hiển thị/audit/sheet phụ giai đoạn 1 |
| **E11.1** | “Nhóm/đội” là bộ phận hiện tại, tổ nhỏ hơn hay tổ chức năng? | Bộ phận cấp 2 hiện tại |
| **E11.2** | Phó có quyền quyết định cuối khi Trưởng vắng? | Chỉ pre-check; quyết định cuối cần ủy quyền chính thức |
| **E11.4** | Thiếu tuyến thì chờ phân tuyến hay fallback? | Chờ phân tuyến; không fallback/không seed |

Các câu còn lại: E9.3/E9.5/E9.6, E10.3/E10.4/E10.6/E10.7, E11.3/E11.5–E11.9, P-1–P-5 trong spec S6.

---

## 5. Trạng thái sau review

- S3: **WAIT_CONTRACT**, không merge; có thể tiếp tục **target UI + pure helper + test** nếu S0 cho phép contract tối thiểu, nhưng chưa sửa schema/API shared.
- S6: **SPEC COMPLETE**, không merge code; chờ quyết định E9/E10/E11.
- S1/S2/S4/S5: vẫn đang triển khai; S0 chưa nhận handoff.
- Không merge `main`, không push, không deploy Production.

**Đề nghị chủ dự án:** chốt trước nhóm S3 Q1/Q2/Q4/Q5/Q6/Q8/Q9/Q10 và S6 E9.1/E9.2/E9.4/E10.1/E10.2/E10.5/E11.1/E11.2/E11.4. Sau đó S0 cập nhật mục 13 và giao implementation.
