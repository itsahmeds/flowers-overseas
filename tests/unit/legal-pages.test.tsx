/**
 * Spec 041 task 2 (TASK-183): the legal set.
 *
 * T-02 (the registration half of AC-2), T-04 (the Polish rename, AC-4), T-09 (AC-9), T-10
 * (AC-10), T-11 (the imprint under a complete trader identity, AC-11; and AC-39 (a), (e)), T-13
 * (the register table, AC-13), T-17's legal half (AC-17: a legal page also needs
 * `lawyerReviewed`), T-21's legal half (AC-21), T-25 (AC-25, the processor coverage), T-31's unit
 * half (AC-29), T-33's `cancellation` and `terms` half (AC-31) and the no-name rule (AC-37's
 * content half). Every case reads the committed files through the real parser and view model;
 * the fixtures are a registered company and small overlays on the committed files.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  type Company,
  COMPANY,
  CompanySchema,
  isTraderIdentityComplete,
} from "../../src/config/company.ts";
import { COOKIE_REGISTRY } from "../../src/config/cookies.ts";
import { INFO_PAGE_IDS, TRUST_PAGE_IDS } from "../../src/config/info-pages.ts";
import { LAUNCH_LOCALE_DATA } from "../../src/config/locales.data.ts";
import { CONSENT_POLICY_VERSION } from "../../src/lib/consent.ts";
import {
  LegalDocumentPage,
  type LegalDocumentView,
  fixtureInfoContentProvider,
  infoPageExists,
  infoPageHeadView,
  infoPagePath,
  infoPageView,
  legalDocumentView,
  listInfoPages,
  missingInfoPageLinkIds,
  parseInfoFile,
  staticInfoContentProvider,
  type InfoSourceFile,
} from "../../src/modules/content/index.ts";
import { localeChildParams } from "../../src/modules/catalog/routes.ts";
import { loadMessages } from "../../src/modules/i18n/index.ts";
import {
  type DeploymentDescriptor,
  INDEX_FOLLOW,
  NOINDEX_FOLLOW,
  pageIndexability,
} from "../../src/modules/seo/index.ts";
import { consentView } from "../../src/modules/ui/consent/consentView.ts";
import { footerView } from "../../src/modules/ui/layout/footerView.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const FILES = staticInfoContentProvider.files();
const LOCALES = ["en", "en-gb", "de", "pl"] as const;
const ENGLISH = ["en", "en-gb"] as const;
const GATED = ["imprint", "terms", "privacy"] as const;
const LEGAL = [
  "imprint",
  "terms",
  "privacy",
  "cookies",
  "cancellation",
] as const;

/**
 * A complete trader identity (spec 041 §14 A-founder-2026-10-23's facts; the VAT ID is a fixture
 * value, since none is issued, and main's schema still asks for one when `registered` is true).
 */
const REGISTERED: Company = CompanySchema.parse({
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
});
/** The same company with no VAT ID issued: the shape the company-identity task will commit. */
const REGISTERED_NO_VAT: Company = { ...REGISTERED, vatId: undefined };
const WITH_COMPANY = { company: REGISTERED } as const;

const INDEXING: DeploymentDescriptor = {
  environment: "production",
  siteUrl: "https://flowersoverseas.com",
};

const NAMESPACES = [
  "a11y",
  "common",
  "breadcrumb",
  "infoPages",
  "company",
  "consent",
] as const;

function render(node: ReactElement, locale = "en"): string {
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

function view(
  pageId: (typeof LEGAL)[number],
  locale = "en",
  options: Parameters<typeof legalDocumentView>[2] = {},
): LegalDocumentView {
  const result = legalDocumentView(pageId, locale, options);
  if (result === undefined) throw new Error(`${pageId} ${locale} has no view`);
  return result;
}

function source(path: string): string {
  const file = FILES.find((candidate) => candidate.path === path);
  if (file === undefined) throw new Error(`no committed file ${path}`);
  return file.source;
}

function overlay(
  changes: Readonly<Record<string, string>>,
): readonly InfoSourceFile[] {
  return FILES.map((file) =>
    file.path in changes
      ? { path: file.path, source: changes[file.path] ?? file.source }
      : file,
  );
}

/** Every text a view renders, one block per string, for the content scans. */
function textOf(legal: LegalDocumentView): string {
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
  ].join("\n\n");
}

