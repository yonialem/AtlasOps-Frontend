/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        app: {
          bg: "#0b0f19",
          slate: "#0f172a",
        },
        surface: {
          DEFAULT: "#1e293b",
          elevated: "#334155",
        },
        border: {
          subtle: "#334155",
          focus: "#3b82f6",
        },
        txt: {
          primary: "#f8fafc",
          secondary: "#94a3b8",
          muted: "#64748b",
        },
        sev: {
          critical: {
            bg: "#450a0a",
            border: "#dc2626",
            text: "#fecaca",
          },
          high: {
            bg: "#431407",
            border: "#ea580c",
            text: "#fed7aa",
          },
          medium: {
            bg: "#422006",
            border: "#d97706",
            text: "#fde68a",
          },
          low: {
            bg: "#1e293b",
            border: "#64748b",
            text: "#e2e8f0",
          },
        },
        status: {
          triggered: "#ef4444",
          acknowledged: "#3b82f6",
          investigating: "#a855f7",
          resolved: "#10b981",
        },
      },
    },
  },
  plugins: [],
};
