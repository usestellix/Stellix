import { isAccountOrigin, type HistoryItem, type NetworkId } from "@stellix/core";
import { useEffect, useRef } from "react";
import { ActivityRow, ActivitySkeleton } from "../components/activity-row.js";
import { Button } from "../components/button.js";
import { ErrorText } from "../components/error-text.js";
import { RefreshIcon } from "../components/icons.js";
import { Spinner } from "../components/spinner.js";
import { SubScreen } from "../components/sub-screen.js";
import { errorCopy } from "../errorCopy.js";
import { useNow } from "../hooks/use-now.js";
import type { HistoryController, HistorySnapshot } from "../lib/history-controller.js";

// Activity (UI_FLOWS §7): infinite scroll, 20 per page. States: loading, empty, error with
// retry, end of list. Horizon keeps about a year of history, so the end is worded by what we
// actually know: the account's first operation, or simply nothing older on this server.

export const HISTORY_COPY = {
  title: "Activity",
  empty: "No activity yet",
  origin: "This is where your account started.",
  noOlder: "No older activity available from this server.",
  retry: "Try again",
} as const;

export function HistoryScreen({
  network,
  snapshot,
  controller,
  onOpen,
  onBack,
}: {
  network: NetworkId;
  snapshot: HistorySnapshot;
  controller: HistoryController;
  onOpen: (item: HistoryItem) => void;
  onBack: () => void;
}) {
  const sentinel = useRef<HTMLDivElement>(null);

  // Load more when the bottom comes into view. Re-observed after every page so a short page
  // (sentinel still visible) keeps loading.
  const { items, nextCursor, more } = snapshot;
  useEffect(() => {
    const el = sentinel.current;
    if (el === null || nextCursor === null || more !== "idle") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) void controller.loadMore();
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [controller, items.length, nextCursor, more]);

  return (
    <SubScreen title={HISTORY_COPY.title} network={network} onBack={onBack} testId="history">
      <ActivityList snapshot={snapshot} onOpen={onOpen} onRetry={() => void controller.refresh()} />
      {snapshot.phase === "ready" && items.length > 0 && (
        <div
          className="pt-3"
          data-testid="history-footer"
          data-state={nextCursor === null ? "end" : more}
        >
          {nextCursor !== null && more !== "error" && (
            <div ref={sentinel} className="flex h-10 items-center justify-center text-muted">
              {more === "loading" && <Spinner />}
            </div>
          )}
          {more === "error" && snapshot.moreError !== null && (
            <div className="space-y-2 px-2">
              <ErrorText>{errorCopy(snapshot.moreError)}</ErrorText>
              <Button variant="secondary" size="sm" onClick={() => void controller.loadMore()}>
                <RefreshIcon size={14} />
                {HISTORY_COPY.retry}
              </Button>
            </div>
          )}
          {nextCursor === null && (
            <p className="px-2 py-3 text-center text-[12px] text-faint" data-testid="history-end">
              {items.at(-1) !== undefined && isAccountOrigin(items.at(-1) as HistoryItem)
                ? HISTORY_COPY.origin
                : HISTORY_COPY.noOlder}
            </p>
          )}
        </div>
      )}
    </SubScreen>
  );
}

/** The list body shared with Home (which passes `limit`). */
export function ActivityList({
  snapshot,
  onOpen,
  onRetry,
  limit,
}: {
  snapshot: HistorySnapshot;
  onOpen: (item: HistoryItem) => void;
  onRetry: () => void;
  limit?: number;
}) {
  const now = useNow();
  if (snapshot.phase === "loading") return <ActivitySkeleton />;
  if (snapshot.phase === "error") {
    return (
      <div className="space-y-2 px-2" data-testid="activity-error">
        <ErrorText>{errorCopy(snapshot.error ?? "INTERNAL_ERROR")}</ErrorText>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RefreshIcon size={14} />
          {HISTORY_COPY.retry}
        </Button>
      </div>
    );
  }
  if (snapshot.items.length === 0) {
    return (
      <p className="px-2 py-4 text-center text-[13px] text-muted" data-testid="activity-empty">
        {HISTORY_COPY.empty}
      </p>
    );
  }
  const items = limit === undefined ? snapshot.items : snapshot.items.slice(0, limit);
  return (
    <ul className="space-y-0.5" data-testid="activity-list">
      {items.map((item) => (
        <ActivityRow key={item.id} item={item} now={now} onOpen={onOpen} />
      ))}
    </ul>
  );
}
