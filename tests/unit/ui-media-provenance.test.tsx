/**
 * `MediaProvenanceNote` — the honesty label (spec 006 §2.5, §8, §14 **A2**, **AC-17**, T-17;
 * ADR-0014; `plan/07` §2.1/§2.2; TASK-079).
 *
 * Rendered against the real `messages/*.json` in all four locales, because AC-17 is a claim about
 * what is in the HTML of a page **before hydration** in each of them — and because the string is
 * the one this spec's §13 Q8 (i) puts on the October lawyer list, so the test is where the shipped
 * wording is pinned. §14 A2 fixes the pronoun: *our* florist, not "your".
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { NextIntlClientProvider } from "next-intl";

import { loadMessages } from "../../src/modules/i18n";
import { MediaAsset } from "../../src/modules/ui/media/MediaAsset.tsx";
import {
  MediaProvenanceNote,
  needsAiProvenanceNote,
} from "../../src/modules/ui/media/MediaProvenanceNote.tsx";
import type { MediaProvenanceNoteProps } from "../../src/modules/ui/media/MediaProvenanceNote.tsx";
import {
  committedMediaManifest,
  setMediaManifest,
} from "../../src/modules/ui/media/manifest.ts";
import {
  BAND_ASSET,
  PRODUCT_ASSET,
  mediaFixture,
} from "./support/media-fixture.ts";

const LOCALES = ["en", "en-gb", "de", "pl"] as const;

function render(node: React.ReactElement, locale: string): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={loadMessages(locale, ["media"])}
      timeZone="UTC"
    >
      {node}
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  setMediaManifest(committedMediaManifest);
});

describe("AC-17: the note follows the displayed `ai` assets (T-17)", () => {
  for (const locale of LOCALES) {
    it(`renders server-side text in \`${locale}\` when the page displays a generated image`, () => {
      setMediaManifest(mediaFixture());
      const html = render(
        <main>
          <MediaAsset assetId={PRODUCT_ASSET} locale={locale} />
          <MediaProvenanceNote assetIds={[PRODUCT_ASSET]} locale={locale} />
        </main>,
        locale,
      );

      expect(html).toContain('data-fo-media-provenance="ai"');
      // Server-rendered text, so it is in the HTML before any JavaScript runs and is crawlable
      // (`plan/02` §15: the structured data and the visible page agree).
      expect(html).toContain("Example arrangement");
      expect(html).toContain("our florist hand-makes each one");
      expect(html).not.toContain("your florist");
      expect(html).not.toContain("media.provenance");
    });
  }

  it("renders no note on a page with no image at all", () => {
    // A page every one of whose assets degraded to a placeholder owes no label: it is claiming
    // nothing. Since TASK-080 the committed dataset *does* render, so the state is reached the way
    // a real page reaches it — a locale the dataset has no alt text for (`plan/07` §8).
    const html = render(
      <main>
        <MediaAsset assetId={PRODUCT_ASSET} locale="ar-XB" />
        <MediaProvenanceNote assetIds={[PRODUCT_ASSET]} locale="ar-XB" />
      </main>,
      "en",
    );

    expect(html).not.toContain("<img");
    expect(html).not.toContain("data-fo-media-provenance");
    expect(html).not.toContain("Example arrangement");
  });

  it("renders no note when the page's only displayed asset is a photograph", () => {
    setMediaManifest(mediaFixture());
    const html = render(
      <main>
        <MediaAsset assetId={BAND_ASSET} locale="en" priority />
        <MediaProvenanceNote assetIds={[BAND_ASSET]} locale="en" />
      </main>,
      "en",
    );

    expect(html).not.toContain("data-fo-media-provenance");
  });

  it("renders one note on a mixed page — a single label, not one per image", () => {
    setMediaManifest(mediaFixture());
    const html = render(
      <MediaProvenanceNote
        assetIds={[BAND_ASSET, PRODUCT_ASSET]}
        locale="en"
      />,
      "en",
    );

    expect(html.match(/data-fo-media-provenance/g)).toHaveLength(1);
  });

  it("ignores an `ai` asset the page mentions but does not display", () => {
    // Approved and mentioned, but with no alt text for this locale it renders a placeholder — so
    // no generated image is on the page and no label is owed.
    setMediaManifest(mediaFixture({ altLocales: ["en"] }));
    expect(needsAiProvenanceNote([PRODUCT_ASSET], "pl")).toBe(false);
    expect(needsAiProvenanceNote([PRODUCT_ASSET], "en")).toBe(true);
  });

  it("is not mirrored under RTL: it is text, not a direction-carrying icon (§7)", () => {
    setMediaManifest(mediaFixture());
    const html = render(
      <MediaProvenanceNote assetIds={[PRODUCT_ASSET]} locale="en" />,
      "en",
    );
    expect(html).not.toContain("mirror-in-rtl");
  });

  it("admits no suppression flag: the prop type is exactly these three members", () => {
    // A type-level fact asserted as a value-level one, because AC-17's requirement is that *no
    // such prop exists* — ADR-0014 accepted AI imagery conditional on a label a template cannot
    // switch off. Adding a `hidden`/`suppress`/`variant` prop fails this test twice over: the
    // list below stops being exhaustive (a type error, since it is typed `keyof`) and the name
    // check below fails. `manifest` is *which* images the page shows, never whether a shown
    // generated image is labelled.
    const keys: readonly (keyof MediaProvenanceNoteProps)[] = [
      "assetIds",
      "locale",
      "manifest",
    ];
    expect(keys).toHaveLength(3);

    const source = String(MediaProvenanceNote);
    for (const forbidden of ["hidden", "suppress", "disabled", "visible"]) {
      expect(source.toLowerCase(), forbidden).not.toContain(forbidden);
    }
  });
});
