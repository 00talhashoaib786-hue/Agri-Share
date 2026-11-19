import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Split big vendor libraries into their own long-cached chunks
function manualChunks(id) {
  if (!id.includes("node_modules")) return undefined;
  if (id.includes("/firebase/") || id.includes("/@firebase/")) return "firebase";
  if (id.includes("/lucide-react/")) return "icons";
  if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("/scheduler/")) return "react";
  return undefined;
}

// Vercel detects Vite automatically: build command "npm run build", output folder "dist".
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: true, // Lighthouse "missing source maps"; note the original source becomes publicly readable
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: { manualChunks },
    },
  },
});
