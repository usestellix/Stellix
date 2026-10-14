import { StellixError, toStellixError, type Logger } from "@stellix/core";
import type { z } from "zod";
import {
  REQUESTS,
  requestEnvelopeSchema,
  type RequestDefinition,
  type RequestPayload,
  type RequestResult,
  type RequestType,
  type Response,
} from "./protocol.js";
import {
  authenticateSender,
  authorizeRequest,
  type MessageSenderLike,
  type SenderContext,
} from "./sender.js";

export type Handlers = {
  [T in RequestType]: (payload: RequestPayload<T>) => Promise<RequestResult<T>>;
};

export interface RouterDeps {
  handlers: Handlers;
  sender: SenderContext;
  /** Resolves once startup work (migrations, access level) is done; no message is handled before. */
  ready: Promise<void>;
  touchActivity: () => Promise<void>;
  log: Logger;
}

/** Validates and dispatches one message. Never throws; every failure becomes an error Response. */
export async function handleMessage(
  message: unknown,
  sender: MessageSenderLike,
  deps: RouterDeps,
): Promise<Response> {
  const id = extractId(message);
  try {
    const page = authenticateSender(sender, deps.sender);

    const envelope = requestEnvelopeSchema.safeParse(message);
    if (!envelope.success) throw new StellixError("INVALID_REQUEST", "Malformed request envelope");
    const { type, payload } = envelope.data;

    authorizeRequest(type, page);
    await deps.ready;
    if (REQUESTS[type].countsAsActivity) await deps.touchActivity();

    const data = await dispatch(type, payload, deps.handlers);
    return { id, ok: true, data };
  } catch (err: unknown) {
    const error = toStellixError(err);
    // Only the code and our own message are logged: never payloads or foreign error text.
    deps.log.debug("request failed", { code: error.code });
    return {
      id,
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined ? { details: error.details } : {}),
      },
    };
  }
}

/**
 * chrome.runtime.onMessage listener. Returns true synchronously to keep the channel open for
 * the async response (ARCHITECTURE §5 step 6).
 */
export function createMessageListener(deps: RouterDeps) {
  return (
    message: unknown,
    sender: MessageSenderLike,
    sendResponse: (response: Response) => void,
  ): true => {
    void handleMessage(message, sender, deps).then(sendResponse);
    return true;
  };
}

async function dispatch(type: RequestType, payload: unknown, handlers: Handlers): Promise<unknown> {
  const def: RequestDefinition = REQUESTS[type];
  // Safe: the payload is parsed with this type's schema before the handler sees it, and
  // Handlers ties each handler's parameter type to that same schema.
  const handler = handlers[type] as (payload: unknown) => Promise<unknown>;
  const result = await handler(parsePayload(def.payload, payload));
  // Results are validated too, so a handler bug can't push unexpected fields to the UI.
  return def.result.parse(result);
}

function parsePayload<S extends z.ZodType>(schema: S, payload: unknown): z.output<S> {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new StellixError("INVALID_REQUEST", "Invalid request payload");
  return parsed.data;
}

function extractId(message: unknown): string {
  if (typeof message === "object" && message !== null && "id" in message) {
    const { id } = message;
    if (typeof id === "string" && id.length <= 64) return id;
  }
  return "";
}
