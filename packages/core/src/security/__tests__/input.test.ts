import {
  Account,
  Asset,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk/base";
import { describe, expect, it } from "vitest";
import type { StellixError } from "../../errors.js";
import { NETWORKS } from "../../network/config.js";
import { SHIELD_INPUT_MAX_CHARS, parseAnalyzeInput } from "../input.js";

// Mode C input (#35): raw XDR or a SEP-7 web+stellar:tx link (SEP-7 v2.1.0).

const source = Keypair.random().publicKey();
const xdr = new TransactionBuilder(new Account(source, "1"), {
  fee: "100",
  networkPassphrase: Networks.TESTNET,
})
  .addOperation(Operation.payment({ destination: source, asset: Asset.native(), amount: "1" }))
  .setTimeout(180)
  .build()
  .toXdr();

/** RFC 3986 percent-encoding, as SEP-7 links carry values. */
const enc = (v: string) => encodeURIComponent(v);
const link = (params: string) => `web+stellar:tx?${params}`;

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
    return undefined;
  } catch (err) {
    return (err as StellixError).code;
  }
}

describe("parseAnalyzeInput: raw XDR", () => {
  it("returns the XDR with no network", () => {
    expect(parseAnalyzeInput(xdr)).toEqual({ xdr, network: null });
  });

  it("strips surrounding and wrapped whitespace", () => {
    const wrapped = `  ${xdr.slice(0, 40)}\n${xdr.slice(40, 80)}\r\n\t${xdr.slice(80)}\n`;
    expect(parseAnalyzeInput(wrapped).xdr).toBe(xdr);
  });

  it("empty input is invalid", () => {
    expect(codeOf(() => parseAnalyzeInput("  \n "))).toBe("SHIELD_INPUT_INVALID");
  });
});

describe("parseAnalyzeInput: size limit", () => {
  it("accepts exactly the limit and refuses one more character", () => {
    expect(codeOf(() => parseAnalyzeInput("A".repeat(SHIELD_INPUT_MAX_CHARS)))).toBeUndefined();
    expect(codeOf(() => parseAnalyzeInput("A".repeat(SHIELD_INPUT_MAX_CHARS + 1)))).toBe(
      "SHIELD_INPUT_TOO_LARGE",
    );
  });

  it("the limit applies before parsing, to links too", () => {
    const big = link(`xdr=${"A".repeat(SHIELD_INPUT_MAX_CHARS)}`);
    expect(codeOf(() => parseAnalyzeInput(big))).toBe("SHIELD_INPUT_TOO_LARGE");
  });

  it("covers the largest classic transaction as base64 (100 KiB, stellar-core Peer.h)", () => {
    expect(Math.ceil((100 * 1024) / 3) * 4).toBeLessThanOrEqual(SHIELD_INPUT_MAX_CHARS);
  });
});

describe("parseAnalyzeInput: web+stellar:tx links", () => {
  it("decodes xdr and names testnet from network_passphrase", () => {
    const parsed = parseAnalyzeInput(
      link(`xdr=${enc(xdr)}&network_passphrase=${enc(NETWORKS.testnet.passphrase)}`),
    );
    expect(parsed).toEqual({ xdr, network: "testnet" });
  });

  it("without network_passphrase the link is for mainnet (SEP-7)", () => {
    expect(parseAnalyzeInput(link(`xdr=${enc(xdr)}`))).toEqual({ xdr, network: "mainnet" });
  });

  it("the scheme is case-insensitive; surrounding whitespace is ignored", () => {
    expect(parseAnalyzeInput(`  WEB+STELLAR:tx?xdr=${enc(xdr)}\n`).xdr).toBe(xdr);
  });

  it("a literal + in xdr stays a +, as base64 needs", () => {
    expect(parseAnalyzeInput(link("xdr=AB+C/D==")).xdr).toBe("AB+C/D==");
  });

  it("ignores msg, origin_domain, signature, callback, pubkey and chain", () => {
    const parsed = parseAnalyzeInput(
      link(
        [
          `xdr=${enc(xdr)}`,
          `msg=${enc("Stellix says this is fine")}`,
          "origin_domain=example.com",
          `callback=${enc("url:https://example.com/cb")}`,
          `pubkey=${source}`,
          "chain=x",
          "signature=abc",
        ].join("&"),
      ),
    );
    expect(parsed).toEqual({ xdr, network: "mainnet" });
  });

  it.each([
    ["a pay link", `web+stellar:pay?destination=${source}`],
    ["another operation", `web+stellar:txx?xdr=${enc(xdr)}`],
    ["no xdr", link("network_passphrase=x")],
    ["an empty xdr", link("xdr=")],
    ["no query", "web+stellar:tx"],
    ["replace", link(`xdr=${enc(xdr)}&replace=${enc("sourceAccount:X;X:account")}`)],
    ["an unknown network", link(`xdr=${enc(xdr)}&network_passphrase=${enc("Other ; 2015")}`)],
    ["a repeated parameter", link(`xdr=${enc(xdr)}&xdr=${enc(xdr)}`)],
    ["a malformed escape", link("xdr=%E0%A4%A")],
  ])("refuses %s: SHIELD_INPUT_INVALID", (_label, input) => {
    expect(codeOf(() => parseAnalyzeInput(input))).toBe("SHIELD_INPUT_INVALID");
  });
});
