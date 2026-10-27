import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/section";
import { Container } from "@/components/ui/container";
import { TextLink } from "@/components/ui/text-link";
import { RELEASE } from "@/content/shield-status";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Recovery phrases, lost passwords, testnet and mainnet, and whether Stellix will ever ask for your phrase.",
};

export default function FaqPage() {
  return (
    <>
      <PageHeader title="Questions" />
      <Container className="py-12">
        <div className="max-w-(--container-prose) divide-y divide-line border-y border-line">
          <Item question="Will Stellix ever ask for my recovery phrase?" open>
            <p>
              No. Stellix asks for it only when you choose to import a wallet, inside the extension.
              Nobody from Stellix will ever ask for it by email, chat, social media or on a website.
              Anyone who does is trying to take your funds.
            </p>
          </Item>
          <Item question="What is a recovery phrase?">
            <p>
              The 12 or 24 words that are your wallet. Anyone who has them can take your funds from
              any wallet, without your password. Write them down and keep them offline.
            </p>
          </Item>
          <Item question="I forgot my password. What can I do?">
            <p>
              Stellix can&rsquo;t recover it: it isn&rsquo;t stored anywhere. Remove and reinstall
              the extension, then import your recovery phrase and choose a new password.
            </p>
          </Item>
          <Item question="I lost my recovery phrase.">
            <p>
              If you still know your password, open Settings and choose Reveal recovery phrase, then
              write it down. If you&rsquo;ve lost both your password and your recovery phrase,
              nobody can restore your wallet, including Stellix Labs.
            </p>
          </Item>
          <Item question="What's the difference between testnet and mainnet?">
            <p>
              Mainnet is the real Stellar network, where XLM has value. Testnet is a copy for trying
              things out: test XLM is free from the Friendbot faucet and worth nothing.
            </p>
            {RELEASE.mainnet ? (
              <p>
                Stellix starts on testnet. Switching to mainnet takes an explicit confirmation, and
                the current network is always shown at the top of the wallet.
              </p>
            ) : (
              <p>
                The current release works on testnet only. Mainnet comes in a later release, after
                an external security review.
              </p>
            )}
          </Item>
          <Item question="Can I use a recovery phrase from another wallet?">
            <p>
              Yes. Stellix imports 12- and 24-word phrases and finds the same accounts as other
              wallets that follow SEP-0005, the standard most Stellar wallets use.
            </p>
          </Item>
          <Item question="Does Stellix collect any data?">
            <p>
              No. Stellix Labs runs no servers and has no analytics. The Horizon server the wallet
              talks to can see your IP address and the account addresses you use; the{" "}
              <TextLink href="/privacy">privacy policy</TextLink> has the details.
            </p>
          </Item>
          <Item question="What can't Shield do?">
            <p>
              It won&rsquo;t catch every malicious request, and it can&rsquo;t see what you sign in
              other wallets. <TextLink href="/shield#limits">Shield&rsquo;s limits</TextLink>{" "}
              explains each one.
            </p>
          </Item>
        </div>
      </Container>
    </>
  );
}

// Native disclosure: keyboard and screen-reader behaviour come from the browser. The answer fades
// in; nothing animates height.
function Item({
  question,
  open = false,
  children,
}: {
  question: string;
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="faq group" open={open}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-lead font-medium text-ink [&::-webkit-details-marker]:hidden">
        {question}
        <span
          aria-hidden="true"
          className="relative size-4 shrink-0 before:absolute before:inset-x-0 before:top-1/2 before:h-[1.5px] before:-translate-y-1/2 before:bg-current after:absolute after:inset-y-0 after:left-1/2 after:w-[1.5px] after:-translate-x-1/2 after:bg-current group-open:after:hidden"
        />
      </summary>
      <div className="faq-answer space-y-3 pb-6 text-base text-ink-2">{children}</div>
    </details>
  );
}
