// Offline Shield corpus metrics for CI (SHIELD §10.3). The runner consumes captured testnet data
// and makes no network requests; results are printed locally and no telemetry is sent.
//
// Usage: node scripts/shield-metrics.mjs
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

/**
 * @typedef {{
 *   createServer(options: {
 *     root: string;
 *     configFile: false;
 *     server: { middlewareMode: true };
 *     appType: "custom";
 *     logLevel: "silent";
 *   }): Promise<unknown>;
 * }} ViteRuntime
 * @typedef {{
 *   ssrLoadModule(path: string): Promise<unknown>;
 *   close(): Promise<void>;
 * }} ViteServer
 * @typedef {{
 *   runShieldMetrics(options: { now(): number; write(text: string): void }): Promise<void>;
 * }} MetricsModule
 */

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === "object" && value !== null;
}

/** @param {unknown} value @returns {value is ViteRuntime} */
function isViteRuntime(value) {
  return isRecord(value) && typeof value.createServer === "function";
}

/** @param {unknown} value @returns {value is ViteServer} */
function isViteServer(value) {
  return (
    isRecord(value) &&
    typeof value.ssrLoadModule === "function" &&
    typeof value.close === "function"
  );
}

/** @param {unknown} value @returns {value is MetricsModule} */
function isMetricsModule(value) {
  return isRecord(value) && typeof value.runShieldMetrics === "function";
}

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const coreRoot = resolve(root, "packages/core");
const require = createRequire(resolve(coreRoot, "package.json"));
const viteValue = /** @type {unknown} */ (require("vite"));
if (!isViteRuntime(viteValue)) throw new Error("could not load Vite's server API");
const serverValue = await viteValue.createServer({
  root: coreRoot,
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});
if (!isViteServer(serverValue)) throw new Error("Vite did not create an SSR server");

try {
  const metricsValue = await serverValue.ssrLoadModule("/src/security/__metrics__/runner.ts");
  if (!isMetricsModule(metricsValue)) throw new Error("Shield metrics runner could not be loaded");
  await metricsValue.runShieldMetrics({
    now: () => performance.now(),
    write: (text) => process.stdout.write(text),
  });
} finally {
  await serverValue.close();
}
