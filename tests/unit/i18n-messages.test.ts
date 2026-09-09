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
 *  - **`loadMessages` returns only the requested namespaces.** The subset is what reaches the
 *    client provider, so the serialised payload cannot grow with the catalogue (§6, AC-27).
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
      "banner",
      // `catalog` is spec 005 §7's namespace: the tier, add-on, surcharge and facet **label
      // keys** the authored dataset refers to, seeded `retained: true` by TASK-062 and rendered
      // from TASK-067. It is deliberately in no `ROUTE_NAMESPACES` entry, so it reaches no
      // client provider and costs no client bytes (spec 005 AC-3).
      "catalog",
      "chooser",
      "common",
      // `company`, `destinations`, `footer` and `nav` are spec 004 §7's chrome namespaces, added
      // with the config registries that name their keys (TASK-047); the components that render
      // them are TASK-048/TASK-049.
      "company",
      // `consent` is the sheet's copy (TASK-051): server-resolved and handed to the islands as
      // props, so it is deliberately absent from `namespacesFor("localeDocument")` below.
      "consent",
      "destinations",
      "errors",
      "footer",
      // `media` is spec 006 §7's namespace: the AI-provenance label, the placeholder captions and
      // the demo watermark label (TASK-073). Like `catalog`, it is in no `ROUTE_NAMESPACES` entry
      // — the gallery and the provenance note are Server Components (spec 006 AC-22).
      "media",
      "meta",
      "nav",
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
  it("gives the `[locale]` document the namespaces its 404, 500 and banner copy needs", () => {
    // `banner` joined the set in TASK-041: the suggestion island renders in the browser, so its
    // four keys are the one namespace that *has* to reach the client provider. Everything else
    // here is read on the server or by the 500 boundary, which is itself a Client Component.
    expect([...namespacesFor("localeDocument")].sort()).toEqual([
      "a11y",
      "banner",
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
