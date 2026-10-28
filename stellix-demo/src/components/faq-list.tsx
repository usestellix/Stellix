import type { ReactNode } from "react";
import { TextLink } from "@/components/ui/text-link";
import { RELEASE, SHIELD_LAUNCHED } from "@/content/shield-status";

// The FAQ, shared by /faq (all of it) and the home page (a selection).

export type FaqId =
  | "ask-phrase"
  | "what-phrase"
  | "forgot-password"
  | "lost-phrase"
  | "testnet"
  | "other-wallet"
  | "data"
  | "shield-limits";

// Before Shield launches /shield isn't published; its limits are on the home page.
const SHIELD_LIMITS_HREF = SHIELD_LAUNCHED ? "/shield#limits" : "/#shield-limits";

const ENTRIES: readonly { id: FaqId; question: string; answer: ReactNode }[] = [
  {
    id: "ask-phrase",
    question: "Will Stellix ever ask for my recovery phrase?",
    answer: (
      <p>
        No. Stellix asks for it only when you choose to import a wallet, inside the extension.
        Nobody from Stellix will ever ask for it by email, chat, social media or on a website.
        Anyone who does is trying to take your funds.
      </p>
    ),
  },
  {
    id: "what-phrase",
    question: "What is a recovery phrase?",
    answer: (
      <p>
        The 12 or 24 words that are your wallet. Anyone who has them can take your funds from any
        wallet, without your password. Write them down and keep them offline.
      </p>
    ),
  },
  {
    id: "forgot-password",
    question: "I forgot my password. What can I do?",
    answer: (
      <p>
        Stellix can&rsquo;t recover it: it isn&rsquo;t stored anywhere. Remove and reinstall the
        extension, then import your recovery phrase and choose a new password.
      </p>
    ),
  },
  {
    id: "lost-phrase",
    question: "I lost my recovery phrase.",
    answer: (
      <p>
        If you still know your password, open Settings and choose Reveal recovery phrase, then write
        it down. If you&rsquo;ve lost both your password and your recovery phrase, nobody can
        restore your wallet, including Stellix Labs.
      </p>
    ),
  },
  {
    id: "testnet",
    question: "What's the difference between testnet and mainnet?",
    answer: (
      <>
        <p>
          Mainnet is the real Stellar network, where XLM has value. Testnet is a copy for trying
          things out: test XLM is free from the Friendbot faucet and worth nothing.
        </p>
        {RELEASE.mainnet ? (
          <p>
            Stellix starts on testnet. Switching to mainnet takes an explicit confirmation, and the
            current network is always shown at the top of the wallet.
          </p>
        ) : (
          <p>
            The current release works on testnet only. Mainnet comes in a later release, after an
            external security review.
          </p>
        )}
      </>
    ),
  },
  {
    id: "other-wallet",
    question: "Can I use a recovery phrase from another wallet?",
    answer: (
      <p>
        Yes. Stellix imports 12- and 24-word phrases and finds the same accounts as other wallets
        that follow SEP-0005, the standard most Stellar wallets use.
      </p>
    ),
  },
  {
    id: "data",
    question: "Does Stellix collect any data?",
    answer: (
      <p>
        No. Stellix Labs runs no servers and has no analytics. The Horizon server the wallet talks
        to can see your IP address and the account addresses you use; the{" "}
        <TextLink href="/privacy">privacy policy</TextLink> has the details.
      </p>
    ),
  },
  {
    id: "shield-limits",
    question: "What can't Shield do?",
    answer: (
      <p>
        It won&rsquo;t catch every malicious request, and it can&rsquo;t see what you sign in other
        wallets. <TextLink href={SHIELD_LIMITS_HREF}>Shield&rsquo;s limits</TextLink> explains each
        one.
      </p>
    ),
  },
];

export function FaqList({
  only,
  openFirst = true,
}: {
  only?: readonly FaqId[];
  openFirst?: boolean;
}) {
  const entries = only ? ENTRIES.filter((e) => only.includes(e.id)) : ENTRIES;
  return (
    <div className="max-w-(--container-prose) divide-y divide-line border-y border-line">
      {entries.map((e, i) => (
        <Item key={e.id} question={e.question} open={openFirst && i === 0}>
          {e.answer}
        </Item>
      ))}
    </div>
  );
}

// Native disclosure: keyboard and screen-reader behaviour come from the browser. The answer fades
// in; nothing animates height.
function Item({
  question,
  open,
  children,
}: {
  question: string;
  open: boolean;
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
