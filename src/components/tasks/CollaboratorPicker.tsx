"use client";

import { V5Icon } from "@/components/v5/ui/icon";

import React from "react";

export interface PickerPerson {
  id: string;
  fullName: string;
}

interface CollaboratorPickerProps {
  people: PickerPerson[];
  value: string[];
  onChange: (ids: string[]) => void;
  excludeId?: string;
  disabled?: boolean;
}

/**
 * YC-01 — Chọn cán bộ phối hợp: mỗi người một hàng riêng, nút thêm/bớt,
 * chặn trùng người và chặn trùng chủ trì ngay trên UI (backend kiểm tra lại).
 */
export function CollaboratorPicker({ people, value, onChange, excludeId, disabled }: CollaboratorPickerProps) {
  const available = people.filter((p) => p.id !== excludeId && !value.includes(p.id));

  const addPerson = (id: string) => {
    if (!id) return;
    if (value.includes(id)) return;
    onChange([...value, id]);
  };

  const removePerson = (id: string) => {
    onChange(value.filter((v) => v !== id));
  };

  const nameOf = (id: string) => people.find((p) => p.id === id)?.fullName || id;

  return (
    <div className="flex flex-col gap-2">
      <label className="font-label-md text-label-md text-primary font-semibold">
        Cán bộ phối hợp {value.length > 0 && <span className="text-on-surface-variant font-normal">({value.length} người)</span>}
      </label>

      {value.map((id) => (
        <div
          key={id}
          className="flex items-center gap-2 h-10 px-2 rounded bg-surface-container-low border border-border-subtle"
        >
          <V5Icon name="group_add" className="text-[18px] text-secondary shrink-0" />
          <select
            value={id}
            disabled={disabled}
            onChange={(e) => {
              const next = e.target.value;
              if (!next || value.includes(next)) return;
              onChange(value.map((v) => (v === id ? next : v)));
            }}
            className="flex-1 min-w-0 bg-transparent text-body-md font-body-md text-on-surface focus:outline-none"
          >
            <option value={id}>{nameOf(id)}</option>
            {available.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={disabled}
            onClick={() => removePerson(id)}
            title="Bỏ người phối hợp này"
            className="p-1 rounded text-status-danger hover:bg-status-danger/10 shrink-0 disabled:opacity-40"
          >
            <V5Icon name="person_remove" className="text-[18px]" />
          </button>
        </div>
      ))}

      <div className="flex items-center gap-2">
        <select
          value=""
          disabled={disabled || available.length === 0}
          onChange={(e) => {
            addPerson(e.target.value);
            e.target.value = "";
          }}
          className="flex-1 h-10 px-2 rounded bg-surface-container-low text-body-md font-body-md text-on-surface border border-dashed border-border-subtle focus:outline-none focus:ring-1 focus:ring-secondary disabled:opacity-50"
        >
          <option value="">
            {available.length === 0 ? "Đã chọn hết cán bộ trong danh sách" : "+ Thêm người phối hợp"}
          </option>
          {available.map((p) => (
            <option key={p.id} value={p.id}>
              {p.fullName}
            </option>
          ))}
        </select>
      </div>
      <p className="text-[11px] text-on-surface-variant">
        Mỗi nhiệm vụ là một bản ghi duy nhất — người phối hợp cùng theo dõi và cập nhật, không tách việc riêng.
      </p>
    </div>
  );
}
