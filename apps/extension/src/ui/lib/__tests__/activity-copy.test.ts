import type { HistoryItem } from "@stellix/core";
import { describe, expect, it } from "vitest";
import { activityTitle, feeLabel, memoLabel, signedAmount } from "../activity-copy.js";

const G = "GDHWA726NGVLH4WUPB4R43JZMSB2XGWFGTP6EZNI7BSGIIYK5SSNY3VK";
const item = (patch: Partial<HistoryItem>): HistoryItem => ({
  id: "1",
  pagingToken: "1",
  hash: "h",
  at: "",
  direction: "in",
  kind: "payment",
  counterparty: G,
  amountStroops: "125000000",
  successful: true,
  ...patch,
});

describe("activity copy (UI_FLOWS §7)", () => {
  it.each([
    [{}, "Received from GDHW…Y3VK"],
    [{ direction: "out" }, "Sent to GDHW…Y3VK"],
    [{ direction: "self" }, "Sent to yourself"],
    [{ kind: "account_created" }, "Account activated by GDHW…Y3VK"],
    [{ kind: "account_created", direction: "out" }, "Activated GDHW…Y3VK"],
    [{ kind: "account_merged" }, "Merged in from GDHW…Y3VK"],
    [{ kind: "account_merged", direction: "out" }, "Merged into GDHW…Y3VK"],
  ] as const)("%o → %s", (patch, title) => {
    expect(activityTitle(item(patch))).toBe(title);
  });

  it("signs amounts by direction; unknown merge amount → null", () => {
    expect(signedAmount(item({}))).toBe("+12.5");
    expect(signedAmount(item({ direction: "out", amountStroops: "12345678900000" }))).toBe(
      "−1,234,567.89",
    );
    expect(signedAmount(item({ direction: "self" }))).toBe("12.5");
    expect(signedAmount(item({ amountStroops: null }))).toBeNull();
  });

  it("labels memos and fees", () => {
    expect(memoLabel({ type: "id", value: "9001" })).toBe("ID 9001");
    expect(memoLabel({ type: "text", value: "rent" })).toBe("rent");
    expect(feeLabel({ stroops: "100", operationCount: 1 })).toEqual({
      label: "Network fee",
      note: null,
    });
    expect(feeLabel({ stroops: "2500", operationCount: 25 })).toEqual({
      label: "Transaction fee",
      note: "Paid once for all 25 operations in this transaction.",
    });
  });
});
