/**
 * The language popup without a browser (spec 003 §14 A14 Shape as amended by A16, AC-28; spec 004
 * §14 A23 AC-38 for L1, L3–L6 (T-40) and the markup half of AC-39; TASK-119).
 *
 *  - **`popupCandidates()`**: the projection the Server Component hands to the island, with
 *    `localePath()`-built links.
 *  - **The copy (T-40)**: each `en` value equals its founder-approved literal byte for byte, every
 *    `languagePopup.*` key is `reviewed: false` in every catalogue, and no `en` value carries an
 *    em dash. The "Default" mark ships pending the founder's approval, also `reviewed: false`.
 *  - **`PopupBody`**: the markup, rendered with `react-dom/server` from the shipped strings.
 *
 * What needs a browser (the dialog opening after hydration, the cookie, the boxes, CLS, `Esc`, the
 * consent order) is `tests/e2e/language-popup.spec.ts`; the decision matrix is
 * `tests/unit/i18n-hints.test.ts`.
 */
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { createTranslator } from "next-intl";

import deMeta from "../../messages/de.meta.json";
import enMeta from "../../messages/en.meta.json";
import en from "../../messages/en.json";
import plMeta from "../../messages/pl.meta.json";
import { loadMessages } from "../../src/modules/i18n";
import { popupCandidates } from "../../src/modules/i18n/ui/LanguagePopup.tsx";
import { PopupBody } from "../../src/modules/i18n/ui/LanguagePopupIsland.tsx";
import {
  type LanguagePopupKey,
  languagePopupCopy,
} from "../../src/modules/i18n/ui/languagePopupCopy.ts";
import type { LanguagePopupCopy } from "../../src/modules/i18n/ui/languagePopupTypes.ts";

/** The shipped catalogue through the real formatter: what the Server Component does. */
function copyFor(locale: string): LanguagePopupCopy {
  const messages = loadMessages(locale, ["languagePopup", "a11y", "common"]);
  const popup = createTranslator({
    locale,
    messages,
    namespace: "languagePopup",
  });
  const a11y = createTranslator({ locale, messages, namespace: "a11y" });
  const common = createTranslator({ locale, messages, namespace: "common" });
  return languagePopupCopy({
    popup: (key: LanguagePopupKey) => popup(key),
    a11y: (key) => a11y(key),
    common: (key) => common(key),
  });
}

/** Spec 004 §14 A23 clause 6, verbatim (founder, 2026-10-04: "go, approve copy…"). */
const APPROVED: Readonly<Record<string, string>> = {
  heading: "Choose your preferred language", // L1
  current: "Current", // L3
  browserMatch: "Matches your browser", // L4, desktop
  browserMatchShort: "Your browser", // L4, 390
  close: "Close", // L5
  foot: "You can change it any time at the top of every page.", // L6
};

describe("the popup's copy (spec 004 T-40 for L1, L3–L6)", () => {
  it.each(Object.entries(APPROVED))(
    "`languagePopup.%s` is the approved English text",
    (key, text) => {
      expect((en.languagePopup as Readonly<Record<string, string>>)[key]).toBe(
        text,
      );
    },
  );

  it("ships the default mark as `Default`, pending the founder's exact-text approval", () => {
    expect(en.languagePopup.default).toBe("Default");
  });

  it("has exactly the seven popup keys, and nothing left of the strip or the chooser", () => {
    expect(Object.keys(en.languagePopup).sort()).toEqual(
      [...Object.keys(APPROVED), "default"].sort(),
    );
    expect(Object.keys(en)).not.toContain("banner");
    expect(Object.keys(en)).not.toContain("chooser");
    expect(Object.keys(en.meta)).not.toContain("chooser");
  });

  it.each([
    ["en", enMeta],
    ["de", deMeta],
    ["pl", plMeta],
  ] as const)(
    "every `languagePopup.*` key is `reviewed: false` in %s",
    (_locale, meta) => {
      const keys = Object.keys(meta).filter((key) =>
        key.startsWith("languagePopup."),
      );
      expect(keys).toHaveLength(7);
      for (const key of keys) {
        expect(
          (meta as Record<string, { reviewed: boolean }>)[key]?.reviewed,
          key,
        ).toBe(false);
      }
    },
  );

  it("puts no em dash in any English popup string (founder, 2026-10-05)", () => {
    for (const value of Object.values(en.languagePopup)) {
      expect(value).not.toContain("—");
    }
  });

  it("resolves through the real formatter to the same strings", () => {
    const copy = copyFor("en");
    expect(copy.heading).toBe(APPROVED.heading);
    expect(copy.close).toBe(APPROVED.close);
    expect(copy.listLabel).toBe("Languages");
    expect(copy.beta).toBe("Beta");
  });
});

