import { RELEASE } from "@/content/shield-status";

// The release's network, driven by status: disappears once mainnet ships.
export function TestnetNote({ className = "" }: { className?: string }) {
  if (RELEASE.mainnet) return null;
  return (
    <p className={`text-sm text-muted ${className}`}>
      The current release works on the Stellar testnet only. Test XLM has no value.
    </p>
  );
}
