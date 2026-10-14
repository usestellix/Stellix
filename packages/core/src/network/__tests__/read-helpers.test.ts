import { describe, expect, it } from "vitest";
import { createLogger, type LogLevel } from "../../log.js";
import { MemoryKeyValueStore } from "../../testing/memory-key-value-store.js";
import { FALLBACK_BASE_RESERVE_STROOPS, getBaseReserveStroops } from "../base-reserve.js";
import { fundWithFriendbot } from "../friendbot.js";
import { createHorizonClient } from "../horizon-client.js";
import { normalizeHorizonUrl, validateHorizonOverride } from "../horizon-url.js";
import { fixture, fromFixture, json, scriptedFetch } from "./fixtures.js";

const noSleep = () => Promise.resolve();
const HORIZON = "https://horizon-testnet.stellar.org";
const ADDRESS = (fixture("account-funded").body as { id: string }).id;

async function codeOf(p: Promise<unknown>) {
  return p.then(
    () => undefined,
    (e: unknown) => (e as { code?: string }).code,
  );
}

describe("getBaseReserveStroops (NETWORK.md §7)", () => {
  it("reads the latest ledger once, then serves the per-network cache", async () => {
    const store = new MemoryKeyValueStore();
    const f = scriptedFetch([fromFixture("ledgers-latest")]);
    const horizon = createHorizonClient(HORIZON, f, { sleep: noSleep });
    expect(await getBaseReserveStroops("testnet", horizon, { store, prefix: "ui:" })).toBe(
      5_000_000n,
    );
    expect(await getBaseReserveStroops("testnet", horizon, { store, prefix: "ui:" })).toBe(
      5_000_000n,
    );
    expect(f.calls).toHaveLength(1);
    expect(await store.keys()).toEqual(["ui:baseReserve:testnet"]);
  });

  it("falls back to 0.5 XLM and logs, without caching the fallback", async () => {
    const store = new MemoryKeyValueStore();
    const logged: LogLevel[] = [];
    const log = createLogger({ minLevel: "debug", sink: (level) => logged.push(level) });
    const horizon = createHorizonClient(
      HORIZON,
      scriptedFetch([json(500, {}), json(500, {}), json(500, {}), json(500, {})]),
      { sleep: noSleep },
    );
    expect(await getBaseReserveStroops("testnet", horizon, { store, prefix: "ui:" }, log)).toBe(
      FALLBACK_BASE_RESERVE_STROOPS,
    );
    expect(logged).toEqual(["warn"]);
    expect(await store.keys()).toEqual([]);
  });
});

