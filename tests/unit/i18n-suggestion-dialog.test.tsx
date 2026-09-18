/**
 * T-28 (markup half) / AC-28 and the §8 accessibility contract of the locale suggestion, as §14
 * A14 reshaped it into a popup (TASK-041, TASK-085, TASK-119).
 *
 * Three halves, all without a browser:
 *
 *  - **`suggestionCandidates()`** — the projection the Server Component hands across the RSC
 *    boundary. It is what keeps the locale registry out of the browser, and its `href`s come from
 *    `localePath()`, so this is also where "the island never concatenates a URL" (§6, AC-13) is
 *    asserted.
 *  - **`suggestionCopy()`** — the copy projection, resolved with the **real** catalogues, so the
 *    ICU arguments of `suggestion.headline`, `suggestion.headlineInCountry`, `suggestion.continue`
 *    and `suggestion.stay` are exercised rather than assumed. The assertions that matter are the
 *    two §14 A14 added: the offer is written in the language it offers, and the "stay" line is
 *    written in the language of the page behind it.
 *  - **`LocaleSuggestionDialogView`** — the markup, rendered with `react-dom/server`. The asserted
 *    copy is therefore the shipped copy, and the view is proven to need no message context at all:
 *    it renders outside any provider.
 *
 * The parts that need a browser — the modal open, the focus move and restore, `Esc`, the
 * `/api/geo` round trip, the cookie the browser stores — are `tests/e2e/banner.spec.ts` and
 * `tests/a11y/banner.spec.ts`; the decision matrix is `tests/unit/i18n-hints.test.ts`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { localeForCountry } from "../../src/config/country-locale.data.ts";
import type { SuggestionCandidate } from "../../src/modules/i18n/hints.ts";
import { suggestionCandidates } from "../../src/modules/i18n/ui/LocaleSuggestionDialog.tsx";
import { LocaleSuggestionDialogView } from "../../src/modules/i18n/ui/LocaleSuggestionDialogIsland.tsx";
import {
  type SuggestionTranslate,
  suggestionCopy,
} from "../../src/modules/i18n/ui/suggestionCopy.ts";

const noop = (): void => undefined;

const englishPage = suggestionCopy("en", suggestionCandidates());
const german = suggestionCandidates().find((c) => c.code === "de")!;

function render(
  target: SuggestionCandidate,
  headline = englishPage.targets[target.code]?.headline ?? "",
): string {
  const targetCopy = englishPage.targets[target.code];
  if (targetCopy === undefined) throw new Error(`no copy for ${target.code}`);
  return renderToStaticMarkup(
    <LocaleSuggestionDialogView
      headline={headline}
      headlineId="headline-1"
      onContinue={noop}
      onStay={noop}
      stayLabel={englishPage.stay}
      switchLabel={targetCopy.continueLabel}
      target={target}
    />,
  );
}

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
    expect(suggestionCandidates("legal").map((c) => c.href)).toEqual([
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

describe("suggestionCopy (§14 A14: the offer speaks the language it offers)", () => {
  /** A translator that records which locale it was built for, so the routing is observable. */
  const spyFor =
    (locale: string): SuggestionTranslate =>
    (key, values = {}) =>
      `${locale}:${key}(${Object.entries(values)
        .map(([name, value]) => `${name}=${value}`)
        .sort()
        .join(",")})`;

  it("resolves every target's strings from that target's own catalogue", () => {
    const copy = suggestionCopy("en", suggestionCandidates(), spyFor);

    expect(copy.targets["de"]?.headline).toBe("de:headline(language=Deutsch)");
    expect(copy.targets["de"]?.continueLabel).toBe(
      "de:continue(language=Deutsch)",
    );
    expect(copy.targets["pl"]?.headline).toBe("pl:headline(language=Polski)");
  });

  it("resolves the `stay` line in the locale of the page, naming that locale", () => {
    expect(suggestionCopy("en", suggestionCandidates(), spyFor).stay).toBe(
      "en:stay(language=English)",
    );
    expect(suggestionCopy("de", suggestionCandidates(), spyFor).stay).toBe(
      "de:stay(language=Deutsch)",
    );
  });

  it("names each mapped country in the language of the locale it maps to", () => {
    const copy = suggestionCopy("en", suggestionCandidates());

    // CLDR exonyms through `formatCountryName`, never a hand-authored list.
    expect(copy.targets["de"]?.headlineByCountry["DE"]).toContain(
      "Deutschland",
    );
    expect(copy.targets["de"]?.headlineByCountry["AT"]).toContain("Österreich");
    expect(copy.targets["pl"]?.headlineByCountry["PL"]).toContain("Polska");
    expect(copy.targets["en-gb"]?.headlineByCountry["GB"]).toContain(
      "United Kingdom",
    );
  });

  it("gives each target exactly the countries the table maps to it", () => {
    const copy = suggestionCopy("en", suggestionCandidates());

    expect(Object.keys(copy.targets["de"]?.headlineByCountry ?? {})).toEqual([
      "AT",
      "CH",
      "DE",
    ]);
    expect(Object.keys(copy.targets["en-gb"]?.headlineByCountry ?? {})).toEqual(
      ["GB", "IE"],
    );
    // `en` is the fallback for every *unmapped* country, so it names none of them: the island
    // falls back to the language-only headline, which is why that string exists.
    expect(Object.keys(copy.targets["en"]?.headlineByCountry ?? {})).toEqual(
      [],
    );
    expect(localeForCountry("FR")).toBe("en");
  });

  it("leaves no ICU argument unresolved, in any locale and any country", () => {
    for (const locale of ["en", "en-gb", "de", "pl"]) {
      const copy = suggestionCopy(locale, suggestionCandidates());
      const strings = [
        copy.stay,
        ...Object.values(copy.targets).flatMap((target) => [
          target.headline,
          target.continueLabel,
          ...Object.values(target.headlineByCountry),
        ]),
      ];
      for (const value of strings) {
        expect(value, `${locale}: ${value}`).not.toContain("{");
        expect(value.length, locale).toBeGreaterThan(0);
      }
    }
  });

  it("renders the target's own `nativeName`, so a locale added to the registry is covered", () => {
    const copy = suggestionCopy("en", suggestionCandidates());
    for (const candidate of suggestionCandidates()) {
      expect(copy.targets[candidate.code]?.headline, candidate.code).toContain(
        candidate.nativeName,
      );
      expect(
        copy.targets[candidate.code]?.continueLabel,
        candidate.code,
      ).toContain(candidate.nativeName);
    }
  });

  it("resolves the shipped English wording", () => {
    expect(englishPage.targets["de"]?.headline).toBe("Continue in Deutsch?");
    expect(englishPage.targets["de"]?.headlineByCountry["DE"]).toBe(
      "You seem to be in Deutschland. Continue in Deutsch?",
    );
    expect(englishPage.stay).toBe("Stay in English");
  });
});

