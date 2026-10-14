import { StellixError } from "@stellix/core";
import { browser } from "wxt/browser";
import {
  REQUESTS,
  responseSchema,
  type RequestEnvelope,
  type RequestPayload,
  type RequestResult,
  type RequestType,
} from "./protocol.js";

export type SendFn = (envelope: RequestEnvelope) => Promise<unknown>;

export type RequestFn = <T extends RequestType>(
  type: T,
  payload: RequestPayload<T>,
) => Promise<RequestResult<T>>;

/** UI-side client. Rejects with StellixError on any error response or malformed reply. */
export function createClient(
  send: SendFn,
  newId: () => string = () => crypto.randomUUID(),
): RequestFn {
  return async (type, payload) => {
    const id = newId();
    let raw: unknown;
    try {
      raw = await send({ id, type, payload });
    } catch {
      throw new StellixError("INTERNAL_ERROR", "Could not reach the service worker", true);
    }

    const response = responseSchema.safeParse(raw);
    if (!response.success || response.data.id !== id) {
      throw new StellixError("INTERNAL_ERROR", "Malformed response from the service worker");
    }
    if (!response.data.ok) {
      const { code, message, details } = response.data.error;
      throw new StellixError(code, message, false, details);
    }

    const result = REQUESTS[type].result.safeParse(response.data.data);
    if (!result.success) {
      throw new StellixError("INTERNAL_ERROR", "Unexpected result from the service worker");
    }
    return result.data as RequestResult<typeof type>;
  };
}

export const request: RequestFn = createClient((envelope) => browser.runtime.sendMessage(envelope));
