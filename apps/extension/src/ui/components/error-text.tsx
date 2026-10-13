import type { ReactNode } from "react";

/** Errors use an icon and text, never color alone (UI_FLOWS §10). */
export function ErrorText({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <p id={id} role="alert" className="flex items-start gap-1.5 text-sm text-danger">
      <span aria-hidden="true">⚠</span>
      <span>{children}</span>
    </p>
  );
}
