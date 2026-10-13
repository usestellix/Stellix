import type { VerifyAnswer } from "@stellix/core";
import { useEffect, useState } from "react";
import { request } from "../../../messaging/client.js";
import { Button } from "../../components/button.js";
import { ErrorText } from "../../components/error-text.js";
import { errorCopy } from "../../errorCopy.js";
import { useAction } from "../../hooks/use-request.js";
import { AlreadySetUpScreen, DoneScreen, ExpiredScreen, StartScreen } from "./simple-screens.js";
import { ImportPhraseScreen } from "./import-phrase-screen.js";
import { SetPasswordScreen } from "./set-password-screen.js";
import { ShowPhraseScreen } from "./show-phrase-screen.js";
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
  | { kind: "create-password"; answers: VerifyAnswer[] }
  | { kind: "import" }
  | { kind: "import-password"; mnemonic: string }
  | { kind: "expired" }
  | { kind: "done" };

export function OnboardingApp() {
  const [step, setStep] = useState<Step>({ kind: "checking" });
  const generate = useAction();

  useEffect(() => {
    let current = true;
    void request("GET_STATUS", undefined).then(
      (status) => {
        if (current) setStep(status.hasVault ? { kind: "already" } : { kind: "start" });
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

  const body = (() => {
    switch (step.kind) {
      case "checking":
        return null;
      case "already":
        return <AlreadySetUpScreen />;
      case "start":
        return (
          <StartScreen
            onCreate={() => void startCreate()}
            onImport={() => {
              setStep({ kind: "import" });
            }}
          />
        );
      case "generating":
        return generate.state.kind === "error" ? (
          <div className="space-y-3">
            <ErrorText>{errorCopy(generate.state.code)}</ErrorText>
            <Button onClick={() => void startCreate()}>Try again</Button>
          </div>
        ) : (
          <p className="text-muted">Generating your recovery phrase…</p>
        );
      case "show":
        return (
          <ShowPhraseScreen
            words={step.words}
            onContinue={() => {
              setStep({ ...step, kind: "verify" });
            }}
          />
        );
      case "verify":
        return (
          <VerifyPhraseScreen
            words={step.words}
            positions={step.verifyPositions}
            onShowAgain={() => {
              setStep({ ...step, kind: "show" });
            }}
            onVerified={(answers) => {
              setStep({ kind: "create-password", answers });
            }}
          />
        );
      case "create-password":
        return (
          <SetPasswordScreen
            workingText="Securing your wallet…"
            submit={(password) => request("ONBOARD_CREATE", { password, answers: step.answers })}
            onDone={() => {
              setStep({ kind: "done" });
            }}
            onExpired={() => {
              setStep({ kind: "expired" });
            }}
          />
        );
      case "import":
        return (
          <ImportPhraseScreen
            onContinue={(mnemonic) => {
              setStep({ kind: "import-password", mnemonic });
            }}
          />
        );
      case "import-password":
        return (
          <SetPasswordScreen
            workingText="Securing your wallet and finding your accounts…"
            submit={(password) => request("ONBOARD_IMPORT", { mnemonic: step.mnemonic, password })}
            onDone={() => {
              setStep({ kind: "done" });
            }}
            onExpired={() => {
              setStep({ kind: "start" });
            }}
          />
        );
      case "expired":
        return <ExpiredScreen onRestart={() => void startCreate()} />;
      case "done":
        return <DoneScreen />;
    }
  })();

  return (
    <main
      className="mx-auto max-w-[480px] px-4 py-12"
      data-testid="onboarding"
      data-step={step.kind}
    >
      {body}
    </main>
  );
}
