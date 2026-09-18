/**
 * The manifest, and the **one** place the two slot vocabularies meet (spec 006 §2.1, §2.5, §5.2;
 * `/review 42`; TASK-079).
 *
 * Three jobs:
 *
 *  1. **The build-time import is the dataset.** `src/modules/ui/media/manifest.ts` deliberately
 *     runs no zod at render time (its header says why), so the validation happens here instead:
 *     the same three file families are parsed through `seed/schema/files.ts`. A malformed
 *     `media.json` therefore fails a unit test rather than a page render.
 *  2. **The seed↔UI slot mapping is pinned.** `seed/schema/media.ts`'s `mediaSlots` (crop) and
 *     `src/modules/ui/media/slots.ts`'s `MEDIA_SLOTS` (box) are different vocabularies with
 *     overlapping words. Adding a crop slot on either side without deciding its box fails here,
 *     which is what `/review 42` asked for; neither side is renamed.
 *  3. **Phase-0 state is asserted, not assumed.** No variants and no alt text are committed yet,
 *     so nothing in the committed dataset is displayable — the honest state, and the baseline
 *     TASK-080's data flip is measured against.
 */
import { describe, expect, it } from "vitest";

import altDe from "../../seed/data/alt/de.json" with { type: "json" };
import altEnGb from "../../seed/data/alt/en-gb.json" with { type: "json" };
import altEn from "../../seed/data/alt/en.json" with { type: "json" };
import altPl from "../../seed/data/alt/pl.json" with { type: "json" };
import assetsFile from "../../seed/data/media.json" with { type: "json" };
import variantsFile from "../../seed/data/media-variants.json" with { type: "json" };
import {
  AltFileSchema,
  MediaFileSchema,
  MediaVariantsFileSchema,
} from "../../seed/schema/files.ts";
import { mediaSlots } from "../../seed/schema/media.ts";
import {
  altFor,
  assetById,
  assetsForProduct,
  boxForAsset,
  committedMediaManifest,
  getMediaManifest,
  setMediaManifest,
  variantsFor,
} from "../../src/modules/ui/media/manifest.ts";
import { isDisplayable } from "../../src/modules/ui/media/resolve.ts";
import {
  MEDIA_SLOTS,
  SEED_SLOT_TO_UI_SLOT,
  uiSlotForSeedSlot,
} from "../../src/modules/ui/media/slots.ts";
import {
  BAND_ASSET,
  FIXTURE_WIDTHS,
  PRODUCT_ASSET,
  mediaFixture,
} from "./support/media-fixture.ts";

describe("the committed manifest parses under the seed schemas", () => {
  it("accepts seed/data/media.json", () => {
    expect(() => MediaFileSchema.parse(assetsFile)).not.toThrow();
  });

  it("accepts seed/data/media-variants.json", () => {
    expect(() => MediaVariantsFileSchema.parse(variantsFile)).not.toThrow();
  });

  it("accepts every seed/data/alt/{locale}.json, and each names its own locale", () => {
    for (const file of [altEn, altEnGb, altDe, altPl]) {
      const parsed = AltFileSchema.parse(file);
      expect(parsed.locale.length).toBeGreaterThan(1);
    }
    expect([altEn, altEnGb, altDe, altPl].map((file) => file.locale)).toEqual([
      "en",
      "en-gb",
      "de",
      "pl",
    ]);
  });

  it("indexes every asset of the file by id, with no loss and no invention", () => {
    expect(committedMediaManifest.assets).toHaveLength(assetsFile.rows.length);
    for (const row of assetsFile.rows) {
      expect(assetById(row.id)?.id, row.id).toBe(row.id);
    }
  });
});

describe("the seed ↔ UI slot mapping (`/review 42`)", () => {
  it("maps every seed crop slot exactly once, and no others", () => {
    expect(Object.keys(SEED_SLOT_TO_UI_SLOT).sort()).toEqual(
      [...mediaSlots].sort(),
    );
  });

  it("is the pinned table, so neither vocabulary can drift silently", () => {
    expect(SEED_SLOT_TO_UI_SLOT).toEqual({
      hero: "hero",
      occasionTile: "tile",
      productHero: "grid",
      productDetail: "grid",
      productThumb: "thumb",
      context: "hero",
      og: null,
    });
  });

  it("only ever targets a box that exists in the UI vocabulary", () => {
    for (const [seedSlot, uiSlot] of Object.entries(SEED_SLOT_TO_UI_SLOT)) {
      if (uiSlot === null) continue;
      expect(MEDIA_SLOTS, seedSlot).toContain(uiSlot);
    }
  });

  it("gives `og` no box at all: a social crop is not a page box", () => {
    expect(uiSlotForSeedSlot("og")).toBeUndefined();
  });

  it("resolves an asset's box from its own crop slot", () => {
    const previous = setMediaManifest(mediaFixture());
    try {
      const product = assetById(PRODUCT_ASSET);
      const band = assetById(BAND_ASSET);
      expect(product && boxForAsset(product)).toBe("grid");
      expect(band && boxForAsset(band)).toBe("hero");
    } finally {
      setMediaManifest(previous);
    }
  });
});

