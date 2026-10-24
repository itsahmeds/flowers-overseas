/**
 * T-28 (b)'s rule half as spec 003 §14 A-founder-2026-10-19d amends it (AC-3, AC-28 (b), AC-46;
 * TASK-280): `languageOffer(pageLocale)`, and the popup's server half that renders only where an
 * offer exists.
 *
 *  - **Committed registry** (`en`, `en-gb` shown, one primary language): the offer is `[]` on every
 *    launch locale and pseudo-locale, so the server half renders nothing (no loader, so the island's
 *    chunk can never be requested).
 *  - **Fixture registry with `de` shown** (and `pl` still hidden): `languageOffer("en")` is
 *    `["de"]`, `languageOffer("de")` is `["en","en-gb"]`, and the server half hands the loader that
 *    offer.
 *  - **Browser language only**: the props the server half hands the loader carry no country field
 *    and are byte-identical whether or not the request carries `cf-ipcountry: PL` (the half reads
 *    no request at all; a `headers()` read added to it turns the second render different).
 *
 * Red cases the amendment names: primary languages compared by locale code (committed
 * `languageOffer("en")` becomes `["en-gb"]`), the "one primary language → empty" term dropped
 * (committed `languageOffer("de")` becomes `["en","en-gb"]`), and the server half rendered
 * unconditionally (the committed render shows a loader).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NextIntlClientProvider } from "next-intl";

import { LOCALES } from "../../src/config/locales.ts";
import { languageOffer, loadMessages } from "../../src/modules/i18n";
import { MESSAGE_NAMESPACES } from "../../src/modules/i18n/messages.ts";
import {
  localeRegistryOf,
  withLocaleRegistry,
} from "../../src/modules/i18n/registry.ts";

/** The headers the next request carries (`cf-ipcountry` or none), read by any `headers()` call. */
let requestHeaders = new Headers();

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(requestHeaders),
}));

/** The loader, replaced by a component that prints the props it was handed. */
vi.mock("../../src/modules/i18n/ui/LanguagePopupLoader.tsx", () => ({
  LanguagePopupLoader: (props: Record<string, unknown>): ReactElement => (
    <div data-loader-props={JSON.stringify(props)} />
  ),
}));

const { LanguagePopup, popupCandidates } =
  await import("../../src/modules/i18n/ui/LanguagePopup.tsx");

/** `de` shown, `pl` still hidden: the registry the day German is reviewed. */
const deShown = localeRegistryOf(
  LOCALES.map((locale) =>
    locale.code === "de" ? { ...locale, shown: true } : locale,
  ),
);

const PAGE_LOCALES = ["en", "en-gb", "de", "pl", "en-XA", "ar-XB"] as const;

function renderServerHalf(locale: string, pageLang: string): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale="en"
      messages={loadMessages("en", MESSAGE_NAMESPACES)}
      timeZone="UTC"
    >
      <LanguagePopup locale={locale} pageLang={pageLang} />
    </NextIntlClientProvider>,
  );
}

function loaderProps(html: string): Record<string, unknown> | null {
  const raw = /data-loader-props="([^"]*)"/u.exec(html)?.[1];
  if (raw === undefined) return null;
  return JSON.parse(
    raw.replaceAll("&quot;", '"').replaceAll("&amp;", "&"),
  ) as Record<string, unknown>;
}

afterEach(() => {
  requestHeaders = new Headers();
});

describe("languageOffer on the committed registry: nothing to offer anywhere", () => {
  for (const locale of PAGE_LOCALES) {
    it(`languageOffer("${locale}") is []`, () => {
      expect(languageOffer(locale)).toEqual([]);
    });
  }

  it("the server half renders nothing on every page", () => {
    for (const locale of PAGE_LOCALES) {
      expect(renderServerHalf(locale, locale), locale).toBe("");
    }
  });
});

describe("languageOffer with `de` shown: other languages, in registry order", () => {
  it("popupCandidates() lists en, en-gb and de, never the hidden pl (AC-46, T-46)", async () => {
    expect(
      (await withLocaleRegistry(deShown, () => popupCandidates())).map(
        (candidate) => candidate.code,
      ),
    ).toEqual(["en", "en-gb", "de"]);
  });

  it("en → [de], en-gb → [de], de → [en, en-gb]", async () => {
    await withLocaleRegistry(deShown, () => {
      expect(languageOffer("en")).toEqual(["de"]);
      expect(languageOffer("en-gb")).toEqual(["de"]);
      expect(languageOffer("de")).toEqual(["en", "en-gb"]);
    });
  });

  it("a hidden locale is never offered, and its own page is offered the shown ones", async () => {
    await withLocaleRegistry(deShown, () => {
      expect(languageOffer("pl")).toEqual(["en", "en-gb", "de"]);
      for (const locale of PAGE_LOCALES) {
        expect(languageOffer(locale), locale).not.toContain("pl");
      }
    });
  });

  it("the server half hands the loader the offer, and no country field", async () => {
    const props = await withLocaleRegistry(deShown, () =>
      loaderProps(renderServerHalf("en", "en")),
    );
    expect(props).not.toBeNull();
    expect(props!["offer"]).toEqual(["de"]);
    expect(Object.keys(props!).sort()).toEqual([
      "candidates",
      "copy",
      "defaultLocale",
      "locale",
      "offer",
      "pageLang",
    ]);
    expect(JSON.stringify(props).toLowerCase()).not.toMatch(
      /country|ipcountry|geo/u,
    );
  });

  it("is byte-identical with and without `cf-ipcountry: PL` on the request", async () => {
    const without = await withLocaleRegistry(deShown, () =>
      renderServerHalf("en", "en"),
    );
    requestHeaders = new Headers({ "cf-ipcountry": "PL" });
    const withCountry = await withLocaleRegistry(deShown, () =>
      renderServerHalf("en", "en"),
    );
    expect(withCountry).toBe(without);
    expect(without).toContain("data-loader-props");
  });
});

describe("the popup's client half sends nothing (T-28 (c), (d)'s `fetch` half, pinned from source)", () => {
  const code = (path: string): string =>
    readFileSync(resolve(import.meta.dirname, "../..", path), "utf8")
      .replace(/\/\*[\s\S]*?\*\//gu, "")
      .replace(/(^|[^:])\/\/.*$/gmu, "$1");

  for (const path of [
    "src/modules/i18n/ui/LanguagePopupIsland.tsx",
    "src/modules/i18n/ui/LanguagePopupLoader.tsx",
    "src/modules/i18n/ui/localeGate.ts",
  ]) {
    it(`${path} makes no request and navigates nowhere`, () => {
      const source = code(path);
      expect(source).not.toMatch(/\bfetch\s*\(/u);
      expect(source).not.toContain("/api/geo");
      expect(source).not.toMatch(
        /location\.(assign|replace)\s*\(|location\.href\s*=/u,
      );
      expect(source).not.toMatch(/sendBeacon|XMLHttpRequest/u);
    });
  }
});
