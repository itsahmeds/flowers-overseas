/**
 * T-23 / AC-23 and AC-18's draft half (spec 041 §2 "Untranslated draft", §6 "hreflang", §7
 * "Translation review and noindex", "RTL"; TASK-184): the `de` and `pl` drafts of all ten pages.
 *
 * Each draft is a committed file that says what it is (`source: machine`, `reviewed: false`),
 * renders `infoPages.status.untranslated` under its `<h1>` in its own language, is
 * `noindex,follow`, sits in no sitemap and in no hreflang cluster, and keeps the legal family's
 * second key (`lawyerReviewed: false`). The English files and a pseudo-locale (which reads the
 * English file) never carry the line. Each AC-carrying case names the mutation that turns it red.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type Company,
  COMPANY,
  CompanySchema,
} from "../../src/config/company.ts";
import {
  INFO_PAGE_IDS,
  type InfoPageId,
  infoPage,
} from "../../src/config/info-pages.ts";
import {
  type InfoSourceFile,
  InfoPage,
  LegalDocumentPage,
  fixtureInfoContentProvider,
  infoPageAlternatePaths,
  infoPageHeadView,
  infoPageHreflangPaths,
  infoPageView,
  isUntranslatedDraft,
  legalDocumentView,
  parseInfoFile,
} from "../../src/modules/content/index.ts";
import { INFO_CONTENT_FILES } from "../../src/modules/content/corpus.generated.ts";
import { loadMessages } from "../../src/modules/i18n/index.ts";
import {
  type DeploymentDescriptor,
  NOINDEX_FOLLOW,
  infoPageMetadata,
  pageIndexability,
} from "../../src/modules/seo/index.ts";
import { staticSitemapEntries } from "../../src/modules/seo/sitemap/statics.ts";

const DRAFT_LOCALES = ["de", "pl"] as const;
const INDEXING: DeploymentDescriptor = {
  environment: "production",
  siteUrl: "https://flowersoverseas.com",
};

/**
 * A complete trader identity (the facts of spec 041 §14 A-founder-2026-10-23; main's schema still
 * asks for a VAT ID when `registered` is true, so it carries the fixture value
 * `tests/unit/legal-pages.test.tsx` uses): imprint, terms and privacy exist (AC-2).
 */
const WITH_MAILBOX: { readonly company: Company } = {
  company: CompanySchema.parse({
    ...COMPANY,
    registered: true,
    legalName: "Flowers Overseas LLC",
    registryName: "Wyoming Secretary of State",
    registrationNumber: "2026-002113883",
    vatId: "PL1234567890",
    address: {
      lines: ["30 N Gould St Ste R"],
      postalCode: "82801",
      city: "Sheridan",
      countryIso2: "US",
    },
    supportEmail: "help@example.com",
  }),
};

/** The `en` value each draft translates, and the line each draft must render. */
const UNTRANSLATED: Readonly<Record<string, string>> = {
  de: "Diese Übersetzung wurde noch nicht geprüft. Wenn sie von der englischen Fassung abweicht, gilt die englische Fassung.",
  pl: "To tłumaczenie nie zostało jeszcze sprawdzone. Jeśli różni się od wersji angielskiej, obowiązuje wersja angielska.",
};

const NAMESPACES = [
  "a11y",
  "common",
  "breadcrumb",
  "infoPages",
  "company",
  "destinations",
  "occasionHub",
  "consent",
] as const;

function render(node: ReactElement, locale: string): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={loadMessages(locale, [...NAMESPACES])}
      timeZone="UTC"
    >
      {node}
    </NextIntlClientProvider>,
  );
}

function committed(path: string): InfoSourceFile | undefined {
  return INFO_CONTENT_FILES.find((file) => file.path === path);
}

function dirOf(pageId: InfoPageId): "pages" | "legal" {
  return infoPage(pageId).family === "trust" ? "pages" : "legal";
}

/** The rendered HTML of one page in a locale, with the mailbox where the page needs it. */
function pageHtml(pageId: InfoPageId, locale: string): string {
  if (infoPage(pageId).family === "trust") {
    return render(<InfoPage pageId={pageId} locale={locale} />, locale);
  }
  const view = legalDocumentView(pageId, locale, WITH_MAILBOX);
  if (view === undefined) throw new Error(`${pageId} ${locale}: no view`);
  return render(<LegalDocumentPage view={view} />, locale);
}

