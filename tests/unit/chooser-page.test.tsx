/**
 * T-83's document half and T-96's remember line (spec 004 §14 A-founder-2026-10-24a item 3,
 * AC-77, AC-90; TASK-385): the chooser page as the server renders it. A normal page: `<main>`
 * with the form whose label is the `<h1>`, no dialog, the shop countries as `to` buttons in the one
 * order, the search field over a `<datalist>` of every registry country, the remember line; with a
 * remembered country "Continue to {country}" first; on a no match, what was typed, "Did you mean"
 * and every shop country by region, each a `nofollow` path-form link. Every string from a key.
 */
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ChooserPage,
  type ChooserPageState,
  chooserPageView,
  parseChooserNext,
} from "../../src/modules/catalog";
import { loadMessages } from "../../src/modules/i18n";

async function render(
  state: ChooserPageState,
  remembered?: string,
): Promise<string> {
  const view = await chooserPageView(
    "en",
    parseChooserNext("en", "product/vistula-red"),
    state,
    { remembered, chips: 6 },
  );
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale="en"
      messages={loadMessages("en", ["home", "shop", "destinationsHub"])}
      timeZone="UTC"
    >
      <ChooserPage view={view} />
    </NextIntlClientProvider>,
  );
}

/** Every opening tag of `name`, attributes in any order (React sorts some to the end). */
const tags = (html: string, name: string): string[] =>
  [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "gu"))].map(
    (match) => match[0],
  );

/** Does an opening tag carry every attribute, whatever their order? */
const has = (tag: string | undefined, ...attributes: string[]): boolean =>
  tag !== undefined && attributes.every((attribute) => tag.includes(attribute));

const buttons = (html: string): string[] =>
  [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/gu)].map(
    (match) => match[1] ?? "",
  );

describe("the chooser page (AC-77)", () => {
  it("is a page: main, one h1 that labels the form, no dialog", async () => {
    const html = await render({ kind: "ask" });
    expect(html).toMatch(/^<main[^>]*id="main"/u);
    expect(html.match(/<h1/gu)).toHaveLength(1);
    expect(html).toContain(
      '<h1 id="ch-l" class="display mb-[16px] block text-[32px] leading-[1.05] [font-variation-settings:var(--font-variation-display)] md:mb-[22px] md:text-[48px]">Where should the flowers go?</h1>',
    );
    const [form] = tags(html, "form");
    expect(tags(html, "form")).toHaveLength(1);
    expect(
      has(
        form,
        'action="/api/choose/en/product/vistula-red"',
        'method="get"',
        'aria-labelledby="ch-l"',
        'data-fo-choose=""',
      ),
    ).toBe(true);
    expect(html).not.toMatch(/role="dialog"|aria-modal|<dialog/u);
  });

  it("draws the shop countries as `to` buttons in the one order, then Show prices", async () => {
    const html = await render({ kind: "ask" });
    expect(buttons(html)).toEqual([
      "France",
      "Germany",
      "Italy",
      "Netherlands",
      "Poland",
      "Romania",
      "Show prices",
    ]);
    expect(
      tags(html, "button")
        .filter((tag) => has(tag, 'type="submit"', 'name="to"'))
        .map((tag) => /value="([^"]*)"/u.exec(tag)?.[1]),
    ).toEqual(["fr", "de", "it", "nl", "pl", "ro"]);
  });

  it("has the search field last, over a datalist of every registry country", async () => {
    const html = await render({ kind: "ask" });
    expect(html).toMatch(
      /<label class="sr-only" for="ch-to">Search all countries<\/label>/u,
    );
    const inputs = tags(html, "input");
    expect(inputs).toHaveLength(1);
    expect(
      has(
        inputs[0],
        'id="ch-to"',
        'type="search"',
        'name="to"',
        'list="fo-countries"',
        'placeholder="Search all countries"',
      ),
    ).toBe(true);
    expect(
      [...html.matchAll(/<option value="([^"]+)"/gu)].map((match) => match[1]),
    ).toEqual([
      "France",
      "Germany",
      "Italy",
      "Netherlands",
      "Poland",
      "Romania",
      "Spain",
    ]);
    // The field is the last `to` in the form: the decision reads the last non-empty value.
    const named = [...tags(html, "button"), ...inputs]
      .filter((tag) => tag.includes('name="to"'))
      .sort((left, right) => html.indexOf(left) - html.indexOf(right));
    expect(named.at(-1)).toBe(inputs[0]);
  });

  it("shows the remember line (AC-90)", async () => {
    expect(await render({ kind: "ask" })).toContain(
      "We will remember this country on this device. Change it any time under Sending to.",
    );
  });

  it("leads with Continue to the remembered country, and Show prices steps down", async () => {
    const html = await render({ kind: "ask" }, "fr");
    expect(buttons(html)[0]).toBe("Continue to France");
    const [first] = tags(html, "button");
    expect(
      has(
        first,
        'name="to"',
        'value="fr"',
        "min-h-[50px]",
        "bg-accent",
        'data-fo-choose-continue="fr"',
      ),
    ).toBe(true);
    const showPrices = tags(html, "button").at(-1);
    expect(has(showPrices, "shadow-[inset_0_0_0_1.5px_var(--color-ink)]")).toBe(
      true,
    );
    expect(has(showPrices, "bg-accent")).toBe(false);
    expect(buttons(await render({ kind: "ask" }))[0]).toBe("France");
  });

  it("shows what was typed, the closest names and every shop country on a no match", async () => {
    const html = await render({
      kind: "noMatch",
      query: "Swedn",
      closest: ["ES"],
    });
    expect(html).toContain('value="Swedn"');
    expect(html).toContain("<b>We could not find “Swedn”.</b>");
    expect(html).toContain(
      '<span>Did you mean <a class="link" href="/en/choose-country/es/product/vistula-red" rel="nofollow" data-fo-choose-closest="es">Spain</a>?</span>',
    );
    expect(html).toContain('role="status"');
    expect(html).toContain(
      '<h2 id="ch-all" class="eyebrow mb-[8px]">Every country we send to</h2>',
    );
    expect(
      [
        ...html.matchAll(
          /<a [^>]*href="([^"]+)" rel="nofollow" data-fo-choose-country="[a-z]{2}">([^<]+)<\/a>/gu,
        ),
      ].map((match) => `${match[2] ?? ""} ${match[1] ?? ""}`),
    ).toEqual([
      "Germany /en/choose-country/de/product/vistula-red",
      "Netherlands /en/choose-country/nl/product/vistula-red",
      "Poland /en/choose-country/pl/product/vistula-red",
      "France /en/choose-country/fr/product/vistula-red",
      "Italy /en/choose-country/it/product/vistula-red",
      "Spain /en/choose-country/es/product/vistula-red",
      "Romania /en/choose-country/ro/product/vistula-red",
    ]);
    expect(html).toContain("Central Europe");
  });

  it("joins several closest names in the locale's list grammar", async () => {
    const html = await render({
      kind: "noMatch",
      query: "x",
      closest: ["FR", "PL", "RO"],
    });
    expect(html).toMatch(
      /Did you mean <a [^>]*>France<\/a>, <a [^>]*>Poland<\/a>,? or <a [^>]*>Romania<\/a>\?/u,
    );
  });

  it("shows no price, no product card and no error line when it asks", async () => {
    const html = await render({ kind: "ask" });
    expect(html).not.toMatch(
      /€|£|\$|PLN|zł|<article|data-fo-choose-no-match|ch-all/u,
    );
  });
});
