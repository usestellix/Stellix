import { z } from "zod";
import { isBase64OfLength } from "./encoding.js";
import { SCRYPT_BOUNDS, isAllowedScryptParams } from "./kdf.js";

// VaultV1 format (KEY_MANAGEMENT §4.1). Stored at persistent["vault"].

export const IV_BYTES = 12;
const GCM_TAG_BYTES = 16;

const kdfSchema = z
  .strictObject({
    name: z.literal("scrypt"),
    N: z.number().int(),
    r: z.number().int(),
    p: z.number().int(),
    dkLen: z.number().int(),
    salt: z.string().refine((s) => isBase64OfLength(s, SCRYPT_BOUNDS.saltBytes)),
  })
  .refine(isAllowedScryptParams);

export const vaultV1Schema = z.strictObject({
  version: z.literal(1),
  kdf: kdfSchema,
  cipher: z.strictObject({
    name: z.literal("AES-GCM"),
    iv: z.string().refine((s) => isBase64OfLength(s, IV_BYTES)),
  }),
  ciphertext: z.base64().refine((s) => s.length >= Math.ceil(GCM_TAG_BYTES / 3) * 4),
});

export type VaultV1 = z.output<typeof vaultV1Schema>;

export const vaultPlaintextSchema = z.strictObject({
  type: z.literal("mnemonic"),
  mnemonic: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
});

export type VaultPlaintext = z.output<typeof vaultPlaintextSchema>;
