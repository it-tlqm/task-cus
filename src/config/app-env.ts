/**
 * Nhãn môi trường hiển thị cho người dùng.
 * Môi trường DEMO (đặt NEXT_PUBLIC_ENV_LABEL=DEMO) KHÔNG được hiện
 * "VẬN HÀNH CHÍNH THỨC" để tránh nhầm với hệ thống thật.
 */
export const IS_DEMO_ENV =
  (process.env.NEXT_PUBLIC_ENV_LABEL || "").trim().toUpperCase() === "DEMO";

export const ENV_BADGE_LABEL = IS_DEMO_ENV ? "BẢN DEMO" : "CHÍNH THỨC";

export const ENV_HEADER_TITLE = IS_DEMO_ENV
  ? "BẢN DEMO — MÔI TRƯỜNG THỬ NGHIỆM"
  : "HỆ THỐNG VẬN HÀNH CHÍNH THỨC";

export const ENV_SIDEBAR_LABEL = IS_DEMO_ENV ? "BẢN DEMO" : "VẬN HÀNH CHÍNH THỨC";
