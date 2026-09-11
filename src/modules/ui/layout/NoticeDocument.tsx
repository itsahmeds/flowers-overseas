/**
 * The notice document (spec 004 §5.3, AC-12; TASK-055).
 *
 * The one-column page the site shows when there is nothing to sell yet: the `/` chooser and the
 * 404. It is a **Server Component** with no state, no effect and no client import, so both
 * documents keep the contracts spec 003 gave them — `/` reaches no client module at all (AC-7,
 * AC-27) and the 404 is HTML with a status code (AC-8).
 *
 * The two 500 boundaries render the same shell without this component, because Next requires an
 * error boundary to be a Client Component and a client chunk that reaches `src/modules/ui` reaches
 * the design system's islands with it. That is why the skin lives in `./noticeShell.ts` as plain
 * strings: four documents, one appearance, and `tests/unit/ui-notice-shell.test.ts` fails if one
 * of them stops using it.
 *
 * **Why these four documents look like this.** They are not on the founder-approved homepage
 * canvas, and `docs/design/wireframes/locale-chooser-*.dc.html` and `errors-*.dc.html` draw them
 * with the full commerce chrome, which none of them may have: the chooser has no locale to render
 * a localised header in, the 404's header would be a second document's worth of registry reads,
 * and the wireframe's own note for the 500 says "minimal chrome: the wordmark, the copy, two
 * actions" — a page that renders because something else broke must not depend on the machinery
 * that broke. So the shell is the TASK-055 row's construction, which is the wireframes' content in
 * the artboards' type treatment: a centred `--measure` column, the masthead's own lockup at the
 * masthead's own metrics, the `.label` voice for the document's metadata and the `.display` voice
 * for its heading. Recorded in the PR body rather than silently resolved.
 */
import type { ReactElement, ReactNode } from "react";

import { Mark } from "../icons/Mark.tsx";

import {
  NOTICE_BLOCK,
  NOTICE_BODY,
  NOTICE_HEADING,
  NOTICE_LOCKUP,
  NOTICE_MAIN,
  NOTICE_MARK,
  NOTICE_META,
  NOTICE_WORDMARK,
} from "./noticeShell.ts";

export interface NoticeDocumentProps {
  /** The trading name, from `src/config/company.ts` — never a literal (§7). */
  readonly wordmark: string;
  /**
   * The lockup's destination, when there is one. The chooser has none: linking its wordmark to a
   * locale home would pick a language for the visitor, which is the whole thing `/` exists not to
   * do (ADR-0006).
   */
  readonly lockupHref?: string | undefined;
  /**
   * The `.label` metadata line above the heading — the HTTP status on an error document. Digits
   * only there, so nothing needs translating; a caller with words passes a message. The chooser
   * omits it: `/` has no status to report, and its metadata is the path printed beside each
   * locale.
   */
  readonly meta?: string | undefined;
  readonly heading: string;
  readonly body: string;
  /** The actions and, on the chooser, the locale list. */
  readonly children?: ReactNode;
}

export function NoticeDocument({
  wordmark,
  lockupHref,
  meta,
  heading,
  body,
  children,
}: NoticeDocumentProps): ReactElement {
  const lockup = (
    <>
      <Mark className={NOTICE_MARK} />
      <span className={NOTICE_WORDMARK}>{wordmark}</span>
    </>
  );

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
