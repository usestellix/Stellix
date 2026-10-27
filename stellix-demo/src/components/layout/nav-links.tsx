"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/content/site";

// The site's only client component: it marks the current page with aria-current, which needs
// the pathname. Everything else on the site renders on the server at build time.
export function NavLinks({ items }: { items: readonly NavItem[] }) {
  const pathname = usePathname();
  return (
    <ul className="flex items-center gap-6">
      {items.map((item) => {
        const current = pathname === item.href;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={current ? "page" : undefined}
              className={`text-sm transition-colors duration-(--d-hover) ${
                current ? "font-medium text-ink" : "text-ink-2 hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