describe("popupCandidates (the props the island renders)", () => {
  it("projects every launch locale in registry order, linked by `localePath()`", () => {
    expect(popupCandidates().map((c) => [c.code, c.href])).toEqual([
      ["en", "/en"],
      ["en-gb", "/en-gb"],
      ["de", "/de"],
      ["pl", "/pl"],
    ]);
  });

  it("carries the fields the island needs and nothing more", () => {
    for (const candidate of popupCandidates()) {
      expect(Object.keys(candidate).sort()).toEqual([
        "bcp47",
        "beta",
        "code",
        "href",
        "hreflangAliases",
        "nativeName",
      ]);
    }
  });

  it("links the localised segment of a page type it is given", () => {
    expect(popupCandidates("legal").map((c) => c.href)).toEqual([
      "/en/legal",
      "/en-gb/legal",
      "/de/rechtliches",
      "/pl/regulamin",
    ]);
  });
});

function render(
  overrides: Partial<{
    current: string | null;
    hint: string | null;
    copy: LanguagePopupCopy;
  }> = {},
): string {
  return renderToStaticMarkup(
    <PopupBody
      candidates={popupCandidates()}
      copy={overrides.copy ?? copyFor("en")}
      current={overrides.current === undefined ? "en" : overrides.current}
      defaultLocale="en"
      headingId="lp-h"
      hint={overrides.hint ?? null}
      onChoose={() => undefined}
      onDismiss={() => undefined}
      pageLang="en"
    />,
  );
}

/** The `<a …>…</a>` of one option. */
function option(html: string, code: string): string {
  const match = new RegExp(
    `<a [^>]*data-fo-language-option="${code}"[^>]*>[\\s\\S]*?</a>`,
  ).exec(html);
  if (match === null) throw new Error(`no option for ${code}`);
  return match[0];
}

describe("PopupBody (the markup; AC-39's links, AC-28 (a), (b))", () => {
  it("titles the dialog with L1 in an `<h2>` its `aria-labelledby` can name", () => {
    expect(render()).toContain(
      '<h2 class="display m-0 text-[22px] leading-[1.15] md:text-[34px] md:leading-[1.08]" id="lp-h">Choose your preferred language</h2>',
    );
  });

  it("lists the four native names once each, in registry order, as real links with `lang` and `hreflang`", () => {
    const html = render();
    const links = [
      ...html.matchAll(
        /<a [^>]*href="([^"]+)"[^>]*hrefLang="([^"]+)"[^>]*lang="([^"]+)"/g,
      ),
    ].map((m) => [m[1], m[2], m[3]]);
    expect(links).toEqual([
      ["/en", "en", "en"],
      ["/en-gb", "en-GB", "en-GB"],
      ["/de", "de", "de"],
      ["/pl", "pl", "pl"],
    ]);
    for (const name of ["English", "English (UK)", "Deutsch", "Polski"]) {
      expect(html.split(`>${name}</span>`)).toHaveLength(2);
    }
  });

  it("marks English current and default on /en, in words, with `aria-current`", () => {
    const english = option(render(), "en");
    expect(english).toContain('aria-current="true"');
    expect(english).toContain('<span data-fo-mark="current">Current</span>');
    expect(english).toContain('<span data-fo-mark="default">Default</span>');
  });

  it("marks the page's own locale current on /de while English keeps the default (Reading 1)", () => {
    const html = render({ current: "de" });
    expect(option(html, "de")).toContain('data-fo-mark="current"');
    expect(option(html, "de")).not.toContain('data-fo-mark="default"');
    expect(option(html, "en")).toContain('data-fo-mark="default"');
    expect(option(html, "en")).not.toContain('data-fo-mark="current"');
  });

  it("highlights the hinted option with both L4 wordings and nothing else", () => {
    const html = render({ hint: "de" });
    const german = option(html, "de");
    expect(german).toContain(
      '<span data-fo-mark="hint"><span class="md:hidden">Your browser</span><span class="hidden md:inline">Matches your browser</span></span>',
    );
    expect(html.match(/data-fo-mark="hint"/g)).toHaveLength(1);
  });

  it("carries no hint mark at all when there is no hint", () => {
    expect(render()).not.toContain('data-fo-mark="hint"');
  });

  it("gives the marks the page's language inside a link in the option's language (WCAG 3.1.2)", () => {
    expect(option(render(), "de")).toMatch(/<small [^>]*lang="en"/);
  });

  it("names the close button with L5 and hides its glyph", () => {
    expect(render()).toMatch(
      /<button aria-label="Close" [^>]*data-fo-language-popup-close=""[^>]*type="button"><span aria-hidden="true">×<\/span><\/button>/,
    );
  });

  it("ends with the L6 foot", () => {
    expect(render()).toContain(
      ">You can change it any time at the top of every page.</p>",
    );
  });

  it("renders the German draft on /de, with the same native names", () => {
    const html = render({ current: "de", copy: copyFor("de") });
    expect(html).toContain(">Wählen Sie Ihre bevorzugte Sprache</h2>");
    expect(html).toContain(">English</span>");
  });
});

describe("the old strip is gone (AC-28 (h))", () => {
  it("leaves no `LocaleSuggestionBanner*` file in the module", () => {
    const files = readdirSync(
      resolve(import.meta.dirname, "../../src/modules/i18n/ui"),
    );
    expect(files.filter((file) => file.startsWith("LocaleSuggestion"))).toEqual(
      [],
    );
  });
});
