/**
 * T-28 (markup half) / AC-28 and the §8 accessibility contract of the banner (TASK-041).
 *
 * Two halves, both without a browser:
 *
 *  - **`suggestionCandidates()`** — the projection the Server Component hands across the RSC
 *    boundary. It is what keeps the locale registry out of the browser, and its `href`s come from
 *    `localePath()`, so this is also where "the island never concatenates a URL" (§6, AC-13) is
 *    asserted.
 *  - **`suggestionCopy()`** — the copy projection TASK-085 added, resolved with a **real**
 *    next-intl translator over the shipped `messages/en.json`, so the `{language}` argument of
 *    `banner.headline`/`banner.switch` is exercised rather than assumed. `createTranslator` is
 *    the same formatter `useTranslations` uses, without a provider: after spec 004 §14 A1's
 *    addendum there is no `NextIntlClientProvider` in the application, and a test that mounted
 *    one would be asserting a path production no longer has.
 *  - **`LocaleSuggestionBannerView`** — the markup, rendered with `react-dom/server` from those
 *    strings as props. The asserted copy is therefore the shipped copy, and the view is proven to
 *    need no message context at all: it renders outside any provider.
 *
 * The parts that need a browser — appearing after hydration, the CLS delta, `Esc`, the cookie the
 * browser stores — are `tests/e2e/banner.spec.ts`; the decision matrix is
 * `tests/unit/i18n-hints.test.ts`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { createTranslator } from "next-intl";

import { loadMessages } from "../../src/modules/i18n";
import type { SuggestionCandidate } from "../../src/modules/i18n/hints.ts";
import { suggestionCandidates } from "../../src/modules/i18n/ui/LocaleSuggestionBanner.tsx";
import {
  LocaleSuggestionBannerIsland,
  LocaleSuggestionBannerView,
} from "../../src/modules/i18n/ui/LocaleSuggestionBannerIsland.tsx";
import { LiveRegion } from "../../src/modules/ui/primitives/a11y.tsx";
import {
  type BannerTranslate,
  suggestionCopy,
} from "../../src/modules/i18n/ui/suggestionCopy.ts";

const noop = (): void => undefined;

/** The shipped catalogue, through the real ICU formatter — what the Server Component does. */
function copyFor(locale: string) {
  const translate = createTranslator({
    locale,
    messages: loadMessages(locale, ["banner"]),
    namespace: "banner",
  }) as BannerTranslate;
  return suggestionCopy(translate, suggestionCandidates());
}

const englishCopy = copyFor("en");

function render(target: SuggestionCandidate): string {
  const targetCopy = englishCopy.targets[target.code];
  if (targetCopy === undefined) throw new Error(`no copy for ${target.code}`);
  return renderToStaticMarkup(
    <LocaleSuggestionBannerView
      copy={englishCopy}
      onDismiss={noop}
      onStay={noop}
      onSwitch={noop}
      target={target}
      targetCopy={targetCopy}
    />,
  );
}

const german = suggestionCandidates().find((c) => c.code === "de")!;

describe("suggestionCandidates (the props the island decides from)", () => {
  it("projects every launch locale, in registry order", () => {
    expect(suggestionCandidates().map((c) => c.code)).toEqual([
      "en",
      "en-gb",
      "de",
      "pl",
    ]);
  });

  it("carries the four fields the island needs and nothing more", () => {
    for (const candidate of suggestionCandidates()) {
      expect(Object.keys(candidate).sort()).toEqual([
        "bcp47",
        "code",
        "href",
        "hreflangAliases",
        "nativeName",
      ]);
    }
  });

  it("builds each href with `localePath()`, never by concatenation (AC-13)", () => {
    expect(suggestionCandidates().map((c) => c.href)).toEqual([
      "/en",
      "/en-gb",
      "/de",
      "/pl",
    ]);
  });

  it("links the localised segment of the requested page type, per locale", () => {
    const legal = suggestionCandidates("legal");

    expect(legal.map((c) => c.href)).toEqual([
      "/en/legal",
      "/en-gb/legal",
      "/de/rechtliches",
      "/pl/regulamin",
    ]);
  });

  it("carries the `plan/02` §3 aliases that make `de-AT` resolve to `de`", () => {
    expect(german.hreflangAliases).toContain("de-AT");
    expect(german.nativeName).toBe("Deutsch");
  });
});

