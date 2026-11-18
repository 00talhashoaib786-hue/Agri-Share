/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: { forest: "#145A32", leaf: "#67A834", gold: "#E6B325", soil: "#5C3A21", ivory: "#FAF8EE" },
      fontFamily: {
        sans: ["'Plus Jakarta Sans'", "system-ui", "sans-serif"],
        display: ["'Bricolage Grotesque'", "'Plus Jakarta Sans'", "system-ui", "sans-serif"],
        urdu: ["'Noto Naskh Arabic'", "'Plus Jakarta Sans'", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
