import type { Metadata } from "next";

// Per-page metadata: title, description, canonical URL, and the same title and description for
// link previews. The preview image is the site-wide app/opengraph-image, named explicitly
// because a page's own openGraph replaces the root's (and with it the file-based image).
const PREVIEW_IMAGE = { url: "/opengraph-image", width: 1200, height: 630, alt: "Stellix" };

export function pageMetadata({
  title,
  description,
  path,
}: {
  // The page's own name ("Shield"), or { absolute } for a title used as-is (the home page).
  title: string | { absolute: string };
  description: string;
  path: string;
}): Metadata {
  const fullTitle = typeof title === "string" ? `${title} · Stellix` : title.absolute;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: fullTitle,
      description,
      url: path,
      siteName: "Stellix",
      type: "website",
      locale: "en",
      images: [PREVIEW_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: [PREVIEW_IMAGE],
    },
  };
}
