/**
 * Spec 010's checkout primitives, rendered (spec 010 §5.3; **AC-14** component half, **T-14**
 * component half, **AC-39** component half; TASK-201; `docs/design/wireframes/
 * checkout-{desktop,mobile}.dc.html`).
 *
 * Rendered with `react-dom/server`, the HTML a buyer without JavaScript receives. Each assertion
 * names the one value it is about (CLAUDE.md DoD §4): the id the link targets, the amount
 * `formatMoney` printed, the attribute that takes focus.
 *
 * The A17 guard at the end: no file under `src/modules/ui/checkout/` names a `checkout.*` or
 * `confirmation.*` key or imports `next-intl` (spec 003 §14 A17 clause 2, check 11, which lands
 * with TASK-224).
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MoneySchema, formatMoney } from "../../src/modules/i18n";
import {
  ConfirmationRecap,
  DemoBanner,
  ErrorSummary,
  InlinePrivacyNotice,
  OrderSummaryPanel,
  PlaceOrderButton,
  PriceChangedNotice,
  RadioChipGroup,
  SampleDetailsButton,
  SelectField,
  StepProgress,
  StickyTotalBar,
  SubmitButton,
  TextAreaWithCounter,
  TextField,
} from "../../src/modules/ui/checkout";

const html = (node: ReactElement): string => renderToStaticMarkup(node);
const gbp = (amountMinor: number) =>
  MoneySchema.parse({ amountMinor, currency: "GBP" });
const pln = (amountMinor: number) =>
  MoneySchema.parse({ amountMinor, currency: "PLN" });

/** The opening tag of the element with `id`. */
function tagWithId(markup: string, id: string): string {
  const match = new RegExp(`<[a-z]+[^>]*\\sid="${id}"[^>]*>`).exec(markup);
  if (match === null) throw new Error(`no element with id ${id}`);
  return match[0];
}

function attribute(tag: string, name: string): string | undefined {
  // React writes `autoComplete` and `inputMode` in camelCase; HTML attribute names are
  // case-insensitive, so the browser reads them as `autocomplete` and `inputmode`.
  return new RegExp(`\\s${name}="([^"]*)"`, "i").exec(tag)?.[1];
}

describe("ErrorSummary (AC-14)", () => {
  const items = [
    {
      fieldId: "recipient-name",
      text: "Recipient's name: Please fill this in to continue.",
    },
    {
      fieldId: "recipient-postcode",
      text: "Postcode: Please enter it in the form 00-001.",
    },
  ];
  const markup = html(
    <ErrorSummary
      id="errors"
      items={items}
      title="Please check these details"
    />,
  );
  const summary = tagWithId(markup, "errors");

  it("takes focus without JavaScript: focusable and autofocused", () => {
    expect(attribute(summary, "tabindex")).toBe("-1");
    expect(summary).toMatch(/\sautofocus=""/);
  });

  it("is announced and named by its title", () => {
    expect(attribute(summary, "role")).toBe("alert");
    expect(attribute(summary, "aria-labelledby")).toBe("errors-title");
    expect(tagWithId(markup, "errors-title")).toMatch(/^<h2/);
  });

  it("links each item to its field, in order, with the item's text", () => {
    const links = [
      ...markup.matchAll(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g),
    ];
    expect(links.map((link) => link[1])).toEqual([
      "#recipient-name",
      "#recipient-postcode",
    ]);
    expect(links[0]?.[2]).toBe(
      "Recipient&#x27;s name: Please fill this in to continue.",
    );
  });

  it("renders nothing with no errors", () => {
    expect(html(<ErrorSummary items={[]} title="x" />)).toBe("");
  });

  it("does not autofocus in the gallery's static state", () => {
    const still = html(
      <ErrorSummary focusOnMount={false} id="still" items={items} title="t" />,
    );
    expect(tagWithId(still, "still")).not.toMatch(/autofocus/);
  });
});

