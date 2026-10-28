import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Container } from "@/components/ui/container";
import { INSTALL_AVAILABLE, InstallButton } from "@/components/ui/install-button";
import { Wordmark } from "@/components/ui/wordmark";
import { MAIN_NAV } from "@/content/site";
import { RELEASE } from "@/content/shield-status";
import { MobileNav } from "./mobile-nav";
import { NavLinks } from "./nav-links";

export function SiteHeader() {
  const hasNav = MAIN_NAV.length > 0;
  return (
    <header className="border-b border-line">
      <Container className="flex h-16 items-center gap-8">
        <Link href="/" className="rounded-control">
          <Wordmark />
        </Link>
        {hasNav && (
          <nav aria-label="Main" className="hidden md:block">
            <NavLinks items={MAIN_NAV} />
          </nav>
        )}
        <div className="ml-auto flex items-center gap-3">
          {!RELEASE.mainnet && <Badge>Testnet only</Badge>}
          {INSTALL_AVAILABLE && (
            // With a menu, the install button moves into it below the sm breakpoint.
            <InstallButton size="sm" className={hasNav ? "hidden sm:inline-flex" : ""} />
          )}
          {hasNav && <MobileNav items={MAIN_NAV} />}
        </div>
      </Container>
    </header>
  );
}
