"use client";

/**
 * The last-resort 500 document (spec 003 §5.3 "and `src/app/global-error.tsx` rendering its own
 * x-default document", AC-25; TASK-035 — the carry-forward from `/review 15`).
 *
 * It replaces Next's built-in global error shell, which is an untranslated, `lang`-less English
 * page. This one is a real document in the **x-default** locale from the registry, with `lang`,
 * `dir` and a non-empty localised `<title>`, so WCAG 3.1.1 and 2.4.2 hold even on the failure path
 * (§8). It is reached when the root layout or a document layout itself throws — including at `/`,
 * whose own `error.tsx` boundary TASK-035 deleted so that the chooser contains no Client Component
 * at all and keeps AC-7's "served without JavaScript" and AC-27's "`/` ships zero application JS"
 * true. Every localised URL still has the nearer, per-locale boundary of
 * `src/app/[locale]/error.tsx`; this file only answers when that boundary's own document failed.
 *
 * Next requires `global-error.tsx` to be a Client Component and to render `<html>`/`<body>`
 * itself. Two consequences shape the implementation:
 *
 *  - **No `next-intl` at runtime, no zod (TASK-046) and no catalogue JSON (TASK-085).** There is
 *    no server render to hand a provider its messages, and mounting `NextIntlClientProvider` here
 *    would add a second way for the failure document to fail — the application mounts no such
 *    provider anywhere since TASK-085 (spec 004 §14 A1 addendum). The copy is read **as data**
 *    from `src/modules/i18n/error-document.ts`, which imports the x-default locale row and the
 *    four error strings and nothing else; the keys take no ICU arguments, so no message formatter
 *    is needed. Still no literal string in the file (`fo/no-literal-strings`, AC-26), and still
 *    the same copy every other document renders — proven equal to `loadMessages()`'s answer by
 *    `tests/unit/error-document.test.ts` rather than asserted here.
 *  - **x-default, not the URL's locale.** A client component cannot read the path segment at
 *    render time on the server, and guessing would be worse than being honest: the document
 *    declares the x-default locale exactly as `src/app/not-found.tsx` does (§5.3, AC-8) — read
 *    from the constants rather than through `LocaleRegistryProvider`, because this is the one
 *    document that must not depend on the machinery that just failed.
 *
 * `metadata` cannot be exported from a Client Component, so the `<title>` is rendered as an
 * element; React hoists it into `<head>`.
 */
// One module path, and it imports nothing but two constants (`/review 23`, then TASK-046): this
// file is a Client Component, so every module it can reach is compiled into a client chunk that
// Next attaches to the root error boundary — which means to *every* document's initial script set,
// `/` included. Through the `@/modules/i18n` barrel that was the whole module; through
// `messages.ts` + `registry.ts` it was still `schemas.ts` and `src/config/locales.ts`, and
// therefore zod — ~70 KB Brotli of validator on a page that validates nothing (spec 003 §14 A12,
// spec 004 §13 Q13). `error-document.ts` reads the x-default row from `src/config/locales.data.ts`
// and the four strings from `error-copy.data.ts`, and imports nothing else, so the growth vector
// stays closed: a function added to `format.ts` or a schema added to `schemas.ts` tomorrow cannot
// land in `/`'s bundle by being exported. The strings were `messages/en.json` until TASK-085
// measured what a static JSON import costs once it crosses Turbopack's tree-shaking threshold:
// the whole 12.5 KB catalogue — `home.*`, `catalog.*`, `media.*` and all — at 4 751 B Brotli in
// every document's initial script set (spec 004 §14 A1 addendum).
// `import/no-restricted-paths` allows it — the barrel rule
// binds module-to-module imports, and `app/` -> `modules/` is the direction the boundary permits
// (`plan/01` §5) — and the measured cost of each step is recorded in `docs/architecture.md` §2.
import {
  TRADING_NAME,
  errorDocument,
  errorHomePath,
} from "@/modules/i18n/error-document";
// Class strings and nothing else — no component, no runtime — so this document looks like the
// other three without importing the design system into the chunk Next attaches to *every*
// document (`noticeShell.ts`'s header; spec 004 §14 A1).
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

// The design tokens themselves. `global-error.tsx` replaces the root layout rather than rendering
// inside it, so nothing else puts a stylesheet on this document and every class above would be
// inert without this line (TASK-055). It is a CSS import: it adds a `<link>`, not a script byte.
// The two self-hosted families are deliberately *not* pulled in — `@/modules/ui/fonts` is one more
// module in the chunk Next attaches to every document, and `@layer base`'s fallback stack
// ("Iowan Old Style"/Georgia for the display voice, Helvetica/Arial for the body) is a perfectly
// legible last-resort page. Every other document, the 404 included, carries the real faces.
import "./globals.css";

/** The status this document is served with, as the `.label` eyebrow. Digits, so not copy. */
const SERVER_ERROR_STATUS = "500";

export default function GlobalError({ reset }: { reset: () => void }) {
  // Not named `document`: that identifier is the DOM global, and shadowing it in the one
  // component that renders `<html>` would be gratuitously confusing.
  const copy = errorDocument();
  // The x-default home, for the same reason the document's language is the x-default one: a
  // client component cannot read the path segment at render time on the server, and guessing is
  // worse than being honest.
  const home = errorHomePath();

  return (
    <html lang={copy.lang} dir={copy.dir}>
      <body className="min-h-dvh">
        <title>{copy.title}</title>
        <meta name="robots" content="noindex,nofollow" />
        <main className={NOTICE_MAIN} id="main">
          {/* The wordmark, not the `Mark` component: see the import block. */}
          <a className={NOTICE_LOCKUP} href={home}>
            <span className={NOTICE_WORDMARK}>{TRADING_NAME}</span>
          </a>
          <div className={NOTICE_BLOCK}>
            <p className={NOTICE_META}>{SERVER_ERROR_STATUS}</p>
            <h1 className={NOTICE_HEADING}>{copy.heading}</h1>
            <p className={NOTICE_BODY}>{copy.body}</p>
          </div>
          <div className={NOTICE_ACTIONS}>
            <button
              className={NOTICE_ACTION_PRIMARY}
              onClick={reset}
              type="button"
            >
              {copy.retry}
            </button>
            <a className={NOTICE_ACTION_SECONDARY} href={home}>
              {copy.home}
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
