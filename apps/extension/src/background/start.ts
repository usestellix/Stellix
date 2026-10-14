import { createLogger, type Logger } from "@stellix/core";
import { browser } from "wxt/browser";
import { createMessageListener } from "../messaging/router.js";
import { migrate } from "../storage/migrations.js";
import { createAutoLock, type AutoLock } from "./autolock.js";
import { createHandlers, createTouchActivity } from "./handlers.js";
import { createExtensionPlatform } from "./platform.js";

/**
 * Service worker entry. Must run synchronously at worker start so the onMessage and onAlarm
 * listeners are registered in the first turn of the event loop (MV3 requirement). Async startup
 * work is awaited by the router before any message is handled.
 */
export function startBackground(): void {
  const log = createLogger({ minLevel: import.meta.env.PROD ? "info" : "debug" });
  const platform = createExtensionPlatform();
  const autoLock = createAutoLock(platform, browser.alarms);

  browser.alarms.onAlarm.addListener((alarm) => {
    autoLock.onAlarm(alarm);
  });

  const ready = initialize(platform.persistent, autoLock, log);
  // Each message awaits `ready` and reports the failure; this only silences the unhandled rejection.
  ready.catch(() => undefined);

  browser.runtime.onMessage.addListener(
    createMessageListener({
      handlers: createHandlers({
        platform,
        autoLock,
        devBuild: import.meta.env.DEV,
        openOnboarding: async () => {
          await browser.tabs.create({ url: browser.runtime.getURL("/onboarding.html") });
        },
      }),
      sender: { runtimeId: browser.runtime.id, extensionBaseUrl: browser.runtime.getURL("/") },
      ready,
      touchActivity: createTouchActivity(platform, autoLock),
      log,
    }),
  );
}

async function initialize(
  persistent: ReturnType<typeof createExtensionPlatform>["persistent"],
  autoLock: AutoLock,
  log: Logger,
): Promise<void> {
  try {
    // SECURITY §4.4: explicit even though it's the default.
    await browser.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
    await migrate(persistent);
    await autoLock.onStartup();
  } catch (err: unknown) {
    log.error("startup failed");
    throw err;
  }
}
