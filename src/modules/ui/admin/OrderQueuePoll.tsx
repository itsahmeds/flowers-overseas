"use client";

/**
 * The order queue's one island: the 3-second arrival poll and its polite live region (spec 012
 * §2.6 "Arrival within 5 s", §8 "the poll island announces new orders through a polite live
 * region", AC-18; artboard `admin-orders-desktop.dc.html` `.ad-live`; TASK-222).
 *
 * The logic is `queue-poll.ts`; this file wires it to the page: `fetch` of the head endpoint, the
 * document's visibility, the interactions that keep it awake, and Next's router. When the head
 * changes it re-renders the **server** list in place (`router.replace` to the same view with
 * `since`, the head the tab started from, so the server marks the rows that arrived since as
 * "New"); the list itself is never built in the browser. Every word is a prop from the admin
 * catalogue, including the announcement, which the server renders from the rows it marked.
 */
import { useRouter } from "next/navigation";
import {
  type ReactElement,
  startTransition,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  createQueuePoller,
  type QueueHead,
  QueueHeadSchema,
} from "./queue-poll";

export interface OrderQueuePollProps {
  /** `GET` endpoint answering the head (`/admin/api/orders/head`). */
  readonly headUrl: string;
  /** The head the server rendered this view from. */
  readonly initialHead: QueueHead;
  /** This view with `since` set: where an arrival re-renders to. */
  readonly arrivalHref: string;
  /** This view as it is: the "Resume" link reloads it and the poll starts again. */
  readonly resumeHref: string;
  readonly checkingLabel: string;
  readonly pausedLabel: string;
  readonly resumeLabel: string;
  /** What the polite region says about the rows marked "New" ("1 new order"); none at first. */
  readonly announcement?: string;
}

/** The interactions that count as activity for the 15-minute pause. */
const ACTIVITY_EVENTS = [
  "pointerdown",
  "keydown",
  "scroll",
  "focusin",
] as const;

async function readHead(url: string): Promise<QueueHead | null> {
  const response = await fetch(url, {
    cache: "no-store",
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });
  if (!response.ok) return null;
  const parsed = QueueHeadSchema.safeParse(await response.json());
  return parsed.success ? parsed.data : null;
}

export function OrderQueuePoll({
  headUrl,
  initialHead,
  arrivalHref,
  resumeHref,
  checkingLabel,
  pausedLabel,
  resumeLabel,
  announcement,
}: OrderQueuePollProps): ReactElement {
  const router = useRouter();
  const [paused, setPaused] = useState(false);
  // The props of the first render start the poll; a re-render after an arrival keeps it.
  const start = useRef({ headUrl, initialHead });
  const target = useRef(arrivalHref);
  useEffect(() => {
    target.current = arrivalHref;
  }, [arrivalHref]);

  useEffect(() => {
    const poller = createQueuePoller(start.current.initialHead, {
      readHead: () => readHead(start.current.headUrl),
      isVisible: () => document.visibilityState === "visible",
      now: () => Date.now(),
      setTimer: (run, ms) => window.setTimeout(run, ms),
      clearTimer: (handle) => {
        window.clearTimeout(handle as number);
      },
      onArrival: () => {
        const here = `${window.location.pathname}${window.location.search}`;
        startTransition(() => {
          if (here === target.current) router.refresh();
          else router.replace(target.current, { scroll: false });
        });
      },
      onPause: () => {
        setPaused(true);
      },
    });
    const wake = (): void => {
      poller.activity();
    };
    for (const type of ACTIVITY_EVENTS) {
      window.addEventListener(type, wake, { passive: true });
    }
    poller.start();
    return () => {
      poller.stop();
      for (const type of ACTIVITY_EVENTS) {
        window.removeEventListener(type, wake);
      }
    };
  }, [router]);

  return (
    <span
      aria-live="polite"
      className={`text-ink-2 inline-flex flex-wrap items-center gap-[8px] text-[13px] before:size-[8px] before:shrink-0 before:rounded-full before:content-[''] ${
        paused
          ? "before:bg-ink-3 before:shadow-[0_0_0_3px_var(--color-paper-3)]"
          : "before:bg-stem before:shadow-[0_0_0_3px_var(--color-leaf-wash)]"
      }`}
    >
      {paused ? (
        <span>
          {pausedLabel}{" "}
          <a
            href={resumeHref}
            className="text-link inline-flex min-h-[24px] items-center text-[14px] font-bold underline underline-offset-[3px]"
          >
            {resumeLabel}
          </a>
        </span>
      ) : (
        <span>{checkingLabel}</span>
      )}
      <span className="sr-only">{announcement}</span>
    </span>
  );
}
