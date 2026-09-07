import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

/**
 * Shell metadata (spec 001 §2, §6, AC-15, TASK-006).
 *
 * The literal string form is used rather than `robots: { index: false, follow: false }` because
 * Next renders the object form as `content="noindex, nofollow"` (with a space) while AC-15 asks
 * for `content="noindex,nofollow"` exactly. This is belt number one of the three in spec 001 §6:
 * the meta tag here, the `X-Robots-Tag` header from `next.config.ts` on every non-production
 * response, and the disallow-all `src/app/robots.ts`. Spec 007 lifts the meta for production only
 * (ADR-0007). No `title`: spec 001 ships no copy and no indexable page.
 */
export const metadata: Metadata = { robots: "noindex,nofollow" };

/**
 * Root shell. `lang="en"` is the one locale literal in the repo; spec 003 replaces it with the URL
 * locale (spec 001 §7, AC-30). No fonts and no scripts beyond the Next runtime (§2, §6 "CWV
 * budget impact"); no text nodes, so `fo/no-literal-strings` ships enabled with no exception.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
