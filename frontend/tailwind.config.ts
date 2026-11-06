import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Token-driven so `data-font` on <html> can swap the whole type system
        // for a language. Hardcoding a stack here would re-break Arabic script.
        sans: ["var(--font-stack-body)"],
        display: ["var(--font-stack-display)"],
        arabic: ["var(--font-stack-arabic)"],
      },
      // Same rule for spacing between letters and lines: the values live in
      // globals.css so `[data-font]` can relax them per script. The default
      // scale names are re-pointed at those tokens too — otherwise 40+ existing
      // `tracking-tight` headings would keep negative tracking into Persian and
      // Arabic, where it closes the joins that make the script readable.
      letterSpacing: {
        tighter: "var(--tracking-hero)",
        tight: "var(--tracking-snug)",
        normal: "var(--tracking-normal)",
        wide: "var(--tracking-label)",
        wider: "var(--tracking-label)",
        widest: "var(--tracking-eyebrow)",
        display: "var(--tracking-display)",
        snug: "var(--tracking-snug)",
        hero: "var(--tracking-hero)",
        section: "var(--tracking-section)",
        eyebrow: "var(--tracking-eyebrow)",
        label: "var(--tracking-label)",
      },
      lineHeight: {
        body: "var(--leading-body)",
        snug: "var(--leading-snug)",
        tight: "var(--leading-tight)",
        hero: "var(--leading-hero)",
        section: "var(--leading-section)",
      },
      colors: {
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        canvas: "hsl(var(--background) / <alpha-value>)",
        card: {
          DEFAULT: "hsl(var(--card) / <alpha-value>)",
          foreground: "hsl(var(--card-foreground) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "hsl(var(--popover) / <alpha-value>)",
          foreground: "hsl(var(--popover-foreground) / <alpha-value>)",
        },
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
        },
        signal: {
          DEFAULT: "hsl(var(--signal) / <alpha-value>)",
          foreground: "hsl(var(--signal-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
          strong: "hsl(var(--accent-strong) / <alpha-value>)",
          soft: "hsl(var(--accent-soft) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        success: "hsl(var(--success) / <alpha-value>)",
        warning: "hsl(var(--warning) / <alpha-value>)",
        info: "hsl(var(--info) / <alpha-value>)",
        border: "hsl(var(--border) / <alpha-value>)",
        "border-strong": "hsl(var(--border-strong) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        ring: "hsl(var(--ring) / <alpha-value>)",
        volt: {
          DEFAULT: "hsl(var(--volt) / <alpha-value>)",
          foreground: "hsl(var(--volt-foreground) / <alpha-value>)",
        },
        onyx: {
          DEFAULT: "hsl(var(--onyx) / <alpha-value>)",
        },
        // Semantic roles (ADR-013). Charts and indicators may use these only
        // alongside a label, position or shape cue: they measure 1.01–1.33:1
        // against each other, so hue alone carries no information.
        role: {
          flow: "hsl(var(--signal) / <alpha-value>)",
          intelligence: "hsl(var(--role-intelligence) / <alpha-value>)",
          discovery: "hsl(var(--role-discovery) / <alpha-value>)",
          system: "hsl(var(--info) / <alpha-value>)",
        },
        tint: {
          flow: "hsl(var(--accent-soft) / <alpha-value>)",
          intelligence: "hsl(var(--tint-intelligence) / <alpha-value>)",
          discovery: "hsl(var(--tint-discovery) / <alpha-value>)",
        },
        // Brand spectrum — signature surfaces only, never UI text or borders.
        flow: {
          1: "hsl(var(--flow-1) / <alpha-value>)",
          2: "hsl(var(--flow-2) / <alpha-value>)",
          3: "hsl(var(--flow-3) / <alpha-value>)",
          4: "hsl(var(--flow-4) / <alpha-value>)",
          5: "hsl(var(--flow-5) / <alpha-value>)",
          6: "hsl(var(--flow-6) / <alpha-value>)",
          7: "hsl(var(--flow-7) / <alpha-value>)",
          ink: "hsl(var(--flow-ink) / <alpha-value>)",
          ivory: "hsl(var(--flow-ivory) / <alpha-value>)",
        },
      },
      backgroundImage: {
        "flow-signature": "var(--gradient-flow)",
        "flow-signature-soft": "var(--gradient-flow-soft)",
      },
      transitionTimingFunction: {
        standard: "cubic-bezier(0.22, 0.61, 0.36, 1)",
        soft: "cubic-bezier(0.16, 0.84, 0.44, 1)",
        flow: "cubic-bezier(0.65, 0, 0.35, 1)",
      },
      transitionDuration: {
        instant: "90ms",
        fast: "140ms",
        standard: "220ms",
        enter: "320ms",
        flow: "1200ms",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "calc(var(--radius) + 4px)",
        "2xl": "calc(var(--radius) + 10px)",
      },
      boxShadow: {
        soft: "var(--shadow-soft)",
        lift: "var(--shadow-lift)",
      },
      spacing: {
        18: "4.5rem",
      },
      maxWidth: {
        content: "72rem",
        wide: "80rem",
        prose: "44rem",
      },
    },
  },
  plugins: [],
};

export default config;
