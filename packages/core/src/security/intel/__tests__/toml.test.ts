import { describe, expect, it } from "vitest";
import { MemoryKeyValueStore } from "../../../testing/memory-key-value-store.js";
import { lookup, marketFixture } from "../../__fixtures__/load.js";
import {
  TOML_CACHE_TTL_MS,
  TOML_MAX_BYTES,
  createTomlFetcher,
  fetchableHomeDomain,
  tomlUrl,
} from "../toml.js";

// SHIELD §6.8. Real stellar.toml bodies are the captured ones (scripts/capture-shield-extra-
// fixtures.mjs trust); the adversarial ones below are inputs a hostile issuer could serve.

const NYALA = "4344.staging.register.nyala.de";
const SRT_ISSUER = "GCXWSVROJKVC7R5QODVRA3C4MLN4USLBQKK5H4GLJQ7KS7KTBREZQ7NN";

type Step = Response | Error | ((init: RequestInit | undefined) => Promise<Response>);

function scripted(steps: Step[]) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetchFn = ((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: input instanceof Request ? input.url : input.toString(), init });
    const step = steps.shift();
    if (step === undefined) return Promise.reject(new Error("no more scripted responses"));
    if (step instanceof Error) return Promise.reject(step);
    if (typeof step === "function") return step(init);
    return Promise.resolve(step);
  }) as typeof fetch;
  return { fetchFn, calls };
}

function text(body: string | Uint8Array<ArrayBuffer>, init: ResponseInit = {}): Response {
  return new Response(body, { status: 200, headers: { "Content-Type": "text/plain" }, ...init });
}

function setup(steps: Step[], opts: { now?: () => number; timeoutMs?: number } = {}) {
  const { fetchFn, calls } = scripted(steps);
  const session = new MemoryKeyValueStore();
  const fetcher = createTomlFetcher({
    fetch: fetchFn,
    session,
    now: opts.now ?? (() => 1_000_000),
    ...(opts.timeoutMs === undefined ? {} : { timeoutMs: opts.timeoutMs }),
  });
  return { fetcher, calls, session };
}

const captured = (name: string) => lookup(marketFixture(name), "toml");

describe("fetchableHomeDomain", () => {
  it.each(["example.com", NYALA, "WWW.Example.COM", "xn--bcher-kva.example", "a-b.co"])(
    "accepts %s",
    (domain) => {
      expect(fetchableHomeDomain(domain)).toBe(domain.toLowerCase());
    },
  );

  it.each([
    ["IPv4 literal", "127.0.0.1"],
    ["private IPv4", "10.0.0.1"],
    ["short IPv4", "127.1"],
    ["hex IPv4", "0x7f.0x1"],
    ["decimal IPv4", "2130706433"],
    ["IPv6 literal", "::1"],
    ["bracketed IPv6", "[::1]"],
    ["link-local IPv6", "fe80::1"],
    ["IPv4-mapped IPv6", "[::ffff:127.0.0.1]"],
    ["single label", "intranet"],
    ["localhost", "localhost"],
    ["localhost subdomain", "app.localhost"],
    [".local (mDNS)", "printer.local"],
    [".internal", "db.internal"],
    [".home.arpa", "router.home.arpa"],
    ["reverse DNS", "1.0.0.127.in-addr.arpa"],
    ["trailing dot", "example.com."],
    ["port", "example.com:8443"],
    ["credentials", "user@example.com"],
    ["path", "example.com/x"],
    ["scheme", "http://example.com"],
    ["space", "exa mple.com"],
    ["leading hyphen", "-bad.com"],
    ["unicode (not punycode)", "例え.jp"],
    ["empty", ""],
    ["too long", `${"a".repeat(60)}.`.repeat(5) + "com"],
  ])("refuses %s (%s)", (_kind, domain) => {
    expect(fetchableHomeDomain(domain)).toBeNull();
  });

  it.each([
    "127.0.0.1",
    "[::1]",
    "intranet",
    "localhost",
    "printer.local",
    "db.internal",
    "router.home.arpa",
  ])("fetchToml(%s) → bad_response without any request", async (domain) => {
    const { fetcher, calls } = setup([]);
    expect(await fetcher.fetchToml(domain)).toEqual({ unavailable: true, reason: "bad_response" });
    expect(calls).toEqual([]);
  });
});

