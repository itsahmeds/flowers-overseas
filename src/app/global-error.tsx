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
import { errorDocument } from "@/modules/i18n/error-document";

export default function GlobalError({ reset }: { reset: () => void }) {
  // Not named `document`: that identifier is the DOM global, and shadowing it in the one
  // component that renders `<html>` would be gratuitously confusing.
  const copy = errorDocument();

  return (
    <html lang={copy.lang} dir={copy.dir}>
      <body className="min-h-dvh">
        <title>{copy.title}</title>
        <meta name="robots" content="noindex,nofollow" />
        <main id="main">
          <h1>{copy.heading}</h1>
          <p>{copy.body}</p>
          <button type="button" onClick={reset}>
            {copy.retry}
          </button>
        </main>
      </body>
    </html>
  );
}