/** One section's text, by anchor. */
function sectionText(legal: LegalDocumentView, id: string): string {
  const section = legal.sections.find((candidate) => candidate.id === id);
  if (section === undefined) return "";
  return textOf({
    ...legal,
    sections: [section],
    seoTitle: "",
    seoDescription: "",
    h1: "",
  });
}

describe("T-02 / AC-2: imprint, terms and privacy wait for the complete trader identity", () => {
  it("their files are committed in en and en-gb, yet none exists on the committed config", () => {
    for (const locale of ENGLISH) {
      for (const pageId of GATED) {
        expect(
          FILES.some((file) => file.path === `legal/${locale}/${pageId}.md`),
          `${locale} ${pageId} file`,
        ).toBe(true);
      }
    }
    expect(isTraderIdentityComplete()).toBe(false);
    for (const locale of LOCALES) {
      for (const pageId of GATED) {
        expect(infoPageExists(pageId, locale), `${pageId} ${locale}`).toBe(
          false,
        );
        expect(legalDocumentView(pageId, locale)).toBeUndefined();
      }
    }
  });

  it("a complete identity makes them exist wherever a file does, and changes nothing else", () => {
    for (const locale of LOCALES) {
      for (const pageId of GATED) {
        // Every launch locale has a file for the three (the de/pl drafts are TASK-184's).
        expect(
          infoPageExists(pageId, locale, WITH_COMPANY),
          `${pageId} ${locale}`,
        ).toBe(true);
      }
      for (const pageId of INFO_PAGE_IDS.filter(
        (id) => !(GATED as readonly string[]).includes(id),
      )) {
        expect(infoPageExists(pageId, locale, WITH_COMPANY)).toBe(
          infoPageExists(pageId, locale),
        );
      }
    }
  });

  it("registered without a mailbox is not a complete identity (the gate is not `registered`)", () => {
    // Mutation: gating on `isCompanyRegistered()` instead turns this case red.
    const noMailbox: Company = { ...REGISTERED, supportEmail: undefined };
    expect(isTraderIdentityComplete(noMailbox)).toBe(false);
    expect(infoPageExists("imprint", "en", { company: noMailbox })).toBe(false);
    expect(isTraderIdentityComplete(REGISTERED)).toBe(true);
  });

  it("the router's prebuilt set is exactly the legal pages that exist", async () => {
    const paths = new Set(
      (await localeChildParams()).map(
        (param) => `/${param.locale}/${param.segment}/${param.child}`,
      ),
    );
    for (const locale of ENGLISH) {
      expect(paths.has(`/${locale}/legal/cookies`), locale).toBe(true);
      expect(paths.has(`/${locale}/legal/cancellation`), locale).toBe(true);
      expect(paths.has(`/${locale}/legal/terms`), locale).toBe(false);
      expect(paths.has(`/${locale}/legal/privacy`), locale).toBe(false);
    }
    const listed = listInfoPages().map(
      (page) => `${page.pageId} ${page.locale}`,
    );
    expect(listed).toEqual(
      expect.arrayContaining(["cookies en", "cancellation en-gb"]),
    );
    expect(listed.some((entry) => entry.startsWith("imprint"))).toBe(false);
  });
});

describe("T-04 / AC-4: the Polish legal segment is informacje-prawne", () => {
  it("renames regulamin, so the Polish terms are not /pl/regulamin/regulamin", () => {
    const pl = LAUNCH_LOCALE_DATA.find((locale) => locale.code === "pl");
    expect(pl?.pathSegments.legal).toBe("informacje-prawne");
    expect(infoPagePath("terms", "pl")).toBe("/pl/informacje-prawne/regulamin");
    expect(infoPagePath("privacy", "pl")).toBe(
      "/pl/informacje-prawne/polityka-prywatnosci",
    );
  });
});

