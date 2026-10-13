import { z } from "zod";
import { StellixError } from "./errors.js";
import type { KeyValueStore } from "./platform.js";
import { PERSISTENT_KEYS } from "./storage-keys.js";

// Derived-account metadata (ARCHITECTURE §3). Public data only.

export const LABEL_MAX_LENGTH = 32;

export const accountMetaSchema = z.strictObject({
  index: z
    .number()
    .int()
    .min(0)
    .max(2 ** 31 - 1),
  publicKey: z.string().regex(/^G[A-Z2-7]{55}$/),
  label: z.string().min(1).max(LABEL_MAX_LENGTH),
});

export type AccountMeta = z.output<typeof accountMetaSchema>;

const accountsSchema = z.array(accountMetaSchema);

export function defaultAccountLabel(index: number): string {
  return `Account ${String(index + 1)}`;
}

/** Trims; 1–32 characters (CLAUDE.md M1 defaults). */
export function normalizeAccountLabel(label: string): string {
  const trimmed = label.trim();
  if (trimmed.length === 0 || trimmed.length > LABEL_MAX_LENGTH) {
    throw new StellixError("INVALID_REQUEST", "Account label must be 1–32 characters");
  }
  return trimmed;
}

export async function readAccounts(store: KeyValueStore): Promise<AccountMeta[]> {
  const raw = await store.get<unknown>(PERSISTENT_KEYS.accounts);
  if (raw === undefined) return [];
  const parsed = accountsSchema.safeParse(raw);
  if (!parsed.success) throw new StellixError("INTERNAL_ERROR", "Stored accounts are invalid");
  return parsed.data;
}

export function writeAccounts(
  store: KeyValueStore,
  accounts: readonly AccountMeta[],
): Promise<void> {
  return store.set(PERSISTENT_KEYS.accounts, accounts);
}
