import { StellixError } from "../errors.js";
import { HISTORY_PAGE_SIZE, type HorizonClient } from "../network/horizon-client.js";
import type {
  AccountRecord,
  AsyncSubmitResponse,
  FeeStats,
  HorizonRoot,
  EffectRecord,
  HistoryRecord,
  LedgerRecord,
  PaymentRecord,
  TransactionRecord,
} from "../network/horizon-schemas.js";

/**
 * FakeHorizonClient (TESTING §1): an in-memory Horizon with scripted behaviour and a call log.
 * Unset reads reject, so a test only wires what it uses.
 */
export class FakeHorizonClient implements HorizonClient {
  readonly accounts = new Map<string, AccountRecord>();
  readonly transactions = new Map<string, TransactionRecord>();
  readonly payments = new Map<string, PaymentRecord[]>();
  /** Newest first, as Horizon orders them; paged by paging_token. */
  readonly history = new Map<string, HistoryRecord[]>();
  readonly effects = new Map<string, EffectRecord[]>();
  /** Accounts whose history page throws NETWORK_ERROR. */
  readonly failingHistory = new Set<string>();
  readonly calls: { method: string; arg?: string }[] = [];
  /** Accounts whose lookup throws NETWORK_ERROR. */
  readonly failingAccounts = new Set<string>();
  root: HorizonRoot | null = null;
  ledger: LedgerRecord | null = null;
  feeStats: FeeStats | null = null;
  /** Scripted async-submit responses, consumed in order. A StellixError entry is thrown. */
  submitScript: (AsyncSubmitResponse | StellixError)[] = [];
  /** Called on each submit (e.g. to put the tx "on chain" for later getTransaction). */
  onSubmit?: (envelopeXdr: string) => void;
  /** getTransaction throws NETWORK_ERROR while > 0 (decremented per call). */
  transactionFailures = 0;
  private inFlight = 0;
  maxInFlight = 0;

  private async track<T>(
    method: string,
    arg: string | undefined,
    fn: () => T | Promise<T>,
  ): Promise<T> {
    this.calls.push(arg === undefined ? { method } : { method, arg });
    this.inFlight++;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    try {
      await Promise.resolve();
      return await fn();
    } finally {
      this.inFlight--;
    }
  }

  private static missing(what: string): never {
    throw new Error(`FakeHorizonClient: ${what} not scripted`);
  }

  getRoot = () =>
    this.track("getRoot", undefined, () => this.root ?? FakeHorizonClient.missing("root"));
  getLatestLedger = () =>
    this.track(
      "getLatestLedger",
      undefined,
      () => this.ledger ?? FakeHorizonClient.missing("ledger"),
    );
  getFeeStats = () =>
    this.track(
      "getFeeStats",
      undefined,
      () => this.feeStats ?? FakeHorizonClient.missing("feeStats"),
    );
  getAccount = (id: string) =>
    this.track("getAccount", id, () => {
      if (this.failingAccounts.has(id)) throw new StellixError("NETWORK_ERROR", "down", true);
      return this.accounts.get(id) ?? null;
    });
  getTransaction = (hash: string) =>
    this.track("getTransaction", hash, () => {
      if (this.transactionFailures > 0) {
        this.transactionFailures--;
        throw new StellixError("NETWORK_ERROR", "down", true);
      }
      return this.transactions.get(hash) ?? null;
    });
  getPayments = (id: string) => this.track("getPayments", id, () => this.payments.get(id) ?? []);
  getHistoryPage = (id: string, cursor?: string) =>
    this.track("getHistoryPage", cursor === undefined ? id : `${id}@${cursor}`, () => {
      if (this.failingHistory.has(id)) throw new StellixError("NETWORK_ERROR", "down", true);
      const all = this.history.get(id) ?? [];
      const at = cursor === undefined ? -1 : all.findIndex((r) => r.paging_token === cursor);
      const records =
        cursor !== undefined && at < 0 ? [] : all.slice(at + 1, at + 1 + HISTORY_PAGE_SIZE);
      const last = records.at(-1);
      return {
        records,
        nextCursor:
          records.length === HISTORY_PAGE_SIZE && last !== undefined ? last.paging_token : null,
      };
    });
  getOperationEffects = (operationId: string) =>
    this.track(
      "getOperationEffects",
      operationId,
      () => this.effects.get(operationId) ?? FakeHorizonClient.missing(`effects ${operationId}`),
    );
  submitTransactionAsync = (envelopeXdr: string) =>
    this.track("submitTransactionAsync", undefined, () => {
      this.onSubmit?.(envelopeXdr);
      const next = this.submitScript.shift() ?? FakeHorizonClient.missing("submit response");
      if (next instanceof StellixError) throw next;
      return next;
    });

  count(method: string): number {
    return this.calls.filter((c) => c.method === method).length;
  }
}
