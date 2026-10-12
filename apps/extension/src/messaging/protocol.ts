import { ERROR_CODES, NETWORK_IDS, type ErrorCode, type WalletStatus } from "@stellix/core";
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

export const REQUEST_TYPES = ["GET_STATUS"] as const;

export type RequestType = (typeof REQUEST_TYPES)[number];

const walletStatusSchema = z.strictObject({
  hasVault: z.boolean(),
  unlocked: z.boolean(),
  network: z.enum(NETWORK_IDS),
  activeAccountIndex: z.number().int().nonnegative().nullable(),
}) satisfies z.ZodType<WalletStatus>;

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

export const REQUESTS = {
  GET_STATUS: defineRequest({
    payload: z.undefined(),
    result: walletStatusSchema,
    allowedFrom: ["popup", "onboarding"],
    countsAsActivity: false,
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
  z.strictObject({ id: z.string(), ok: z.literal(true), data: z.unknown() }),
  z.strictObject({
    id: z.string(),
    ok: z.literal(false),
    error: z.strictObject({ code: z.enum(ERROR_CODES), message: z.string() }),
  }),
]);

export type Response =
  | { id: string; ok: true; data: unknown }
  | { id: string; ok: false; error: { code: ErrorCode; message: string } };
