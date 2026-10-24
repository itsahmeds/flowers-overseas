/**
 * Spec 041 task 1 (TASK-182): the content module, its existence predicate and its view model.
 *
 * T-02 (AC-2), T-03 (AC-3), T-04 (registry half), T-06 (AC-6), T-07 (AC-7), T-11 (unit half,
 * AC-11), T-12 (AC-12, the parts this task owns), T-14 (AC-14), T-16 (AC-16), T-17 (AC-17),
 * T-21 (AC-21, the footer half), T-32 (AC-30, unit), T-33 (AC-31, guarantee and help), T-34
 * (AC-32). Every case reads the committed content through the real parser and view model; the
 * fixtures are small overlays on the committed files.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { CompanySchema, COMPANY } from "../../src/config/company.ts";
import {
  SEVEN_DAY,
  guaranteeTextViolations,
  normaliseForScan,
} from "../../src/config/freshness-claim.ts";
import { relayMatches } from "../../src/config/honesty.ts";
import {
  INFO_PAGE_IDS,
  type InfoPageId,
  InfoPageRegistrySchema,
  INFO_PAGES,
  TRUST_PAGE_IDS,
} from "../../src/config/info-pages.ts";
import {
  LAUNCH_LOCALE_DATA,
  PATH_SEGMENT_KEYS,
} from "../../src/config/locales.data.ts";
import { PAYMENT_METHODS } from "../../src/config/payment-methods.ts";
import { SITE_LINKS } from "../../src/config/site-links.ts";
import {
  fixtureInfoContentProvider,
  infoPageExists,
  infoPageView,
  legalDocumentView,
  listInfoPages,
  missingInfoPageLinkIds,
  parseInfoFile,
  staticInfoContentProvider,
  type InfoSourceFile,
} from "../../src/modules/content/index.ts";
import {
  isLocaleIndexable,
  unreviewedShare,
} from "../../src/modules/i18n/index.ts";
import {
  NOINDEX_FOLLOW,
  INDEX_FOLLOW,
  PAGE_TYPE_POLICY,
  indexability,
} from "../../src/modules/seo/indexability.ts";
import { footerView } from "../../src/modules/ui/layout/footerView.ts";
import { pagesIndexSource } from "../../scripts/pages-index.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const FILES = staticInfoContentProvider.files();
const ENGLISH = ["en", "en-gb"] as const;

/** The committed files with one overlay applied: replace (string), or remove (undefined). */
function overlay(
  changes: Readonly<Record<string, string | undefined>>,
  extra: readonly InfoSourceFile[] = [],
): readonly InfoSourceFile[] {
  return [
    ...FILES.flatMap((file) => {
      if (!(file.path in changes)) return [file];
      const next = changes[file.path];
      return next === undefined ? [] : [{ path: file.path, source: next }];
    }),
    ...extra,
  ];
}

function source(path: string): string {
  const file = FILES.find((candidate) => candidate.path === path);
  if (file === undefined) throw new Error(`no committed file ${path}`);
  return file.source;
}

/** Every prose string a trust view renders, one block per string (so no sentence spans two). */
function proseOf(pageId: InfoPageId, locale: string): string {
  const legal = legalDocumentView(pageId, locale);
  if (legal !== undefined) {
    return [
      legal.seoTitle,
      legal.seoDescription,
      legal.h1,
      ...legal.sections.flatMap((section) => [
        section.heading,
        ...section.blocks.flatMap((block) =>
          block.kind === "paragraph"
            ? [block.spans.map((span) => span.text).join("")]
            : block.kind === "subheading"
              ? [block.text]
              : block.kind === "list"
                ? block.items.map((item) =>
                    item.map((span) => span.text).join(""),
                  )
                : [],
        ),
      ]),
      ...legal.changeLog.map((entry) => entry.summary),
      ...legal.links.map((link) => link.label),
    ].join("\n\n");
  }
  const view = infoPageView(pageId, locale);
  if (view === undefined) return "";
  return [
    view.seoTitle,
    view.seoDescription,
    view.h1,
    view.intro ?? "",
    ...view.sections.flatMap((section) => [
      section.heading,
      ...section.paragraphs,
      ...section.items.map((item) => `${item.title} ${item.text}`),
    ]),
    ...view.faq.flatMap((item) => [item.q, item.a]),
    ...view.links.map((link) => link.label),
  ].join("\n\n");
}

