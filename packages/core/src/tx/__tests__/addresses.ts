import { Account, Keypair, MuxedAccount } from "@stellar/stellar-sdk/base";

/** Fresh, checksum-valid addresses for tests (not derivation vectors). */
export function testAddresses() {
  const source = Keypair.random();
  const dest = Keypair.random();
  const muxedDest = new MuxedAccount(new Account(dest.publicKey(), "0"), "4242").accountId();
  const muxedSelf = new MuxedAccount(new Account(source.publicKey(), "0"), "7").accountId();
  return { source, dest, muxedDest, muxedSelf };
}
