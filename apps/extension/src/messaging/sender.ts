import { StellixError } from "@stellix/core";
import { EXTENSION_PAGES, REQUESTS, type ExtensionPage, type RequestType } from "./protocol.js";

/** The minimal slice of chrome.runtime.MessageSender we rely on. */
export interface MessageSenderLike {
  id?: string | undefined;
  url?: string | undefined;
}

export interface SenderContext {
  /** chrome.runtime.id */
  runtimeId: string;
  /** chrome.runtime.getURL(""), e.g. "chrome-extension://<id>/" */
  extensionBaseUrl: string;
}

/**
 * Step 1–2 of ARCHITECTURE §5: the sender must be this extension and an extension page.
 * Returns which page sent the message.
 */
export function authenticateSender(sender: MessageSenderLike, ctx: SenderContext): ExtensionPage {
  if (sender.id !== ctx.runtimeId) throw unauthorized("foreign sender id");
  const url = sender.url;
  if (url?.startsWith(ctx.extensionBaseUrl) !== true)
    throw unauthorized("non-extension sender url");

  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    throw unauthorized("unparseable sender url");
  }
  const page = pageForPath(pathname);
  if (page === null) throw unauthorized("unknown extension page");
  return page;
}

/** Enforces per-type page restrictions (e.g. onboarding-only types, SECURITY §4.3). */
export function authorizeRequest(type: RequestType, page: ExtensionPage): void {
  const allowed: readonly ExtensionPage[] = REQUESTS[type].allowedFrom;
  if (!allowed.includes(page)) throw unauthorized("request type not allowed from this page");
}

function pageForPath(pathname: string): ExtensionPage | null {
  for (const [page, path] of Object.entries(EXTENSION_PAGES)) {
    if (path === pathname) return page as ExtensionPage;
  }
  return null;
}

function unauthorized(reason: string): StellixError {
  return new StellixError("UNAUTHORIZED_SENDER", `Rejected message: ${reason}`);
}
