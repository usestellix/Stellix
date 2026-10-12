import { ERROR_CODES } from "@stellix/core";
import { describe, expect, it } from "vitest";
import { ERROR_COPY } from "../errorCopy.js";

describe("ERROR_COPY", () => {
  it.each(ERROR_CODES)("has copy for %s", (code) => {
    expect(ERROR_COPY[code].trim().length).toBeGreaterThan(0);
  });

  it("has no entries for unknown codes", () => {
    expect(Object.keys(ERROR_COPY).sort()).toEqual([...ERROR_CODES].sort());
  });
});
