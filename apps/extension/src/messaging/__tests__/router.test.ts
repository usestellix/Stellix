import { createLogger, StellixError, type WalletStatus } from "@stellix/core";
import { describe, expect, it, vi } from "vitest";
import { createMessageListener, handleMessage, type RouterDeps } from "../router.js";
import { stubHandlers } from "./stub-handlers.js";

const ID = "8f14e45f-ceea-4e7a-9b7b-2b7f5d0f3c11";
const BASE = "chrome-extension://abcdefghijklmnop/";
const popup = { id: "abcdefghijklmnop", url: `${BASE}popup.html` };
const STATUS: WalletStatus = {
  hasVault: false,
  unlocked: false,
  network: "testnet",
  activeAccountIndex: null,
  inflight: [],
};

function deps(overrides: Partial<RouterDeps> = {}): RouterDeps {
  return {
    handlers: stubHandlers({ GET_STATUS: vi.fn(() => Promise.resolve(STATUS)) }),
    sender: { runtimeId: "abcdefghijklmnop", extensionBaseUrl: BASE },
    ready: Promise.resolve(),
    touchActivity: vi.fn(() => Promise.resolve()),
    log: createLogger({ minLevel: "error", sink: () => undefined }),
    ...overrides,
  };
}

describe("handleMessage", () => {
  it("round-trips GET_STATUS", async () => {
    const d = deps();
    const res = await handleMessage({ id: ID, type: "GET_STATUS" }, popup, d);
    expect(res).toEqual({ id: ID, ok: true, data: STATUS });
  });

  it("does not count GET_STATUS as activity", async () => {
    const d = deps();
    await handleMessage({ id: ID, type: "GET_STATUS" }, popup, d);
    expect(d.touchActivity).not.toHaveBeenCalled();
  });

  it("rejects a foreign sender before parsing or dispatching", async () => {
    const d = deps();
    const res = await handleMessage({ id: ID, type: "GET_STATUS" }, { ...popup, id: "evil" }, d);
    expect(res).toMatchObject({ id: ID, ok: false, error: { code: "UNAUTHORIZED_SENDER" } });
    expect(d.handlers.GET_STATUS).not.toHaveBeenCalled();
  });

  it("rejects malformed envelopes with INVALID_REQUEST", async () => {
    const res = await handleMessage({ id: ID, type: "NOPE" }, popup, deps());
    expect(res).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
  });

  it("rejects invalid payloads with INVALID_REQUEST", async () => {
    const d = deps();
    const res = await handleMessage({ id: ID, type: "GET_STATUS", payload: { x: 1 } }, popup, d);
    expect(res).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
    expect(d.handlers.GET_STATUS).not.toHaveBeenCalled();
  });

  it("waits for startup before dispatching", async () => {
    let finish: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const d = deps({ ready });
    const pending = handleMessage({ id: ID, type: "GET_STATUS" }, popup, d);
    await Promise.resolve();
    expect(d.handlers.GET_STATUS).not.toHaveBeenCalled();
    finish();
    await expect(pending).resolves.toMatchObject({ ok: true });
  });

  it("reports failed startup as INTERNAL_ERROR", async () => {
    const res = await handleMessage(
      { id: ID, type: "GET_STATUS" },
      popup,
      deps({ ready: Promise.reject(new Error("migration")) }),
    );
    expect(res).toMatchObject({ ok: false, error: { code: "INTERNAL_ERROR" } });
  });

  it("passes StellixError codes through", async () => {
    const d = deps({
      handlers: stubHandlers({
        GET_STATUS: () => Promise.reject(new StellixError("LOCKED", "locked")),
      }),
    });
    const res = await handleMessage({ id: ID, type: "GET_STATUS" }, popup, d);
    expect(res).toEqual({ id: ID, ok: false, error: { code: "LOCKED", message: "locked" } });
  });

  it("never leaks foreign error text", async () => {
    const d = deps({
      handlers: stubHandlers({ GET_STATUS: () => Promise.reject(new Error("secret seed words")) }),
    });
    const res = await handleMessage({ id: ID, type: "GET_STATUS" }, popup, d);
    expect(JSON.stringify(res)).not.toContain("secret");
    expect(res).toMatchObject({ ok: false, error: { code: "INTERNAL_ERROR" } });
  });

  it("rejects handler results that don't match the result schema", async () => {
    const bad = { ...STATUS, mnemonic: "abandon" } as WalletStatus;
    const d = deps({ handlers: stubHandlers({ GET_STATUS: () => Promise.resolve(bad) }) });
    const res = await handleMessage({ id: ID, type: "GET_STATUS" }, popup, d);
    expect(res).toMatchObject({ ok: false, error: { code: "INTERNAL_ERROR" } });
    expect(JSON.stringify(res)).not.toContain("abandon");
  });
});

describe("createMessageListener", () => {
  it("returns true synchronously and responds asynchronously", async () => {
    const listener = createMessageListener(deps());
    const sendResponse = vi.fn();
    expect(listener({ id: ID, type: "GET_STATUS" }, popup, sendResponse)).toBe(true);
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({ id: ID, ok: true, data: STATUS });
    });
  });
});
