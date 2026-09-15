import { notFound } from "next/navigation";
import type { ReactElement } from "react";

import { devUiEnabled } from "@/lib/env.schema";

/**
 * A route that throws on purpose: the global 500 boundary, as a surface a suite can visit
 * (spec 004 AC-26, AC-27; TASK-056).
 *
 * `src/app/global-error.tsx` is what it reaches, because the `(dev)` group has no `error.tsx`.
 *
 * `tests/unit/ui-notice-shell.test.ts` asserts the two 500 documents render the same skin as the
 * chooser and the 404, class for class, and `tests/e2e/notices.spec.ts` recorded why that was as
 * far as it could go: "reaching an error boundary in a browser needs a route that throws on
 * purpose, which this task was not asked to add… TASK-056's AC-26/AC-27 matrix, which already
 * lists 'the 500 boundary', is where a reachable one belongs" (`/review 55`). This is that route.
 * axe now audits the rendered boundary rather than a unit test's idea of it, which is the
 * difference between "the classes are right" and "a screen-reader user can leave the page".
 *
 * ## Why it is safe to ship
 *
 *  - It lives in the `(dev)` route group behind `devUiEnabled`, the same gate `/dev/components`
 *    uses: 404 when `ENABLE_DEV_UI` is unset, and the env schema **refuses the flag outright when
 *    `VERCEL_ENV=production`** (`src/lib/env.schema.ts`, AC-28), so the build fails rather than
 *    the route shipping. It cannot be reached from the production alias.
 *  - It is `noindex,nofollow` like every Phase-0 document (the pass-through root layout), and it
 *    is linked from nowhere: AC-14's crawl walks rendered `<a href>`s, and nothing renders one.
 *  - It throws a constant, PII-free `Error` whose message names this file, so a line in the
 *    server log or in Sentry is self-explaining rather than alarming.
 *
 * The gate is checked **before** the throw, so a request with the flag off gets the 404 document
 * and not the error boundary — "this route is off" and "this route failed" must not look alike.
 */
export const dynamic = "force-dynamic";

/** The message the boundary is reached with. A constant: no request data, no PII (§8). */
export const DEV_BOOM_MESSAGE =
  "/dev/boom threw on purpose: the 500 boundary needs a reachable route (spec 004 AC-26)";

export default function DevBoomPage(): ReactElement {
  if (!devUiEnabled(process.env)) notFound();
  throw new Error(DEV_BOOM_MESSAGE);
}
