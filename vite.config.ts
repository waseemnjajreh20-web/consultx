import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // motion-utils dist/es/*.mjs files are missing (only .map files exist);
      // redirect to the CJS bundle which is present and complete.
      "motion-utils": path.resolve(
        __dirname,
        "./node_modules/motion-utils/dist/cjs/index.js"
      ),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/framer-motion")) return "vendor-framer";
          if (id.includes("node_modules/@supabase/supabase-js")) return "vendor-supabase";
          if (id.includes("node_modules/pdfjs-dist")) return "vendor-pdfjs";
          if (id.includes("node_modules/docx") || id.includes("node_modules/jszip")) return "vendor-docx";
          if (id.includes("node_modules/recharts") || id.includes("d3-")) return "vendor-charts";
          if (id.includes("node_modules/@radix-ui/")) return "vendor-radix";
          if (id.includes("node_modules/lucide-react")) return "vendor-icons";
          if (id.includes("node_modules/react-router")) return "vendor-router";
          if (id.includes("node_modules/@tanstack/react-query")) return "vendor-query";
        },
      },
    },
  },
}));
