/**
 * T-18 / AC-18 and T-19 / AC-19 at the route's own functions (spec 041; TASK-182; `/review 270`
 * required changes 2 and 3, `/break 270` hole 6). `src/app/[locale]/[segment]/page.tsx` calls
 * `infoPageMetadata()` and `infoPageJsonLd()` and nothing else for an info page, so these cases
 * read what the page serves: the `<head>` per page and locale, and the schema against the
 * rendered page's own text.
 */
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TRUST_PAGE_IDS } from "../../src/config/info-pages.ts";
import { InfoPage, infoPageView } from "../../src/modules/content/index.ts";
import { loadMessages } from "../../src/modules/i18n/index.ts";
import {
  type DeploymentDescriptor,
  NOINDEX_FOLLOW,
  infoPageJsonLd,
  infoPageMetadata,
} from "../../src/modules/seo/index.ts";

const ORIGIN = "https://flowersoverseas.com";
const INDEXING: DeploymentDescriptor = {
  environment: "production",
  siteUrl: ORIGIN,
};
const PREVIEW: DeploymentDescriptor = {
  environment: "preview",
  siteUrl: "https://fo-preview.up.railway.app",
};
const SEGMENT: Readonly<Record<string, string>> = {
  "how-it-works": "how-it-works",
  guarantee: "guarantee",
  help: "help",
  about: "about",
  delivery: "delivery",
};

const label = (
  key: string,
  values?: Readonly<Record<string, string>>,
): string => (key === "common.homeLink" ? "Home" : (values?.["name"] ?? key));

const FORBIDDEN_TYPES = [
  "LocalBusiness",
  "FloristShop",
  "Product",
  "Offer",
  "AggregateRating",
  "Review",
  "HowTo",
];

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#x27;");
}

describe("T-18 / AC-18: the info page's <head>", () => {
  for (const locale of ["en", "en-gb"] as const) {
    for (const pageId of TRUST_PAGE_IDS) {
      it(`${locale}/${pageId}: own title and description, self-canonical, the English cluster, noindex while unreviewed`, () => {
        const view = infoPageView(pageId, locale);
        const segment = SEGMENT[pageId] ?? "";
        const path = `/${locale}/${segment}`;
        expect(view?.path).toBe(path);
        const metadata = infoPageMetadata(pageId, locale, INDEXING);
        expect(metadata?.title).toBe(view?.seoTitle);
        expect(metadata?.description).toBe(view?.seoDescription);
        expect(metadata?.robots).toEqual(NOINDEX_FOLLOW);
        expect(metadata?.alternates?.canonical).toBe(`${ORIGIN}${path}`);
        const en = `${ORIGIN}/en/${segment}`;
        expect(metadata?.alternates?.languages).toEqual({
          en,
          "en-IE": en,
          "en-NL": en,
          "en-GB": `${ORIGIN}/en-gb/${segment}`,
          "x-default": en,
        });
      });
    }
  }

  it("is noindex on a preview deployment, and absent where the page does not exist", () => {
    expect(infoPageMetadata("help", "en", PREVIEW)?.robots).toEqual(
      NOINDEX_FOLLOW,
    );
    expect(infoPageMetadata("help", "en", PREVIEW)?.alternates?.canonical).toBe(
      "https://fo-preview.up.railway.app/en/help",
    );
    // `fr` and `en-us` are no routable locale, so the page does not exist there (the de/pl
    // drafts exist since TASK-184 and have their own cases in `info-pages-drafts.test.tsx`).
    for (const locale of ["fr", "en-us"]) {
      expect(
        infoPageMetadata("help", locale, INDEXING),
        locale,
      ).toBeUndefined();
      expect(infoPageJsonLd("help", locale, INDEXING, label), locale).toEqual(
        [],
      );
    }
  });
});

describe("`/break 270` HOLE 12 (carried to TASK-184): an http: origin emits no hreflang", () => {
  it("a local or preview build on http: has a canonical and no alternates.languages", () => {
    // Production is `https`; `infoPageMetadata()` writes a cluster only for an https origin,
    // because an http alternate is one Google would follow to a different URL. Mutation: dropping
    // the `startsWith("https:")` guard emits the English cluster here and turns this red.
    const LOCAL: DeploymentDescriptor = {
      environment: "production",
      siteUrl: "http://localhost:3000",
    };
    const metadata = infoPageMetadata("help", "en", LOCAL);
    expect(metadata?.alternates?.canonical).toBe(
      "http://localhost:3000/en/help",
    );
    expect(metadata?.alternates?.languages).toBeUndefined();
    // The control: the same page on the https origin carries its cluster.
    expect(
      infoPageMetadata("help", "en", INDEXING)?.alternates?.languages,
    ).toBeDefined();
  });
});

describe("T-19 / AC-19: the info page's JSON-LD", () => {
  it("help's FAQPage equals the rendered questions and answers, character for character", () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider
        locale="en"
        messages={loadMessages("en", [
          "a11y",
          "common",
          "breadcrumb",
          "infoPages",
          "company",
          "destinations",
          "occasionHub",
        ])}
        timeZone="UTC"
      >
        <InfoPage pageId="help" locale="en" />
      </NextIntlClientProvider>,
    );
    const faq = infoPageJsonLd("help", "en", INDEXING, label).find(
      (node) => node["@type"] === "FAQPage",
    ) as
      | { mainEntity: { name: string; acceptedAnswer: { text: string } }[] }
      | undefined;
    const view = infoPageView("help", "en");
    expect(
      faq?.mainEntity.map((entry) => [entry.name, entry.acceptedAnswer.text]),
    ).toEqual((view?.faq ?? []).map((item) => [item.q, item.a]));
    for (const entry of faq?.mainEntity ?? []) {
      expect(html, entry.name).toContain(`>${escapeHtml(entry.name)}<`);
      expect(html, entry.acceptedAnswer.text).toContain(
        `>${escapeHtml(entry.acceptedAnswer.text)}<`,
      );
    }
  });

  it("every page has a BreadcrumbList; help adds FAQPage, about adds Organization, nothing else", () => {
    for (const locale of ["en", "en-gb"]) {
      for (const pageId of TRUST_PAGE_IDS) {
        const types = infoPageJsonLd(pageId, locale, INDEXING, label).map(
          (node) => node["@type"],
        );
        const expected =
          pageId === "help"
            ? ["BreadcrumbList", "FAQPage"]
            : pageId === "about"
              ? ["BreadcrumbList", "Organization"]
              : ["BreadcrumbList"];
        expect(types, `${locale}/${pageId}`).toEqual(expected);
        const serialised = JSON.stringify(
          infoPageJsonLd(pageId, locale, INDEXING, label),
        );
        for (const forbidden of FORBIDDEN_TYPES) {
          expect(serialised, `${locale}/${pageId}`).not.toContain(
            `"${forbidden}"`,
          );
        }
      }
    }
  });

  it("about's Organization carries exactly name, url and logo", () => {
    const node = infoPageJsonLd("about", "en", INDEXING, label).find(
      (candidate) => candidate["@type"] === "Organization",
    );
    expect(Object.keys(node ?? {}).sort()).toEqual([
      "@type",
      "logo",
      "name",
      "url",
    ]);
  });
});
