import { ComingSoon, Statement } from "@/components/claims";
import { Badge } from "@/components/ui/badge";
import { isShipped } from "@/content/shield-status";

// An illustrative drainer transaction and what Shield reports for it. Static, not a live scan:
// the sentences are Shield's own copy (extension repo, packages/core/src/security/copy) with
// made-up, shortened addresses. Mode C (pasted) wording: "Stellix would block this".

const OPERATIONS = [
  "Sends 5 XLM from GDK4…7WQA to GBX2…M3RT.",
  "Gives the signer key GCZT…H2VE a weight of 10 on GDK4…7WQA, adding it if it's new.",
];

const FINDING = {
  title: "New signer on your account",
  body: "Operation 2 gives key GCZT…H2VE a signing weight of 10 on your account GDK4…7WQA. A signer with enough weight can move your funds and change your account without your recovery phrase.",
};

export function ExampleTransaction() {
  return (
    <figure aria-labelledby="example-title" className="w-full">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>Example</Badge>
        {!isShipped("analyze-pasted") && <ComingSoon />}
      </div>
      <div className="mt-3 rounded-card bg-surface p-5 shadow-raised sm:p-6">
        <h2 id="example-title" className="text-sm font-medium text-muted">
          A pasted transaction, decoded
        </h2>
        <ol className="mt-4 space-y-3">
          {OPERATIONS.map((sentence, i) => (
            <li key={sentence} className={`reveal reveal-${i + 1} flex gap-3`}>
              <span className="mt-0.5 shrink-0 font-mono text-label text-muted">Op {i + 1}</span>
              <span className="text-sm text-ink">{sentence}</span>
            </li>
          ))}
        </ol>
        <div className="reveal reveal-3 mt-5 rounded-control bg-danger-fill p-4">
          <div className="flex items-center gap-2">
            <Badge tone="danger">Critical</Badge>
            <h3 className="text-sm font-semibold text-ink">{FINDING.title}</h3>
          </div>
          <p className="mt-2 text-sm text-ink-2">{FINDING.body}</p>
        </div>
        <p className="reveal reveal-4 mt-4 flex items-center gap-2 rounded-control border border-danger px-4 py-3 text-sm font-semibold text-danger">
          Stellix would block this
        </p>
      </div>
      <figcaption className="mt-3 text-sm text-muted">
        <Statement id="exampleCaption" /> An illustrative transaction with shortened addresses, not
        a live scan.
      </figcaption>
    </figure>
  );
}
