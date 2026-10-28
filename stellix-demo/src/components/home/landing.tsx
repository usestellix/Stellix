import type { ReactNode } from "react";
import { Claim, ComingSoon, Statement } from "@/components/claims";
import { ExampleTransaction } from "@/components/example-transaction";
import { FaqList } from "@/components/faq-list";
import { Screenshot } from "@/components/screenshot";
import { Section } from "@/components/section";
import { DecisionSteps, RuleCategoryGrid, ShieldLimits } from "@/components/shield-explainer";
import { TestnetNote } from "@/components/testnet-note";
import { Badge } from "@/components/ui/badge";
import { Container } from "@/components/ui/container";
import { ExternalLink } from "@/components/ui/external-link";
import { InstallButton } from "@/components/ui/install-button";
import { LinkButton } from "@/components/ui/link-button";
import { TextLink } from "@/components/ui/text-link";
import {
  PROJECT,
  RELEASE,
  SHIELD_CAPABILITIES,
  SHIELD_LAUNCHED,
  type ShieldPhase,
  type WalletCapabilityId,
} from "@/content/shield-status";
import { REPO_LINKS } from "@/content/site";

// The home page: everything someone needs to understand Stellix without leaving it. Works in both
// launch phases: it links to the inner pages only once they're published (SHIELD_LAUNCHED), and
// otherwise keeps every explanation here.

const ON_THIS_PAGE = [
  { href: "#what", label: "What it is" },
  { href: "#risk", label: "Why signing matters" },
  { href: "#how", label: "How it works" },
  { href: "#shield", label: "Shield" },
  { href: "#wallet", label: "The wallet" },
  { href: "#privacy", label: "Privacy" },
  { href: "#faq", label: "Questions" },
];

export function Landing() {
  return (
    <>
      <Hero />
      <WhatItIs />
      <WhySigningMatters />
      <HowItWorks />
      <ShieldOverview />
      <ShieldStages />
      <Wallet />
      <Privacy />
      <Questions />
      <FinalCall />
    </>
  );
}