describe("TextField (AC-14, §5.3 form quality)", () => {
  const errored = html(
    <TextField
      autoComplete="address-line1"
      defaultValue="Przykładowa"
      error="Please fill this in to continue."
      hint="Street, then number."
      id="street"
      label="Street and number"
      name="street"
      required
    />,
  );
  const input = tagWithId(errored, "street");

  it("ties the error and the hint by aria-describedby, error first", () => {
    expect(attribute(input, "aria-describedby")).toBe(
      "street-error street-hint",
    );
    expect(tagWithId(errored, "street-error")).not.toMatch(/\shidden/);
    expect(errored).toContain(
      '<span data-fo-error-text="">Please fill this in to continue.</span>',
    );
  });

  it("keeps the value the buyer typed", () => {
    expect(attribute(input, "value")).toBe("Przykładowa");
  });

  it("marks the error in text and with a mark, not by colour alone", () => {
    expect(attribute(input, "aria-invalid")).toBe("true");
    const error = tagWithId(errored, "street-error");
    expect(attribute(error, "data-fo-error")).toBe("server");
    expect(errored).toContain("before:content-[&#x27;!&#x27;]");
  });

  it("carries the visible label, autocomplete, 16 px type and a 50 px box", () => {
    expect(errored).toContain(
      '<label class="text-sm font-bold text-ink" for="street">',
    );
    expect(attribute(input, "autocomplete")).toBe("address-line1");
    expect(attribute(input, "class")).toMatch(/(^|\s)text-ui(\s|$)/);
    expect(attribute(input, "class")).toMatch(/min-h-\[50px\]/);
  });

  it("renders a hidden, empty error slot and no aria-invalid when valid", () => {
    const valid = html(<TextField id="name" label="Name" name="name" />);
    expect(tagWithId(valid, "name-error")).toMatch(/\shidden=""/);
    expect(tagWithId(valid, "name")).not.toMatch(/aria-invalid/);
    expect(attribute(tagWithId(valid, "name"), "aria-describedby")).toBe(
      "name-error",
    );
  });

  it("ties a warning too, and keeps inputmode tel for phones", () => {
    const phone = html(
      <TextField
        id="phone"
        inputMode="tel"
        label="Phone"
        name="phone"
        type="tel"
        warning="This does not look like a phone number in Poland."
      />,
    );
    const tag = tagWithId(phone, "phone");
    expect(attribute(tag, "aria-describedby")).toBe(
      "phone-error phone-warning",
    );
    expect(attribute(tag, "inputmode")).toBe("tel");
    expect(phone).toContain("before:content-[&#x27;i&#x27;]");
  });

  it("puts the on-blur messages on the control for the island", () => {
    const live = html(
      <TextField
        clientMessages={{ required: "Fill it", format: "Like 00-001" }}
        id="pc"
        label="Postcode"
        name="pc"
        pattern="\d{2}-\d{3}"
        required
      />,
    );
    const tag = tagWithId(live, "pc");
    expect(attribute(tag, "data-fo-msg-required")).toBe("Fill it");
    expect(attribute(tag, "data-fo-msg-format")).toBe("Like 00-001");
    expect(tag).toMatch(/\srequired=""/);
  });

  it("shows the optional label only on an optional field", () => {
    expect(
      html(
        <TextField id="o" label="Phone" name="o" optionalLabel="optional" />,
      ),
    ).toContain(">optional</span>");
    expect(
      html(
        <TextField
          id="r"
          label="Phone"
          name="r"
          optionalLabel="optional"
          required
        />,
      ),
    ).not.toContain("optional");
  });
});

