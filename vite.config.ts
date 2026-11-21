import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "web",
  publicDir: "public",
  plugins: [react()],
  build: { outDir: "../dist", emptyOutDir: true },
  server: {
    port: 5173,
    // API_PORT lets you run a second copy (e.g. for testing) without touching a running replay server.
    proxy: {
      "/api": `http://localhost:${process.env.API_PORT ?? 8787}`,
      "/media": `http://localhost:${process.env.API_PORT ?? 8787}`,
    },
  },
  test: undefined,
} as never);
