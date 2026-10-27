import { Badge } from "@/components/ui/badge";
import {
  SHIELD_CAPABILITIES,
  STATEMENTS,
  allShipped,
  capability,
  type CapabilityId,
  type StatementId,
} from "@/content/shield-status";

export function ComingSoon() {
  return <Badge>Coming soon</Badge>;
}

// One capability's claim, with "Coming soon" if it isn't in the released build.
export function Claim({ id }: { id: CapabilityId }) {
  const c = capability(id);
  return (
    <>
      {c.claim}
      {c.status === "coming" && (
        <>
          {" "}
          <ComingSoon />
        </>
      )}
    </>
  );
}

// A statement from shield-status.ts, with "Coming soon" unless every capability it depends on
// has shipped.
export function Statement({ id }: { id: StatementId }) {
  const s = STATEMENTS[id];
  return (
    <>
      {s.text}
      {!allShipped(s.requires) && (
        <>
          {" "}
          <ComingSoon />
        </>
      )}
    </>
  );
}

// Every Shield capability, shipped first, each with its status.
export function CapabilityList() {
  const ordered = [...SHIELD_CAPABILITIES].sort(
    (a, b) => Number(a.status === "coming") - Number(b.status === "coming"),
  );
  return (
    <ul className="divide-y divide-line rounded-card bg-surface shadow-ring">
      {ordered.map((c) => (
        <li key={c.id} className="flex items-start justify-between gap-4 px-5 py-4">
          <span className="text-base text-ink">{c.claim}</span>
          {c.status === "coming" ? <ComingSoon /> : <Badge tone="success">Available</Badge>}
        </li>
      ))}
    </ul>
  );
}
