/**
 * T-04 (meta half) and the catalogue/manifest invariants of AC-4 and AC-23 (TASK-038).
 *
 * Three things are asserted, in order of how expensive they would be to discover later:
 *
 *  1. **`MESSAGE_META_COLUMNS` is a literal pin on spec 002 §5.1's `message_catalog` review
 *     columns.** Editing `MessageMetaSchema` or the column names alone fails here, which is the
 *     whole of AC-4's third clause: spec 012 mirrors this manifest into the table instead of
 *     translating field names.
 *  2. **The schemas reject the shapes that would otherwise fail silently** — a non-string leaf,
 *     an empty message, an unknown meta field, a non-sha256 `sourceHash`, and `reviewed: true`
 *     with no reviewer or date.
 *  3. **Every shipped manifest parses and covers every key of its own catalogue**, for all four
 *     locales including the thin `en-gb` override. A key with no review record is a key whose
 *     honesty `unreviewedShare()` (TASK-039) cannot judge, so `isLocaleIndexable()` would answer
 *     from incomplete data.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import enSource from "../../messages/en.json";
import type { Messages } from "../../src/modules/i18n";
import {
  MESSAGE_META_COLUMNS,
  MessageMetaManifestSchema,
  MessageMetaSchema,
  MessagesSchema,
  REPO_ONLY_META_FIELDS,
} from "../../src/modules/i18n/schemas.ts";

const repoRoot = resolve(__dirname, "../..");
const messagesDir = join(repoRoot, "messages");

/** The catalogues this spec ships, `en` first: everything else resolves through it. */
const LOCALES = ["en", "en-gb", "de", "pl"] as const;

const readJson = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(messagesDir, name), "utf8")) as Record<
    string,
    unknown
  >;

const flatten = (
  tree: Record<string, unknown>,
  prefix = "",
): Record<string, string> => {
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    if (typeof value === "string") flat[path] = value;
    else if (typeof value === "object" && value !== null)
      Object.assign(flat, flatten(value as Record<string, unknown>, path));
  }
  return flat;
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

const enFlat = flatten(readJson("en.json"));

/** A valid machine record, for tests that break exactly one field. */
const machineMeta = {
  source: "machine",
  reviewed: false,
  sourceHash: sha256("x"),
} as const;

describe("MESSAGE_META_COLUMNS (AC-4, T-04)", () => {
  it("maps every `MessageMetaSchema` field onto spec 002 §5.1's review columns", () => {
    expect(MESSAGE_META_COLUMNS).toEqual({
      source: "source",
      reviewed: "reviewed",
      reviewedBy: "reviewed_by",
      reviewedAt: "reviewed_at",
      sourceHash: "source_hash",
    });
  });

  it("accounts for every schema field as either a column or a repo-only field", () => {
    const schemaFields = Object.keys(MessageMetaSchema.shape).sort();

    expect(schemaFields).toEqual(
      [...Object.keys(MESSAGE_META_COLUMNS), ...REPO_ONLY_META_FIELDS].sort(),
    );
  });

  it("keeps `retained` repo-only: `message_catalog` has no such column", () => {
    expect(REPO_ONLY_META_FIELDS).toEqual(["retained"]);
    expect(Object.values(MESSAGE_META_COLUMNS)).not.toContain("retained");
  });

  it("names the columns spec 002 §5.1 actually declares for `message_catalog`", () => {
    const spec = readFileSync(join(repoRoot, "specs/002-schema-v1.md"), "utf8");
    // The declaration line, not a balanced-paren match: `source CHECK IN ('human','machine')`
    // contains parentheses of its own.
    const declaration =
      spec.split("\n").find((line) => line.includes("`message_catalog(")) ?? "";

    expect(declaration).not.toBe("");
    for (const column of Object.values(MESSAGE_META_COLUMNS)) {
      expect(declaration, column).toContain(column);
    }
  });
});

