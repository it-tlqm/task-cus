"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "@/components/ui/Toast";
import { getCurrentPeriodLabels } from "@/lib/period-helper";
import { usePermissions } from "@/hooks/usePermissions";

interface DrilldownTask {
  id: string;
  code: string;
  title: string;
  category: string;
  officer: string;
  department: string;
  shiftTime: string;
  priority: "Cao" | "Trung bình" | "Thấp";
  status: "Hoàn thành" | "Đang thực hiện" | "Vướng mắc" | "Không phát sinh";
  expectedResult: string;
  actualResult: string;
  vouchers: { number: string; company: string; status: string }[];
  auditLog: { time: string; action: string }[];
}

function mapDbTaskToDrilldown(t: any): DrilldownTask {
  const priorityMap: Record<string, "Cao" | "Trung bình" | "Thấp"> = {
    Cao: "Cao",
    HIGH: "Cao",
    "Trung bình": "Trung bình",
    MEDIUM: "Trung bình",
    Thấp: "Thấp",
    LOW: "Thấp",
  };
  const statusMap: Record<string, any> = {
    COMPLETED: "Hoàn thành",
    IN_PROGRESS: "Đang thực hiện",
    WAITING_REVIEW: "Đang thực hiện",
    HAS_ISSUE: "Vướng mắc",
  };
  const updates = Array.isArray(t.updates) ? t.updates : [];
  return {
    id: t.code || (t.id ? t.id.slice(0, 8) : "TASK-001"),
    code: t.code || `TASK-${(t.id || "").slice(0, 6)}`,
    title: t.title || "Nhiệm vụ nghiệp vụ Hải quan",
    category: t.unit?.name || "1. Thủ tục hải quan (TTHQ)",
    officer: t.owner?.fullName || "Cán bộ tác nghiệp",
    department: t.unit?.name || "Hải quan cửa khẩu Quốc tế Tà Lùng",
    shiftTime: t.createdAt
      ? new Date(t.createdAt).toLocaleDateString("vi-VN", {
          weekday: "long",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })
      : "Ca trực nghiệp vụ",
    priority: priorityMap[t.priority] || "Trung bình",
    status: t.hasIssue ? "Vướng mắc" : (statusMap[t.status] || "Đang thực hiện"),
    expectedResult: t.expectedResultText || "Theo quy chuẩn nghiệp vụ Hải quan",
    actualResult:
      t.actualResultText ||
      (t.status === "COMPLETED"
        ? "Đã hoàn thành 100% chỉ tiêu kế hoạch"
        : "Đang tiếp tục triển khai trong ca trực"),
    vouchers: t.code
      ? [
          {
            number: t.code,
            company: t.unit?.name || "Đơn vị Hải quan cửa khẩu Quốc tế Tà Lùng",
            status: t.status === "COMPLETED" ? "ĐÃ THÔNG QUAN" : "ĐANG XỬ LÝ",
          },
        ]
      : [],
    auditLog:
      updates.length > 0
        ? updates.map((u: any) => ({
            time: new Date(u.createdAt).toLocaleString("vi-VN"),
            action: `${u.author?.fullName || "Cán bộ"}: ${u.notes || "Cập nhật tiến độ"} (${u.statusAfter || ""})`,
          }))
        : [
            {
              time: t.createdAt ? new Date(t.createdAt).toLocaleString("vi-VN") : "Hôm nay",
              action: `Tiếp nhận và khởi tạo đầu việc ${t.code || ""}`,
            },
            {
              time: t.updatedAt ? new Date(t.updatedAt).toLocaleString("vi-VN") : "Hôm nay",
              action: `Ghi nhận trạng thái: ${t.status || "Đang thực hiện"}`,
            },
          ],
  };
}