/** The text of the first element carrying `attribute`, or `undefined`. */
function noteText(html: string, attribute: string): string | undefined {
  const at = html.indexOf(attribute);
  if (at === -1) return undefined;
  const open = html.indexOf(">", at);
  const close = html.indexOf("</p>", open);
  return html.slice(open + 1, close);
}

describe("T-23 / AC-23: a draft file for each of the ten pages, in de and pl", () => {
  for (const locale of DRAFT_LOCALES) {
    for (const pageId of INFO_PAGE_IDS) {
      it(`${locale}/${pageId} is committed as a machine draft nobody has checked`, () => {
        const path = `${dirOf(pageId)}/${locale}/${pageId}.md`;
        const file = committed(path);
        expect(file, path).toBeDefined();
        const parsed = parseInfoFile(path, file?.source ?? "");
        expect(parsed.ok, path).toBe(true);
        if (!parsed.ok || parsed.file.kind === "extends") {
          throw new Error(`${path} must be its own file, not an extends`);
        }
        expect(parsed.file.content.source).toBe("machine");
        expect(parsed.file.content.reviewed).toBe(false);
        expect(parsed.file.content.reviewedBy).toBeUndefined();
        expect(parsed.file.content.reviewedAt).toBeUndefined();
        if (parsed.file.kind === "legal") {
          // A legal draft needs the lawyer on its own wording too (§7).
          expect(parsed.file.content.lawyerReviewed).toBe(false);
          const en = parseInfoFile(
            `legal/en/${pageId}.md`,
            committed(`legal/en/${pageId}.md`)?.source ?? "",
          );
          if (!en.ok || en.file.kind !== "legal") {
            throw new Error(`legal/en/${pageId}.md must parse`);
          }
          // The draft translates the en document: same version, state and regime.
          expect(parsed.file.content.version).toBe(en.file.content.version);
          expect(parsed.file.content.inForce).toBe(en.file.content.inForce);
          expect(parsed.file.content.regime).toBe("eu");
        }
      });
    }
  }

  it("no de or pl draft is marked reviewed or human anywhere in the corpus", () => {
    const drafts = INFO_CONTENT_FILES.filter((file) =>
      /^(?:pages|legal)\/(?:de|pl)\//u.test(file.path),
    );
    expect(drafts).toHaveLength(20);
    for (const file of drafts) {
      expect(file.source, file.path).toMatch(/^source: machine$/mu);
      expect(file.source, file.path).toMatch(/^reviewed: false$/mu);
      expect(file.source, file.path).not.toMatch(/^reviewedBy:/mu);
    }
  });
});

describe("T-23 / AC-23: each draft renders the untranslated line under its h1", () => {
  for (const locale of DRAFT_LOCALES) {
    for (const pageId of INFO_PAGE_IDS) {
      it(`${locale}/${pageId} renders infoPages.status.untranslated in ${locale}`, () => {
        const html = pageHtml(pageId, locale);
        // The one value, in the draft's own language (mutation: dropping the line, or rendering
        // the en catalogue's value, turns this red).
        expect(noteText(html, "data-fo-untranslated")).toBe(
          UNTRANSLATED[locale],
        );
        const h1 = html.indexOf("<h1");
        const line = html.indexOf("data-fo-untranslated");
        expect(h1).toBeGreaterThan(-1);
        expect(line).toBeGreaterThan(h1);
        if (infoPage(pageId).family === "trust") {
          // After the not-open line while it applies (design round 2, the States rows).
          const notOpen = html.indexOf("data-fo-not-yet-open");
          expect(notOpen).toBeGreaterThan(h1);
          expect(line).toBeGreaterThan(notOpen);
        } else if (pageId !== "imprint") {
          // After the draft line, inside the document's header.
          const draft = html.indexOf("data-fo-legal-draft-line");
          expect(draft).toBeGreaterThan(h1);
          expect(line).toBeGreaterThan(draft);
          expect(line).toBeLessThan(html.indexOf("</header>", h1));
        }
      });
    }
  }

  it("no en or en-gb page renders the line, unreviewed as they are", () => {
    for (const locale of ["en", "en-gb"]) {
      for (const pageId of INFO_PAGE_IDS) {
        expect(pageHtml(pageId, locale), `${locale}/${pageId}`).not.toContain(
          "data-fo-untranslated",
        );
      }
    }
  });

  it("the rule is the file's language and its review flag, nothing else", () => {
    expect(isUntranslatedDraft("de", false)).toBe(true);
    expect(isUntranslatedDraft("pl", false)).toBe(true);
    expect(isUntranslatedDraft("de", true)).toBe(false);
    expect(isUntranslatedDraft("en", false)).toBe(false);
    expect(isUntranslatedDraft("en-gb", false)).toBe(false);
  });

  it("a reviewed de file drops the line (fixture), and only that file", () => {
    const provider = fixtureInfoContentProvider(
      INFO_CONTENT_FILES.map((file) =>
        file.path === "pages/de/help.md"
          ? {
              ...file,
              source: file.source
                .replace("source: machine", "source: human")
                .replace(
                  "reviewed: false",
                  'reviewed: true\nreviewedBy: "native reviewer (fixture)"\nreviewedAt: "2026-10-25"',
                ),
            }
          : file,
      ),
    );
    expect(infoPageView("help", "de", { provider })?.untranslated).toBe(false);
    expect(infoPageView("guarantee", "de", { provider })?.untranslated).toBe(
      true,
    );
    expect(infoPageView("help", "pl", { provider })?.untranslated).toBe(true);
  });
});

