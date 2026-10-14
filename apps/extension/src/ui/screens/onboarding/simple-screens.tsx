import { Button } from "../../components/button.js";
import { Callout } from "../../components/callout.js";
import { CheckIcon } from "../../components/icons.js";
import { errorCopy } from "../../errorCopy.js";
import { StepHeading } from "./onboarding-shell.js";

// Small onboarding states (UI_FLOWS §2.1, §2.6).

const COPY = {
  startTitle: "Set up Stellix",
  startBody:
    "Create a new wallet, or bring one you already have. Either way, your keys are encrypted on this device and never leave it.",
  create: "Create a new wallet",
  createHint: "You'll get a 12-word recovery phrase to write down.",
  import: "I already have a recovery phrase",
  importHint: "12 or 24 words from Stellix, Freighter, LOBSTR or another Stellar wallet.",
  doneTitle: "You're all set",
  doneBody: "Stellix is ready. Click the Stellix icon in your browser toolbar to open it.",
  pinHint:
    "Tip: open the puzzle-piece menu in the toolbar and pin Stellix so it's always one click away.",
  alreadyTitle: "Stellix is already set up",
  alreadyBody:
    "Open Stellix from the toolbar. To start over, reset the wallet from Settings first.",
  restart: "Start again",
} as const;

function ChoiceButton({
  title,
  hint,
  onClick,
  primary,
}: {
  title: string;
  hint: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        primary === true
          ? "pressable w-full rounded-xl bg-primary px-5 py-4 text-left text-primary-fg hover-fine:bg-primary-hover"
          : "pressable w-full rounded-xl bg-surface px-5 py-4 text-left shadow-raised hover-fine:bg-fill"
      }
    >
      <span className="block text-[15px] font-semibold tracking-[-0.01em]">{title}</span>
      <span
        className={
          primary === true
            ? "mt-0.5 block text-[13px] opacity-70"
            : "mt-0.5 block text-[13px] text-muted"
        }
      >
        {hint}
      </span>
    </button>
  );
}

export function StartScreen({
  onCreate,
  onImport,
}: {
  onCreate: () => void;
  onImport: () => void;
}) {
  return (
    <section data-testid="onboarding-start">
      <StepHeading title={COPY.startTitle} body={COPY.startBody} />
      <div className="space-y-3">
        <ChoiceButton primary title={COPY.create} hint={COPY.createHint} onClick={onCreate} />
        <ChoiceButton title={COPY.import} hint={COPY.importHint} onClick={onImport} />
      </div>
    </section>
  );
}

export function DoneScreen() {
  return (
    <section data-testid="onboarding-done">
      <div className="mb-6 flex size-11 items-center justify-center rounded-full bg-fill text-success">
        <CheckIcon size={22} strokeWidth={2} />
      </div>
      <StepHeading title={COPY.doneTitle} body={COPY.doneBody} />
      <Callout>{COPY.pinHint}</Callout>
    </section>
  );
}

export function AlreadySetUpScreen() {
  return (
    <section data-testid="onboarding-already">
      <StepHeading title={COPY.alreadyTitle} body={COPY.alreadyBody} />
    </section>
  );
}

export function ExpiredScreen({ onRestart }: { onRestart: () => void }) {
  return (
    <section data-testid="onboarding-expired" className="space-y-6">
      <StepHeading title="Setup expired" body={errorCopy("ONBOARDING_EXPIRED")} />
      <Button onClick={onRestart}>{COPY.restart}</Button>
    </section>
  );
}