function ReportsContent() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as "preview" | "builder" | "snapshots") || "preview";

  const [activeTab, setActiveTab] = useState<"preview" | "builder" | "snapshots">(initialTab);
  const [period, setPeriod] = useState<"today" | "week" | "month" | "quarter">("week");
  const periodLabels = React.useMemo(() => {
    const base = getCurrentPeriodLabels();
    const q = Math.floor((base.month - 1) / 3) + 1;
    return { ...base, quarterShort: `Quý ${["I", "II", "III", "IV"][q - 1]}/${base.year}` };
  }, []);
  const [selectedUnit, setSelectedUnit] = useState("all");
  const [selectedOfficer, setSelectedOfficer] = useState("all");
  const [selectedTemplate, setSelectedTemplate] = useState("legacy");
  const [drilldownTask, setDrilldownTask] = useState<DrilldownTask | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [filterExpanded, setFilterExpanded] = useState(false);

  // Dynamic real data from PostgreSQL
  const [dbTasks, setDbTasks] = useState<any[]>([]);
  const [dbSummary, setDbSummary] = useState<any>(null);
  const [dbUnits, setDbUnits] = useState<any[]>([]);
  const [dbOfficers, setDbOfficers] = useState<any[]>([]);

  const [snapshotsList, setSnapshotsList] = useState<any[]>([]);
  const [availablePeriods, setAvailablePeriods] = useState<any[]>([]);
  const [isLockModalOpen, setIsLockModalOpen] = useState(false);
  const [selectedPeriodToLock, setSelectedPeriodToLock] = useState<string>("");
  const [lockNotes, setLockNotes] = useState<string>("");
  const [isLocking, setIsLocking] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);

  const [viewingSnapshot, setViewingSnapshot] = useState<any | null>(null);
  const [isVerifyingSnapshot, setIsVerifyingSnapshot] = useState(false);
  const [verificationFeedback, setVerificationFeedback] = useState<any | null>(null);

  // Builder mẫu báo cáo: cấu hình thật lưu trong system_configs (key reportBuilderConfig)
  const [builderConfig, setBuilderConfig] = useState({
    grouping: "week",
    showNotOccurredLabel: true,
    highlightNotOccurred: true,
    wrapText: true,
  });
  const [isSavingBuilder, setIsSavingBuilder] = useState(false);
  const [isPreviewingBuilder, setIsPreviewingBuilder] = useState(false);
  const { canExport, canLock, can } = usePermissions();
  const canEditBuilderConfig = can("system.config");

  const loadBuilderConfig = async () => {
    try {
      const res = await fetch("/api/admin/system/config");
      if (!res.ok) return;
      const json = await res.json();
      const found = (json.data || []).find((c: any) => c.key === "reportBuilderConfig");
      if (found?.value) {
        const parsed = JSON.parse(found.value);
        setBuilderConfig((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // giữ mặc định
    }
  };

  const handleSaveBuilderConfig = async () => {
    setIsSavingBuilder(true);
    try {
      const res = await fetch("/api/admin/system/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "reportBuilderConfig", value: JSON.stringify(builderConfig) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Không thể lưu cấu hình mẫu");
      showToast("Đã lưu cấu hình mẫu báo cáo vào hệ thống", "success");
    } catch (err: any) {
      showToast(err.message || "Lỗi khi lưu cấu hình mẫu", "error");
    } finally {
      setIsSavingBuilder(false);
    }
  };

  // Xem trước: kết xuất file thật từ dữ liệu hiện tại và mở tab mới
  const handlePreviewBuilderFile = async () => {
    setIsPreviewingBuilder(true);
    try {
      const res = await fetch(`/api/reports/export?template=${selectedTemplate}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Không thể kết xuất file xem trước");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(new Blob([blob], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      window.open(url, "_blank");
      showToast("Đã mở file mẫu xem trước trong tab mới", "success");
    } catch (err: any) {
      showToast(err.message || "Lỗi khi xem trước file mẫu", "error");
    } finally {
      setIsPreviewingBuilder(false);
    }
  };

  const loadData = () => {
    // 1. Fetch real snapshots & available periods from PostgreSQL
    fetch("/api/reports/snapshots")
      .then((res) => {
        if (!res.ok) throw new Error("Không thể tải danh sách bản chụp số liệu");
        return res.json();
      })
      .then((data) => {
        if (data.success) {
          if (Array.isArray(data.snapshots)) {
            setSnapshotsList(data.snapshots);
          }
          if (Array.isArray(data.availablePeriods)) {
            setAvailablePeriods(data.availablePeriods);
            const firstUnlock = data.availablePeriods.find((p: any) => !p.isLocked && !p.hasSnapshot);
            if (firstUnlock) {
              setSelectedPeriodToLock(firstUnlock.id);
            } else if (data.availablePeriods.length > 0) {
              setSelectedPeriodToLock(data.availablePeriods[0].id);
            }
          }
        }
      })
      .catch((err) => console.log("Fetch snapshots error:", err));

    // 2. Fetch summary KPIs
    fetch("/api/reports/summary")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.summary) {
          setDbSummary(data.summary);
        }
      })
      .catch((err) => console.log("Fetch summary error:", err));

    // 3. Fetch tasks
    fetch("/api/tasks?pageSize=100")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data) && data.data.length > 0) {
          setDbTasks(data.data);
        }
      })
      .catch((err) => console.log("Fetch tasks error:", err));

    // 4. Fetch units
    fetch("/api/org-units/tree")
      .then((res) => res.json())
      .then((data) => {
        const units = data.flatList || data.data || [];
        if (Array.isArray(units) && units.length > 0) {
          setDbUnits(units);
        }
      })
      .catch((err) => console.log("Fetch units error:", err));

    // 5. Fetch officers
    fetch("/api/people")
      .then((res) => res.json())
      .then((data) => {
        const people = Array.isArray(data) ? data : data.data || [];
        if (Array.isArray(people) && people.length > 0) {
          setDbOfficers(people);
        }
      })
      .catch((err) => console.log("Fetch officers error:", err));
  };

  useEffect(() => {
    loadData();
    loadBuilderConfig();
  }, []);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "builder" || tab === "snapshots" || tab === "preview") {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const showToast = (msg: string, type: "success" | "info" | "warning" | "error" = "info") => {
    setToastMsg(msg);
    if (type === "success") {
      toast.success(msg);
    } else if (type === "error") {
      toast.error(msg);
    } else if (type === "warning") {
      toast.warning(msg);
    } else {
      toast.info(msg);
    }
    setTimeout(() => {
      setToastMsg(null);
    }, 3500);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && drilldownTask) {
        setDrilldownTask(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [drilldownTask]);

  const handleExportXlsx = async (template: "legacy" | "detailed" = "legacy") => {
    setIsExporting(true);
    try {
      const res = await fetch(`/api/reports/export?template=${template}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        showToast(errorData.error || "Không thể xuất file báo cáo (Yêu cầu thẩm quyền)", "error");
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition");
      let filename = template === "legacy" ? "BaoCao_KeHoachTuan_MauA_HQTL.xlsx" : "BaoCao_ChiTiet_DauViec_MauB_HQTL.xlsx";
      if (disposition && disposition.includes("filename=")) {
        const match = disposition.match(/filename="?([^";]+)"?/);
        if (match && match[1]) filename = match[1];
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast(`Đã xuất và tải về thành công tệp Excel: ${filename}`, "success");
    } catch (err: any) {
      showToast(err.message || "Lỗi mạng khi tải file Excel", "error");
    } finally {
      setIsExporting(false);
    }
  };

  const handleOpenLockModal = () => {
    setLockError(null);
    setIsLockModalOpen(true);
  };

  const handleConfirmLock = async () => {
    setIsLocking(true);
    setLockError(null);
    try {
      const res = await fetch("/api/reports/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodId: selectedPeriodToLock || undefined,
          notes: lockNotes.trim() || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setLockError(data.error || "Không thể chốt kỳ số liệu");
        showToast(data.error || "Không thể chốt kỳ số liệu", "error");
        return;
      }

      showToast(`Đã chốt và khóa thành công số liệu ${data.snapshot.periodTitle}! Mã băm SHA-256: ${data.snapshot.checksum}`, "success");
      setIsLockModalOpen(false);
      setLockNotes("");
      loadData();
      setActiveTab("snapshots");
    } catch (err: any) {
      setLockError(err.message || "Lỗi kết nối khi gửi yêu cầu chốt kỳ");
      showToast(err.message || "Lỗi kết nối khi gửi yêu cầu chốt kỳ", "error");
    } finally {
      setIsLocking(false);
    }
  };

  const handleExportSnapshotXlsx = async (snapshotId: string, template: "legacy" | "detailed" = "detailed") => {
    try {
      showToast("Đang kết xuất báo cáo Excel từ bản chụp đã chốt...", "info");
      const url = `/api/reports/export?snapshotId=${snapshotId}&template=${template}`;
      const res = await fetch(url);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Không thể tải báo cáo từ bản chụp");
      }
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      const contentDisposition = res.headers.get("content-disposition");
      let filename = `BaoCao_Snapshot_${template}.xlsx`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) filename = match[1];
      }
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
      showToast(`Đã xuất và tải về thành công: ${filename}`, "success");
    } catch (err: any) {
      showToast(err.message || "Lỗi tải tệp báo cáo", "error");
    }
  };

  const handleVerifySnapshot = async (snapshotId: string) => {
    setIsVerifyingSnapshot(true);
    try {
      const res = await fetch(`/api/reports/snapshots/${snapshotId}/verify`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Lỗi khi xác minh bản chụp");
      }
      setVerificationFeedback(data);
      if (data.isValid) {
        showToast("Mã SHA-256 hoàn toàn trùng khớp với nội dung bản chụp đã lưu!", "success");
      } else {
        showToast("CẢNH BÁO: Phát hiện sai lệch mã băm so với nội dung lưu trữ!", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Lỗi khi xác minh", "error");
    } finally {
      setIsVerifyingSnapshot(false);
    }
  };

  const filteredDbTasks = dbTasks.filter((t: any) => {
    if (selectedUnit !== "all" && t.unitId !== selectedUnit) return false;
    if (selectedOfficer !== "all" && t.ownerId !== selectedOfficer) return false;
    return true;
  });

  return (
    <div className="flex flex-col w-full p-space-md lg:p-space-lg pb-16">
      {/* DESKTOP TOP BAR (Hidden on Mobile) */}
      <div className="hidden lg:flex flex-col 2xl:flex-row 2xl:items-center justify-between gap-space-md mb-space-lg">
        <div className="flex flex-col gap-space-xs min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-label-sm font-semibold bg-primary text-on-primary whitespace-nowrap">
              TALUNG-CUS-WORK
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-label-sm font-semibold bg-secondary-fixed text-on-secondary-fixed-variant whitespace-nowrap">
              HẢI QUAN CỬA KHẨU QUỐC TẾ TÀ LÙNG
            </span>
            <span className="font-label-sm text-outline whitespace-nowrap">• Phân hệ Thống kê &amp; Trích xuất số liệu</span>
          </div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
            Trung Tâm Báo Cáo, Thống Kê &amp; Quản Trị Mẫu Xuất XLSX
          </h1>
          <p className="font-body-md text-on-surface-variant">
            Tra cứu động, kiểm soát chốt kỳ báo cáo nghiệp vụ và chuẩn hóa cấu trúc mẫu bảng tính theo chỉ đạo cấp Cục
          </p>
        </div>

        {/* Desktop Action Area */}
        <div data-tour="export-btns" className="flex flex-wrap items-center gap-space-sm shrink-0">
          <button
            onClick={() => setFilterExpanded(!filterExpanded)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded bg-surface-container-low text-on-surface-variant font-label-md hover:bg-surface-container-high transition-colors active-press"
          >
            <span className="material-symbols-outlined text-[18px]">filter_list</span>
            <span>{filterExpanded ? "Ẩn bộ lọc" : "Bộ lọc nâng cao"}</span>
          </button>
          {canLock && (
            <button
              onClick={handleOpenLockModal}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded bg-surface-container text-primary font-label-md hover:bg-surface-container-high transition-colors active-press"
            >
              <span className="material-symbols-outlined text-[18px]">lock_clock</span>
              <span>Chốt số liệu kỳ này</span>
            </button>
          )}
          {canExport && (
            <button
              onClick={() => handleExportXlsx("legacy")}
              disabled={isExporting}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded bg-secondary text-on-secondary font-body-semibold shadow-sm hover:opacity-95 transition-all active-press disabled:opacity-50"
              title="Xuất theo mẫu gốc Kế hoạch công tác.xlsx (8 cột)"
            >
              <span className={`material-symbols-outlined text-[18px] ${isExporting ? "animate-spin" : ""}`}>
                {isExporting ? "refresh" : "download"}
              </span>
              <span>Mẫu A (Kế hoạch tuần gốc)</span>
            </button>
          )}
          {canExport && (
            <button
              onClick={() => handleExportXlsx("detailed")}
              disabled={isExporting}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded bg-primary text-on-primary font-body-semibold shadow-sm hover:opacity-95 transition-all active-press disabled:opacity-50"
              title="Xuất chi tiết danh mục đầu việc theo từng cán bộ"
            >
              <span className={`material-symbols-outlined text-[18px] ${isExporting ? "animate-spin" : ""}`}>
                {isExporting ? "refresh" : "table_view"}
              </span>
              <span>Mẫu B (Chi tiết đầu việc)</span>
            </button>
          )}
        </div>
      </div>

      {/* MOBILE HEADER STRIP (Visible only on mobile) */}
      <div className="lg:hidden flex flex-col gap-space-xs mb-3">
        <div className="bg-status-warning-bg p-space-sm rounded-lg flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-space-xs">
            <span className="material-symbols-outlined text-status-warning text-[18px]">
              radio_button_checked
            </span>
            <span className="font-label-sm text-label-sm text-status-warning uppercase tracking-wide font-semibold">
              Kỳ {periodLabels.weekShort}: DỮ LIỆU ĐANG MỞ (Thời gian thực)
            </span>
          </div>
          <span className="font-label-sm text-label-sm text-on-surface-variant flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-status-warning"></span>
            Trực tuyến
          </span>
        </div>
        <div className="bg-surface-subtle p-space-sm rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-space-xs truncate">
            <span className="material-symbols-outlined text-status-success text-[16px]">verified_user</span>
            <span className="font-label-sm text-label-sm text-on-surface-variant truncate">
              Tuần 40: ĐÃ CHỐT SỐ LIỆU
            </span>
          </div>
          <div className="flex items-center gap-1 bg-surface-container-highest px-1.5 py-0.5 rounded">
            <span className="font-label-sm text-label-sm text-primary font-mono text-[10px]">MD5: e78f..4b1a</span>
            <span className="material-symbols-outlined text-status-inactive text-[12px]">lock</span>
          </div>
        </div>
      </div>

      {/* VIEW TABS BAR */}
      <div className="flex items-center gap-1 p-1 bg-surface-container-low rounded-xl mb-space-lg w-fit max-w-full overflow-x-auto shadow-sm no-scrollbar">
        <button
          onClick={() => setActiveTab("preview")}
          className={`view-tab-btn flex items-center gap-2 px-4 py-2 rounded-lg font-body-semibold text-body-md transition-all whitespace-nowrap ${
            activeTab === "preview"
              ? "bg-secondary text-on-secondary shadow-sm"
              : "text-on-surface-variant hover:text-on-surface"
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">table_chart</span>
          <span>Trung tâm xem &amp; xuất báo cáo nghiệp vụ</span>
          <span className="ml-1 px-1.5 py-0.2 bg-white/20 rounded-full text-[11px] font-mono">LIVE</span>
        </button>

        <button
          onClick={() => setActiveTab("builder")}
          className={`view-tab-btn flex items-center gap-2 px-4 py-2 rounded-lg font-body-md text-body-md transition-all whitespace-nowrap ${
            activeTab === "builder"
              ? "bg-secondary text-on-secondary font-body-semibold shadow-sm"
              : "text-on-surface-variant hover:text-on-surface"
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">build_circle</span>
          <span>Quản trị &amp; Cấu hình mẫu báo cáo (Builder)</span>
        </button>

        <button
          onClick={() => setActiveTab("snapshots")}
          className={`view-tab-btn flex items-center gap-2 px-4 py-2 rounded-lg font-body-md text-body-md transition-all whitespace-nowrap ${
            activeTab === "snapshots"
              ? "bg-secondary text-on-secondary font-body-semibold shadow-sm"
              : "text-on-surface-variant hover:text-on-surface"
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">verified</span>
          <span>Kho lưu trữ báo cáo đã chốt kỳ (Locked Snapshots)</span>
          <span className="ml-1 px-1.5 py-0.2 bg-status-success-bg text-status-success rounded text-[11px] font-mono font-semibold">
            {snapshotsList.length} bản
          </span>
        </button>
      </div>

      {/* TAB 1: PREVIEW & EXPORT WORKSPACE */}
      {activeTab === "preview" && (
        <div className="flex flex-col gap-space-lg">
          {/* Period Status & Integrity Banner (Desktop) */}
          <div className="hidden lg:grid grid-cols-1 lg:grid-cols-12 gap-space-md p-space-md bg-surface-container-lowest rounded-xl shadow-sm">
            <div className="lg:col-span-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-space-md">
              <div className="flex items-start gap-space-sm">
                <div className="w-10 h-10 rounded-lg bg-status-success-bg text-status-success flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[24px]">verified_user</span>
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-headline-sm text-headline-sm text-on-surface">
                      {availablePeriods.length > 0
                        ? `${(availablePeriods.find((p: any) => p.id === selectedPeriodToLock) || availablePeriods[0])?.title}${
                            (availablePeriods.find((p: any) => p.id === selectedPeriodToLock) || availablePeriods[0])?.startAt
                              ? ` (${new Date((availablePeriods.find((p: any) => p.id === selectedPeriodToLock) || availablePeriods[0]).startAt).toLocaleDateString("vi-VN")} – ${new Date((availablePeriods.find((p: any) => p.id === selectedPeriodToLock) || availablePeriods[0]).endAt).toLocaleDateString("vi-VN")})`
                              : ""
                          }`
                        : "Báo cáo công tác tuần"}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[11px] font-label-sm font-semibold bg-status-warning-bg text-status-warning">
                      ĐANG MỞ - DỮ LIỆU THỜI GIAN THỰC
                    </span>
                    <span className="font-label-sm text-outline">| Cập nhật lúc {new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} hôm nay</span>
                  </div>
                  <p className="font-table-data text-table-data text-on-surface-variant mt-0.5">
                    Số liệu tổng hợp trực tiếp từ kế hoạch, nhiệm vụ và nhật ký trong cơ sở dữ liệu.
                  </p>
                </div>
              </div>
            </div>
            <div className="lg:col-span-4 flex items-center justify-start lg:justify-end gap-space-md bg-surface-container-low/60 p-3 rounded-lg">
              <span className="material-symbols-outlined text-outline text-[20px]">inventory_2</span>
              <div className="flex flex-col">
                <span className="font-label-sm text-outline uppercase tracking-wider">Kỳ đã chốt gần nhất</span>
                {snapshotsList.length > 0 ? (
                  <>
                    <span className="font-body-semibold text-[13px] text-on-surface">{snapshotsList[0].periodTitle || snapshotsList[0].title}: ĐÃ CHỐT SỐ LIỆU</span>
                    <span className="font-label-sm text-[11px] text-status-success font-mono font-semibold">
                      Checksum: {String(snapshotsList[0].checksum || "").slice(0, 20)}...
                    </span>
                  </>
                ) : (
                  <span className="font-body-semibold text-[13px] text-outline">Chưa chốt kỳ nào</span>
                )}
              </div>
              <button
                className="ml-auto text-secondary hover:text-on-secondary-container font-label-md"
                onClick={() => setActiveTab("snapshots")}
              >
                Xem
              </button>
            </div>
          </div>

          {/* Filter Configuration Hub */}
          <div className="p-space-md lg:p-space-lg bg-surface-container-lowest rounded-xl shadow-sm flex flex-col gap-space-md">
            <div className="flex flex-wrap items-center justify-between gap-space-sm">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[20px]">tune</span>
                <span className="font-body-semibold text-body-semibold text-on-surface">
                  Tham số lọc đa chiều &amp; Khung biểu mẫu xuất khẩu
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    loadData();
                    showToast("Đã tải lại dữ liệu mới nhất");
                  }}
                  className="font-label-md text-secondary hover:underline"
                >
                  Tải lại dữ liệu
                </button>
                <span className="text-outline-variant">•</span>
                <button
                  onClick={() => {
                    setSelectedUnit("all");
                    setSelectedOfficer("all");
                    setSelectedTemplate("legacy");
                  }}
                  className="font-label-md text-on-surface-variant hover:text-on-surface"
                >
                  Đặt lại mặc định
                </button>
              </div>
            </div>

            {/* Quick Period Pills */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="font-label-sm text-outline uppercase tracking-wider mr-2">Kỳ xem:</span>
              <button
                onClick={() => setPeriod("today")}
                className={`px-3 py-1 rounded-full text-label-md font-label-md transition-colors ${
                  period === "today"
                    ? "bg-primary text-on-primary shadow-sm"
                    : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high"
                }`}
              >
                Hôm nay
              </button>
              <button
                onClick={() => setPeriod("week")}
                className={`px-3 py-1 rounded-full text-label-md font-label-md transition-colors ${
                  period === "week"
                    ? "bg-primary text-on-primary shadow-sm"
                    : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high"
                }`}
              >
                Tuần này ({periodLabels.weekShort})
              </button>
              <button
                onClick={() => setPeriod("month")}
                className={`px-3 py-1 rounded-full text-label-md font-label-md transition-colors ${
                  period === "month"
                    ? "bg-primary text-on-primary shadow-sm"
                    : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high"
                }`}
              >
                {periodLabels.monthShort}
              </button>
              <button
                onClick={() => setPeriod("quarter")}
                className={`px-3 py-1 rounded-full text-label-md font-label-md transition-colors ${
                  period === "quarter"
                    ? "bg-primary text-on-primary shadow-sm"
                    : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high"
                }`}
              >
                {periodLabels.quarterShort}
              </button>
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-low text-on-surface text-label-md font-label-md">
                <span className="material-symbols-outlined text-[16px] text-outline">calendar_month</span>
                <span>01/10/2026 – 15/10/2026</span>
              </div>
            </div>

            {/* Multi-selectors Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md">
              <div className="flex flex-col gap-1">
                <label className="font-label-md text-label-md text-on-surface-variant font-medium">
                  Phạm vi Đơn vị / Bộ phận
                </label>
                <div className="relative">
                  <select
                    value={selectedUnit}
                    onChange={(e) => setSelectedUnit(e.target.value)}
                    className="w-full h-10 px-3 pr-8 rounded bg-surface-container-low font-body-md text-body-md text-on-surface focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-secondary transition-all cursor-pointer"
                  >
                    <option value="all">Toàn Cửa khẩu Quốc tế Tà Lùng ({dbOfficers.length} CBCC)</option>
                    {dbUnits.map((u: any) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                    {dbUnits.length === 0 && (
                      <option disabled value="">Đang tải danh sách đơn vị...</option>
                    )}
                  </select>
                  <span className="material-symbols-outlined absolute right-2.5 top-2.5 text-outline pointer-events-none text-[20px]">
                    expand_more
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-label-md text-label-md text-on-surface-variant font-medium">
                  Cán bộ thực hiện
                </label>
                <div className="relative">
                  <select
                    value={selectedOfficer}
                    onChange={(e) => setSelectedOfficer(e.target.value)}
                    className="w-full h-10 px-3 pr-8 rounded bg-surface-container-low font-body-md text-body-md text-on-surface focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-secondary transition-all cursor-pointer"
                  >
                    <option value="all">Tất cả cán bộ ({dbOfficers.length} cán bộ CC)</option>
                    {dbOfficers.map((o: any) => (
                      <option key={o.id} value={o.id}>
                        {o.fullName} — {o.position || "Cán bộ"}
                      </option>
                    ))}
                    {dbOfficers.length === 0 && (
                      <option disabled value="">Đang tải danh sách cán bộ...</option>
                    )}
                  </select>
                  <span className="material-symbols-outlined absolute right-2.5 top-2.5 text-outline pointer-events-none text-[20px]">
                    expand_more
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-label-md text-label-md text-on-surface-variant font-medium">
                  Chọn mẫu biểu báo cáo xuất file
                </label>
                <div className="relative">
                  <select
                    value={selectedTemplate}
                    onChange={(e) => {
                      setSelectedTemplate(e.target.value);
                      const label =
                        e.target.value === "detailed"
                          ? "Mẫu B (chi tiết)"
                          : "Mẫu A (kế hoạch tuần)";
                      showToast(`Đã chuyển sang ${label}`);
                    }}
                    className="w-full h-10 px-3 pr-8 rounded bg-surface-container-low font-body-md text-body-md text-on-surface focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-secondary transition-all cursor-pointer"
                  >
                    <option value="legacy">RPT-PLAN-WEEK-LEGACY (Mẫu công tác tuần chuẩn Tà Lùng)</option>
                    <option value="detailed">RPT-PLAN-DETAILED (Bảng chi tiết theo từng nhiệm vụ &amp; kết quả)</option>
                  </select>
                  <span className="material-symbols-outlined absolute right-2.5 top-2.5 text-outline pointer-events-none text-[20px]">
                    tune
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Active Report Quick Metrics KPI Strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-space-md">
            <div className="p-space-md bg-surface-container-lowest rounded-xl shadow-sm flex flex-col justify-between hover-lift">
              <span className="font-label-md text-label-md text-on-surface-variant">Tổng đầu việc trong kỳ</span>
              <div className="flex items-baseline justify-between mt-1">
                <span className="font-headline-xl text-headline-xl text-primary font-bold">
                  {dbSummary ? dbSummary.totalTasks : dbTasks.length}
                </span>
                <span className="font-label-sm text-status-success flex items-center">
                  <span className="material-symbols-outlined text-[14px]">arrow_upward</span>100%
                </span>
              </div>
              <span className="font-label-sm text-[11px] text-outline mt-1">
                {dbTasks.length > 0 ? "Dữ liệu vận hành thời gian thực" : "Hệ thống ghi nhận thời gian thực"}
              </span>
            </div>

            <div className="p-space-md bg-surface-container-lowest rounded-xl shadow-sm flex flex-col justify-between hover-lift">
              <span className="font-label-md text-label-md text-on-surface-variant">Đã hoàn thành</span>
              <div className="flex items-baseline justify-between mt-1">
                <span className="font-headline-xl text-headline-xl text-status-success font-bold">
                  {dbSummary ? dbSummary.completedTasks : dbTasks.filter((t) => t.status === "COMPLETED").length}
                </span>
                <span className="font-label-sm text-status-success font-semibold">
                  {dbSummary
                    ? (dbSummary.completionRate !== null && dbSummary.completionRate !== undefined
                        ? `${dbSummary.completionRate}%`
                        : "Chưa có dữ liệu")
                    : dbTasks.length > 0
                    ? `${Math.round((dbTasks.filter((t) => t.status === "COMPLETED").length / dbTasks.length) * 100)}%`
                    : "0%"}
                </span>
              </div>
              <div className="w-full bg-surface-container-low h-1.5 rounded-full overflow-hidden mt-1">
                <div
                  className="bg-status-success h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${
                      dbSummary
                        ? (dbSummary.completionRate ?? 0)
                        : dbTasks.length > 0
                        ? Math.round((dbTasks.filter((t) => t.status === "COMPLETED").length / dbTasks.length) * 100)
                        : 0
                    }%`,
                  }}
                ></div>
              </div>
            </div>

            <div className="p-space-md bg-surface-container-lowest rounded-xl shadow-sm flex flex-col justify-between hover-lift">
              <span className="font-label-md text-label-md text-on-surface-variant">Đang xử lý / Tiếp diễn</span>
              <div className="flex items-baseline justify-between mt-1">
                <span className="font-headline-xl text-headline-xl text-status-warning font-bold">
                  {dbSummary
                    ? dbSummary.inProgressTasks
                    : dbTasks.filter((t) => t.status === "IN_PROGRESS" || t.status === "WAITING_REVIEW").length}
                </span>
                <span className="font-label-sm text-on-surface-variant">
                  {dbTasks.length > 0
                    ? `${Math.round(
                        ((dbTasks.filter((t) => t.status === "IN_PROGRESS" || t.status === "WAITING_REVIEW").length || 0) /
                          dbTasks.length) *
                          100
                      )}%`
                    : "0%"}
                </span>
              </div>
              <span className="font-label-sm text-[11px] text-outline mt-1">Đúng tiến độ định kỳ</span>
            </div>

            <div className="p-space-md bg-surface-container-lowest rounded-xl shadow-sm flex flex-col justify-between hover-lift">
              <span className="font-label-md text-label-md text-on-surface-variant">Tồn đọng / Có vướng mắc</span>
              <div className="flex items-baseline justify-between mt-1">
                <span className="font-headline-xl text-headline-xl text-status-danger font-bold">
                  {dbSummary ? dbSummary.issueTasks : dbTasks.filter((t) => t.hasIssue).length}
                </span>
                <span className="font-label-sm text-status-danger flex items-center font-semibold">
                  {(dbSummary?.issueTasks || dbTasks.filter((t) => t.hasIssue).length) > 0 ? "Cần chỉ đạo" : "Ổn định"}
                </span>
              </div>
              <span className="font-label-sm text-[11px] text-status-danger mt-1">
                {(dbSummary?.issueTasks || dbTasks.filter((t) => t.hasIssue).length) > 0
                  ? "Có vụ việc vướng mắc cần giải quyết"
                  : "Không có vụ việc tồn đọng"}
              </span>
            </div>
          </div>

          {/* MOBILE TÓM TẮT TIẾN ĐỘ NGÀY CỘT C (Shown only on small screens) */}
          <div data-tour="report-table" className="lg:hidden bg-surface-container-lowest rounded-xl shadow-sm p-space-md space-y-space-sm">
            <div className="flex items-center justify-between pb-space-xs">
              <div className="flex items-center gap-space-xs">
                <span className="material-symbols-outlined text-primary text-[20px]">format_list_bulleted</span>
                <h3 className="font-headline-sm text-headline-sm text-primary">Tóm tắt tiến độ ngày (Cột C)</h3>
              </div>
              <span className="font-label-sm text-label-sm text-on-surface-variant bg-surface-subtle px-2 py-0.5 rounded">
                {filteredDbTasks.length} đầu việc
              </span>
            </div>
            <div className="space-y-space-xs">
              {filteredDbTasks.length > 0 ? (
                filteredDbTasks.slice(0, 4).map((task: any, idx: number) => {
                  const weekdays = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
                  const dayBadge = weekdays[idx % weekdays.length];
                  return (
                    <div
                      key={task.id}
                      onClick={() => setDrilldownTask(mapDbTaskToDrilldown(task))}
                      className="bg-surface-subtle p-space-sm rounded-lg flex items-start gap-space-sm cursor-pointer hover:bg-surface-container transition-colors"
                    >
                      <div className="w-8 h-8 rounded-lg bg-surface-container-highest flex items-center justify-center shrink-0 mt-0.5">
                        <span className="font-body-semibold text-body-semibold text-primary">{dayBadge}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-body-semibold text-body-semibold text-primary truncate">
                            {task.title}
                          </span>
                          <span
                            className={`font-label-sm text-[11px] px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0 ml-1 ${
                              task.status === "COMPLETED"
                                ? "bg-status-success-bg text-status-success"
                                : task.hasIssue
                                ? "bg-status-danger-bg text-status-danger"
                                : "bg-status-warning-bg text-status-warning"
                            }`}
                          >
                            <span className="material-symbols-outlined text-[12px]">
                              {task.status === "COMPLETED" ? "check" : task.hasIssue ? "warning" : "hourglass_top"}
                            </span>
                            {task.status === "COMPLETED" ? "Đạt KH" : task.hasIssue ? "Vướng mắc" : "Đang làm"}
                          </span>
                        </div>
                        <p className="font-body-md text-body-md text-on-surface-variant mt-0.5 truncate">
                          {task.owner?.fullName || "Cán bộ"} • {task.code}
                        </p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-space-lg text-center text-on-surface-variant">
                  <span className="material-symbols-outlined text-outline text-[32px] block mb-1">
                    inbox
                  </span>
                  <p className="font-body-md text-body-md">Chưa có đầu việc nào được ghi nhận</p>
                </div>
              )}
            </div>

            {/* Mobile Export Buttons Strip (chỉ hiện khi có quyền xuất) */}
            {canExport && (
              <div className="pt-2 space-y-2">
                <button
                  onClick={() => handleExportXlsx("legacy")}
                  disabled={isExporting}
                  className="w-full h-11 bg-secondary text-on-secondary rounded-lg font-body-semibold text-body-semibold flex items-center justify-center gap-space-xs shadow-md active-press transition-all"
                >
                  <span className="material-symbols-outlined text-[18px]">file_download</span>
                  <span>Tải Mẫu A (Kế hoạch tuần .xlsx)</span>
                </button>
                <button
                  onClick={() => handleExportXlsx("detailed")}
                  disabled={isExporting}
                  className="w-full h-11 bg-primary text-on-primary rounded-lg font-body-semibold text-body-semibold flex items-center justify-center gap-space-xs shadow-md active-press transition-all"
                >
                  <span className="material-symbols-outlined text-[18px]">table_view</span>
                  <span>Tải Mẫu B (Chi tiết đầu việc .xlsx)</span>
                </button>
              </div>
            )}
            {canLock && (
              <div className="bg-surface-container-lowest p-space-sm rounded-lg flex items-center justify-between border border-border-default/40">
                <div className="flex items-center gap-space-xs">
                  <div className="w-7 h-7 rounded-full bg-status-warning-bg flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-status-warning text-[16px]">admin_panel_settings</span>
                  </div>
                  <span className="font-label-sm text-label-sm text-primary">Chốt số liệu kỳ lãnh đạo</span>
                </div>
                <button
                  onClick={handleOpenLockModal}
                  className="bg-primary text-on-primary font-label-sm text-label-sm px-3 py-1.5 rounded-lg flex items-center gap-1 active-press"
                >
                  <span className="material-symbols-outlined text-[14px]">lock_clock</span>
                  <span>Chốt</span>
                </button>
              </div>
            )}
          </div>

          {/* DESKTOP LIVE PREVIEW SHEET TABLE FRAME */}
          <div id="report-table-card" data-tour="report-table" className="hidden lg:flex bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex-col">
            {/* Excel Emulation Bar & Status Indicator */}
            <div className="p-space-md bg-surface-subtle flex flex-col md:flex-row md:items-center justify-between gap-space-md">
              <div className="flex items-center gap-space-sm">
                <div className="w-8 h-8 rounded bg-secondary flex items-center justify-center text-on-secondary shrink-0">
                  <span className="material-symbols-outlined text-[18px]">table_view</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-body-semibold text-body-semibold text-on-surface">
                      BẢNG XEM TRƯỚC BÁO CÁO CÔNG TÁC TUẦN
                    </span>
                    <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-primary-fixed text-on-primary-fixed">
                      EXCEL-PREVIEW-MODE
                    </span>
                  </div>
                  <p className="font-table-data text-[12px] text-outline">
                    Quy chuẩn ánh xạ: Cột C &quot;DANH MỤC ĐẦU VIỆC&quot;, ngắt dòng tự động, số liệu phân tách theo từng ngày
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-table-data text-[12px] text-on-surface-variant">
                  Hiển thị: <strong>{filteredDbTasks.length} dòng nghiệp vụ</strong>
                </span>
                <div className="h-4 w-px bg-border-subtle mx-1"></div>
                <button
                  onClick={() => {
                    const el = document.getElementById("report-table-card");
                    if (!el) return;
                    if (document.fullscreenElement) {
                      document.exitFullscreen().catch(() => {});
                    } else {
                      el.requestFullscreen?.().catch(() => showToast("Trình duyệt không cho phép toàn màn hình", "error"));
                    }
                  }}
                  className="p-1.5 rounded hover:bg-surface-container-high text-on-surface-variant transition-colors"
                  title="Toàn màn hình bảng tính (bấm lại để thoát)"
                >
                  <span className="material-symbols-outlined text-[18px]">fullscreen</span>
                </button>
                <button
                  onClick={() => window.print()}
                  className="p-1.5 rounded hover:bg-surface-container-high text-on-surface-variant transition-colors"
                  title="In trực tiếp trang"
                >
                  <span className="material-symbols-outlined text-[18px]">print</span>
                </button>
              </div>
            </div>

            {/* Watermark Simulation Banner */}
            <div className="bg-status-warning-bg/40 px-space-md py-1.5 flex items-center justify-between text-on-surface-variant font-label-sm text-[11px]">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[15px] text-status-warning">security</span>
                <span>
                  Bản xuất ra file sẽ tự động chèn Watermark nội bộ (tên đơn vị, người xuất, ngày xuất).
                </span>
              </div>
              <span className="font-mono text-outline">Mọi lượt xuất được ghi nhật ký tự động</span>
            </div>

            {/* The Real Data Table Matching Customs Layout */}
            <div className="overflow-x-auto w-full max-w-full">
              <table className="w-full text-left font-table-data text-table-data">
                <thead>
                  <tr className="bg-surface-subtle text-on-surface text-[12px] font-table-header uppercase tracking-wider">
                    <th className="py-3 px-3 w-[100px] text-center" scope="col">
                      Thứ / Ngày (A)
                    </th>
                    <th className="py-3 px-3 w-[160px]" scope="col">
                      Nhiệm vụ thường xuyên (B)
                    </th>
                    <th className="py-3 px-4 min-w-[260px] text-primary" scope="col">
                      DANH MỤC ĐẦU VIỆC (C)
                    </th>
                    <th className="py-3 px-3 w-[180px]" scope="col">
                      Cán bộ / BP phụ trách (D)
                    </th>
                    <th className="py-3 px-3 w-[150px]" scope="col">
                      Đơn vị phối hợp (E)
                    </th>
                    <th className="py-3 px-2 w-[85px] text-center" scope="col">
                      Độ ưu tiên (F)
                    </th>
                    <th className="py-3 px-4 min-w-[220px]" scope="col">
                      Kết quả dự kiến &amp; Thực tế (G)
                    </th>
                    <th className="py-3 px-3 w-[145px] text-center" scope="col">
                      Tiến độ / Tình trạng (H)
                    </th>
                    <th className="py-3 px-2 w-[50px] text-center" scope="col">
                      Chi tiết
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y-0 text-on-surface">
                  {dbTasks.length > 0 ? (
                    filteredDbTasks.length > 0 ? (
                      filteredDbTasks.map((task: any) => {
                        const dateStr = task.createdAt
                          ? new Date(task.createdAt).toLocaleDateString("vi-VN", {
                              day: "2-digit",
                              month: "2-digit",
                            })
                          : "-";
                        const weekdayStr = task.createdAt
                          ? new Date(task.createdAt).toLocaleDateString("vi-VN", { weekday: "short" })
                          : "-";
                        return (
                          <tr
                            key={task.id}
                            onClick={() => setDrilldownTask(mapDbTaskToDrilldown(task))}
                            className="hover:bg-surface-container-low transition-colors cursor-pointer group border-b border-border-default/30"
                          >
                            <td className="py-3 px-3 text-center align-top font-mono font-medium text-[12px] text-on-surface-variant bg-surface-subtle/30">
                              {dateStr}
                              <br />
                              <span className="text-[11px] text-outline">{weekdayStr}</span>
                            </td>
                            <td className="py-3 px-3 align-top font-medium text-primary">
                              {task.unit?.name || "1. Thủ tục hải quan (TTHQ)"}
                            </td>
                            <td className="py-3 px-4 align-top">
                              <div className="flex flex-col gap-1">
                                <span className="font-body-semibold text-on-surface text-[14px]">
                                  {task.title}
                                </span>
                                <div className="flex items-center gap-2 text-[11px] text-outline font-mono">
                                  <span>MÃ: {task.code}</span>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-3 align-top">
                              <div className="flex flex-col">
                                <span className="font-medium text-on-surface">
                                  {task.owner?.fullName || "Chưa phân công"}
                                </span>
                                <span className="text-[11px] text-outline">
                                  {task.unit?.name || "BP Nghiệp vụ A"}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-3 align-top text-on-surface-variant text-[13px]">
                              {task.unit?.name ? `${task.unit.name}, Trạm Cửa khẩu` : "Đơn vị phối hợp"}
                            </td>
                            <td className="py-3 px-2 text-center align-top">
                              <span
                                className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                                  task.priority === "Cao" || task.priority === "HIGH"
                                    ? "bg-status-danger-bg text-status-danger"
                                    : task.priority === "Thấp" || task.priority === "LOW"
                                    ? "bg-status-success-bg text-status-success"
                                    : "bg-status-warning-bg text-status-warning"
                                }`}
                              >
                                {task.priority === "HIGH" ? "Cao" : task.priority === "LOW" ? "Thấp" : task.priority || "Trung bình"}
                              </span>
                            </td>
                            <td className="py-3 px-4 align-top">
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[13px] font-medium text-on-surface">
                                  {task.actualResultText || (task.status === "COMPLETED" ? "Đạt 100% chỉ tiêu" : "Đang triển khai trong ca")}
                                </span>
                                {task.expectedResultText && (
                                  <span className="text-[12px] text-outline">
                                    Dự kiến: {task.expectedResultText}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-3 text-center align-top">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[12px] font-medium ${
                                  task.status === "COMPLETED"
                                    ? "bg-status-success-bg text-status-success"
                                    : task.hasIssue
                                    ? "bg-status-danger-bg text-status-danger"
                                    : "bg-status-warning-bg text-status-warning"
                                }`}
                              >
                                <span className="material-symbols-outlined text-[13px]">
                                  {task.status === "COMPLETED"
                                    ? "check_circle"
                                    : task.hasIssue
                                    ? "warning"
                                    : "hourglass_top"}
                                </span>
                                <span>
                                  {task.status === "COMPLETED"
                                    ? "Hoàn thành"
                                    : task.hasIssue
                                    ? "Vướng mắc"
                                    : task.status === "WAITING_REVIEW"
                                    ? "Chờ duyệt"
                                    : "Đang thực hiện"}
                                </span>
                              </span>
                            </td>
                            <td className="py-3 px-2 text-center align-top">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDrilldownTask(mapDbTaskToDrilldown(task));
                                }}
                                className="p-1 rounded hover:bg-surface-container text-outline hover:text-primary transition-colors"
                              >
                                <span className="material-symbols-outlined text-[18px]">visibility</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-on-surface-variant">
                          <span className="material-symbols-outlined text-outline text-[32px] block mb-2">
                            filter_alt_off
                          </span>
                          Không tìm thấy đầu việc nào phù hợp với bộ lọc đơn vị / cán bộ đã chọn.
                        </td>
                      </tr>
                    )
                  ) : (
                    <tr>
                      <td colSpan={9} className="py-16 text-center text-on-surface-variant">
                        <span className="material-symbols-outlined text-outline text-[40px] block mb-2">
                          assignment_late
                        </span>
                        <p className="font-body-semibold text-body-semibold text-on-surface">
                          Không có dữ liệu đầu việc cho kỳ báo cáo này
                        </p>
                        <p className="font-table-data text-[12px] text-outline mt-1">
                          Vui lòng chọn kỳ kế hoạch khác hoặc đồng bộ công việc từ hệ thống
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Table Footnote & Paging Bar */}
            <div className="p-space-md bg-surface-subtle flex flex-col sm:flex-row items-center justify-between gap-space-sm">
              <div className="flex items-center gap-2 text-[12px] text-outline">
                <span className="material-symbols-outlined text-[16px]">info</span>
                <span>Dữ liệu tổng hợp theo kỳ kế hoạch đã chọn</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="px-2.5 py-1 rounded bg-surface-container-low text-on-surface-variant font-label-sm hover:bg-surface-container-high transition-colors disabled:opacity-50"
                  disabled
                >
                  Trang trước
                </button>
                <span className="font-label-sm text-on-surface px-2">1 / 1 (Toàn bộ tuần)</span>
                <button
                  className="px-2.5 py-1 rounded bg-surface-container-low text-on-surface-variant font-label-sm hover:bg-surface-container-high transition-colors disabled:opacity-50"
                  disabled
                >
                  Trang sau
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: TEMPLATE BUILDER & COLUMN MAPPING */}
      {activeTab === "builder" && (
        <div className="flex flex-col gap-space-lg">
          {/* Builder Overview Card */}
          <div className="p-space-lg bg-surface-container-lowest rounded-xl shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-space-md">
            <div className="flex items-start gap-space-sm">
              <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center text-on-secondary shrink-0">
                <span className="material-symbols-outlined text-[28px]">schema</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-headline-md text-headline-md text-on-surface">
                    Cấu Hình Ánh Xạ &amp; Mẫu Xuất XLSX (Builder)
                  </h2>
                  <span className="px-2 py-0.5 rounded text-[11px] font-label-sm font-semibold bg-secondary-fixed text-on-secondary-fixed-variant">
                    Phiên bản: v1.2-STABLE
                  </span>
                </div>
                <p className="font-body-md text-on-surface-variant mt-0.5">
                  Định nghĩa cấu trúc cột cho mẫu{" "}
                  <span className="font-mono text-primary font-bold">RPT-PLAN-WEEK-LEGACY</span> đảm bảo chuẩn hóa nhãn
                  &quot;DANH MỤC ĐẦU VIỆC&quot;, tự động điền trạng thái và bảo vệ tính toàn vẹn dữ liệu.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-space-sm flex-wrap">
              <button
                onClick={handlePreviewBuilderFile}
                disabled={isPreviewingBuilder}
                className="px-3 py-2 rounded bg-surface-container text-primary font-label-md hover:bg-surface-container-high transition-colors active-press disabled:opacity-60"
              >
                {isPreviewingBuilder ? "Đang kết xuất..." : "Xem trước file mẫu"}
              </button>
              {canExport && (
                <button
                  onClick={() => handleExportXlsx(selectedTemplate === "detailed" ? "detailed" : "legacy")}
                  disabled={isExporting}
                  className="px-3 py-2 rounded bg-surface-container text-primary font-label-md hover:bg-surface-container-high transition-colors active-press disabled:opacity-60"
                >
                  {isExporting ? "Đang tải..." : "Tải file mẫu thử nghiệm"}
                </button>
              )}
              {canEditBuilderConfig && (
                <button
                  onClick={handleSaveBuilderConfig}
                  disabled={isSavingBuilder}
                  className="px-4 py-2 rounded bg-secondary text-on-secondary font-body-semibold hover:opacity-95 shadow-sm transition-all active-press disabled:opacity-60"
                >
                  {isSavingBuilder ? "Đang lưu..." : "Lưu cấu hình mẫu v1.2"}
                </button>
              )}
            </div>
          </div>

          {/* Configuration Options Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-space-lg">
            {/* General Rules */}
            <div className="p-space-md bg-surface-container-lowest rounded-xl shadow-sm flex flex-col gap-space-md">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[20px]">tune</span>
                <span className="font-body-semibold text-body-semibold text-on-surface">
                  Quy tắc gom nhóm &amp; Hiển thị
                </span>
              </div>
              <div className="flex flex-col gap-space-sm">
                <div>
                  <label className="font-label-md text-on-surface-variant">Phương thức gom nhóm (Grouping mode):</label>
                  <select
                    value={builderConfig.grouping}
                    onChange={(e) => setBuilderConfig({ ...builderConfig, grouping: e.target.value })}
                    className="w-full mt-1 h-9 px-3 rounded bg-surface-container-low font-body-md text-on-surface focus:outline-none"
                  >
                    <option value="week">Gom theo Nhóm thứ trong tuần (Thứ 2 -&gt; Chủ nhật)</option>
                    <option value="group">Gom theo Nhóm nghiệp vụ (5 nhóm thường xuyên)</option>
                    <option value="officer">Gom theo Cán bộ phụ trách (Cá nhân CC)</option>
                  </select>
                </div>
                <div className="p-3 bg-surface-container-low rounded-lg flex flex-col gap-2">
                  <span className="font-body-semibold text-[13px] text-on-surface">
                    Xử lý trường hợp &quot;Không phát sinh&quot;:
                  </span>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={builderConfig.showNotOccurredLabel}
                      onChange={(e) => setBuilderConfig({ ...builderConfig, showNotOccurredLabel: e.target.checked })}
                      className="mt-1 accent-secondary"
                    />
                    <span className="font-table-data text-[13px] text-on-surface-variant">
                      Tự động hiển thị nhãn{" "}
                      <code className="bg-surface px-1 py-0.5 rounded text-primary font-mono text-[11px]">
                        (Không phát sinh trong kỳ)
                      </code>{" "}
                      thay vì để trống ô
                    </span>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={builderConfig.highlightNotOccurred}
                      onChange={(e) => setBuilderConfig({ ...builderConfig, highlightNotOccurred: e.target.checked })}
                      className="mt-1 accent-secondary"
                    />
                    <span className="font-table-data text-[13px] text-on-surface-variant">
                      Tô màu xanh nhạt phân biệt cho dòng không phát sinh
                    </span>
                  </label>
                </div>
                <div className="p-3 bg-surface-container-low rounded-lg flex flex-col gap-2">
                  <span className="font-body-semibold text-[13px] text-on-surface">
                    Ngắt dòng nội dung (Wrap text):
                  </span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={builderConfig.wrapText}
                      onChange={(e) => setBuilderConfig({ ...builderConfig, wrapText: e.target.checked })}
                      className="accent-secondary"
                    />
                    <span className="font-table-data text-[13px] text-on-surface-variant">
                      Bật tự động co giãn chiều cao dòng theo nội dung Cột C
                    </span>
                  </label>
                </div>
              </div>
            </div>

            {/* Security & Audit Rules */}
            <div className="p-space-md bg-surface-container-lowest rounded-xl shadow-sm flex flex-col gap-space-md">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[20px]">verified_user</span>
                <span className="font-body-semibold text-body-semibold text-on-surface">
                  Bảo mật &amp; Dấu vết kiểm toán (Audit)
                </span>
              </div>
              <div className="flex flex-col gap-space-sm">
                <div className="flex items-center justify-between p-2.5 bg-surface-container-low rounded">
                  <div className="flex flex-col">
                    <span className="font-body-semibold text-[13px] text-on-surface">Yêu cầu quyền reports.export</span>
                    <span className="font-label-sm text-[11px] text-outline">Chỉ lãnh đạo Đội &amp; Ban chỉ huy</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-status-success-bg text-status-success font-semibold">
                    BẮT BUỘC
                  </span>
                </div>
                <div className="flex items-center justify-between p-2.5 bg-surface-container-low rounded">
                  <div className="flex flex-col">
                    <span className="font-body-semibold text-[13px] text-on-surface">Chèn Watermark bảo mật nền</span>
                    <span className="font-label-sm text-[11px] text-outline">Tên cán bộ xuất + Dấu thời gian</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-status-success-bg text-status-success font-semibold">
                    BẬT
                  </span>
                </div>
                <div className="flex items-center justify-between p-2.5 bg-surface-container-low rounded">
                  <div className="flex flex-col">
                    <span className="font-body-semibold text-[13px] text-on-surface">Sinh mã Hash Checksum kỳ</span>
                    <span className="font-label-sm text-[11px] text-outline">Chống sửa đổi nội dung bảng tính</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-status-success-bg text-status-success font-semibold">
                    SHA-256
                  </span>
                </div>
                <div className="mt-2 text-[12px] text-outline leading-relaxed bg-surface-subtle p-2.5 rounded">
                  Mọi thao tác tải file XLSX sẽ được ghi nhận tự động vào bảng Audit Log hệ thống kèm địa chỉ IP và mã tài khoản người dùng.
                </div>
              </div>
            </div>

            {/* Export Profile Info */}
            <div className="p-space-md bg-surface-container-lowest rounded-xl shadow-sm flex flex-col justify-between">
              <div className="flex flex-col gap-space-sm">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-secondary text-[20px]">file_present</span>
                  <span className="font-body-semibold text-body-semibold text-on-surface">
                    Đặc tả kỹ thuật tệp xuất
                  </span>
                </div>
                <div className="space-y-2 text-[13px] text-on-surface-variant">
                  <div className="flex justify-between py-1 border-b border-border-default/40">
                    <span className="text-outline">Tên tệp mặc định:</span>
                    <span className="font-mono text-primary font-medium">HQTL_BCTuan41_20261010.xlsx</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border-default/40">
                    <span className="text-outline">Tiêu chuẩn Font:</span>
                    <span className="font-medium text-on-surface">Arial / 11pt (Theo mẫu Hải quan)</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border-default/40">
                    <span className="text-outline">Định dạng ô số:</span>
                    <span className="font-mono text-on-surface">#,##0 (Monospace tabular)</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border-default/40">
                    <span className="text-outline">Khổ giấy in ấn:</span>
                    <span className="font-medium text-on-surface">A4 Ngang (Landscape), Fit 1 trang ngang</span>
                  </div>
                </div>
              </div>
              <div className="p-3 bg-secondary-fixed/30 rounded-lg flex items-center gap-2 mt-4">
                <span className="material-symbols-outlined text-secondary text-[20px]">cloud_done</span>
                <span className="font-label-md text-on-secondary-container">
                  Đã đồng bộ mẫu chuẩn với Cục HQ Cao Bằng
                </span>
              </div>
            </div>
          </div>

          {/* Column Mapping Matrix Table */}
          <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col">
            <div className="p-space-md bg-surface-subtle flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[20px]">view_column</span>
                <span className="font-body-semibold text-body-semibold text-on-surface">
                  Bảng ánh xạ các cột (Excel Column Mapping Matrix)
                </span>
              </div>
            </div>
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left font-table-data text-table-data">
                <thead>
                  <tr className="bg-surface-subtle text-on-surface text-[12px] font-table-header uppercase">
                    <th className="py-3 px-3 w-16 text-center">Vị trí</th>
                    <th className="py-3 px-3 w-48">Trường dữ liệu nguồn (DB Field)</th>
                    <th className="py-3 px-4 min-w-[200px]">Tiêu đề hiển thị trên Excel (Header Label)</th>
                    <th className="py-3 px-3 w-36">Độ rộng cột</th>
                    <th className="py-3 px-3 w-36">Căn lề</th>
                    <th className="py-3 px-3 w-40">Định dạng ô</th>
                    <th className="py-3 px-3 w-28 text-center">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="text-on-surface divide-y-0">
                  <tr className="hover:bg-surface-container-low transition-colors">
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-secondary">Cột A</td>
                    <td className="py-2.5 px-3 font-mono text-[13px] text-primary">log_date_weekday</td>
                    <td className="py-2.5 px-4 font-body-semibold">Thứ / Ngày</td>
                    <td className="py-2.5 px-3 font-mono text-[13px]">14 (120px)</td>
                    <td className="py-2.5 px-3 text-[13px]">Căn giữa (Center)</td>
                    <td className="py-2.5 px-3 font-mono text-[12px] text-outline">Date (dd/mm)</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-status-success-bg text-status-success">
                        Khóa
                      </span>
                    </td>
                  </tr>
                  <tr className="hover:bg-surface-container-low transition-colors">
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-secondary">Cột B</td>
                    <td className="py-2.5 px-3 font-mono text-[13px] text-primary">duty_category_name</td>
                    <td className="py-2.5 px-4 font-body-semibold">Nhiệm vụ thường xuyên</td>
                    <td className="py-2.5 px-3 font-mono text-[13px]">22 (180px)</td>
                    <td className="py-2.5 px-3 text-[13px]">Căn trái (Left)</td>
                    <td className="py-2.5 px-3 font-mono text-[12px] text-outline">Text</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-status-success-bg text-status-success">
                        Khóa
                      </span>
                    </td>
                  </tr>
                  <tr className="hover:bg-surface-container-low transition-colors bg-secondary-fixed/20">
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-secondary">Cột C</td>
                    <td className="py-2.5 px-3 font-mono text-[13px] text-primary font-bold">task_catalog_title</td>
                    <td className="py-2.5 px-4 font-body-semibold text-primary">
                      DANH MỤC ĐẦU VIỆC
                      <span className="block text-[11px] text-secondary font-normal font-sans">
                        * Nhãn chuẩn theo phản hồi Hải quan
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[13px]">45 (380px)</td>
                    <td className="py-2.5 px-3 text-[13px]">Căn trái, Wrap text</td>
                    <td className="py-2.5 px-3 font-mono text-[12px] text-outline">Text (Multiline)</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-secondary text-on-secondary">
                        Đã chốt
                      </span>
                    </td>
                  </tr>
                  <tr className="hover:bg-surface-container-low transition-colors">
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-secondary">Cột D</td>
                    <td className="py-2.5 px-3 font-mono text-[13px] text-primary">assignee_officer</td>
                    <td className="py-2.5 px-4 font-body-semibold">Cán bộ / Bộ phận phụ trách</td>
                    <td className="py-2.5 px-3 font-mono text-[13px]">24 (200px)</td>
                    <td className="py-2.5 px-3 text-[13px]">Căn trái (Left)</td>
                    <td className="py-2.5 px-3 font-mono text-[12px] text-outline">Text</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-status-success-bg text-status-success">
                        Khóa
                      </span>
                    </td>
                  </tr>
                  <tr className="hover:bg-surface-container-low transition-colors">
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-secondary">Cột E</td>
                    <td className="py-2.5 px-3 font-mono text-[13px] text-primary">coordinating_units</td>
                    <td className="py-2.5 px-4 font-body-semibold">Đơn vị phối hợp</td>
                    <td className="py-2.5 px-3 font-mono text-[13px]">20 (160px)</td>
                    <td className="py-2.5 px-3 text-[13px]">Căn trái (Left)</td>
                    <td className="py-2.5 px-3 font-mono text-[12px] text-outline">Text</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-status-success-bg text-status-success">
                        Khóa
                      </span>
                    </td>
                  </tr>
                  <tr className="hover:bg-surface-container-low transition-colors">
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-secondary">Cột F</td>
                    <td className="py-2.5 px-3 font-mono text-[13px] text-primary">priority_level</td>
                    <td className="py-2.5 px-4 font-body-semibold">Mức độ ưu tiên</td>
                    <td className="py-2.5 px-3 font-mono text-[13px]">12 (90px)</td>
                    <td className="py-2.5 px-3 text-[13px]">Căn giữa (Center)</td>
                    <td className="py-2.5 px-3 font-mono text-[12px] text-outline">Text (Badge)</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-status-success-bg text-status-success">
                        Khóa
                      </span>
                    </td>
                  </tr>
                  <tr className="hover:bg-surface-container-low transition-colors">
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-secondary">Cột G</td>
                    <td className="py-2.5 px-3 font-mono text-[13px] text-primary">result_metrics</td>
                    <td className="py-2.5 px-4 font-body-semibold">Kết quả dự kiến &amp; Thực tế</td>
                    <td className="py-2.5 px-3 font-mono text-[13px]">32 (280px)</td>
                    <td className="py-2.5 px-3 text-[13px]">Căn trái (Left)</td>
                    <td className="py-2.5 px-3 font-mono text-[12px] text-outline">Mixed (Metric)</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-status-success-bg text-status-success">
                        Khóa
                      </span>
                    </td>
                  </tr>
                  <tr className="hover:bg-surface-container-low transition-colors">
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-secondary">Cột H</td>
                    <td className="py-2.5 px-3 font-mono text-[13px] text-primary">completion_status</td>
                    <td className="py-2.5 px-4 font-body-semibold">Tiến độ &amp; Tình trạng</td>
                    <td className="py-2.5 px-3 font-mono text-[13px]">18 (150px)</td>
                    <td className="py-2.5 px-3 text-[13px]">Căn giữa (Center)</td>
                    <td className="py-2.5 px-3 font-mono text-[12px] text-outline">Status Pill</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-status-success-bg text-status-success">
                        Khóa
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: LOCKED SNAPSHOTS REPOSITORY */}
      {activeTab === "snapshots" && (
        <div className="flex flex-col gap-space-lg">
          {/* Header info */}
          <div className="p-space-lg bg-surface-container-lowest rounded-xl shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-space-md border border-border-default/40">
            <div className="flex items-start gap-space-sm">
              <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[28px]">lock_clock</span>
              </div>
              <div>
                <h2 className="font-headline-md text-headline-md text-on-surface">
                  Kho Lưu Trữ Báo Cáo Đã Chốt Kỳ (Locked Snapshots)
                </h2>
                <p className="font-body-md text-on-surface-variant mt-0.5">
                  Bản chụp số liệu được tính mã kiểm tra toàn vẹn nội dung, lưu trữ trong hệ thống phục vụ đối soát, kiểm tra tác nghiệp Hải quan.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-space-sm shrink-0">
              <span className="font-label-sm text-outline">Tổng: {snapshotsList.length} bản chụp</span>
              <button
                onClick={handleOpenLockModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary text-on-primary font-label-md hover:bg-primary/95 transition-all active-press shadow-sm"
              >
                <span className="material-symbols-outlined text-[18px]">add_task</span>
                <span>Chốt kỳ số liệu mới</span>
              </button>
            </div>
          </div>

          {/* Empty state */}
          {snapshotsList.length === 0 && (
            <div className="p-12 bg-surface-container-lowest rounded-xl shadow-sm flex flex-col items-center justify-center text-center gap-3 border border-dashed border-border-default">
              <div className="w-16 h-16 rounded-full bg-surface-container-low flex items-center justify-center text-outline">
                <span className="material-symbols-outlined text-[32px]">folder_off</span>
              </div>
              <h3 className="font-headline-sm text-on-surface">Chưa có bản chụp số liệu nào được lưu trữ</h3>
              <p className="font-body-md text-on-surface-variant max-w-md">
                Hiện tại chưa có kỳ báo cáo nào được chốt khóa. Nhấn nút bên dưới để tạo bản chụp đầu tiên.
              </p>
              {canLock && (
                <button
                  onClick={handleOpenLockModal}
                  className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-on-primary font-label-md shadow-sm"
                >
                  <span className="material-symbols-outlined text-[18px]">lock_clock</span>
                  <span>Chốt số liệu kỳ này ngay</span>
                </button>
              )}
            </div>
          )}

          {/* Snapshot Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-space-md">
            {snapshotsList.map((item) => (
              <div
                key={item.id}
                className="p-space-md bg-surface-container-lowest rounded-xl shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow border border-border-default/40"
              >
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded text-[11px] font-mono font-bold bg-primary/10 text-primary">
                      {item.code || item.id}
                    </span>
                    {item.isValid ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-status-success-bg text-status-success">
                        <span className="material-symbols-outlined text-[14px]">verified</span>
                        <span>Toàn vẹn (SHA-256)</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-status-danger-bg text-status-danger">
                        <span className="material-symbols-outlined text-[14px]">warning</span>
                        <span>Sai lệch hash</span>
                      </span>
                    )}
                  </div>
                  <h3 className="font-body-semibold text-on-surface text-[15px]">{item.title || item.periodTitle}</h3>
                  <div className="flex items-center gap-2 text-[12px] text-outline font-table-data">
                    <span className="material-symbols-outlined text-[16px]">calendar_today</span>
                    <span>{item.periodTitle} ({item.periodType || "WEEK"})</span>
                  </div>
                  {item.metrics && (
                    <div className="grid grid-cols-2 gap-1.5 p-2 bg-surface-container-low/60 rounded text-[11px]">
                      <div>Tổng việc: <span className="font-semibold text-primary">{item.metrics.totalTasks}</span></div>
                      <div>Hoàn thành: <span className="font-semibold text-status-success">{item.metrics.completedTasks} ({item.metrics.completionRate}%)</span></div>
                      <div>Quá hạn: <span className="font-semibold text-status-danger">{item.metrics.overdueTasks}</span></div>
                      <div>Ca trực: <span className="font-semibold text-on-surface">{item.metrics.totalRoutines}</span></div>
                    </div>
                  )}
                  <div className="p-2 bg-surface-container-low rounded font-mono text-[11px] text-on-surface-variant break-all">
                    <div className="text-[10px] text-outline uppercase font-semibold mb-0.5">Mã băm SHA-256 (64 hex):</div>
                    <span className="text-secondary select-all">{item.checksum}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-2 pt-3 mt-3 border-t border-border-default/40">
                  <div className="flex flex-col text-[11px]">
                    <span className="text-outline">Người chốt: <strong className="text-on-surface">{item.lockedByName}</strong></span>
                    <span className="text-on-surface-variant">Thời gian: {new Date(item.lockedAt).toLocaleString("vi-VN")}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <button
                      onClick={() => {
                        setViewingSnapshot(item);
                        setVerificationFeedback(null);
                      }}
                      className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded bg-surface-container-low text-on-surface font-label-sm hover:bg-surface-container transition-colors active-press"
                    >
                      <span className="material-symbols-outlined text-[16px]">visibility</span>
                      <span>Xem chi tiết</span>
                    </button>
                    <button
                      onClick={() => handleExportSnapshotXlsx(item.id, "detailed")}
                      className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded bg-primary text-on-primary font-label-sm hover:bg-primary/95 transition-colors active-press"
                      title="Xuất file Excel Mẫu B từ bản chụp đã chốt"
                    >
                      <span className="material-symbols-outlined text-[16px]">download</span>
                      <span>Tải .xlsx</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL XÁC NHẬN CHỐT KỲ SỐ LIỆU */}
      {isLockModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-primary-container/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-surface-container-lowest rounded-xl shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-150 border border-border-default/40">
            <div className="p-space-md bg-primary text-on-primary flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px]">lock_clock</span>
                <span className="font-headline-sm text-[16px] text-white">
                  Xác Nhận Chốt &amp; Khóa Số Liệu Kỳ Báo Cáo
                </span>
              </div>
              <button
                onClick={() => {
                  if (!isLocking) {
                    setIsLockModalOpen(false);
                    setLockError(null);
                  }
                }}
                className="p-1 rounded text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="p-space-lg flex flex-col gap-space-md text-on-surface">
              {lockError && (
                <div className="p-3 bg-status-danger-bg text-status-danger rounded-lg flex items-center gap-2 text-body-sm">
                  <span className="material-symbols-outlined text-[18px]">error</span>
                  <span>{lockError}</span>
                </div>
              )}

              <div className="p-3 bg-status-warning-bg/40 text-on-surface rounded-lg flex items-start gap-2 text-body-sm border border-status-warning/30">
                <span className="material-symbols-outlined text-status-warning text-[20px] shrink-0 mt-0.5">info</span>
                <div>
                  <div className="font-semibold text-primary">Quy định chốt kỳ tác nghiệp:</div>
                  <div className="text-[12px] text-on-surface-variant mt-0.5">
                    Hệ thống sẽ tổng hợp toàn bộ nhiệm vụ, ca trực và chỉ số KPI tại thời điểm hiện tại; tính <strong>mã kiểm tra toàn vẹn</strong> và lưu bản chụp bất biến trong hệ thống.
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-label-md text-on-surface-variant font-medium">
                  Chọn kỳ công tác cần chốt số liệu:
                </label>
                <select
                  value={selectedPeriodToLock}
                  onChange={(e) => setSelectedPeriodToLock(e.target.value)}
                  className="w-full h-10 px-3 rounded bg-surface-container-low font-body-md text-on-surface border border-border-default/40 focus:outline-none focus:ring-1 focus:ring-primary"
                  disabled={isLocking}
                >
                  {availablePeriods.map((p: any) => (
                    <option key={p.id} value={p.id} disabled={p.hasSnapshot || p.isLocked}>
                      {p.title} ({p.type}) {p.hasSnapshot ? "— [ĐÃ CHỐT]" : p.isLocked ? "— [ĐÃ KHÓA]" : "— SẴN SÀNG CHỐT"}
                    </option>
                  ))}
                  {availablePeriods.length === 0 && (
                    <option value="">{periodLabels.weekShort} — Năm {periodLabels.year} (Mặc định)</option>
                  )}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-label-md text-on-surface-variant font-medium">
                  Ghi chú / Căn cứ chốt kỳ (Tùy chọn):
                </label>
                <textarea
                  value={lockNotes}
                  onChange={(e) => setLockNotes(e.target.value)}
                  placeholder="Ví dụ: Chốt số liệu công tác tuần 41 phục vụ giao ban đầu tuần theo thông báo..."
                  className="w-full h-20 p-2.5 rounded bg-surface-container-low font-body-sm text-on-surface border border-border-default/40 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  disabled={isLocking}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-default/30">
                <button
                  type="button"
                  onClick={() => {
                    setIsLockModalOpen(false);
                    setLockError(null);
                  }}
                  disabled={isLocking}
                  className="px-4 py-2 rounded text-on-surface-variant hover:bg-surface-container font-label-md transition-colors"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  onClick={handleConfirmLock}
                  disabled={isLocking}
                  className="px-4 py-2 rounded bg-primary text-on-primary font-label-md hover:bg-primary/95 transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isLocking ? (
                    <>
                      <span className="material-symbols-outlined text-[16px] animate-spin">refresh</span>
                      <span>Đang tổng hợp &amp; băm SHA-256...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[16px]">lock</span>
                      <span>Xác nhận Chốt &amp; Khóa</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CHI TIẾT BẢN CHỤP SNAPSHOT */}
      {viewingSnapshot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-primary-container/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-surface-container-lowest rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150 border border-border-default/40">
            {/* Modal Header */}
            <div className="p-space-md bg-primary text-on-primary flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px]">verified</span>
                <div className="flex flex-col">
                  <span className="font-headline-sm text-[16px] text-white">
                    Chi Tiết Bản Chụp Số Liệu: {viewingSnapshot.code || viewingSnapshot.id}
                  </span>
                  <span className="font-mono text-[11px] text-primary-fixed">
                    {viewingSnapshot.title || viewingSnapshot.periodTitle}
                  </span>
                </div>
              </div>
              <button
                onClick={() => {
                  setViewingSnapshot(null);
                  setVerificationFeedback(null);
                }}
                className="p-1 rounded text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-space-lg overflow-y-auto flex flex-col gap-space-md text-on-surface">
              {/* Checksum & Verification Section */}
              <div className="p-3 bg-surface-container-low rounded-lg flex flex-col gap-2 border border-border-default/40">
                <div className="flex items-center justify-between">
                  <span className="font-label-sm text-outline uppercase font-semibold">
                    Mã Kiểm Tra Toàn Vẹn SHA-256 (64 hex lowercase):
                  </span>
                  <button
                    onClick={() => handleVerifySnapshot(viewingSnapshot.id)}
                    disabled={isVerifyingSnapshot}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-secondary text-on-secondary text-[11px] font-semibold hover:opacity-90 active-press disabled:opacity-50"
                  >
                    <span className={`material-symbols-outlined text-[14px] ${isVerifyingSnapshot ? "animate-spin" : ""}`}>
                      {isVerifyingSnapshot ? "refresh" : "verified_user"}
                    </span>
                    <span>{isVerifyingSnapshot ? "Đang tính lại hash..." : "Đối soát toàn vẹn"}</span>
                  </button>
                </div>
                <div className="font-mono text-[12px] bg-surface-container-lowest p-2 rounded border border-border-default/30 break-all select-all text-primary font-semibold">
                  {viewingSnapshot.checksum}
                </div>
                {verificationFeedback && (
                  <div className={`p-2 rounded text-[12px] flex items-center gap-1.5 ${
                    verificationFeedback.isValid
                      ? "bg-status-success-bg text-status-success font-semibold"
                      : "bg-status-danger-bg text-status-danger font-semibold"
                  }`}>
                    <span className="material-symbols-outlined text-[16px]">
                      {verificationFeedback.isValid ? "check_circle" : "error"}
                    </span>
                    <span>{verificationFeedback.message}</span>
                  </div>
                )}
              </div>

              {/* Officer and Lock Timestamp */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-surface-container-low/50 rounded-lg text-body-sm">
                <div>
                  <span className="text-outline">Người thực hiện chốt:</span>
                  <div className="font-semibold text-primary">{viewingSnapshot.lockedByName}</div>
                </div>
                <div>
                  <span className="text-outline">Thời điểm chốt &amp; khóa:</span>
                  <div className="font-semibold text-on-surface">
                    {new Date(viewingSnapshot.lockedAt).toLocaleString("vi-VN")}
                  </div>
                </div>
              </div>

              {/* KPI Metrics */}
              {viewingSnapshot.metrics && (
                <div className="flex flex-col gap-1.5">
                  <span className="font-label-md font-semibold text-on-surface">Chỉ số tổng hợp tại thời điểm chốt:</span>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div className="p-2.5 bg-surface-container-low rounded-lg flex flex-col">
                      <span className="text-[11px] text-outline">Tổng số nhiệm vụ</span>
                      <span className="font-headline-sm text-primary text-[18px]">{viewingSnapshot.metrics.totalTasks}</span>
                    </div>
                    <div className="p-2.5 bg-status-success-bg/30 rounded-lg flex flex-col">
                      <span className="text-[11px] text-outline">Đã hoàn thành</span>
                      <span className="font-headline-sm text-status-success text-[18px]">
                        {viewingSnapshot.metrics.completedTasks} ({viewingSnapshot.metrics.completionRate}%)
                      </span>
                    </div>
                    <div className="p-2.5 bg-status-warning-bg/30 rounded-lg flex flex-col">
                      <span className="text-[11px] text-outline">Đang thực hiện</span>
                      <span className="font-headline-sm text-status-warning text-[18px]">{viewingSnapshot.metrics.inProgressTasks}</span>
                    </div>
                    <div className="p-2.5 bg-status-danger-bg/30 rounded-lg flex flex-col">
                      <span className="text-[11px] text-outline">Quá hạn</span>
                      <span className="font-headline-sm text-status-danger text-[18px]">{viewingSnapshot.metrics.overdueTasks}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Actions Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-border-default/40 mt-2">
                <span className="text-[11px] text-outline">
                  Trạng thái bản ghi: <strong className="text-status-success">{viewingSnapshot.status}</strong>
                </span>
                <div className="flex items-center gap-2">
                  {canExport && (
                    <button
                      onClick={() => handleExportSnapshotXlsx(viewingSnapshot.id, "legacy")}
                      className="px-3 py-1.5 rounded bg-surface-container-low text-primary font-label-sm hover:bg-surface-container transition-colors"
                    >
                      Mẫu A (Tổng hợp .xlsx)
                    </button>
                  )}
                  {canExport && (
                    <button
                      onClick={() => handleExportSnapshotXlsx(viewingSnapshot.id, "detailed")}
                      className="px-3 py-1.5 rounded bg-primary text-on-primary font-label-sm hover:bg-primary/95 transition-colors"
                    >
                      Mẫu B (Chi tiết .xlsx)
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* DRILLDOWN MODAL DIALOG (DRAWER-STYLE) */}
      {drilldownTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-primary-container/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-surface-container-lowest rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-space-md bg-primary text-on-primary flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px]">manage_search</span>
                <div className="flex flex-col">
                  <span className="font-headline-sm text-[16px] text-white">
                    Chi Tiết Chứng Từ Nguồn &amp; Nhật Ký Tác Nghiệp
                  </span>
                  <span className="font-mono text-[11px] text-primary-fixed">
                    MÃ ĐẦU VIỆC: {drilldownTask.id} ({drilldownTask.code})
                  </span>
                </div>
              </div>
              <button
                onClick={() => setDrilldownTask(null)}
                className="p-1 rounded text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-space-lg overflow-y-auto flex flex-col gap-space-md text-on-surface">
              <div className="p-3 bg-surface-container-low rounded-lg flex flex-col gap-1">
                <span className="font-label-sm text-outline uppercase tracking-wider">
                  Tên đầu việc nghiệp vụ (Cột C):
                </span>
                <span className="font-body-semibold text-[15px] text-primary">{drilldownTask.title}</span>
              </div>

              <div className="grid grid-cols-2 gap-space-sm text-[13px]">
                <div className="p-2.5 bg-surface-subtle rounded flex flex-col">
                  <span className="text-outline text-[11px]">Cán bộ thực hiện:</span>
                  <span className="font-body-semibold text-on-surface">{drilldownTask.officer}</span>
                  <span className="text-[11px] text-on-surface-variant">{drilldownTask.department}</span>
                </div>
                <div className="p-2.5 bg-surface-subtle rounded flex flex-col">
                  <span className="text-outline text-[11px]">Thời gian tác nghiệp:</span>
                  <span className="font-body-semibold text-on-surface">{drilldownTask.shiftTime}</span>
                  <span className="text-[11px] text-status-success font-medium">Đã chốt kết quả trong ca</span>
                </div>
              </div>

              {/* Source documents */}
              <div className="flex flex-col gap-2">
                <span className="font-body-semibold text-body-semibold text-on-surface">
                  Chứng từ nguồn &amp; Dữ liệu liên kết:
                </span>
                <div className="flex flex-col gap-1.5">
                  {drilldownTask.vouchers.length > 0 ? (
                    drilldownTask.vouchers.map((v, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 bg-surface-container-low rounded text-[13px]"
                      >
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-[18px] text-secondary">description</span>
                          <span>
                            Tờ khai / Văn bản số <strong>{v.number}</strong> ({v.company})
                          </span>
                        </div>
                        <span className="font-mono text-[11px] text-status-success bg-status-success-bg px-2 py-0.5 rounded">
                          {v.status}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="p-2 bg-surface-container-low rounded text-[13px] text-outline">
                      Không phát sinh chứng từ tờ khai điện tử kèm theo.
                    </div>
                  )}
                </div>
              </div>

              {/* Audit timeline */}
              <div className="flex flex-col gap-2">
                <span className="font-body-semibold text-body-semibold text-on-surface">Nhật ký tác nghiệp cán bộ:</span>
                <div className="space-y-2 text-[12px] text-on-surface-variant border-l-2 border-secondary pl-3 ml-1">
                  {drilldownTask.auditLog.map((log, idx) => (
                    <div key={idx} className="flex flex-col">
                      <span className="font-mono text-outline">{log.time}</span>
                      <span>{log.action}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-space-md bg-surface-subtle flex items-center justify-end gap-2">
              <button
                onClick={() => setDrilldownTask(null)}
                className="px-3 py-1.5 rounded bg-surface-container text-on-surface-variant font-label-md hover:bg-surface-container-high transition-colors active-press"
              >
                Đóng
              </button>
              <Link
                href="/routine"
                className="px-3 py-1.5 rounded bg-secondary text-on-secondary font-label-md hover:opacity-90 transition-opacity active-press"
              >
                Xem sổ nhật ký gốc
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* INTERACTIVE FEEDBACK TOAST NOTIFICATION */}
      {toastMsg && (
        <div className="fixed bottom-6 left-4 right-4 lg:left-auto lg:right-6 lg:w-96 bg-primary text-on-primary p-space-sm rounded-xl shadow-xl flex items-center justify-between z-50 animate-in fade-in slide-in-from-bottom duration-200">
          <div className="flex items-center gap-space-xs">
            <span className="material-symbols-outlined text-status-success text-[20px]">task_alt</span>
            <span className="font-body-semibold text-[13px]">{toastMsg}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReportsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[400px]">
          <span className="material-symbols-outlined text-secondary text-[32px] animate-spin">
            refresh
          </span>
        </div>
      }
    >
      <ReportsContent />
    </Suspense>
  );
}
