import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/modules/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#001D36",
          container: "#17324D",
          light: "#2F4865",
          fixed: "#D1E4FF",
        },
        secondary: {
          DEFAULT: "#006A62",
          accent: "#0B766D",
          container: "#98EFE4",
          fixed: "#9BF2E7",
        },
        tertiary: {
          DEFAULT: "#141D1C",
          fixed: "#DBE5E3",
          mint: "#EAF4F2",
        },
        surface: {
          DEFAULT: "#FAF8FF",
          lowest: "#FFFFFF",
          subtle: "#F1F5F9",
          container: "#EAEDFF",
          high: "#E2E7FF",
        },
        "app-bg": "#F8FAFC",
        border: {
          default: "#E2E8F0",
          subtle: "#CBD5E1",
        },
        status: {
          success: {
            DEFAULT: "#059669",
            text: "#087A5B",
            bg: "#ECFDF5",
          },
          warning: {
            DEFAULT: "#D97706",
            bg: "#FFFBEB",
          },
          danger: {
            DEFAULT: "#E11D48",
            legacy: "#B42318",
            bg: "#FFF1F2",
          },
          inactive: {
            DEFAULT: "#64748B",
            bg: "#F8FAFC",
          },
          unassigned: {
            DEFAULT: "#0284C7",
            bg: "#F0F9FF",
          },
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["monospace"],
      },
      borderRadius: {
        sm: "0.25rem", // 4px (Stitch Soft Level 1)
        md: "0.375rem", // 6px
        lg: "0.5rem", // 8px
        xl: "0.75rem", // 12px
      },
    },
  },
  plugins: [],
};

export default config;
