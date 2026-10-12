import { getStatus, SESSION_KEYS, type Platform } from "@stellix/core";
import type { Handlers } from "../messaging/router.js";

// Thin handlers: each calls a core service (MOBILE_MIGRATION §4.3).
export function createHandlers(platform: Platform): Handlers {
  return {
    GET_STATUS: () => getStatus(platform),
  };
}

export function createTouchActivity(platform: Platform): () => Promise<void> {
  return () => platform.session.set(SESSION_KEYS.lastActivityAt, platform.now());
}
