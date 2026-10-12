import { describe, expect, it } from "vitest";
import { REQUESTS } from "../protocol.js";
import { authenticateSender, authorizeRequest } from "../sender.js";

const ctx = {
  runtimeId: "abcdefghijklmnop",
  extensionBaseUrl: "chrome-extension://abcdefghijklmnop/",
};
const popup = { id: ctx.runtimeId, url: "chrome-extension://abcdefghijklmnop/popup.html" };

function code(fn: () => unknown): string | undefined {
  try {
    fn();
    return undefined;
  } catch (err: unknown) {
    return (err as { code?: string }).code;
  }
}

describe("authenticateSender", () => {
  it("identifies the popup and onboarding pages", () => {
    expect(authenticateSender(popup, ctx)).toBe("popup");
    expect(
      authenticateSender(
        { id: ctx.runtimeId, url: "chrome-extension://abcdefghijklmnop/onboarding.html" },
        ctx,
      ),
    ).toBe("onboarding");
  });

  it("ignores query strings and fragments", () => {
    expect(authenticateSender({ ...popup, url: `${popup.url}?x=1#y` }, ctx)).toBe("popup");
  });

  it.each([
    ["a foreign extension id", { id: "otherextensionid", url: popup.url }],
    ["a missing id", { url: popup.url }],
    ["a web page url", { id: ctx.runtimeId, url: "https://evil.example/popup.html" }],
    [
      "another extension's url",
      { id: ctx.runtimeId, url: "chrome-extension://otherextensionid/popup.html" },
    ],
    ["a missing url", { id: ctx.runtimeId }],
    [
      "an unknown extension page",
      { id: ctx.runtimeId, url: "chrome-extension://abcdefghijklmnop/other.html" },
    ],
    [
      "a prefix-confusion url",
      { id: ctx.runtimeId, url: "chrome-extension://abcdefghijklmnop.evil/popup.html" },
    ],
  ])("rejects %s", (_name, sender) => {
    expect(code(() => authenticateSender(sender, ctx))).toBe("UNAUTHORIZED_SENDER");
  });
});

describe("authorizeRequest", () => {
  it("allows GET_STATUS from popup and onboarding", () => {
    expect(
      code(() => {
        authorizeRequest("GET_STATUS", "popup");
      }),
    ).toBeUndefined();
    expect(
      code(() => {
        authorizeRequest("GET_STATUS", "onboarding");
      }),
    ).toBeUndefined();
  });

  it("rejects a type from a page outside its allowedFrom list", () => {
    // Simulates an onboarding-only type (ONBOARD_GENERATE, REVEAL_PHRASE arrive in M1).
    const def = REQUESTS.GET_STATUS;
    const original = def.allowedFrom;
    def.allowedFrom = ["onboarding"];
    try {
      expect(
        code(() => {
          authorizeRequest("GET_STATUS", "popup");
        }),
      ).toBe("UNAUTHORIZED_SENDER");
      expect(
        code(() => {
          authorizeRequest("GET_STATUS", "onboarding");
        }),
      ).toBeUndefined();
    } finally {
      def.allowedFrom = original;
    }
  });
});
