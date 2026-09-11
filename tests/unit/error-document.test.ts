/**
 * The 500 documents' copy path is zod-free, catalogue-free and says the same thing the catalogue
 * does (spec 004 §13 Q13, §14 A1 addendum, AC-25's precondition; TASK-046, then TASK-085).
 *
 * Two independent claims, both of which would otherwise be a comment nobody can check:
 *
 *  1. **Parity.** `error-copy.data.ts` holds the four strings of both 500 boundaries as plain
 *     constants, per launch locale, and `errorDocument()` pairs them with the x-default locale
 *     row. Every value must equal what the ordinary, zod-validated path answers —
 *     `documentFallbackLocale()` for the attributes and `loadMessages()` for the strings, fallback
 *     chain and all — or the failure page would quietly drift away from every other document's
 *     copy. That equality is what makes the shortcut safe to keep: edit `messages/*.json`, move a
 *     key, add a locale or move the x-default locale, and this file names the omission.
 *  2. **Reachability.** No module reachable from `src/app/global-error.tsx` may import zod **or a
 *     message catalogue**. It is asserted by walking the *actual* import graph from the file, not
 *     by reading it: the failure mode is a transitive import three files deep (`messages.ts` →
 *     `schemas.ts` → `zod`) that nobody notices, and Next attaches this file's client chunk to
 *     every document, so one such import put ~70 KB Brotli of validator, and later 4 751 B of
 *     `messages/en.json`, on `/`. `tests/unit/client-message-graph.test.ts` applies the same walk
 *     to every client entry point; this file keeps the boundary-specific half.
 *
 * The build-output half of the same claim — that no chunk a document fetches contains zod, the
 * Sentry SDK or catalogue copy — is `scripts/client-js-budget.ts`'s `forbiddenModuleHits()` and
 * `catalogueLeaks()`, run by the CI `build` job against a real build.
 */
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { launchLocales } from "../../src/config/locales.ts";
import { X_DEFAULT_LOCALE } from "../../src/config/locales.data.ts";
import {
  ERROR_COPY,
  ERROR_COPY_MESSAGE_KEYS,
  type ErrorCopy,
  errorCopyFor,
} from "../../src/modules/i18n/error-copy.data.ts";
import {
  TRADING_NAME,
  errorDocument,
  errorHomePath,
} from "../../src/modules/i18n/error-document.ts";
import { loadMessages } from "../../src/modules/i18n/messages.ts";
import { localePath } from "../../src/modules/i18n/routing.ts";
import { documentFallbackLocale } from "../../src/modules/i18n/registry.ts";
import { COMPANY } from "../../src/config/company.ts";

import { importClosure } from "./support/import-closure.ts";

const repoRoot = resolve(__dirname, "../..");

describe("errorDocument() (parity with the validated path)", () => {
  const copy = errorDocument();
  const messages = loadMessages(documentFallbackLocale().code, [
    "meta",
    "errors",
  ]);

  it("declares the same locale the registry resolves for a non-localised document", () => {
    const locale = documentFallbackLocale();
    expect(copy.lang).toBe(locale.bcp47);
    expect(copy.dir).toBe(locale.dir);
    expect(X_DEFAULT_LOCALE.code).toBe(locale.code);
  });

  it("renders the same four strings `loadMessages` resolves", () => {
    expect(copy.title).toBe(messages.meta.error.title);
    expect(copy.heading).toBe(messages.errors.serverError.heading);
    expect(copy.body).toBe(messages.errors.serverError.body);
    expect(copy.retry).toBe(messages.errors.serverError.retry);
  });

  it("returns four non-empty strings, so no `<title>` or heading can be blank (AC-25)", () => {
    for (const [field, value] of Object.entries(copy)) {
      expect(value, field).toEqual(expect.any(String));
      expect((value as string).length, field).toBeGreaterThan(0);
    }
  });
});

/**
 * TASK-085's half: the data file is the catalogue's copy for **every** launch locale, not just
 * for the x-default one, because `src/app/[locale]/error.tsx` now reads it keyed by the URL's
 * locale (it is a Client Component and no provider translates it any more). A locale added to the
 * registry without four strings here fails this test by name, which is the point: the alternative
 * is a new locale silently rendering English 500 copy while every other document is translated.
 */
