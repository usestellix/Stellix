import type { ReactNode } from "react";
import { Container } from "@/components/ui/container";

// A page section with an h2 and an optional intro. `id` makes it linkable (e.g. /shield#limits).
// `band` sets it on the surface color between hairlines, to give long pages a rhythm.
export function Section({
  id,
  title,
  intro,
  children,
  band = false,
  className = "",
}: {
  id?: string;
  title: string;
  band?: boolean;
  intro?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={`scroll-mt-8 py-16 sm:py-20 ${band ? "border-y border-line bg-surface" : ""} ${className}`}
    >
      <Container>
        <h2 id={headingId} className="text-h2 font-semibold">
          {title}
        </h2>
        {intro && <p className="mt-4 max-w-(--container-prose) text-lead text-ink-2">{intro}</p>}
        {children && <div className="mt-10">{children}</div>}
      </Container>
    </section>
  );
}

// The opening block of an inner page: an h1 and its lead.
export function PageHeader({ title, lead }: { title: ReactNode; lead?: ReactNode }) {
  return (
    <Container className="pt-16 pb-4 sm:pt-24">
      <h1 className="max-w-[18ch] text-h1 font-semibold text-balance">{title}</h1>
      {lead && <p className="mt-6 max-w-(--container-prose) text-lead text-ink-2">{lead}</p>}
    </Container>
  );
}
