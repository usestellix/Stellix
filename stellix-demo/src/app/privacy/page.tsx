import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import { marked } from "marked";
import { Container } from "@/components/ui/container";
import { ExternalLink } from "@/components/ui/external-link";
import { REPO_LINKS } from "@/content/site";

export const metadata: Metadata = pageMetadata({
  title: "Privacy policy",
  description:
    "Stellix runs no servers and collects nothing. What stays on your device, and who else receives data.",
  path: "/privacy",
});

// The extension's PRIVACY.md, vendored as src/content/privacy.md (pnpm sync:privacy, checked in
// CI against an extension tag) and rendered at build time. The input is our own file, never user
// content, which is why raw HTML is allowed here and nowhere else.
// Tables scroll sideways on narrow screens, so each one is focusable for keyboard scrolling.
const html = marked
  .parse(readFileSync(path.join(process.cwd(), "src/content/privacy.md"), "utf8"), {
    async: false,
    gfm: true,
  })
  .replaceAll("<table>", '<table tabindex="0">');

export default function PrivacyPage() {
  return (
    <Container className="py-16 sm:py-24">
      <article
        className="policy max-w-(--container-prose)"
        // eslint-disable-next-line react/no-danger -- build-time render of our vendored policy
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {REPO_LINKS && (
        <p className="mt-12 max-w-(--container-prose) text-sm text-muted">
          This policy&rsquo;s history is public:{" "}
          <ExternalLink href={REPO_LINKS.privacySource}>PRIVACY.md on GitHub</ExternalLink>
        </p>
      )}
    </Container>
  );
}