describe("error-copy.data.ts (parity with the validated path, per launch locale)", () => {
  const resolveKey = (locale: string, key: string): unknown => {
    const [namespace, ...rest] = key.split(".");
    let value: unknown = loadMessages(locale, [namespace as "meta" | "errors"])[
      namespace as "meta" | "errors"
    ];
    for (const part of rest) {
      value = (value as Record<string, unknown> | undefined)?.[part];
    }
    return value;
  };

  it("carries an entry for every launch locale, in registry order", () => {
    expect(Object.keys(ERROR_COPY)).toEqual([...launchLocales]);
  });

  it("says exactly what `loadMessages` resolves for that locale, field by field", () => {
    for (const locale of launchLocales) {
      const copy = errorCopyFor(locale);
      for (const [field, key] of Object.entries(ERROR_COPY_MESSAGE_KEYS)) {
        expect(
          copy[field as keyof ErrorCopy],
          `${locale}: ${key} — edit \`messages/${locale}.json\` and \`src/modules/i18n/error-copy.data.ts\` together`,
        ).toBe(resolveKey(locale, key));
      }
    }
  });

  it("keeps `en-gb`'s own override, so the copy is really per locale", () => {
    // The one observable difference between the launch catalogues on this page today. If this
    // stops holding, the assertion above has stopped comparing anything locale-specific.
    expect(errorCopyFor("en-gb").body).not.toBe(errorCopyFor("en").body);
  });

  it("answers the x-default copy for an unknown, mis-cased or pseudo locale", () => {
    for (const locale of ["nope", "EN", "en-XA", "ar-XB", undefined]) {
      expect(errorCopyFor(locale), String(locale)).toEqual(
        errorCopyFor(X_DEFAULT_LOCALE.code),
      );
    }
  });

  it("imports nothing at all, which is what keeps it free of the JSON cliff", () => {
    const closure = importClosure(
      resolve(repoRoot, "src/modules/i18n/error-copy.data.ts"),
    );

    expect([...closure.files].map((file) => relative(repoRoot, file))).toEqual([
      "src/modules/i18n/error-copy.data.ts",
    ]);
    expect([...closure.packages]).toEqual([]);
    expect([...closure.json]).toEqual([]);
  });
});

/**
 * TASK-055 gave the two 500 documents a wordmark and a way home, and both had to come through the
 * same zod-free seam as the copy. Neither is a second source of truth, and these two assertions
 * are what say so: the wordmark is `COMPANY.tradingName` (one string, in `src/config/
 * company.data.ts`, which `company.ts` builds its identity from), and the path is what
 * `localePath(locale, "home")` — the application's only URL builder — answers for every launch
 * locale.
 */
describe("the failure pages' chrome (TASK-055)", () => {
  it("prints the same trading name the company config does", () => {
    expect(TRADING_NAME).toBe(COMPANY.tradingName);
    expect(TRADING_NAME.length).toBeGreaterThan(0);
  });

  it('answers exactly `localePath(locale, "home")` for every launch locale', () => {
    for (const locale of launchLocales) {
      expect(errorHomePath(locale), locale).toBe(localePath(locale, "home"));
    }
  });

  it("falls back to the x-default home for an unknown, mis-cased or pseudo segment", () => {
    const xDefault = localePath(X_DEFAULT_LOCALE.code, "home");
    for (const locale of [
      "nope",
      "EN",
      "en-XA",
      "ar-XB",
      "../../etc",
      undefined,
    ]) {
      expect(errorHomePath(locale), String(locale)).toBe(xDefault);
    }
  });
});

describe("nothing reachable from global-error.tsx imports zod or a catalogue", () => {
  const entry = resolve(repoRoot, "src/app/global-error.tsx");
  const { files, packages, json } = importClosure(entry);

  it("walks a closure the test itself can vouch for", () => {
    // A closure of one file would make every assertion below vacuous, and the resolver silently
    // failing is exactly how that happens.
    expect(files.size).toBeGreaterThanOrEqual(3);
    expect([...files]).toContain(
      resolve(repoRoot, "src/modules/i18n/error-document.ts"),
    );
    expect([...files]).toContain(
      resolve(repoRoot, "src/config/locales.data.ts"),
    );
  });

  it("reaches neither zod nor the Sentry SDK, as a package or as a file", () => {
    for (const specifier of packages) {
      expect(specifier, specifier).not.toMatch(/^zod/);
      expect(specifier, specifier).not.toMatch(/^@sentry\//);
    }
    for (const file of files) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(
        /from "zod"|from "@sentry\//,
      );
    }
  });

  it("reaches neither the i18n barrel nor the modules that used to pull the whole set in", () => {
    for (const forbidden of [
      "src/modules/i18n/index.ts",
      "src/modules/i18n/messages.ts",
      "src/modules/i18n/registry.ts",
      "src/modules/i18n/schemas.ts",
      "src/modules/i18n/format.ts",
      "src/config/locales.ts",
      "src/lib/env.schema.ts",
    ]) {
      expect([...files], forbidden).not.toContain(resolve(repoRoot, forbidden));
    }
  });

  it("imports no `messages/*.json` — TASK-085's cliff, in one assertion", () => {
    // `errorDocument()` used to read `messages/en.json`, and Turbopack shipped the whole 12.5 KB
    // catalogue with it because the file had crossed the tree-shaking threshold: 4 751 B Brotli
    // of `home.*`, `catalog.*` and `media.*` in every document, `/` included.
    expect([...json]).toEqual([]);
  });

  it("would notice either coming back: the same walk finds both elsewhere", () => {
    // Sanity check on the walker, against a file that *does* reach zod through two hops and
    // imports four catalogues directly.
    const control = importClosure(
      resolve(repoRoot, "src/modules/i18n/messages.ts"),
    );
    expect([...control.packages]).toContain("zod");
    expect([...control.json].map((file) => relative(repoRoot, file))).toContain(
      "messages/en.json",
    );
  });
});