describe("suggestionCopy (the strings the island is handed — TASK-085)", () => {
  it("resolves both ICU messages for every launch locale it may offer", () => {
    expect(Object.keys(englishCopy.targets)).toEqual([
      "en",
      "en-gb",
      "de",
      "pl",
    ]);
    expect(englishCopy.targets["de"]).toEqual({
      headline: "Would you rather read this page in Deutsch?",
      switchLabel: "Switch to Deutsch",
    });
  });

  it("resolves the two locale-invariant strings", () => {
    expect(englishCopy.stay).toBe("Stay on this page");
    expect(englishCopy.dismiss).toBe("Dismiss the language suggestion");
  });

  it("leaves no `{language}` placeholder unresolved, in any launch locale", () => {
    for (const locale of ["en", "en-gb", "de", "pl"]) {
      const copy = copyFor(locale);
      const strings = [
        copy.stay,
        copy.dismiss,
        ...Object.values(copy.targets).flatMap((target) => [
          target.headline,
          target.switchLabel,
        ]),
      ];
      for (const value of strings) {
        expect(value, `${locale}: ${value}`).not.toContain("{");
        expect(value.length, locale).toBeGreaterThan(0);
      }
    }
  });

  it("renders the target's own `nativeName`, so a locale added to the registry is covered", () => {
    for (const candidate of suggestionCandidates()) {
      expect(
        englishCopy.targets[candidate.code]?.headline,
        candidate.code,
      ).toContain(candidate.nativeName);
    }
  });
});

describe("LocaleSuggestionBannerView (§5.3, §8)", () => {
  const html = render(german);

  it("renders the shipped copy with the target language interpolated", () => {
    expect(html).toContain("Would you rather read this page in Deutsch?");
    expect(html).toContain("Switch to Deutsch");
    expect(html).toContain("Stay on this page");
  });

  it("renders outside any message provider, because the browser has none (§14 A1 addendum)", () => {
    // The `render()` helper above mounts no provider and this is the assertion that says so on
    // purpose: if the view ever reads a message through a hook again, this render throws
    // (`useTranslations` without context) instead of quietly reintroducing the 10 705 B provider.
    expect(html).toContain('data-fo-banner="shown"');
  });

  it("is a non-modal named region, and not a dialog", () => {
    expect(html).toContain('role="region"');
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain("aria-modal");

    const labelledBy = /aria-labelledby="([^"]+)"/.exec(html)?.[1];
    expect(labelledBy).toBeDefined();
    expect(html).toContain(`id="${labelledBy!}"`);
  });

  /**
   * TASK-055 closed spec 003's deferred `role="status"` note (`/review 23`): the announcement is
   * made by a **permanently mounted** live region around the banner, because a region inserted
   * together with its content is announced by some assistive technologies and ignored by others.
   * The pattern is `LiveRegion` in the design system, which this island may not import — it is a
   * Client Component in another module, and the cross-module route is `src/modules/ui`'s public
   * barrel, which would put the design system's islands in this chunk (spec 004 §14 A1). So the
   * attributes are restated in the island and pinned here against what `LiveRegion` renders.
   */
  it("wraps the banner in the design system's live-region pattern, mounted whatever the decision", () => {
    const wrapper = renderToStaticMarkup(
      <LiveRegion name="locale-suggestion" />,
    );
    const attributes = [
      'role="status"',
      'aria-live="polite"',
      'aria-atomic="true"',
      'data-fo-live-region="locale-suggestion"',
    ];
    for (const attribute of attributes) {
      expect(wrapper, attribute).toContain(attribute);
    }

    // Shown: the region is there, with the banner inside it.
    const shown = renderToStaticMarkup(
      <LocaleSuggestionBannerIsland
        candidates={suggestionCandidates()}
        copy={englishCopy}
        locale="en"
      />,
    );
    // Hidden: the same region, empty. `renderToStaticMarkup` runs the island's `useState`
    // initialiser with no `window`, so `decideSuggestion` throws and the island fails closed —
    // which is exactly the "no suggestion" state this assertion is about.
    for (const attribute of attributes) {
      expect(shown, attribute).toContain(attribute);
    }
    expect(shown).not.toContain('data-fo-banner="shown"');
    // Empty, so it paints nothing and measures nothing: CLS delta 0 (AC-28).
    expect(shown).toMatch(
      /data-fo-live-region="locale-suggestion"[^>]*><\/div>/,
    );
  });

  it("reserves no layout space, so inserting it shifts nothing (CLS 0)", () => {
    // The positioning is on the live region, which is the element that is always in the document.
    const region = renderToStaticMarkup(
      <LocaleSuggestionBannerIsland
        candidates={suggestionCandidates()}
        copy={englishCopy}
        locale="en"
      />,
    );
    expect(region).toContain("fixed");
    // Logical inset utilities only: `fo/no-physical-css` bans `left-`/`right-`/`inset-x-`.
    expect(region).toContain("start-0");
    expect(region).toContain("end-0");
    expect(region).not.toMatch(/class="[^"]*\bleft-/);
    expect(region).not.toMatch(/class="[^"]*\bright-/);
    // AC-13's ordering, in the named scale rather than in a raw `z-index`: `layer-banner` (200)
    // is the step *below* the consent sheet's `layer-overlay` (300), so the sheet paints above.
    expect(region).toContain("layer-banner");
    expect(region).not.toMatch(/class="[^"]*\bz-\d/);
    expect(html).not.toMatch(/class="[^"]*\bz-\d/);
  });

  it("offers `Switch` as a real link to the target locale, with its language declared", () => {
    expect(html).toContain('href="/de"');
    expect(html).toContain('lang="de"');
    // React serialises the JSX prop verbatim; HTML attribute names are case-insensitive, so the
    // crawler and the screen reader both read it (the same note as in `tests/e2e/shell.spec.ts`).
    expect(html).toContain('hrefLang="de"');
  });

  it("gives the dismiss control an accessible name and hides its glyph", () => {
    expect(html).toContain('aria-label="Dismiss the language suggestion"');
    expect(html).toContain('aria-hidden="true"');
  });

  it("steals no focus: nothing is autofocused and nothing is tabindex-forced", () => {
    expect(html).not.toContain("autofocus");
    expect(html).not.toContain("tabindex");
  });

  it("renders `Stay` and `Dismiss` as buttons, not as links", () => {
    expect(html).toContain('type="button"');
    expect(html.match(/<a\b/g)).toHaveLength(1);
    expect(html.match(/<button\b/g)).toHaveLength(2);
  });

  /**
   * `/review 23` note 2: a `fixed` overlay sits over content this spec has not written yet, so
   * inheriting the page's background (i.e. none) and painting the border in `currentColor` would
   * turn the panel into text over text as soon as spec 004 fills the bottom of the viewport.
   * The three colours are therefore explicit and the assertion is here so a restyle in spec 004
   * has to make a deliberate choice rather than silently drop them.
   */
  it("paints its own background, border and text colour so it stays legible", () => {
    const panel = /<section[^>]*class="([^"]*)"/.exec(html)?.[1] ?? "";
    expect(panel).toMatch(/\bbg-\w/);
    expect(panel).toMatch(/\bborder-\w/);
    expect(panel).toMatch(/\btext-\w/);
    // A bare `border` with no colour is the bug: it resolves to `currentColor`.
    // TASK-055 resolved spec 003's deferred "the banner overlay needs a background token" to the
    // real semantic tokens — the same three the consent sheet's panel uses — so no Tailwind
    // palette name (`bg-white`, `border-neutral-500`, `text-neutral-900`) is left anywhere in the
    // overlay, which is also what `fo/no-raw-color`'s sibling gate, `tests/unit/tokens.test.ts`,
    // checks on the built CSS.
    expect(panel).toContain("bg-surface");
    expect(panel).toContain("border-border-strong");
    expect(panel).toContain("text-ink");
    expect(html).not.toMatch(
      /\b(?:bg|text|border)-(?:white|black|neutral|gray|slate)\b/,
    );
  });

  it("renders the same markup for every launch locale it can target", () => {
    for (const candidate of suggestionCandidates()) {
      const markup = render(candidate);
      expect(markup, candidate.code).toContain(`href="${candidate.href}"`);
      expect(markup, candidate.code).toContain(candidate.nativeName);
    }
  });
});

