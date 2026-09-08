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
 *  - **No `next-intl` at runtime.** There is no server render to hand a provider its messages, and
 *    mounting `NextIntlClientProvider` here would add a second way for the failure document to
 *    fail. The copy is read from the resolved catalogue **as data** — `loadMessages()` is a pure,
 *    synchronous merge of statically imported JSON — and the four keys it reads take no ICU
 *    arguments, so no message formatter is needed. Still no literal string in the file
 *    (`fo/no-literal-strings`, AC-26), and still the same catalogue every other document uses.
 *  - **x-default, not the URL's locale.** A client component cannot read the path segment at
 *    render time on the server, and guessing would be worse than being honest: the document
 *    declares the x-default locale exactly as `src/app/not-found.tsx` does (§5.3, AC-8).
 *
 * `metadata` cannot be exported from a Client Component, so the `<title>` is rendered as an
 * element; React hoists it into `<head>`.
 */
// Two deep module paths, not the `@/modules/i18n` barrel (`/review 23`): this file is a Client
// Component, so every module it can reach is compiled into a client chunk that Next attaches to
// the root error boundary — which means to *every* document's initial script set, `/` included.
// Through the barrel that was the whole module: the formatters, the collator, the address
// formats, the alternates builder, the review gate and the switcher, none of which a 500 page
// renders. Importing the two files that hold the four strings' resolution path keeps the growth
// vector closed: a function added to `format.ts` tomorrow cannot land in `/`'s bundle by being
// exported. `import/no-restricted-paths` allows it — the barrel rule binds module-to-module
// imports, and `app/` → `modules/` is the direction the boundary permits (`plan/01` §5) — and the
// measured cost of the barrel is recorded in `docs/architecture.md` §2.
import { loadMessages } from "@/modules/i18n/messages";
import { documentFallbackLocale } from "@/modules/i18n/registry";

export default function GlobalError({ reset }: { reset: () => void }) {
  const locale = documentFallbackLocale();
  const messages = loadMessages(locale.code, ["meta", "errors"]);

  return (
    <html lang={locale.bcp47} dir={locale.dir}>
      <body className="min-h-dvh">
        <title>{messages.meta.error.title}</title>
        <meta name="robots" content="noindex,nofollow" />
        <main id="main">
          <h1>{messages.errors.serverError.heading}</h1>
          <p>{messages.errors.serverError.body}</p>
          <button type="button" onClick={reset}>
            {messages.errors.serverError.retry}
          </button>
        </main>
      </body>
    </html>
  );
}
