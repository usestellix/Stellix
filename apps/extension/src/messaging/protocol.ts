import {
  AUTO_LOCK_MINUTES,
  CREATE_WORD_COUNT,
  ERROR_CODES,
  sanitizeErrorDetails,
  NETWORK_IDS,
  RESET_CONFIRMATION,
  RULE_IDS,
  SHIELD_INPUT_MAX_CHARS,
  SEVERITIES,
  UNAVAILABLE_REASONS,
  VERIFY_WORD_COUNT,
  accountMetaSchema,
  type ErrorCode,
  type WalletStatus,
} from "@stellix/core";
import { z } from "zod";

// Zod 4 otherwise probes `Function("")` to decide whether to JIT-compile parsers. MV3 CSP blocks
// it and CLAUDE.md §6.12 forbids it; jitless keeps every parse on the interpreted path.
z.config({ jitless: true });

// UI ↔ service worker protocol (ARCHITECTURE §5). Every request type is registered in REQUESTS
// with its payload schema, result schema, the pages allowed to send it, and whether it counts
// as user activity for auto-lock.

/** Extension pages that may message the service worker, keyed by WXT entrypoint name. */
export const EXTENSION_PAGES = {
  popup: "/popup.html",
  onboarding: "/onboarding.html",
} as const;

export type ExtensionPage = keyof typeof EXTENSION_PAGES;

export const REQUEST_TYPES = [
  "GET_STATUS",
  "ONBOARD_GENERATE",
  "ONBOARD_CREATE",
  "ONBOARD_IMPORT",
  "UNLOCK",
  "LOCK",
  "LIST_ACCOUNTS",
  "ADD_ACCOUNT",
  "RENAME_ACCOUNT",
  "SET_ACTIVE_ACCOUNT",
  "REVEAL_PHRASE",
  "CHANGE_PASSWORD",
  "RESET_WALLET",
  "GET_SETTINGS",
  "SET_SETTINGS",
  "DISCOVER_ACCOUNTS",
  "PREPARE_PAYMENT",
  "CONFIRM_PAYMENT",
  "CANCEL_PAYMENT",
  "DISMISS_OUTCOME",
  "SHIELD_ANALYZE",
] as const;

export type RequestType = (typeof REQUEST_TYPES)[number];

export interface RequestDefinition<
  P extends z.ZodType = z.ZodType,
  R extends z.ZodType = z.ZodType,
> {
  payload: P;
  result: R;
  allowedFrom: readonly ExtensionPage[];
  /** Explicit user actions count; GET_STATUS does not (ARCHITECTURE §6.3). */
  countsAsActivity: boolean;
}

/** Keeps schema types precise while widening the policy fields. */
function defineRequest<P extends z.ZodType, R extends z.ZodType>(
  def: RequestDefinition<P, R>,
): RequestDefinition<P, R> {
  return def;
}

const BOTH = ["popup", "onboarding"] as const satisfies readonly ExtensionPage[];
const POPUP_ONLY = ["popup"] as const satisfies readonly ExtensionPage[];
/** Types that carry or return the recovery phrase (ARCHITECTURE §5, SECURITY §4.3). */
const ONBOARDING_ONLY = ["onboarding"] as const satisfies readonly ExtensionPage[];

// Generous caps: real limits are enforced in core; these bound what crosses the boundary.
const password = z.string().min(1).max(1024);
const accountIndex = z
  .number()
  .int()
  .min(0)
  .max(2 ** 31 - 1);
const label = z.string().max(64);
const none = z.undefined();

const stroops = z.string().regex(/^\d+$/);
const hash = z.string().regex(/^[0-9a-f]{64}$/);

/** TRANSACTIONS §3.8 PaymentSummary; bigints cross messaging as decimal strings. */
const paymentSummarySchema = z.strictObject({
  kind: z.enum(["payment", "createAccount"]),
  source: z.string(),
  destination: z.string(),
  destinationBase: z.string(),
  amountStroops: stroops,
  feeStroops: stroops,
  totalStroops: stroops,
  memo: z.discriminatedUnion("type", [
    z.strictObject({ type: z.literal("none") }),
    z.strictObject({ type: z.literal("text"), value: z.string() }),
    z.strictObject({ type: z.literal("id"), value: z.string() }),
  ]),
  network: z.enum(NETWORK_IDS),
  expiresAt: z.number().int(),
  firstTimeDestination: z.boolean(),
  feeEstimated: z.boolean(),
});

