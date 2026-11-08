/**
 * Spec 047 at checkout, the parts that need no database (§10 T-10 unit half, T-13 pure half,
 * T-21 scan half, T-22 component half, T-24, T-25 scan half, T-27 unit half, T-31; AC-10, AC-13,
 * AC-21, AC-22, AC-24, AC-25, AC-27, AC-31; TASK-447).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const warnings = vi.hoisted(() => [] as { signal: string; fields: unknown }[]);

vi.mock("../../src/lib/sentry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/sentry")>();
  return {
    ...actual,
    captureWarning: (signal: string, fields: unknown) => {
      warnings.push({ signal, fields });
    },
  };
});

import { relayMatches } from "../../src/config/honesty.ts";
import {
  discountAppliedEvent,
  discountRejectedEvent,
  purchaseCouponParams,
} from "../../src/modules/analytics/index.ts";
import {
  afterFailure,
  type AttemptState,
  lockState,
  noteSiteFailure,
  resetSiteFailures,
} from "../../src/modules/discounts/attempts.ts";
import { MoneySchema } from "../../src/modules/i18n/index.ts";
import {
  DISCOUNT_REFUSAL_KEYS,
  discountRefusalMessage,
} from "../../src/app/[locale]/(checkout)/_views/discount-messages.ts";
import {
  DiscountCodeField,
  type DiscountFieldState,
  codeSlot,
  withCodes,
} from "../../src/modules/ui/checkout/DiscountCodeField.tsx";
import { OrderSummaryPanel } from "../../src/modules/ui/checkout/OrderSummaryPanel.tsx";
import { ConfirmationRecap } from "../../src/modules/ui/checkout/ConfirmationRecap.tsx";

const ROOT = resolve(import.meta.dirname, "../..");
const T0 = new Date("2026-11-08T10:00:00.000Z");
const minutes = (n: number) => new Date(T0.getTime() + n * 60_000);
const CODE_ID = "3f2c6c56-7a8e-4d3b-9b1e-0b7a4f3c2d10";
const PLN = (amountMinor: number) =>
  MoneySchema.parse({ amountMinor, currency: "PLN" });

/* -------------------------------------------------------------------------- */
/* AC-13: the per-checkout lock and the site alert                             */
/* -------------------------------------------------------------------------- */

describe("the per-checkout guessing lock (AC-13, T-13 pure half)", () => {
  const fresh: AttemptState = {
    failedAttempts: 0,
    windowStartedAt: null,
    lockedUntil: null,
  };
  const fail = (times: number, step = 1): AttemptState => {
    let state = fresh;
    for (let n = 0; n < times; n += 1)
      state = afterFailure(state, minutes(n * step));
    return state;
  };

  it("locks on the fifth failure within 15 minutes, for 15 minutes", () => {
    const four = fail(4);
    expect(lockState(four, minutes(4))).toEqual({ locked: false, minutes: 0 });
    const five = afterFailure(four, minutes(4));
    expect(five.lockedUntil?.toISOString()).toBe(minutes(19).toISOString());
    expect(lockState(five, minutes(4))).toEqual({ locked: true, minutes: 15 });
    expect(lockState(five, minutes(18.5))).toEqual({
      locked: true,
      minutes: 1,
    });
  });

  it("opens again after 15 minutes, with the count started again", () => {
    const five = fail(5);
    expect(lockState(five, minutes(19)).locked).toBe(false);
    expect(five.failedAttempts).toBe(0);
    expect(afterFailure(five, minutes(19)).failedAttempts).toBe(1);
  });

  it("starts a new window when 15 minutes pass between failures", () => {
    // Four failures four minutes apart span 12 minutes; the fifth at 16 minutes is a new window.
    const four = fail(4, 4);
    expect(four.failedAttempts).toBe(4);
    const late = afterFailure(four, minutes(16));
    expect(late.failedAttempts).toBe(1);
    expect(late.lockedUntil).toBeNull();
  });
});

