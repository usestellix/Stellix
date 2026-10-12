// M0 placeholder for the full-tab onboarding page (UI_FLOWS §2). Real flows arrive in M1.

const COPY = {
  title: "Welcome to Stellix",
  body: "Wallet setup is coming soon.",
} as const;

export function OnboardingPlaceholderScreen() {
  return (
    <main className="mx-auto max-w-[480px] px-4 py-16" data-testid="onboarding">
      <h1 className="mb-2 text-2xl font-semibold">{COPY.title}</h1>
      <p className="text-muted">{COPY.body}</p>
    </main>
  );
}
