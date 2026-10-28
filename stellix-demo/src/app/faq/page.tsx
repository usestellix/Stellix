import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import { FaqList } from "@/components/faq-list";
import { PageHeader } from "@/components/section";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = pageMetadata({
  title: "FAQ",
  description:
    "Recovery phrases, lost passwords, testnet and mainnet, and whether Stellix will ever ask for your phrase.",
  path: "/faq",
});

export default function FaqPage() {
  return (
    <>
      <PageHeader title="Questions" />
      <Container className="py-12">
        <FaqList />
      </Container>
    </>
  );
}