/** Every string under a nested message group, depth-first. */
function leafValues(tree: unknown): readonly string[] {
  if (typeof tree === "string") return [tree];
  if (typeof tree !== "object" || tree === null) return [];
  return Object.values(tree).flatMap((value) => leafValues(value));
}

/** A minimal legal file, for the registration gate (the legal set itself is TASK-183's). */
const IMPRINT_FIXTURE: InfoSourceFile = {
  path: "legal/en/imprint.md",
  source: `---
seoTitle: "Imprint"
seoDescription: "Who runs this website."
h1: "Imprint"
version: "1.0.0"
effectiveFrom: "2026-11-01"
inForce: true
lawyerReviewed: false
regime: eu
changeLog:
  - version: "1.0.0"
    date: "2026-11-01"
    summary: "First version."
source: human
reviewed: false
updatedAt: "2026-11-01"
---
`,
};

const REGISTERED_COMPANY = CompanySchema.parse({
  ...COMPANY,
  registered: true,
  legalName: "Flowers Overseas OÜ",
  registryName: "Estonian Business Register",
  registrationNumber: "12345678",
  vatId: "EE123456789",
  address: {
    lines: ["Example street 1"],
    postalCode: "10111",
    city: "Tallinn",
    countryIso2: "EE",
  },
  supportEmail: "help@example.com",
});

describe("the generated index (spec 041 §2; pages:index)", () => {
  it("equals a fresh projection of content/pages and content/legal", () => {
    const committed = readFileSync(
      resolve(ROOT, "src/modules/content/corpus.generated.ts"),
      "utf8",
    );
    expect(committed).toBe(pagesIndexSource(ROOT));
  });

  it("every committed file parses (T-03)", () => {
    for (const file of FILES) {
      const result = parseInfoFile(file.path, file.source);
      expect(result.ok, file.path).toBe(true);
    }
  });
});

describe("T-02 / AC-2: infoPageExists is the one existence predicate", () => {
  it("the five trust pages exist in en and en-gb, and in no other locale yet", () => {
    for (const pageId of TRUST_PAGE_IDS) {
      for (const locale of ENGLISH) {
        expect(infoPageExists(pageId, locale), `${pageId} ${locale}`).toBe(
          true,
        );
      }
      expect(infoPageExists(pageId, "de")).toBe(false);
      expect(infoPageExists(pageId, "pl")).toBe(false);
    }
  });

  it("deleting about.md removes the page, its listing, its link from how it works", () => {
    const provider = fixtureInfoContentProvider(
      overlay({
        "pages/en/about.md": undefined,
        "pages/en-gb/about.md": undefined,
      }),
    );
    expect(infoPageExists("about", "en", { provider })).toBe(false);
    expect(
      listInfoPages({ provider }).some((page) => page.pageId === "about"),
    ).toBe(false);
    const links = infoPageView("how-it-works", "en", { provider })?.links ?? [];
    expect(links.map((link) => link.to)).not.toContain("about");
    // The control: with the file, the link is there.
    expect(
      (infoPageView("how-it-works", "en")?.links ?? []).map((link) => link.to),
    ).toContain("about");
  });

  it("deleting help.md drops the footer's help link in that locale only", () => {
    const provider = fixtureInfoContentProvider(
      overlay({ "pages/en-gb/help.md": undefined }),
    );
    const missing = missingInfoPageLinkIds("en-gb", { provider });
    expect(missing).toContain("help-and-contact");
    expect(missingInfoPageLinkIds("en", { provider })).not.toContain(
      "help-and-contact",
    );
  });

  it("imprint, terms and privacy do not exist while unregistered, though a file exists", () => {
    const provider = fixtureInfoContentProvider(overlay({}, [IMPRINT_FIXTURE]));
    for (const locale of ["en", "en-gb", "de", "pl"]) {
      for (const pageId of ["imprint", "terms", "privacy"] as const) {
        expect(
          infoPageExists(pageId, locale, { provider, registered: false }),
        ).toBe(false);
      }
    }
    expect(
      infoPageExists("imprint", "en", { provider, registered: true }),
    ).toBe(true);
    // Nothing else differs with the flip.
    for (const pageId of TRUST_PAGE_IDS) {
      expect(infoPageExists(pageId, "en", { provider, registered: true })).toBe(
        infoPageExists(pageId, "en", { provider, registered: false }),
      );
    }
  });
});