/**
 * `/review 23`'s blocker, at the level the blocker actually lived at: the island's `useState`
 * initialiser.
 *
 * A throw in a lazy `useState` initialiser is a throw during a Client Component's first render,
 * which React unwinds to the nearest error boundary — and there is none between the banner and
 * the root, so the browser gets the error document instead of the page. The three facts the
 * initialiser reads (`navigator.languages`, `document.cookie`, `sessionStorage`) are all under
 * the visitor's, an extension's or an attacker's influence, and none of them is worth a page for.
 * `decideSuggestion` no longer throws on any of them (`tests/unit/i18n-hints.test.ts`), and this
 * `try`/`catch` is the invariant that keeps it that way when someone edits either side.
 *
 * The behavioural half — `fo_locale=%` and the page still renders — is `tests/e2e/banner.spec.ts`.
 * Asserted against the source because the island needs a DOM to render and this repository has no
 * jsdom dependency; the shape asserted is narrow enough that only removing the guard breaks it.
 */
describe("the island fails closed rather than taking the document down", () => {
  const source = readFileSync(
    resolve(
      __dirname,
      "../../src/modules/i18n/ui/LocaleSuggestionBannerIsland.tsx",
    ),
    "utf8",
  );

  /** The body of `useState<SuggestionDecision>(() => { … })`, and nothing else in the file. */
  const initialiser =
    /useState<SuggestionDecision>\(\(\) => \{([\s\S]*?)\n  \}\);/.exec(
      source,
    )?.[1];

  it("wraps the `decideSuggestion` call in the initialiser in try/catch", () => {
    expect(initialiser).toBeDefined();
    expect(initialiser!).toContain("try {");
    expect(initialiser!).toContain("decideSuggestion({");
    expect(initialiser!).toMatch(/\} catch \{/);
  });

  it("hides the banner on failure instead of rethrowing or guessing a target", () => {
    const rescue = /\} catch \{\s*return ([^;]+);/.exec(initialiser ?? "")?.[1];

    expect(rescue).toBeDefined();
    expect(rescue!).toContain("show: false");
    expect(rescue!).toContain('reason: "error"');
    expect(rescue!).not.toContain("throw");
  });

  it("keeps `error` a reason no decision branch can return, only the island", () => {
    const hints = readFileSync(
      resolve(__dirname, "../../src/modules/i18n/hints.ts"),
      "utf8",
    );
    const decide = hints.slice(
      hints.indexOf("export function decideSuggestion"),
    );

    expect(decide).not.toContain('reason: "error"');
  });
});