describe("T-23 / AC-23, AC-17: every draft is noindex,follow", () => {
  for (const locale of DRAFT_LOCALES) {
    for (const pageId of INFO_PAGE_IDS) {
      it(`${locale}/${pageId} is noindex,follow in the indexing environment`, () => {
        const head = infoPageHeadView(pageId, locale, WITH_MAILBOX);
        expect(head, `${locale}/${pageId}`).toBeDefined();
        // The file's own term is false, so even an indexable locale would not lift it.
        expect(head?.reviewed).toBe(false);
        expect(
          pageIndexability(
            {
              pageType: pageId,
              locale,
              exists: true,
              reviewed: head?.reviewed ?? true,
            },
            INDEXING,
          ).directive,
        ).toBe("noindex,follow");
        const metadata = infoPageMetadata(pageId, locale, INDEXING);
        if (infoPage(pageId).requiresRegistration) {
          // No page at all on the committed config (no complete trader identity): AC-2.
          expect(metadata).toBeUndefined();
        } else {
          expect(metadata?.robots).toEqual(NOINDEX_FOLLOW);
          expect(metadata?.alternates?.canonical).toBe(
            `${INDEXING.siteUrl}${infoPageView(pageId, locale)?.path ?? legalDocumentView(pageId, locale)?.path ?? "?"}`,
          );
        }
      });
    }
  }
});

describe("T-23 / AC-23, AC-20: no draft is in any sitemap", () => {
  it("static.xml in every launch locale lists no de or pl info page", () => {
    const paths = new Set(
      INFO_PAGE_IDS.flatMap((pageId) =>
        DRAFT_LOCALES.flatMap((locale) => {
          const view =
            infoPageView(pageId, locale) ?? legalDocumentView(pageId, locale);
          return view === undefined ? [] : [view.path];
        }),
      ),
    );
    // The control: the drafts that exist on the committed config are found at all.
    expect(paths.size).toBe(14);
    for (const locale of ["en", "en-gb", "de", "pl"]) {
      for (const row of staticSitemapEntries(locale, INDEXING)) {
        const path = new URL(row.loc).pathname;
        expect(paths.has(path), row.loc).toBe(false);
        for (const alternate of row.alternates) {
          expect(paths.has(new URL(alternate.href).pathname)).toBe(false);
        }
      }
    }
  });
});