describe("T-09 / AC-9: the draft lines come from the document's state", () => {
  it("terms and cancellation are not in force: stamp, version header and the notInForce line", () => {
    for (const locale of ENGLISH) {
      const terms = view("terms", locale, WITH_COMPANY);
      const cancellation = view("cancellation", locale);
      for (const legal of [terms, cancellation]) {
        expect(legal.inForce).toBe(false);
        expect(legal.draftLine).toBe("infoPages.legal.notInForce");
        expect(legal.stamp).toBe("infoPages.legal.notInForceYet");
        const html = render(<LegalDocumentPage view={legal} />, locale);
        expect(html).toContain(
          "Draft, not in force. We are not taking orders yet",
        );
        expect(html).toMatch(
          /data-fo-legal-version-header[^>]*>(?:(?!<\/ul>).)*Not in force yet/su,
        );
      }
    }
  });

  it("privacy and cookies are in force and unreviewed: the effective date and the unreviewed line", () => {
    for (const legal of [
      view("cookies", "en"),
      view("privacy", "en", WITH_COMPANY),
    ]) {
      expect(legal.inForce).toBe(true);
      expect(legal.lawyerReviewed).toBe(false);
      expect(legal.draftLine).toBe("infoPages.legal.unreviewed");
      expect(legal.stamp).toBe("infoPages.legal.inForce");
      const html = render(<LegalDocumentPage view={legal} />);
      expect(html).toContain("In force since Saturday, 24 October 2026");
      expect(html).toContain("A lawyer has not reviewed it yet");
      expect(html).not.toContain("Draft, not in force.");
    }
  });

  it("the imprint renders no draft line, no stamp and no version header", () => {
    const imprint = view("imprint", "en", WITH_COMPANY);
    expect(imprint.draftLine).toBeUndefined();
    expect(imprint.stamp).toBeUndefined();
    const html = render(<LegalDocumentPage view={imprint} />);
    expect(html).not.toContain("data-fo-legal-draft-line");
    expect(html).not.toContain("data-fo-legal-stamp");
    expect(html).not.toContain("data-fo-legal-version-header");
  });

  it("flipping lawyerReviewed removes the unreviewed line and nothing else", () => {
    const path = "legal/en/cookies.md";
    const provider = fixtureInfoContentProvider(
      overlay({
        [path]: source(path).replace(
          "lawyerReviewed: false\nlawyerReviewedAt: null",
          'lawyerReviewed: true\nlawyerReviewedAt: "2026-10-24"',
        ),
      }),
    );
    const before = view("cookies", "en");
    const after = view("cookies", "en", { provider });
    expect(after.draftLine).toBeUndefined();
    expect({
      ...after,
      draftLine: before.draftLine,
      lawyerReviewed: before.lawyerReviewed,
      indexReviewed: before.indexReviewed,
    }).toEqual(before);
    const htmlBefore = render(<LegalDocumentPage view={before} />);
    const htmlAfter = render(<LegalDocumentPage view={after} />);
    const line = /<p[^>]*data-fo-legal-draft-line[^>]*>[^<]*<\/p>/u;
    expect(htmlBefore).toMatch(line);
    expect(htmlBefore.replace(line, "")).toBe(htmlAfter);
  });
});