describe("T-02 / AC-2: a content file in a locale that is not routable does not exist", () => {
  // `/break 270` hole 9. A file under a code the router does not serve (`fr`, not a launch or
  // pseudo locale) never makes the page exist, so neither the footer, an in-body link nor the
  // sitemap can point at a URL that answers 404. `de` and `pl`, launch locales hidden from the
  // menus, keep their routes (ADR-0006; spec 003 §14 A-founder-2026-10-14c), so a file there
  // would make the page exist, served `noindex` while the locale is hidden.
  const help = staticInfoContentProvider
    .files()
    .find((file) => file.path === "pages/en/help.md");
  const provider = fixtureInfoContentProvider([
    ...staticInfoContentProvider.files(),
    { path: "pages/fr/help.md", source: help?.source ?? "" },
  ]);

  it("refuses fr even with a parsed fr/help.md in the corpus, and still finds en", () => {
    expect(help).toBeDefined();
    expect(infoPageExists("help", "fr", { provider })).toBe(false);
    expect(infoPageExists("help", "en", { provider })).toBe(true);
  });
});

describe("T-03 / AC-3: malformed files fail, naming file and field", () => {
  const help = source("pages/en/help.md");
  const cases: readonly {
    what: string;
    path: string;
    text: string;
    field: string;
  }[] = [
    {
      what: "a missing h1",
      path: "pages/en/help.md",
      text: help.replace(/^h1: .*\n/mu, ""),
      field: "h1",
    },
    {
      what: "a seoTitle of 61 characters",
      path: "pages/en/help.md",
      text: help.replace(/^seoTitle: .*$/mu, `seoTitle: "${"x".repeat(61)}"`),
      field: "seoTitle",
    },
    {
      what: "a legal file in force with no effectiveFrom",
      path: "legal/en/imprint.md",
      text: IMPRINT_FIXTURE.source.replace(
        /^effectiveFrom: .*$/mu,
        "effectiveFrom: null",
      ),
      field: "effectiveFrom",
    },
    {
      what: "an en-gb terms file that extends",
      path: "legal/en-gb/terms.md",
      text: "---\nextends: en\n---\n",
      field: "extends",
    },
  ];
  it.each(cases)("$what", ({ path, text, field }) => {
    const result = parseInfoFile(path, text);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.field)).toContain(field);
    expect(result.issues[0]?.file).toBe(`content/${path}`);
  });
});

describe("T-04 / AC-4: segment keys and leaf slugs", () => {
  it("has the six new segment keys with a value in every locale", () => {
    for (const key of [
      "howItWorks",
      "guarantee",
      "help",
      "about",
      "delivery",
      "imprint",
    ] as const) {
      expect(PATH_SEGMENT_KEYS).toContain(key);
      for (const locale of LAUNCH_LOCALE_DATA) {
        expect(locale.pathSegments[key], `${locale.code} ${key}`).toMatch(
          /^[a-z0-9]+(?:-[a-z0-9]+)*$/u,
        );
      }
    }
  });

  it.each([
    ["uppercase", "Terms"],
    ["non-ASCII", "płatność"],
  ])("refuses a %s leaf slug", (_what, slug) => {
    const rows = INFO_PAGES.map((entry) =>
      entry.id === "terms"
        ? { ...entry, leafSlugs: { ...entry.leafSlugs, en: slug } }
        : entry,
    );
    expect(InfoPageRegistrySchema.safeParse(rows).success).toBe(false);
  });

  it("refuses a leaf slug duplicated within a locale", () => {
    const rows = INFO_PAGES.map((entry) =>
      entry.id === "terms"
        ? { ...entry, leafSlugs: { ...entry.leafSlugs, en: "privacy" } }
        : entry,
    );
    expect(InfoPageRegistrySchema.safeParse(rows).success).toBe(false);
    expect(InfoPageRegistrySchema.safeParse(INFO_PAGES).success).toBe(true);
  });
});

