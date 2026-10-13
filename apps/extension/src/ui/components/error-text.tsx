import type { ReactNode } from "react";
import { AlertIcon } from "./icons.js";

/** Errors use an icon and text, never color alone (UI_FLOWS §10). */
export function ErrorText({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <p id={id} role="alert" className="flex items-start gap-1.5 text-[13px] leading-5 text-danger">
      <AlertIcon className="mt-0.5 shrink-0" size={14} />
      <span>{children}</span>
    </p>
  );
}
