import type { HistoryItem, WalletStatus } from "@stellix/core";
import { useEffect, useMemo, useState } from "react";
import { MAINNET_ENABLED } from "../../build-flags.js";
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
import { AnalyzeScreen } from "./analyze/analyze-screen.js";
import { useHistory } from "../hooks/use-history.js";
import { ActivityDetailScreen } from "./activity-detail-screen.js";
import { HistoryScreen } from "./history-screen.js";
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
  | { kind: "receive" }
  | { kind: "analyze" }
  | { kind: "history" }
  | { kind: "activity"; item: HistoryItem; back: "home" | "history" }
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
  const history = useHistory(active?.publicKey ?? null, settings, horizon);

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
          onReceive={() => {
            setRoute({ kind: "receive" });
          }}
          onAnalyze={() => {
            setRoute({ kind: "analyze" });
          }}
          history={history.snapshot}
          onViewAll={() => {
            setRoute({ kind: "history" });
          }}
          onOpenActivity={(item) => {
            setRoute({ kind: "activity", item, back: "home" });
          }}
          onRetryActivity={() => void history.controller?.refresh()}
        />
      );
    case "history":
      if (history.snapshot === null || history.controller === null) return null;
      return (
        <HistoryScreen
          network={settings.network}
          snapshot={history.snapshot}
          controller={history.controller}
          onOpen={(item) => {
            setRoute({ kind: "activity", item, back: "history" });
          }}
          onBack={home}
        />
      );
    case "activity": {
      if (history.controller === null) return null;
      // The live item (a merge amount may have loaded since the row was tapped).
      const item = history.snapshot?.items.find((i) => i.id === route.item.id) ?? route.item;
      return (
        <ActivityDetailScreen
          item={item}
          me={active.publicKey}
          network={settings.network}
          controller={history.controller}
          onBack={() => {
            setRoute({ kind: route.back });
          }}
        />
      );
    }
    case "receive":
      return (
        <ReceiveScreen
          address={active.publicKey}
          network={settings.network}
          horizon={horizon}
          onBack={home}
        />
      );
    case "analyze":
      return <AnalyzeScreen network={settings.network} onBack={home} />;
    case "send":
      return (
        <SendFlow
          network={settings.network}
          source={active.publicKey}
          availableStroops={route.availableStroops}
          horizon={horizon}
          onClose={() => {
            onStatusChange();
            void history.controller?.refresh();
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
          // Constant-folded: a testnet-only build drops the screen and its mainnet copy (ADR 0008).
          return MAINNET_ENABLED ? (
            <NetworkSettings
              settings={settings}
              onBack={toSettings}
              onChanged={onSettingsChanged}
            />
          ) : null;
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
