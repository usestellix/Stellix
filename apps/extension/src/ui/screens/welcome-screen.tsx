import { browser } from "wxt/browser";
import { Button } from "../components/button.js";

// UI_FLOWS §1: no vault → open the full-tab onboarding (the popup closes on blur, which would
// lose state while the user writes down their phrase).

const COPY = {
  title: "Welcome to Stellix",
  body: "A wallet for Stellar where your keys never leave this device.",
  start: "Get started",
} as const;

export function WelcomeScreen() {
  const start = async () => {
    await browser.tabs.create({ url: browser.runtime.getURL("/onboarding.html") });
    window.close();
  };
  return (
    <main
      data-testid="popup"
      data-screen="welcome"
      className="flex h-full flex-col justify-center gap-4 p-6 text-center"
    >
      <h1 className="text-xl font-semibold">{COPY.title}</h1>
      <p className="text-sm text-muted">{COPY.body}</p>
      <Button onClick={() => void start()}>{COPY.start}</Button>
    </main>
  );
}
