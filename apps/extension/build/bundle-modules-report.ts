import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

/**
 * Build-time report of every module bundled into the extension, written to
 * `.output/bundle-modules.json` (outside the shipped chrome-mv3 folder).
 * `scripts/check-bundle.mjs` reads it to prove forbidden packages never ship.
 */
export function bundleModulesReport(outputDir: string): Plugin {
  const file = path.join(outputDir, "bundle-modules.json");
  const modules = new Set<string>();
  rmSync(file, { force: true });
  return {
    name: "stellix:bundle-modules-report",
    apply: "build",
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type === "chunk") {
          for (const id of output.moduleIds) modules.add(id);
        }
      }
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(file, JSON.stringify([...modules].sort(), null, 2));
    },
  };
}