function Hero() {
  return (
    <>
      <Container className="grid items-center gap-12 pt-16 pb-10 sm:pt-24 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
        <div>
          <h1 className="max-w-[16ch] text-h1 font-semibold text-balance">
            The Stellar wallet that shows you what you&rsquo;re signing.
          </h1>
          <p className="mt-6 max-w-(--container-prose) text-lead text-ink-2">
            <Statement id="heroWallet" />
          </p>
          <p className="mt-4 max-w-(--container-prose) text-base text-ink-2">
            <span className="font-medium text-ink">Shield: </span>
            <Statement id="heroSupport" />
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <InstallButton />
            <LinkButton href="#how" variant="secondary">
              See how it works
            </LinkButton>
          </div>
          <TestnetNote className="mt-5" />
        </div>
        <ExampleTransaction />
      </Container>
      <Container className="pb-6">
        <nav aria-label="On this page" className="border-t border-line pt-6">
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {ON_THIS_PAGE.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="text-sm text-ink-2 transition-colors duration-(--d-hover) hover:text-ink"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
    </>
  );
}

function WhatItIs() {
  return (
    <Section
      id="what"
      title="What Stellix is"
      intro="A browser extension for holding, sending and receiving XLM on the Stellar network, built around one idea: you should understand every transaction before you approve it."
    >
      <ul className="grid gap-4 md:grid-cols-3">
        <Card title="A wallet you hold yourself">
          Non-custodial means no company holds your money or your keys. Your wallet is a recovery
          phrase of 12 or 24 words, created on your device and encrypted with your password. Stellix
          Labs can&rsquo;t see, recover or move your funds.
        </Card>
        <Card title="Made for Stellar">
          Stellar is a public payment network whose native currency is XLM. Stellix handles its
          details for you: the minimum balance every account keeps in reserve, the memos exchanges
          need to credit a deposit, and addresses that start with G or M.
        </Card>
        <Card title="Built to stop costly mistakes">
          Many losses don&rsquo;t involve breaking any encryption. They come from a missing memo, a
          look-alike address, the wrong network, or a transaction that does more than it seemed to.
          Stellix is designed around catching those before you sign.
        </Card>
      </ul>
    </Section>
  );
}

function WhySigningMatters() {
  return (
    <Section
      id="risk"
      band
      title="Why signing is the risky moment"
      intro="Signing is the one step that can't be taken back. What a site tells you a transaction does and what it actually does can be two different things."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <figure className="rounded-card bg-canvas p-6 shadow-ring">
          <figcaption className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-ink">What a site tells you</span>
            <Badge>Text from the site</Badge>
          </figcaption>
          <p className="mt-6 rounded-control bg-surface px-4 py-6 text-center text-h3 font-semibold text-ink shadow-ring">
            &ldquo;Claim your 5 XLM reward&rdquo;
          </p>
          <p className="mt-4 text-sm text-muted">
            Anyone can write anything here. It isn&rsquo;t part of what gets signed.
          </p>
        </figure>
        <figure className="rounded-card bg-canvas p-6 shadow-ring">
          <figcaption className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-ink">What the transaction does</span>
            <Badge>Decoded</Badge>
          </figcaption>
          <ol className="mt-6 space-y-3">
            <li className="flex gap-3 text-sm text-ink">
              <span className="mt-0.5 shrink-0 font-mono text-label text-muted">Op 1</span>
              Sends 5 XLM from GDK4…7WQA to GBX2…M3RT.
            </li>
            <li className="flex gap-3 text-sm text-ink">
              <span className="mt-0.5 shrink-0 font-mono text-label text-muted">Op 2</span>
              Gives the signer key GCZT…H2VE a weight of 10 on GDK4…7WQA, adding it if it&rsquo;s
              new.
            </li>
          </ol>
          <p className="mt-4 text-sm text-muted">
            The second operation hands control of the account to someone else.
          </p>
        </figure>
      </div>
      <ul className="mt-10 grid gap-8 md:grid-cols-3">
        <Point title="One transaction, many operations">
          A Stellar transaction can bundle up to 100 operations. The one that matters can sit behind
          a harmless-looking payment.
        </Point>
        <Point title="A signer is a second key">
          Adding a signer to your account gives someone else the power to move your funds and change
          your account, without your recovery phrase.
        </Point>
        <Point title="There is no undo">
          Once a transaction is on the ledger, it can&rsquo;t be reversed, and nobody can step in to
          return the funds.
        </Point>
      </ul>
    </Section>
  );
}

function HowItWorks() {
  return (
    <Section
      id="how"
      title="How it works"
      intro="Three steps, with the review before you sign at the centre."
    >
      <div className="grid items-start gap-10 lg:grid-cols-[1fr_300px] lg:gap-16">
        <ol className="space-y-10">
          <NumberedStep n={1} title="Create or import your wallet">
            <p>
              Create a new wallet with a 12-word recovery phrase, or bring one you already use:
              Stellix <Claim id="import-standard" lower />.
            </p>
            <p>
              Choose a password. <Claim id="keys-on-device" />. Setup runs in its own browser tab,
              so the window can&rsquo;t close while you write your phrase down.
            </p>
          </NumberedStep>
          <NumberedStep n={2} title="Review before you sign">
            <p>
              <Claim id="review-screen" />: the destination in full, the amount, the memo, the
              network and the fee. What you approve is exactly what gets signed, and nothing else.
            </p>
            <p>
              <Statement id="reviewAddsFindings" />
            </p>
          </NumberedStep>
          <NumberedStep n={3} title="Send, receive and keep track">
            <p>
              <Claim id="send-receive" />. When an exchange needs a memo, Stellix{" "}
              <Claim id="memo-required" lower />.
            </p>
            <p>
              <Claim id="live-activity" />. Stellix <Claim id="auto-lock" lower />, so a browser
              left open doesn&rsquo;t stay unlocked.
            </p>
          </NumberedStep>
        </ol>
        <Screenshot
          src="/screenshots/review.webp"
          alt="Stellix review screen: destination address in full, type Send XLM, amount 120 XLM, memo, network fee and total, with Confirm and send."
          caption="The review screen for a payment on testnet."
        />
      </div>
      {SHIELD_LAUNCHED && (
        <LinkButton href="/how-it-works" variant="secondary" className="mt-10">
          More on how it works
        </LinkButton>
      )}
    </Section>
  );
}

function ShieldOverview() {
  return (
    <>
      <Section
        id="shield"
        band
        title="Shield: a check before every signature"
        intro="Shield reads the transaction itself, not what a site says about it, checks it on your device for known account-takeover and drain patterns, and tells you what it found and what it couldn't check."
      >
        <RuleCategoryGrid />
      </Section>
      <Section
        id="shield-decides"
        title="How Shield decides"
        intro="Shield's findings are evidence. Only the signing step can sign, and it checks the evidence again first."
      >
        <DecisionSteps />
      </Section>
      <Section
        id="shield-limits"
        title="What Shield can't do"
        intro="A tool you rely on should be clear about its limits."
      >
        <ShieldLimits />
        {SHIELD_LAUNCHED && (
          <LinkButton href="/shield" variant="secondary" className="mt-10">
            Everything about Shield
          </LinkButton>
        )}
      </Section>
    </>
  );
}

const PHASES: readonly { phase: ShieldPhase; title: string; summary: string }[] = [
  {
    phase: "S1",
    title: "Classic transactions",
    summary: "Every classic Stellar operation, decoded and checked.",
  },
  {
    phase: "S2",
    title: "Requests from sites",
    summary: "Stellar dapps can ask Stellix to sign, and every request is checked first.",
  },
  {
    phase: "S3",
    title: "Smart contracts",
    summary: "Soroban contract calls simulated, authorizations and approvals decoded.",
  },
  {
    phase: "S4",
    title: "Mainnet for sites",
    summary: "Dapp signing on the real network, after an external security review.",
  },
];

function ShieldStages() {
  return (
    <Section
      id="stages"
      band
      title="Shield is arriving in stages"
      intro="Each stage is marked available once it ships. Until then it's marked Coming soon, here and everywhere on this site."
    >
      <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {PHASES.map(({ phase, title, summary }) => {
          const capabilities = SHIELD_CAPABILITIES.filter((c) => c.phase === phase);
          const shipped = capabilities.every((c) => c.status === "shipped");
          const noneShipped = capabilities.every((c) => c.status === "coming");
          return (
            <li key={phase} className="flex flex-col rounded-card bg-canvas p-6 shadow-ring">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-label text-muted">Stage {phase.slice(1)}</span>
                {shipped ? (
                  <Badge tone="success">Available</Badge>
                ) : noneShipped ? (
                  <ComingSoon />
                ) : (
                  <Badge>Partly available</Badge>
                )}
              </div>
              <h3 className="mt-3 text-base font-semibold text-ink">{title}</h3>
              <p className="mt-2 text-sm text-ink-2">{summary}</p>
              <ul className="mt-4 space-y-2 border-t border-line pt-4">
                {capabilities.map((c) => (
                  <li key={c.id} className="flex gap-3 text-sm text-ink">
                    <span
                      aria-hidden="true"
                      className="mt-2 size-1 shrink-0 rounded-full bg-faint"
                    />
                    <span>{shipped || noneShipped ? c.claim : <Claim id={c.id} />}</span>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}

const WALLET_GROUPS: readonly { title: string; ids: readonly WalletCapabilityId[] }[] = [
  {
    title: "Keys and access",
    ids: ["keys-on-device", "import-standard", "multiple-accounts", "auto-lock"],
  },
  {
    title: "Sending",
    ids: [
      "review-screen",
      "full-address",
      "first-send-warning",
      "secret-key-block",
      "memo-required",
      "max-send",
    ],
  },
  {
    title: "Receiving and balances",
    ids: ["send-receive", "balances", "live-activity"],
  },
  {
    title: "Network",
    ids: ["network-badge", "friendbot", "custom-horizon"],
  },
];

function Wallet() {
  return (
    <Section
      id="wallet"
      title="The wallet, in the current release"
      intro={`Everything below is in version ${RELEASE.version}, the current release.`}
    >
      <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
        {WALLET_GROUPS.map((group) => (
          <div key={group.title}>
            <h3 className="text-base font-semibold text-ink">{group.title}</h3>
            <ul className="mt-4 space-y-3">
              {group.ids.map((id) => (
                <li key={id} className="flex gap-3 text-sm text-ink-2">
                  <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-faint" />
                  <span>
                    <Claim id={id} />.
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-16 grid justify-items-center gap-12 sm:grid-cols-3">
        <Screenshot
          src="/screenshots/home.webp"
          alt="Stellix home screen on testnet: total balance 10,292.5 XLM with available and reserved amounts, Send and Receive buttons, and recent activity."
          caption="Total, available and reserved balance."
        />
        <Screenshot
          src="/screenshots/receive.webp"
          alt="Stellix receive screen: the account address with a QR code and a payment request link."
          caption="Receiving with a QR code or a payment link."
        />
        <Screenshot
          src="/screenshots/activity.webp"
          alt="Stellix activity screen on testnet: a sent payment of 120 XLM and received payments, each with its memo."
          caption="Activity, with each payment's memo."
        />
      </div>
    </Section>
  );
}

function Privacy() {
  return (
    <Section
      id="privacy"
      band
      title="Privacy, plainly"
      intro="Stellix Labs runs no servers, so there is nowhere for your data to go. Here is exactly what stays and what leaves."
    >
      <ul className="grid gap-4 md:grid-cols-2">
        <Card title="Your keys stay on your device" tone="canvas">
          Your recovery phrase is stored only in an encrypted vault in the extension. Its key comes
          from your password through scrypt, a deliberately slow function, and the vault is
          encrypted with AES-256-GCM. Your password itself is never stored.
        </Card>
        <Card title="No accounts, analytics or ads" tone="canvas">
          There is no Stellix account to create, and no analytics, telemetry, crash reports or
          advertising, in the extension or on this site.
        </Card>
        <Card title="What does leave your device" tone="canvas">
          To show balances and send payments, Stellix talks directly to a public Stellar Horizon
          server. Its operator can see your IP address, the addresses you look up and the
          transactions you submit. Stellix <Claim id="custom-horizon" lower />.
        </Card>
        <Card title="Nobody from Stellix will ask for your phrase" tone="canvas">
          Stellix asks for your recovery phrase only when you choose to import a wallet, inside the
          extension. Anyone else asking for it, anywhere, is trying to take your funds.
        </Card>
      </ul>
      <p className="mt-8 text-base text-ink-2">
        Read the full <TextLink href="/privacy">privacy policy</TextLink>
        {SHIELD_LAUNCHED && (
          <>
            {" "}
            and how Stellix handles <TextLink href="/security">security</TextLink>
          </>
        )}
        .
      </p>
      {PROJECT.repoPublic && REPO_LINKS && (
        <p className="mt-3 text-base text-ink-2">
          Stellix is open source under the {PROJECT.license} licence, and every release can be
          checked against its published source.{" "}
          <ExternalLink href={REPO_LINKS.verifyRelease}>How to verify a release</ExternalLink>
        </p>
      )}
    </Section>
  );
}

function Questions() {
  return (
    <Section id="faq" title="Questions">
      <FaqList
        only={["ask-phrase", "what-phrase", "forgot-password", "testnet", "other-wallet", "data"]}
      />
      {SHIELD_LAUNCHED && (
        <LinkButton href="/faq" variant="secondary" className="mt-8">
          All questions
        </LinkButton>
      )}
    </Section>
  );
}

function FinalCall() {
  return (
    <Container className="pt-8 pb-8">
      <div className="rounded-card bg-surface p-8 shadow-ring sm:p-12">
        <h2 className="max-w-[24ch] text-h2 font-semibold text-balance">
          Know what you&rsquo;re signing before you sign it.
        </h2>
        <p className="mt-4 max-w-(--container-prose) text-base text-ink-2">
          {RELEASE.mainnet
            ? "Stellix runs entirely in your browser, with no account to create."
            : "The current release runs on the Stellar testnet, so you can try every feature with test XLM that has no value."}
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <InstallButton />
        </div>
      </div>
    </Container>
  );
}

function Card({
  title,
  tone = "surface",
  children,
}: {
  title: string;
  tone?: "surface" | "canvas";
  children: ReactNode;
}) {
  return (
    <li
      className={`rounded-card p-6 shadow-ring ${tone === "canvas" ? "bg-canvas" : "bg-surface"}`}
    >
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-base text-ink-2">{children}</p>
    </li>
  );
}

function Point({ title, children }: { title: string; children: ReactNode }) {
  return (
    <li>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-sm text-ink-2">{children}</p>
    </li>
  );
}

function NumberedStep({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[2.5rem_1fr] gap-4">
      <span
        aria-hidden="true"
        className="flex size-10 items-center justify-center rounded-full bg-surface font-mono text-sm text-ink shadow-ring"
      >
        {n}
      </span>
      <div>
        <h3 className="text-h3 font-semibold text-ink">
          <span className="sr-only">Step {n}: </span>
          {title}
        </h3>
        <div className="mt-3 space-y-3 text-base text-ink-2">{children}</div>
      </div>
    </li>
  );
}