describe("T-10 / AC-10: version, regime, contents and change log", () => {
  /** The `##` headings of a committed file, read by a second, independent parse. */
  function headingsOf(
    path: string,
  ): readonly { id: string; heading: string }[] {
    return [...source(path).matchAll(/^## (.+?) \{#([a-z0-9-]+)\}$/gmu)].map(
      (match) => ({ heading: match[1] ?? "", id: match[2] ?? "" }),
    );
  }

  it.each([
    ["terms", "en", "eu"],
    ["terms", "en-gb", "uk"],
    ["privacy", "en", "eu"],
    ["privacy", "en-gb", "uk"],
    ["cancellation", "en", "eu"],
    ["cancellation", "en-gb", "uk"],
  ] as const)(
    "%s in %s is regime %s, in its own file",
    (pageId, locale, regime) => {
      const parsed = parseInfoFile(
        `legal/${locale}/${pageId}.md`,
        source(`legal/${locale}/${pageId}.md`),
      );
      expect(parsed.ok && parsed.file.kind).toBe("legal");
      expect(view(pageId, locale, WITH_COMPANY).regime).toBe(regime);
      const html = render(
        <LegalDocumentPage view={view(pageId, locale, WITH_COMPANY)} />,
        locale,
      );
      expect(html).toContain(
        regime === "uk"
          ? "Applies to buyers in the United Kingdom"
          : "Applies to buyers in the European Union",
      );
    },
  );

  it.each(["terms", "privacy", "cookies", "cancellation"] as const)(
    "%s: the contents are exactly the ## headings, in order, linking to their anchors",
    (pageId) => {
      // Terms and privacy exist only under a complete identity; the cookie notice is read as it
      // ships, with its interim sections (under the identity they give way to one link).
      const legal = view(
        pageId,
        "en",
        pageId === "terms" || pageId === "privacy" ? WITH_COMPANY : {},
      );
      const expected = headingsOf(`legal/en/${pageId}.md`);
      expect(expected.length).toBeGreaterThan(1);
      expect(legal.toc).toEqual(expected);
      const html = render(<LegalDocumentPage view={legal} />);
      const nav = html.slice(
        html.indexOf("data-fo-legal-toc"),
        html.indexOf("</nav>", html.indexOf("data-fo-legal-toc")),
      );
      expect([...nav.matchAll(/href="#([^"]+)"/gu)].map((m) => m[1])).toEqual(
        expected.map((entry) => entry.id),
      );
      for (const entry of expected) {
        expect(html).toContain(`id="${entry.id}"`);
      }
    },
  );

  it("renders the version and the change log as a list", () => {
    const legal = view("cancellation", "en");
    expect(legal.version).toBe("0.1.0");
    const html = render(<LegalDocumentPage view={legal} />);
    expect(html).toContain('data-fo-legal-version="0.1.0"');
    expect(html).toContain(">Version 0.1.0<");
    expect(html).toContain('data-fo-legal-change="0.1.0"');
    expect(html).toContain(">What changed<");
    expect(html).toContain(
      "First draft, not in force: we are not taking orders yet.",
    );
  });
});

describe("T-11 / AC-11, AC-39: the imprint under a complete trader identity", () => {
  it("renders the legal name, register, number, address, email and phone, and no person", () => {
    const imprint = view("imprint", "en", { company: REGISTERED_NO_VAT });
    expect(imprint.facts).toEqual({
      legalName: "Flowers Overseas LLC",
      registryName: "Wyoming Secretary of State",
      registrationNumber: "2026-002113883",
      address: "30 N Gould St Ste R, 82801, Sheridan",
      vatId: undefined,
      supportEmail: "help@example.com",
      phoneDisplay: "+1 (213) 592-5150",
      telHref: "tel:+12135925150",
    });
    const html = render(<LegalDocumentPage view={imprint} />);
    for (const fact of [
      "Flowers Overseas LLC",
      "Wyoming Secretary of State",
      "2026-002113883",
      "30 N Gould St Ste R, 82801, Sheridan",
      'href="mailto:help@example.com"',
      'href="tel:+12135925150"',
    ]) {
      expect(html, fact).toContain(fact);
    }
    // No VAT label without a value, no representative row, no completeness claim (AC-39 (a)).
    expect(html).not.toContain("VAT ID");
    expect(html).not.toMatch(/representative|Hameed|Sheikh|Tahoor/iu);
    expect(html).not.toMatch(/DDG|TMG|Angaben gemäß|as required by/u);
    expect(html.match(/<dl/gu)).toHaveLength(1);
  });

  it("adds a VAT row only when a VAT ID is set", () => {
    const html = render(
      <LegalDocumentPage view={view("imprint", "en", WITH_COMPANY)} />,
    );
    expect(html).toMatch(
      /data-fo-imprint-fact="vatId"(?:(?!<\/div>).)*PL1234567890/su,
    );
  });

  it("the en-gb imprint extends en", () => {
    expect(view("imprint", "en-gb", WITH_COMPANY).facts).toEqual(
      view("imprint", "en", WITH_COMPANY).facts,
    );
  });

  it("no legal file names AKI, Estonia or an OÜ (AC-39 (e))", () => {
    for (const file of FILES.filter((candidate) =>
      candidate.path.startsWith("legal/"),
    )) {
      expect(file.source, file.path).not.toMatch(
        /\bAKI\b|Andmekaitse|Estonia|Estonian|OÜ/u,
      );
    }
  });
});

describe("T-13 / AC-13: the cookie register and the re-open button", () => {
  const cookies = view("cookies", "en");
  const html = render(<LegalDocumentPage view={cookies} />);

  it("one row per register entry, in the register's order, with name, group, purpose, lifetime and status", () => {
    const rows = [...html.matchAll(/data-fo-cookie-row="([^"]+)"/gu)].map(
      (match) => match[1],
    );
    expect(rows).toEqual(COOKIE_REGISTRY.map((entry) => entry.name));
    expect(html).toContain("<caption");
    expect(html.match(/<th[^>]*scope="col"/gu)).toHaveLength(5);
    expect(html.match(/<th[^>]*scope="row"/gu)).toHaveLength(
      COOKIE_REGISTRY.length,
    );
    // fo_consent is set today and essential; _ga is planned and analytics.
    expect(html).toMatch(
      /data-fo-cookie-row="fo_consent">(?:(?!<\/tr>).)*Essential(?:(?!<\/tr>).)*365 days(?:(?!<\/tr>).)*data-fo-cookie-status="set">Set today/su,
    );
    expect(html).toMatch(
      /data-fo-cookie-row="_ga">(?:(?!<\/tr>).)*Analytics(?:(?!<\/tr>).)*data-fo-cookie-status="declared">Planned/su,
    );
  });

  it("states the consent policy version and carries the re-open control twice (page and dock)", () => {
    expect(html).toContain(
      `Consent policy version ${String(CONSENT_POLICY_VERSION)}`,
    );
    const buttons = [
      ...html.matchAll(
        /<button[^>]*data-fo-consent-reopen=""[^>]*>([^<]*)<\/button>/gu,
      ),
    ];
    expect(buttons.map((match) => match[1])).toEqual([
      "Change cookie settings",
      "Change cookie settings",
    ]);
    expect(html).toContain("data-fo-legal-dock");
    expect(html).not.toMatch(/<form|<input/u);
  });
});