describe("SelectField and RadioChipGroup", () => {
  it("keeps the chosen country and ties its error", () => {
    const markup = html(
      <SelectField
        defaultValue="de"
        error="Please choose a country from the list."
        id="country"
        label="Country you live in"
        name="country"
        options={[
          { value: "pl", label: "Poland" },
          { value: "de", label: "Germany" },
        ]}
      />,
    );
    expect(markup).toContain('<option value="de" selected="">Germany</option>');
    expect(attribute(tagWithId(markup, "country"), "aria-describedby")).toBe(
      "country-error",
    );
  });

  it("renders real radios in a fieldset with the default checked", () => {
    const markup = html(
      <RadioChipGroup
        defaultValue="hospital"
        id="place"
        legend="Where is it going?"
        name="placeKind"
        options={[
          { value: "home", label: "A home" },
          { value: "hospital", label: "A hospital" },
        ]}
      />,
    );
    expect(markup).toMatch(/^<fieldset/);
    expect(markup).toContain("<legend");
    const checked = [...markup.matchAll(/<input[^>]*checked=""[^>]*>/g)];
    expect(checked).toHaveLength(1);
    expect(attribute(checked[0]?.[0] ?? "", "value")).toBe("hospital");
  });
});

describe("TextAreaWithCounter", () => {
  const props = {
    counterTemplate: "{count} of 200 characters",
    id: "card",
    label: "Card message",
    max: 200,
    name: "cardMessage",
  } as const;

  it("draws the server's count and ties the counter", () => {
    const markup = html(
      <TextAreaWithCounter
        {...props}
        count={20}
        defaultValue="Happy birthday Mama!"
        formattedCount="20"
      />,
    );
    expect(tagWithId(markup, "card-count")).toMatch(/data-over="false"/);
    expect(markup).toContain(">20 of 200 characters</p>");
    expect(attribute(tagWithId(markup, "card"), "aria-describedby")).toBe(
      "card-error card-count",
    );
    expect(markup).toContain(">Happy birthday Mama!</textarea>");
  });

  it("flags a count over the limit", () => {
    const markup = html(
      <TextAreaWithCounter
        {...props}
        count={205}
        defaultValue="x"
        formattedCount="205"
      />,
    );
    expect(tagWithId(markup, "card-count")).toMatch(/data-over="true"/);
  });

  it("isolates the card and the signature in the preview", () => {
    const markup = html(
      <TextAreaWithCounter
        {...props}
        count={5}
        defaultValue="Hello"
        formattedCount="5"
        preview={{
          label: "Preview of the printed card",
          printed: "Printed on our card · included",
          signature: "Love, Anna",
          signatureFieldId: "sign",
        }}
      />,
    );
    expect(markup).toContain('<bdi data-fo-mirror="card">Hello</bdi>');
    expect(markup).toContain('<bdi data-fo-mirror="sign">Love, Anna</bdi>');
    expect(markup).toContain("Printed on our card · included</figcaption>");
  });
});

describe("StepProgress", () => {
  const markup = html(
    <StepProgress
      compactLabel="Step 2 of 3 · Card and you"
      current={1}
      label="Checkout steps"
      locale="en"
      steps={[
        { id: "recipient", name: "Recipient", href: "?step=recipient" },
        { id: "card", name: "Card and you" },
        { id: "review", name: "Check" },
      ]}
    />,
  );

  it("is a labelled list with one current step", () => {
    expect(markup).toContain('<ol aria-label="Checkout steps"');
    const current = [
      ...markup.matchAll(/aria-current="step"[^>]*data-fo-step="([a-z]+)"/g),
    ];
    expect(current.map((match) => match[1])).toEqual(["card"]);
  });

  it("links the completed step and only that one", () => {
    const links = [...markup.matchAll(/<a[^>]*href="([^"]*)"/g)].map(
      (m) => m[1],
    );
    expect(links).toEqual(["?step=recipient"]);
  });
});

