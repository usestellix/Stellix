// Serves out/ locally the way Cloudflare Pages does, to check the real headers (CSP included)
// and run Lighthouse before deploying: pretty URLs (/privacy → privacy.html), 404.html with a
// 404 status, every matching rule from out/_headers applied, and Brotli for text, as Pages
// serves it (Lighthouse measures transfer sizes, so an uncompressed preview would mislead).
//
//   node scripts/preview.mjs [port] [dir]      (default 4300 and out/; 127.0.0.1 only)
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { brotliCompressSync } from "node:zlib";

const PORT = Number(process.argv[2] ?? 4300);
const OUT = path.resolve(process.argv[3] ?? path.join(import.meta.dirname, "../out"));

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

// Parses the generated _headers: a pattern line, then indented "Name: value" lines.
function loadRules() {
  const rules = [];
  for (const line of readFileSync(path.join(OUT, "_headers"), "utf8").split("\n")) {
    if (line.startsWith("#") || line.trim() === "") continue;
    if (!line.startsWith(" ")) rules.push({ pattern: line.trim(), headers: [] });
    else {
      const i = line.indexOf(":");
      rules.at(-1)?.headers.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
    }
  }
  return rules;
}

const matches = (pattern, urlPath) =>
  pattern.endsWith("*") ? urlPath.startsWith(pattern.slice(0, -1)) : pattern === urlPath;

function resolveFile(urlPath) {
  const p = path.join(OUT, decodeURIComponent(urlPath));
  if (!p.startsWith(OUT)) return null;
  for (const candidate of [p, `${p}.html`, path.join(p, "index.html")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

createServer((req, res) => {
  const urlPath = new URL(req.url ?? "/", "http://localhost").pathname;
  const file = resolveFile(urlPath);
  const served = file ?? path.join(OUT, "404.html");
  res.setHeader("Content-Type", TYPES[path.extname(served)] ?? "application/octet-stream");
  for (const rule of loadRules()) {
    if (matches(rule.pattern, urlPath)) for (const [k, v] of rule.headers) res.setHeader(k, v);
  }
  let body = readFileSync(served);
  const type = String(res.getHeader("Content-Type"));
  if (
    /text|javascript|json|xml|svg/.test(type) &&
    /\bbr\b/.test(req.headers["accept-encoding"] ?? "")
  ) {
    body = brotliCompressSync(body);
    res.setHeader("Content-Encoding", "br");
    res.setHeader("Vary", "Accept-Encoding");
  }
  res.writeHead(file ? 200 : 404).end(body);
}).listen(PORT, "127.0.0.1", () => {
  process.stdout.write(`preview: http://127.0.0.1:${PORT}\n`);
});
