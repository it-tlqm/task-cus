"use client";

import React, { useRef } from "react";

/**
 * Ô nhập số kiểu Việt Nam:
 * - Hiển thị phân cách hàng nghìn bằng dấu chấm: 1.000.000
 * - Cho phép thập phân bằng dấu phẩy: 1.000,5
 * - Giá trị truyền ra ngoài (`onValueChange`) là chuỗi raw không có dấu phân cách,
 *   dùng dấu phẩy cho phần thập phân, để backend parse ổn định.
 */

export function formatNumberInputDisplay(raw: string): string {
  const original = String(raw ?? "").trim();
  if (!original) return "";
  const negative = original.startsWith("-");
  let body = original.replace(/-/g, "");
  // Dữ liệu cũ/API có thể dùng dấu chấm thập phân; chuẩn hoá sang dấu phẩy.
  if (!body.includes(",") && body.includes(".")) {
    body = body.replace(/\./g, ",");
  }
  const commaIndex = body.indexOf(",");
  const integerRaw = (commaIndex >= 0 ? body.slice(0, commaIndex) : body).replace(/\D/g, "");
  const decimalRaw = commaIndex >= 0 ? body.slice(commaIndex + 1).replace(/\D/g, "") : null;
  const grouped = integerRaw.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negative ? "-" : ""}${grouped}${decimalRaw !== null ? `,${decimalRaw}` : ""}`;
}

export function sanitizeNumberInput(value: string): string {
  const original = String(value ?? "");
  const negative = original.trim().startsWith("-");
  let body = original.replace(/-/g, "").replace(/[^\d.,]/g, "");
  const commaIndex = body.indexOf(",");
  if (commaIndex >= 0) {
    body = `${body.slice(0, commaIndex + 1)}${body.slice(commaIndex + 1).replace(/,/g, "")}`;
  }
  // Dấu chấm người dùng gõ được hiểu là phân cách hàng nghìn, không lưu vào raw.
  body = body.replace(/\./g, "");
  return `${negative ? "-" : ""}${body}`;
}

export interface FormattedNumberInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  value: string;
  onValueChange: (raw: string) => void;
}

export default function FormattedNumberInput({
  value,
  onValueChange,
  className,
  placeholder,
  ...rest
}: FormattedNumberInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const el = event.target;
    const caret = el.selectionStart ?? el.value.length;
    const digitsBeforeCaret = el.value
      .slice(0, caret)
      .replace(/[^\d]/g, "").length;
    const raw = sanitizeNumberInput(el.value);
    onValueChange(raw);
    const display = formatNumberInputDisplay(raw);
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      let position = 0;
      let seen = 0;
      while (position < display.length && seen < digitsBeforeCaret) {
        if (/\d/.test(display[position])) seen += 1;
        position += 1;
      }
      input.setSelectionRange(position, position);
    });
  }

  return (
    <input
      {...rest}
      ref={inputRef}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={formatNumberInputDisplay(value)}
      onChange={handleChange}
      className={className}
      placeholder={placeholder}
    />
  );
}
