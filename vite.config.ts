import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@contracts": path.resolve(__dirname, "./src/contracts/index.ts"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // @ts-expect-error Vitest configuration
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "**/.worktrees/**"],
  },
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 3000,
  },
});