describe("OrderSummaryPanel: price shown = price charged", () => {
  const markup = html(
    <OrderSummaryPanel
      card={{ message: "Happy birthday Mama!", signature: "Love, Anna" }}
      currencyLine="You pay in GBP. Our florist is paid in złoty."
      id="sum"
      includedLabel="included"
      item={{ name: "Amber Hour", details: ["18 stems"] }}
      lines={[
        {
          id: "bouquet",
          label: "18 stems",
          amount: { kind: "money", money: gbp(4590) },
        },
        { id: "delivery", label: "Delivery", amount: { kind: "included" } },
      ]}
      locale="en-gb"
      title="Your order"
      total={gbp(4590)}
      totalLabel="You pay"
      vatLines={[{ id: "vat-800", label: "Of which VAT 8%", money: gbp(340) }]}
    />,
  );

  it("prints the quote's total through formatMoney in a polite live region", () => {
    const total =
      /<div aria-atomic="true" aria-live="polite"[^>]*data-fo-total=""[^>]*>(.*?)<\/div>/.exec(
        markup,
      );
    expect(total?.[1]).toContain(
      `>${formatMoney(gbp(4590), "en-gb")}</strong>`,
    );
  });

  it("shows the VAT inside the total and the currency line", () => {
    expect(markup).toContain(`>${formatMoney(gbp(340), "en-gb")}</dd>`);
    expect(markup).toContain(
      ">You pay in GBP. Our florist is paid in złoty.</p>",
    );
    expect(markup).toMatch(
      /data-fo-line="delivery"[^>]*><dt[^>]*>Delivery<\/dt><dd[^>]*>included<\/dd>/,
    );
  });

  it("isolates the product name and the card", () => {
    expect(markup).toContain("<bdi>Amber Hour</bdi>");
    expect(markup).toContain(
      "<bdi>Happy birthday Mama!</bdi> <bdi>Love, Anna</bdi>",
    );
  });

  it("formats in the page's locale, not the currency's", () => {
    const pl = html(
      <OrderSummaryPanel
        includedLabel="w cenie"
        item={{ name: "Amber Hour", details: [] }}
        lines={[]}
        locale="pl"
        title="Twoje zamówienie"
        total={pln(22900)}
        totalLabel="Płacisz"
      />,
    );
    expect(pl).toContain(`>${formatMoney(pln(22900), "pl")}</strong>`);
  });
});

describe("StickyTotalBar (AC-39 component half)", () => {
  const markup = html(
    <StickyTotalBar
      action={
        <SubmitButton form="step-1">Continue to your details</SubmitButton>
      }
      locale="en-gb"
      total={gbp(4590)}
      totalLabel="You pay"
    />,
  );
  const bar =
    /<div[^>]*data-fo-sticky-total=""[^>]*>.*$/.exec(markup)?.[0] ?? "";

  it("carries the total through formatMoney", () => {
    expect(bar).toContain(`>${formatMoney(gbp(4590), "en-gb")}</strong>`);
    expect(bar).toContain(">You pay</small>");
  });

  it("carries the step's primary action, submitting the step's form", () => {
    const button = /<button[^>]*>/.exec(bar)?.[0] ?? "";
    expect(attribute(button, "form")).toBe("step-1");
    expect(attribute(button, "type")).toBe("submit");
    expect(bar).toContain(">Continue to your details</button>");
  });

  it("is fixed to the bottom below lg, hidden from lg, with a spacer in the flow", () => {
    const tag =
      /<div[^>]*data-fo-sticky-total=""[^>]*>/.exec(markup)?.[0] ?? "";
    expect(tag).toMatch(/\bfixed\b/);
    expect(tag).toMatch(/\bbottom-0\b/);
    expect(tag).toMatch(/\blg:hidden\b/);
    expect(markup).toMatch(
      /^<div aria-hidden="true" class="h-\[76px\] lg:hidden"><\/div>/,
    );
  });

  it("is not a second live region", () => {
    expect(bar).not.toContain("aria-live");
  });
});

