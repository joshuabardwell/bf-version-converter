import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves the site at /bf-version-converter/
export default defineConfig({
  base: "/bf-version-converter/",
  // Vite's dependency cache lives outside the project: on Windows, renaming a fresh folder inside a
  // synced or antivirus-scanned tree fails with EBUSY (seen 2026-10-06 in the Dropbox folder)
  cacheDir: join(tmpdir(), "bf-version-converter-vite"),
  // local builds too: emptying dist/ in the Dropbox folder fails with EPERM. CI (GitHub Actions) builds dist/.
  build: { outDir: process.env.CI ? "dist" : join(tmpdir(), "bf-version-converter-dist"), emptyOutDir: true },
  plugins: [react()],
  worker: { format: "es" },
});
