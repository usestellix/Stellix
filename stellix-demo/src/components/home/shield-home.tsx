import type { ReactNode } from "react";
import { CapabilityList, Claim, Statement } from "@/components/claims";
import { ExampleTransaction } from "@/components/example-transaction";
import { Screenshot } from "@/components/screenshot";
import { Section } from "@/components/section";
import { TestnetNote } from "@/components/testnet-note";
import { Container } from "@/components/ui/container";
import { ExternalLink } from "@/components/ui/external-link";
import { InstallButton } from "@/components/ui/install-button";
import { LinkButton } from "@/components/ui/link-button";
import { PROJECT } from "@/content/shield-status";
import { REPO_LINKS } from "@/content/site";

// Phase 2: Shield-first home.
export function ShieldHome() {
  return (
    <>
      <Container className="grid items-center gap-12 pt-16 pb-8 sm:pt-24 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
        <div>
          <h1 className="max-w-[16ch] text-h1 font-semibold text-balance">
            The Stellar wallet that shows you what you&rsquo;re signing.
          </h1>
          <p className="mt-6 max-w-(--container-prose) text-lead text-ink-2">
            <Statement id="heroSupport" />
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <InstallButton />
            <LinkButton href="/shield" variant="secondary">
              How Shield works
            </LinkButton>
          </div>
          <TestnetNote className="mt-5" />
        </div>
        <ExampleTransaction />
      </Container>

      <Section id="why" title="Why Stellix">
        <ul className="grid gap-4 md:grid-cols-3">
          <ProofPoint title="Checks run on your device">
            <Statement id="proofOnDevice" />
          </ProofPoint>
          <ProofPoint title="Your keys never leave it">
            <Claim id="keys-on-device" />.
          </ProofPoint>
          {PROJECT.repoPublic && REPO_LINKS && (
            <ProofPoint title="Open source, reproducible builds">
              Every release is built in CI from public, tagged source, and you can check that the
              copy you installed matches it.{" "}
              <ExternalLink href={REPO_LINKS.verifyRelease}>How to verify</ExternalLink>
            </ProofPoint>
          )}
        </ul>
      </Section>

      <Section
        id="shield"
        title="What Shield checks"
        intro="Shield is Stellix's review before you sign. It's arriving in stages; each item shows whether it's in the current release."
      >
        <div className="max-w-(--container-prose)">
          <CapabilityList />
          <LinkButton href="/shield" variant="secondary" className="mt-6">
            Everything Shield checks
          </LinkButton>
        </div>
      </Section>

      <Section id="wallet" title="Also a wallet" intro="Send and receive XLM with the same care.">
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-3">
          <Screenshot
            src="/screenshots/review.png"
            alt="Stellix review screen: destination address in full, type Send XLM, amount 120 XLM, memo, network fee and total, with Confirm and send."
            caption={<Claim id="review-screen" />}
          />
          <Screenshot
            src="/screenshots/home.png"
            alt="Stellix home screen on testnet: total balance 10,292.5 XLM with available and reserved amounts, Send and Receive buttons, and recent activity."
            caption={<Claim id="keys-on-device" />}
          />
          <Screenshot
            src="/screenshots/receive.png"
            alt="Stellix receive screen: the account address with a QR code and a payment request link."
            caption={<Claim id="send-receive" />}
          />
        </div>
        <ul className="mt-12 grid gap-3 text-base text-ink-2 sm:grid-cols-2">
          <li>
            <Claim id="memo-required" />.
          </li>
          <li>
            <Claim id="auto-lock" />.
          </li>
        </ul>
      </Section>

      <Container className="pb-8">
        <div className="rounded-card bg-surface p-8 shadow-ring sm:p-12">
          <h2 className="text-h3 font-semibold">
            See what you&rsquo;re signing before you sign it.
          </h2>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <InstallButton />
            <TestnetNote />
          </div>
        </div>
      </Container>
    </>
  );
}

function ProofPoint({ title, children }: { title: string; children: ReactNode }) {
  return (
    <li className="rounded-card bg-surface p-6 shadow-ring">
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-base text-ink-2">{children}</p>
    </li>
  );
}
