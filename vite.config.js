import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vercel detects Vite automatically: build command "npm run build", output folder "dist".
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 1500,
  },
});
