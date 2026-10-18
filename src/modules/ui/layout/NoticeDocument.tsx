/**
 * The notice document (spec 004 §5.3, AC-12; TASK-055).
 *
 * The page the site shows when there is nothing to sell: the 404. It is a **Server Component** with no state, no effect and no
 * client import, so the 404 stays HTML with a status code (AC-8).
 *
 * The two 500 boundaries render the same shell without this component, because Next requires an
 * error boundary to be a Client Component and a client chunk that reaches `src/modules/ui` reaches
 * the design system's islands with it. That is why the skin lives in `./noticeShell.ts` as plain
 * strings: three documents, one appearance, and `tests/unit/ui-notice-shell.test.ts` fails if one
 * of them stops using it.
 *
 * **Why these documents look like this.** They are not on the founder-approved homepage canvas,
 * and `errors-*.dc.html` draws them with the full commerce chrome, which none of them may have:
 * the 404's header would be a second document's worth of registry reads,
 * and the wireframe's own note for the 500 says "minimal chrome: the wordmark, the copy, two
 * actions" — a page that renders because something else broke must not depend on the machinery
 * that broke. So the shell is the TASK-055 row's construction, which is the wireframes' content in
 * the artboards' type treatment: a centred `--measure` column, the masthead's own lockup at the
 * masthead's own metrics, the `.label` voice for the document's metadata and the `.display` voice
 * for its heading. Recorded in the PR body rather than silently resolved.
 */
import type { ReactElement, ReactNode } from "react";

import { Mark } from "../icons/Mark.tsx";
import { Wordmark } from "../icons/Wordmark.tsx";

import {
  NOTICE_404_FRAME,
  NOTICE_404_HEADER,
  NOTICE_404_HEADER_FRAME,
  NOTICE_404_MAIN,
  NOTICE_404_PAGE,
  NOTICE_404_ROUTE,
  NOTICE_LETTER,
  NOTICE_LETTER_BODY,
  NOTICE_LETTER_HEADING,
  NOTICE_LETTER_META,
  NOTICE_BLOCK,
  NOTICE_BODY,
  NOTICE_HEADING,
  NOTICE_LOCKUP,
  NOTICE_MAIN,
  NOTICE_MARK,
  NOTICE_META,
  NOTICE_WORDMARK_OUTLINED,
} from "./noticeShell.ts";

export interface NoticeDocumentProps {
  /** The trading name, from `src/config/company.ts` — never a literal (§7). */
  readonly wordmark: string;
  /**
   * The lockup's destination, when there is one.
   */
  readonly lockupHref?: string | undefined;
  /**
   * The `.label` metadata line above the heading — the HTTP status on an error document. Digits
   * only there, so nothing needs translating; a caller with words passes a message.
   */
  readonly meta?: string | undefined;
  readonly heading: string;
  readonly body: string;
  /** The actions. */
  readonly children?: ReactNode;
  /**
   * The v2 error letter (TASK-179): the 404 passes it. Without it the document renders the v1
   * column.
   */
  readonly letter?: boolean;
}

export function NoticeDocument({
  wordmark,
  lockupHref,
  meta,
  heading,
  body,
  children,
  letter = false,
}: NoticeDocumentProps): ReactElement {
  const lockup = (
    <>
      <Mark className={NOTICE_MARK} />
      {/* The outlined wordmark (spec 004 §14 A21 clause 3), named by the trading name. */}
      <Wordmark className={NOTICE_WORDMARK_OUTLINED} label={wordmark} />
    </>
  );

  const lockupElement =
    lockupHref === undefined ? (
      <div className={NOTICE_LOCKUP}>{lockup}</div>
    ) : (
      <a className={NOTICE_LOCKUP} href={lockupHref}>
        {lockup}
      </a>
    );

  if (letter) {
    // The round-2 404 (spec 004 §14 A24 clause 6; TASK-191): the logo alone in a ruled header,
    // then the document, the dashed route behind the letter. The route's path is the artboard's.
    // The header bar is the first block of `<main>`, so the logo is where AC-31 measures every
    // page's first block (x 56 at 1440, x 20 at 390), while the letter is centred as drawn.
    return (
      <main className={NOTICE_404_PAGE} id="main">
        <header className={NOTICE_404_HEADER}>
          <div className={NOTICE_404_HEADER_FRAME}>{lockupElement}</div>
        </header>
        <div className={NOTICE_404_MAIN} data-fo-notice-404>
          <svg
            aria-hidden="true"
            className={NOTICE_404_ROUTE}
            data-fo-notice-route
            fill="none"
            focusable="false"
            preserveAspectRatio="none"
            viewBox="0 0 1440 700"
          >
            <path
              d="M-20 520 C 200 420, 260 640, 470 560 S 760 300, 640 220 S 420 260, 520 120 S 980 60, 1060 260 S 1300 520, 1460 380"
              stroke="currentColor"
              strokeDasharray="8 9"
              strokeLinecap="round"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <div className={NOTICE_404_FRAME}>
            <div className={NOTICE_LETTER} data-fo-notice-letter>
              {meta === undefined ? null : (
                <p className={NOTICE_LETTER_META}>{meta}</p>
              )}
              <h1 className={NOTICE_LETTER_HEADING}>{heading}</h1>
              <p className={NOTICE_LETTER_BODY}>{body}</p>
              {children}
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={NOTICE_MAIN} id="main">
      {lockupHref === undefined ? (
        <div className={NOTICE_LOCKUP}>{lockup}</div>
      ) : (
        <a className={NOTICE_LOCKUP} href={lockupHref}>
          {lockup}
        </a>
      )}
      <div className={NOTICE_BLOCK}>
        {meta === undefined ? null : <p className={NOTICE_META}>{meta}</p>}
        <h1 className={NOTICE_HEADING}>{heading}</h1>
        <p className={NOTICE_BODY}>{body}</p>
      </div>
      {children}
    </main>
  );
}
