import Link from "next/link";

type BackButtonProps = {
  /** Trang cha xác định (không dùng browser history). */
  href: string;
  /** Nhãn hiển thị, mặc định "Quay lại". */
  label?: string;
  /** Bổ sung class cho từng màn hình khi cần. */
  className?: string;
};

/**
 * Nút quay lại dùng chung: luôn trỏ trang cha cố định,
 * vùng chạm tối thiểu 44px (min-h-11), dễ thấy trên mobile và desktop.
 */
export default function BackButton({ href, label = "Quay lại", className = "" }: BackButtonProps) {
  return (
    <Link
      href={href}
      data-testid="back-button"
      className={`inline-flex w-fit max-w-full min-h-11 touch-manipulation items-center gap-2 rounded-lg border border-border-default bg-surface-container-lowest px-3.5 py-2 text-label-md font-semibold text-primary shadow-sm transition-fast hover:border-border-subtle hover:bg-surface-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 active-press ${className}`}
    >
      <span className="material-symbols-outlined shrink-0 text-[20px]" aria-hidden="true">
        arrow_back
      </span>
      <span className="truncate">{label}</span>
    </Link>
  );
}