const ruleIdSchema = z.enum(RULE_IDS);

/**
 * SHIELD §4 ReportView: public data only, no decoded request. SW → UI only; no request type
 * accepts a report (the SW signs on the one it stored). `decision` is for display: the SW
 * re-evaluates the stored report at confirm.
 */
const reportViewSchema = z.strictObject({
  digest: z.string().regex(/^[0-9a-f]{64}$/),
  network: z.enum(NETWORK_IDS),
  ruleSetVersion: z.string(),
  findings: z
    .array(
      z.strictObject({
        ruleId: ruleIdSchema,
        severity: z.enum(SEVERITIES),
        confidence: z.enum(["high", "medium", "low"]),
        opIndex: z.number().int().nonnegative().exactOptional(),
        evidence: z.record(z.string(), z.string()).readonly(),
      }),
    )
    .readonly(),
  checksUnavailable: z
    .array(z.strictObject({ ruleId: ruleIdSchema, reason: z.enum(UNAVAILABLE_REASONS) }))
    .readonly(),
  decision: z.discriminatedUnion("state", [
    z.strictObject({ state: z.literal("ready") }),
    z.strictObject({
      state: z.literal("review"),
      requires: z.enum(["click", "typed"]),
      typedPhrase: z.string().exactOptional(),
    }),
    z.strictObject({
      state: z.literal("blocked"),
      ruleIds: z.array(ruleIdSchema).readonly(),
      overridable: z.literal(false),
    }),
  ]),
  createdAt: z.number().int(),
  expiresAt: z.number().int(),
});

/** SHIELD §6.5: a click on Confirm, or the phrase the decision asked for, as typed. */
const confirmationSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("click") }),
  z.strictObject({ kind: z.literal("typed"), phrase: z.string().max(64) }),
]);

/** SHIELD §8 SHIELD_ANALYZE result: public strings only; request text is data (invariant 17). */
const analyzeResultSchema = z.strictObject({
  account: z.string(),
  spendsFromAccount: z.boolean(),
  transaction: z.strictObject({
    envelopeType: z.enum(["tx", "txFeeBump"]),
    source: z.string(),
    feeStroops: stroops,
    feeBump: z.strictObject({ feeSource: z.string(), maxFeeStroops: stroops }).nullable(),
    memo: z.discriminatedUnion("type", [
      z.strictObject({ type: z.literal("none") }),
      z.strictObject({ type: z.literal("text"), text: z.string().nullable(), hex: z.string() }),
      z.strictObject({ type: z.literal("id"), value: stroops }),
      z.strictObject({ type: z.enum(["hash", "return"]), hex: z.string() }),
    ]),
    operations: z
      .array(
        z
          .array(
            z.strictObject({
              template: z.string(),
              values: z.record(z.string(), z.string()).readonly(),
            }),
          )
          .readonly(),
      )
      .readonly(),
  }),
  report: reportViewSchema,
});

const errorCodeSchema = z.enum(ERROR_CODES);

/** Errors cross messaging with only the detail keys their code declares (ERROR_DETAIL_KEYS). */
const errorSchema = z
  .strictObject({
    code: errorCodeSchema,
    message: z.string(),
    details: z.record(z.string(), z.string()).optional(),
  })
  .transform(({ code, message, details }) => {
    const clean = sanitizeErrorDetails(code, details);
    return clean === undefined ? { code, message } : { code, message, details: clean };
  });

const finishedOutcomeSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("success"), hash, ledger: z.number().int() }),
  z.strictObject({ status: z.literal("failed"), hash, error: errorSchema }),
  z.strictObject({
    status: z.literal("rebuild"),
    reason: z.enum(["bad_seq", "destination_changed"]),
  }),
]);

const submitOutcomeSchema = z.union([
  finishedOutcomeSchema,
  z.strictObject({ status: z.literal("pending"), hash }),
]);

const inflightSchema = z.strictObject({
  hash,
  network: z.enum(NETWORK_IDS),
  summary: paymentSummarySchema,
  status: z.enum(["resolving", "done"]),
  outcome: finishedOutcomeSchema.nullable(),
});

