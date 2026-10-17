// M1 exit check: the shipped extension must not contain axios, eventsource or commander.
// @stellar/stellar-sdk depends on them for its other entry points; core imports only
// `@stellar/stellar-sdk/base`, and this proves none of them leaked into the bundle.
// Run after `pnpm build`.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const OUTPUT = "apps/extension/.output";
const BUILD = path.join(OUTPUT, process.argv[2] ?? "chrome-mv3");
const REPORT = path.join(OUTPUT, "bundle-modules.json");
const FORBIDDEN = ["axios", "feaxios", "eventsource", "commander"];
// Distinctive strings, as a backstop: the SDK inlines its HTTP client into its own files, so
// axios shows up only as strings (verified with a negative control during M1).
const MARKERS = [
  "AxiosError",
  "axios/",
  "commander.unknownOption",
  "EventSource polyfill",
  "eventsource",
];
// ADR 0008: a testnet-only build must not ship the mainnet switch. Its confirmation copy is the
// marker (constant folding drops the screen when STELLIX_MAINNET_ENABLED isn't "true").
if (process.env.STELLIX_MAINNET_ENABLED !== "true") MARKERS.push("I understand this uses real XLM");

const errors = [];

if (!existsSync(REPORT)) {
  errors.push(`${REPORT} missing: build with the bundle-modules-report plugin first`);
} else {
  /** @type {unknown} */
  const parsed = JSON.parse(readFileSync(REPORT, "utf8"));
  const modules = Array.isArray(parsed) ? parsed.map(String) : [];
  if (modules.length === 0) errors.push("bundle module report is empty");
  for (const name of FORBIDDEN) {
    const hits = modules.filter((id) => id.includes(`/node_modules/${name}/`));
    for (const id of hits) errors.push(`forbidden package "${name}" bundled: ${id}`);
  }
  if (!modules.some((id) => id.includes("@stellar/stellar-sdk/lib/esm/base/"))) {
    errors.push("expected @stellar/stellar-sdk/base in the bundle; is the report stale?");
  }
}

/** @param {string} dir @returns {string[]} */
function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}
for (const file of files(BUILD).filter((f) => f.endsWith(".js"))) {
  const text = readFileSync(file, "utf8");
  for (const marker of MARKERS) {
    if (text.includes(marker)) errors.push(`${file} contains "${marker}"`);
  }
}

if (errors.length > 0) {
  process.stderr.write(`Bundle check failed:\n${errors.map((e) => `  - ${e}`).join("\n")}\n`);
  process.exit(1);
}
process.stdout.write(`Bundle check OK: no ${FORBIDDEN.join(", ")} in ${BUILD}\n`);
