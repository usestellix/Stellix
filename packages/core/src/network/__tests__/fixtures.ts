import root from "../../__fixtures__/horizon/root.json" with { type: "json" };
import ledgers_latest from "../../__fixtures__/horizon/ledgers-latest.json" with { type: "json" };
import fee_stats from "../../__fixtures__/horizon/fee-stats.json" with { type: "json" };
import account_not_found from "../../__fixtures__/horizon/account-not-found.json" with { type: "json" };
import account_funded from "../../__fixtures__/horizon/account-funded.json" with { type: "json" };
import account_multi_subentry from "../../__fixtures__/horizon/account-multi-subentry.json" with { type: "json" };
import friendbot_success from "../../__fixtures__/horizon/friendbot-success.json" with { type: "json" };
import friendbot_already_funded from "../../__fixtures__/horizon/friendbot-already-funded.json" with { type: "json" };
import submit_async_pending from "../../__fixtures__/horizon/submit-async-pending.json" with { type: "json" };
import submit_async_bad_seq from "../../__fixtures__/horizon/submit-async-bad-seq.json" with { type: "json" };
import transaction_success from "../../__fixtures__/horizon/transaction-success.json" with { type: "json" };
import transaction_failed from "../../__fixtures__/horizon/transaction-failed.json" with { type: "json" };
import transaction_not_found from "../../__fixtures__/horizon/transaction-not-found.json" with { type: "json" };
import payments_page from "../../__fixtures__/horizon/payments-page.json" with { type: "json" };
import history_page from "../../__fixtures__/horizon/history-page.json" with { type: "json" };
import history_me from "../../__fixtures__/horizon/history-me.json" with { type: "json" };
import history_multiop_page1 from "../../__fixtures__/horizon/history-multiop-page1.json" with { type: "json" };
import history_multiop_page2 from "../../__fixtures__/horizon/history-multiop-page2.json" with { type: "json" };
import effects_account_merge from "../../__fixtures__/horizon/effects-account-merge.json" with { type: "json" };

// Captured testnet responses (scripts/capture-horizon-fixtures.mjs), imported as JSON so core
// tests stay free of Node APIs.
const FIXTURES = {
  root: root,
  "ledgers-latest": ledgers_latest,
  "fee-stats": fee_stats,
  "account-not-found": account_not_found,
  "account-funded": account_funded,
  "account-multi-subentry": account_multi_subentry,
  "friendbot-success": friendbot_success,
  "friendbot-already-funded": friendbot_already_funded,
  "submit-async-pending": submit_async_pending,
  "submit-async-bad-seq": submit_async_bad_seq,
  "transaction-success": transaction_success,
  "transaction-failed": transaction_failed,
  "transaction-not-found": transaction_not_found,
  "payments-page": payments_page,
  "history-page": history_page,
  "history-me": history_me,
  "history-multiop-page1": history_multiop_page1,
  "history-multiop-page2": history_multiop_page2,
  "effects-account-merge": effects_account_merge,
} as const satisfies Record<string, { status: number; body: unknown }>;

export type FixtureName = keyof typeof FIXTURES;

export function fixture(name: FixtureName): { status: number; body: unknown } {
  return structuredClone(FIXTURES[name]);
}

/** A scripted fetch: each call returns the next response (or throws the next error). */
export function scriptedFetch(
  steps: (Response | Error | ((url: string, init?: RequestInit) => Response))[],
) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fn = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      input instanceof URL ? input.toString() : typeof input === "string" ? input : input.url;
    calls.push({ url, init });
    const step = steps.shift();
    if (step === undefined) return Promise.reject(new Error("no more scripted responses"));
    if (step instanceof Error) return Promise.reject(step);
    return Promise.resolve(typeof step === "function" ? step(url, init) : step);
  }) as typeof fetch;
  return { fetch: fn, calls };
}

export function json(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export function fromFixture(name: FixtureName): Response {
  const f = fixture(name);
  return json(f.status, f.body);
}
