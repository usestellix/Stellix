import { describe, expect, it } from "vitest";
import { createLogger, type LogFields, type LogLevel } from "../log.js";

function capture(minLevel: LogLevel) {
  const lines: [LogLevel, string, LogFields | undefined][] = [];
  const log = createLogger({
    minLevel,
    sink: (level, message, fields) => lines.push([level, message, fields]),
  });
  return { log, lines };
}

describe("createLogger", () => {
  it("drops messages below minLevel", () => {
    const { log, lines } = capture("info");
    log.debug("hidden");
    log.info("shown");
    log.warn("shown");
    log.error("shown");
    expect(lines.map(([level]) => level)).toEqual(["info", "warn", "error"]);
  });

  it("emits everything at debug", () => {
    const { log, lines } = capture("debug");
    log.debug("d", { code: "LOCKED" });
    expect(lines).toEqual([["debug", "d", { code: "LOCKED" }]]);
  });
});
