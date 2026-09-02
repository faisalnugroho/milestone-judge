/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Apple-style neutrals
        ink: {
          50: "#1d1d1f",
          100: "#1d1d1f",
          200: "#424245",
          300: "#515154",
          400: "#6e6e73",
          500: "#86868b",
        },
        verdict: {
          400: "#0071e3",
          500: "#0071e3",
          600: "#0058b8",
        },
        pass: "#34c759",
        fail: "#ff3b30",
        warn: "#ff9500",
        dispute: "#af52de",
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"SF Pro Text"',
          '"SF Pro Display"',
          '"Helvetica Neue"',
          "system-ui",
          "sans-serif",
        ],
        mono: ['"SF Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        apple: "18px",
      },
      boxShadow: {
        card: "0 2px 12px rgba(0,0,0,0.04)",
        pop: "0 4px 24px rgba(0,0,0,0.08)",
      },
    },
  },
  plugins: [],
};
