import type { NetworkId, Settings } from "@stellix/core";
import { browser } from "wxt/browser";
import { ExternalIcon } from "../../components/icons.js";
import { ListRow, SectionLabel, SubScreen } from "../../components/sub-screen.js";

// Settings (UI_FLOWS §9).

export type SettingsPage = "network" | "horizon" | "autolock" | "password" | "reset" | "about";

const LABELS = { testnet: "Testnet", mainnet: "Mainnet" } as const satisfies Record<
  NetworkId,
  string
>;

export function SettingsScreen({
  settings,
  onBack,
  onOpen,
}: {
  settings: Settings;
  onBack: () => void;
  onOpen: (page: SettingsPage) => void;
}) {
  const revealPhrase = async () => {
    await browser.tabs.create({ url: browser.runtime.getURL("/onboarding.html?mode=reveal") });
    window.close();
  };
  return (
    <SubScreen title="Settings" network={settings.network} onBack={onBack} testId="settings">
      <SectionLabel>Network</SectionLabel>
      <ListRow
        label="Network"
        detail={LABELS[settings.network]}
        onClick={() => {
          onOpen("network");
        }}
      />
      <ListRow
        label="Custom Horizon URL"
        detail={settings.horizonOverrides[settings.network] !== undefined ? "Custom" : "Default"}
        onClick={() => {
          onOpen("horizon");
        }}
      />
      <SectionLabel>Security</SectionLabel>
      <ListRow
        label="Auto-lock"
        detail={`${String(settings.autoLockMinutes)} min`}
        onClick={() => {
          onOpen("autolock");
        }}
      />
      <ListRow
        label="Reveal recovery phrase"
        onClick={() => void revealPhrase()}
        trailing={<ExternalIcon size={14} className="shrink-0 text-faint" />}
      />
      <ListRow
        label="Change password"
        onClick={() => {
          onOpen("password");
        }}
      />
      <SectionLabel>Danger zone</SectionLabel>
      <ListRow
        label="Reset wallet"
        tone="danger"
        onClick={() => {
          onOpen("reset");
        }}
      />
      <SectionLabel>About</SectionLabel>
      <ListRow
        label="About Stellix"
        onClick={() => {
          onOpen("about");
        }}
      />
    </SubScreen>
  );
}
