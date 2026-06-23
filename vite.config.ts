import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/admin/",
  publicDir: false,
  plugins: [react()],
  build: {
    outDir: "public/admin",
    emptyOutDir: true
  }
});
