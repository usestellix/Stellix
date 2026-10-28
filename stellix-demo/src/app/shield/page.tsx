import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import { CapabilityList, Statement } from "@/components/claims";
import { PageHeader, Section } from "@/components/section";
import { DecisionSteps, RuleCategoryGrid, ShieldLimits } from "@/components/shield-explainer";
import { TestnetNote } from "@/components/testnet-note";
import { Container } from "@/components/ui/container";
import { InstallButton } from "@/components/ui/install-button";
import { TextLink } from "@/components/ui/text-link";

export const metadata: Metadata = pageMetadata({
  title: "Shield",
  description:
    "Shield is Stellix's review before you sign: what it checks, how it decides, why it runs on your device, and what it can't do.",
  path: "/shield",
});

export default function ShieldPage() {
  return (
    <>
      <PageHeader
        title="See what a transaction does before you sign it."
        lead="Shield is Stellix's review before you sign. It reads the transaction itself, not what a site says about it, checks it for known account-takeover and drain patterns, and tells you what it found and what it couldn't check."
      />

      <Section id="release" title="In this release">
        <div className="max-w-(--container-prose)">
          <CapabilityList />
        </div>
      </Section>

      <Section
        id="checks"
        title="What it checks"
        intro="Each check has a severity. The most serious finding decides what happens next."
      >
        <RuleCategoryGrid />
      </Section>

      <Section
        id="decides"
        title="How it decides"
        intro="Shield's findings are evidence. Only the signing step can sign, and it checks the evidence again first."
      >
        <DecisionSteps />
      </Section>

      <Section id="on-device" title="Why it runs on your device">
        <div className="max-w-(--container-prose) space-y-4 text-base text-ink-2">
          <p>
            Your transactions aren&rsquo;t sent to a Stellix server or a third-party scanning
            service: there isn&rsquo;t one. Shield runs inside the extension.
          </p>
          <p>
            To check a transaction it reads public data: your account, the order book and payment
            routes from the Horizon server the wallet already uses, and, when a transaction adds an
            asset, the issuer&rsquo;s own website to see whether it lists that asset.
          </p>
          <p>
            <Statement id="sorobanLookups" />
          </p>
          <p>
            Every server Stellix contacts is listed in the{" "}
            <TextLink href="/privacy">privacy policy</TextLink> before the release that uses it
            ships.
          </p>
        </div>
      </Section>

      <Section id="limits" title="What Shield can't do">
        <ShieldLimits />
      </Section>

      <Container className="pb-8">
        <div className="flex flex-col items-start gap-4 rounded-card bg-surface p-8 shadow-ring sm:p-12">
          <InstallButton />
          <TestnetNote />
        </div>
      </Container>
    </>
  );
}
