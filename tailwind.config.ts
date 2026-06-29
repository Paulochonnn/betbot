import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans:    ["var(--font-barlow)", "system-ui", "sans-serif"],
        display: ["var(--font-barlow-condensed)", "sans-serif"],
        mono:    ["var(--font-jetbrains-mono)", "monospace"],
      },
      colors: {
        bg:      "#07090F",
        surface: "#0D1219",
        "surface-2": "#111A26",
        border:  "#1C2A3A",
        accent:  "#E8612D",
        gold:    "#F4B942",
        muted:   "#4A5A72",
      },
    },
  },
  plugins: [],
};
export default config;
