import { parse } from "smol-toml";
import { z } from "zod";
import type { KeyValueStore } from "../../platform.js";
import type { IssuerToml, RuleUnavailable, TomlFetcher, TomlResult } from "../types.js";

// An issuer's stellar.toml (SEP-1), fetched for TRUST_UNVERIFIED (SHIELD §6.8, invariant 21).
//
// The home domain comes from the issuer's account, so it's attacker-controlled. Only
// https://<home_domain>/.well-known/stellar.toml is ever requested, and only for a public DNS
// name: IP literals, single-label names, localhost and private-use suffixes are refused before
// any request (a name that resolves to a private address can't be detected from here; the
// browser's own protections apply). No redirects, no credentials, 5 s, 100 KB. The document is
// parsed as data, and only CURRENCIES[].code / .issuer strings are read, into new objects.
// Every failure is RuleUnavailable with a reason, never a finding about the issuer.

export const TOML_TIMEOUT_MS = 5_000;
export const TOML_MAX_BYTES = 100 * 1024;
export const TOML_CACHE_TTL_MS = 3_600_000;
const CACHE_PREFIX = "shield:toml:";

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
/** A real TLD: letters, or an IDN in punycode. A numeric last label means an IP-like name. */
const TLD = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;
/** localhost, and suffixes reserved for private networks (RFC 6761, 6762, 8375, ICANN .internal). */
const REFUSED_SUFFIXES = ["localhost", "local", "internal", "home.arpa", "arpa"];

/**
 * The lowercased home domain if it may be fetched, else null. Refuses anything that isn't a
 * multi-label public DNS name: IPv4 and IPv6 literals, single labels, localhost, *.local,
 * *.internal, *.home.arpa (and the rest of .arpa), ports, paths, credentials and trailing dots.
 */
export function fetchableHomeDomain(homeDomain: string): string | null {
  const domain = homeDomain.toLowerCase();
  if (domain.length === 0 || domain.length > 253) return null;
  const labels = domain.split(".");
  if (labels.length < 2 || !labels.every((l) => LABEL.test(l))) return null;
  if (!TLD.test(labels.at(-1) ?? "")) return null;
  if (REFUSED_SUFFIXES.some((s) => domain === s || domain.endsWith(`.${s}`))) return null;
  return domain;
}

export function tomlUrl(domain: string): string {
  return `https://${domain}/.well-known/stellar.toml`;
}

const unavailable = (reason: RuleUnavailable["reason"]): RuleUnavailable => ({
  unavailable: true,
  reason,
});

/** Never spread or returned: only string code/issuer pairs are copied out of it. */
const tomlSchema = z.object({ CURRENCIES: z.array(z.unknown()).optional() });

function currenciesOf(document: unknown): IssuerToml | RuleUnavailable {
  const parsed = tomlSchema.safeParse(document);
  if (!parsed.success) return unavailable("bad_response");
  const currencies: { code: string; issuer: string }[] = [];
  for (const entry of parsed.data.CURRENCIES ?? []) {
    if (typeof entry !== "object" || entry === null) continue;
    const code: unknown = Object.hasOwn(entry, "code") ? Reflect.get(entry, "code") : undefined;
    const issuer: unknown = Object.hasOwn(entry, "issuer")
      ? Reflect.get(entry, "issuer")
      : undefined;
    if (typeof code === "string" && typeof issuer === "string") {
      currencies.push({ code, issuer });
    }
  }
  return { currencies };
}

/** Reads at most `max` bytes; null if the body is larger. */
async function readCapped(res: Response, max: number): Promise<Uint8Array | null> {
  if (res.body === null) {
    const bytes = new Uint8Array(await res.arrayBuffer());
    return bytes.length > max ? null : bytes;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

async function fetchCurrencies(
  fetchFn: typeof fetch,
  url: string,
  timeoutMs: number,
): Promise<TomlResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    // A plain GET without headers or credentials; a redirect fails the request.
    const res = await fetchFn(url, {
      redirect: "error",
      credentials: "omit",
      signal: controller.signal,
    });
    // Belt and braces for platforms that follow redirects regardless (React Native).
    if (
      res.redirected ||
      res.type === "opaqueredirect" ||
      (res.url !== "" && res.url !== url) ||
      (res.status >= 300 && res.status < 400)
    ) {
      return unavailable("bad_response");
    }
    if (res.status === 404) return unavailable("not_found");
    if (res.status >= 500) return unavailable("unreachable");
    if (res.status !== 200) return unavailable("bad_response");
    const declared = Number(res.headers.get("Content-Length") ?? "0");
    if (declared > TOML_MAX_BYTES) return unavailable("bad_response");

    const bytes = await readCapped(res, TOML_MAX_BYTES);
    if (bytes === null) return unavailable("bad_response");
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return unavailable("bad_response");
    }
    let document: unknown;
    try {
      document = parse(text);
    } catch {
      return unavailable("bad_response");
    }
    return currenciesOf(document);
  } catch {
    return unavailable(controller.signal.aborted ? "timeout" : "unreachable");
  } finally {
    clearTimeout(timer);
  }
}

const cachedSchema = z.object({
  fetchedAt: z.number(),
  currencies: z.array(z.object({ code: z.string(), issuer: z.string() })),
});

export interface TomlFetcherDeps {
  fetch: typeof fetch;
  /** Session storage: the cache dies with the browser session. */
  session: KeyValueStore;
  /** Epoch ms. */
  now(): number;
  /** Tests only. */
  timeoutMs?: number;
}

export function createTomlFetcher(deps: TomlFetcherDeps): TomlFetcher {
  return {
    async fetchToml(homeDomain: string): Promise<TomlResult> {
      const domain = fetchableHomeDomain(homeDomain);
      if (domain === null) return unavailable("bad_response");

      const key = `${CACHE_PREFIX}${domain}`;
      const now = deps.now();
      try {
        const cached = cachedSchema.safeParse(await deps.session.get<unknown>(key));
        const age = cached.success ? now - cached.data.fetchedAt : NaN;
        if (cached.success && age >= 0 && age < TOML_CACHE_TTL_MS) {
          return { currencies: cached.data.currencies };
        }
      } catch {
        // An unreadable cache only costs a request.
      }

      const result = await fetchCurrencies(
        deps.fetch,
        tomlUrl(domain),
        deps.timeoutMs ?? TOML_TIMEOUT_MS,
      );
      // Only successes are cached: a failure is retried on the next analysis.
      if (!("unavailable" in result)) {
        try {
          await deps.session.set(key, { fetchedAt: now, currencies: result.currencies });
        } catch {
          // Not cached; still a valid result.
        }
      }
      return result;
    },
  };
}
