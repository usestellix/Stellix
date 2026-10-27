import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CapabilityList, ComingSoon, Statement } from "@/components/claims";
import { PageHeader, Section } from "@/components/section";
import { TestnetNote } from "@/components/testnet-note";
import { Container } from "@/components/ui/container";
import { InstallButton } from "@/components/ui/install-button";
import { TextLink } from "@/components/ui/text-link";
import { RULE_CATEGORIES } from "@/content/rules";
import { isShipped } from "@/content/shield-status";

export const metadata: Metadata = {
  title: "Shield",
  description:
    "Shield is Stellix's review before you sign: what it checks, how it decides, why it runs on your device, and what it can't do.",
};

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
        <ul className="grid gap-4 md:grid-cols-2">
          {RULE_CATEGORIES.map((category) => (
            <li key={category.id} className="rounded-card bg-surface p-6 shadow-ring">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-ink">{category.title}</h3>
                {!isShipped(category.capability) && <ComingSoon />}
              </div>
              <p className="mt-2 text-sm text-ink-2">{category.description}</p>
              <ul className="mt-4 space-y-2 border-t border-line pt-4">
                {category.checks.map((check) => (
                  <li key={check} className="flex gap-3 text-sm text-ink">
                    <span
                      aria-hidden="true"
                      className="mt-2 size-1 shrink-0 rounded-full bg-faint"
                    />
                    {check}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="decides"
        title="How it decides"
        intro="Shield's findings are evidence. Only the signing step can sign, and it checks the evidence again first."
      >
        <ol className="grid gap-4 md:grid-cols-3">
          <Step n={1} title="Evidence">
            Shield decodes the transaction and runs every check. Each finding has a severity and a
            plain-language explanation. A check that couldn&rsquo;t run is listed as not checked.
          </Step>
          <Step n={2} title="Policy">
            The most serious finding decides: findings are never averaged. Some need you to confirm,
            some need you to type CONFIRM, and some block the signature. A check that couldn&rsquo;t
            run always needs your review.
          </Step>
          <Step n={3} title="Signing">
            Right before signing, Stellix confirms the transaction is exactly the one Shield
            analyzed, on the same network, and that the analysis hasn&rsquo;t expired. Any change
            sends it back to be checked again.
          </Step>
        </ol>
        <p className="mt-8 max-w-(--container-prose) text-base text-ink-2">
          <Statement id="dappBlocksHaveNoOverride" />
        </p>
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
        <ul className="max-w-(--container-prose) space-y-6">
          <Limit title="It won't catch every malicious request.">
            Shield looks for known patterns. A new trick may not match any of them, so read what
            Shield shows you, not only whether it flagged something.
          </Limit>
          <Limit title="It can't see signatures you make in other wallets.">
            No Stellar wallet lets another one check what it&rsquo;s about to sign.{" "}
            <Statement id="analyzeAnything" />
          </Limit>
          <Limit title="An unavailable check is shown as unavailable.">
            If Shield can&rsquo;t complete a check, for example because a server didn&rsquo;t
            answer, it says which check didn&rsquo;t run. It never counts it as passed.
          </Limit>
          <Limit title="Analyzing never signs.">
            A pasted transaction is only read. Shield reports what Stellix would do if asked to sign
            it, and nothing is signed.
          </Limit>
        </ul>
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

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="rounded-card bg-surface p-6 shadow-ring">
      <p className="font-mono text-label text-muted">{n}</p>
      <h3 className="mt-2 text-base font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-sm text-ink-2">{children}</p>
    </li>
  );
}

function Limit({ title, children }: { title: string; children: ReactNode }) {
  return (
    <li>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <p className="mt-1 text-base text-ink-2">{children}</p>
    </li>
  );
}