const walletStatusSchema = z.strictObject({
  hasVault: z.boolean(),
  unlocked: z.boolean(),
  network: z.enum(NETWORK_IDS),
  activeAccountIndex: z.number().int().nonnegative().nullable(),
  /** In-flight and recently finished payments (TRANSACTIONS §5, UI_FLOWS §1). */
  inflight: z.array(inflightSchema),
}) satisfies z.ZodType<WalletStatus>;

const accountsResult = z.strictObject({ accounts: z.array(accountMetaSchema) });
const networkId = z.enum(NETWORK_IDS);
const autoLockMinutes = z.union(AUTO_LOCK_MINUTES.map((m) => z.literal(m)));
const settingsSchema = z.strictObject({
  network: networkId,
  horizonOverrides: z.partialRecord(networkId, z.string()),
  autoLockMinutes,
});
const importResult = z.strictObject({
  accounts: z.array(accountMetaSchema),
  discoveryIncomplete: z.boolean(),
});

export const REQUESTS = {
  GET_STATUS: defineRequest({
    payload: none,
    result: walletStatusSchema,
    allowedFrom: BOTH,
    countsAsActivity: false,
  }),
  ONBOARD_GENERATE: defineRequest({
    payload: none,
    result: z.strictObject({
      words: z.array(z.string()).length(CREATE_WORD_COUNT),
      verifyPositions: z
        .array(
          z
            .number()
            .int()
            .min(0)
            .max(CREATE_WORD_COUNT - 1),
        )
        .length(VERIFY_WORD_COUNT),
    }),
    allowedFrom: ONBOARDING_ONLY,
    countsAsActivity: true,
  }),
  ONBOARD_CREATE: defineRequest({
    payload: z.strictObject({
      password,
      answers: z
        .array(
          z.strictObject({ position: z.number().int().min(0).max(23), word: z.string().max(64) }),
        )
        .max(VERIFY_WORD_COUNT),
    }),
    result: accountsResult,
    allowedFrom: ONBOARDING_ONLY,
    countsAsActivity: true,
  }),
  ONBOARD_IMPORT: defineRequest({
    payload: z.strictObject({ mnemonic: z.string().max(1024), password }),
    result: importResult,
    allowedFrom: ONBOARDING_ONLY,
    countsAsActivity: true,
  }),
  UNLOCK: defineRequest({
    payload: z.strictObject({ password }),
    result: z.strictObject({ ok: z.literal(true) }),
    allowedFrom: BOTH,
    countsAsActivity: true,
  }),
  LOCK: defineRequest({ payload: none, result: none, allowedFrom: BOTH, countsAsActivity: true }),
  LIST_ACCOUNTS: defineRequest({
    payload: none,
    result: z.array(accountMetaSchema),
    allowedFrom: BOTH,
    countsAsActivity: true,
  }),
  ADD_ACCOUNT: defineRequest({
    payload: z.strictObject({ label: label.optional() }),
    result: accountMetaSchema,
    allowedFrom: BOTH,
    countsAsActivity: true,
  }),
  RENAME_ACCOUNT: defineRequest({
    payload: z.strictObject({ index: accountIndex, label }),
    result: none,
    allowedFrom: BOTH,
    countsAsActivity: true,
  }),
  SET_ACTIVE_ACCOUNT: defineRequest({
    payload: z.strictObject({ index: accountIndex }),
    result: none,
    allowedFrom: BOTH,
    countsAsActivity: true,
  }),
  REVEAL_PHRASE: defineRequest({
    payload: z.strictObject({ password }),
    result: z.strictObject({ words: z.array(z.string()).min(12).max(24) }),
    allowedFrom: ONBOARDING_ONLY,
    countsAsActivity: true,
  }),
  CHANGE_PASSWORD: defineRequest({
    payload: z.strictObject({ current: password, next: password }),
    result: none,
    allowedFrom: BOTH,
    countsAsActivity: true,
  }),
  RESET_WALLET: defineRequest({
    payload: z.strictObject({ confirmation: z.literal(RESET_CONFIRMATION) }),
    result: none,
    allowedFrom: BOTH,
    countsAsActivity: true,
  }),
  /** Public. Passive like GET_STATUS: the popup reads it on open to find the Horizon URL. */
  GET_SETTINGS: defineRequest({
    payload: none,
    result: settingsSchema,
    allowedFrom: BOTH,
    countsAsActivity: false,
  }),
  SET_SETTINGS: defineRequest({
    payload: z.strictObject({
      network: networkId.optional(),
      /** Must be true to switch to mainnet; the SW rejects otherwise (CLAUDE.md §6.14). */
      acknowledgedRealFunds: z.boolean().optional(),
      autoLockMinutes: autoLockMinutes.optional(),
      horizonOverride: z
        .strictObject({ network: networkId, url: z.string().max(2048).nullable() })
        .optional(),
    }),
    result: settingsSchema,
    allowedFrom: BOTH,
    countsAsActivity: true,
  }),
  /**
   * TRANSACTIONS §3: builds and stores an unsigned tx; returns its summary and Shield's report
   * (Mode A, SHIELD §8) for review.
   */
  PREPARE_PAYMENT: defineRequest({
    payload: z.strictObject({
      destination: z.string().max(128),
      amount: z.string().max(40),
      memo: z.strictObject({ type: z.enum(["text", "id"]), value: z.string().max(64) }).optional(),
    }),
    result: z.strictObject({
      preparedId: z.string().regex(/^[0-9a-f]{32}$/),
      summary: paymentSummarySchema,
      expiresAt: z.number().int(),
      report: reportViewSchema,
    }),
    allowedFrom: BOTH,
    countsAsActivity: true,
  }),
  /**
   * TRANSACTIONS §4: signs exactly the stored tx. Returns within ~20 s, possibly "pending".
   * `confirmation` is what the user did on the Review screen that showed the findings; the SW
   * checks it against its own stored report (assertSignable), never against the UI's view.
   */
  CONFIRM_PAYMENT: defineRequest({
    payload: z.strictObject({
      preparedId: z.string().regex(/^[0-9a-f]{32}$/),
      confirmation: confirmationSchema,
    }),
    result: submitOutcomeSchema,
    allowedFrom: BOTH,
    countsAsActivity: true,
  }),
  CANCEL_PAYMENT: defineRequest({
    payload: z.strictObject({ preparedId: z.string().regex(/^[0-9a-f]{32}$/) }),
    result: none,
    allowedFrom: BOTH,
    countsAsActivity: true,
  }),
  /** The popup has shown a finished outcome; drop it. */
  DISMISS_OUTCOME: defineRequest({
    payload: z.strictObject({ hash }),
    result: none,
    allowedFrom: BOTH,
    countsAsActivity: true,
  }),
  /**
   * Mode C (SHIELD §2, §8): analyzes a pasted transaction XDR or web+stellar:tx link for the
   * active account. Never signs and stores nothing signable. Popup only, unlocked. The transport
   * cap is above core's SHIELD_INPUT_MAX_CHARS so oversize input gets SHIELD_INPUT_TOO_LARGE.
   */
  SHIELD_ANALYZE: defineRequest({
    payload: z.strictObject({
      input: z.string().max(SHIELD_INPUT_MAX_CHARS * 4),
      network: networkId,
    }),
    result: analyzeResultSchema,
    allowedFrom: POPUP_ONLY,
    countsAsActivity: true,
  }),
  /** Requires unlocked. Appends newly found indices only. */
  DISCOVER_ACCOUNTS: defineRequest({
    payload: none,
    result: z.strictObject({ added: z.array(accountMetaSchema), incomplete: z.boolean() }),
    allowedFrom: BOTH,
    countsAsActivity: true,
  }),
} satisfies Record<RequestType, RequestDefinition>;

export type RequestPayload<T extends RequestType> = z.input<(typeof REQUESTS)[T]["payload"]>;
export type RequestResult<T extends RequestType> = z.output<(typeof REQUESTS)[T]["result"]>;

export const requestEnvelopeSchema = z.strictObject({
  id: z.uuid(),
  type: z.enum(REQUEST_TYPES),
  // Messaging serializes as JSON, so an undefined payload arrives as a missing key.
  payload: z.unknown().optional(),
});

export type RequestEnvelope = z.output<typeof requestEnvelopeSchema>;

export const responseSchema = z.discriminatedUnion("ok", [
  // Same as payload: an undefined result (e.g. LOCK) arrives without a `data` key.
  z.strictObject({ id: z.string(), ok: z.literal(true), data: z.unknown().optional() }),
  z.strictObject({ id: z.string(), ok: z.literal(false), error: errorSchema }),
]);

export type Response =
  | { id: string; ok: true; data?: unknown }
  | {
      id: string;
      ok: false;
      error: { code: ErrorCode; message: string; details?: Readonly<Record<string, string>> };
    };
