import type { ReactNode } from "react";
import { ComingSoon, Statement } from "@/components/claims";
import { RULE_CATEGORIES } from "@/content/rules";
import { isShipped } from "@/content/shield-status";

// How Shield works, shared by the home page and /shield so both say exactly the same thing.

// What Shield checks, by category, each with its status.
export function RuleCategoryGrid() {
  return (
    <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {RULE_CATEGORIES.map((category) => (
        <li key={category.id} className="rounded-card bg-surface p-6 shadow-ring">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-ink">{category.title}</h3>
            {!isShipped(category.capability) && <ComingSoon />}
          </div>
          <p className="mt-2 text-sm text-ink-2">{category.description}</p>
          <ul className="mt-4 space-y-2 border-t border-line pt-4">
            {category.checks.map((check) => (
              <li key={check} className="flex gap-3 text-sm text-ink">
                <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-faint" />
                {check}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

// Evidence → policy → only the signing step signs.
export function DecisionSteps() {
  return (
    <>
      <ol className="grid gap-4 md:grid-cols-3">
        <Step n={1} title="Evidence">
          Shield decodes the transaction and runs every check. Each finding has a severity and a
          plain-language explanation. A check that couldn&rsquo;t run is listed as not checked.
        </Step>
        <Step n={2} title="Policy">
          The most serious finding decides: findings are never averaged. Some need you to confirm,
          some need you to type CONFIRM, and some block the signature. A check that couldn&rsquo;t
          run always needs your review.
        </Step>
        <Step n={3} title="Signing">
          Right before signing, Stellix confirms the transaction is exactly the one Shield analyzed,
          on the same network, and that the analysis hasn&rsquo;t expired. Any change sends it back
          to be checked again.
        </Step>
      </ol>
      <p className="mt-8 max-w-(--container-prose) text-base text-ink-2">
        <Statement id="dappBlocksHaveNoOverride" />
      </p>
    </>
  );
}

// What Shield can't do.
export function ShieldLimits() {
  return (
    <ul className="grid max-w-(--container-prose) gap-6">
      <Limit title="It won't catch every malicious request.">
        Shield looks for known patterns. A new trick may not match any of them, so read what Shield
        shows you, not only whether it flagged something.
      </Limit>
      <Limit title="It can't see signatures you make in other wallets.">
        No Stellar wallet lets another one check what it&rsquo;s about to sign.{" "}
        <Statement id="analyzeAnything" />
      </Limit>
      <Limit title="An unavailable check is shown as unavailable.">
        If Shield can&rsquo;t complete a check, for example because a server didn&rsquo;t answer, it
        says which check didn&rsquo;t run. It never counts it as passed.
      </Limit>
      <Limit title="Analyzing never signs.">
        A pasted transaction is only read. Shield reports what Stellix would do if asked to sign it,
        and nothing is signed.
      </Limit>
    </ul>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="rounded-card bg-surface p-6 shadow-ring">
      <p className="font-mono text-label text-muted">{n}</p>
      <h3 className="mt-2 text-base font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-sm text-ink-2">{children}</p>
    </li>
  );
}

function Limit({ title, children }: { title: string; children: ReactNode }) {
  return (
    <li>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <p className="mt-1 text-base text-ink-2">{children}</p>
    </li>
  );
}
