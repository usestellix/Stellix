import { INT64_MAX } from "../../stellar/amount.js";
import type { DecodedOperation } from "../decode/operation-types.js";
import type { OpSource } from "../decode/sources.js";
import { formatAssetWithIssuer, formatStroops } from "../rules/format.js";
import { fillTemplate } from "./index.js";
import { describeClaimant } from "./predicate.js";
import {
  accountFlagsText,
  assetCode,
  accountText,
  amountText,
  entryText,
  priceText,
  quotedText,
  signerText,
  trustlineFlagsText,
} from "./values.js";

// One plain-language description per decoded operation (SHIELD §9 S1 exit, #35), for the
// Analyze screen and the Send review. Each sentence is a template filled from values built from
// the decoded data (bigint amounts, full addresses), never re-parsed from text. It says what
// the operation does and whose account it acts on; never whether that's safe (§1). Request text
// (data names, home domains) is quoted as data.

/** A sentence and the values for its `{placeholders}`. */
export interface OperationSentence {
  template: string;
  values: Readonly<Record<string, string>>;
}

type Describer<K extends DecodedOperation["kind"]> = (
  op: Extract<DecodedOperation, { kind: K }>,
  account: string,
) => OperationSentence[];

const s = (template: string, values: Record<string, string>): OperationSentence => ({
  template,
  values,
});

const via = (path: readonly { type: string }[], label: (i: number) => string) =>
  path.length === 0 ? "" : `, via ${path.map((_, i) => label(i)).join(", ")}`;

/** Offers: create (id 0), delete (amount 0) or update. */
function offerVerb(offerId: bigint, amount: bigint): "create" | "delete" | "update" {
  if (offerId === 0n) return "create";
  return amount === 0n ? "delete" : "update";
}

/**
 * Every DecodedOperation kind, mapped: a kind added to the union without a describer here is a
 * compile error (and the test's sample table fails the same way).
 */
