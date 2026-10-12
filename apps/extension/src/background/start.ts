import { createLogger, type Logger } from "@stellix/core";
import { browser } from "wxt/browser";
import { createMessageListener } from "../messaging/router.js";
import { migrate } from "../storage/migrations.js";
import { createHandlers, createTouchActivity } from "./handlers.js";
import { createExtensionPlatform } from "./platform.js";

/**
 * Service worker entry. Must run synchronously at worker start so the onMessage listener is
 * registered in the first turn of the event loop (MV3 requirement). Async startup work is
 * awaited by the router before any message is handled.
 */
export function startBackground(): void {
  const log = createLogger({ minLevel: import.meta.env.PROD ? "info" : "debug" });
  const platform = createExtensionPlatform();

  const ready = initialize(platform.persistent, log);
  // Each message awaits `ready` and reports the failure; this only silences the unhandled rejection.
  ready.catch(() => undefined);

  browser.runtime.onMessage.addListener(
    createMessageListener({
      handlers: createHandlers(platform),
      sender: { runtimeId: browser.runtime.id, extensionBaseUrl: browser.runtime.getURL("/") },
      ready,
      touchActivity: createTouchActivity(platform),
      log,
    }),
  );
}

async function initialize(
  persistent: ReturnType<typeof createExtensionPlatform>["persistent"],
  log: Logger,
): Promise<void> {
  try {
    // SECURITY §4.4: explicit even though it's the default.
    await browser.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
    await migrate(persistent);
  } catch (err: unknown) {
    log.error("startup failed");
    throw err;
  }
}
