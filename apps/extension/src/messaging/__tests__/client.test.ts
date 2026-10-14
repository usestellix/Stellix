import { describe, expect, it } from "vitest";
import { createClient } from "../client.js";

const ID = "8f14e45f-ceea-4e7a-9b7b-2b7f5d0f3c11";
const STATUS = {
  hasVault: true,
  unlocked: true,
  network: "mainnet",
  activeAccountIndex: 2,
  inflight: [],
};

function code(p: Promise<unknown>) {
  return p.then(
    () => undefined,
    (err: unknown) => (err as { code?: string }).code,
  );
}

describe("createClient", () => {
  it("sends an envelope and returns the parsed result", async () => {
    const sent: unknown[] = [];
    const request = createClient(
      (env) => {
        sent.push(env);
        return Promise.resolve({ id: ID, ok: true, data: STATUS });
      },
      () => ID,
    );
    await expect(request("GET_STATUS", undefined)).resolves.toEqual(STATUS);
    expect(sent).toEqual([{ id: ID, type: "GET_STATUS", payload: undefined }]);
  });

  it("throws the SW's error code", async () => {
    const request = createClient(
      () => Promise.resolve({ id: ID, ok: false, error: { code: "LOCKED", message: "m" } }),
      () => ID,
    );
    expect(await code(request("GET_STATUS", undefined))).toBe("LOCKED");
  });

  it.each([
    ["a mismatched id", { id: "other", ok: true, data: STATUS }],
    ["a malformed response", { nope: true }],
    ["no response", undefined],
    ["a result that fails the schema", { id: ID, ok: true, data: { hasVault: "yes" } }],
  ])("rejects %s as INTERNAL_ERROR", async (_name, reply) => {
    const request = createClient(
      () => Promise.resolve(reply),
      () => ID,
    );
    expect(await code(request("GET_STATUS", undefined))).toBe("INTERNAL_ERROR");
  });

  it("maps a send failure to a retryable INTERNAL_ERROR", async () => {
    const request = createClient(
      () => Promise.reject(new Error("Receiving end does not exist")),
      () => ID,
    );
    await expect(request("GET_STATUS", undefined)).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      retryable: true,
    });
  });
});