describe("T-17 / AC-17: a legal page also needs lawyerReviewed to be indexed", () => {
  const path = "legal/en/cookies.md";
  const reviewedOnly = fixtureInfoContentProvider(
    overlay({
      [path]: source(path).replace(
        "reviewed: false",
        'reviewed: true\nreviewedBy: "fixture"\nreviewedAt: "2026-10-24"',
      ),
    }),
  );
  const both = fixtureInfoContentProvider(
    overlay({
      [path]: source(path)
        .replace(
          "reviewed: false",
          'reviewed: true\nreviewedBy: "fixture"\nreviewedAt: "2026-10-24"',
        )
        .replace(
          "lawyerReviewed: false\nlawyerReviewedAt: null",
          'lawyerReviewed: true\nlawyerReviewedAt: "2026-10-24"',
        ),
    }),
  );

  function directive(provider: typeof both) {
    const head = infoPageHeadView("cookies", "en", { provider });
    return pageIndexability(
      {
        pageType: "cookies",
        locale: "en",
        exists: true,
        reviewed: head?.reviewed ?? false,
      },
      INDEXING,
    ).directive;
  }

  it("reviewed copy without the lawyer is noindex,follow; with the lawyer, index,follow", () => {
    // Mutation: dropping `&& lawyerReviewed` from the legal head view turns the first line red.
    expect(directive(reviewedOnly)).toBe(NOINDEX_FOLLOW);
    expect(directive(both)).toBe(INDEX_FOLLOW);
  });

  it("every committed legal page is noindex in Phase 0", () => {
    for (const locale of ENGLISH) {
      for (const pageId of LEGAL) {
        const head = infoPageHeadView(pageId, locale, WITH_COMPANY);
        expect(head?.reviewed, `${pageId} ${locale}`).toBe(false);
      }
    }
  });
});