describe("LocaleSuggestionDialogView (§14 A14 'Shape', §8)", () => {
  const html = render(german);

  it("is a native `<dialog>`, labelled by its own headline", () => {
    expect(html).toContain("<dialog");
    const labelledBy = /aria-labelledby="([^"]+)"/.exec(html)?.[1];
    expect(labelledBy).toBe("headline-1");
    expect(html).toContain(`id="${labelledBy!}"`);
    // The role and the focus trap come from `showModal()`, not from hand-written ARIA: no
    // `role="dialog"`, no `aria-modal`, no `tabindex` juggling to keep in step with the browser.
    expect(html).not.toContain('role="region"');
    expect(html).not.toContain("aria-modal");
    expect(html).not.toContain("tabindex");
  });

  it("offers exactly two actions: a real link out, and a button to stay", () => {
    expect(html.match(/<a\b/g)).toHaveLength(1);
    expect(html.match(/<button\b/g)).toHaveLength(1);
    expect(html).toContain('data-fo-banner-action="continue"');
    expect(html).toContain('data-fo-banner-action="stay"');
    // The third action §14 A14 removed: a dismissal that recorded nothing and asked again.
    expect(html).not.toContain('data-fo-banner-action="dismiss"');
  });

  it("renders the shipped copy: the offer in German, the way out in English", () => {
    expect(html).toContain("Continue in Deutsch?");
    expect(html).toContain("Continue in Deutsch<");
    expect(html).toContain("Stay in English");
  });

  it("renders the country wording when the island passes it", () => {
    const withCountry = render(
      german,
      englishPage.targets["de"]?.headlineByCountry["DE"] ?? "",
    );

    expect(withCountry).toContain("You seem to be in Deutschland.");
  });

  it("declares the target language on the offer, so it is pronounced correctly", () => {
    expect(html).toContain('href="/de"');
    expect(html).toContain('lang="de"');
    // React serialises the JSX prop verbatim; HTML attribute names are case-insensitive, so the
    // crawler and the screen reader both read it.
    expect(html).toContain('hrefLang="de"');
  });

  it("gives the two controls one skin, so neither answer looks more inviting (§8)", () => {
    const classes = [...html.matchAll(/class="([^"]*)"/g)].map((m) => m[1]);
    const controls = classes.filter((value) => value?.includes("min-h-[44px]"));
    expect(controls).toHaveLength(2);
    expect(controls[0]).toBe(controls[1]);
  });

  it("caps the mobile sheet at 35 % of the viewport (the interstitial rule)", () => {
    expect(html).toContain("max-h-[35dvh]");
    // …and becomes a centred card from `sm:` up, with the browser's own backdrop dim.
    expect(html).toContain("sm:m-auto");
    expect(html).toContain("sm:w-[28rem]");
    expect(html).toContain("scrim-backdrop");
  });

  it("reserves no layout space and writes no raw z-index (CLS 0, AC-28)", () => {
    // A closed `<dialog>` is `display: none` and an open modal one paints in the top layer, so
    // there is nothing in flow either way — and nothing to race the consent sheet in the z-scale.
    expect(html).not.toMatch(/class="[^"]*\bz-\d/);
    expect(html).not.toContain("fixed");
  });

  it("uses logical properties only (`fo/no-physical-css`)", () => {
    expect(html).not.toMatch(/class="[^"]*\b(?:left|right)-/);
    expect(html).not.toMatch(/class="[^"]*\bm[lr]-/);
    expect(html).toContain("ms-0");
    expect(html).toContain("me-0");
  });

  it("paints its own surface in semantic tokens so it stays legible over any page", () => {
    const panel = /<div[^>]*class="([^"]*)"/.exec(html)?.[1] ?? "";
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

  it("renders outside any message provider, because the browser has none", () => {
    // The `render()` helper mounts no provider, and this assertion says so on purpose: if the view
    // ever reads a message through a hook again, this render throws instead of quietly
    // reintroducing the 10 705 B provider (spec 004 §14 A1 addendum).
    expect(html).toContain('data-fo-banner="shown"');
    expect(html).toContain('data-fo-locale-dialog="shown"');
  });
});

