import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import { Landing } from "@/components/home/landing";
import { STATEMENTS, allShipped } from "@/content/shield-status";

// Search results describe the product with the most complete statement that has fully shipped.
const description = allShipped(STATEMENTS.heroSupport.requires)
  ? STATEMENTS.heroSupport.text
  : STATEMENTS.heroWallet.text;

export const metadata: Metadata = pageMetadata({
  title: { absolute: "Stellix: the Stellar wallet that shows you what you're signing" },
  description,
  path: "/",
});

export default function Home() {
  return <Landing />;
}