describe("T-21 / AC-21: the legal links in the footer", () => {
  it("every launch locale links cookies and withdrawal and refunds at its own path; no locale links imprint, terms or privacy", () => {
    const paths: Readonly<
      Record<string, { cookies: string; cancellation: string }>
    > = {
      en: {
        cookies: "/en/legal/cookies",
        cancellation: "/en/legal/cancellation",
      },
      "en-gb": {
        cookies: "/en-gb/legal/cookies",
        cancellation: "/en-gb/legal/cancellation",
      },
      de: {
        cookies: "/de/rechtliches/cookies",
        cancellation: "/de/rechtliches/widerruf",
      },
      pl: {
        cookies: "/pl/informacje-prawne/cookies",
        cancellation: "/pl/informacje-prawne/odstapienie-od-umowy",
      },
    };
    for (const locale of LOCALES) {
      const view = footerView(locale, {
        unavailable: missingInfoPageLinkIds(locale),
      });
      const hrefs = new Map(
        [...view.columns, view.legal]
          .flatMap((group) => group.links)
          .map((link) => [link.id, link.href]),
      );
      expect(hrefs.get("cookies"), locale).toBe(paths[locale]?.cookies);
      expect(hrefs.get("withdrawal-and-refunds"), locale).toBe(
        paths[locale]?.cancellation,
      );
      for (const id of ["imprint", "terms", "privacy"]) {
        expect(hrefs.get(id), `${locale} ${id}`).toBeUndefined();
      }
    }
  });

  it("a complete identity draws the imprint, terms and privacy in en and en-gb", () => {
    for (const locale of ENGLISH) {
      const view = footerView(locale, {
        unavailable: missingInfoPageLinkIds(locale, WITH_COMPANY),
      });
      const hrefs = new Map(
        [...view.columns, view.legal]
          .flatMap((group) => group.links)
          .map((link) => [link.id, link.href]),
      );
      expect(hrefs.get("imprint")).toBe(`/${locale}/imprint`);
      expect(hrefs.get("terms")).toBe(`/${locale}/legal/terms`);
      expect(hrefs.get("privacy")).toBe(`/${locale}/legal/privacy`);
    }
  });
});

describe("T-25 / AC-25: the notices name every processor the RoPA names", () => {
  const ropa = readFileSync(resolve(ROOT, "docs/compliance/ropa.md"), "utf8");
  /** The processor names this project uses, and the RoPA's numbered rows' Recipients cells. */
  const KNOWN = ["Railway", "Cloudflare", "Vercel", "Sentry", "Neon", "Google"];
  const rows = new Map(
    ropa
      .split("\n")
      .filter((line) => /^\| \d+ \| /u.test(line))
      .map((line) => {
        const cells = line.split(" | ");
        return [Number(cells[0]?.replace("| ", "")), cells[6] ?? ""] as const;
      }),
  );
  const named = (row: number) =>
    KNOWN.filter((name) => (rows.get(row) ?? "").includes(name));

  it("RoPA row 2 names Railway and Cloudflare as ADR-0018 left the hosting, and records spec 041", () => {
    expect(named(2)).toEqual(
      expect.arrayContaining(["Railway", "Cloudflare", "Vercel"]),
    );
    expect(rows.get(3)).toContain("platform log of `ropa.md` row 2");
    expect(ropa).toContain(
      "Spec 041 (trust, help and legal pages): no new processing.",
    );
  });

  it("every processor of every RoPA row is named in the en and en-gb privacy files", () => {
    const all = [...rows.keys()].flatMap((row) => named(row));
    expect(new Set(all)).toEqual(new Set(KNOWN));
    for (const locale of ENGLISH) {
      const text = textOf(view("privacy", locale, WITH_COMPANY));
      for (const name of new Set(all)) {
        expect(text, `${locale} privacy: ${name}`).toContain(name);
      }
    }
  });

  it("rows 1 to 3's processors are named in the cookie notice's 'What else this website records'", () => {
    // Row 3's only recipient is row 2's platform log, asserted above.
    const processors = [...named(1), ...named(2)];
    expect(processors).toEqual(
      expect.arrayContaining(["Sentry", "Railway", "Cloudflare", "Vercel"]),
    );
    for (const locale of ENGLISH) {
      const section = sectionText(
        view("cookies", locale),
        "what-else-this-website-records",
      );
      for (const name of processors) {
        expect(section, `${locale}: ${name}`).toContain(name);
      }
    }
  });

  it("deleting Sentry from the cookie section turns the case red (mutation)", () => {
    const path = "legal/en/cookies.md";
    const provider = fixtureInfoContentProvider(
      overlay({
        [path]: source(path).replaceAll("Sentry", "an error service"),
      }),
    );
    const section = sectionText(
      view("cookies", "en", { provider }),
      "what-else-this-website-records",
    );
    expect(section).not.toContain("Sentry");
  });
});