describe("the site-wide alert (AC-13)", () => {
  beforeEach(() => {
    warnings.length = 0;
    resetSiteFailures();
  });

  it("raises exactly one `discounts.guessing` warning for 101 failures in 10 minutes", () => {
    for (let n = 0; n < 100; n += 1) noteSiteFailure(minutes(n * 0.05));
    expect(warnings).toHaveLength(0);
    noteSiteFailure(minutes(6));
    expect(warnings.map((entry) => entry.signal)).toEqual([
      "discounts.guessing",
    ]);
    for (let n = 0; n < 50; n += 1) noteSiteFailure(minutes(7));
    expect(warnings).toHaveLength(1);
    expect(JSON.stringify(warnings[0]?.fields)).not.toMatch(/code"|email/u);
  });

  it("does not alert when the failures are spread over more than 10 minutes", () => {
    for (let n = 0; n < 101; n += 1) noteSiteFailure(minutes(n * 0.11));
    expect(warnings).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* AC-10, AC-27: the refusal messages                                          */
/* -------------------------------------------------------------------------- */

describe("each refusal renders its own key with its arguments (AC-10, T-10 unit half)", () => {
  const country = (iso: string) => `country:${iso}`;

  it("maps the ten reasons onto ten distinct keys", () => {
    const keys = Object.values(DISCOUNT_REFUSAL_KEYS);
    expect(keys).toHaveLength(10);
    expect(new Set(keys).size).toBe(10);
  });

  it("fills each argument in the page's locale", () => {
    expect(
      discountRefusalMessage(
        { reason: "not_started", startsAt: "2026-11-02T00:00:00.000Z" },
        "en-gb",
        country,
      ),
    ).toEqual({
      key: "checkout.discount.error.notStarted",
      values: { date: "Monday 2 November" },
    });
    expect(
      discountRefusalMessage(
        { reason: "wrong_destination", countryIso: "DE" },
        "en-gb",
        country,
      ),
    ).toEqual({
      key: "checkout.discount.error.wrongDestination",
      values: { country: "country:DE" },
    });
    expect(
      discountRefusalMessage(
        { reason: "wrong_currency", currency: "EUR" },
        "en-gb",
        country,
      ),
    ).toEqual({
      key: "checkout.discount.error.wrongCurrency",
      values: { currency: "Euro" },
    });
    expect(
      discountRefusalMessage(
        { reason: "below_minimum", currency: "GBP", minimumMinor: 5000 },
        "en-gb",
        country,
      ),
    ).toEqual({
      key: "checkout.discount.error.belowMinimum",
      values: { amount: "£50.00" },
    });
    expect(
      discountRefusalMessage(
        { reason: "locked", minutes: 15 },
        "en-gb",
        country,
      ),
    ).toEqual({
      key: "checkout.discount.error.locked",
      values: { minutes: 15 },
    });
  });

  it("draws an unknown and a disabled code as the same bytes", () => {
    // `evaluateCode` answers `unknown` for both (TASK-445); the control draws the reason only.
    const draw = (value: string) =>
      renderToStaticMarkup(
        <DiscountCodeField
          action={async () => {}}
          applyFields={null}
          labels={LABELS}
          removeFields={null}
          state={{
            kind: "refused",
            value,
            message: "This code does not work.",
          }}
        />,
      );
    const message = (html: string) =>
      /<p[^>]*data-fo-discount-message="refused"[^>]*>.*?<\/p>/u.exec(
        html,
      )?.[0];
    expect(message(draw("NOSUCHCODE"))).toBe(message(draw("DISABLED10")));
    expect(message(draw("NOSUCHCODE"))).toBeDefined();
  });
});

/* -------------------------------------------------------------------------- */
/* AC-22, AC-27, AC-28: the control's markup                                   */
/* -------------------------------------------------------------------------- */

const LABELS = {
  open: "Add a discount code",
  label: "Discount code",
  apply: "Apply",
  remove: "Remove",
};

function controlElement(state: DiscountFieldState): ReactElement {
  return (
    <DiscountCodeField
      action={async () => {}}
      applyFields={<input name="intent" type="hidden" value="discount" />}
      labels={LABELS}
      removeFields={
        <input name="intent" type="hidden" value="discountRemove" />
      }
      state={state}
    />
  );
}

function control(state: DiscountFieldState): string {
  return renderToStaticMarkup(controlElement(state));
}

describe("the control's states (AC-7 render half, AC-28 markup)", () => {
  it("is a closed <details> with a form, no island and no open box by default", () => {
    const html = control({ kind: "closed" });
    expect(html).toMatch(/^<details[^>]*data-fo-discount-control="closed"/u);
    expect(html).not.toMatch(/<details[^>]* open/u);
    expect(html).toContain("<summary");
    expect(html).toMatch(/<form[^>]*>/u);
    expect(html).toMatch(/name="code"/u);
    expect(html).not.toMatch(/role="alert"/u);
  });

  it("keeps the typed value, marks the field and links the message when refused", () => {
    const html = control({
      kind: "refused",
      value: "POLONA10",
      message: "This code does not work.",
    });
    expect(html).toMatch(/<details[^>]* open=""/u);
    expect(html).toMatch(/value="POLONA10"/u);
    expect(html).toMatch(/aria-invalid="true"/u);
    expect(html).toMatch(/aria-describedby="co-discount-message"/u);
    expect(html).toMatch(/id="co-discount-message"[^>]*role="alert"/u);
  });

  it("follows the form-quality rules (§5.3)", () => {
    const html = control({ kind: "closed" });
    expect(html).toMatch(/<label[^>]*for="co-discount-input"/u);
    expect(html).toMatch(/autoComplete="off"|autocomplete="off"/u);
    expect(html).toMatch(
      /autoCapitalize="characters"|autocapitalize="characters"/u,
    );
    expect(html).toMatch(/spellCheck="false"|spellcheck="false"/u);
    expect(html).toMatch(/inputMode="text"|inputmode="text"/u);
  });

  it("disables the field and the button while locked", () => {
    const html = control({
      kind: "locked",
      value: "POLONIA1O",
      message: "Too many tries. Please wait 15 minutes and try again.",
    });
    expect(html.match(/disabled=""/gu)).toHaveLength(2);
    expect(html).toContain("Too many tries.");
  });

  it("shows the applied message with Remove in its own form, the code in <bdi dir=ltr>", () => {
    const html = control({
      kind: "applied",
      message: withCodes(
        `Code ${codeSlot("code")} applied. You save zł 4.59.`,
        { code: "POLONIA10" },
      ),
    });
    expect(html).toMatch(/<bdi[^>]*dir="ltr"[^>]*>POLONIA10<\/bdi>/u);
    expect(html).toContain(">Remove</button>");
    expect(html).toContain('value="discountRemove"');
    expect(html).not.toContain('name="code"');
  });
});

describe("no reduction claim on any discount element (AC-22, T-22 component half)", () => {
  const panel = renderToStaticMarkup(
    <OrderSummaryPanel
      discountControl={controlElement({ kind: "closed" })}
      discountLine={{
        label: withCodes(`Discount (${codeSlot("code")})`, {
          code: "POLONIA10",
        }),
        amount: PLN(459),
      }}
      includedLabel="included"
      item={{ name: "Amber Hour", details: [] }}
      lines={[
        {
          id: "l0",
          label: "18 stems",
          amount: { kind: "money", money: PLN(4590) },
        },
      ]}
      locale="en-gb"
      title="Your order"
      total={PLN(4131)}
      totalLabel="You pay"
    />,
  );
  const recap = renderToStaticMarkup(
    <ConfirmationRecap
      date="Thursday 8 October"
      discountLine={{
        label: withCodes(`Discount (${codeSlot("code")})`, {
          code: "POLONIA10",
        }),
        amount: PLN(459),
      }}
      item={{ name: "Amber Hour", details: [] }}
      labels={{ recipient: "Recipient", date: "Date", card: "Card" }}
      locale="en-gb"
      recipient={{ name: "Anna", address: "Warszawa" }}
      title="Your order"
      total={PLN(4131)}
      totalLabel="You pay"
    />,
  );

  for (const [name, html] of [
    ["summary panel", panel],
    ["confirmation recap", recap],
  ] as const) {
    it(`the ${name} has no <s>, no <del>, no line-through and no percentage in the discount line`, () => {
      expect(html).not.toMatch(/<s[\s>]|<del[\s>]|line-through/u);
      const line = /<[^>]+data-fo-discount-line=""[^>]*>.*?<\/(?:div|p)>/u.exec(
        html,
      )?.[0];
      expect(line).toBeDefined();
      expect(line).not.toContain("%");
      expect(line).toMatch(/<bdi[^>]*dir="ltr"[^>]*>POLONIA10<\/bdi>/u);
      // The amount taken off, negative, through `formatMoney`: 459 grosz.
      expect(line).toMatch(/-PLN\s4\.59/u);
    });
  }

  it("the panel's total is the discounted one", () => {
    expect(panel).toMatch(/data-fo-total=""[^>]*>.*PLN\s41\.31/u);
  });
});

/* -------------------------------------------------------------------------- */
/* AC-24: analytics payloads                                                   */
/* -------------------------------------------------------------------------- */

describe("the analytics payload builders (AC-24, T-24)", () => {
  const code = { id: CODE_ID, campaignLabel: "Polish Saturday school, Ealing" };

  it("carries the label and the id, never the code, and nothing for demo or test", () => {
    const applied = discountAppliedEvent({ mode: "live", code });
    expect(applied).toEqual({
      event: "discount_code_applied",
      params: {
        discount_code_id: CODE_ID,
        campaign_label: "Polish Saturday school, Ealing",
      },
    });
    const rejected = discountRejectedEvent({
      mode: "live",
      reason: "ended",
      code,
    });
    expect(rejected?.params).toEqual({
      reason: "ended",
      discount_code_id: CODE_ID,
      campaign_label: "Polish Saturday school, Ealing",
    });
    expect(
      discountRejectedEvent({ mode: "live", reason: "unknown", code: null })
        ?.params,
    ).toEqual({ reason: "unknown" });
    expect(
      purchaseCouponParams({ mode: "live", code, discount: PLN(459) }),
    ).toEqual({
      coupon: "Polish Saturday school, Ealing",
      discount: "4.59",
      currency: "PLN",
    });
    for (const mode of ["demo", "test"] as const) {
      expect(discountAppliedEvent({ mode, code })).toBeNull();
      expect(discountRejectedEvent({ mode, reason: "ended", code })).toBeNull();
      expect(
        purchaseCouponParams({ mode, code, discount: PLN(459) }),
      ).toBeNull();
    }
  });

  it("has no field a code string could travel in (strict schemas)", async () => {
    const { DiscountAppliedEventSchema } =
      await import("../../src/modules/analytics/index.ts");
    expect(
      DiscountAppliedEventSchema.safeParse({
        event: "discount_code_applied",
        params: {
          discount_code_id: CODE_ID,
          campaign_label: "x",
          code: "POLONIA10",
        },
      }).success,
    ).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* AC-27, AC-31: the keys                                                      */
/* -------------------------------------------------------------------------- */

type Tree = { readonly [key: string]: string | Tree };

function flat(tree: Tree, prefix = ""): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string"
      ? [[`${prefix}${key}`, value] as [string, string]]
      : flat(value, `${prefix}${key}.`),
  );
}

function discountKeys(locale: string): [string, string][] {
  const messages = JSON.parse(
    readFileSync(join(ROOT, "messages", `${locale}.json`), "utf8"),
  ) as { checkout: { discount?: Tree } };
  return flat(messages.checkout.discount ?? {}, "checkout.discount.");
}

describe("the `checkout.discount.*` keys (AC-27, AC-31, T-27, T-31)", () => {
  const SPEC_KEYS = [
    "checkout.discount.open",
    "checkout.discount.label",
    "checkout.discount.apply",
    "checkout.discount.remove",
    "checkout.discount.applied",
    "checkout.discount.line",
    "checkout.discount.replaced",
    "checkout.discount.error.unknown",
    "checkout.discount.error.notStarted",
    "checkout.discount.error.ended",
    "checkout.discount.error.wrongDestination",
    "checkout.discount.error.wrongProduct",
    "checkout.discount.error.wrongCurrency",
    "checkout.discount.error.belowMinimum",
    "checkout.discount.error.usedUp",
    "checkout.discount.error.alreadyUsed",
    "checkout.discount.error.locked",
    "checkout.discount.changedAtPlacement",
  ];

  it("has every key of §7 in en, with drafts in de and pl", () => {
    for (const locale of ["en", "de", "pl"]) {
      expect(
        discountKeys(locale)
          .map(([key]) => key)
          .sort(),
      ).toEqual([...SPEC_KEYS].sort());
    }
    expect(
      Object.fromEntries(discountKeys("en"))["checkout.discount.line"],
    ).toBe("Discount ({code})");
  });

  it("names no florist, partner or fulfilment, carries no dash and no percentage", () => {
    for (const locale of ["en", "en-gb", "de", "pl"]) {
      const source = locale === "en-gb" ? "en" : locale;
      for (const [key, value] of discountKeys(source)) {
        expect(relayMatches(value, locale), `${locale}/${key}`).toEqual([]);
        expect(value, key).not.toMatch(/[\u2013\u2014%]/u);
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* AC-21, AC-25: source scans                                                  */
/* -------------------------------------------------------------------------- */

function filesUnder(directory: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(directory);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return filesUnder(path);
    return /\.(ts|tsx)$/u.test(name) ? [path] : [];
  });
}

const rel = (path: string) => relative(ROOT, path).split("\\").join("/");
const SOURCE = filesUnder(join(ROOT, "src"));

describe("no cached page reads a code, and no URL carries one (AC-21, AC-25 scan halves)", () => {
  const cached = SOURCE.filter((path) =>
    /src\/(modules\/(catalog|geo|seo|shop|corridors?|listing|feeds?)\/|app\/\[locale\]\/\((shop|site|corridor|catalog)[^/]*\)\/|app\/(sitemap|robots|feeds?)[^/]*)/u.test(
      rel(path),
    ),
  );

  it("finds the shop, product, listing, corridor, sitemap and feed code to scan", () => {
    expect(cached.length).toBeGreaterThan(20);
  });

  it("none of it imports the discounts module, the control or the discount line", () => {
    const offenders = cached.filter((path) =>
      /modules\/discounts|DiscountCodeField|discountLine|order_discount/u.test(
        readFileSync(path, "utf8"),
      ),
    );
    expect(offenders.map(rel)).toEqual([]);
  });

  it("no page or route reads `code`, `promo`, `coupon` or `discount` from a query string", () => {
    const offenders = SOURCE.filter((path) =>
      /searchParams\.get\(\s*["'](code|promo|coupon|discount)["']|query\[["'](code|promo|coupon|discount)["']\]/u.test(
        readFileSync(path, "utf8"),
      ),
    ).map(rel);
    // The admin sign-in callback reads Auth.js's own `code`; no buyer route does.
    expect(
      offenders.filter((path) => !path.startsWith("src/app/admin/")),
    ).toEqual([]);
    const page = readFileSync(
      join(ROOT, "src/app/[locale]/(checkout)/checkout/page.tsx"),
      "utf8",
    );
    expect(page).toMatch(
      /CheckoutQuerySchema = z\.object\(\{ step: one, line: one \}\)/u,
    );
  });
});
