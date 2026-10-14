import type { NetworkId } from "@stellix/core";
import { browser } from "wxt/browser";
import { Button } from "../components/button.js";
import { PopupHeader } from "../components/popup-header.js";
import { Wordmark } from "../components/wordmark.js";

// UI_FLOWS §1: no vault → open the full-tab onboarding (the popup closes on blur, which would
// lose state while the user writes down their phrase).

const COPY = {
  title: "A Stellar wallet that stays on this device",
  body: "Your recovery phrase and keys are created here, encrypted with your password, and never sent anywhere.",
  start: "Get started",
  note: "Setup opens in a new tab.",
} as const;

export function WelcomeScreen({ network }: { network: NetworkId }) {
  const start = async () => {
    await browser.tabs.create({ url: browser.runtime.getURL("/onboarding.html") });
    window.close();
  };
  return (
    <div data-testid="popup" data-screen="welcome" className="flex h-full flex-col bg-surface">
      <PopupHeader network={network} leading={<Wordmark />} />
      <main className="flex flex-1 flex-col justify-between px-5 pb-5 pt-10">
        <div className="space-y-3">
          <h1 className="text-[22px] font-semibold leading-[1.2] tracking-[-0.02em]">
            {COPY.title}
          </h1>
          <p className="text-[14px] leading-[1.5] text-muted">{COPY.body}</p>
        </div>
        <div className="space-y-2.5">
          <Button className="w-full" onClick={() => void start()}>
            {COPY.start}
          </Button>
          <p className="text-center text-[12px] text-faint">{COPY.note}</p>
        </div>
      </main>
    </div>
  );
}
