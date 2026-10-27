import { TestnetNote } from "@/components/testnet-note";
import { Container } from "@/components/ui/container";
import { InstallButton } from "@/components/ui/install-button";
import { TextLink } from "@/components/ui/text-link";

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
        <p className="text-sm">
          <TextLink href="/privacy">Privacy policy</TextLink>
        </p>
      </div>
    </Container>
  );
}
