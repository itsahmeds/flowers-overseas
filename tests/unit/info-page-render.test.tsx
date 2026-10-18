/**
 * The trust pages as rendered HTML (spec 041; TASK-182): T-15 (AC-15, the help page with no
 * JavaScript), T-19 (AC-19, JSON-LD from the same view model), T-06's rendered half (AC-6), the
 * about page's DOM order (AC-1, §14 A1), T-11's rendered half (no address) and AC-26 (no form,
 * no input). The component is a Server Component: `renderToStaticMarkup` is the HTML a crawler
 * and a browser with JavaScript off receive.
 */
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { COMPANY } from "../../src/config/company.ts";
import { TRUST_PAGE_IDS } from "../../src/config/info-pages.ts";
import { InfoPage, infoPageView } from "../../src/modules/content/index.ts";
import { loadMessages } from "../../src/modules/i18n/index.ts";
import {
  breadcrumbList,
  faqPage,
  organization,
} from "../../src/modules/seo/index.ts";

const NAMESPACES = [
  "a11y",
  "common",
  "breadcrumb",
  "infoPages",
  "company",
  "destinations",
  "occasionHub",
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

const NOT_YET_OPEN =
  "We are not taking orders yet. This page describes how ordering will work when we open.";

describe("T-15 / AC-15: help, with JavaScript off", () => {
  const html = render(<InfoPage pageId="help" locale="en" />);

  it("puts the contact block before the first question", () => {
    const contact = html.indexOf("data-fo-contact-block");
    const firstQuestion = html.indexOf(
      "How does sending flowers abroad with you work?",
    );
    expect(contact).toBeGreaterThan(0);
    expect(firstQuestion).toBeGreaterThan(contact);
  });

  it("renders twelve questions as <h2> with their answers, nothing collapsed or hidden", () => {
    const view = infoPageView("help", "en");
    expect(view?.faq).toHaveLength(12);
    for (const item of view?.faq ?? []) {
      const escaped = item.q.replaceAll("'", "&#x27;");
      expect(html).toMatch(
        new RegExp(
          `<h2[^>]*>${escaped.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}</h2>`,
          "u",
        ),
      );
      expect(html).toContain(item.a.replaceAll("'", "&#x27;"));
    }
    expect(html).not.toContain("<details");
    expect(html).not.toMatch(/\shidden(?:[\s=>])/u);
    expect(html).not.toContain('aria-hidden="true">How');
  });

  it("the 01–12 numbers are aria-hidden decoration", () => {
    expect(html).toMatch(/<span aria-hidden="true"[^>]*>01<\/span>/u);
    expect(html).toMatch(/<span aria-hidden="true"[^>]*>12<\/span>/u);
  });

  it("the WhatsApp link is wa.me with no query, and no email or mailto while there is none", () => {
    expect(html).toContain('href="https://wa.me/12135925150"');
    expect(html).not.toContain("mailto:");
    expect(html).not.toContain("@");
    // TASK-238's support line is blocked on the founder: no hours sentence and no "24/7".
    expect(html).not.toContain("24/7");
  });
});

describe("T-06 / AC-6 and AC-26: every trust page", () => {
  it.each(TRUST_PAGE_IDS)(
    "%s renders the not-open line right after its h1, one h1, no form",
    (pageId) => {
      for (const locale of ["en", "en-gb"]) {
        const html = render(
          <InfoPage pageId={pageId} locale={locale} />,
          locale,
        );
        expect(html.match(/<h1/gu)).toHaveLength(1);
        const h1End = html.indexOf("</h1>");
        const line = html.indexOf(NOT_YET_OPEN);
        expect(line).toBeGreaterThan(h1End);
        // Directly after: nothing but the eyebrow's own markup between the two.
        expect(html.slice(h1End, line)).not.toMatch(/<h2|<p[^>]*>[^<]/u);
        expect(html).not.toContain("<form");
        expect(html).not.toContain("<input");
        expect(html).not.toContain("<details");
      }
    },
  );
});

describe("AC-1 (§14 A1) and AC-11: about", () => {
  const html = render(<InfoPage pageId="about" locale="en" />);

  it("orders h1, status, intro, who runs it, why, today, the company", () => {
    const order = [
      "<h1",
      NOT_YET_OPEN,
      "Flowers Overseas sends flowers to people in other European countries",
      ">Who runs it<",
      ">Why we do it this way<",
      ">Where we are today<",
      ">The company<",
      "Flowers Overseas is not yet a registered company.",
    ].map((needle) => html.indexOf(needle));
    for (const index of order) expect(index).toBeGreaterThan(-1);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("names the representative and prints no address", () => {
    expect(html).toContain("Sheikh Ahmad Hameed");
    expect(html).not.toMatch(
      /Operated by|VAT|Tallinn|registr(?:y|ation) number/iu,
    );
  });
});

describe("T-19 / AC-19: JSON-LD from the same view model", () => {
  const OPTIONS = { baseUrl: "https://flowersoverseas.com" };
  const label = (
    key: string,
    values?: Readonly<Record<string, string>>,
  ): string => (key === "common.homeLink" ? "Home" : (values?.["name"] ?? key));

  it("help's FAQPage equals the visible questions and answers, character for character", () => {
    const view = infoPageView("help", "en");
    const node = faqPage(view?.faq ?? []) as {
      mainEntity: { name: string; acceptedAnswer: { text: string } }[];
    };
    expect(
      node.mainEntity.map((entry) => [entry.name, entry.acceptedAnswer.text]),
    ).toEqual((view?.faq ?? []).map((item) => [item.q, item.a]));
  });

  it("every page's BreadcrumbList names the page by its h1, with no item on the current crumb", () => {
    for (const pageId of TRUST_PAGE_IDS) {
      const view = infoPageView(pageId, "en");
      const node = breadcrumbList(view?.breadcrumb ?? [], label, OPTIONS) as {
        itemListElement: { name: string; item?: string }[];
      };
      expect(node.itemListElement.map((entry) => entry.name)).toEqual([
        "Home",
        view?.h1,
      ]);
      expect(node.itemListElement[1]?.item).toBeUndefined();
    }
  });

  it("about's Organization carries only name, url and logo while unregistered", () => {
    const node = organization(COMPANY, OPTIONS);
    expect(Object.keys(node).sort()).toEqual(["@type", "logo", "name", "url"]);
  });
});
