import { describe, expect, it } from "vitest";
import { PEER, op, sdkJson } from "./helpers.js";

const NO_CHANGES = {
  inflationDest: null,
  clearFlags: null,
  setFlags: null,
  masterWeight: null,
  lowThreshold: null,
  medThreshold: null,
  highThreshold: null,
  homeDomain: null,
  signer: null,
};

describe("setOptions", () => {
  it("decodes inflation dest, master weight, thresholds, home domain and set flags", () => {
    expect(op("setOptions-account-fields")).toEqual({
      kind: "setOptions",
      opType: "setOptions",
      source: null,
      ...NO_CHANGES,
      inflationDest: PEER,
      setFlags: { flags: ["authRevocable"], unknownBits: 0 },
      masterWeight: 10,
      lowThreshold: 1,
      medThreshold: 2,
      highThreshold: 3,
      homeDomain: { text: "example.com", hex: "6578616d706c652e636f6d" },
    });
  });

  it("decodes set flags into names (11 = required, revocable, clawback)", () => {
    expect(op("setOptions-set-flags")).toMatchObject({
      ...NO_CHANGES,
      setFlags: { flags: ["authRequired", "authRevocable", "authClawbackEnabled"], unknownBits: 0 },
    });
  });

  it("decodes clear flags", () => {
    expect(op("setOptions-clear-flags")).toMatchObject({
      ...NO_CHANGES,
      clearFlags: { flags: ["authRevocable"], unknownBits: 0 },
    });
  });

  it.each<[string, string, string]>([
    ["setOptions-signer-ed25519", "ed25519", "G"],
    ["setOptions-signer-pre-auth-tx", "preAuthTx", "T"],
    ["setOptions-signer-sha256-hash", "hashX", "X"],
    ["setOptions-signer-signed-payload", "signedPayload", "P"],
  ])("decodes a %s signer as the SDK encodes it", (name, type, prefix) => {
    const decoded = op(name);
    if (decoded.kind !== "setOptions" || decoded.signer === null) throw new Error("no signer");
    expect(decoded).toMatchObject({ ...NO_CHANGES, signer: { weight: 1 } });
    expect(decoded.signer.key.type).toBe(type);
    expect(decoded.signer.key.key.startsWith(prefix)).toBe(true);
    expect(sdkJson(name)).toMatchObject({
      set_options: { signer: { key: decoded.signer.key.key } },
    });
  });

  it("decodes a signer removal (weight 0)", () => {
    expect(op("setOptions-signer-remove")).toMatchObject({
      signer: {
        key: { type: "ed25519", key: "GBUBOPHZEGSYI3ORSOOK2UZMIVES7YZXZOFBFRX2ZGBL44DYFOE4RE3S" },
        weight: 0,
      },
    });
  });
});

describe("manageData", () => {
  it("decodes a set", () => {
    expect(op("manageData-set")).toEqual({
      kind: "manageData",
      opType: "manageData",
      source: null,
      dataName: { text: "stellix-fixture", hex: "7374656c6c69782d66697874757265" },
      dataValue: { text: "shield", hex: "736869656c64" },
    });
  });

  it("decodes a delete (no value)", () => {
    expect(op("manageData-delete")).toMatchObject({ dataValue: null });
  });
});

describe("bumpSequence", () => {
  it("decodes the target sequence as bigint", () => {
    expect(op("bumpSequence")).toEqual({
      kind: "bumpSequence",
      opType: "bumpSequence",
      source: null,
      bumpTo: 23_110_059_378_606_189n,
    });
  });
});
