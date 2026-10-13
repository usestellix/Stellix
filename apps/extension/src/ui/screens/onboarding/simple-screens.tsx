import { Button } from "../../components/button.js";
import { errorCopy } from "../../errorCopy.js";

// Small onboarding states (UI_FLOWS §2.1, §2.6).

const COPY = {
  startTitle: "Welcome to Stellix",
  startBody: "Your keys stay on this device. Stellix never sees them.",
  create: "Create a new wallet",
  import: "I already have a recovery phrase",
  doneTitle: "You're all set",
  doneBody: "Stellix is ready. Click the Stellix icon in your browser toolbar to open it.",
  pinHint:
    "Tip: click the puzzle-piece icon in the toolbar and pin Stellix so it's always one click away.",
  alreadyTitle: "Stellix is already set up",
  alreadyBody:
    "Open Stellix from the toolbar. To start over, reset the wallet from Settings first.",
  restart: "Start again",
} as const;

export function StartScreen({
  onCreate,
  onImport,
}: {
  onCreate: () => void;
  onImport: () => void;
}) {
  return (
    <section className="space-y-6" data-testid="onboarding-start">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{COPY.startTitle}</h1>
        <p className="text-muted">{COPY.startBody}</p>
      </div>
      <div className="flex flex-col gap-3">
        <Button onClick={onCreate}>{COPY.create}</Button>
        <Button variant="secondary" onClick={onImport}>
          {COPY.import}
        </Button>
      </div>
    </section>
  );
}

export function DoneScreen() {
  return (
    <section className="space-y-3" data-testid="onboarding-done">
      <h1 className="text-2xl font-semibold">{COPY.doneTitle}</h1>
      <p>{COPY.doneBody}</p>
      <p className="text-sm text-muted">{COPY.pinHint}</p>
    </section>
  );
}

export function AlreadySetUpScreen() {
  return (
    <section className="space-y-3" data-testid="onboarding-already">
      <h1 className="text-2xl font-semibold">{COPY.alreadyTitle}</h1>
      <p className="text-muted">{COPY.alreadyBody}</p>
    </section>
  );
}

export function ExpiredScreen({ onRestart }: { onRestart: () => void }) {
  return (
    <section className="space-y-4" data-testid="onboarding-expired">
      <p role="alert">{errorCopy("ONBOARDING_EXPIRED")}</p>
      <Button onClick={onRestart}>{COPY.restart}</Button>
    </section>
  );
}
