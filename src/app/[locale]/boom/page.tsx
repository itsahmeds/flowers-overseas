import { notFound } from "next/navigation";
import type { ReactElement } from "react";

import { devUiEnabled } from "@/lib/env.schema";
import { routableLocale } from "@/modules/i18n";

import { BoomIsland } from "./BoomIsland";

/**
 * A route that throws on purpose: the localised 500 boundary, as an auditable surface
 * (spec 004 AC-26, AC-27; TASK-056).
 *
 * The sibling of `src/app/(dev)/dev/boom/page.tsx`, and the document a visitor actually gets —
 * `src/app/[locale]/error.tsx`, with the locale's `lang`/`dir`, its copy and a way home.
 *
 * `/dev/boom` reaches the *global* boundary (`src/app/global-error.tsx`): it throws during the
 * server render, which Next answers with `<html id="__next_error__">` whatever segment it happened
 * in. That is one of the two 500 documents; this is the other, and
 * it is the one that renders localised copy, the locale's `lang`/`dir` and a way home. Auditing
 * only the global one would leave the shipped path untested — the gap `/review 55` asked TASK-056
 * to close.
 *
 * Same three safety properties as `/dev/boom`, and the same order of checks: the `ENABLE_DEV_UI`
 * gate is read **before** the throw, so with the flag off this is a 404 document and not an error
 * boundary; the env schema refuses the flag when `VERCEL_ENV=production`, so the route cannot
 * exist on the production alias; nothing links to it (AC-14 crawls rendered `<a href>`s) and every
 * Phase-0 document is `noindex,nofollow`.
 *
 * **The locale is checked before the throw**, with the same `routableLocale()` call
 * `[locale]/page.tsx` makes. `dynamicParams = false` on the layout refuses an unknown code for a
 * *prerendered* subtree, but this page is `force-dynamic` — measured: without the check `/fr/boom`
 * answered 500 where `/fr` answers 404, i.e. a dev route would have been a hole in the locale gate
 * (ADR-0006: no guessed locale, ever).
 */
export const dynamic = "force-dynamic";

export default async function LocaleBoomPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<ReactElement> {
  const { locale: requested } = await params;
  if (routableLocale(requested) === undefined) notFound();
  if (!devUiEnabled(process.env)) notFound();
  // The throw lives in the island's effect, so the boundary this reaches is the localised one and
  // not the global document — see `./BoomIsland.tsx`.
  return <BoomIsland />;
}
