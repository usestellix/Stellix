import type { NetworkId } from "@stellix/core";
import { browser } from "wxt/browser";
import { MAINNET_ENABLED } from "../../../build-flags.js";
import { ExternalIcon } from "../../components/icons.js";
import { SubScreen } from "../../components/sub-screen.js";

// About (UI_FLOWS §9, SECURITY §9.5): version + build commit so users can compare with releases,
// a source link, and the privacy note (NETWORK.md §8).

const SOURCE_URL = "https://github.com/usestellix/Stellix";

export function AboutScreen({ network, onBack }: { network: NetworkId; onBack: () => void }) {
  const version = browser.runtime.getManifest().version;
  const rows: [string, string][] = [
    ["Version", version],
    ["Build", __STELLIX_COMMIT__.slice(0, 12)],
    ["Networks", MAINNET_ENABLED ? "Testnet, Mainnet" : "Testnet only"],
  ];
  return (
    <SubScreen title="About" network={network} onBack={onBack} testId="settings-about">
      <dl className="divide-y divide-[var(--color-line)] rounded-xl bg-surface px-3 shadow-raised">
        {rows.map(([k, v]) => (
          <div key={k} className="flex h-11 items-center justify-between text-[14px]">
            <dt className="text-muted">{k}</dt>
            <dd className="font-mono text-[13px]" data-testid={`about-${k.toLowerCase()}`}>
              {v}
            </dd>
          </div>
        ))}
      </dl>
      <a
        href={SOURCE_URL}
        target="_blank"
        rel="noreferrer"
        className="pressable mt-3 flex h-11 items-center justify-between rounded-lg px-3 text-[14px] hover-fine:bg-fill"
      >
        Source code
        <ExternalIcon size={14} className="text-faint" />
      </a>
      <div className="mt-4 space-y-2 px-1 text-[12px] leading-5 text-muted">
        <p>Stellix has no servers and collects nothing. Your keys never leave this device.</p>
        <p>
          To show balances, Stellix asks a Horizon server (by default, the Stellar Development
          Foundation&apos;s). That server can see your IP address and the account addresses you look
          up.
        </p>
      </div>
    </SubScreen>
  );
}
