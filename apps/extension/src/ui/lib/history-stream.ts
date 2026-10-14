import { parseHistoryRecord, type HistoryRecord } from "@stellix/core";

// Horizon SSE for new payments while the popup is open (NETWORK §6). Lives in the shell: core
// bans EventSource. The browser reconnects by itself after transient errors (Horizon sends
// `id:` = paging token, so a reconnect resumes via Last-Event-ID); only a closed stream (e.g.
// 404 for an unfunded account) is reported, and the caller falls back to polling.

export type EventSourceCtor = new (
  url: string,
) => Pick<EventSource, "onmessage" | "onerror" | "close" | "readyState">;

const CLOSED = 2; // EventSource.CLOSED

/** Opens the stream; returns a closer. `onClosed` fires at most once. */
export function openHistoryStream(
  url: string,
  onRecord: (record: HistoryRecord) => void,
  onClosed: () => void,
  // Typed as possibly absent: lib.dom declares it, but not every runtime has it.
  Source: EventSourceCtor | undefined = (globalThis as { EventSource?: EventSourceCtor })
    .EventSource,
): () => void {
  if (Source === undefined) {
    onClosed();
    return () => undefined;
  }
  let open = true;
  const source = new Source(url);
  source.onmessage = (event: MessageEvent<unknown>) => {
    if (!open || typeof event.data !== "string") return;
    let json: unknown;
    try {
      json = JSON.parse(event.data);
    } catch {
      return; // Horizon's "hello" and keep-alives aren't records.
    }
    const record = parseHistoryRecord(json);
    if (record !== null) onRecord(record);
  };
  source.onerror = () => {
    if (!open || source.readyState !== CLOSED) return;
    open = false;
    onClosed();
  };
  return () => {
    open = false;
    source.close();
  };
}
