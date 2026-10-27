// Copy rules, checked against what the site actually renders (out/, after `next build`) and
// against the sources. Run by `pnpm check:copy` and CI. Exits non-zero with every violation.
//
// 1. No guarantee words ("safe", "secure", "protected", ...) in any rendered page.
// 2. "Foundation" only inside "Stellar Development Foundation" (never a name of ours).
// 3. No file downloads: no `download` attribute, no links to .crx / .zip / .xpi files.
// 4. Capability claims come from src/content/shield-status.ts only: no other source file
//    repeats a claim's text.
//
// /privacy renders the extension's PRIVACY.md verbatim, so rule 1 skips it (the policy is
// reviewed in the extension repo); rules 2 and 3 still apply.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { loadStatus } from "./lib/load-status.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "out");
const SRC = path.join(ROOT, "src");

const GUARANTEE_WORDS =
  /\b(safe|safely|safer|safest|safety|secure|secured|securely|protect|protected|protects|protection|guarantee|guaranteed|guarantees)\b/gi;
const VERBATIM_PAGES = new Set(["privacy.html"]);

function walk(dir, ext) {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) return walk(p, ext);
    return ext.some((e) => p.endsWith(e)) ? [p] : [];
  });
}

// Visible text and attribute values people read (alt, title, aria-label, meta content).
function readableText(html) {
  const attrs = [...html.matchAll(/\s(?:alt|title|aria-label|content)="([^"]*)"/g)].map(
    (m) => m[1],
  );
  const body = html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ");
  return `${body} ${attrs.join(" ")}`
    .replace(/&#x27;|&#39;|&rsquo;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

const errors = [];

for (const file of walk(OUT, [".html"])) {
  const rel = path.relative(OUT, file);
  const html = readFileSync(file, "utf8");
  const text = readableText(html);

  if (!VERBATIM_PAGES.has(rel)) {
    for (const m of text.matchAll(GUARANTEE_WORDS)) {
      const at = m.index ?? 0;
      errors.push(
        `${rel}: guarantee word "${m[0]}" in "…${text.slice(Math.max(0, at - 40), at + 40)}…"`,
      );
    }
  }
  for (const m of text.matchAll(/(.{0,20})Foundation/g)) {
    if (!m[1]?.endsWith("Stellar Development ")) {
      errors.push(`${rel}: "Foundation" outside "Stellar Development Foundation": "${m[0]}"`);
    }
  }
  if (/\sdownload(=|\s|>)/.test(html)) errors.push(`${rel}: download attribute`);
  for (const m of html.matchAll(/href="([^"]+\.(?:crx|zip|xpi))"/g)) {
    errors.push(`${rel}: links to a file: ${m[1]}`);
  }
}

const { SHIELD_CAPABILITIES, WALLET_CAPABILITIES } = await loadStatus();
const claims = [...SHIELD_CAPABILITIES, ...WALLET_CAPABILITIES].map((c) => c.claim);
for (const file of walk(SRC, [".ts", ".tsx", ".md"])) {
  if (file.endsWith(path.join("content", "shield-status.ts"))) continue;
  const source = readFileSync(file, "utf8");
  for (const claim of claims) {
    if (source.includes(claim)) {
      errors.push(
        `${path.relative(ROOT, file)}: repeats a capability claim; use <Claim>: "${claim}"`,
      );
    }
  }
}

if (errors.length > 0) {
  for (const e of errors) process.stderr.write(`${e}\n`);
  process.stderr.write(`check-copy: ${errors.length} violation(s)\n`);
  process.exit(1);
}
process.stdout.write("check-copy: copy rules hold\n");
