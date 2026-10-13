import { REQUEST_TYPES } from "../protocol.js";
import type { Handlers } from "../router.js";

/** A full Handlers table whose unlisted entries reject, so a test only wires what it uses. */
export function stubHandlers(overrides: Partial<Handlers>): Handlers {
  const table: Record<string, unknown> = {};
  for (const type of REQUEST_TYPES) {
    table[type] = () => Promise.reject(new Error(`unexpected ${type}`));
  }
  return { ...(table as Handlers), ...overrides };
}
