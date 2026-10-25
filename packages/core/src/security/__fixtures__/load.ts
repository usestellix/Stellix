/// <reference types="vite/client" />

// Test-only access to the testnet fixtures captured by scripts/capture-shield-fixtures.mjs
// (TESTING §1). `transaction.body` is Horizon's own decoding of the same envelope, so tests can
// check the decoder against an independent source instead of values we made up.

export interface HorizonTransactionBody {
  hash: string;
  source_account: string;
  account_muxed?: string;
  source_account_sequence: string;
  fee_account: string;
  fee_account_muxed?: string;
  max_fee: string;
  operation_count: number;
  memo_type: string;
  memo?: string;
  envelope_xdr: string;
  result_xdr: string;
  fee_meta_xdr: string;
  inner_transaction?: { hash: string; max_fee: string };
}

export interface OpFixture {
  name: string;
  opTypes: string[];
  envelopeType: "envelopeTypeTx" | "envelopeTypeTxFeeBump";
  networkPassphrase: string;
  hash: string;
  envelopeXdr: string;
  transaction: { status: number; body: HorizonTransactionBody };
}

export const FIXTURES: readonly OpFixture[] = Object.values(
  import.meta.glob<OpFixture>(["./ops/*.json", "!**/_index.json"], {
    eager: true,
    import: "default",
  }),
);

export function fixture(name: string): OpFixture {
  const f = FIXTURES.find((x) => x.name === name);
  if (f === undefined) throw new Error(`no fixture ${name}`);
  return f;
}

/**
 * A market fixture (scripts/capture-shield-extra-fixtures.mjs): the Horizon responses a rule's
 * gather step reads, captured just before the user's transaction was submitted.
 */
export interface MarketFixture {
  name: string;
  description: string;
  networkPassphrase: string;
  userAccount: string;
  /** Keyed by what they are (e.g. `orderBook`); `path` is relative to the Horizon root. */
  lookups: Record<string, { path: string; status: number; body: unknown }>;
  hash: string;
  envelopeXdr: string;
  transaction: { status: number; body: HorizonTransactionBody };
}

export const MARKET_FIXTURES: readonly MarketFixture[] = Object.values(
  import.meta.glob<MarketFixture>("./market/*.json", { eager: true, import: "default" }),
);

export function marketFixture(name: string): MarketFixture {
  const f = MARKET_FIXTURES.find((x) => x.name === name);
  if (f === undefined) throw new Error(`no market fixture ${name}`);
  return f;
}

export function lookup(
  f: MarketFixture,
  key: string,
): { path: string; status: number; body: unknown } {
  const l = f.lookups[key];
  if (l === undefined) throw new Error(`${f.name} has no ${key} lookup`);
  return l;
}
