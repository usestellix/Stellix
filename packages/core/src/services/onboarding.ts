import { z } from "zod";
import { defaultAccountLabel, writeAccounts, type AccountMeta } from "../accounts.js";
import { StellixError } from "../errors.js";
import { derivePublicKey, mnemonicToSeed } from "../keys/derive.js";
import type { HorizonClient } from "../network/horizon-client.js";
import {
  CREATE_WORD_COUNT,
  generateMnemonic,
  normalizeMnemonic,
  parseMnemonic,
} from "../keys/mnemonic.js";
import { assertPasswordPolicy } from "../password.js";
import type { Platform } from "../platform.js";
import { randomDistinct } from "../random.js";
import { PERSISTENT_KEYS, SESSION_KEYS } from "../storage-keys.js";
import { DEFAULT_SCRYPT_PARAMS, type ScryptParams } from "../vault/kdf.js";
import { createVault } from "../vault/vault.js";
import { discoverUsedIndices } from "./discovery.js";
import { startSession } from "./session.js";

// Create / import flows (KEY_MANAGEMENT §7.1–7.2).

export type OnboardingPlatform = Pick<Platform, "persistent" | "session" | "now">;

export const VERIFY_WORD_COUNT = 3;
export const ONBOARDING_TTL_MS = 30 * 60_000;

export interface OnboardingOptions {
  /** Tests only pass a lower N (still within SCRYPT_BOUNDS); production uses the default. */
  scryptParams?: ScryptParams;
  /** Horizon for the selected network. Import runs discovery with it; without it, index 0 only. */
  horizon?: HorizonClient;
}

export interface ImportResult {
  accounts: AccountMeta[];
  /** A network error cut discovery short (KEY_MANAGEMENT §3: onboarding still completes). */
  discoveryIncomplete: boolean;
}

const pendingSchema = z.strictObject({
  mnemonic: z.string().min(1),
  verifyPositions: z
    .array(
      z
        .number()
        .int()
        .min(0)
        .max(CREATE_WORD_COUNT - 1),
    )
    .length(VERIFY_WORD_COUNT),
  createdAt: z.number().int(),
});

type PendingOnboarding = z.output<typeof pendingSchema>;

/** 0-based word positions the user must re-enter. */
export interface VerifyAnswer {
  position: number;
  word: string;
}

/**
 * ONBOARD_GENERATE: new phrase plus 3 verification positions chosen here with
 * crypto.getRandomValues. Held in session storage until create completes, expires, or lock.
 * Calling again replaces any earlier pending phrase.
 */
export async function startOnboarding(
  platform: OnboardingPlatform,
): Promise<{ words: string[]; verifyPositions: number[] }> {
  await assertNoVault(platform);
  const mnemonic = generateMnemonic();
  const verifyPositions = randomDistinct(VERIFY_WORD_COUNT, CREATE_WORD_COUNT);
  const pending: PendingOnboarding = { mnemonic, verifyPositions, createdAt: platform.now() };
  await platform.session.set(SESSION_KEYS.pendingOnboarding, pending);
  return { words: mnemonic.split(" "), verifyPositions };
}

/** ONBOARD_CREATE: checks the user's answers against the pending phrase, then creates the wallet. */
export async function createWallet(
  platform: OnboardingPlatform,
  input: { password: string; answers: readonly VerifyAnswer[] },
  options: OnboardingOptions = {},
): Promise<AccountMeta[]> {
  await assertNoVault(platform);
  const pending = await readPending(platform);
  assertPasswordPolicy(input.password);
  if (!answersMatch(pending, input.answers)) {
    throw new StellixError("VERIFICATION_FAILED", "Verification words do not match");
  }
  const accounts = await setUpWallet(platform, pending.mnemonic, input.password, [0], options);
  await platform.session.remove(SESSION_KEYS.pendingOnboarding);
  return accounts;
}

/**
 * ONBOARD_IMPORT: the SW validates again (never trusts UI validation), then discovers previously
 * used accounts on the selected network (KEY_MANAGEMENT §3) before anything is written.
 */
export async function importWallet(
  platform: OnboardingPlatform,
  input: { mnemonic: string; password: string },
  options: OnboardingOptions = {},
): Promise<ImportResult> {
  await assertNoVault(platform);
  const mnemonic = parseMnemonic(input.mnemonic);
  assertPasswordPolicy(input.password);

  let indices = [0];
  let discoveryIncomplete = false;
  if (options.horizon !== undefined) {
    const result = await discoverUsedIndices(
      (batch) => derivePublicKeys(mnemonic, batch),
      options.horizon,
    );
    indices = result.indices;
    discoveryIncomplete = result.incomplete;
  }
  const accounts = await setUpWallet(platform, mnemonic, input.password, indices, options);
  return { accounts, discoveryIncomplete };
}

/** Derives public keys for `indices`; the seed is zeroed before this returns. */
export async function derivePublicKeys(
  mnemonic: string,
  indices: readonly number[],
): Promise<string[]> {
  const seed = await mnemonicToSeed(mnemonic);
  try {
    return indices.map((index) => derivePublicKey(seed, index));
  } finally {
    seed.fill(0);
  }
}

/**
 * Writes accounts first and the vault last, so a worker killed midway never leaves a vault
 * without accounts. Vault presence is what "wallet exists" means.
 */
async function setUpWallet(
  platform: OnboardingPlatform,
  mnemonic: string,
  password: string,
  indices: readonly number[],
  options: OnboardingOptions,
): Promise<AccountMeta[]> {
  const publicKeys = await derivePublicKeys(mnemonic, indices);
  const accounts: AccountMeta[] = indices.map((index, i) => ({
    index,
    publicKey: publicKeys[i] ?? "",
    label: defaultAccountLabel(index),
  }));

  const { vault, key } = await createVault(
    { type: "mnemonic", mnemonic, createdAt: platform.now() },
    password,
    options.scryptParams ?? DEFAULT_SCRYPT_PARAMS,
  );
  try {
    await writeAccounts(platform.persistent, accounts);
    await platform.persistent.set(PERSISTENT_KEYS.activeAccountIndex, 0);
    await platform.persistent.set(PERSISTENT_KEYS.vault, vault);
    await startSession(platform, key);
  } finally {
    key.fill(0);
  }
  return accounts;
}

async function assertNoVault(platform: OnboardingPlatform): Promise<void> {
  if ((await platform.persistent.get<unknown>(PERSISTENT_KEYS.vault)) !== undefined) {
    throw new StellixError("INVALID_REQUEST", "A wallet already exists");
  }
}

async function readPending(platform: OnboardingPlatform): Promise<PendingOnboarding> {
  const parsed = pendingSchema.safeParse(
    await platform.session.get<unknown>(SESSION_KEYS.pendingOnboarding),
  );
  if (!parsed.success || platform.now() - parsed.data.createdAt > ONBOARDING_TTL_MS) {
    await platform.session.remove(SESSION_KEYS.pendingOnboarding);
    throw new StellixError("ONBOARDING_EXPIRED", "Onboarding session expired");
  }
  return parsed.data;
}

/** Answers must cover exactly the challenged positions; checks every answer (no early exit). */
function answersMatch(pending: PendingOnboarding, answers: readonly VerifyAnswer[]): boolean {
  const words = pending.mnemonic.split(" ");
  const asked = [...pending.verifyPositions].sort((a, b) => a - b);
  const given = answers.map((a) => a.position).sort((a, b) => a - b);
  let ok = asked.length === given.length && asked.every((p, i) => p === given[i]);
  for (const { position, word } of answers) {
    if (normalizeMnemonic(word) !== words[position]) ok = false;
  }
  return ok;
}