describe("Phase 0 since TASK-080: the committed dataset has assets, bytes and alt text", () => {
  it("commits asset rows, variant rows and alt text in all four launch locales", () => {
    expect(committedMediaManifest.assets.length).toBeGreaterThan(0);
    expect(committedMediaManifest.variants.length).toBeGreaterThan(0);
    expect(Object.keys(committedMediaManifest.alt).sort()).toEqual([
      "de",
      "en",
      "en-gb",
      "pl",
    ]);
    for (const [locale, index] of Object.entries(committedMediaManifest.alt)) {
      expect(Object.keys(index).length, locale).toBe(
        committedMediaManifest.assets.length,
      );
    }
  });

  it("therefore displays every approved asset in every launch locale", () => {
    for (const asset of committedMediaManifest.assets) {
      for (const locale of ["en", "en-gb", "de", "pl"]) {
        expect(isDisplayable(asset.id, locale), `${asset.id}/${locale}`).toBe(
          true,
        );
      }
    }
  });

  it("and displays none of them in a locale with no alt text (`plan/07` §8)", () => {
    // The pseudo-locale nobody will ever author alt text for: the honest degradation of AC-18 is
    // the captioned box, never an English sentence announced on a non-English page.
    for (const asset of committedMediaManifest.assets) {
      expect(isDisplayable(asset.id, "ar-XB"), asset.id).toBe(false);
    }
  });
});

describe("the lookups (§5.2: pure, synchronous, one answer)", () => {
  function withFixture<T>(run: () => T): T {
    const restore = setMediaManifest(mediaFixture());
    try {
      return run();
    } finally {
      setMediaManifest(restore);
    }
  }

  it("returns the ladder in ascending width order, per page format", () => {
    withFixture(() => {
      const set = variantsFor(PRODUCT_ASSET, "grid");
      expect(set?.steps.avif.map((step) => step.width)).toEqual([
        ...FIXTURE_WIDTHS,
      ]);
      expect(set?.steps.webp.map((step) => step.width)).toEqual([
        ...FIXTURE_WIDTHS,
      ]);
    });
  });

  it("takes `sizes` and the reserved ratio from the box, not from the asset", () => {
    withFixture(() => {
      expect(variantsFor(PRODUCT_ASSET, "grid")?.sizes).toBe(
        "(min-width: 768px) 25vw, 50vw",
      );
      expect(variantsFor(PRODUCT_ASSET, "thumb")?.sizes).toBe("96px");
      expect(variantsFor(PRODUCT_ASSET, "grid")?.ratio).toBe("portrait");
    });
  });

  it("reports the intrinsic size of the largest step, for `width`/`height`", () => {
    withFixture(() => {
      const set = variantsFor(PRODUCT_ASSET, "grid");
      expect(set?.width).toBe(1080);
      expect(set?.height).toBe(1350);
    });
  });

  it("gives the same answer every time it is asked (no memoised first caller)", () => {
    withFixture(() => {
      expect(variantsFor(PRODUCT_ASSET, "grid")).toEqual(
        variantsFor(PRODUCT_ASSET, "grid"),
      );
    });
  });

  it("has no answer for an asset with no ladder", () => {
    withFixture(() => {
      expect(variantsFor("fo-does-not-exist", "grid")).toBeUndefined();
    });
  });

  it("reads alt text per locale with **no** fallback chain", () => {
    const restore = setMediaManifest(mediaFixture({ altLocales: ["en"] }));
    try {
      expect(altFor(PRODUCT_ASSET, "en")).toBeTypeOf("string");
      // The message catalogue falls back en-gb → en; alt text does not, because an English alt on
      // a Polish page is a WCAG 3.1.2 failure and a placeholder is not (spec 006 §2.5).
      expect(altFor(PRODUCT_ASSET, "pl")).toBeUndefined();
      expect(altFor(PRODUCT_ASSET, "en-gb")).toBeUndefined();
    } finally {
      setMediaManifest(restore);
    }
  });

  it("orders a product's gallery primary first, then by editorial `sortOrder`", () => {
    withFixture(() => {
      expect(assetsForProduct("FO-BQ-001").map((entry) => entry.id)).toEqual([
        PRODUCT_ASSET,
      ]);
    });
  });

  it("restores the committed manifest when a fixture is uninstalled", () => {
    expect(getMediaManifest()).toBe(committedMediaManifest);
  });
});
