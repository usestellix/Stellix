import { base64 } from "@scure/base";

export function toBase64(bytes: Uint8Array): string {
  return base64.encode(bytes);
}

/** Strict padded base64. Throws on malformed input. */
export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(base64.decode(text));
}

export function isBase64OfLength(text: string, bytes: number): boolean {
  try {
    return fromBase64(text).length === bytes;
  } catch {
    return false;
  }
}

export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}
