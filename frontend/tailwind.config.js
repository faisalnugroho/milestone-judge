/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0B0F1A",
          900: "#101626",
          850: "#141B2E",
          800: "#1A2338",
          700: "#243154",
          600: "#33426E",
          400: "#7C8BB5",
          300: "#A8B4D4",
          200: "#CDD5E8",
        },
        verdict: {
          400: "#F5C445",
          500: "#EDAF12",
          600: "#D09206",
        },
        pass: "#2FBF71",
        fail: "#E5484D",
        warn: "#F5A623",
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
