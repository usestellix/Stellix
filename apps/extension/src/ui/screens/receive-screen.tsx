import type { NetworkId } from "@stellix/core";
import { useState } from "react";
import { GroupedAddress } from "../components/address.js";
import { Button } from "../components/button.js";
import { Callout } from "../components/callout.js";
import { ErrorText } from "../components/error-text.js";
import { FieldLabel, inputClass } from "../components/field.js";
import { CheckIcon, ChevronDownIcon } from "../components/icons.js";
import { MemoTypeToggle } from "../components/memo-type-toggle.js";
import { QrCode } from "../components/qr-code.js";
import { SubScreen } from "../components/sub-screen.js";
import { errorCopy } from "../errorCopy.js";
import { useCopy } from "../hooks/use-copy.js";
import { requestLink, type RequestDraft } from "../lib/request-link.js";
import { displayXlm } from "../lib/xlm.js";

// Receive (UI_FLOWS §6). Public data only. The default QR is the plain G address; a valid
// request switches it to the SEP-7 link. While a request is open but not valid, no QR is shown,
// so nobody scans a code that doesn't match what's on screen.

const COPY = {
  title: "Receive XLM",
  address: "Your address",
  copyAddress: "Copy address",
  copyLink: "Copy payment link",
  copied: "Copied",
  qrAddress: "QR code of your address",
  qrRequest: (x: string) => `QR code requesting ${x} XLM`,
  requesting: (x: string) => `Requesting ${x} XLM`,
  request: "Request a specific amount",
  cancelRequest: "Remove amount",
  amount: "Amount",
  memo: "Memo (optional)",
  enterAmount: "Enter an amount to create a payment link.",
  fixRequest: "Fix the request to show its QR code.",
  unfunded: "Send at least 1 XLM to activate this account.",
  onlyXlm: "Only send XLM on Stellar to this address.",
  testnet: "This is a testnet address — test XLM has no value.",
} as const;

const EMPTY: RequestDraft = { amount: "", memoType: "text", memo: "" };

export function ReceiveScreen({
  address,
  network,
  unfunded,
  onBack,
}: {
  address: string;
  network: NetworkId;
  unfunded: boolean;
  onBack: () => void;
}) {
  const [requesting, setRequesting] = useState(false);
  const [draft, setDraft] = useState<RequestDraft>(EMPTY);
  const copier = useCopy();
  const link = requesting ? requestLink(address, network, draft) : null;
  // One pinned action: the address by default, the payment link while requesting.
  const copyTarget = link === null ? address : link.kind === "ok" ? link.uri : null;

  return (
    <SubScreen
      title={COPY.title}
      network={network}
      onBack={onBack}
      testId="receive"
      footer={
        <div className="space-y-2">
          {copier.error !== null && <ErrorText>{errorCopy(copier.error)}</ErrorText>}
          <Button
            className="w-full"
            data-testid={link === null ? "copy-address" : "copy-link"}
            disabled={copyTarget === null}
            onClick={() => {
              if (copyTarget !== null) void copier.copy(copyTarget);
            }}
          >
            {copier.copied && <CheckIcon size={15} />}
            {copier.copied ? COPY.copied : link === null ? COPY.copyAddress : COPY.copyLink}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-col items-center gap-2" data-testid="qr-area">
          {link === null && <QrCode value={address} label={COPY.qrAddress} />}
          {link?.kind === "ok" && (
            <>
              <QrCode value={link.uri} label={COPY.qrRequest(displayXlm(link.amountStroops))} />
              <p className="tabular text-[13px] font-medium text-ink" data-testid="request-caption">
                {COPY.requesting(displayXlm(link.amountStroops))}
              </p>
            </>
          )}
          {(link?.kind === "empty" || link?.kind === "error") && (
            <div
              className="flex size-[184px] items-center justify-center rounded-lg bg-fill px-6 text-center text-[12px] leading-5 text-muted"
              data-testid="qr-placeholder"
            >
              {link.kind === "empty" ? COPY.enterAmount : COPY.fixRequest}
            </div>
          )}
        </div>

        {/* Right under the QR, so the code stays in view while the request is typed. */}
        {!requesting ? (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => {
                setRequesting(true);
              }}
              className="pressable inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[13px] text-ink-secondary hover-fine:bg-fill"
            >
              {COPY.request}
              <ChevronDownIcon size={13} />
            </button>
          </div>
        ) : (
          <RequestFields
            draft={draft}
            onDraft={setDraft}
            error={link?.kind === "error" ? link : null}
            onCancel={() => {
              setRequesting(false);
              setDraft(EMPTY);
            }}
          />
        )}

        <section className="space-y-1.5">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
            {COPY.address}
          </h2>
          <GroupedAddress address={address} />
        </section>

        {unfunded && <Callout>{COPY.unfunded}</Callout>}

        <div className="space-y-1 text-[12px] leading-5 text-muted">
          <p>{COPY.onlyXlm}</p>
          {network === "testnet" && <p>{COPY.testnet}</p>}
        </div>
      </div>
    </SubScreen>
  );
}

function RequestFields({
  draft,
  onDraft,
  error,
  onCancel,
}: {
  draft: RequestDraft;
  onDraft: (next: RequestDraft) => void;
  error: { field: "amount" | "memo"; code: Parameters<typeof errorCopy>[0] } | null;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-end justify-between">
          <FieldLabel htmlFor="request-amount">{COPY.amount}</FieldLabel>
          <button
            type="button"
            onClick={onCancel}
            className="pressable rounded-md px-1.5 py-0.5 text-[12px] font-medium text-ink-secondary hover-fine:bg-fill"
          >
            {COPY.cancelRequest}
          </button>
        </div>
        <div className="relative">
          <input
            id="request-amount"
            data-testid="request-amount"
            inputMode="decimal"
            value={draft.amount}
            onChange={(e) => {
              onDraft({ ...draft, amount: e.currentTarget.value });
            }}
            placeholder="0"
            autoComplete="off"
            autoFocus
            aria-invalid={error?.field === "amount"}
            className={inputClass(error?.field === "amount", "tabular h-10 pr-12 text-[15px]")}
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[13px] text-muted">
            XLM
          </span>
        </div>
        {error?.field === "amount" && <ErrorText>{errorCopy(error.code)}</ErrorText>}
      </div>
      <div className="space-y-1.5">
        <div className="flex items-end justify-between">
          <FieldLabel htmlFor="request-memo">{COPY.memo}</FieldLabel>
          <MemoTypeToggle
            value={draft.memoType}
            onChange={(memoType) => {
              onDraft({ ...draft, memoType });
            }}
          />
        </div>
        <input
          id="request-memo"
          data-testid="request-memo"
          value={draft.memo}
          inputMode={draft.memoType === "id" ? "numeric" : "text"}
          onChange={(e) => {
            onDraft({ ...draft, memo: e.currentTarget.value });
          }}
          autoComplete="off"
          aria-invalid={error?.field === "memo"}
          className={inputClass(error?.field === "memo", "h-10 text-[14px]")}
        />
        {error?.field === "memo" && <ErrorText>{errorCopy(error.code)}</ErrorText>}
      </div>
    </div>
  );
}
