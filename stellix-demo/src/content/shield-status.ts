// The single source of truth for what Stellix can do. Every capability claim on the site is
// rendered from this file; page copy never states a capability on its own. Statements that
// combine capabilities live here too, each with the capabilities it depends on.
//
// "shipped" means: in the released Chrome Web Store build. Merged on main is not shipped.
// This file has no imports, so build scripts can load it directly with Node.

export type CapabilityStatus = "shipped" | "coming";
export type ShieldPhase = "S1" | "S2" | "S3" | "S4";

export type ShieldCapabilityId =
  | "decode-classic"
  | "check-sends"
  | "analyze-pasted"
  | "check-dapp-requests"
  | "simulate-soroban"
  | "decode-soroban-auth"
  | "mainnet-dapps";

export type WalletCapabilityId =
  | "keys-on-device"
  | "review-screen"
  | "send-receive"
  | "memo-required"
  | "auto-lock"
  | "import-standard"
  | "multiple-accounts"
  | "balances"
  | "full-address"
  | "first-send-warning"
  | "secret-key-block"
  | "max-send"
  | "live-activity"
  | "friendbot"
  | "custom-horizon"
  | "network-badge";

export type CapabilityId = ShieldCapabilityId | WalletCapabilityId;

export interface ShieldCapability {
  id: ShieldCapabilityId;
  claim: string;
  phase: ShieldPhase;
  status: CapabilityStatus;
}

export interface WalletCapability {
  id: WalletCapabilityId;
  claim: string;
  status: CapabilityStatus;
}

export const SHIELD_CAPABILITIES: readonly ShieldCapability[] = [
  {
    id: "decode-classic",
    claim: "Decodes every classic Stellar operation into plain language",
    phase: "S1",
    status: "coming",
  },
  {
    id: "check-sends",
    claim: "Checks transactions you send from Stellix",
    phase: "S1",
    status: "coming",
  },
  {
    id: "analyze-pasted",
    claim: "Paste any transaction to analyze it, even one you'll sign in another wallet",
    phase: "S1",
    status: "coming",
  },
  {
    id: "check-dapp-requests",
    claim: "Checks dapp requests before you sign",
    phase: "S2",
    status: "coming",
  },
  {
    id: "simulate-soroban",
    claim: "Simulates Soroban contract calls and shows balance changes",
    phase: "S3",
    status: "coming",
  },
  {
    id: "decode-soroban-auth",
    claim: "Decodes Soroban authorizations and token approvals",
    phase: "S3",
    status: "coming",
  },
  {
    id: "mainnet-dapps",
    claim: "Mainnet dapp support",
    phase: "S4",
    status: "coming",
  },
];

// The wallet itself, as released in 0.1.0. Each one is in the store listing (checked against the
// shipped build: docs/store/listing.md) or is a milestone M1–M4 feature present in the extension's
// UI (apps/extension/src/ui), all of which 0.1.0 contains.
export const WALLET_CAPABILITIES: readonly WalletCapability[] = [
  {
    id: "keys-on-device",
    claim:
      "Your recovery phrase is created on your device, encrypted with your password, and never sent anywhere",
    status: "shipped",
  },
  {
    id: "review-screen",
    claim:
      "The review screen shows exactly what will be signed, decoded from the transaction itself",
    status: "shipped",
  },
  {
    id: "send-receive",
    claim: "Send XLM to any G… or M… address; receive with a QR code or a payment link",
    status: "shipped",
  },
  {
    id: "memo-required",
    claim: "Requires a memo automatically when an exchange asks for one",
    status: "shipped",
  },
  {
    id: "auto-lock",
    claim: "Locks itself after 5 to 60 minutes",
    status: "shipped",
  },
  {
    id: "import-standard",
    claim:
      "Imports 12- and 24-word recovery phrases and finds the same accounts as other standard (SEP-0005) Stellar wallets",
    status: "shipped",
  },
  {
    id: "multiple-accounts",
    claim: "Holds several accounts from one recovery phrase, each with its own name",
    status: "shipped",
  },
  {
    id: "balances",
    claim: "Shows your total, available and reserved balance, and explains what's reserved",
    status: "shipped",
  },
  {
    id: "full-address",
    claim: "Shows the destination address in full, in groups of four characters, before you send",
    status: "shipped",
  },
  {
    id: "first-send-warning",
    claim: "Warns you the first time you send to an address",
    status: "shipped",
  },
  {
    id: "secret-key-block",
    claim: "Stops you if you paste a secret key where an address belongs",
    status: "shipped",
  },
  {
    id: "max-send",
    claim:
      "“Max” keeps the reserve and the fee aside, so a payment can't take your account below its minimum",
    status: "shipped",
  },
  {
    id: "live-activity",
    claim: "Activity updates live while the wallet is open",
    status: "shipped",
  },
  {
    id: "friendbot",
    claim: "Funds testnet accounts for free with Friendbot",
    status: "shipped",
  },
  {
    id: "custom-horizon",
    claim: "Lets you choose your own Horizon server in Settings",
    status: "shipped",
  },
  {
    id: "network-badge",
    claim: "Always shows which network you're on",
    status: "shipped",
  },
];