describe("T-06 / AC-6: the not-open line comes from data", () => {
  it.each(TRUST_PAGE_IDS)(
    "%s: present while no date is open, absent once one is",
    (pageId) => {
      for (const locale of ENGLISH) {
        expect(infoPageView(pageId, locale)?.notYetOpen).toBe(true);
        expect(
          infoPageView(pageId, locale, { datesOpen: false })?.notYetOpen,
        ).toBe(true);
        expect(
          infoPageView(pageId, locale, { datesOpen: true })?.notYetOpen,
        ).toBe(false);
      }
    },
  );
});

describe("T-07 / AC-7: the copy share and the 400-character cap", () => {
  const en = JSON.parse(
    readFileSync(resolve(ROOT, "messages/en.json"), "utf8"),
  ) as {
    infoPages: Record<string, unknown>;
  };
  const meta = JSON.parse(
    readFileSync(resolve(ROOT, "messages/en.meta.json"), "utf8"),
  ) as Record<string, { reviewed: boolean; reviewedBy?: string }>;

  it("keeps en and en-gb indexable (under spec 003's 5 %)", () => {
    expect(isLocaleIndexable("en")).toBe(true);
    expect(unreviewedShare("en-gb")).toBeLessThanOrEqual(0.05);
  });

  it("no infoPages.* value exceeds 400 characters", () => {
    const values = leafValues(en.infoPages);
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) expect(value.length).toBeLessThanOrEqual(400);
  });

  it("no agent marked a new key reviewed", () => {
    for (const [key, record] of Object.entries(meta)) {
      if (
        !key.startsWith("infoPages.") &&
        key !== "footer.link.deliveryAndPayment"
      )
        continue;
      expect(record.reviewed, key).toBe(false);
    }
  });
});

describe("T-11 / AC-11: the company block and company.ts's refinements", () => {
  it("about renders notRegistered, no name and no address field while unregistered", () => {
    const view = infoPageView("about", "en", { registered: false });
    expect(view?.company).toEqual({ registered: false });
    // "Who runs it" names the company once it is registered and is not drawn before (spec 041
    // §14 A-founder-2026-10-23 clause 3): no token, no empty name, and never a person.
    expect(
      view?.sections.find((section) => section.id === "who-runs-it"),
    ).toBeUndefined();
    expect(JSON.stringify(view)).not.toMatch(
      /address|registrationNumber|vatId|legalName|\{legalName\}|Hameed|Sheikh/u,
    );
  });

  it("about names the company, never a person, once it is registered (TASK-183)", () => {
    const view = infoPageView("about", "en", {
      company: REGISTERED_COMPANY,
    });
    const whoRunsIt = view?.sections.find(
      (section) => section.id === "who-runs-it",
    );
    expect(whoRunsIt?.paragraphs).toEqual([
      "Flowers Overseas is run by Flowers Overseas OÜ.",
    ]);
    expect(JSON.stringify(view)).not.toMatch(/Hameed|Sheikh|representative/u);
  });

  it("company.ts carries no person's name, and refuses registered without supportEmail and an operatorAddress", () => {
    // The founder, 2026-10-23: "dont add the name on our site bro" (spec 041 §14
    // A-founder-2026-10-23 clause 4). The committed identity carries no representative at all.
    expect(COMPANY.representative).toBeUndefined();
    expect(
      readFileSync(resolve(ROOT, "src/config/company.ts"), "utf8"),
    ).not.toMatch(/Hameed|Sheikh/u);
    const noEmail: Record<string, unknown> = { ...REGISTERED_COMPANY };
    delete noEmail["supportEmail"];
    expect(CompanySchema.safeParse(noEmail).success).toBe(false);
    expect(
      CompanySchema.safeParse({ ...COMPANY, operatorAddress: "Somewhere 1" })
        .success,
    ).toBe(false);
    // The control: the committed identity and the registered fixture both parse.
    expect(CompanySchema.safeParse(COMPANY).success).toBe(true);
    expect(CompanySchema.safeParse(REGISTERED_COMPANY).success).toBe(true);
  });
});

