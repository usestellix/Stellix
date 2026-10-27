// Runs after `next build` (see the build script). Finishes the static export in out/:
//
// 1. Before Shield launches (no S1 capability shipped), removes the phase 2 pages, so phase 1
//    publishes only the holding page, /privacy and the 404 page. Their HTML, RSC payloads and
//    folders all go: a request for one gets the 404 page with a 404 status.
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { loadStatus } from "./lib/load-status.mjs";

const OUT = path.resolve(import.meta.dirname, "../out");
const { SHIELD_LAUNCHED, PHASE2_PAGES } = await loadStatus();

if (!SHIELD_LAUNCHED) {
  for (const { href } of PHASE2_PAGES) {
    const base = path.join(OUT, href.slice(1));
    for (const p of [`${base}.html`, `${base}.txt`, base]) {
      if (existsSync(p)) rmSync(p, { recursive: true });
    }
  }
  process.stdout.write(
    `postbuild: phase 1, removed ${PHASE2_PAGES.map((p) => p.href).join(", ")}\n`,
  );
} else {
  process.stdout.write("postbuild: phase 2, all pages published\n");
}
