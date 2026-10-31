import {
  Account,
  Asset,
  Keypair,
  MuxedAccount,
  Networks,
  Operation,
  TransactionBuilder,
  type xdr,
} from "@stellar/stellar-sdk/base";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StellixError } from "../../errors.js";
import * as derive from "../../keys/derive.js";
import { NETWORKS } from "../../network/config.js";
import { NO_TOML } from "../../security/intel/no-toml.js";
import { SHIELD_INPUT_MAX_CHARS } from "../../security/input.js";
import { FakeHorizonClient } from "../../testing/fake-horizon.js";
import { createFakePlatform, type FakePlatform } from "../../testing/fake-platform.js";
import * as vault from "../../vault/vault.js";
import { analyzePasted, type AnalyzeDeps } from "../analyze.js";
import { importWallet } from "../onboarding.js";
import { lock } from "../session.js";
import { ABANDON, ABANDON_G0, FAST_SCRYPT, PASSWORD, codeOf } from "./helpers.js";

// SHIELD_ANALYZE's service (Mode C, #35). Analyze-only: it must never reach the vault or key
// derivation, store nothing signable, and say whose perspective its report uses.

vi.mock("../../vault/vault.js", async (importOriginal) => {
  const actual = await importOriginal<typeof vault>();
  return { ...actual, openVaultWithKey: vi.fn(actual.openVaultWithKey) };
});
vi.mock("../../keys/derive.js", async (importOriginal) => {
  const actual = await importOriginal<typeof derive>();
  return {
    ...actual,
    mnemonicToSeed: vi.fn(actual.mnemonicToSeed),
    deriveKeypair: vi.fn(actual.deriveKeypair),
  };
});

const OTHER = Keypair.random().publicKey();
const THIRD = Keypair.random().publicKey();

function tx(source: string, op: xdr.Operation, passphrase = Networks.TESTNET): string {
  return new TransactionBuilder(new Account(source, "1"), {
    fee: "100",
    networkPassphrase: passphrase,
  })
    .addOperation(op)
    .setTimeout(180)
    .build()
    .toXdr();
}

/** Adds a signer to `account`: ACCT_SIGNER_CHANGE, a non-overridable block. */
const addSigner = (account: string) =>
  tx(account, Operation.setOptions({ signer: { ed25519PublicKey: OTHER, weight: 1 } }));

