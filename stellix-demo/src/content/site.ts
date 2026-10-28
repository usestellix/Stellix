import { PHASE2_PAGES, PROJECT, SHIELD_LAUNCHED } from "./shield-status";

// TODO(launch): the official Chrome Web Store listing URL, once 0.1.0 is published. Until then
// every install button says the listing is coming; nothing links anywhere else and no file is
// ever offered for download.
export const CHROME_STORE_URL: string | null = null;

// The deployed origin, for the sitemap, canonical URLs and Open Graph. Set SITE_URL in the
// Cloudflare Pages project; preview builds fall back to the deployment's own URL.
export const SITE_URL: string =
  process.env["SITE_URL"] ?? process.env["CF_PAGES_URL"] ?? "http://localhost:3000";

const REPO = "https://github.com/usestellix/Stellix";

// Links into the repository exist only once it's public (PROJECT.repoPublic).
export const REPO_LINKS = PROJECT.repoPublic
  ? {
      repo: REPO,
      verifyRelease: `${REPO}/blob/main/docs/VERIFY_RELEASE.md`,
      reportVulnerability: `${REPO}/security/advisories/new`,
      privacySource: `${REPO}/blob/main/PRIVACY.md`,
    }
  : null;

export interface NavItem {
  href: string;
  label: string;
}

// Phase 1 publishes only the home page and /privacy, so there are no product pages to link to.
export const MAIN_NAV: readonly NavItem[] = SHIELD_LAUNCHED ? PHASE2_PAGES : [];

export const FOOTER_NAV: readonly NavItem[] = [
  ...MAIN_NAV,
  { href: "/privacy", label: "Privacy" },
  ...(REPO_LINKS ? [{ href: REPO_LINKS.repo, label: "GitHub" }] : []),
];
