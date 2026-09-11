"use client";

/**
 * Localised 500 boundary (spec 003 §5.3; TASK-034, rewired by TASK-085).
 *
 * A Next error boundary must be a Client Component. Until TASK-085 that is why
 * `[locale]/layout.tsx` wrapped every document in `NextIntlClientProvider` with the
 * `localeDocument` namespace subset, and this file read its copy from that provider with
 * `useTranslations`. The provider cost 10 705 B Brotli in the initial script set of every locale
 * document — 8% of the 131 072 B budget of spec 004 §14 A1 — to translate this boundary and the
 * suggestion banner, so §14 A1's addendum (option (b)) took it out: every client consumer now
 * receives translated strings as data.
 *
 * A boundary receives only `{ error, reset }`, so its strings cannot arrive as props from a Server
 * Component. It reads them from `error-copy.data.ts` — the four-string, import-free data module
 * the 500 documents share, kept equal to `messages/*.json` by `tests/unit/error-document.test.ts`
 * — keyed by the locale of the URL, which `useParams()` reads from the router rather than from a
 * guess. An unknown or pseudo-locale segment falls back to the x-default copy rather than
 * throwing: this is the failure path, and it must not be able to fail twice.
 *
 * No literal string is in this file (`fo/no-literal-strings`, AC-26) and no formatter runs: the
 * four keys take no ICU arguments, which is exactly why they can be data.
 *
 * The correct status code is Next's own (spec 001 T-16).
 */
import { useParams } from "next/navigation";

import { errorCopyFor } from "@/modules/i18n/error-copy.data";
// Two constants and one path builder, from the same import-free seam the copy comes through: this
// document may reach neither the registry nor zod (`error-document.ts`'s header).
import { TRADING_NAME, errorHomePath } from "@/modules/i18n/error-document";
// Class strings and nothing else — no component, no runtime — so the failure page looks like the
// 404 and the chooser without importing the design system into the root error boundary's chunk
// (`noticeShell.ts`'s header; spec 004 §14 A1).
import {
  NOTICE_ACTIONS,
  NOTICE_ACTION_PRIMARY,
  NOTICE_ACTION_SECONDARY,
  NOTICE_BLOCK,
  NOTICE_BODY,
  NOTICE_HEADING,
  NOTICE_LOCKUP,
  NOTICE_MAIN,
  NOTICE_META,
  NOTICE_WORDMARK,
} from "@/modules/ui/layout/noticeShell";

/** The status this boundary is served with, as the `.label` eyebrow. Digits, so not copy. */
const SERVER_ERROR_STATUS = "500";

export default function LocaleError({ reset }: { reset: () => void }) {
  // A router param is `string | string[]` at the type level and the whole bag is nullable outside
  // a router context; `[locale]` is a single segment, and anything that is not one is not a locale
  // code — `errorCopyFor` answers with the x-default copy for every such case rather than throwing,
  // because this component *is* the throw handler.
  const locale = useParams()?.["locale"];
  const code = typeof locale === "string" ? locale : undefined;
  const copy = errorCopyFor(code);
  const home = errorHomePath(code);

  return (
    <main className={NOTICE_MAIN} id="main">
      {/* No `Mark`: the mark is a component in `src/modules/ui`, and this file may import no
          component from there (see the header). The wordmark alone is what the errors wireframe
          draws on the 500 anyway. */}
      <a className={NOTICE_LOCKUP} href={home}>
        <span className={NOTICE_WORDMARK}>{TRADING_NAME}</span>
      </a>
      <div className={NOTICE_BLOCK}>
        <p className={NOTICE_META}>{SERVER_ERROR_STATUS}</p>
        <h1 className={NOTICE_HEADING}>{copy.heading}</h1>
        <p className={NOTICE_BODY}>{copy.body}</p>
      </div>
      <div className={NOTICE_ACTIONS}>
        <button className={NOTICE_ACTION_PRIMARY} onClick={reset} type="button">
          {copy.retry}
        </button>
        {/* The second action the wireframe draws: a retry that fails again must not be the only
            way out of the page. */}
        <a className={NOTICE_ACTION_SECONDARY} href={home}>
          {copy.home}
        </a>
      </div>
    </main>
  );
}
