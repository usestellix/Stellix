import { isStellixError, type NetworkId } from "@stellix/core";
import { useState } from "react";
import { request } from "../../../messaging/client.js";
import { ENABLED_NETWORKS } from "../../../build-flags.js";
import { Button } from "../../components/button.js";
import { ErrorText } from "../../components/error-text.js";
import { inputClass } from "../../components/field.js";
import { SubScreen } from "../../components/sub-screen.js";
import { cx } from "../../cx.js";
import { AnalyzeReport } from "./analyze-report.js";
import { NETWORK_NAMES, analyzeErrorText, type AnalyzeView } from "./model.js";

// Analyze (Mode C; SHIELD §2, §8; #35). Paste a transaction XDR or a web+stellar:tx link and see
// what it does and what Stellix would do if a site asked it to sign it. Analyze-only: the only
// request this screen sends is SHIELD_ANALYZE, which never signs and stores nothing signable.

const COPY = {
  title: "Analyze",
  intro:
    "Paste a transaction or a web+stellar:tx link to see what it does and what Stellix would do " +
    "if a site asked you to sign it. Nothing is signed or sent.",
  inputLabel: "Transaction XDR or link",
  network: "Network",
  analyze: "Analyze",
  analyzing: "Analyzing",
  clear: "Clear",
} as const;

type State =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "error"; text: string }
  | { kind: "done"; result: AnalyzeView };

export function AnalyzeScreen({ network, onBack }: { network: NetworkId; onBack: () => void }) {
  const [input, setInput] = useState("");
  const [target, setTarget] = useState<NetworkId>(network);
  const [state, setState] = useState<State>({ kind: "idle" });

  // A report describes exactly what was analyzed: any change to the input or network drops it.
  const edit = (next: () => void) => {
    next();
    if (state.kind !== "working") setState({ kind: "idle" });
  };

  const analyze = async () => {
    setState({ kind: "working" });
    try {
      const result = await request("SHIELD_ANALYZE", { input, network: target });
      setState({ kind: "done", result });
    } catch (err: unknown) {
      setState({
        kind: "error",
        text: isStellixError(err)
          ? analyzeErrorText(err.code, err.details, ENABLED_NETWORKS)
          : analyzeErrorText("INTERNAL_ERROR", undefined, ENABLED_NETWORKS),
      });
    }
  };

  const working = state.kind === "working";
  return (
    <SubScreen title={COPY.title} network={network} onBack={onBack} testId="analyze">
      <div className="space-y-4">
        <p className="text-[13px] leading-5 text-ink-secondary">{COPY.intro}</p>

        {ENABLED_NETWORKS.length > 1 && (
          <div
            role="radiogroup"
            aria-label={COPY.network}
            className="flex gap-1 rounded-lg bg-fill p-1"
          >
            {ENABLED_NETWORKS.map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={target === id}
                data-testid={`analyze-network-${id}`}
                disabled={working}
                onClick={() => {
                  edit(() => {
                    setTarget(id);
                  });
                }}
                className={cx(
                  "pressable flex-1 rounded-md py-1.5 text-[13px] font-medium",
                  target === id ? "bg-surface text-ink shadow-raised" : "text-muted",
                )}
              >
                {NETWORK_NAMES[id]}
              </button>
            ))}
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="analyze-input" className="text-[13px] font-medium text-ink-secondary">
            {COPY.inputLabel}
          </label>
          <textarea
            id="analyze-input"
            data-testid="analyze-input"
            rows={5}
            spellCheck={false}
            autoComplete="off"
            value={input}
            disabled={working}
            onChange={(e) => {
              const value = e.target.value;
              edit(() => {
                setInput(value);
              });
            }}
            className={inputClass(
              state.kind === "error",
              "resize-none py-2 font-mono text-[12px] leading-5 [overflow-wrap:anywhere]",
            )}
          />
          {state.kind === "error" && <ErrorText>{state.text}</ErrorText>}
        </div>

        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled={working || input === ""}
            onClick={() => {
              setInput("");
              setState({ kind: "idle" });
            }}
          >
            {COPY.clear}
          </Button>
          <Button
            className="flex-1"
            busy={working}
            disabled={input.trim() === ""}
            onClick={() => void analyze()}
            data-testid="analyze-submit"
          >
            {working ? COPY.analyzing : COPY.analyze}
          </Button>
        </div>

        {state.kind === "done" && <AnalyzeReport result={state.result} />}
      </div>
    </SubScreen>
  );
}
