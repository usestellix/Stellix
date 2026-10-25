// Checks that the package the Chrome Web Store serves is our release (docs/VERIFY_RELEASE.md).
//
// The store repackages uploads. Measured on 2026-10-17 against uBlock Origin Lite (store vs its
// GitHub release), it changes exactly two things:
//   - adds `_metadata/` (verified_contents.json: per-file hashes signed by publisher + store);
//   - adds `"update_url": "https://clients2.google.com/service/update2/crx"` to manifest.json.
// So: every other file must be byte-identical, and manifest.json must equal ours as JSON (same
// keys in the same order) once that one key is removed. Nothing may be added or missing.
//
// Usage:
//   node scripts/verify-store-package.mjs <extension-id | store.crx> <release.zip>
// Check the release zip itself against SHA256SUMS / the release notes first (the script prints
// its hash). No dependencies: node:crypto, node:zlib, and scripts/lib/zip.mjs.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { crxToZip, readZip } from "./lib/zip.mjs";

const STORE_UPDATE_URL = "https://clients2.google.com/service/update2/crx";
const [source, releasePath, ...extra] = process.argv.slice(2);
if (source === undefined || releasePath === undefined || extra.length > 0) {
  process.stderr.write(
    "usage: node scripts/verify-store-package.mjs <extension-id | store.crx> <release.zip>\n",
  );
  process.exit(2);
}

const sha256 = (/** @type {Buffer} */ b) => createHash("sha256").update(b).digest("hex");
/** JSON object from bytes; parsing to `unknown` first keeps `any` out (lint). */
const jsonObject = (/** @type {Buffer} */ b) => {
  /** @type {unknown} */
  const value = JSON.parse(b.toString("utf8"));
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("not a JSON object");
  return /** @type {Record<string, unknown>} */ (value);
};

/** @param {string} id */
async function download(id) {
  // The store's public update endpoint, as Chrome itself uses it. prodversion only needs to be
  // a current Chrome major version.
  const url = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=141.0&acceptformat=crx3&x=id%3D${id}%26uc`;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`download failed: HTTP ${String(res.status)} for ${id}`);
  return Buffer.from(await res.arrayBuffer());
}

const storeBytes = /^[a-p]{32}$/.test(source) ? await download(source) : readFileSync(source);
const releaseBytes = readFileSync(releasePath);
process.stdout.write(`release zip sha256: ${sha256(releaseBytes)}\n`);

const store = readZip(crxToZip(storeBytes));
const release = readZip(releaseBytes);
/** @type {string[]} */
const problems = [];

for (const name of store.keys()) {
  if (name.startsWith("_metadata/")) continue;
  if (!release.has(name)) problems.push(`added by the store copy: ${name}`);
}
for (const [name, bytes] of release) {
  const theirs = store.get(name);
  if (theirs === undefined) {
    problems.push(`missing from the store copy: ${name}`);
  } else if (name === "manifest.json") {
    /** @type {Record<string, unknown>} */
    let storeManifest;
    try {
      storeManifest = jsonObject(theirs);
    } catch {
      problems.push("store manifest.json is not valid JSON");
      continue;
    }
    if (storeManifest.update_url !== STORE_UPDATE_URL) {
      problems.push(`manifest.json update_url is ${JSON.stringify(storeManifest.update_url)}`);
    }
    const rest = { ...storeManifest };
    delete rest.update_url;
    const ours = jsonObject(bytes);
    const sameOrder = JSON.stringify(Object.keys(rest)) === JSON.stringify(Object.keys(ours));
    if (!isDeepStrictEqual(rest, ours) || !sameOrder) {
      problems.push("manifest.json differs beyond the store's update_url");
    }
  } else if (!theirs.equals(bytes)) {
    problems.push(`content differs: ${name}`);
  }
}

if (problems.length > 0) {
  process.stderr.write(
    `FAIL: the store package is NOT this release.\n${problems.map((p) => `  - ${p}`).join("\n")}\n`,
  );
  process.exit(1);
}
process.stdout.write(
  `OK: ${String(release.size)} files match the release (store additions: _metadata/, manifest update_url).\n`,
);