describe("createTomlFetcher", () => {
  it("fetches only https://<domain>/.well-known/stellar.toml, no redirects, no credentials", async () => {
    const t = captured("trust-listed-clawback");
    const { fetcher, calls } = setup([text(t.text ?? "")]);
    const result = await fetcher.fetchToml(NYALA);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(t.path);
    expect(calls[0]!.url).toBe(tomlUrl(NYALA));
    expect(calls[0]!.url.startsWith("https://")).toBe(true);
    expect(calls[0]!.init).toMatchObject({ redirect: "error", credentials: "omit" });
    expect(calls[0]!.init?.headers).toBeUndefined();
    expect(result).toEqual({
      currencies: [{ code: "SRT", issuer: SRT_ISSUER }],
    });
  });

  it("never requests http, even for a domain written with a scheme", async () => {
    const { fetcher, calls } = setup([]);
    expect(await fetcher.fetchToml("http://example.com")).toEqual({
      unavailable: true,
      reason: "bad_response",
    });
    expect(calls).toEqual([]);
  });

  it("a captured parked domain serving HTML → bad_response (malformed toml)", async () => {
    const t = captured("trust-parked-domain");
    expect(t.headers?.["content-type"]).toBe("text/html");
    const { fetcher } = setup([text(t.text ?? "", { headers: { "Content-Type": "text/html" } })]);
    expect(await fetcher.fetchToml("wetheunion.com")).toEqual({
      unavailable: true,
      reason: "bad_response",
    });
  });

  it.each([
    ["unterminated array", "[[CURRENCIES]]\ncode = [\n"],
    ["duplicate key", 'VERSION = "1"\nVERSION = "2"\n'],
    ["CURRENCIES is a table, not an array", '[CURRENCIES]\ncode = "SRT"\n'],
  ])("malformed toml (%s) → bad_response", async (_kind, body) => {
    const { fetcher } = setup([text(body)]);
    expect(await fetcher.fetchToml("example.com")).toEqual({
      unavailable: true,
      reason: "bad_response",
    });
  });

  it("invalid UTF-8 → bad_response", async () => {
    const { fetcher } = setup([text(new Uint8Array([0x43, 0x55, 0xff, 0xfe]))]);
    expect(await fetcher.fetchToml("example.com")).toEqual({
      unavailable: true,
      reason: "bad_response",
    });
  });

  it("a toml without CURRENCIES lists nothing", async () => {
    const { fetcher } = setup([text('VERSION = "2.0.0"\n')]);
    expect(await fetcher.fetchToml("example.com")).toEqual({ currencies: [] });
  });

  it("keeps only entries with string code and issuer", async () => {
    const body = [
      "[[CURRENCIES]]",
      'code = "OK"',
      `issuer = "${SRT_ISSUER}"`,
      "[[CURRENCIES]]",
      "code = 42",
      `issuer = "${SRT_ISSUER}"`,
      "[[CURRENCIES]]",
      'code_template = "CORN????"',
      `issuer = "${SRT_ISSUER}"`,
    ].join("\n");
    const { fetcher } = setup([text(body)]);
    expect(await fetcher.fetchToml("example.com")).toEqual({
      currencies: [{ code: "OK", issuer: SRT_ISSUER }],
    });
  });

  it("prototype-pollution keys are inert: only code/issuer are copied into plain objects", async () => {
    const body = [
      "[__proto__]",
      "polluted = true",
      "[constructor.prototype]",
      "polluted = true",
      "[[CURRENCIES]]",
      'code = "SRT"',
      `issuer = "${SRT_ISSUER}"`,
      "__proto__ = { polluted = true }",
      "constructor = { prototype = { polluted = true } }",
      "[[CURRENCIES]]",
      '"__proto__" = { code = "EVIL", issuer = "GEVIL" }',
    ].join("\n");
    const { fetcher } = setup([text(body)]);
    const result = await fetcher.fetchToml("example.com");
    expect(result).toEqual({ currencies: [{ code: "SRT", issuer: SRT_ISSUER }] });
    if ("unavailable" in result) throw new Error("expected a result");
    const [entry] = result.currencies;
    expect(Object.keys(entry!)).toEqual(["code", "issuer"]);
    expect(Object.getPrototypeOf(entry)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty("polluted");
  });

  it("a body over 100 KB → bad_response; exactly 100 KB is read", async () => {
    const comment = (n: number) => `#${"x".repeat(n - 2)}\n`;
    const over = setup([text(comment(TOML_MAX_BYTES + 1))]);
    expect(await over.fetcher.fetchToml("example.com")).toEqual({
      unavailable: true,
      reason: "bad_response",
    });
    const at = setup([text(comment(TOML_MAX_BYTES))]);
    expect(await at.fetcher.fetchToml("example.com")).toEqual({ currencies: [] });
  });

  it("a declared Content-Length over 100 KB → bad_response", async () => {
    const { fetcher } = setup([
      text("", { headers: { "Content-Length": String(TOML_MAX_BYTES + 1) } }),
    ]);
    expect(await fetcher.fetchToml("example.com")).toEqual({
      unavailable: true,
      reason: "bad_response",
    });
  });

  it("no response within the timeout → timeout", async () => {
    const hang = (init: RequestInit | undefined) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    const { fetcher } = setup([hang], { timeoutMs: 10 });
    expect(await fetcher.fetchToml("example.com")).toEqual({
      unavailable: true,
      reason: "timeout",
    });
  });

  it("a redirect fails the fetch (redirect: error) → unreachable", async () => {
    // What a browser does for redirect: "error" when the server answers 3xx.
    const { fetcher } = setup([new TypeError("Failed to fetch")]);
    expect(await fetcher.fetchToml("example.com")).toEqual({
      unavailable: true,
      reason: "unreachable",
    });
  });

  it("a platform that followed a redirect anyway → bad_response", async () => {
    const followed = text('VERSION = "2.0.0"\n');
    Object.defineProperty(followed, "redirected", { value: true });
    Object.defineProperty(followed, "url", { value: "https://evil.example/stellar.toml" });
    const { fetcher } = setup([followed]);
    expect(await fetcher.fetchToml("example.com")).toEqual({
      unavailable: true,
      reason: "bad_response",
    });
  });

  it("a 3xx returned as a response → bad_response", async () => {
    const { fetcher } = setup([
      new Response(null, { status: 301, headers: { Location: "http://127.0.0.1/" } }),
    ]);
    expect(await fetcher.fetchToml("example.com")).toEqual({
      unavailable: true,
      reason: "bad_response",
    });
  });

  it.each([
    [404, "not_found"],
    [500, "unreachable"],
    [503, "unreachable"],
    [403, "bad_response"],
  ] as const)("HTTP %i → %s", async (status, reason) => {
    const { fetcher } = setup([new Response("", { status })]);
    expect(await fetcher.fetchToml("example.com")).toEqual({ unavailable: true, reason });
  });

  it("caches a success per domain for 1 h, in session storage", async () => {
    let now = 1_000_000;
    const body = text(`[[CURRENCIES]]\ncode = "SRT"\nissuer = "${SRT_ISSUER}"\n`);
    const body2 = text("");
    const { fetcher, calls, session } = setup([body, body2], { now: () => now });
    const first = await fetcher.fetchToml("Example.com");
    expect(await session.keys()).toEqual(["shield:toml:example.com"]);
    now += TOML_CACHE_TTL_MS - 1;
    expect(await fetcher.fetchToml("example.com")).toEqual(first);
    expect(calls).toHaveLength(1);
    now += 1;
    expect(await fetcher.fetchToml("example.com")).toEqual({ currencies: [] });
    expect(calls).toHaveLength(2);
  });

  it("never caches a failure", async () => {
    const { fetcher, calls, session } = setup([
      new Response("", { status: 500 }),
      text('VERSION = "2.0.0"\n'),
    ]);
    expect(await fetcher.fetchToml("example.com")).toMatchObject({ unavailable: true });
    expect(await session.keys()).toEqual([]);
    expect(await fetcher.fetchToml("example.com")).toEqual({ currencies: [] });
    expect(calls).toHaveLength(2);
  });

  it("ignores a malformed cache entry and refetches", async () => {
    const { fetcher, calls, session } = setup([text('VERSION = "2.0.0"\n')]);
    await session.set("shield:toml:example.com", { fetchedAt: 1_000_000, currencies: "nope" });
    expect(await fetcher.fetchToml("example.com")).toEqual({ currencies: [] });
    expect(calls).toHaveLength(1);
  });
});
