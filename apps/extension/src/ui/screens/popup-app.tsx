import { ErrorText } from "../components/error-text.js";
import { Button } from "../components/button.js";
import { errorCopy } from "../errorCopy.js";
import { useStatus } from "../hooks/use-status.js";
import { UnlockScreen } from "./unlock-screen.js";
import { UnlockedScreen } from "./unlocked-screen.js";
import { WelcomeScreen } from "./welcome-screen.js";

// Popup routing on open (UI_FLOWS §1). The SW is the source of truth; refresh after mutations.

export function PopupApp() {
  const { state, refresh } = useStatus();

  if (state.kind === "loading") {
    return <div data-testid="popup" data-screen="loading" className="h-full" />;
  }
  if (state.kind === "error") {
    return (
      <div data-testid="popup" data-screen="error" className="space-y-3 p-4">
        <ErrorText>{errorCopy(state.code)}</ErrorText>
        <Button onClick={refresh}>Try again</Button>
      </div>
    );
  }
  const { status } = state;
  if (!status.hasVault) return <WelcomeScreen />;
  if (!status.unlocked) return <UnlockScreen network={status.network} onUnlocked={refresh} />;
  return <UnlockedScreen status={status} onLocked={refresh} />;
}