// The released store build. `mainnet` flips every "testnet only" notice.
export const RELEASE = {
  version: "0.1.0",
  mainnet: false,
} as const satisfies { version: string; mainnet: boolean };

// Facts about the project, not the product. Proof points that depend on them are hidden (not
// "coming soon") until they're true.
export const PROJECT = {
  // The repository is public on GitHub (usestellix/Stellix). Gates "open source", "reproducible
  // builds you can verify" and every link into the repository.
  repoPublic: false,
  license: "Apache-2.0",
} as const satisfies { repoPublic: boolean; license: string };

// Statements that state or depend on capabilities. Pages render them by key, so the text and
// its dependencies stay together; a statement whose capabilities aren't all shipped renders
// with "Coming soon".
export const STATEMENTS = {
  heroWallet: {
    text: "Stellix is a non-custodial wallet for the Stellar network that runs in your browser. Your recovery phrase never leaves your device, and before anything is signed, the review screen shows exactly what will be signed, decoded from the transaction itself.",
    requires: ["keys-on-device", "review-screen"],
  },
  heroSupport: {
    text: "Stellix decodes every transaction, flags account-takeover and drain patterns, and runs all checks on your device. Nothing is sent to a scanning service.",
    requires: ["decode-classic", "analyze-pasted"],
  },
  proofOnDevice: {
    text: "Shield decodes and checks transactions inside the extension. Nothing is sent to a scanning service.",
    requires: ["decode-classic"],
  },
  reviewAddsFindings: {
    text: "Shield adds its findings to the review screen. Some need a confirmation before you can sign, and some block the signature.",
    requires: ["check-sends"],
  },
  analyzeAnything: {
    text: "Paste a transaction from another wallet or a website, and Shield shows what it does, without signing anything.",
    requires: ["analyze-pasted"],
  },
  dappsChecked: {
    text: "When a site asks Stellix to sign, Shield checks the request before the approval window shows it.",
    requires: ["check-dapp-requests"],
  },
  dappBlocksHaveNoOverride: {
    text: "If a site asks Stellix to add a signer to your account or take your own key out of control, Stellix blocks it. There is no override.",
    requires: ["check-dapp-requests"],
  },
  sorobanLookups: {
    text: "For Soroban contract calls, Shield will also ask a Stellar RPC server to simulate the call.",
    requires: ["simulate-soroban"],
  },
  exampleCaption: {
    text: "What Stellix's Analyze screen shows for this pasted transaction.",
    requires: ["analyze-pasted"],
  },
} as const satisfies Record<string, { text: string; requires: readonly CapabilityId[] }>;

export type StatementId = keyof typeof STATEMENTS;

const ALL_CAPABILITIES: readonly (ShieldCapability | WalletCapability)[] = [
  ...SHIELD_CAPABILITIES,
  ...WALLET_CAPABILITIES,
];

export function capability(id: CapabilityId): ShieldCapability | WalletCapability {
  const found = ALL_CAPABILITIES.find((c) => c.id === id);
  if (found === undefined) throw new Error(`Unknown capability: ${id}`);
  return found;
}

export function isShipped(id: CapabilityId): boolean {
  return capability(id).status === "shipped";
}

export function allShipped(ids: readonly CapabilityId[]): boolean {
  return ids.every(isShipped);
}

// Launch phases: phase 1 is the home page and /privacy; phase 2, the full Shield-first site,
// launches with the first store release that ships a Shield S1 capability. Phase 2 pages are
// built always and removed from the export before launch (scripts/postbuild.mjs).
export const PHASE2_PAGES: readonly { href: string; label: string }[] = [
  { href: "/shield", label: "Shield" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/security", label: "Security" },
  { href: "/faq", label: "FAQ" },
];

export const SHIELD_LAUNCHED: boolean = SHIELD_CAPABILITIES.some(
  (c) => c.phase === "S1" && c.status === "shipped",
);