describe("AC-18: no de/pl draft is in an hreflang cluster while it is unreviewed", () => {
  it("the language links offer the drafts; the hreflang source drops them", () => {
    for (const pageId of ["help", "guarantee", "cookies"] as const) {
      const offered = infoPageAlternatePaths(pageId);
      expect(Object.keys(offered).sort()).toEqual(
        ["de", "en", "en-gb", "pl"].sort(),
      );
      // Mutation: returning `infoPageAlternatePaths()` here turns this red.
      expect(Object.keys(infoPageHreflangPaths(pageId)).sort()).toEqual([
        "en",
        "en-gb",
      ]);
    }
  });

  it("the en page's cluster names no de or pl URL, and a draft emits no cluster", () => {
    const languages = infoPageMetadata("help", "en", INDEXING)?.alternates
      ?.languages as Readonly<Record<string, string>> | undefined;
    expect(Object.keys(languages ?? {})).not.toContain("de");
    expect(Object.keys(languages ?? {})).not.toContain("pl");
    for (const locale of DRAFT_LOCALES) {
      expect(
        infoPageMetadata("help", locale, INDEXING)?.alternates?.languages,
        locale,
      ).toBeUndefined();
    }
  });

  it("a de file that a native reviewer has checked joins the hreflang source (fixture)", () => {
    const provider = fixtureInfoContentProvider(
      INFO_CONTENT_FILES.map((file) =>
        file.path === "pages/de/help.md"
          ? {
              ...file,
              source: file.source.replace(
                "reviewed: false",
                'reviewed: true\nreviewedBy: "native reviewer (fixture)"\nreviewedAt: "2026-10-25"',
              ),
            }
          : file,
      ),
    );
    expect(
      Object.keys(infoPageHreflangPaths("help", { provider })).sort(),
    ).toEqual(["de", "en", "en-gb"]);
  });
});

describe("the de/pl message drafts of the infoPages keys (spec 003 §14 A15 clause 2)", () => {
  const sha = (value: string) =>
    createHash("sha256").update(value).digest("hex");
  const flat = (tree: unknown, prefix = ""): Record<string, string> =>
    Object.entries(tree as Record<string, unknown>).reduce<
      Record<string, string>
    >((out, [key, value]) => {
      const at = prefix === "" ? key : `${prefix}.${key}`;
      if (typeof value === "string") out[at] = value;
      else Object.assign(out, flat(value, at));
      return out;
    }, {});
  const read = (name: string): unknown =>
    JSON.parse(
      readFileSync(new URL(`../../messages/${name}`, import.meta.url), "utf8"),
    );
  const en = flat(read("en.json"));
  const DRAFTED = [
    "infoPages.status.untranslated",
    "infoPages.status.notYetOpen",
    "infoPages.contact.heading",
    "infoPages.contact.body",
    "infoPages.contact.privacy",
    "infoPages.contact.phone",
    "infoPages.cookies.change",
  ];

  for (const locale of DRAFT_LOCALES) {
    it(`${locale}: each drafted key is a machine draft of the current en value`, () => {
      const values = flat(read(`${locale}.json`));
      const meta = read(`${locale}.meta.json`) as Record<string, unknown>;
      for (const key of DRAFTED) {
        expect(values[key], key).not.toBe(en[key]);
        expect(meta[key], key).toEqual({
          source: "machine",
          reviewed: false,
          sourceHash: sha(en[key] ?? ""),
        });
      }
      expect(values["infoPages.status.untranslated"]).toBe(
        UNTRANSLATED[locale],
      );
    });
  }

  it("en carries the untranslated line's source, unreviewed and attributed to nobody", () => {
    const meta = read("en.meta.json") as Record<
      string,
      Record<string, unknown>
    >;
    expect(en["infoPages.status.untranslated"]).toBe(
      "This translation has not been checked yet. If it differs from the English version, the English version applies.",
    );
    expect(meta["infoPages.status.untranslated"]).toEqual({
      source: "human",
      reviewed: false,
      sourceHash: sha(en["infoPages.status.untranslated"] ?? ""),
    });
  });
});

describe("§7 RTL: a pseudo-locale reads the English file, so /ar-XB/help exists", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("serves help under ar-XB with the en content and no untranslated line", async () => {
    vi.stubEnv("ENABLE_PSEUDO_LOCALES", "true");
    vi.resetModules();
    const content = await import("../../src/modules/content/index.ts");
    const view = content.infoPageView("help", "ar-XB");
    // Mutation: reading the file under the prefix itself (no fallback) leaves this undefined.
    expect(view?.h1).toBe(content.infoPageView("help", "en")?.h1);
    expect(view?.path).toBe("/ar-XB/help");
    expect(view?.untranslated).toBe(false);
    // Never announced: a pseudo-locale is in no language offer and no hreflang source.
    expect(Object.keys(content.infoPageAlternatePaths("help"))).not.toContain(
      "ar-XB",
    );
  });
});
