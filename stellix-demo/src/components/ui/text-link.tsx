import Link from "next/link";
import type { ReactNode } from "react";

export const TEXT_LINK_CLASSES =
  "font-medium text-ink underline decoration-line-strong underline-offset-4 transition-[text-decoration-color] duration-(--d-hover) hover:decoration-ink";

// An internal link inside running text.
export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={TEXT_LINK_CLASSES}>
      {children}
    </Link>
  );
}
