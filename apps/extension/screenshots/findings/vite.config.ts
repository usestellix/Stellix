import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// The findings screenshot harness (#34). Separate from wxt.config.ts on purpose: this page must
// never be part of the extension, so nothing in the extension build references it.
const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: here,
  base: "./",
  plugins: [tailwindcss()],
  oxc: { jsx: { runtime: "automatic" } },
  build: {
    outDir: path.resolve(here, "../../.output-screenshots/findings"),
    emptyOutDir: true,
  },
});
