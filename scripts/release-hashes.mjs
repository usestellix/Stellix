// SHA256SUMS for a release (SECURITY §9.2, docs/VERIFY_RELEASE.md): the store zip's hash, then
// one line per file inside it, in `sha256sum` format so `sha256sum -c` and `shasum -a 256 -c`
// can check an extracted copy.
//
// Usage: node scripts/release-hashes.mjs <store.zip>
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { readZip } from "./lib/zip.mjs";

const [zipPath, ...rest] = process.argv.slice(2);
if (zipPath === undefined || rest.length > 0) {
  process.stderr.write("usage: node scripts/release-hashes.mjs <store.zip>\n");
  process.exit(2);
}
const sha256 = (/** @type {Buffer} */ b) => createHash("sha256").update(b).digest("hex");
const zip = readFileSync(zipPath);
const lines = [`${sha256(zip)}  ${path.basename(zipPath)}`];
for (const [name, bytes] of [...readZip(zip)].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
  lines.push(`${sha256(bytes)}  ${name}`);
}
process.stdout.write(`${lines.join("\n")}\n`);
