/**
 * `loadMessages`, `namespacesFor` and the fallback-chain merge (TASK-034; the catalogues
 * themselves are covered by `i18n-messages-schema.test.ts` and `i18n-plurals.test.ts`, TASK-038,
 * and `i18n:check` is TASK-040).
 *
 * Two properties are asserted here because later tasks depend on them:
 *
 *  - **A locale with no catalogue file still renders** — it resolves through `fallbackCode` to
 *    `en`. That is what makes "a new locale is data" true (AC-31) and what lets `de`/`pl` exist as
 *    URLs before their drafts are written.
 *  - **`loadMessages` returns only the requested namespaces.** The subset is what a route's own
 *    document resolves; since TASK-085 nothing is serialised to a client at all (spec 004 §14 A1
 *    addendum), and AC-27's 4 KB is the upper bound on a payload that is not sent.
 */
import { describe, expect, it } from "vitest";

import de from "../../messages/de.json";
import enGb from "../../messages/en-gb.json";
import en from "../../messages/en.json";
import {
  fallbackChain,
  loadMessages,
  namespacesFor,
} from "../../src/modules/i18n";
import {
  type MessageSource,
  MESSAGE_NAMESPACES,
  resolveCatalogue,
  withMessageSource,
} from "../../src/modules/i18n/messages.ts";

describe("the shell catalogue", () => {
  it("ships the spec 003 §2 shell namespaces plus spec 004's chrome namespaces", () => {
    expect([...MESSAGE_NAMESPACES].sort()).toEqual([
      "a11y",
      // `banner` is the suggestion overlay's four strings (TASK-041), resolved on the server by
      // `suggestionCopy()` and handed to the island as props since TASK-085 — so, like `consent`,
      // it is deliberately absent from `namespacesFor("localeDocument")` below.
      "banner",
      // `catalog` is spec 005 §7's namespace: the tier, add-on, surcharge and facet **label
      // keys** the authored dataset refers to, seeded `retained: true` by TASK-062 and rendered
      // from TASK-067. It is deliberately in no `ROUTE_NAMESPACES` entry, so it reaches no
      // client provider and costs no client bytes (spec 005 AC-3).
      "breadcrumb",
      "catalog",
      // `categoryHub` and `occasionHub` are spec 008 §7's two hub namespaces (TASK-112): the
      // `h1` patterns, the destination picker's headings and its two destination states, and the
      // date table's caption, columns and "omitted" cell. Server Components again, so they are in
      // no `ROUTE_NAMESPACES` entry and cost no client bytes.
      "categoryHub",
      "chooser",
      "common",
      // `company`, `destinations`, `footer` and `nav` are spec 004 §7's chrome namespaces, added
      // with the config registries that name their keys (TASK-047); the components that render
      // them are TASK-048/TASK-049.
      "company",
      // `consent` is the sheet's copy (TASK-051): server-resolved and handed to the islands as
      // props, so it is deliberately absent from `namespacesFor("localeDocument")` below.
      "consent",
      // `corridor` is spec 007 §7's namespace (TASK-091): the corridor page's section headings,
      // the fact labels and their honest blanks, the calendar caption and columns, and the FAQ
      // and related-destination headings. The corridor *content* is not a message: it is
      // human-authored markdown under `content/corridors/`, where a machine draft is forbidden
      // (`plan/02` §12).
      "corridor",
      "destinations",
      // `destinationsHub` is spec 007 §7's second namespace (TASK-092): the all-destinations
      // hub's `h1`, intro, region headings and the one state line a destination without a page
      // in this locale carries.
      "destinationsHub",
      "errors",
      // `faq`, `occasions` and `trust` are the locale home's lower sections (TASK-053): the five
      // `<details>` questions, the occasion tiles and dated occasions, and the three trust
      // claims with the guarantee name in its own key.
      "faq",
      // `finder` and `home` are the locale home's own copy (TASK-052): the hero, the finder card,
      // the destination states and the four-fact proof row.
      "finder",
      "footer",
      "home",
      // `media` is spec 006 §7's namespace: the AI-provenance label, the placeholder captions and
      // the demo watermark label (TASK-073). Like `catalog`, it is in no `ROUTE_NAMESPACES` entry
      // — the gallery and the provenance note are Server Components (spec 006 AC-22).
      "media",
      "meta",
      "nav",
      "occasionHub",
      "occasions",
      // `occasionsIndex` is spec 008 §7's namespace for `/{locale}/{occasions}` (TASK-113): the
      // `h1` and intro, the dated and everyday group headings, the dated table's caption and
      // columns, and the two sentences an occasion with no computable date carries. A Server
      // Component again, so it is in no `ROUTE_NAMESPACES` entry and costs no client bytes.
      "occasionsIndex",
      // `shop` is spec 008 §7's namespace (TASK-108): the listing grid's accessible name, the
      // toolbar's count, its three sort labels and the ranking disclosure, the pagination labels
      // and the empty state's two sentences. Like `catalog` and `media` it is in no
      // `ROUTE_NAMESPACES` entry — every component that reads it is a Server Component and the
      // whole set adds zero client bytes (spec 008 §5.4).
      "shop",
      "trust",
    ]);
  });

  it("resolves every launch locale to a complete key set (TASK-038's catalogues)", () => {
    // `en` is the source of truth; `en-gb` overrides one key; `de` and `pl` are full echoed
    // drafts whose only non-English values are the plural forms. Whatever the values, the *key*
    // set after the merge is `en`'s, which is what makes a missing key impossible at render time.
    const keys = (tree: Record<string, unknown>): string[] =>
      Object.entries(tree)
        .flatMap(([key, value]) =>
          typeof value === "object" && value !== null
            ? keys(value as Record<string, unknown>).map(
                (child) => `${key}.${child}`,
              )
            : [key],
        )
        .sort();

    for (const locale of ["en", "en-gb", "de", "pl"]) {
      expect(keys(resolveCatalogue(locale)), locale).toEqual(
        keys(en as unknown as Record<string, unknown>),
      );
    }
  });

  it("overlays the thin `en-gb` override on `en` and nothing else (§13 Q5)", () => {
    const merged = resolveCatalogue("en-gb") as typeof en;

    expect(merged.errors.serverError.body).toBe(enGb.errors.serverError.body);
    expect(merged.errors.serverError.heading).toBe(
      en.errors.serverError.heading,
    );
    expect(merged.meta).toEqual(en.meta);
  });

  it("keeps the `de` draft's real plural forms rather than the English echo", () => {
    const merged = resolveCatalogue("de") as typeof en;

    expect(merged.common.floristCount).toBe(de.common.floristCount);
    expect(merged.common.floristCount).not.toBe(en.common.floristCount);
  });
});