/**
 * The island's own guarantees, asserted against its source: it needs a DOM to render and this
 * repository has no jsdom, so the shapes asserted here are narrow enough that only removing the
 * guarantee breaks them. Each one has a browser test behind it in `tests/e2e/banner.spec.ts`.
 */
describe("the island's contracts (TASK-119)", () => {
  const source = readFileSync(
    resolve(
      __dirname,
      "../../src/modules/i18n/ui/LocaleSuggestionDialogIsland.tsx",
    ),
    "utf8",
  );

  /** The body of `useState<SuggestionDecision>(() => { … })`, and nothing else in the file. */
  const initialiser =
    /useState<SuggestionDecision>\(\(\) => \{([\s\S]*?)\n  \}\);/.exec(
      source,
    )?.[1];

  it("fails closed rather than taking the document down (`/review 23`'s blocker)", () => {
    expect(initialiser).toBeDefined();
    expect(initialiser!).toContain("try {");
    expect(initialiser!).toContain("decideSuggestion({");
    expect(initialiser!).toMatch(/\} catch \{/);
    const rescue = /\} catch \{\s*return ([^;]+);/.exec(initialiser ?? "")?.[1];
    expect(rescue!).toContain("show: false");
    expect(rescue!).toContain('reason: "error"');
  });

  it("asks `/api/geo` only when the languages answered nothing (§14 A14's order)", () => {
    expect(source).toContain(
      'decision.reason === "noBetterLocale" && !askedForCountry',
    );
    expect(source).toContain("if (!awaitingCountry) return undefined;");
  });

  it("asks for the country without a cookie, a referrer or a cache entry", () => {
    const fetchCall = /await fetch\(GEO_ENDPOINT, \{([\s\S]*?)\}\);/.exec(
      source,
    )?.[1];
    expect(fetchCall).toBeDefined();
    expect(fetchCall!).toContain('cache: "no-store"');
    expect(fetchCall!).toContain('credentials: "omit"');
    expect(fetchCall!).toContain('referrerPolicy: "no-referrer"');
    expect(fetchCall!).toContain("AbortSignal.timeout(GEO_TIMEOUT_MS)");
  });

  it("navigates only by the visitor pressing a link (ADR-0006)", () => {
    // Comments stripped: this module *discusses* `location.assign()` in the sentence explaining
    // why it does not call one, and a gate that a comment can trip is a gate nobody trusts.
    const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    for (const forbidden of [
      "location.assign",
      "location.replace",
      "location.href =",
      "router.push",
      "router.replace",
      "preventDefault()",
    ]) {
      // `preventDefault` appears once and only in `onCancel` — asserted separately below.
      const occurrences = code.split(forbidden).length - 1;
      expect(occurrences, forbidden).toBe(
        forbidden === "preventDefault()" ? 1 : 0,
      );
    }
    const cancel = /onCancel=\{\(event\) => \{([\s\S]*?)\n      \}\}/.exec(
      code,
    )?.[1];
    expect(cancel).toBeDefined();
    expect(cancel!).toContain("event.preventDefault()");
    expect(cancel!).toContain("onStay()");
  });

  it("releases the overlay gate on every terminal path, so consent is never suppressed", () => {
    const effect =
      /if \(decision\.show \|\| awaitingCountry\) \{([\s\S]*?)\n  \}, \[decision, awaitingCountry\]\);/.exec(
        source,
      )?.[0];
    expect(effect).toBeDefined();
    expect(effect!).toContain("holdLocaleGate();");
    expect(effect!).toContain("releaseLocaleGate();");
  });

  it("keeps `error` a reason no decision branch can return, only the island", () => {
    const hints = readFileSync(
      resolve(__dirname, "../../src/modules/i18n/hints.ts"),
      "utf8",
    );
    expect(
      hints.slice(hints.indexOf("export function decideSuggestion")),
    ).not.toContain('reason: "error"');
  });
});