export const DESCRIBERS: { [K in DecodedOperation["kind"]]: Describer<K> } = {
  createAccount: (op, account) => [
    s("Creates the account {destination} and funds it with {amount} from {account}.", {
      destination: op.destination,
      amount: amountText(op.startingBalanceStroops, { type: "native" }),
      account,
    }),
  ],
  payment: (op, account) => [
    s("Sends {amount} from {account} to {destination}.", {
      amount: amountText(op.amountStroops, op.asset),
      account,
      destination: op.destination,
    }),
  ],
  pathPaymentStrictSend: (op, account) => [
    s(
      "Sends {amount} from {account} to {destination}, converted to {destAsset}; {destination} " +
        "receives at least {destMin}{via}.",
      {
        amount: amountText(op.sendAmountStroops, op.sendAsset),
        account,
        destination: op.destination,
        destAsset: formatAssetWithIssuer(op.destAsset),
        destMin: amountText(op.destMinStroops, op.destAsset),
        via: via(op.path, (i) => formatAssetWithIssuer(op.path[i] ?? { type: "native" })),
      },
    ),
  ],
  pathPaymentStrictReceive: (op, account) => [
    s(
      "Sends up to {sendMax} from {account} so that {destination} receives exactly " +
        "{destAmount}{via}.",
      {
        sendMax: amountText(op.sendMaxStroops, op.sendAsset),
        account,
        destination: op.destination,
        destAmount: amountText(op.destAmountStroops, op.destAsset),
        via: via(op.path, (i) => formatAssetWithIssuer(op.path[i] ?? { type: "native" })),
      },
    ),
  ],
  accountMerge: (op, account) => [
    s("Closes {account} and sends its whole XLM balance to {destination}.", {
      account,
      destination: op.destination,
    }),
  ],
  manageSellOffer: (op, account) => {
    const values = {
      account,
      offerId: op.offerId.toString(),
      amount: amountText(op.amountStroops, op.selling),
      buying: formatAssetWithIssuer(op.buying),
      price: `${priceText(op.price)} ${assetCode(op.buying)} per ${assetCode(op.selling)}`,
    };
    switch (offerVerb(op.offerId, op.amountStroops)) {
      case "create":
        return [s("Offers to sell {amount} from {account} for {buying}, at {price}.", values)];
      case "delete":
        return [s("Cancels offer {offerId} of {account}.", values)];
      case "update":
        return [
          s(
            "Changes offer {offerId} of {account} to sell {amount} for {buying}, at {price}.",
            values,
          ),
        ];
    }
  },
  manageBuyOffer: (op, account) => {
    const values = {
      account,
      offerId: op.offerId.toString(),
      amount: amountText(op.buyAmountStroops, op.buying),
      selling: formatAssetWithIssuer(op.selling),
      price: `${priceText(op.price)} ${assetCode(op.selling)} per ${assetCode(op.buying)}`,
    };
    switch (offerVerb(op.offerId, op.buyAmountStroops)) {
      case "create":
        return [s("Offers to buy {amount} with {selling} from {account}, at {price}.", values)];
      case "delete":
        return [s("Cancels offer {offerId} of {account}.", values)];
      case "update":
        return [
          s(
            "Changes offer {offerId} of {account} to buy {amount} with {selling}, at {price}.",
            values,
          ),
        ];
    }
  },
  createPassiveSellOffer: (op, account) => [
    s("Places a passive offer to sell {amount} from {account} for {buying}, at {price}.", {
      amount: amountText(op.amountStroops, op.selling),
      account,
      buying: formatAssetWithIssuer(op.buying),
      price: `${priceText(op.price)} ${assetCode(op.buying)} per ${assetCode(op.selling)}`,
    }),
  ],
  liquidityPoolDeposit: (op, account) => [
    s(
      "Deposits from {account} into liquidity pool {pool}: up to {maxA} of its first asset and " +
        "{maxB} of its second, at a price (first per second) between {minPrice} and {maxPrice}.",
      {
        account,
        pool: op.liquidityPoolId,
        maxA: formatStroops(op.maxAmountAStroops),
        maxB: formatStroops(op.maxAmountBStroops),
        minPrice: priceText(op.minPrice),
        maxPrice: priceText(op.maxPrice),
      },
    ),
  ],
  liquidityPoolWithdraw: (op, account) => [
    s(
      "Withdraws {shares} pool shares of liquidity pool {pool} to {account}, for at least {minA} " +
        "of its first asset and {minB} of its second.",
      {
        shares: formatStroops(op.amountStroops),
        pool: op.liquidityPoolId,
        account,
        minA: formatStroops(op.minAmountAStroops),
        minB: formatStroops(op.minAmountBStroops),
      },
    ),
  ],
  setOptions: (op, account) => {
    const out: OperationSentence[] = [];
    if (op.signer !== null) {
      const signer = signerText(op.signer.key);
      out.push(
        op.signer.weight === 0
          ? s("Removes the signer {signer} from {account}.", { signer, account })
          : s(
              "Gives the signer {signer} a weight of {weight} on {account}, adding it if it's new.",
              {
                signer,
                account,
                weight: String(op.signer.weight),
              },
            ),
      );
    }
    if (op.masterWeight !== null) {
      out.push(
        s("Sets the weight of the master key of {account} to {weight}.", {
          account,
          weight: String(op.masterWeight),
        }),
      );
    }
    for (const [name, value] of [
      ["low", op.lowThreshold],
      ["medium", op.medThreshold],
      ["high", op.highThreshold],
    ] as const) {
      if (value !== null) {
        out.push(
          s("Sets the {name} threshold of {account} to {value}.", {
            name,
            account,
            value: String(value),
          }),
        );
      }
    }
    if (op.setFlags !== null) {
      out.push(
        s("Turns on {flags} on {account}.", { flags: accountFlagsText(op.setFlags), account }),
      );
    }
    if (op.clearFlags !== null) {
      out.push(
        s("Turns off {flags} on {account}.", { flags: accountFlagsText(op.clearFlags), account }),
      );
    }
    if (op.homeDomain !== null) {
      out.push(
        op.homeDomain.hex === ""
          ? s("Removes the home domain of {account}.", { account })
          : s("Sets the home domain of {account} to {domain}.", {
              account,
              domain: quotedText(op.homeDomain),
            }),
      );
    }
    if (op.inflationDest !== null) {
      out.push(
        s("Sets the inflation destination of {account} to {destination}.", {
          account,
          destination: op.inflationDest,
        }),
      );
    }
    return out.length > 0 ? out : [s("Changes no settings of {account}.", { account })];
  },
  manageData: (op, account) => [
    op.dataValue === null
      ? s("Deletes the data entry {name} from {account}.", {
          name: quotedText(op.dataName),
          account,
        })
      : s("Sets the data entry {name} on {account} to {value}.", {
          name: quotedText(op.dataName),
          account,
          value: quotedText(op.dataValue),
        }),
  ],
  bumpSequence: (op, account) => [
    s("Moves the sequence number of {account} forward to {bumpTo}.", {
      account,
      bumpTo: op.bumpTo.toString(),
    }),
  ],
  changeTrust: (op, account) => {
    const line =
      op.line.type === "poolShare"
        ? `shares of liquidity pool ${op.line.liquidityPoolId}, which pairs ${formatAssetWithIssuer(op.line.assetA)} with ${formatAssetWithIssuer(op.line.assetB)}`
        : formatAssetWithIssuer(op.line);
    if (op.limitStroops === 0n) {
      return [s("Removes the trustline of {account} to {line}.", { account, line })];
    }
    return [
      op.limitStroops === INT64_MAX
        ? s("Lets {account} hold {line}, with no limit.", { account, line })
        : s("Lets {account} hold up to {limit} of {line}.", {
            account,
            limit: formatStroops(op.limitStroops),
            line,
          }),
    ];
  },
  allowTrust: (op, account) => [
    s("As issuer of {code}, {account} sets the trustline of {trustor} to: {flags}.", {
      code: op.assetCode,
      account,
      trustor: op.trustor,
      flags:
        op.authorize.flags.length === 0 && op.authorize.unknownBits === 0
          ? "not authorized"
          : trustlineFlagsText(op.authorize),
    }),
  ],
  setTrustLineFlags: (op, account) => {
    const changes = [
      op.setFlags.flags.length + op.setFlags.unknownBits > 0
        ? `turns on ${trustlineFlagsText(op.setFlags)}`
        : null,
      op.clearFlags.flags.length + op.clearFlags.unknownBits > 0
        ? `turns off ${trustlineFlagsText(op.clearFlags)}`
        : null,
    ].filter((c) => c !== null);
    return [
      s("As issuer, {account} changes the {asset} trustline of {trustor}: {changes}.", {
        account,
        asset: formatAssetWithIssuer(op.asset),
        trustor: op.trustor,
        changes: changes.length === 0 ? "no flags change" : changes.join("; "),
      }),
    ];
  },
  clawback: (op, account) => [
    s("As issuer, {account} takes back {amount} from {from}.", {
      account,
      amount: amountText(op.amountStroops, op.asset),
      from: op.from,
    }),
  ],
  clawbackClaimableBalance: (op, account) => [
    s("As issuer, {account} takes back the claimable balance {balanceId}.", {
      account,
      balanceId: op.balanceId,
    }),
  ],
  createClaimableBalance: (op, account) => [
    s("Locks {amount} from {account} in a claimable balance. {claimants}.", {
      amount: amountText(op.amountStroops, op.asset),
      account,
      claimants: op.claimants.map(describeClaimant).join("; "),
    }),
  ],
  claimClaimableBalance: (op, account) => [
    s("Claims the claimable balance {balanceId} into {account}.", {
      balanceId: op.balanceId,
      account,
    }),
  ],
  beginSponsoringFutureReserves: (op, account) => [
    s("Makes {account} pay the reserves for new entries of {sponsored}, until it ends.", {
      account,
      sponsored: op.sponsoredId,
    }),
  ],
  endSponsoringFutureReserves: (_op, account) => [
    s("Ends the sponsorship of new entries of {account}.", { account }),
  ],
  revokeSponsorship: (op, account) => [
    s("Revokes the reserve sponsorship of {entry}, signed by {account} as its sponsor.", {
      account,
      entry: entryText(op.entry),
    }),
  ],
  unsupported: (op) => {
    switch (op.reason) {
      case "soroban":
        return [
          s("Soroban operation ({opType}): analysis arrives in a later version.", {
            opType: op.opType,
          }),
        ];
      case "obsolete":
        return [s("Inflation operation, which the network no longer runs.", {})];
      case "unknown":
        return [s("Operation of type {opType}, which Stellix can't read.", { opType: op.opType })];
    }
  },
};

/** The sentences for one operation, before filling. */
export function operationSentences(op: DecodedOperation, source: OpSource): OperationSentence[] {
  // TypeScript can't relate op.kind to op through the mapped table; each entry takes its kind.
  const describe = DESCRIBERS[op.kind] as (
    op: DecodedOperation,
    account: string,
  ) => OperationSentence[];
  return describe(op, accountText(source));
}

/** The filled description of one operation, e.g. "Sends 12.5 XLM from your account to G…". */
export function describeOperation(op: DecodedOperation, source: OpSource): string {
  return operationSentences(op, source)
    .map((sentence) => fillTemplate(sentence.template, sentence.values))
    .join(" ");
}
