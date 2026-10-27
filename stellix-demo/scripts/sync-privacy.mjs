// Keeps src/content/privacy.md identical to the extension's PRIVACY.md at a given git ref.
//
//   node scripts/sync-privacy.mjs --repo <extension repo> --ref <tag or commit>          copy it
//   node scripts/sync-privacy.mjs --repo <extension repo> --ref <tag or commit> --check  CI: fail if different
//
// The repository is passed in, never assumed, so the site can live anywhere.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    repo: { type: "string" },
    ref: { type: "string" },
    check: { type: "boolean", default: false },
  },
});
if (!values.repo || !values.ref) {
  process.stderr.write(
    "usage: sync-privacy.mjs --repo <extension repo> --ref <git ref> [--check]\n",
  );
  process.exit(2);
}

const TARGET = path.resolve(import.meta.dirname, "../src/content/privacy.md");
const upstream = execFileSync("git", ["-C", values.repo, "show", `${values.ref}:PRIVACY.md`], {
  encoding: "utf8",
});

if (values.check) {
  if (readFileSync(TARGET, "utf8") !== upstream) {
    process.stderr.write(
      `src/content/privacy.md differs from PRIVACY.md at ${values.ref}. Run sync:privacy without --check.\n`,
    );
    process.exit(1);
  }
  process.stdout.write(`privacy.md matches PRIVACY.md at ${values.ref}\n`);
} else {
  writeFileSync(TARGET, upstream);
  process.stdout.write(`privacy.md updated from PRIVACY.md at ${values.ref}\n`);
}
