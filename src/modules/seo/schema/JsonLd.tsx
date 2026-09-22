/**
 * The one place JSON-LD reaches a document (spec 007 §2 "Schema", §5.2 L65/L150, AC-15, AC-16;
 * `plan/02` §9; TASK-093).
 *
 * The builders in this directory return **nodes without a `@context`** — plain data a test can
 * compare with the rendered page — and this file is what turns a node list into the single
 * `<script type="application/ld+json">` the page serves. Keeping serialisation here rather than in
 * each builder buys three things:
 *
 *  - **one document per page.** One node is emitted as itself, several as a `@graph`, which is the
 *    shape spec 001's `validate-schema` walks and the shape the fixtures of `tests/fixtures/seo/`
 *    carry — so the contract fixture is literally the page's own bytes, not a re-spelling of them.
 *  - **`undefined` means "say nothing".** A builder that has no honest node to emit returns
 *    `undefined` (a corridor without 8–12 visible Q&A, a trail with one crumb), the absent nodes
 *    are dropped here, and a page left with nothing renders **no script element at all** rather
 *    than an empty one. `plan/02` §9's rule is that structured data describes what the page shows;
 *    an empty graph describes nothing and still asks a crawler to parse it.
 *  - **`<` never survives.** Every `<` in the serialised JSON becomes `<`, so no authored
 *    answer, country name or label can close the element early. JSON parsers read the escape back
 *    as `<`, so the *content* is unchanged — which matters, because AC-15 compares the JSON-LD
 *    answer with the visible answer character for character.
 *
 * **No client JavaScript and nothing to hydrate** (AC-24): this is a Server Component that renders
 * a data block. A `<script>` whose type is not a JavaScript MIME type is never executed, so the
 * strict `script-src` of `src/lib/csp.ts` (no `'unsafe-inline'`, one hash for the consent
 * bootstrap) needs no hash and no nonce for it — the element is a data block, not a script.
 */
import type { ReactElement } from "react";

import type { CanonicalOptions } from "../canonical.ts";

/** The only `@context` this site emits. */
export const SCHEMA_CONTEXT = "https://schema.org";

/**
 * The builders' `CanonicalOptions` for a deployment, or `undefined` when its `NEXT_PUBLIC_SITE_URL`
 * is not a URL at all.
 *
 * Every `item`, `url` and `logo` in this directory is absolute, because a relative URL in JSON-LD
 * resolves against nothing a crawler can rely on. `deploymentDescriptor()` yields the empty string
 * when the variable is absent — a unit render or a misconfigured deployment, never a real one
 * (`src/lib/env.ts` asserts it at build time) — and the honest answer there is the one the
 * indexing gate already gives: **say nothing**, rather than announce a node with a broken URL.
 * Each route therefore builds its nodes only when this returns options (spec 007 §6's fail-closed
 * rule, applied to structured data).
 */
export function schemaOptions(siteUrl: string): CanonicalOptions | undefined {
  try {
    new URL(siteUrl);
  } catch {
    return undefined;
  }
  return { baseUrl: siteUrl };
}

/** A schema.org node as a builder returns it: `@type` plus its own properties, no `@context`. */
export type JsonLdNode = Readonly<Record<string, unknown>>;

function present(
  nodes: readonly (JsonLdNode | undefined)[],
): readonly JsonLdNode[] {
  return nodes.filter((node): node is JsonLdNode => node !== undefined);
}

/**
 * The JSON-LD document of a page: the single node with `@context` inlined, or a `@graph` of
 * several. `undefined` when the page has nothing to say.
 */
export function jsonLdDocument(
  nodes: readonly (JsonLdNode | undefined)[],
): Record<string, unknown> | undefined {
  const emitted = present(nodes);
  if (emitted.length === 0) return undefined;
  const only = emitted[0];
  if (emitted.length === 1 && only !== undefined) {
    return { "@context": SCHEMA_CONTEXT, ...only };
  }
  return { "@context": SCHEMA_CONTEXT, "@graph": [...emitted] };
}

/** The exact bytes the `<script>` carries, or `undefined` when there is no document. */
export function jsonLdScript(
  nodes: readonly (JsonLdNode | undefined)[],
): string | undefined {
  const document = jsonLdDocument(nodes);
  if (document === undefined) return undefined;
  // `<` only: it is the one character that can end the element early (`</script>`), and escaping
  // it leaves the decoded string identical, which AC-15's character-for-character comparison needs.
  return JSON.stringify(document).replaceAll("<", "\\u003c");
}

export interface JsonLdProps {
  /** The page's nodes, in the order they should appear; absent ones are dropped. */
  readonly nodes: readonly (JsonLdNode | undefined)[];
}

/** The page's structured data, as one server-rendered data block. */
export function JsonLd({ nodes }: JsonLdProps): ReactElement | null {
  const script = jsonLdScript(nodes);
  if (script === undefined) return null;
  return (
    <script
      type="application/ld+json"
      // The serialised document, with `<` escaped above — never user input, never a URL.
      dangerouslySetInnerHTML={{ __html: script }}
    />
  );
}
