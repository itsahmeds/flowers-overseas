import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * App-root layout (spec 003 §5.3 "Recommended file layout"; TASK-034).
 *
 * **It renders no document.** It is a pass-through whose only job is to be the single root of the
 * route tree, so that the *document* — `<html lang dir>`, `<body>` — is rendered by whichever leaf
 * knows the language: `(chooser)/layout.tsx` for `/` in the x-default locale, `[locale]/layout.tsx`
 * for every localised URL in its own locale, and `not-found.tsx` for the 404 in the x-default
 * locale. The hard-coded English `lang` attribute that spec 001 §7 left here is therefore gone,
 * replaced by registry data rather than by another literal (spec 003 §7, AC-6).
 *
 * Why not the two *root* layouts §5.3 recommends (`(chooser)` and `[locale]` with no
 * `src/app/layout.tsx` at all)? That shape was implemented first and measured on Next 16.3.4:
 * with two root layouts `src/app/not-found.tsx` *is* reached, but the framework wraps it in a
 * bare `<html>` of its own, so the response has nested `html`/`body` elements and the effective
 * document carries no `lang` attribute at all — AC-8's "a document whose `lang` is the x-default
 * locale" and WCAG 3.1.1 Language of Page both fail. (A nested `[locale]/not-found.tsx` is
 * rendered when a matching route calls `notFound()`, but inside the framework's
 * `<html id="__next_error__">`, again with no `lang`.) §5.3 anticipates exactly this ("if Next 16
 * rejects that arrangement for the unmatched-path 404") and the shape here is the accepted
 * alternative in its cheapest form: one root, one document per leaf, no `headers()` read (which
 * would opt every localised page out of static rendering and defeat §5.4), and no locale literal
 * anywhere. Recorded in `docs/architecture.md` §2.
 *
 * The `noindex,nofollow` default sits here so **every** document inherits it, including the 404
 * (spec 001 §6's belt number one; spec 007 lifts it by rule, ADR-0007).
 *
 * **The icon is declared here and served from `public/`** (TASK-056). Without a `<link rel="icon">`
 * every browser — and therefore every Lighthouse run — requests `/favicon.ico`, which this
 * application does not have: the 404 is logged as a console error and cost the `best-practices`
 * category 1 of its 28 weighted points (0.93), under AC-24's ≥0.95. It is the brand mark
 * (`content/brand/mark.svg`, the same drawing `Mark` renders) as a static file rather than the
 * app-directory `icon.svg` convention, because that convention generates a route, and a generated
 * route under this root — a pass-through layout whose documents are rendered by the leaves — is
 * answered by `next start` with `Internal: NoFallbackError` and a 404. A file in `public/` needs
 * no route at all.
 */
export const metadata: Metadata = {
  robots: "noindex,nofollow",
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }] },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
