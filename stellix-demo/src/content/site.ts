import { SHIELD_LAUNCHED } from "./shield-status";

// TODO(launch): the official Chrome Web Store listing URL, once 0.1.0 is published. Until then
// every install button says the listing is coming; nothing links anywhere else and no file is
// ever offered for download.
export const CHROME_STORE_URL: string | null = null;

export interface NavItem {
  href: string;
  label: string;
}

const PRODUCT_NAV: readonly NavItem[] = [
  { href: "/shield", label: "Shield" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/security", label: "Security" },
  { href: "/faq", label: "FAQ" },
];

// Phase 1 (holding page) has no product pages to link to.
export const MAIN_NAV: readonly NavItem[] = SHIELD_LAUNCHED ? PRODUCT_NAV : [];

export const FOOTER_NAV: readonly NavItem[] = [...MAIN_NAV, { href: "/privacy", label: "Privacy" }];
