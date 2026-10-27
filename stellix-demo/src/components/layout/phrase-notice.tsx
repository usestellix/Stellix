import { LockIcon } from "@/components/ui/icons";
import { Container } from "@/components/ui/container";

// Permanent on every page, including 404. Not dismissible.
export function PhraseNotice() {
  return (
    <aside aria-label="Recovery phrase notice" className="border-b border-line bg-surface">
      <Container className="flex items-center justify-center gap-2 py-2 text-center text-sm text-ink-2">
        <LockIcon className="shrink-0" />
        <p>
          <strong className="font-semibold text-ink">
            Stellix will never ask for your recovery phrase.
          </strong>{" "}
          Never share it with anyone.
        </p>
      </Container>
    </aside>
  );
}
