import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import type { ReactNode } from "react";
import { Claim } from "@/components/claims";
import { PageHeader, Section } from "@/components/section";
import { ExternalLink } from "@/components/ui/external-link";
import { TextLink } from "@/components/ui/text-link";
import { REPO_LINKS } from "@/content/site";

export const metadata: Metadata = pageMetadata({
  title: "Security",
  description:
    "How Stellix stores your recovery phrase, what the Horizon server sees, how to verify a release, and how to report a vulnerability.",
  path: "/security",
});

// Facts from the extension repo: docs/SECURITY.md, docs/KEY_MANAGEMENT.md, PRIVACY.md and
// docs/VERIFY_RELEASE.md.
export default function SecurityPage() {
  return (
    <>
      <PageHeader
        title="Security"
        lead="Where your recovery phrase lives, what leaves your device, and how to check a release yourself."
      />

      <Section id="vault" title="Your recovery phrase stays on your device">
        <Prose>
          <p>
            <Claim id="keys-on-device" />. It lives only in an encrypted vault in the
            extension&rsquo;s own storage.
          </p>
          <p>
            The vault&rsquo;s key comes from your password through scrypt, a deliberately slow
            key-derivation function, and the vault is encrypted with AES-256-GCM. Without your
            password, it can&rsquo;t be read. Your password itself is never stored.
          </p>
          <p>
            While the wallet is unlocked, a key derived from your password sits in the
            browser&rsquo;s in-memory session storage. Locking the wallet, the auto-lock timer or
            closing the browser clears it.
          </p>
          <p>
            Signing happens inside the extension&rsquo;s background process. The screens you click
            never hold your keys.
          </p>
        </Prose>
      </Section>

      <Section id="no-server" title="There is no Stellix server">
        <Prose>
          <p>
            Stellix Labs runs no servers. There are no accounts, analytics, telemetry, crash reports
            or ads, so there is nowhere to send your data. Stellix Labs can&rsquo;t see, recover or
            move your funds.
          </p>
        </Prose>
      </Section>

      <Section id="horizon" title="What the Horizon operator sees">
        <Prose>
          <p>
            To show balances and history and to send payments, Stellix talks directly to a public
            Stellar Horizon server. On testnet, the default is the Stellar Development
            Foundation&rsquo;s server. Its operator can see your IP address, the account addresses
            you look up and the transactions you submit.
          </p>
          <p>
            You can choose another Horizon server in Settings; its operator then sees this instead.
            Stellar is a public blockchain, so every transaction you send or receive is permanently
            public, whichever wallet you use.
          </p>
          <p>
            The <TextLink href="/privacy">privacy policy</TextLink> lists everything that leaves
            your device and who receives it.
          </p>
        </Prose>
      </Section>

      {REPO_LINKS && (
        <Section id="verify" title="Verify a release">
          <Prose>
            <p>
              Releases are built only in CI from a tagged commit, and the build is reproducible: the
              same commit always produces the same file. Each GitHub release lists the SHA-256 of
              the store zip and of every file in it, so you can check that the copy the Chrome Web
              Store serves, and the copy installed in your browser, match the published source.
            </p>
            <p>
              <ExternalLink href={REPO_LINKS.verifyRelease}>
                Step-by-step verification instructions
              </ExternalLink>
            </p>
          </Prose>
        </Section>
      )}

      <Section id="report" title="Report a vulnerability">
        <Prose>
          {REPO_LINKS ? (
            <>
              <p>
                Please report security issues privately through GitHub&rsquo;s{" "}
                <strong className="font-semibold text-ink">Report a vulnerability</strong> form on
                the Stellix repository, not in a public issue.
              </p>
              <p>
                <ExternalLink href={REPO_LINKS.reportVulnerability}>
                  Report a vulnerability
                </ExternalLink>
              </p>
            </>
          ) : (
            <p>
              Private reporting through GitHub opens when the source code is published. It will be
              linked here.
            </p>
          )}
          <p>
            If a release ever fails verification, don&rsquo;t enter your recovery phrase or
            password, and report it.
          </p>
        </Prose>
      </Section>
    </>
  );
}

function Prose({ children }: { children: ReactNode }) {
  return <div className="max-w-(--container-prose) space-y-4 text-base text-ink-2">{children}</div>;
}
