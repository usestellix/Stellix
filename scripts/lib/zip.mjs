// Minimal ZIP reader for release verification (no dependencies, so anyone can audit it).
// Reads the central directory and inflates entries with node:zlib. Supports what extension
// packages use: stored (0) and deflate (8) entries, no encryption, no ZIP64.
import { inflateRawSync } from "node:zlib";

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

/** @param {Buffer} buf @returns {Map<string, Buffer>} path → file bytes (directories skipped) */
export function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip: end of central directory not found");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  /** @type {Map<string, Buffer>} */
  const files = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== CENTRAL) throw new Error("corrupt central directory");
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const compressed = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    p += 46 + nameLen + extraLen + commentLen;
    if (flags & 1) throw new Error(`${name}: encrypted entries are not supported`);
    if (compressed === 0xffffffff) throw new Error(`${name}: ZIP64 is not supported`);
    if (name.endsWith("/")) continue;
    if (name.split("/").some((part) => part === ".." || part === "") || name.startsWith("/"))
      throw new Error(`${name}: unsafe path`);
    if (buf.readUInt32LE(local) !== LOCAL) throw new Error(`${name}: corrupt local header`);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + compressed);
    if (method === 0) files.set(name, Buffer.from(data));
    else if (method === 8) files.set(name, inflateRawSync(data));
    else throw new Error(`${name}: compression method ${String(method)} is not supported`);
  }
  return files;
}

/**
 * A CRX3 package is a header followed by a plain zip. Returns the zip part; a buffer that
 * already is a zip is returned as is.
 * @param {Buffer} buf
 */
export function crxToZip(buf) {
  if (buf.subarray(0, 4).toString("latin1") !== "Cr24") return buf;
  const version = buf.readUInt32LE(4);
  if (version !== 3) throw new Error(`unsupported CRX version ${String(version)}`);
  return buf.subarray(12 + buf.readUInt32LE(8));
}
