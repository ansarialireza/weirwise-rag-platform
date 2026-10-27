/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#090A0C",
        foreground: "#EDEDED",
        card: {
          DEFAULT: "#111318",
          foreground: "#EDEDED",
        },
        popover: {
          DEFAULT: "#111318",
          foreground: "#EDEDED",
        },
        primary: {
          DEFAULT: "#CCFF00", // Electric Lime Accent
          foreground: "#000000",
        },
        secondary: {
          DEFAULT: "#1C1F26",
          foreground: "#EDEDED",
        },
        muted: {
          DEFAULT: "#16181F",
          foreground: "#8E95A5",
        },
        accent: {
          DEFAULT: "#CCFF00",
          foreground: "#000000",
        },
        destructive: {
          DEFAULT: "#FF453A",
          foreground: "#FFFFFF",
        },
        border: "#232733",
        input: "#1C1F26",
        ring: "#CCFF00",
      },
      borderRadius: {
        lg: "0.5rem",
        md: "0.375rem",
        sm: "0.25rem",
      },
    },
  },
  plugins: [],
};