describe("fundWithFriendbot: outcome decided by refetching the account", () => {
  const horizonWith = (...steps: Parameters<typeof scriptedFetch>[0]) =>
    createHorizonClient(HORIZON, scriptedFetch(steps), { sleep: noSleep });

  it("200 from Friendbot + funded → success", async () => {
    const bot = scriptedFetch([fromFixture("friendbot-success")]);
    await fundWithFriendbot("testnet", ADDRESS, horizonWith(fromFixture("account-funded")), bot);
    expect(bot.calls[0]!.url).toBe(`https://friendbot.stellar.org/?addr=${ADDRESS}`);
  });

  it("400 'already funded' + funded → success", async () => {
    const bot = scriptedFetch([fromFixture("friendbot-already-funded")]);
    await fundWithFriendbot("testnet", ADDRESS, horizonWith(fromFixture("account-funded")), bot);
  });

  it("Friendbot timeout/transport error but the account got funded → success", async () => {
    const bot = scriptedFetch([new DOMException("aborted", "AbortError")]);
    await fundWithFriendbot("testnet", ADDRESS, horizonWith(fromFixture("account-funded")), bot);
  });

  it("Friendbot 5xx and still unfunded → FRIENDBOT_FAILED, never success", async () => {
    const bot = scriptedFetch([json(502, {})]);
    expect(
      await codeOf(
        fundWithFriendbot("testnet", ADDRESS, horizonWith(fromFixture("account-not-found")), bot),
      ),
    ).toBe("FRIENDBOT_FAILED");
  });

  it("Friendbot 200 but Horizon says unfunded → FRIENDBOT_FAILED", async () => {
    const bot = scriptedFetch([fromFixture("friendbot-success")]);
    expect(
      await codeOf(
        fundWithFriendbot("testnet", ADDRESS, horizonWith(fromFixture("account-not-found")), bot),
      ),
    ).toBe("FRIENDBOT_FAILED");
  });

  it("Friendbot timeout AND Horizon down on the refetch → the Horizon error, never success", async () => {
    const bot = scriptedFetch([new DOMException("aborted", "AbortError")]);
    const down = horizonWith(json(503, {}), json(503, {}), json(503, {}), json(503, {}));
    expect(await codeOf(fundWithFriendbot("testnet", ADDRESS, down, bot))).toBe("NETWORK_ERROR");
  });

  it("refuses mainnet and invalid addresses before any request", async () => {
    const bot = scriptedFetch([]);
    expect(await codeOf(fundWithFriendbot("mainnet", ADDRESS, horizonWith(), bot))).toBe(
      "NOT_AVAILABLE_ON_NETWORK",
    );
    expect(await codeOf(fundWithFriendbot("testnet", "GNOPE", horizonWith(), bot))).toBe(
      "INVALID_ADDRESS",
    );
    expect(bot.calls).toHaveLength(0);
  });
});

describe("custom Horizon URL (NETWORK.md §1)", () => {
  const strict = { allowLocalhost: false };

  it.each([
    ["http (non-local)", "http://horizon.example.com"],
    ["localhost without the dev flag", "http://localhost:8000"],
    ["credentials", "https://user:pass@horizon.example.com"],
    ["a query string", "https://horizon.example.com/?x=1"],
    ["not a URL", "horizon dot com"],
    ["javascript:", "javascript:alert(1)"],
  ])("rejects %s", (_name, url) => {
    expect(() => normalizeHorizonUrl(url, strict)).toThrow(
      expect.objectContaining({ code: "INVALID_HORIZON_URL" }),
    );
  });

  it("allows http://localhost only in dev builds, and normalizes trailing slashes", () => {
    expect(normalizeHorizonUrl("http://localhost:8000/", { allowLocalhost: true })).toBe(
      "http://localhost:8000",
    );
    expect(normalizeHorizonUrl("  https://h.example.com/api/  ", strict)).toBe(
      "https://h.example.com/api",
    );
  });

  it("accepts a Horizon whose passphrase matches the network", async () => {
    const f = scriptedFetch([fromFixture("root")]);
    expect(
      await validateHorizonOverride("https://h.example.com/", "testnet", strict, f, {
        sleep: noSleep,
      }),
    ).toBe("https://h.example.com");
  });

  it("rejects a testnet Horizon configured as mainnet", async () => {
    const f = scriptedFetch([fromFixture("root")]);
    expect(
      await codeOf(
        validateHorizonOverride("https://h.example.com", "mainnet", strict, f, { sleep: noSleep }),
      ),
    ).toBe("INVALID_HORIZON_URL");
  });

  it("a non-Horizon server → INVALID_HORIZON_URL; unreachable → NETWORK_ERROR", async () => {
    const page = scriptedFetch([json(200, { hello: "world" })]);
    expect(
      await codeOf(
        validateHorizonOverride("https://example.com", "testnet", strict, page, { sleep: noSleep }),
      ),
    ).toBe("INVALID_HORIZON_URL");
    const down = scriptedFetch([
      new TypeError("x"),
      new TypeError("x"),
      new TypeError("x"),
      new TypeError("x"),
    ]);
    expect(
      await codeOf(
        validateHorizonOverride("https://example.com", "testnet", strict, down, { sleep: noSleep }),
      ),
    ).toBe("NETWORK_ERROR");
  });
});