describe("T-31 / AC-29: who is responsible, until the privacy notice exists", () => {
  const messages = loadMessages("en", ["company", "consent"]);
  /** The catalogue's own text for a dotted key, with `{slot}`s filled (no ICU plural here). */
  const translate = (
    key: string,
    values?: Record<string, number | string>,
  ): string => {
    const found = key
      .split(".")
      .reduce<unknown>(
        (node, part) =>
          typeof node === "object" && node !== null
            ? (node as Record<string, unknown>)[part]
            : undefined,
        messages,
      );
    let text = typeof found === "string" ? found : key;
    for (const [slot, value] of Object.entries(values ?? {})) {
      text = text.replace(`{${slot}}`, String(value));
    }
    return text;
  };

  it("consentView carries the controller sentence with the company's name and number, and no link", () => {
    const projected = consentView(translate);
    expect(projected.controller).toEqual({
      kind: "sentence",
      text: "This website is run by Flowers Overseas. For questions about your cookie choices or your personal data, call or WhatsApp +1 (213) 592-5150.",
    });
    const registered = consentView(translate, { company: REGISTERED });
    expect(registered.controller.text).toContain(
      "This website is run by Flowers Overseas LLC.",
    );
    expect(JSON.stringify(projected.controller)).not.toMatch(
      /Hameed|Sheikh|href|Gould|82801/u,
    );
  });

  it("once the privacy notice exists, consentView links to it instead", () => {
    const projected = consentView(translate, {
      privacyHref: "/en-gb/legal/privacy",
    });
    expect(projected.controller).toEqual({
      kind: "privacyLink",
      text: "How we use your personal data",
      href: "/en-gb/legal/privacy",
    });
  });

  it("the cookie notice carries the two interim sections while the privacy notice is absent", () => {
    const cookies = view("cookies", "en");
    const ids = cookies.sections.map((section) => section.id);
    expect(ids).toContain("who-is-responsible");
    expect(ids).toContain("what-else-this-website-records");
    expect(cookies.controller).toEqual({
      name: "Flowers Overseas",
      phone: "+1 (213) 592-5150",
    });
    const html = render(<LegalDocumentPage view={cookies} />);
    expect(html).toContain(
      "This website is run by Flowers Overseas. For questions about your cookie choices or your personal data, call or WhatsApp +1 (213) 592-5150.",
    );
    expect(html).not.toContain("data-fo-privacy-link");
  });

  it("states purpose and basis per record, the US transfer and its safeguard, and the complaint line", () => {
    for (const locale of ENGLISH) {
      const section = sectionText(
        view("cookies", locale),
        "what-else-this-website-records",
      );
      const record = (heading: string, next: string | undefined) =>
        section.slice(
          section.indexOf(heading),
          next === undefined ? undefined : section.indexOf(next),
        );
      const logs = record(
        "Hosting and edge logs",
        "Server-side error monitoring",
      );
      const errors = record("Server-side error monitoring", "Consent records");
      const consent = record("Consent records", "Where this information goes");
      expect(logs).toContain("to serve the website and to keep it secure");
      expect(logs).toContain("GDPR Art. 6(1)(f)");
      expect(errors).toContain("to detect and fix errors");
      expect(errors).toContain("GDPR Art. 6(1)(f)");
      expect(consent).toContain("to be able to show what you chose");
      expect(consent).toContain("GDPR Art. 6(1)(c) with Art. 7(1)");
      expect(section).toContain(
        "The hosting and edge logs may be transferred to the United States under the providers' data-processing terms, which rely on the EU-US Data Privacy Framework and/or the European Commission's standard contractual clauses.",
      );
      expect(section).toContain(
        "Today the consent records are kept in those same logs, so they follow the same transfer.",
      );
      expect(section).toContain(
        "Error reports stay in Sentry's European Union region.",
      );
      expect(section).toContain(
        "you can complain to the data protection authority where you live or work: for example the UODO in Poland or, in the UK, the ICO.",
      );
      expect(section).not.toMatch(/\bAKI\b|Estonia/u);
    }
  });

  it("once the privacy notice exists, one link replaces the two sections", () => {
    const cookies = view("cookies", "en", WITH_COMPANY);
    const ids = cookies.sections.map((section) => section.id);
    expect(ids).not.toContain("who-is-responsible");
    expect(ids).not.toContain("what-else-this-website-records");
    expect(ids.filter((id) => id === "privacy-notice")).toHaveLength(1);
    const html = render(<LegalDocumentPage view={cookies} />);
    expect(html).toMatch(
      /<a[^>]*data-fo-privacy-link="[^"]*"[^>]*href="\/en\/legal\/privacy"/u,
    );
    expect(html).toContain(">How we use your personal data<");
    expect(html).not.toContain("This website is run by");
  });
});

