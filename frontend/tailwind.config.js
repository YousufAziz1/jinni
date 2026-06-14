/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          base: "var(--bg-base)",
          surface: "var(--bg-surface)",
          elevated: "var(--bg-elevated)",
        },
        border: {
          subtle: "var(--border-subtle)",
          active: "var(--border-active)",
        },
        accent: {
          DEFAULT: "var(--accent)",      // Electric Blue
          secondary: "var(--accent-2)",  // Neon Green / Accent
          glow: "var(--accent-glow)",
        },
        text: {
          primary: "var(--text-primary)",
          muted: "var(--text-muted)",
          faint: "var(--text-faint)",
        },
        status: {
          success: "var(--success)",
          warning: "var(--warning)",
          error: "var(--error)",
        }
      },
      fontFamily: {
        display: ["Outfit", "sans-serif"],
        body: ["Plus Jakarta Sans", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      boxShadow: {
        glow: "0 0 20px var(--accent-glow)",
        "glow-green": "0 0 20px rgba(74, 222, 128, 0.2)",
      },
      animation: {
        "mesh-drift": "meshDrift 15s ease-in-out infinite alternate",
        "grid-pan": "gridPan 20s linear infinite",
        "glow-pulse": "glowPulse 2s ease-in-out infinite",
      }
    },
  },
  plugins: [],
}
