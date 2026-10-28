import Link from "next/link";
import type { ReactNode } from "react";

type Variant = "primary" | "secondary";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary text-primary-fg hover:bg-primary-hover",
  secondary: "bg-surface text-ink shadow-ring-strong hover:bg-fill-strong",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm",
  md: "h-11 px-5 text-base",
};

export function buttonClasses(variant: Variant = "primary", size: Size = "md"): string {
  return `press inline-flex items-center justify-center gap-2 rounded-control font-medium whitespace-nowrap ${VARIANTS[variant]} ${SIZES[size]}`;
}

interface LinkButtonProps {
  href: string;
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  className?: string;
}

// A link styled as a button. Internal paths use next/link; absolute URLs are plain anchors in the
// same tab, without a referrer.
export function LinkButton({ href, children, variant, size, className = "" }: LinkButtonProps) {
  const classes = `${buttonClasses(variant, size)} ${className}`;
  if (/^https?:\/\//.test(href)) {
    return (
      <a href={href} rel="noopener noreferrer" className={classes}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={classes}>
      {children}
    </Link>
  );
}
