"use client";

/**
 * @purpose Share-link island
 * @spec 018
 *
 * "Share the tracking link" (spec 018 §5.3 "Client JavaScript", §13 Q9; `track-order-*.dc.html`
 * `.s13-tile`; TASK-338): the page's one island. `navigator.share` with the page's own address
 * where the browser has it, otherwise the address is copied and "Link copied." is announced. It
 * sends nothing anywhere itself and reads no order data: the address is the one in the bar, or,
 * on spec 018's post-purchase block (TASK-340), the tracking link the server hands in as `url`.
 */
import { type ReactElement, useState } from "react";

export interface ShareTileProps {
  readonly title: string;
  readonly body: string;
  readonly copied: string;
  readonly className: string;
  /** The link to share; the page's own address when absent (the tracking page). */
  readonly url?: string;
}

export function ShareTile({
  title,
  body,
  copied,
  className,
  url: link,
}: ShareTileProps): ReactElement {
  const [status, setStatus] = useState("");
  const share = async (): Promise<void> => {
    const url = link ?? window.location.href;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ url });
        return;
      } catch {
        // Dismissed, or refused: fall through to the copy.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setStatus(copied);
    } catch {
      setStatus("");
    }
  };
  return (
    <button
      className={className}
      data-fo-track-share=""
      onClick={() => void share()}
      type="button"
    >
      <b>{title}</b>
      <span>{body}</span>
      <span aria-live="polite" className="sr-only">
        {status}
      </span>
    </button>
  );
}
