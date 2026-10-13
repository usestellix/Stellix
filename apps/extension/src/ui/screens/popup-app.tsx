import { Button } from "../components/button.js";
import { ErrorText } from "../components/error-text.js";
import { PopupHeader } from "../components/popup-header.js";
import { Wordmark } from "../components/wordmark.js";
import { errorCopy } from "../errorCopy.js";
import { useStatus } from "../hooks/use-status.js";
import { UnlockScreen } from "./unlock-screen.js";
import { UnlockedScreen } from "./unlocked-screen.js";
import { WelcomeScreen } from "./welcome-screen.js";

// Popup routing on open (UI_FLOWS §1). The SW is the source of truth; refresh after mutations.
// No entrance animation anywhere in the popup: it's opened many times a day.

export function PopupApp() {
  const { state, refresh } = useStatus();

  if (state.kind === "loading") {
    return <div data-testid="popup" data-screen="loading" className="h-full bg-surface" />;
  }
  if (state.kind === "error") {
    return (
      <div data-testid="popup" data-screen="error" className="flex h-full flex-col bg-surface">
        <PopupHeader network={null} leading={<Wordmark />} />
        <div className="space-y-4 p-4">
          <ErrorText>{errorCopy(state.code)}</ErrorText>
          <Button variant="secondary" onClick={refresh}>
            Try again
          </Button>
        </div>
      </div>
    );
  }
  const { status } = state;
  if (!status.hasVault) return <WelcomeScreen network={status.network} />;
  if (!status.unlocked) return <UnlockScreen network={status.network} onUnlocked={refresh} />;
  return <UnlockedScreen status={status} onLocked={refresh} />;
}
