import { resumeInflight, type Platform, type SendDeps } from "@stellix/core";
import type { AlarmsApi } from "./autolock.js";

// In-flight resolution in the MV3 worker (TRANSACTIONS §5, ADR 0007). The worker can be killed
// at any time, so resolution resumes on every start and on a 30 s "resolve" alarm while anything
// is unfinished. Each poll writes session storage, which also resets the 30 s idle timer.

export const RESOLVE_ALARM = "resolve";
const PERIOD_MINUTES = 0.5;
/** Per wake-up. Stays well under Chrome's 5-minute single-event limit. */
const RESUME_BUDGET_MS = 25_000;

export interface InflightResolver {
  /** Called after a submit that's still pending. */
  ensureAlarm(): Promise<void>;
  /** Resume now (startup, alarm, popup polling). Never runs two passes at once. */
  resume(): Promise<void>;
  onAlarm(alarm: { name: string }): void;
}

export function createInflightResolver(
  platform: Pick<Platform, "persistent" | "session" | "now">,
  alarms: AlarmsApi,
  sendDeps: () => Promise<SendDeps>,
): InflightResolver {
  // A scheduling cache only: if the worker dies mid-pass, the next start resumes from storage.
  let running: Promise<void> | null = null;

  const ensureAlarm = async (): Promise<void> => {
    if ((await alarms.get(RESOLVE_ALARM)) === undefined) {
      await alarms.create(RESOLVE_ALARM, { periodInMinutes: PERIOD_MINUTES });
    }
  };

  const pass = async (): Promise<void> => {
    const unfinished = await resumeInflight(platform, await sendDeps(), RESUME_BUDGET_MS);
    if (unfinished > 0) await ensureAlarm();
    else await alarms.clear(RESOLVE_ALARM);
  };

  const resume = (): Promise<void> => {
    running ??= pass().finally(() => {
      running = null;
    });
    return running;
  };

  return {
    ensureAlarm,
    resume,
    onAlarm: (alarm) => {
      if (alarm.name === RESOLVE_ALARM) void resume().catch(() => undefined);
    },
  };
}