describe("fallbackChain", () => {
  it("is nearest-first and terminates at the default locale", () => {
    expect(fallbackChain("en")).toEqual(["en"]);
    expect(fallbackChain("de")).toEqual(["de", "en"]);
    expect(fallbackChain("en-gb")).toEqual(["en-gb", "en"]);
  });

  it("is empty for an unknown code, which cannot loop or throw", () => {
    expect(fallbackChain("xx")).toEqual([]);
  });
});

describe("the fallback-chain merge (spec 003 §2 'Messages')", () => {
  /** A thin `en-gb` override of one key, in the shape TASK-038 will author. */
  const overrideSource: MessageSource = {
    meta: () => undefined,
    catalogue: (locale) =>
      locale === "en"
        ? en
        : locale === "en-gb"
          ? { errors: { notFound: { heading: "Page not found (UK)" } } }
          : undefined,
  };

  it("overlays the nearer locale key by key and keeps everything else", async () => {
    const merged = await withMessageSource(overrideSource, () =>
      resolveCatalogue("en-gb"),
    );

    expect(merged["errors"]).toEqual({
      notFound: {
        heading: "Page not found (UK)",
        body: en.errors.notFound.body,
      },
      serverError: en.errors.serverError,
    });
    expect(merged["meta"]).toEqual(en.meta);
  });

  it("leaves a locale with no catalogue on the English fallback (AC-31)", async () => {
    const merged = await withMessageSource(overrideSource, () =>
      resolveCatalogue("pl"),
    );

    expect(merged).toEqual(en);
  });
});

describe("loadMessages (§6 'CWV budget impact')", () => {
  it("returns only the requested namespaces", () => {
    expect(Object.keys(loadMessages("en", ["meta"]))).toEqual(["meta"]);
    expect(Object.keys(loadMessages("en", ["meta", "a11y"])).sort()).toEqual([
      "a11y",
      "meta",
    ]);
  });

  it("returns the merged values, not a reference to another locale's catalogue", () => {
    expect(loadMessages("de", ["a11y"])).toEqual({ a11y: de.a11y });
    expect(loadMessages("de", ["a11y"])).not.toBe(de.a11y);
  });

  it("omits a namespace that no catalogue in the chain ships", async () => {
    const empty: MessageSource = {
      catalogue: () => undefined,
      meta: () => undefined,
    };
    const subset = await withMessageSource(empty, () =>
      loadMessages("en", ["meta"]),
    );

    expect(subset).toEqual({});
  });
});

describe("namespacesFor", () => {
  it("gives the `[locale]` document the namespaces its own copy needs, and no client split", () => {
    // `banner` joined the set in TASK-041, when the suggestion island rendered its copy in the
    // browser and had to be handed a payload; TASK-085 took it back out (spec 004 §14 A1
    // addendum). The island is given resolved strings as props by `suggestionCopy()`, no
    // `NextIntlClientProvider` is mounted anywhere, and no namespace subset is serialised into a
    // document for a client to read — which `tests/unit/client-message-graph.test.ts` asserts
    // from the import graph and `pnpm budget:client-js` from the built chunks.
    expect([...namespacesFor("localeDocument")].sort()).toEqual([
      "a11y",
      "common",
      "errors",
      "meta",
    ]);
  });

  it("gives `/` its titles, its copy and its landmark name (TASK-035)", () => {
    // Read on the server and handed to no client provider, so `/` still ships zero application
    // JS (AC-27) while rendering real copy (AC-7).
    expect([...namespacesFor("chooser")].sort()).toEqual([
      "a11y",
      "chooser",
      "meta",
    ]);
  });

  it("names only namespaces the catalogue actually ships", () => {
    for (const kind of ["localeHome", "localeDocument", "chooser"] as const) {
      for (const namespace of namespacesFor(kind)) {
        expect(MESSAGE_NAMESPACES, `${kind}/${namespace}`).toContain(namespace);
      }
    }
  });
});
