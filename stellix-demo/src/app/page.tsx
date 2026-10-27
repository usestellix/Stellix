// Placeholder until the layout (step 2) and holding page land. Exercises the tokens only.
export default function Home() {
  return (
    <main className="mx-auto max-w-(--container-page) px-4 py-24 sm:px-6 lg:px-8">
      <h1 className="text-h1 font-semibold">Stellix</h1>
      <p className="mt-4 max-w-(--container-prose) text-lead text-muted">
        A non-custodial Stellar wallet for your browser.
      </p>
    </main>
  );
}