describe("notices, banner and buttons", () => {
  it("names both prices, formatted, and confirms at the new one", () => {
    const seen: string[] = [];
    const markup = html(
      <PriceChangedNotice
        confirmLabel={(current) => `Continue at ${current}`}
        current={gbp(4620)}
        locale="en-gb"
        message={({ previous, current }) => {
          seen.push(previous, current);
          return `${previous} to ${current}`;
        }}
        previous={gbp(4590)}
      />,
    );
    expect(seen).toEqual([
      formatMoney(gbp(4590), "en-gb"),
      formatMoney(gbp(4620), "en-gb"),
    ]);
    expect(markup).toMatch(/role="alert"/);
    const confirm = /<button[^>]*>/.exec(markup)?.[0] ?? "";
    expect(attribute(confirm, "name")).toBe("confirmedTotalMinor");
    expect(attribute(confirm, "value")).toBe("4620");
    expect(markup).toContain(
      `>Continue at ${formatMoney(gbp(4620), "en-gb")}</button>`,
    );
  });

  it("the demo banner has no control and is a note", () => {
    const markup = html(
      <DemoBanner body="Nothing is charged." title="This is a demo order." />,
    );
    expect(markup).not.toMatch(/<button|<a\s/);
    expect(markup).toMatch(/role="note"/);
    expect(markup).toContain("<strong");
  });

  it("the sample-details button is a submit with its intent", () => {
    const markup = html(
      <InlinePrivacyNotice
        action={<SampleDetailsButton label="Use sample details" />}
        message="Please use sample details."
      />,
    );
    const button = /<button[^>]*>/.exec(markup)?.[0] ?? "";
    expect(attribute(button, "name")).toBe("intent");
    expect(attribute(button, "value")).toBe("sample");
    expect(attribute(button, "type")).toBe("submit");
    expect(markup).toContain(">Use sample details</button>");
  });

  it("the place button shows its label, and the pending label when pending", () => {
    const idle = html(
      <PlaceOrderButton
        label="Place demo order. Nothing is charged."
        pendingLabel="Placing your demo order…"
      />,
    );
    expect(idle).toContain(">Place demo order. Nothing is charged.</span>");
    expect(idle).not.toContain("aria-disabled");
    const busy = html(
      <PlaceOrderButton
        forcePending
        label="Place demo order. Nothing is charged."
        pendingLabel="Placing your demo order…"
      />,
    );
    expect(busy).toContain(
      '<span aria-live="polite">Placing your demo order…</span>',
    );
    expect(busy).toMatch(/aria-disabled="true"/);
    expect(busy).toMatch(/type="submit"/);
  });
});

describe("ConfirmationRecap", () => {
  it("isolates the recipient and the card, and prints the total", () => {
    const markup = html(
      <ConfirmationRecap
        card={{ message: "Happy birthday Mama!", signature: "Love, Anna" }}
        date="8 October"
        item={{ name: "Amber Hour", details: ["18 stems"] }}
        labels={{ recipient: "Recipient", date: "Date", card: "Card" }}
        locale="en-gb"
        note="Nothing was charged."
        recipient={{
          name: "Anna Przykładowa",
          address: "ul. Marszałkowska 10/5, 00-001 Warszawa",
        }}
        title="Your order"
        total={gbp(4590)}
        totalLabel="You pay"
      />,
    );
    expect(markup).toContain(
      "<bdi>Anna Przykładowa</bdi><br/><bdi>ul. Marszałkowska 10/5, 00-001 Warszawa</bdi>",
    );
    expect(markup).toContain(`>${formatMoney(gbp(4590), "en-gb")}</strong>`);
    expect(markup).not.toMatch(/@|\+48/);
  });
});

describe("spec 003 A17: the primitives name no checkout key", () => {
  const dir = fileURLToPath(
    new URL("../../src/modules/ui/checkout/", import.meta.url),
  );
  for (const file of readdirSync(dir)) {
    it(`${file} names no checkout or confirmation key and imports no next-intl`, () => {
      const source = readFileSync(`${dir}${file}`, "utf8");
      // The usage scan of `i18n:check` (and A17's check 11) matches a fully-qualified key
      // anywhere in a file, comments included, so none may appear here.
      expect(source).not.toMatch(/\b(checkout|confirmation)\.[a-z]\w*\.\w/);
      expect(source).not.toMatch(/from "next-intl/);
    });
  }
});
