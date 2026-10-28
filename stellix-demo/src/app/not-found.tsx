import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { LinkButton } from "@/components/ui/link-button";
import { SHIELD_LAUNCHED } from "@/content/shield-status";

// Served by Cloudflare with a 404 status; Next.js also adds noindex to this page on its own.
export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <Container className="py-24">
      <p className="font-mono text-label text-muted">404</p>
      <h1 className="mt-3 text-h2 font-semibold">This page doesn&rsquo;t exist.</h1>
      <p className="mt-4 max-w-(--container-prose) text-lead text-ink-2">
        The link may be mistyped, or the page may have moved.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <LinkButton href="/">Go to the home page</LinkButton>
        {SHIELD_LAUNCHED && (
          <LinkButton href="/shield" variant="secondary">
            About Shield
          </LinkButton>
        )}
      </div>
    </Container>
  );
}
