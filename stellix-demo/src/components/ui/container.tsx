import type { ComponentPropsWithoutRef } from "react";

// Page-width wrapper: 1120px max, 16 / 24 / 32px gutters.
export function Container({ className = "", ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={`mx-auto w-full max-w-(--container-page) px-4 sm:px-6 lg:px-8 ${className}`}
      {...props}
    />
  );
}
