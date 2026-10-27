// The single source of truth for what Stellix can do. Every capability claim on the site is
// rendered from this file; page copy never states a capability on its own.
//
// "shipped" means: in the released Chrome Web Store build. Merged on main is not shipped.

export type CapabilityStatus = "shipped" | "coming";
export type ShieldPhase = "S1" | "S2" | "S3" | "S4";

export type CapabilityId =
  | "decode-classic"
  | "check-sends"
  | "analyze-pasted"
  | "check-dapp-requests"
  | "simulate-soroban"
  | "decode-soroban-auth"
  | "mainnet-dapps";

export interface Capability {
  id: CapabilityId;
  claim: string;
  phase: ShieldPhase;
  status: CapabilityStatus;
}

export const CAPABILITIES: readonly Capability[] = [
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

// The released store build. `mainnet` flips the "Testnet only" notices everywhere.
export const RELEASE = {
  version: "0.1.0",
  mainnet: false,
} as const satisfies { version: string; mainnet: boolean };

// Launch phases: phase 1 is the holding page and /privacy; phase 2, the full Shield-first site,
// launches with the first store release that ships a Shield S1 capability.
export const SHIELD_LAUNCHED: boolean = CAPABILITIES.some(
  (c) => c.phase === "S1" && c.status === "shipped",
);
