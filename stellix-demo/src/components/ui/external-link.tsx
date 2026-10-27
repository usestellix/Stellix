import type { ReactNode } from "react";
import { ArrowUpRightIcon } from "./icons";

// An inline link to another site. Same tab, no referrer; the arrow marks it as leaving the site.
export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      rel="noopener noreferrer"
      className="inline-flex items-baseline gap-0.5 font-medium text-ink underline decoration-line-strong underline-offset-4 transition-[text-decoration-color] duration-(--d-hover) hover:decoration-ink"
    >
      {children}
      <ArrowUpRightIcon size={14} className="self-center" />
    </a>
  );
}
