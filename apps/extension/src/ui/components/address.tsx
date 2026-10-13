/** "GABC…WXYZ" (UI_FLOWS §0). */
export function truncateAddress(address: string): string {
  return address.length <= 12 ? address : `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/** Full address in 4-character groups, monospace (SECURITY §6, UI_FLOWS §6). */
export function GroupedAddress({ address }: { address: string }) {
  return (
    <span className="font-mono text-xs break-all" data-testid="full-address">
      {address.match(/.{1,4}/g)?.join(" ")}
    </span>
  );
}
