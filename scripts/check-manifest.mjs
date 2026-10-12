// Fails if the production manifest deviates from CLAUDE.md §6.11 / SECURITY §4.1.
// Run after `pnpm build`. Changing any expectation here requires an ADR.
import { readFileSync } from "node:fs";

const path = process.argv[2] ?? "apps/extension/.output/chrome-mv3/manifest.json";
/** @type {unknown} */
const parsed = JSON.parse(readFileSync(path, "utf8"));
if (typeof parsed !== "object" || parsed === null) throw new Error(`${path} is not a JSON object`);
const manifest = /** @type {Record<string, unknown>} */ (parsed);

const errors = [];
const permissions = JSON.stringify(manifest.permissions);
if (permissions !== JSON.stringify(["storage", "alarms"])) {
  errors.push(`permissions must be exactly ["storage","alarms"], got ${permissions}`);
}
for (const key of [
  "host_permissions",
  "optional_permissions",
  "optional_host_permissions",
  "content_scripts",
  "externally_connectable",
  "web_accessible_resources",
  "content_security_policy",
]) {
  if (key in manifest) errors.push(`manifest must not declare "${key}"`);
}
if (manifest.manifest_version !== 3) errors.push("manifest_version must be 3");

if (errors.length > 0) {
  process.stderr.write(`${path}:\n${errors.map((e) => `  - ${e}`).join("\n")}\n`);
  process.exit(1);
}
process.stdout.write(`${path}: permissions OK (storage, alarms)\n`);
