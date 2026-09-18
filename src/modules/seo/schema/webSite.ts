/**
 * `WebSite`, **without** `SearchAction` (spec 007 §2 "Schema", §5.2 L65, AC-15; T-16; `plan/02` §9;
 * TASK-093).
 *
 * `SearchAction` tells Google that a query URL exists and that a sitelinks search box may be
 * offered. There is no search on this site until spec 008 ships one, so announcing the action would
 * point a crawler — and a searcher — at a URL that answers 404. Spec 007 §2 words it as a deadline
 * ("without `SearchAction` until spec 008 ships search"), and the way to make a deadline hold is to
 * have no code path that can emit one: this builder has no parameter for a search target, so the
 * node cannot grow one by configuration.
 *
 * The node stays at `name` + `url` for `organization.ts`'s reason. `url` is the site origin rather
 * than the locale home: one `WebSite` describes the whole multilingual site, and the locale of the
 * document is already carried by `<html lang>`, the canonical and the hreflang cluster (spec 003
 * §6) — a per-locale `WebSite` would be four entities for one site.
 */
import { siteOrigin, type CanonicalOptions } from "../canonical.ts";

import type { JsonLdNode } from "./JsonLd.tsx";

export function webSite(name: string, options: CanonicalOptions): JsonLdNode {
  return {
    "@type": "WebSite",
    name,
    url: siteOrigin(options.baseUrl),
  };
}
