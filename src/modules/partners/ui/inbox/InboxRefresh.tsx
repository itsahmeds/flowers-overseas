"use client";
/**
 * The inbox list's one client island (spec 011 §2 "Freshness without a reload", §5.3, AC-26;
 * TASK-214): `router.refresh()` every `intervalMs` while the page is visible, stopped after
 * `idleStopMs` without an interaction, with the paused line. The "Refresh" link is a plain link
 * to the list and is rendered from the server too, so without JavaScript it still works.
 *
 * Strings come in as props, resolved on the server: there is no `NextIntlClientProvider` in the
 * application (TASK-085). Logical properties only.
 */
import { useRouter } from "next/navigation";
import { type ReactElement, useEffect, useState } from "react";

import { startInboxRefresh } from "./refresh-timer.ts";

export interface InboxRefreshProps {
  readonly intervalMs: number;
  readonly idleStopMs: number;
  /** The list's own path, the "Refresh" link's target. */
  readonly href: string;
  readonly refreshLabel: string;
  /** Shown once the loop has stopped for idleness. */
  readonly stoppedLine: string;
}

const INTERACTIONS = ["pointerdown", "keydown", "scroll", "focus"] as const;

export function InboxRefresh({
  intervalMs,
  idleStopMs,
  href,
  refreshLabel,
  stoppedLine,
}: InboxRefreshProps): ReactElement {
  const router = useRouter();
  const [stopped, setStopped] = useState(false);

  useEffect(() => {
    const handle = startInboxRefresh({
      intervalMs,
      idleStopMs,
      refresh: () => {
        router.refresh();
      },
      isVisible: () => document.visibilityState === "visible",
      onStop: () => {
        setStopped(true);
      },
    });
    const touch = () => {
      handle.touch();
    };
    const visibility = () => {
      handle.visibilityChanged();
    };
    for (const name of INTERACTIONS) {
      window.addEventListener(name, touch, { passive: true });
    }
    document.addEventListener("visibilitychange", visibility);
    return () => {
      handle.dispose();
      for (const name of INTERACTIONS) window.removeEventListener(name, touch);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [intervalMs, idleStopMs, router]);

  return (
    <p
      className="text-ui text-ink-2 m-0 flex flex-wrap items-center gap-x-[10px] gap-y-[4px]"
      data-fo-inbox-refresh={stopped ? "stopped" : "running"}
    >
      {stopped ? <span role="status">{stoppedLine}</span> : null}
      <a
        className="text-link inline-flex min-h-(--target-min) items-center font-bold"
        href={href}
      >
        {refreshLabel}
      </a>
    </p>
  );
}
