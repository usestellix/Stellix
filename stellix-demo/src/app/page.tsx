import { Container } from "@/components/ui/container";

// Placeholder until the holding page (phase 1) and the Shield-first home (phase 2) land.
export default function Home() {
  return (
    <Container className="py-24">
      <h1 className="text-h1 font-semibold">Stellix</h1>
      <p className="mt-4 max-w-(--container-prose) text-lead text-ink-2">
        A non-custodial Stellar wallet for your browser.
      </p>
    </Container>
  );
}
