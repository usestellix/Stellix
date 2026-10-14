import {
  CREATE_WORD_COUNT,
  ERROR_CODES,
  NETWORK_IDS,
  RESET_CONFIRMATION,
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

const walletStatusSchema = z.strictObject({
  hasVault: z.boolean(),
  unlocked: z.boolean(),
  network: z.enum(NETWORK_IDS),
  activeAccountIndex: z.number().int().nonnegative().nullable(),
}) satisfies z.ZodType<WalletStatus>;

const accountsResult = z.strictObject({ accounts: z.array(accountMetaSchema) });
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
  z.strictObject({
    id: z.string(),
    ok: z.literal(false),
    error: z.strictObject({ code: z.enum(ERROR_CODES), message: z.string() }),
  }),
]);

export type Response =
  | { id: string; ok: true; data?: unknown }
  | { id: string; ok: false; error: { code: ErrorCode; message: string } };
