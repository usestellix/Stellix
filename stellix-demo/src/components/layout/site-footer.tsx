import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Wordmark } from "@/components/ui/wordmark";
import { FOOTER_NAV } from "@/content/site";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line">
      <Container className="grid gap-8 py-12 sm:grid-cols-[1fr_auto]">
        <div className="max-w-(--container-prose)">
          <Wordmark />
          <p className="mt-3 text-sm text-ink-2">
            A non-custodial Stellar wallet for your browser.
          </p>
          <p className="mt-6 text-sm text-muted">
            Stellix is an independent project by Stellix Labs. It is not affiliated with or endorsed
            by the Stellar Development Foundation.
          </p>
        </div>
        <nav aria-label="Footer">
          <ul className="flex flex-col gap-2 sm:items-end">
            {FOOTER_NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-sm text-ink-2 transition-colors duration-(--d-hover) hover:text-ink"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
    </footer>
  );
}
