import type { Metadata } from "next";
import type { ReactNode } from "react";

import { documentFallbackLocale } from "@/modules/i18n";
import { fontVariables } from "@/modules/ui/fonts";

import "../globals.css";

/**
 * Root layout for the bare `/` (spec 003 §5.3 "Recommended file layout", AC-8; TASK-034, the
 * chooser itself TASK-035).
 *
 * One of the three document layouts of the chosen shape (`docs/architecture.md` §2, and the
 * reasoning in `src/app/layout.tsx`): this group owns the single non-localised URL, `/`,
 * `src/app/[locale]/layout.tsx` owns everything with a locale prefix, and `src/app/not-found.tsx`
 * owns the 404. The app-root layout renders no document, so this one renders its own — and its
 * language is the **x-default locale read from the registry** (`plan/02` §3: `x-default` points at
 * `/en`) rather than the hard-coded English `lang` attribute spec 001 §7 left here for spec 003
 * to remove, so a database-backed locale set moves it too (AC-5). No `Accept-Language` is read anywhere (AC-9).
 *
 * The copy, the crawlable locale links and the `noindex,follow` override live in `page.tsx`
 * (TASK-035, AC-7): page metadata wins over a layout's, so `/` is the one document in Phase 0 that
 * is `follow`, and the `noindex,nofollow` below stays as the group's default for anything added
 * here later. No client provider and, since TASK-035 deleted the group's `error.tsx`, no Client
 * Component at all: `/` is HTML, so it works with scripting disabled (AC-7). It is not, however,
 * *zero* application JavaScript, which this comment used to claim — the root error boundary
 * (`src/app/global-error.tsx`) must be a Client Component and Next attaches its chunk to every
 * document. A failure in this document is answered by exactly that file, which renders its own
 * x-default document with its own localised `<title>`. The measured bytes are in `page.tsx`'s
 * header and in `pnpm budget:client-js`.
 *
 * **Why `@/modules/ui/fonts` and not the `@/modules/ui` barrel** (`/review 40`, TASK-052): the
 * barrel re-exports every client island in the module (the ones whose files open with the client
 * directive — spelled out rather than quoted, because `tests/unit/client-js-budget.test.ts`
 * greps this group for that string), and a route whose module graph
 * reaches those references gets them in its *initial* chunk set — so `/`, which renders none of
 * them, was downloading the finder type-ahead island because this layout wanted one font
 * variable. Deep-importing the one server module the layout needs keeps `/` off that graph:
 * measured 132.6 → 131.9 KB br on `/`, with the finder chunk gone from its script set and
 * `/en`/`/de` unchanged. Same shape as `(dev)/dev/components`' deep import of `ConsentGallery`,
 * and lint-clean (`plan/01` §5's barrel rule binds module-to-module imports). §5.4's "`/` still
 * zero application JS" is still not literally true — `global-error.tsx` above says why — and the
 * remaining chunks are TASK-056 AC-25's measurement.
 */
export const metadata: Metadata = { robots: "noindex,nofollow" };

export default function ChooserLayout({ children }: { children: ReactNode }) {
  const locale = documentFallbackLocale();
  return (
    // `fontVariables` puts the two self-hosted families in scope and is what makes Next emit the
    // `<link rel="preload">` for their WOFF2 subsets into this document's head (spec 004 AC-4,
    // TASK-045). No Google Fonts request from any page, ever.
    <html lang={locale.bcp47} dir={locale.dir} className={fontVariables}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
