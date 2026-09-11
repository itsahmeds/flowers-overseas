/**
 * The `ui` module's public surface (spec 004 §2 "Where the design system lives", §13 Q9;
 * TASK-045), in the shape `tests/unit/i18n-barrel.test.ts` established for spec 003.
 *
 * Two things are pinned. First, that the barrel exports **components, pure functions and the
 * contrast manifest — and no token values**: a TypeScript copy of the palette would drift from
 * `globals.css` the first time someone edited one of them, and `fo/no-raw-color` would have to
 * grant it an exception. Second, that the module is registered where the boundary system can see
 * it: `MODULES` in `scripts/check-layout.ts`, whose zones `eslint/modules.js` generates.
 */
import { describe, expect, it } from "vitest";

import { MODULES } from "../../scripts/check-layout.ts";
import * as ui from "../../src/modules/ui/index.ts";

describe("src/modules/ui barrel", () => {
  it("is registered in the module manifest, so the boundary lint covers it", () => {
    expect(MODULES).toContain("ui");
  });

  it("exports exactly the documented surface", () => {
    expect(Object.keys(ui).sort()).toEqual(
      [
        // fonts
        "bodyFont",
        "displayFont",
        "fontVariables",
        // icons
        "ICON_NAMES",
        "Icon",
        "MIRRORED_IN_RTL",
        "Mark",
        // chrome (TASK-048)
        "SiteHeader",
        // layout primitives
        "CONTAINER_WIDTHS",
        "Cluster",
        "Container",
        "GAPS",
        "Grid",
        "Row",
        "Stack",
        // accessibility primitives
        "SkipLink",
        "VisuallyHidden",
        // type primitives
        "DISPLAY_SIZES",
        "Display",
        "Label",
        "LiveRegion",
        "TEXT_SIZES",
        "TEXT_TONES",
        "Text",
        // controls and content
        "BUTTON_SIZES",
        "BUTTON_STATES",
        "BUTTON_VARIANTS",
        "Button",
        "CHIP_TONES",
        "Chip",
        "PHOTO_RATIOS",
        "Photo",
        "Placeholder",
        // contrast manifest
        "CONTRAST_PAIRS",
        "CONTRAST_THRESHOLDS",
        "colorTokenNames",
        "contrastRatio",
        "evaluateContrastPairs",
        "formatContrastTable",
        "parseOklch",
        "parseThemeTokens",
        "relativeLuminance",
        "resolveColorToken",
        // chrome: the footer, its view projection and the three ids the rest of the system
        // names (TASK-049)
        "CONSENT_REOPEN_ATTRIBUTE",
        "FOOTER_ID_PREFIX",
        "REMINDERS_ANCHOR",
        "REMINDERS_ENDPOINT",
        "REMINDERS_FIELD_ID",
        "SiteFooter",
        "TrustMarks",
        "companyIdentity",
        "footerView",
        // consent: the sheet's Server Component, its register/catalogue projection, the zod-free
        // `fo_consent` reader and writer, and the gallery's inert states (TASK-051). The islands
        // themselves are **not** here: they are reached through `ConsentBanner` and two
        // `next/dynamic` boundaries, so no route can import a `"use client"` module directly and
        // put it in the initial bundle.
        "CONSENT_ENDPOINT",
        "ConsentBanner",
        "choicesOf",
        "clearConsentCookie",
        "consentView",
        "lifetimeLabel",
        "parseConsentCookie",
        "rawCookieValue",
        "serialiseConsentCookie",
        // media: the wrapper, the slot table and the R2 loader seam (TASK-052)
        "MEDIA_SLOTS",
        "MEDIA_SLOT_SPECS",
        "Media",
        "getMediaLoader",
        "mediaSlot",
        "placeholderLoader",
        "setMediaLoader",
        // media: the asset path, the variant loader, the LCP preload and the honesty label
        // (TASK-079). `MediaAsset` has no `alt` prop — alt text is data (spec 006 AC-18) — and
        // `MediaProvenanceNote` has no suppression prop (AC-17). The manifest and loader seams
        // are exported for the data-flip (TASK-080) and R2-flip (TASK-083) proofs.
        "MediaAsset",
        "MediaProvenanceNote",
        "PAGE_FORMATS",
        "PLACEHOLDER_REASONS",
        "SEED_SLOT_TO_UI_SLOT",
        "altFor",
        "assertSinglePriority",
        "assetById",
        "assetsForProduct",
        "boxForAsset",
        "committedMediaManifest",
        "getMediaManifest",
        "isDisplayable",
        "needsAiProvenanceNote",
        "preloadArgsFor",
        "resolveLoader",
        "resolveMedia",
        "setMediaManifest",
        "setVariantLoader",
        "srcSetFor",
        "staticVariantLoader",
        "uiSlotForSeedSlot",
        "variantsFor",
        // the locale home's above-the-fold surfaces and the finder's projection (TASK-052)
        "DESTINATIONS_ANCHOR",
        "FINDER_IDS",
        "FinderCard",
        "HERO_HEIGHTS",
        "HOME_BLEED",
        "HomeHero",
        "PROOF_FACTS",
        "ProofRow",
        "finderDestinations",
        "finderDestinationGroups",
        "finderTarget",
        // the locale home's lower sections and the trust strip (TASK-053)
        "FAQ_ENTRIES",
        "HOW_IT_WORKS_STEPS",
        "HomeFaq",
        "HowItWorks",
        "OCCASIONS_ANCHOR",
        "OccasionDates",
        "OccasionTiles",
        "TRUST_CLAIMS",
        "TrustStrip",
        "occasionDateViews",
        "occasionTiles",
        // the three data-gated sections and their provider seams (TASK-054). The `with*Provider`
        // injection hooks are deliberately absent: spec 003's rule is that a caller able to swap
        // a provider at runtime turns the seam into global mutable configuration, so the tests
        // reach them by module path and the gallery uses each section's `provider` prop.
        "DestinationsGrid",
        "REVIEWS_ANCHOR",
        "REVIEW_KINDS",
        "ReviewsSection",
        "TRENDING_ANCHOR",
        "TRENDING_BASES",
        "TrendingRow",
        "destinationStatusProviderOf",
        "emptyTrendingProvider",
        "getDestinationStatusProvider",
        "getReviewsProvider",
        "getTrendingProvider",
        "reviewsProviderOf",
        "staticDestinationStatusProvider",
        "staticReviewsProvider",
        "staticTrendingProvider",
        "trendingProviderOf",
      ].sort(),
    );
  });

  /**
   * Spec §3's non-goals, as an assertion (`/review 27` required change 2).
   *
   * "No input, select, textarea or form component ships here beyond the consent controls; the
   * design system's form layer is written against the checkout's real fields rather than guessed"
   * (§3, §13 Q10) and "no price is rendered in this spec" (§8). A `Field` and a `Price` were
   * written and removed; this is what stops them, or a differently-named equivalent, coming back
   * before the task that owns the real fields (010/013) and the real money (005/008/009).
   */
  it("exports no form control and no price block (spec §3, §8)", () => {
    const exported = Object.keys(ui);
    for (const banned of [
      "Field",
      "FIELD_STATES",
      "Form",
      "Input",
      "Select",
      "Textarea",
      "Checkbox",
      "Radio",
      "Price",
      "PRICE_SIZES",
      "Money",
    ]) {
      expect(exported, banned).not.toContain(banned);
    }
  });

  it("exports no colour, size or duration value (the tokens stay in globals.css)", () => {
    // The exported strings, and why each is a string: `fontVariables` names CSS variables rather
    // than font files, and TASK-049's five are DOM contracts — an attribute the consent island
    // binds to, a form action, and the id prefix and ids the reminder stub redirects to. None of
    // them is a token value, which is what this assertion is about.
    const EXPECTED_STRINGS = [
      // TASK-051's is a URL path, the route the consent island posts a decision to.
      "CONSENT_ENDPOINT",
      "CONSENT_REOPEN_ATTRIBUTE",
      "FOOTER_ID_PREFIX",
      "REMINDERS_ANCHOR",
      "REMINDERS_ENDPOINT",
      "REMINDERS_FIELD_ID",
      // TASK-052: `DESTINATIONS_ANCHOR` is a DOM contract (the id the finder's `Continue` points
      // at and TASK-054's destinations grid inherits), and `HOME_BLEED` is a *utility list*
      // (`px-md md:px-[56px]`) rather than a token value — it is exported so the home's sections
      // and the header can be pinned to the same inline gutter by a test.
      "DESTINATIONS_ANCHOR",
      "HOME_BLEED",
      // TASK-053: the id of the occasion grid — a DOM contract for the same reasons, and the
      // anchor spec 008's occasion hub will be linked from.
      "OCCASIONS_ANCHOR",
      // TASK-054: the ids of the two gated sections — DOM contracts, like the three above.
      "REVIEWS_ANCHOR",
      "TRENDING_ANCHOR",
      "fontVariables",
    ];
    for (const [name, value] of Object.entries(ui)) {
      if (typeof value !== "string") continue;
      expect(value, name).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(value, name).not.toMatch(/(?<![a-z])(?:rgba?|hsla?|oklch)\s*\(/);
      expect(EXPECTED_STRINGS, name).toContain(name);
    }
  });

  it("exports every component as a function, so none carries state or config", () => {
    for (const name of [
      "Button",
      "Chip",
      "Cluster",
      "Container",
      "Display",
      "Grid",
      "Icon",
      "Label",
      "Mark",
      "Photo",
      "Placeholder",
      "Row",
      "SkipLink",
      "Stack",
      "Text",
      "VisuallyHidden",
    ]) {
      expect(typeof (ui as Record<string, unknown>)[name], name).toBe(
        "function",
      );
    }
  });
});
