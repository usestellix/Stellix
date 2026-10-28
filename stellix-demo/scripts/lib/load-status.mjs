// Loads src/content/shield-status.ts from a plain Node script. Not every Node build can strip
// TypeScript (Debian's can't), so it's transpiled with the TypeScript compiler the site already
// depends on. shield-status.ts has no imports, which is what makes this possible.
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const FILE = path.resolve(import.meta.dirname, "../../src/content/shield-status.ts");

export async function loadStatus() {
  const { outputText } = ts.transpileModule(readFileSync(FILE, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}
