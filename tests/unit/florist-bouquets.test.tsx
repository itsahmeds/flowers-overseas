/**
 * "My bouquets" for florists without a database (spec 030b AC-52 to AC-56, AC-58 florist half;
 * TASK-444).
 *
 *  - T-54: `floristBouquetState`'s table, and each state's text on the card.
 *  - T-53 (unit half): `FloristBouquetRowSchema` refuses a row with a retail field.
 *  - T-52 (format half): the amount in `pl` (`100,00 zł` for 10 000 PLN), stems by plural rule.
 *  - T-55 (link half): each "Ask for a change" `href` is exactly `mailto:{email}?subject=` plus
 *    the encoded subject, with no amount and no name; no mailbox, no `mailto:` and the support
 *    line; no `<form>` in the page body.
 *  - T-56: `floristInbox.bouquets.*` in `en`, `pl`, `de`, `reviewed: false`, no banned word and no
 *    dash; the sections navigation shows "My bouquets", current on the bouquets page.
 *  - AC-58: no file of the florist route tree imports `modules/admin` or
 *    `modules/partners/contracts`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { createTranslator } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FLORIST_PATHS } from "../../src/config/florists.ts";
import { bannedVoiceWordsIn } from "../../src/config/voice.ts";
import type { FloristContext } from "../../src/lib/auth/florist.ts";
import { loadMessages } from "../../src/modules/i18n/index.ts";
import { floristTranslator } from "../../src/modules/partners/auth/copy.ts";
import {
  type FloristBouquetRow,
  FloristBouquetRowSchema,
  floristBouquetState,
} from "../../src/modules/partners/portal/bouquets.ts";
import {
  type BouquetTranslator,
  bouquetCards,
  changeHref,
} from "../../src/modules/partners/portal/view.ts";
import { BouquetList } from "../../src/modules/partners/ui/portal/BouquetList.tsx";
import { SignedInFrame } from "../../src/app/vendor/chrome.tsx";

const ROOT = join(import.meta.dirname, "..", "..");
const LANGUAGES = ["en", "pl", "de"] as const;

function labels(locale: (typeof LANGUAGES)[number]): BouquetTranslator {
  return createTranslator({
    locale,
    messages: loadMessages(locale, ["floristInbox", "catalog"]),
  }) as unknown as BouquetTranslator;
}

const ROW: FloristBouquetRow = {
  mappingId: "6f1c2e0a-3b7d-4c55-9a1e-2d8f0b7c4e91",
  sku: "FO-BQ-001",
  productName: "Amber Hour",
  photoId: null,
  sizeKey: "stems_15",
  sizeLabelKey: "catalog.tier.stems",
  stems: 15,
  payoutMinor: 10_000n,
  currency: "PLN",
  state: "on_sale",
};

const noPhoto = () => null;

function cards(
  rows: readonly FloristBouquetRow[],
  locale: (typeof LANGUAGES)[number],
  supportEmail: string | undefined,
) {
  return bouquetCards(rows, {
    t: labels(locale),
    locale,
    supportEmail,
    photoOf: noPhoto,
  });
}

function page(
  rows: readonly FloristBouquetRow[],
  options: {
    locale?: (typeof LANGUAGES)[number];
    supportEmail?: string;
    notice?: string;
  } = {},
): string {
  const locale = options.locale ?? "en";
  const t = labels(locale);
  return renderToStaticMarkup(
    <main>
      <BouquetList
        locale={locale}
        title={t("floristInbox.bouquets.title")}
        intro={t("floristInbox.bouquets.intro")}
        notice={
          options.notice === undefined ? undefined : <p>{options.notice}</p>
        }
        cards={cards(rows, locale, options.supportEmail)}
        empty={t("floristInbox.bouquets.empty")}
        {...(options.supportEmail === undefined
          ? {
              supportLine: t("floristInbox.bouquets.supportLine", {
                support: "+1 (213) 592-5150",
              }),
            }
          : {})}
      />
    </main>,
  );
}

describe("T-54: floristBouquetState", () => {
  const onSale = {
    productStatus: "active",
    canFulfil: true,
    partnerStatus: "active",
    liveCoveredPriceExists: true,
  } as const;

  it.each([
    [
      "active, can fulfil, partner active, live covered price",
      onSale,
      "on_sale",
    ],
    [
      "a draft product",
      { ...onSale, productStatus: "draft" },
      "not_yet_on_sale",
    ],
    [
      "an active product without a live covered price",
      { ...onSale, liveCoveredPriceExists: false },
      "not_yet_on_sale",
    ],
    ["can_fulfil false", { ...onSale, canFulfil: false }, "paused"],
    ["a paused partner", { ...onSale, partnerStatus: "paused" }, "paused"],
    ["a retired product", { ...onSale, productStatus: "retired" }, "withdrawn"],
    [
      "a retired product the florist cannot make",
      { ...onSale, productStatus: "retired", canFulfil: false },
      "withdrawn",
    ],
    [
      "a demo partner with a live covered price",
      { ...onSale, partnerStatus: "demo" },
      "not_yet_on_sale",
    ],
  ] as const)("%s → %s", (_name, input, expected) => {
    expect(floristBouquetState(input)).toBe(expected);
  });

  it("each state renders its own text", () => {
    const states = [
      "on_sale",
      "not_yet_on_sale",
      "paused",
      "withdrawn",
    ] as const;
    const html = page(
      states.map((state, i) => ({
        ...ROW,
        mappingId: ROW.mappingId.replace(/1$/u, String(i)),
        state,
      })),
    );
    for (const [state, text] of [
      ["on_sale", "On sale"],
      ["not_yet_on_sale", "Not on sale yet"],
      ["paused", "Paused"],
      ["withdrawn", "No longer sold"],
    ] as const) {
      expect(html).toContain(`data-fo-bouquet-state="${state}">${text}</span>`);
    }
  });

  it("a paused shop: the notice above the cards and Paused on every row", () => {
    const rows = [
      {
        ...ROW,
        state: floristBouquetState({
          productStatus: "active",
          canFulfil: true,
          partnerStatus: "paused",
          liveCoveredPriceExists: true,
        }),
      },
      {
        ...ROW,
        sizeKey: "stems_21",
        stems: 21,
        state: floristBouquetState({
          productStatus: "draft",
          canFulfil: true,
          partnerStatus: "paused",
          liveCoveredPriceExists: false,
        }),
      },
    ];
    const html = page(rows, { notice: "Your shop is paused." });
    expect(html.indexOf("Your shop is paused.")).toBeLessThan(
      html.indexOf("data-fo-bouquet="),
    );
    expect(html.match(/data-fo-bouquet-state="paused"/gu)).toHaveLength(2);
    expect(html).not.toMatch(/data-fo-bouquet-state="(?!paused)/u);
  });
});

describe("T-53 (unit): the strict row schema", () => {
  it("parses a row and refuses one with an extra retailMinor field", () => {
    expect(FloristBouquetRowSchema.parse(ROW)).toEqual(ROW);
    expect(() =>
      FloristBouquetRowSchema.parse({ ...ROW, retailMinor: 18_900n }),
    ).toThrow();
  });
});

describe("T-52 (format): amount and stems in the member's language", () => {
  it("pl: You receive 100,00 zł for 10 000 PLN minor units, the code, Polish plural stems", () => {
    const [card] = cards([ROW], "pl", undefined);
    expect(card?.receive.join("").replaceAll(" ", " ")).toBe(
      "Otrzymujesz 100,00 zł",
    );
    expect(card?.receive[1].replaceAll(" ", " ")).toBe("100,00 zł");
    expect(card?.code).toBe("Kod FO-BQ-001");
    expect(card?.sizeLine).toBe("15 łodyg");
    const [two] = cards([{ ...ROW, stems: 2 }], "pl", undefined);
    expect(two?.sizeLine).toBe("2 łodygi");
  });

  it("a size label that is not the stem count gets the stems beside it", () => {
    const [card] = cards(
      [{ ...ROW, sizeKey: "m", sizeLabelKey: "catalog.tier.size.m", stems: 1 }],
      "en",
      undefined,
    );
    expect(card?.sizeLine).toBe("Medium · 1 stem");
  });

  it("de: Sie erhalten with the amount in German format", () => {
    const [card] = cards([{ ...ROW, payoutMinor: 12_600n }], "de", undefined);
    expect(card?.receive.join("").replaceAll(" ", " ")).toBe(
      "Sie erhalten 126,00 PLN",
    );
  });
});

describe("T-55 (link): Ask for a change", () => {
  const EMAIL = "support@flowersoverseas.com";

  it("href is exactly mailto:{email}?subject= plus the encoded subject, no amount, no name", () => {
    const [card] = cards([ROW], "pl", EMAIL);
    const subject = encodeURIComponent(
      "Change request: FO-BQ-001, size stems_15",
    );
    expect(card?.changeHref).toBe(`mailto:${EMAIL}?subject=${subject}`);
    expect(card?.changeHref).toBe(
      changeHref(EMAIL, "Change request: FO-BQ-001, size stems_15"),
    );
    const decoded = decodeURIComponent(card?.changeHref ?? "");
    expect(decoded).not.toContain("100");
    expect(decoded).not.toContain("Amber Hour");
    const html = page([ROW], { supportEmail: EMAIL });
    expect(html).toContain(`href="mailto:${EMAIL}?subject=${subject}"`);
    expect(html).not.toContain("data-fo-bouquet-support");
  });

  it("with supportEmail unset: no mailto link renders and the support line does", () => {
    const [card] = cards([ROW], "en", undefined);
    expect(card?.changeHref).toBeNull();
    const html = page([ROW]);
    expect(html).not.toContain("mailto:");
    expect(html).toContain(
      "To ask for a change, contact us: +1 (213) 592-5150",
    );
  });

  it("the page body has no form and nothing that posts; the empty state prints its line", () => {
    for (const html of [
      page([ROW]),
      page([ROW], { supportEmail: EMAIL }),
      page([]),
    ]) {
      expect(html).not.toMatch(/<form|method="post"|formaction|<button/iu);
      expect(html).not.toContain("<script");
    }
    expect(page([])).toContain(
      "No bouquets yet. We add them here once we have agreed them with you.",
    );
    expect(page([])).not.toContain("data-fo-bouquet-support");
  });
});

describe("T-56: keys, voice and the sections navigation", () => {
  const KEYS = [
    "title",
    "intro",
    "youReceive",
    "sku",
    "stems",
    "state.onSale",
    "state.notYet",
    "state.paused",
    "state.withdrawn",
    "askChange",
    "changeSubject",
    "supportLine",
    "empty",
    "navLabel",
  ];

  function flat(tree: unknown, prefix = ""): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(
      tree as Record<string, unknown>,
    )) {
      const path = prefix === "" ? key : `${prefix}.${key}`;
      if (typeof value === "string") out[path] = value;
      else Object.assign(out, flat(value, path));
    }
    return out;
  }

  it.each(LANGUAGES)(
    "%s: every key, reviewed false, no banned word, no em or en dash",
    (locale) => {
      const messages = flat(
        JSON.parse(
          readFileSync(join(ROOT, "messages", `${locale}.json`), "utf8"),
        ),
      );
      const meta = JSON.parse(
        readFileSync(join(ROOT, "messages", `${locale}.meta.json`), "utf8"),
      ) as Record<string, { reviewed: boolean }>;
      const own = Object.keys(messages).filter((key) =>
        key.startsWith("floristInbox.bouquets."),
      );
      expect(own.sort()).toEqual(
        KEYS.map((key) => `floristInbox.bouquets.${key}`).sort(),
      );
      for (const key of own) {
        const value = messages[key] ?? "";
        expect(meta[key]?.reviewed, key).toBe(false);
        expect(bannedVoiceWordsIn(value), key).toEqual([]);
        expect(value, key).not.toMatch(/[–—]/u);
      }
    },
  );

  it("en is Appendix A verbatim", () => {
    const t = floristTranslator("en");
    expect(t("floristInbox.bouquets.title")).toBe("My bouquets");
    expect(t("floristInbox.bouquets.intro")).toBe(
      "These are the bouquets you make for us and the amount you receive for each size.",
    );
    expect(t("floristInbox.bouquets.state.withdrawn")).toBe("No longer sold");
  });

  const CONTEXT: FloristContext = {
    userId: "0b1c2e0a-3b7d-4c55-9a1e-2d8f0b7c4e91",
    locale: "en",
    memberships: [
      {
        partnerId: "1b1c2e0a-3b7d-4c55-9a1e-2d8f0b7c4e91",
        role: "owner",
        partnerStatus: "active",
        displayName: "Kwiaty",
      },
    ],
  };

  function frame(section: "orders" | "bouquets"): string {
    return renderToStaticMarkup(
      <SignedInFrame
        t={floristTranslator("en")}
        context={CONTEXT}
        back={FLORIST_PATHS.base}
        section={section}
      >
        <main />
      </SignedInFrame>,
    );
  }

  it.each(["orders", "bouquets"] as const)(
    "the %s page's header links Orders and My bouquets, the page itself current",
    (section) => {
      const html = frame(section);
      const current =
        section === "orders" ? FLORIST_PATHS.base : FLORIST_PATHS.bouquets;
      const other =
        section === "orders" ? FLORIST_PATHS.bouquets : FLORIST_PATHS.base;
      expect(html).toContain(">My bouquets</a>");
      expect(html).toContain(">Orders</a>");
      expect(html).toMatch(
        new RegExp(`href="${current}" aria-current="page"`, "u"),
      );
      expect(html).not.toMatch(new RegExp(`href="${other}" aria-current`, "u"));
      expect(html).toContain('aria-label="Sections"');
    },
  );
});

describe("AC-58 (florist half): the florist route tree", () => {
  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
  }

  it("imports neither modules/admin nor modules/partners/contracts", () => {
    const files = walk(join(ROOT, "src", "app", "vendor"));
    expect(
      files.some((file) => file.endsWith(join("bouquets", "page.tsx"))),
    ).toBe(true);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/modules\/admin(?:["'/])/u);
      expect(source, file).not.toMatch(/modules\/partners\/contracts/u);
    }
  });
});
