// Renders the extension icons (public/icon/<size>.png) from the Stellix mark: the same diamond in
// a rounded square as ui/components/wordmark.tsx, in the neutral ink palette.
// Chrome Web Store image rules (developer.chrome.com/docs/webstore/images):
//   - 128 px store icon: 96 px artwork + 16 px transparent padding per side;
//   - "works on light and dark backgrounds": a mostly dark icon gets a subtle light edge.
// Toolbar sizes (16/32/48) are full bleed. Run after changing the mark; the PNGs are committed.
//
// Usage: pnpm --filter @stellix/extension exec node branding/render-icons.ts
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../public/icon");
const INK = "#111113";

/** The mark on a `size` canvas with `pad` px of transparent padding. */
function svg(size: number, pad: number): string {
  const s = size - 2 * pad; // tile size
  const edge = Math.max(1, s / 64); // light edge for dark backgrounds
  const c = size / 2;
  const d = (s * 4.75) / 20; // diamond half-diagonal, as in the wordmark
  const n = (x: number) => String(Math.round(x * 1000) / 1000);
  const tile = {
    x: n(pad + edge / 2),
    size: n(s - edge),
    r: n((s * 5.5) / 20), // corner radius, as in the wordmark (rx 5.5 on 20)
    edge: n(edge),
  };
  const diamond = `M${n(c)} ${n(c - d)} L${n(c + d)} ${n(c)} L${n(c)} ${n(c + d)} L${n(c - d)} ${n(c)} Z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(size)}" height="${n(size)}" viewBox="0 0 ${n(size)} ${n(size)}">
  <rect x="${tile.x}" y="${tile.x}" width="${tile.size}" height="${tile.size}" rx="${tile.r}" fill="${INK}" stroke="rgb(255 255 255 / 0.28)" stroke-width="${tile.edge}"/>
  <path d="${diamond}" fill="#ffffff"/>
</svg>`;
}

const SIZES: [size: number, pad: number][] = [
  [16, 0],
  [32, 0],
  [48, 0],
  [128, 16],
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [size, pad] of SIZES) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg(size, pad)}</body></html>`,
  );
  await page.screenshot({
    path: path.join(OUT, `${String(size)}.png`),
    omitBackground: true,
    clip: { x: 0, y: 0, width: size, height: size },
  });
  process.stdout.write(`icon/${String(size)}.png\n`);
}
await browser.close();
