import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import type { ReactNode } from "react";
import { Claim, Statement } from "@/components/claims";
import { PageHeader } from "@/components/section";
import { Screenshot } from "@/components/screenshot";
import { TestnetNote } from "@/components/testnet-note";
import { Container } from "@/components/ui/container";
import { InstallButton } from "@/components/ui/install-button";
import { LinkButton } from "@/components/ui/link-button";

export const metadata: Metadata = pageMetadata({
  title: "How it works",
  description:
    "Create or import a wallet, review exactly what you're about to sign, then send and receive XLM.",
  path: "/how-it-works",
});

export default function HowItWorksPage() {
  return (
    <>
      <PageHeader
        title="Everything leads to one moment: reviewing what you sign."
        lead="Stellix is built around the review before you sign. Here is how a wallet gets there."
      />
      <Container className="py-16">
        <ol className="space-y-6">
          <StepCard n={1} title="Create or import your wallet">
            <p>
              Create a new wallet with a 12-word recovery phrase, or import one you already use (12
              or 24 words). You get the same accounts as in other standard Stellar wallets.
            </p>
            <p>
              Then choose a password. <Claim id="keys-on-device" />.
            </p>
            <p>
              Stellix can&rsquo;t recover your password. Your recovery phrase is the only way back
              in, so write it down and keep it offline.
            </p>
          </StepCard>

          <StepCard
            n={2}
            title="Review before you sign"
            featured
            media={
              <Screenshot
                src="/screenshots/review.png"
                alt="Stellix review screen: destination address in full, type Send XLM, amount 120 XLM, memo, network fee and total, with Confirm and send."
                caption="The review screen for a payment on testnet."
                priority
              />
            }
          >
            <p>
              <Claim id="review-screen" />: the destination in full, the amount, the memo, the
              network and the fee. What you approve is what gets signed.
            </p>
            <ul className="space-y-3 border-t border-line pt-4">
              <li>
                <Statement id="reviewAddsFindings" />
              </li>
              <li>
                <Statement id="analyzeAnything" />
              </li>
              <li>
                <Statement id="dappsChecked" />
              </li>
            </ul>
            <div>
              <LinkButton href="/shield" variant="secondary" size="sm">
                What Shield checks
              </LinkButton>
            </div>
          </StepCard>

          <StepCard
            n={3}
            title="Send and receive"
            media={
              <Screenshot
                src="/screenshots/receive.png"
                alt="Stellix receive screen: the account address with a QR code and a payment request link."
                caption="Receiving with a QR code and a payment link."
              />
            }
          >
            <p>
              <Claim id="send-receive" />.
            </p>
            <p>
              <Claim id="memo-required" />. Exchanges use the memo to credit your deposit, and a
              payment without it can be lost.
            </p>
            <p>
              <Claim id="auto-lock" />, so a browser left open doesn&rsquo;t stay unlocked.
            </p>
          </StepCard>
        </ol>
      </Container>
      <Container className="pb-8">
        <div className="flex flex-col items-start gap-4 rounded-card bg-surface p-8 shadow-ring sm:p-12">
          <InstallButton />
          <TestnetNote />
        </div>
      </Container>
    </>
  );
}

function StepCard({
  n,
  title,
  featured = false,
  media,
  children,
}: {
  n: number;
  title: string;
  featured?: boolean;
  media?: ReactNode;
  children: ReactNode;
}) {
  return (
    <li
      className={`grid gap-10 rounded-card p-6 sm:p-10 ${media ? "lg:grid-cols-[1fr_300px] lg:items-center" : ""} ${
        featured ? "bg-surface shadow-raised" : "bg-surface shadow-ring"
      }`}
    >
      <div>
        <p className="font-mono text-label text-muted">Step {n}</p>
        <h2 className={`mt-2 font-semibold ${featured ? "text-h2" : "text-h3"}`}>{title}</h2>
        <div className="mt-4 max-w-(--container-prose) space-y-4 text-base text-ink-2">
          {children}
        </div>
      </div>
      {media}
    </li>
  );
}
