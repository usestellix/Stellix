import type { ReactNode } from "react";

// A 360×600 crop of the extension popup (from the store assets), framed like the real popup.
// Fixed dimensions so nothing shifts while it loads.
export function Screenshot({
  src,
  alt,
  caption,
  priority = false,
}: {
  src: string;
  alt: string;
  caption: ReactNode;
  priority?: boolean;
}) {
  return (
    <figure className="flex flex-col items-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- static export: no image optimizer */}
      <img
        src={src}
        alt={alt}
        width={360}
        height={600}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        className="h-auto w-full max-w-[300px] rounded-[16px] shadow-raised"
      />
      <figcaption className="mt-4 max-w-[300px] text-center text-sm text-ink-2">
        {caption}
      </figcaption>
    </figure>
  );
}
