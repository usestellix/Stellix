import type { VerifyAnswer } from "@stellix/core";
import { useEffect, useState } from "react";
import { request } from "../../../messaging/client.js";
import { Button } from "../../components/button.js";
import { ErrorText } from "../../components/error-text.js";
import { Spinner } from "../../components/spinner.js";
import { errorCopy } from "../../errorCopy.js";
import { useAction } from "../../hooks/use-request.js";
import { ImportPhraseScreen } from "./import-phrase-screen.js";
import { RevealPhraseScreen } from "./reveal-phrase-screen.js";
import { OnboardingShell } from "./onboarding-shell.js";
import { SetPasswordScreen } from "./set-password-screen.js";
import { ShowPhraseScreen } from "./show-phrase-screen.js";
import { AlreadySetUpScreen, DoneScreen, ExpiredScreen, StartScreen } from "./simple-screens.js";
import { VerifyPhraseScreen } from "./verify-phrase-screen.js";

// Onboarding tab (UI_FLOWS §2, KEY_MANAGEMENT §7). The recovery phrase is held only in this
// component's state (the single documented exception, CLAUDE.md §6.2) and dropped as soon as
// the wallet is created or the user leaves the flow.

type Step =
  | { kind: "checking" }
  | { kind: "already" }
  | { kind: "start" }
  | { kind: "generating" }
  | { kind: "show"; words: string[]; verifyPositions: number[] }
  | { kind: "verify"; words: string[]; verifyPositions: number[] }
  | { kind: "create-password"; words: string[]; verifyPositions: number[]; answers: VerifyAnswer[] }
  | { kind: "import" }
  | { kind: "import-password"; mnemonic: string }
  | { kind: "expired" }
  | { kind: "reveal" }
  | { kind: "done"; discoveryIncomplete: boolean };

const CREATE_STEPS = 3;
const IMPORT_STEPS = 2;

export function OnboardingApp() {
  const [step, setStep] = useState<Step>({ kind: "checking" });
  const generate = useAction();

  useEffect(() => {
    let current = true;
    void request("GET_STATUS", undefined).then(
      (status) => {
        // ?mode=reveal comes from Settings → Reveal recovery phrase. The URL carries no secret.
        const reveal = new URLSearchParams(window.location.search).get("mode") === "reveal";
        if (current)
          setStep(status.hasVault ? { kind: reveal ? "reveal" : "already" } : { kind: "start" });
      },
      () => {
        if (current) setStep({ kind: "start" });
      },
    );
    return () => {
      current = false;
    };
  }, []);

  const startCreate = async () => {
    setStep({ kind: "generating" });
    const result = await generate.run(() => request("ONBOARD_GENERATE", undefined));
    if (result.ok) setStep({ kind: "show", ...result.value });
  };
  const toStart = () => {
    setStep({ kind: "start" });
  };

  let progress: { step: number; of: number } | undefined;
  let onBack: (() => void) | undefined;
  let body: React.ReactNode = null;

  switch (step.kind) {
    case "checking":
      break;
    case "already":
      body = <AlreadySetUpScreen />;
      break;
    case "start":
      body = (
        <StartScreen
          onCreate={() => void startCreate()}
          onImport={() => {
            setStep({ kind: "import" });
          }}
        />
      );
      break;
    case "generating":
      progress = { step: 1, of: CREATE_STEPS };
      onBack = toStart;
      body =
        generate.state.kind === "error" ? (
          <div className="space-y-4">
            <ErrorText>{errorCopy(generate.state.code)}</ErrorText>
            <Button variant="secondary" onClick={() => void startCreate()}>
              Try again
            </Button>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-muted">
            <Spinner /> Generating your recovery phrase
          </p>
        );
      break;
    case "show":
      progress = { step: 1, of: CREATE_STEPS };
      onBack = toStart; // discards this phrase; going forward again generates a new one
      body = (
        <ShowPhraseScreen
          words={step.words}
          onContinue={() => {
            setStep({ ...step, kind: "verify" });
          }}
        />
      );
      break;
    case "verify":
      progress = { step: 2, of: CREATE_STEPS };
      onBack = () => {
        setStep({ ...step, kind: "show" });
      };
      body = (
        <VerifyPhraseScreen
          words={step.words}
          positions={step.verifyPositions}
          onShowAgain={() => {
            setStep({ ...step, kind: "show" });
          }}
          onVerified={(answers) => {
            setStep({ ...step, kind: "create-password", answers });
          }}
        />
      );
      break;
    case "create-password":
      progress = { step: 3, of: CREATE_STEPS };
      onBack = () => {
        setStep({ kind: "verify", words: step.words, verifyPositions: step.verifyPositions });
      };
      body = (
        <SetPasswordScreen
          workingText="Securing your wallet"
          submit={(password) => request("ONBOARD_CREATE", { password, answers: step.answers })}
          onDone={() => {
            setStep({ kind: "done", discoveryIncomplete: false });
          }}
          onExpired={() => {
            setStep({ kind: "expired" });
          }}
        />
      );
      break;
    case "import":
      progress = { step: 1, of: IMPORT_STEPS };
      onBack = toStart;
      body = (
        <ImportPhraseScreen
          onContinue={(mnemonic) => {
            setStep({ kind: "import-password", mnemonic });
          }}
        />
      );
      break;
    case "import-password":
      progress = { step: 2, of: IMPORT_STEPS };
      onBack = () => {
        setStep({ kind: "import" });
      };
      body = (
        <SetPasswordScreen
          workingText="Finding your accounts"
          submit={(password) => request("ONBOARD_IMPORT", { mnemonic: step.mnemonic, password })}
          onDone={(result) => {
            const incomplete =
              typeof result === "object" &&
              result !== null &&
              "discoveryIncomplete" in result &&
              result.discoveryIncomplete === true;
            setStep({ kind: "done", discoveryIncomplete: incomplete });
          }}
          onExpired={toStart}
        />
      );
      break;
    case "expired":
      body = <ExpiredScreen onRestart={() => void startCreate()} />;
      break;
    case "reveal":
      body = <RevealPhraseScreen />;
      break;
    case "done":
      body = <DoneScreen discoveryIncomplete={step.discoveryIncomplete} />;
      break;
  }

  return (
    <div data-testid="onboarding" data-step={step.kind}>
      <OnboardingShell stepKey={step.kind} progress={progress} onBack={onBack}>
        {body}
      </OnboardingShell>
    </div>
  );
}
