import { Keypair, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk/base";
import type { xdr } from "@stellar/stellar-sdk/base";
import { marketFixture, marketTx } from "../__fixtures__/load.js";
import { decodeTransactionEnvelope } from "../decode/envelope.js";
import { OTHER, PEER, USER, buildTx, pay } from "../__tests__/build-tx.js";
import { UNSUPPORTED_OPS, envelopeWith } from "../__tests__/soroban-envelopes.js";
import { TYPED_CONFIRMATION_PHRASE } from "../policy/policy.js";
import type { PolicyDecision, RuleId } from "../types.js";

export interface ClassicCorpusExpectation {
  findingIds: readonly RuleId[];
  decision: PolicyDecision;
}

export interface ClassicCorpusCase {
  id: string;
  description: string;
  xdr: string;
  userAccount: string;
  /** Mode A's Send/review screen has shown these destinations; Mode C presents none. */
  presentedInModeA: readonly string[];
  marketFixture?: string;
  expected: {
    stellix: ClassicCorpusExpectation;
    pasted: ClassicCorpusExpectation;
  };
}

const clickReview: PolicyDecision = { state: "review", requires: "click" };
const typedReview: PolicyDecision = {
  state: "review",
  requires: "typed",
  typedPhrase: TYPED_CONFIRMATION_PHRASE,
};
const blockedBy = (ruleId: RuleId): PolicyDecision => ({
  state: "blocked",
  ruleIds: [ruleId],
  overridable: false,
});

const offer = marketTx(marketFixture("offer-sell-10pct-below"));
const path = marketTx(marketFixture("path-send-near-zero-min"));
const pathDecoded = decodeTransactionEnvelope(path.envelopeXdr, "testnet").decoded;
const pathOperation = pathDecoded.operations[0];
if (pathOperation?.kind !== "pathPaymentStrictSend") {
  throw new Error("path-send-near-zero-min must contain a strict-send path payment");
}

const highFeeInner = TransactionBuilder.fromXdr(
  buildTx([Operation.manageData({ name: "corpus", value: "case" })]),
  Networks.TESTNET,
);
if (!("operations" in highFeeInner) || "innerTransaction" in highFeeInner) {
  throw new Error("high-fee corpus inner envelope must be a transaction");
}
const highFeeXdr = TransactionBuilder.buildFeeBumpTransaction(
  Keypair.fromPublicKey(PEER),
  "1000000",
  highFeeInner,
  Networks.TESTNET,
)
  .toEnvelope()
  .toXdr("base64");

const invokeHostFunction = UNSUPPORTED_OPS.invokeHostFunction;
if (invokeHostFunction === undefined) {
  throw new Error("the unsupported-operation helper is missing invokeHostFunction");
}

const operations = (ops: readonly xdr.Operation[]) => buildTx(ops);
const paymentToPeer = pay(PEER);

export const CLASSIC_CORPUS: readonly ClassicCorpusCase[] = [
  {
    id: "payment-with-signer-add",
    description: "Payments conceal a signer addition to the user's account.",
    xdr: operations([
      paymentToPeer,
      paymentToPeer,
      Operation.setOptions({
        signer: {
          ed25519PublicKey: "GBUBOPHZEGSYI3ORSOOK2UZMIVES7YZXZOFBFRX2ZGBL44DYFOE4RE3S",
          weight: 1,
        },
      }),
    ]),
    userAccount: USER,
    presentedInModeA: [PEER],
    expected: {
      stellix: {
        findingIds: ["ACCT_SIGNER_CHANGE"],
        decision: blockedBy("ACCT_SIGNER_CHANGE"),
      },
      pasted: {
        findingIds: ["ACCT_SIGNER_CHANGE", "UNNAMED_OUTFLOW", "UNNAMED_OUTFLOW"],
        decision: blockedBy("ACCT_SIGNER_CHANGE"),
      },
    },
  },
  {
    id: "user-source-hidden-among-dapp-ops",
    description: "A user-sourced payment is hidden among operations sourced by another account.",
    xdr: buildTx([pay(PEER, OTHER), pay(PEER, USER), pay(OTHER, OTHER)], { source: OTHER }),
    userAccount: USER,
    presentedInModeA: [PEER],
    expected: {
      stellix: {
        findingIds: ["FOREIGN_SOURCE_OP"],
        decision: typedReview,
      },
      pasted: {
        findingIds: ["FOREIGN_SOURCE_OP", "UNNAMED_OUTFLOW"],
        decision: typedReview,
      },
    },
  },
  {
    id: "merge-with-harmless-payment",
    description: "A user account merge follows a payment that looks harmless in isolation.",
    xdr: operations([paymentToPeer, paymentToPeer, Operation.accountMerge({ destination: PEER })]),
    userAccount: USER,
    presentedInModeA: [PEER],
    expected: {
      stellix: {
        findingIds: ["ACCT_MERGE"],
        decision: typedReview,
      },
      pasted: {
        findingIds: ["ACCT_MERGE", "UNNAMED_OUTFLOW", "UNNAMED_OUTFLOW", "UNNAMED_OUTFLOW"],
        decision: blockedBy("ACCT_MERGE"),
      },
    },
  },
  {
    id: "offer-far-below-market",
    description: "A captured testnet offer sells XLM 10% below the best opposing bid.",
    xdr: offer.envelopeXdr,
    userAccount: offer.userAccount,
    presentedInModeA: [],
    marketFixture: "offer-sell-10pct-below",
    expected: {
      stellix: { findingIds: ["OFFER_BAD_PRICE"], decision: clickReview },
      pasted: { findingIds: ["OFFER_BAD_PRICE"], decision: clickReview },
    },
  },
  {
    id: "path-payment-near-zero-minimum",
    description: "A captured testnet path payment permits an almost total loss.",
    xdr: path.envelopeXdr,
    userAccount: path.userAccount,
    presentedInModeA: [pathOperation.destination],
    marketFixture: "path-send-near-zero-min",
    expected: {
      stellix: { findingIds: ["PATH_LOW_MIN"], decision: clickReview },
      pasted: {
        findingIds: ["UNNAMED_OUTFLOW", "PATH_LOW_MIN"],
        decision: typedReview,
      },
    },
  },
  {
    id: "trustline-unverified-issuer",
    description: "A captured testnet trustline's issuer TOML does not list the asset.",
    xdr: marketTx(marketFixture("trust-unlisted")).envelopeXdr,
    userAccount: marketTx(marketFixture("trust-unlisted")).userAccount,
    presentedInModeA: [],
    marketFixture: "trust-unlisted",
    expected: {
      stellix: { findingIds: ["TRUST_UNVERIFIED"], decision: clickReview },
      pasted: { findingIds: ["TRUST_UNVERIFIED"], decision: clickReview },
    },
  },
  {
    id: "trustline-clawback-enabled",
    description: "A captured testnet trustline is issued by an account with clawback enabled.",
    xdr: marketTx(marketFixture("trust-listed-clawback")).envelopeXdr,
    userAccount: marketTx(marketFixture("trust-listed-clawback")).userAccount,
    presentedInModeA: [],
    marketFixture: "trust-listed-clawback",
    expected: {
      stellix: { findingIds: ["TRUST_CLAWBACK"], decision: clickReview },
      pasted: { findingIds: ["TRUST_CLAWBACK"], decision: clickReview },
    },
  },
  {
    id: "transaction-without-max-time",
    description: "A data operation has no transaction upper time bound.",
    xdr: buildTx([Operation.manageData({ name: "corpus", value: "case" })], {
      validForSeconds: null,
    }),
    userAccount: USER,
    presentedInModeA: [],
    expected: {
      stellix: { findingIds: ["NO_MAX_TIME"], decision: clickReview },
      pasted: { findingIds: ["NO_MAX_TIME"], decision: clickReview },
    },
  },
  {
    id: "fee-bump-with-large-max-fee",
    description: "A fee bump allows an external fee payer to be charged above the threshold.",
    xdr: highFeeXdr,
    userAccount: USER,
    presentedInModeA: [],
    expected: {
      stellix: { findingIds: ["HIGH_FEE"], decision: clickReview },
      pasted: { findingIds: ["HIGH_FEE"], decision: clickReview },
    },
  },
  {
    id: "unsupported-operation",
    description: "An unsupported Soroban operation is not silently treated as understood.",
    xdr: envelopeWith(invokeHostFunction()),
    userAccount: USER,
    presentedInModeA: [],
    expected: {
      stellix: { findingIds: ["UNSUPPORTED_OP"], decision: typedReview },
      pasted: { findingIds: ["UNSUPPORTED_OP"], decision: typedReview },
    },
  },
];

export const CORPUS_NOW = Date.parse("2026-10-25T17:00:00Z");
