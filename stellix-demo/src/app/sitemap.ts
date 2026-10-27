import type { MetadataRoute } from "next";
import { PHASE2_PAGES, SHIELD_LAUNCHED } from "@/content/shield-status";
import { SITE_URL } from "@/content/site";

export const dynamic = "force-static";

// Only published pages: phase 2 pages join when Shield launches.
export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ["/", ...(SHIELD_LAUNCHED ? PHASE2_PAGES.map((p) => p.href) : []), "/privacy"];
  return paths.map((p) => ({ url: new URL(p, SITE_URL).toString() }));
}
