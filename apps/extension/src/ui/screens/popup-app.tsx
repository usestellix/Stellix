import type { WalletStatus } from "@stellix/core";
import { useEffect, useMemo, useState } from "react";
import { request } from "../../messaging/client.js";
import { Button } from "../components/button.js";
import { ErrorText } from "../components/error-text.js";
import { PopupHeader } from "../components/popup-header.js";
import { Wordmark } from "../components/wordmark.js";
import { errorCopy } from "../errorCopy.js";
import { useAccounts } from "../hooks/use-accounts.js";
import { useHorizon, useSettings } from "../hooks/use-settings.js";
import { useStatus } from "../hooks/use-status.js";
import { AccountsScreen } from "./accounts-screen.js";
import { ReceiveScreen } from "./receive-screen.js";
import { SendFlow } from "./send/send-flow.js";
import { HomeScreen } from "./home-screen.js";
import { AboutScreen } from "./settings/about-screen.js";
import { AutoLockSettings } from "./settings/autolock-settings.js";
import { ChangePasswordScreen } from "./settings/change-password-screen.js";
import { HorizonSettings } from "./settings/horizon-settings.js";
import { NetworkSettings } from "./settings/network-settings.js";
import { ResetScreen } from "./settings/reset-screen.js";
import { SettingsScreen, type SettingsPage } from "./settings/settings-screen.js";
import { UnlockScreen } from "./unlock-screen.js";
import { WelcomeScreen } from "./welcome-screen.js";

// Popup routing (UI_FLOWS §1). The SW is the source of truth; status is refetched after every
// mutation. No entrance or screen-change animation: the popup is opened many times a day.

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
  return <UnlockedApp status={status} onStatusChange={refresh} />;
}

type Route =
  | { kind: "home" }
  | { kind: "send"; availableStroops: bigint }
  | { kind: "receive"; unfunded: boolean }
  | { kind: "accounts" }
  | { kind: "settings" }
  | { kind: "settings-page"; page: SettingsPage };

function UnlockedApp({
  status,
  onStatusChange,
}: {
  status: WalletStatus;
  onStatusChange: () => void;
}) {
  const [route, setRoute] = useState<Route>({ kind: "home" });
  const { settings, set: setSettings } = useSettings();
  const horizon = useHorizon(settings);
  const { accounts, reload: reloadAccounts } = useAccounts();
  // Derived, not state: the SW's activeAccountIndex is the source of truth.
  const active = useMemo(
    () => accounts?.find((a) => a.index === status.activeAccountIndex) ?? accounts?.[0] ?? null,
    [accounts, status.activeAccountIndex],
  );

  // While a payment is confirming, poll so banners update (each poll also nudges the SW to keep
  // resolving; ADR 0007).
  const resolving = status.inflight.some((i) => i.status === "resolving");
  useEffect(() => {
    if (!resolving) return;
    const t = window.setInterval(onStatusChange, 3_000);
    return () => {
      window.clearInterval(t);
    };
  }, [resolving, onStatusChange]);

  const lock = async () => {
    await request("LOCK", undefined).catch(() => undefined);
    onStatusChange();
  };

  if (settings === null || horizon === null || active === null) {
    return <div data-testid="popup" data-screen="loading" className="h-full bg-surface" />;
  }
  const home = () => {
    setRoute({ kind: "home" });
  };
  const toSettings = () => {
    setRoute({ kind: "settings" });
  };
  const onSettingsChanged = (next: typeof settings) => {
    setSettings(next);
    onStatusChange(); // network badge comes from GET_STATUS
  };

  switch (route.kind) {
    case "home":
      return (
        <HomeScreen
          key={`${settings.network}:${active.publicKey}`}
          account={active}
          network={settings.network}
          horizon={horizon}
          onLock={() => void lock()}
          onOpenAccounts={() => {
            setRoute({ kind: "accounts" });
          }}
          onOpenSettings={toSettings}
          inflight={status.inflight}
          onInflightChange={onStatusChange}
          onSend={(availableStroops) => {
            setRoute({ kind: "send", availableStroops });
          }}
          onReceive={(unfunded) => {
            setRoute({ kind: "receive", unfunded });
          }}
        />
      );
    case "receive":
      return (
        <ReceiveScreen
          address={active.publicKey}
          network={settings.network}
          unfunded={route.unfunded}
          onBack={home}
        />
      );
    case "send":
      return (
        <SendFlow
          network={settings.network}
          source={active.publicKey}
          availableStroops={route.availableStroops}
          horizon={horizon}
          onClose={() => {
            onStatusChange();
            home();
          }}
        />
      );
    case "accounts":
      return (
        <AccountsScreen
          network={settings.network}
          horizon={horizon}
          activeIndex={status.activeAccountIndex}
          onBack={home}
          onSwitched={() => {
            reloadAccounts();
            onStatusChange();
            home();
          }}
        />
      );
    case "settings":
      return (
        <SettingsScreen
          settings={settings}
          onBack={home}
          onOpen={(page) => {
            setRoute({ kind: "settings-page", page });
          }}
        />
      );
    case "settings-page":
      switch (route.page) {
        case "network":
          return (
            <NetworkSettings
              settings={settings}
              onBack={toSettings}
              onChanged={onSettingsChanged}
            />
          );
        case "horizon":
          return (
            <HorizonSettings
              settings={settings}
              onBack={toSettings}
              onChanged={onSettingsChanged}
            />
          );
        case "autolock":
          return (
            <AutoLockSettings
              settings={settings}
              onBack={toSettings}
              onChanged={onSettingsChanged}
            />
          );
        case "password":
          return <ChangePasswordScreen network={settings.network} onBack={toSettings} />;
        case "reset":
          return (
            <ResetScreen network={settings.network} onBack={toSettings} onReset={onStatusChange} />
          );
        case "about":
          return <AboutScreen network={settings.network} onBack={toSettings} />;
      }
  }
}