describe("MessagesSchema", () => {
  it("accepts a nested catalogue of ICU strings", () => {
    expect(
      MessagesSchema.parse({
        errors: { notFound: { heading: "Page not found" } },
        common: {
          floristCount: "{count, plural, one {# florist} other {# florists}}",
        },
      }),
    ).toEqual({
      errors: { notFound: { heading: "Page not found" } },
      common: {
        floristCount: "{count, plural, one {# florist} other {# florists}}",
      },
    });
  });

  it("rejects a non-string leaf, an array and an empty message", () => {
    expect(MessagesSchema.safeParse({ meta: { count: 3 } }).success).toBe(
      false,
    );
    expect(MessagesSchema.safeParse({ meta: { list: ["a"] } }).success).toBe(
      false,
    );
    expect(MessagesSchema.safeParse({ meta: { heading: "" } }).success).toBe(
      false,
    );
  });

  it("rejects a key that is not a camelCase identifier", () => {
    expect(MessagesSchema.safeParse({ "meta.home": "x" }).success).toBe(false);
    expect(MessagesSchema.safeParse({ "not a key": "x" }).success).toBe(false);
  });
});

describe("MessageMetaSchema", () => {
  it("accepts an unreviewed machine draft with a hash and nothing else", () => {
    expect(MessageMetaSchema.parse(machineMeta)).toEqual(machineMeta);
  });

  it("accepts a reviewed human record and the `retained` escape", () => {
    const reviewed = {
      source: "human",
      reviewed: true,
      reviewedBy: "founder",
      reviewedAt: "2026-09-08T00:00:00Z",
      sourceHash: sha256("x"),
      retained: true,
    };

    expect(MessageMetaSchema.parse(reviewed)).toEqual(reviewed);
  });

  it("rejects `reviewed: true` without a reviewer and a date", () => {
    expect(
      MessageMetaSchema.safeParse({ ...machineMeta, reviewed: true }).success,
    ).toBe(false);
    expect(
      MessageMetaSchema.safeParse({
        ...machineMeta,
        reviewed: true,
        reviewedBy: "founder",
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown field, an unknown source and a non-sha256 hash", () => {
    expect(
      MessageMetaSchema.safeParse({ ...machineMeta, translator: "x" }).success,
    ).toBe(false);
    expect(
      MessageMetaSchema.safeParse({ ...machineMeta, source: "llm" }).success,
    ).toBe(false);
    expect(
      MessageMetaSchema.safeParse({ ...machineMeta, sourceHash: "abc" })
        .success,
    ).toBe(false);
    expect(
      MessageMetaSchema.safeParse({
        ...machineMeta,
        sourceHash: sha256("x").toUpperCase(),
      }).success,
    ).toBe(false);
  });
});

describe("the shipped catalogues and manifests", () => {
  it("pairs every committed catalogue with exactly one manifest", () => {
    // Pseudo-locales (`en-XA`, `ar-XB`, TASK-042) are generated and git-ignored, carry no review
    // metadata by definition and are never indexable, so they are excluded by name rather than
    // by hoping nobody ran `pnpm i18n:pseudo` before `pnpm test`.
    const files = readdirSync(messagesDir).filter(
      (name) => !/-(?:XA|XB)\./.test(name),
    );
    const catalogues = files
      .filter((name) => name.endsWith(".json") && !name.endsWith(".meta.json"))
      .map((name) => name.replace(/\.json$/, ""))
      .sort();

    expect(catalogues).toEqual([...LOCALES].sort());
    for (const locale of catalogues) {
      expect(files, locale).toContain(`${locale}.meta.json`);
    }
  });

  for (const locale of LOCALES) {
    it(`parses \`${locale}.json\` as a catalogue and \`${locale}.meta.json\` as a manifest`, () => {
      expect(
        MessagesSchema.safeParse(readJson(`${locale}.json`)).success,
        locale,
      ).toBe(true);
      expect(
        MessageMetaManifestSchema.safeParse(readJson(`${locale}.meta.json`))
          .success,
        locale,
      ).toBe(true);
    });

    it(`covers every \`${locale}\` key with a review record and no orphan record`, () => {
      const keys = Object.keys(flatten(readJson(`${locale}.json`))).sort();
      const manifest = Object.keys(readJson(`${locale}.meta.json`)).sort();

      expect(manifest, locale).toEqual(keys);
    });

    it(`hashes every \`${locale}\` record against the \`en\` value it came from`, () => {
      const manifest = MessageMetaManifestSchema.parse(
        readJson(`${locale}.meta.json`),
      );

      for (const [key, meta] of Object.entries(manifest)) {
        const sourceValue = enFlat[key];
        expect(sourceValue, `${locale}/${key} exists in en.json`).toBeDefined();
        expect(meta.sourceHash, `${locale}/${key}`).toBe(
          sha256(sourceValue ?? ""),
        );
      }
    });
  }

  /**
   * The English the founder has skimmed, and the exact list of what he has not (TASK-084).
   *
   * A copy pass reworded seven shipped keys, and spec 004 §14 A5 binds it to hand the reworded
   * strings back to the founder rather than re-attest them itself — so `reviewed: false` with no
   * `reviewedBy` is the honest record, and this array is the queue. It is pinned rather than
   * counted because "some keys are unreviewed" is a state that grows quietly: adding a key here
   * is a deliberate line in a diff, and removing one is what the founder's review looks like.
   * `unreviewedShare("en")` must stay at or under the 5 % gate either way — `home-honesty` owns
   * that half.
   */
  const AWAITING_FOUNDER_REVIEW = [
    // TASK-120's honest-chrome sweep (spec 004 §14 A19, `/review 70`) added eight of these: the
    // gated fallbacks, the FAQ answer's split and the three home sentences it reworded. They are
    // the implementer's wording, proposed to the founder in the task brief's `## Escalations`,
    // and they wait here until he attests them — the same rule §14 A5 applied to TASK-084.
    //
    // On 2026-09-18 the founder attested four of them and they left this queue:
    // `nav.utility.datesPending` and `finder.datesPending` ("Delivery dates open when we confirm
    // our first florist"), `nav.utility.datesPendingShort` ("Delivery dates are not open yet")
    // and `nav.category.ourSelection` ("Our selection", id `our-selection`). The decision is in
    // `docs/decisions-log.md`; their `en` manifest entries carry `reviewedBy: "founder"` and
    // `reviewedAt: "2026-09-18T00:00:00Z"`. The `de` and `pl` entries stay `source: "machine"`
    // and unreviewed: what he attested is the English wording, not a German or Polish rendering
    // of it, and those two catalogues still echo the English string verbatim.
    // TASK-112 added four (spec 008 AC-7, AC-11). The two hub artboards were the founder's
    // 2026-09-16 design round, so the strings transcribed from them carry his attestation; these
    // four are **not** on the sheets. `categoryHub.destinationLink` and `occasionHub.datesCaption`
    // are reworded off it (the sheet's "See them with Poland's prices" is not English for the
    // other six destinations; the sheet's caption carries a year literal, which AC-11 forbids in
    // a message string), and `occasionHub.dateUnknown` and `occasionHub.destinationsHeading` are
    // drawn nowhere — the sheet states Romania's honest blank as an annotation and labels the
    // out-links block "Out of this page", which is architecture, not copy. Recorded in
    // `docs/design/README.md`'s TASK-112 row, clauses (c), (d) and (e).
    "categoryHub.destinationLink",
    "faq.whoDelivers.answer",
    "faq.whoDelivers.answerCutoff",
    "finder.cutoff",
    "finder.help",
    "footer.payment.methods",
    "home.destinations.elsewhere.body",
    "home.howItWorks.choose.body",
    "home.proof.photo.body",
    "meta.chooser.description",
    "meta.home.description",
    "nav.utility.cutoff",
    "nav.utility.cutoffShort",
    "occasionHub.dateUnknown",
    "occasionHub.datesCaption",
    "occasionHub.destinationsHeading",
    // TASK-113, the occasions index. Eleven of its thirteen strings are transcribed from
    // `wireframes/occasions-index-{desktop,mobile}.dc.html` and carry the founder's attestation;
    // these two are the implementer's generalisation of the artboard's name-day-specific prose
    // into a heading and a sentence that hold for every occasion whose date we cannot compute
    // (Sant Jordi, Grandmothers' Day in France, the May Day lily of the valley). No `<head>` pair
    // waits here, because the page has none: its `<title>` is its own `h1` and its description is
    // its own intro, both of them artboard copy.
    "occasionsIndex.undatedHeading",
    "occasionsIndex.undatedNote",
    // TASK-111, the country occasion page. Five of its eleven strings are transcribed from the
    // founder-approved artboards (`wireframes/country-occasion-{desktop,mobile}.dc.html`,
    // `country-shop-{desktop,mobile}.dc.html`) and carry his attestation; these six are wording
    // the implementer composed — the generalised date note in place of the drawing's
    // Poland-specific sentence, the honest blank for an occasion with no computable rule
    // (§14 design round Q6), the lede, the two `<head>` strings and the third column's link
    // label — so they wait here until he ticks them. No `reviewedBy`, by the rule above.
    "shop.occasion.dateNote",
    "shop.occasion.lede",
    "shop.occasion.seoDescription",
    "shop.occasion.seoTitle",
    "shop.occasion.undatedLine",
    "shop.root.occasionPageLink",
  ];

  it("reviews the authored English and leaves the machine drafts unreviewed (§13 Q7, Q10)", () => {
    const en = MessageMetaManifestSchema.parse(readJson("en.meta.json"));
    for (const meta of Object.values(en)) {
      expect(meta.source).toBe("human");
    }
    // Authored English is the founder's copy, so `reviewed: true` is his attestation and nobody
    // else's: a string an implementer wrote waits in this queue until he ticks it (`/review 58`
    // required change 2). The queue is pinned key-exact so growing it is a deliberate act.
    expect(
      Object.entries(en)
        .filter(([, meta]) => !meta.reviewed)
        .map(([key]) => key)
        .sort(),
    ).toStrictEqual(AWAITING_FOUNDER_REVIEW);
    for (const [key, meta] of Object.entries(en)) {
      // Unreviewed and *unattributed*: an implementer never signs the founder's name.
      expect(meta.reviewedBy === undefined, key).toBe(!meta.reviewed);
    }

    for (const locale of ["de", "pl"] as const) {
      const manifest = MessageMetaManifestSchema.parse(
        readJson(`${locale}.meta.json`),
      );
      for (const [key, meta] of Object.entries(manifest)) {
        expect(meta.reviewed, `${locale}/${key}`).toBe(false);
      }
      // The plural forms are the one piece of real `de`/`pl` copy this task authors, so they are
      // `human` and still unreviewed: a native reviewer has not seen them (`plan/13` B12).
      expect(manifest["common.floristCount"]?.source).toBe("human");
      expect(manifest["a11y.skipToContent"]?.source).toBe("machine");
    }
  });

  it("keeps `en-gb` a thin override of genuinely British wording only (§13 Q5)", () => {
    const override = flatten(readJson("en-gb.json"));
    const keys = Object.keys(override);

    expect(keys.length).toBeGreaterThan(0);
    for (const [key, value] of Object.entries(override)) {
      // A redundant override is an `i18n:check` error (TASK-040); it is also nonsense here.
      expect(value, key).not.toBe(enFlat[key]);
      expect(Object.keys(enFlat), key).toContain(key);
    }
    expect(override["errors.serverError.body"]).toContain("apologise");
    expect(enFlat["errors.serverError.body"]).toContain("apologize");
  });

  it("types `t()` from `en.json`: the new namespaces are in the augmentation", () => {
    // `global.d.ts` augments next-intl's `Messages` with `typeof en`, so the typed-key surface
    // follows the catalogue with no generation step (spec 003 §2 "typed keys"). The annotations
    // below are the assertion: renaming or dropping one of these keys fails `pnpm typecheck`,
    // and `Messages` is the same type next-intl checks `t()` against.
    const namespaces: readonly (keyof Messages)[] = [
      "meta",
      "chooser",
      "banner",
      "errors",
      "a11y",
      "common",
      // The consent sheet's copy (spec 004 §7, TASK-051): resolved on the server and handed to
      // the islands as props, so this namespace never reaches the client provider.
      "consent",
      // Spec 004 §7's chrome namespaces, added with the config registries that name their keys
      // (TASK-047); the header and footer that render them are TASK-048/TASK-049.
      "nav",
      "footer",
      "company",
      "destinations",
      // Spec 007 §7's hub namespace (TASK-092).
      "destinationsHub",
      // Spec 005 §7's namespace: the dataset's label keys, seeded by TASK-062 and rendered from
      // TASK-067. Typed like the rest, so a tier label is `t()`-checkable rather than a string.
      "catalog",
      // Spec 006 §7's namespace: the AI-provenance label, the per-slot placeholder captions and
      // the demo watermark label, added by TASK-073 and rendered by TASK-077/079. In no
      // `ROUTE_NAMESPACES` entry, so it reaches no client provider (AC-22).
      "media",
      // The locale home's own copy (TASK-052).
      "home",
      "finder",
      // The locale home's lower sections (TASK-053): the occasion tiles and the destination's
      // dated occasions, the trust strip's three claims with the guarantee name in its own key
      // (§13 Q4), and the five FAQ disclosures.
      "occasions",
      "trust",
      "faq",
      // Spec 007 §7's namespaces (TASK-091): the corridor page's section headings, fact labels,
      // calendar caption and the honest "we are choosing florists here" line, plus the
      // breadcrumb's hub label. The corridor *content* is not here and never will be — it lives
      // in `content/corridors/` where a machine draft is forbidden (`plan/02` §12).
      "breadcrumb",
      "corridor",
      // Spec 008 §7's namespace (TASK-108): the listing grid, toolbar, pagination and empty
      // state. Every component that reads it is a Server Component, so it reaches no client
      // provider and costs no client bytes (spec 008 §5.4).
      "shop",
      // Spec 008 §7's two hub namespaces (TASK-112): the `h1` patterns, the destination picker's
      // headings and the date table's caption and columns. The "prices depend on where it is
      // going" sentence is **one** key in `shop.hub` rather than one per hub, because both
      // artboards draw the same sentence and one sentence is one thing to review.
      "categoryHub",
      "occasionHub",
      // Spec 008 §7's occasions-index namespace (TASK-113): the `h1`, the intro, the two group
      // headings, the dated table's caption and columns, and the two sentences about a date we
      // cannot compute. No `seoTitle`/`seoDescription` pair — the page's `<head>` is its own
      // heading and its own intro.
      "occasionsIndex",
    ];
    const provenanceLabel: Messages["media"]["provenance"]["aiExample"] =
      enSource.media.provenance.aiExample;
    const tierLabel: Messages["catalog"]["tier"]["stems"] =
      enSource.catalog.tier.stems;
    const headline: Messages["banner"]["headline"] = enSource.banner.headline;
    const floristCount: Messages["common"]["floristCount"] =
      enSource.common.floristCount;
    const bannerActions: readonly string[] = [
      enSource.banner.switch,
      enSource.banner.stay,
      enSource.banner.dismiss,
    ];

    const destinationName: Messages["destinations"]["pl"]["name"] =
      enSource.destinations.pl.name;
    const categoryLabel: Messages["nav"]["category"]["ourSelection"] =
      enSource.nav.category.ourSelection;
    const heroHeading: Messages["home"]["hero"]["heading"] =
      enSource.home.hero.heading;
    const finderSubmit: Messages["finder"]["submit"] = enSource.finder.submit;
    const guaranteeName: Messages["trust"]["guarantee"]["name"] =
      enSource.trust.guarantee.name;
    const occasionSubtitle: Messages["occasions"]["nameDay"]["subtitle"] =
      enSource.occasions.nameDay.subtitle;
    const faqQuestion: Messages["faq"]["price"]["question"] =
      enSource.faq.price.question;

    expect([...namespaces].sort()).toEqual(Object.keys(enSource).sort());
    expect(destinationName).toBe("Poland");
    expect(categoryLabel).toBe("Our selection");
    expect(heroHeading).toBe("Flowers for someone far away.");
    expect(finderSubmit).toBe("Continue");
    expect(guaranteeName).toBe("7-day freshness guarantee");
    expect(occasionSubtitle).toContain("Imieniny");
    expect(faqQuestion).toBe("Is the price really final?");
    expect(headline).toContain("{language}");
    expect(floristCount).toContain("plural");
    expect(tierLabel).toContain("plural");
    expect(provenanceLabel).toContain("our florist");
    for (const action of bannerActions)
      expect(action.length).toBeGreaterThan(0);
  });
});
