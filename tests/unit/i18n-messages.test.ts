/**
 * `loadMessages`, `namespacesFor` and the fallback-chain merge (TASK-034; the catalogue completion,
 * the `en-gb` override and the `de`/`pl` drafts are TASK-038, and `i18n:check` is TASK-040).
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
  it("ships the spec 003 §2 shell namespaces", () => {
    expect([...MESSAGE_NAMESPACES].sort()).toEqual([
      "a11y",
      "chooser",
      "common",
      "errors",
      "meta",
    ]);
  });

  it("is the only catalogue in the repo today, so every locale falls back to it", () => {
    expect(resolveCatalogue("en")).toEqual(en);
    expect(resolveCatalogue("de")).toEqual(en);
    expect(resolveCatalogue("pl")).toEqual(en);
    expect(resolveCatalogue("en-gb")).toEqual(en);
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
    expect(loadMessages("de", ["a11y"])).toEqual({ a11y: en.a11y });
  });

  it("omits a namespace that no catalogue in the chain ships", async () => {
    const empty: MessageSource = { catalogue: () => undefined };
    const subset = await withMessageSource(empty, () =>
      loadMessages("en", ["meta"]),
    );

    expect(subset).toEqual({});
  });
});

describe("namespacesFor", () => {
  it("gives the `[locale]` document the namespaces its 404 and 500 copy needs", () => {
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
