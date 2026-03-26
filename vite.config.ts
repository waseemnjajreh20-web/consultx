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
}));
