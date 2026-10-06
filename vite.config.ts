import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves the site at /bf-version-converter/
export default defineConfig({
  base: "/bf-version-converter/",
  plugins: [react()],
  worker: { format: "es" },
});