describe("T-12 / AC-12, AC-34: the help page's contact block", () => {
  it("reads company.ts: changing phoneDisplay changes the help view and the footer", () => {
    const company = CompanySchema.parse({
      ...COMPANY,
      contact: { ...COMPANY.contact, phoneDisplay: "+1 (555) 000-0000" },
    });
    expect(infoPageView("help", "en", { company })?.contact?.phoneDisplay).toBe(
      "+1 (555) 000-0000",
    );
    expect(footerView("en", { company }).company.contact.phoneDisplay).toBe(
      "+1 (555) 000-0000",
    );
  });

  it("WhatsApp is exactly https://wa.me/ + phoneE164 without +, no query; never tel:", () => {
    const contact = infoPageView("help", "en-gb")?.contact;
    expect(contact?.whatsappHref).toBe("https://wa.me/12135925150");
    expect(contact?.whatsappHref).not.toMatch(/^tel:|\?/u);
  });

  it("no email anywhere while supportEmail is absent; present once added", () => {
    const view = infoPageView("help", "en");
    expect(view?.contact?.supportEmail).toBeUndefined();
    expect(JSON.stringify(view?.contact)).not.toMatch(/@|mailto:/u);
    const company = CompanySchema.parse({
      ...COMPANY,
      supportEmail: "help@example.com",
    });
    expect(infoPageView("help", "en", { company })?.contact?.supportEmail).toBe(
      "help@example.com",
    );
  });

  it("links the privacy line only where the privacy notice exists", () => {
    expect(infoPageView("help", "en")?.contact?.privacyHref).toBeUndefined();
  });
});