async function setup() {
  const p: FakePlatform = createFakePlatform(Date.now());
  await importWallet(p, { mnemonic: ABANDON, password: PASSWORD }, { scryptParams: FAST_SCRYPT });
  const h = new FakeHorizonClient();
  const deps: AnalyzeDeps = {
    horizonFor: () => h,
    toml: NO_TOML,
    enabledNetworks: ["testnet"],
  };
  // The spies are live: onboarding derived keys through them.
  expect(derive.mnemonicToSeed).toHaveBeenCalled();
  vi.mocked(vault.openVaultWithKey).mockClear();
  vi.mocked(derive.mnemonicToSeed).mockClear();
  vi.mocked(derive.deriveKeypair).mockClear();
  return { p, h, deps };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("analyzePasted", () => {
  it("a signer added to the active account: blocked, for that account", async () => {
    const { p, deps } = await setup();
    const result = await analyzePasted(p, deps, {
      input: addSigner(ABANDON_G0),
      network: "testnet",
    });
    expect(result.account).toBe(ABANDON_G0);
    expect(result.spendsFromAccount).toBe(true);
    expect(result.report.decision).toEqual({
      state: "blocked",
      ruleIds: ["ACCT_SIGNER_CHANGE"],
      overridable: false,
    });
    expect(result.report.findings.map((f) => f.ruleId)).toEqual(["ACCT_SIGNER_CHANGE"]);
    expect(result.transaction).toMatchObject({
      envelopeType: "tx",
      source: ABANDON_G0,
      feeStroops: "100",
      feeBump: null,
      memo: { type: "none" },
    });
    expect(result.transaction.operations).toHaveLength(1);
    expect(result.transaction.operations[0]!.length).toBeGreaterThan(0);
  });

  it("never opens the vault, derives keys, or stores anything signable", async () => {
    const { p, deps } = await setup();
    const get = vi.spyOn(p.persistent, "get");
    const sessionSet = vi.spyOn(p.session, "set");
    await analyzePasted(p, deps, { input: addSigner(ABANDON_G0), network: "testnet" });
    expect(get.mock.calls.map(([key]) => key)).not.toContain("vault");
    expect(vault.openVaultWithKey).not.toHaveBeenCalled();
    expect(derive.mnemonicToSeed).not.toHaveBeenCalled();
    expect(derive.deriveKeypair).not.toHaveBeenCalled();
    expect(sessionSet).not.toHaveBeenCalled();
    expect((await p.session.keys()).filter((k) => k.startsWith("preparedTx:"))).toEqual([]);
  });

  it("a transaction that never acts as the active account says so", async () => {
    const { p, deps } = await setup();
    const result = await analyzePasted(p, deps, {
      input: tx(
        OTHER,
        Operation.payment({ destination: THIRD, asset: Asset.native(), amount: "5" }),
      ),
      network: "testnet",
    });
    expect(result.account).toBe(ABANDON_G0);
    expect(result.spendsFromAccount).toBe(false);
    // The same signer change on someone else's account isn't the active account's concern.
    const foreign = await analyzePasted(p, deps, { input: addSigner(OTHER), network: "testnet" });
    expect(foreign.spendsFromAccount).toBe(false);
    expect(foreign.report.findings).toEqual([]);
  });

  it("an op sourced from the active account's muxed address counts as the account", async () => {
    const { p, deps } = await setup();
    const muxed = new MuxedAccount(new Account(ABANDON_G0, "0"), "7").accountId();
    const input = tx(
      OTHER,
      Operation.payment({ source: muxed, destination: THIRD, asset: Asset.native(), amount: "1" }),
    );
    const result = await analyzePasted(p, deps, { input, network: "testnet" });
    expect(result.spendsFromAccount).toBe(true);
    expect(result.report.findings.map((f) => f.ruleId)).toContain("FOREIGN_SOURCE_OP");
  });

  it("a link for another network is refused, naming that network", async () => {
    const { p, deps } = await setup();
    const link = `web+stellar:tx?xdr=${encodeURIComponent(addSigner(ABANDON_G0))}`;
    const err = await analyzePasted(p, deps, { input: link, network: "testnet" }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(StellixError);
    expect(err).toMatchObject({
      code: "SHIELD_INPUT_INVALID",
      details: { linkNetwork: "mainnet" },
    });
  });

  it("a link for the selected network is analyzed", async () => {
    const { p, deps } = await setup();
    const link =
      `web+stellar:tx?xdr=${encodeURIComponent(addSigner(ABANDON_G0))}` +
      `&network_passphrase=${encodeURIComponent(NETWORKS.testnet.passphrase)}`;
    const result = await analyzePasted(p, deps, { input: link, network: "testnet" });
    expect(result.report.decision.state).toBe("blocked");
  });

  it.each([
    ["not base64", "not a transaction", "SHIELD_INPUT_INVALID"],
    ["too large", "A".repeat(SHIELD_INPUT_MAX_CHARS + 1), "SHIELD_INPUT_TOO_LARGE"],
  ])("%s input → %s", async (_label, input, code) => {
    const { p, deps } = await setup();
    expect(await codeOf(analyzePasted(p, deps, { input, network: "testnet" }))).toBe(code);
  });

  it("locked → LOCKED, before any network call", async () => {
    const { p, h, deps } = await setup();
    await lock(p);
    expect(
      await codeOf(analyzePasted(p, deps, { input: addSigner(ABANDON_G0), network: "testnet" })),
    ).toBe("LOCKED");
    expect(h.calls).toEqual([]);
  });

  it("a network this build doesn't offer → INVALID_REQUEST", async () => {
    const { p, deps } = await setup();
    expect(
      await codeOf(analyzePasted(p, deps, { input: addSigner(ABANDON_G0), network: "mainnet" })),
    ).toBe("INVALID_REQUEST");
  });
});
