"use client";

import React, { useState, useEffect } from "react";
import { Upload } from "lucide-react";
import { toast } from "@/components/ui/Toast";
import BackButton from "@/components/ui/BackButton";
import { Badge } from "@/components/v5/ui/badge";
import { Button } from "@/components/v5/ui/button";

interface FormFieldDef {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "date" | "textarea" | "checkbox";
  required: boolean;
  options?: string[];
  placeholder?: string;
  defaultValue?: string;
}

interface FormTemplateItem {
  id: string;
  code: string;
  name: string;
  description: string;
  versions: Array<{
    id: string;
    version: number;
    status: string;
    schemaJson: any;
    publishedAt: string;
  }>;
}

export default function DynamicFormBuilderPage() {
  const [templates, setTemplates] = useState<FormTemplateItem[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [fields, setFields] = useState<FormFieldDef[]>([
    {
      key: "declaration_number",
      label: "Số tờ khai hải quan điện tử VNACCS",
      type: "text",
      required: true,
      placeholder: "Ví dụ: 105992019910",
    },
    {
      key: "enterprise_name",
      label: "Tên doanh nghiệp / Người khai hải quan",
      type: "text",
      required: true,
      placeholder: "Công ty TNHH Xuất nhập khẩu...",
    },
    {
      key: "channel",
      label: "Phân luồng tờ khai",
      type: "select",
      required: true,
      options: ["Luồng Xanh (1)", "Luồng Vàng (2)", "Luồng Đỏ (3)"],
    },
    {
      key: "vehicle_count",
      label: "Số lượng phương tiện vận tải / Container",
      type: "number",
      required: false,
      placeholder: "Số lượng xe hoặc container",
    },
    {
      key: "seal_intact",
      label: "Niêm phong kẹp chì hải quan nguyên vẹn",
      type: "checkbox",
      required: false,
    },
    {
      key: "officer_notes",
      label: "Ghi chú kiểm tra thực tế & Vướng mắc",
      type: "textarea",
      required: false,
      placeholder: "Ghi nhận kết quả soi chiếu, kiểm hóa...",
    },
  ]);

  const [activeVersionNum, setActiveVersionNum] = useState<number>(1);
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldType, setNewFieldType] = useState<FormFieldDef["type"]>("text");
  const [newFieldRequired, setNewFieldRequired] = useState(false);
  const [newFieldOptions, setNewFieldOptions] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [previewValues, setPreviewValues] = useState<Record<string, any>>({});

  useEffect(() => {
    fetch("/api/admin/forms")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.templates) && data.templates.length > 0) {
          setTemplates(data.templates);
          setSelectedTemplateId(data.templates[0].id);
          const latestVer = data.templates[0].versions?.[0];
          if (latestVer) {
            setActiveVersionNum(latestVer.version);
            if (latestVer.schemaJson?.fields) {
              setFields(latestVer.schemaJson.fields);
            }
          }
        }
      })
      .catch((err) => console.log("Load form templates error:", err));
  }, []);

  const handleAddField = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFieldLabel.trim()) return;

    const rawKey = newFieldLabel
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "_")
      .replace(/_+/g, "_")
      .slice(0, 30);

    const key = `${rawKey}_${Date.now().toString().slice(-4)}`;

    const newField: FormFieldDef = {
      key,
      label: newFieldLabel.trim(),
      type: newFieldType,
      required: newFieldRequired,
      options:
        newFieldType === "select"
          ? newFieldOptions.split(",").map((s) => s.trim()).filter(Boolean)
          : undefined,
    };

    setFields([...fields, newField]);
    setNewFieldLabel("");
    setNewFieldOptions("");
    setNewFieldRequired(false);
    toast.success(`Đã thêm trường '${newField.label}' vào cấu trúc biểu mẫu!`);
  };

  const handleRemoveField = (index: number) => {
    setFields(fields.filter((_, idx) => idx !== index));
    toast.info("Đã xóa trường khỏi biểu mẫu");
  };

  const handlePublishVersion = async () => {
    setIsPublishing(true);
    try {
      const res = await fetch("/api/admin/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: selectedTemplateId || undefined,
          name: "Biểu mẫu tác nghiệp Hải quan Cửa khẩu",
          schemaJson: { fields },
          versionNote: `Phát hành bản v${activeVersionNum + 1}: Cập nhật ${fields.length} trường nghiệp vụ`,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setActiveVersionNum(data.version?.version || activeVersionNum + 1);
        toast.success(`Đã phát hành thành công phiên bản v${data.version?.version || activeVersionNum + 1}!`);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Không thể phát hành phiên bản mới");
      }
    } catch (err: any) {
      toast.error(err.message || "Lỗi mạng khi phát hành phiên bản");
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-3 pb-4">
      <div>
        <BackButton href="/admin/system" label="Cấu hình hệ thống" />
      </div>

      <header className="flex flex-wrap items-end justify-between gap-2 rounded-xl border border-v5-line bg-v5-surface p-3 shadow-sm">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-v5-ink">Thiết kế biểu mẫu</h1>
            <Badge variant="outline">Bản nháp v{activeVersionNum}.0</Badge>
          </div>
          <p className="mt-1 text-sm text-v5-muted">
            Cấu hình trường dữ liệu, chỉ tiêu kiểm tra và biểu mẫu số liệu Hải quan.
          </p>
        </div>
        <Button size="sm" onClick={handlePublishVersion} disabled={isPublishing}>
          <Upload className="h-3.5 w-3.5" />
          {isPublishing ? "Đang phát hành..." : `Phát hành v${activeVersionNum + 1}.0`}
        </Button>
      </header>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
        {/* Left Column: Form Schema Builder (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col gap-space-md">
          {/* Add New Field Box */}
          <div className="bg-v5-surface p-space-md rounded-xl shadow-sm border border-v5-line/50 flex flex-col gap-space-sm">
            <div className="flex items-center justify-between border-b border-surface-container pb-space-xs">
              <span className="font-headline-sm text-primary font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[20px]">add_box</span>
                Thêm trường dữ liệu mới
              </span>
              <span className="font-label-sm text-xs text-v5-muted">{fields.length} trường hiện có</span>
            </div>

            <form onSubmit={handleAddField} className="grid grid-cols-1 md:grid-cols-2 gap-space-sm pt-2">
              <div className="flex flex-col gap-1 md:col-span-2">
                <label className="font-label-sm text-xs text-primary font-semibold">Tên nhãn trường (Label) *</label>
                <input
                  type="text"
                  required
                  value={newFieldLabel}
                  onChange={(e) => setNewFieldLabel(e.target.value)}
                  placeholder="Ví dụ: Tỷ lệ hao hụt nguyên liệu gia công (%)..."
                  className="h-10 px-3 rounded bg-v5-bg border border-v5-line text-body-md text-v5-ink focus:outline-none focus:ring-1 focus:ring-secondary"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-label-sm text-xs text-primary font-semibold">Kiểu dữ liệu (Data Type)</label>
                <select
                  value={newFieldType}
                  onChange={(e) => setNewFieldType(e.target.value as any)}
                  className="h-10 px-3 rounded bg-v5-bg border border-v5-line text-body-md text-v5-ink focus:outline-none"
                >
                  <option value="text">Văn bản ngắn (Text)</option>
                  <option value="number">Số liệu / Định lượng (Number)</option>
                  <option value="select">Hộp chọn lựa chọn (Dropdown)</option>
                  <option value="date">Ngày tháng (Date)</option>
                  <option value="textarea">Văn bản nhiều dòng (Textarea)</option>
                  <option value="checkbox">Hộp kiểm Đúng/Sai (Checkbox)</option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newFieldRequired}
                    onChange={(e) => setNewFieldRequired(e.target.checked)}
                    className="w-4 h-4 rounded text-secondary"
                  />
                  <span className="font-label-md text-sm text-v5-ink font-semibold">Bắt buộc nhập</span>
                </label>
              </div>

              {newFieldType === "select" && (
                <div className="flex flex-col gap-1 md:col-span-2">
                  <label className="font-label-sm text-xs text-primary font-semibold">
                    Các lựa chọn (Phân cách bằng dấu phẩy)
                  </label>
                  <input
                    type="text"
                    value={newFieldOptions}
                    onChange={(e) => setNewFieldOptions(e.target.value)}
                    placeholder="Lựa chọn 1, Lựa chọn 2, Lựa chọn 3"
                    className="h-10 px-3 rounded bg-v5-bg border border-v5-line text-body-md text-v5-ink focus:outline-none"
                  />
                </div>
              )}

              <div className="md:col-span-2 flex justify-end pt-1">
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-secondary text-on-secondary font-label-md font-semibold hover:opacity-90 shadow-sm transition-fast active-press flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[18px]">add</span>
                  <span>Chèn vào biểu mẫu</span>
                </button>
              </div>
            </form>
          </div>

          {/* Active Fields List */}
          <div className="bg-v5-surface p-space-md rounded-xl shadow-sm border border-v5-line/50 flex flex-col gap-space-sm">
            <span className="font-headline-sm text-primary font-bold">Danh sách trường trong biểu mẫu (Schema v{activeVersionNum}.0)</span>

            <div className="flex flex-col divide-y divide-surface-container">
              {fields.map((f, idx) => (
                <div key={f.key} className="py-3 flex items-center justify-between gap-space-sm hover:bg-v5-bg/50 px-2 rounded transition-fast">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-v5-bg text-primary flex items-center justify-center font-mono text-xs font-bold">
                      {idx + 1}
                    </span>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-body-semibold text-primary font-semibold">{f.label}</span>
                        {f.required && (
                          <span className="px-1.5 py-0.2 rounded bg-status-danger-bg text-status-danger text-[10px] font-bold">
                            BẮT BUỘC
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-mono text-v5-muted">
                        key: {f.key} | type: {f.type.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleRemoveField(idx)}
                      className="w-8 h-8 rounded hover:bg-status-danger-bg text-v5-muted hover:text-status-danger flex items-center justify-center transition-colors"
                      title="Xóa trường"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Live Form Interactive Preview (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col gap-space-md">
          <div className="bg-v5-surface p-space-lg rounded-xl shadow-sm border border-v5-line/50 flex flex-col gap-space-md sticky top-20">
            <div className="flex items-center justify-between border-b border-surface-container pb-space-xs">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-status-success text-[22px]">visibility</span>
                <span className="font-headline-sm text-primary font-bold">Xem trước biểu mẫu thực tế</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-status-success-bg text-status-success text-xs font-bold">
                LIVE INTERACTION
              </span>
            </div>

            <p className="font-label-sm text-xs text-v5-muted">
              Đây là giao diện tương tác động chính xác mà công chức Hải quan sẽ thao tác khi ghi nhận nhật ký nghiệp vụ.
            </p>

            <div className="flex flex-col gap-space-md">
              {fields.map((field) => (
                <div key={field.key} className="flex flex-col gap-1">
                  <label className="font-label-md text-xs text-primary font-semibold flex items-center justify-between">
                    <span>
                      {field.label} {field.required && <span className="text-status-danger">*</span>}
                    </span>
                    <span className="text-[10px] font-mono text-v5-muted">{field.type}</span>
                  </label>

                  {field.type === "text" && (
                    <input
                      type="text"
                      placeholder={field.placeholder || "Nhập giá trị..."}
                      value={previewValues[field.key] || ""}
                      onChange={(e) => setPreviewValues({ ...previewValues, [field.key]: e.target.value })}
                      className="h-9 px-3 rounded bg-v5-bg text-body-md text-v5-ink border border-v5-line focus:outline-none"
                    />
                  )}

                  {field.type === "number" && (
                    <input
                      type="number"
                      placeholder={field.placeholder || "0"}
                      value={previewValues[field.key] || ""}
                      onChange={(e) => setPreviewValues({ ...previewValues, [field.key]: e.target.value })}
                      className="h-9 px-3 rounded bg-v5-bg text-body-md text-v5-ink border border-v5-line focus:outline-none"
                    />
                  )}

                  {field.type === "select" && (
                    <select
                      value={previewValues[field.key] || ""}
                      onChange={(e) => setPreviewValues({ ...previewValues, [field.key]: e.target.value })}
                      className="h-9 px-3 rounded bg-v5-bg text-body-md text-v5-ink border border-v5-line focus:outline-none"
                    >
                      <option value="">-- Chọn phương án --</option>
                      {field.options?.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  )}

                  {field.type === "textarea" && (
                    <textarea
                      rows={2}
                      placeholder={field.placeholder || "Nội dung chi tiết..."}
                      value={previewValues[field.key] || ""}
                      onChange={(e) => setPreviewValues({ ...previewValues, [field.key]: e.target.value })}
                      className="p-2 rounded bg-v5-bg text-body-md text-v5-ink border border-v5-line focus:outline-none resize-none"
                    />
                  )}

                  {field.type === "checkbox" && (
                    <label className="flex items-center gap-2 cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={!!previewValues[field.key]}
                        onChange={(e) => setPreviewValues({ ...previewValues, [field.key]: e.target.checked })}
                        className="w-4 h-4 rounded text-secondary"
                      />
                      <span className="text-xs text-v5-ink font-medium">Xác nhận đúng / hợp lệ</span>
                    </label>
                  )}

                  {field.type === "date" && (
                    <input
                      type="date"
                      value={previewValues[field.key] || ""}
                      onChange={(e) => setPreviewValues({ ...previewValues, [field.key]: e.target.value })}
                      className="h-9 px-3 rounded bg-v5-bg text-body-md text-v5-ink border border-v5-line focus:outline-none"
                    />
                  )}
                </div>
              ))}

              <div className="pt-2 border-t border-surface-container flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    for (const field of fields) {
                      const val = previewValues[field.key];
                      if (field.required && (val === undefined || val === null || String(val).trim() === "")) {
                        toast.warning(`Trường "${field.label}" là bắt buộc! Vui lòng nhập dữ liệu kiểm thử.`);
                        return;
                      }
                      if (field.type === "number" && val !== undefined && val !== "") {
                        if (isNaN(Number(val))) {
                          toast.warning(`Trường "${field.label}" yêu cầu định dạng số hợp lệ!`);
                          return;
                        }
                      }
                    }
                    toast.success("Xác thực Schema thành công: Cấu trúc biểu mẫu chuẩn xác 100% và sẵn sàng ban hành!");
                  }}
                  className="w-full py-2.5 rounded-lg bg-secondary text-on-secondary font-label-md text-sm font-semibold shadow-sm hover:bg-secondary/90 transition-all active-press flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]">verified</span>
                  <span>Kiểm tra hợp lệ biểu mẫu (Validate Schema)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
