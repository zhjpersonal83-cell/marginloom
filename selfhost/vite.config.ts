import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));
export default defineConfig({
  root: at("./"),
  publicDir: at("../public"),
  plugins: [react()],
  resolve: {
    alias: {
      "next/link": at("./link.tsx"),
      "next/image": at("./image.tsx"),
      "@": at("../"),
    },
  },
  css: { postcss: at("../") },
  build: { outDir: at("../dist-selfhost/client"), emptyOutDir: true },
});
