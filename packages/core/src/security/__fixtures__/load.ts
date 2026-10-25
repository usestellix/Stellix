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