describe("T-33 / AC-31: the charge model in the cancellation and terms documents", () => {
  const CHARGE = "Your card or wallet is charged when you order.";
  const UNTIL =
    "You can cancel free of charge until we start preparing your order, and we refund you in full to the payment method you used.";
  const STARTED = "Once we have started, the order can no longer be cancelled.";
  const UNDELIVERABLE =
    "If we cannot deliver an order, we cancel it and refund you in full";

  it.each(ENGLISH)(
    "%s: both documents state it, with no hold and no florist in the reason",
    (locale) => {
      for (const legal of [
        view("cancellation", locale),
        view("terms", locale, WITH_COMPANY),
      ]) {
        const text = textOf(legal);
        expect(text, legal.pageId).toContain(CHARGE);
        expect(text, legal.pageId).toContain(UNTIL);
        expect(text, legal.pageId).toContain(STARTED);
        const sentence = text
          .split(/(?<=\.)\s+|\n\n/u)
          .find((candidate) => candidate.startsWith(UNDELIVERABLE));
        expect(sentence, legal.pageId).toBeDefined();
        expect(sentence).not.toMatch(/florist/iu);
        expect(text).not.toMatch(/\bheld\b|hold the payment|authori[sz]/iu);
      }
    },
  );

  it("deleting the charge sentence from the cancellation file turns the case red (mutation)", () => {
    const path = "legal/en/cancellation.md";
    const provider = fixtureInfoContentProvider(
      overlay({ [path]: source(path).replace(`${CHARGE} `, "") }),
    );
    expect(textOf(view("cancellation", "en", { provider }))).not.toContain(
      CHARGE,
    );
  });
});

describe("AC-37 (content half): no person's name in any message or content file", () => {
  it("finds no Hameed, Tahoor or Sheikh Ahmad in messages/ or content/", () => {
    for (const locale of LOCALES) {
      expect(
        readFileSync(resolve(ROOT, `messages/${locale}.json`), "utf8"),
        locale,
      ).not.toMatch(/Hameed|Tahoor|Sheikh Ahmad/u);
    }
    for (const file of FILES) {
      expect(file.source, file.path).not.toMatch(/Hameed|Tahoor|Sheikh Ahmad/u);
    }
  });

  it("a content file carrying {representativeName} fails to parse, naming the file", () => {
    const path = "pages/en/about.md";
    const result = parseInfoFile(
      path,
      source(path).replace("{legalName}", "{representativeName}"),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.file).toBe(`content/${path}`);
      expect(result.issues[0]?.message).toContain("withdrawn");
    }
  });

  it("no trust page renders a data slot while the company is unregistered", () => {
    for (const pageId of TRUST_PAGE_IDS) {
      for (const locale of ENGLISH) {
        expect(
          JSON.stringify(infoPageView(pageId, locale)),
          `${pageId} ${locale}`,
        ).not.toMatch(/\{legalName\}|\{representativeName\}/u);
      }
    }
  });
});

describe("AC-3: a legal body that breaks the subset fails, naming the field", () => {
  it.each([
    ["an unknown data block", "[[nope]]"],
    ["a register outside the cookie notice", "[[register]]"],
    ["an unknown data slot", "Call {fax}."],
    [
      "a registry slot in a document that exists before the company",
      "We are {legalName}.",
    ],
    ["a duplicated anchor", "## Again {#if-we-cannot-deliver}\n\nText."],
  ])("refuses %s", (_what, addition) => {
    const path = "legal/en/cancellation.md";
    const result = parseInfoFile(path, `${source(path)}\n${addition}\n`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.field).toBe("body");
  });

  it("refuses interim anchors that are not sections, and a register with no labels", () => {
    const path = "legal/en/cookies.md";
    const badInterim = parseInfoFile(
      path,
      source(path).replace("    - who-is-responsible", "    - nobody"),
    );
    expect(!badInterim.ok && badInterim.issues[0]?.field).toBe(
      "interim.sections.0",
    );
    const start = source(path).indexOf("labels:");
    const end = source(path).indexOf("interim:");
    const noLabels = parseInfoFile(
      path,
      source(path).slice(0, start) + source(path).slice(end),
    );
    expect(!noLabels.ok && noLabels.issues[0]?.field).toBe("labels.register");
  });
});
