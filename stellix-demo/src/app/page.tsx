import type { Metadata } from "next";
import { HoldingPage } from "@/components/home/holding-page";
import { ShieldHome } from "@/components/home/shield-home";
import { SHIELD_LAUNCHED, STATEMENTS, allShipped } from "@/content/shield-status";

export const metadata: Metadata = SHIELD_LAUNCHED
  ? {
      title: { absolute: "Stellix: the Stellar wallet that shows you what you're signing" },
      // Only a fully shipped statement may describe the product in search results.
      description: allShipped(STATEMENTS.heroSupport.requires)
        ? STATEMENTS.heroSupport.text
        : "A non-custodial Stellar wallet for your browser.",
    }
  : {
      title: { absolute: "Stellix" },
      description: "A non-custodial Stellar wallet for your browser.",
    };

export default function Home() {
  return SHIELD_LAUNCHED ? <ShieldHome /> : <HoldingPage />;
}
