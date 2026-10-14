import { describe, expect, it } from "vitest";
import { accountSchema } from "../../network/horizon-schemas.js";
import { fixture } from "../../network/__tests__/fixtures.js";
import { requiresMemo } from "../sep29.js";

const account = (data: Record<string, string>) => ({
  ...accountSchema.parse(fixture("account-funded").body),
  data,
});

describe("SEP-29 requiresMemo", () => {
  it('config.memo_required = "MQ==" ("1") → required', () => {
    expect(requiresMemo(account({ "config.memo_required": "MQ==" }))).toBe(true);
  });
  it.each([
    ["no entry", {}],
    ["value 0", { "config.memo_required": "MA==" }],
    ["other key", { "config.memo": "MQ==" }],
    ["not base64", { "config.memo_required": "!!" }],
  ])("%s → not required", (_n, data) => {
    expect(requiresMemo(account(data))).toBe(false);
  });
});
