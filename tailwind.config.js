/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      // gold lifted to #EDC04A and leafink added so small text meets WCAG AA (4.5:1)
      colors: { forest: "#145A32", leaf: "#67A834", leafink: "#3F7A1F", gold: "#EDC04A", soil: "#5C3A21", ivory: "#FAF8EE" },
      fontFamily: {
        sans: ["'Plus Jakarta Sans'", "system-ui", "sans-serif"],
        display: ["'Bricolage Grotesque'", "'Plus Jakarta Sans'", "system-ui", "sans-serif"],
        urdu: ["'Noto Naskh Arabic'", "'Plus Jakarta Sans'", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