describe("T-14 / AC-14: delivery and payment", () => {
  const names: Record<string, string> = {};
  const en = JSON.parse(
    readFileSync(resolve(ROOT, "messages/en.json"), "utf8"),
  ) as Record<string, unknown>;
  const nameOf = (key: string): string => {
    const value = key
      .split(".")
      .reduce<unknown>(
        (node, part) => (node as Record<string, unknown>)[part],
        en,
      );
    names[key] = String(value);
    return String(value);
  };

  it("lists the seven destinations, Poland not delivering yet, no time, no method", () => {
    const view = infoPageView("delivery", "en", { nameOf });
    expect(view?.destinations).toHaveLength(7);
    const poland = view?.destinations?.find((row) => row.iso2 === "PL");
    expect(poland?.stateKey).toBe("destinations.state.guideNotDelivering");
    expect(view?.paymentMethods).toEqual([]);
    // Each row links only where the guide page exists.
    for (const row of view?.destinations ?? []) {
      if (row.href !== undefined)
        expect(row.href).toMatch(/^\/en\/send-flowers-to\//u);
    }
  });

  it("a one-method fixture lists exactly that one", () => {
    const [first, ...rest] = PAYMENT_METHODS;
    if (first === undefined) throw new Error("no payment method rows");
    const methods = [
      { ...first, available: true, processor: "stripe" as const },
      ...rest,
    ];
    const view = infoPageView("delivery", "en", { paymentMethods: methods });
    expect(view?.paymentMethods?.map((method) => method.id)).toEqual([
      first.id,
    ]);
  });
});

describe("T-16 / AC-16: the fresh-flower promise, never a number of days", () => {
  it("the scan's own fixtures", () => {
    for (const ok of [
      "14-day right to cancel",
      "14 days to change your mind",
      "14 Tage",
      "14 dni",
      "fresh flowers are one of them",
      "we do not promise a number of days",
      "Fresh flowers are an exception to the usual 14-day right to cancel",
    ]) {
      expect(guaranteeTextViolations(ok), ok).toEqual([]);
    }
    for (const bad of [
      "fresh for 7 days",
      "7-day freshness",
      "7 Tage frisch",
      "świeże przez 7 dni",
      "lasts a week",
      "fresh for {days} days",
    ]) {
      expect(guaranteeTextViolations(bad), bad).not.toEqual([]);
    }
  });

  it("the guarantee states the promise and the legal-rights sentence; no day count", () => {
    for (const locale of ENGLISH) {
      const view = infoPageView("guarantee", locale);
      const text = JSON.stringify(view);
      expect(text).toContain(
        "If your flowers don't arrive fresh and in good condition, send us a photo within 72 hours of delivery and we'll replace them or refund you in full.",
      );
      expect(text).toContain(
        "This promise comes on top of your legal rights, not instead of them.",
      );
      expect(
        guaranteeTextViolations(
          view?.sections.flatMap((s) => s.paragraphs).join("\n\n") ?? "",
        ),
      ).toEqual([]);
      expect(normaliseForScan(text)).not.toMatch(SEVEN_DAY);
    }
  });

  it("the home and strip guarantee names carry no day count in any locale", () => {
    // `trust.guarantee.name` is TASK-172's change (PR 265, on main since 2026-10-19).
    for (const locale of ["en", "de", "pl"]) {
      const catalogue = JSON.parse(
        readFileSync(resolve(ROOT, `messages/${locale}.json`), "utf8"),
      ) as {
        nav: { utility: { guarantee: string } };
        home: { proof: { guarantee: { title: string } } };
        trust: { guarantee: { name: string } };
      };
      for (const value of [
        catalogue.nav.utility.guarantee,
        catalogue.home.proof.guarantee.title,
        catalogue.trust.guarantee.name,
      ]) {
        expect(normaliseForScan(value), `${locale}: ${value}`).not.toMatch(
          SEVEN_DAY,
        );
        expect(
          guaranteeTextViolations(`fresh ${value}`),
          `${locale}: ${value}`,
        ).toEqual([]);
      }
    }
    // The scan the case relies on is not vacuous: the retired name fails it.
    expect(normaliseForScan("7-day freshness guarantee")).toMatch(SEVEN_DAY);
  });

  it("restoring a day count to the guarantee turns the scan red (mutation)", () => {
    const mutated = source("pages/en/guarantee.md").replace(
      "so we do not promise a number of days.",
      "so we keep them fresh for 7 days.",
    );
    expect(guaranteeTextViolations(mutated)).not.toEqual([]);
    expect(guaranteeTextViolations(source("pages/en/guarantee.md"))).toEqual(
      [],
    );
  });
});

describe("T-17 / AC-17: the ten page types are byRule", () => {
  it("registers every page id as byRule", () => {
    for (const pageId of INFO_PAGE_IDS)
      expect(PAGE_TYPE_POLICY[pageId]).toBe("byRule");
  });

  it("indexable only when exists, reviewed, locale-indexable and indexing-environment all hold", () => {
    const all = {
      pageTypeIndexable: true,
      exists: true,
      reviewed: true,
      localeIndexable: true,
      indexingEnvironment: true,
    };
    expect(indexability(all)).toBe(INDEX_FOLLOW);
    for (const term of [
      "exists",
      "reviewed",
      "localeIndexable",
      "indexingEnvironment",
    ] as const) {
      expect(indexability({ ...all, [term]: false }), term).toBe(
        NOINDEX_FOLLOW,
      );
    }
    // AC-17's legal half ("a legal page additionally needs `lawyerReviewed`") is TASK-183's: no
    // legal view exists yet, so no case here can exercise it (carry-forward in TASK-183's brief).
  });

  it("every trust page is noindex in Phase 0 by data: its copy is not reviewed yet", () => {
    for (const pageId of TRUST_PAGE_IDS) {
      expect(infoPageView(pageId, "en")?.reviewed).toBe(false);
    }
  });
});

describe("T-21 / AC-21: the infoPage link kind and the footer", () => {
  const byId = new Map<string, (typeof SITE_LINKS)[number]>(
    SITE_LINKS.map((link) => [link.id, link]),
  );

  it("targets the pages, publishes the four trust links, relabels delivery-times", () => {
    const expected: Record<string, { page: string; published: boolean }> = {
      "how-it-works": { page: "how-it-works", published: true },
      guarantee: { page: "guarantee", published: true },
      "help-and-contact": { page: "help", published: true },
      "delivery-times": { page: "delivery", published: true },
      imprint: { page: "imprint", published: true },
      terms: { page: "terms", published: true },
      privacy: { page: "privacy", published: true },
      cookies: { page: "cookies", published: true },
      "withdrawal-and-refunds": { page: "cancellation", published: true },
    };
    for (const [id, want] of Object.entries(expected)) {
      const link = byId.get(id);
      expect(link?.target, id).toEqual({ kind: "infoPage", page: want.page });
      expect(link?.published, id).toBe(want.published);
    }
    expect(byId.get("delivery-times")?.labelKey).toBe(
      "footer.link.deliveryAndPayment",
    );
    expect(byId.get("delivery-times")?.requiresDeliveryDates).toBe(false);
  });

  it("the footer draws each trust page where it exists, and no imprint, terms or privacy", () => {
    for (const locale of ["en", "en-gb", "de", "pl"]) {
      const view = footerView(locale, {
        unavailable: missingInfoPageLinkIds(locale),
      });
      const hrefs = new Map(
        [...view.columns, view.legal]
          .flatMap((group) => group.links)
          .map((link) => [link.id, link.href]),
      );
      const english = locale === "en" || locale === "en-gb";
      expect(hrefs.get("help-and-contact"), locale).toBe(
        english ? `/${locale}/help` : undefined,
      );
      expect(hrefs.get("guarantee"), locale).toBe(
        english ? `/${locale}/guarantee` : undefined,
      );
      expect(hrefs.get("how-it-works"), locale).toBe(
        english ? `/${locale}/how-it-works` : undefined,
      );
      expect(hrefs.get("delivery-times"), locale).toBe(
        english ? `/${locale}/delivery` : undefined,
      );
      for (const id of ["imprint", "terms", "privacy"])
        expect(hrefs.get(id), `${locale} ${id}`).toBeUndefined();
    }
  });
});

describe("T-32 / AC-30: no relay language in the content or in infoPages.*", () => {
  it("relayMatches finds nothing in any content file or infoPages value", () => {
    for (const page of listInfoPages()) {
      expect(
        relayMatches(proseOf(page.pageId, page.locale), page.locale),
        `${page.pageId} ${page.locale}`,
      ).toEqual([]);
    }
    const en = JSON.parse(
      readFileSync(resolve(ROOT, "messages/en.json"), "utf8"),
    ) as {
      infoPages: Record<string, unknown>;
    };
    const values = leafValues(en.infoPages);
    expect(values.length).toBeGreaterThan(0);
    for (const value of values)
      expect(relayMatches(value, "en"), value).toEqual([]);
  });

  it("restoring 'until our florist accepts your order' turns it red (mutation)", () => {
    const mutated = source("pages/en/guarantee.md").replace(
      "until we start preparing your order",
      "until our florist accepts your order",
    );
    expect(relayMatches(mutated, "en")).not.toEqual([]);
    expect(relayMatches(proseOf("guarantee", "en"), "en")).toEqual([]);
  });
});

describe("T-33 / AC-31 and T-34 / AC-32: the charge model on the guarantee and help", () => {
  const charge = "Your card or wallet is charged when you order.";

  it("the guarantee and help Q9 say: charged at order, full refund until we start, no hold", () => {
    for (const locale of ENGLISH) {
      const guarantee = infoPageView("guarantee", locale);
      const cancelling =
        guarantee?.sections
          .find((section) => section.id === "cancelling")
          ?.paragraphs.join(" ") ?? "";
      expect(cancelling).toContain(charge);
      expect(cancelling).toContain(
        "You can cancel free of charge until we start preparing your order, and we refund you in full to the payment method you used.",
      );
      expect(cancelling).toContain("the order can no longer be cancelled");
      expect(cancelling).toContain(
        "If we cannot deliver an order, we cancel it and refund you in full.",
      );
      const q9 = infoPageView("help", locale)?.faq[8]?.a ?? "";
      expect(q9).toContain(charge);
      expect(q9).toContain(
        "free of charge until we start preparing your order, and we refund you in full",
      );
      for (const text of [cancelling, q9])
        expect(text).not.toMatch(/\bheld\b|hold the payment|authoris/iu);
    }
  });

  it("help Q9 carries 'We start preparing…' directly after its first sentence (T-34)", () => {
    const q9 = infoPageView("help", "en")?.faq[8]?.a ?? "";
    const sentences = q9.split(/(?<=\.)\s+/u);
    expect(sentences[1]).toBe(
      "We start preparing your flowers on the morning of the delivery day.",
    );
    expect(relayMatches(q9, "en")).toEqual([]);
  });

  it("deleting the charge sentence from the guarantee turns the case red (mutation)", () => {
    const provider = fixtureInfoContentProvider(
      overlay({
        "pages/en/guarantee.md": source("pages/en/guarantee.md").replace(
          `${charge} `,
          "",
        ),
      }),
    );
    const cancelling = infoPageView("guarantee", "en", {
      provider,
    })?.sections.find((s) => s.id === "cancelling");
    expect(cancelling?.paragraphs.join(" ")).not.toContain(charge);
  });
});
