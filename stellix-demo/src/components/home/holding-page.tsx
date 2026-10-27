import Link from "next/link";
import { TestnetNote } from "@/components/testnet-note";
import { Container } from "@/components/ui/container";
import { InstallButton } from "@/components/ui/install-button";

// Phase 1: name, one line, install, testnet note. Live before the store listing so the listing
// can point at /privacy.
export function HoldingPage() {
  return (
    <Container className="py-24 sm:py-32">
      <h1 className="text-h1 font-semibold">Stellix</h1>
      <p className="mt-6 max-w-(--container-prose) text-lead text-ink-2">
        A non-custodial Stellar wallet for your browser.
      </p>
      <div className="mt-10 flex flex-col items-start gap-4">
        <InstallButton />
        <TestnetNote />
        <Link
          href="/privacy"
          className="text-sm font-medium text-ink underline decoration-line-strong underline-offset-4 transition-[text-decoration-color] duration-(--d-hover) hover:decoration-ink"
        >
          Privacy policy
        </Link>
      </div>
    </Container>
  );
}
