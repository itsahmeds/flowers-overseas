/**
 * `/admin/countries` and `/admin/countries/[iso2]` without a database (spec 012b §2.8, §5.3,
 * AC-25, AC-24's slice A clause, §14 A-orchestrator-2026-10-20a; T-25's screen half; TASK-300).
 * The reads are fixtures, the session a role, and each page is rendered to HTML.
 *
 *  - The fiscal form shows exactly the null inputs (both, only the supply model, none), and never
 *    another operations input: the operations and corridor flags are text only.
 *  - Go live only on a demo country whose check is clear, with the typed-code field; Back to demo
 *    on a live one; neither control for `ops`, who reads "Only an admin can change the status."
 *  - A typed code that did not match re-opens the dialog with the refusal.
 *  - Both actions answer 403 to `ops` before any command runs.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CountryDetailView,
  CountryListRow,
} from "../../src/modules/admin/countries.ts";
import type { PreflightReason } from "../../src/modules/geo/go-live.ts";

vi.stubEnv("__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS", "true");

type Role = "admin" | "ops" | "finance" | "content";

const data = vi.hoisted(() => ({
  roles: ["admin"] as Role[],
  detail: undefined as unknown,
  rows: [] as unknown[],
  commands: 0,
}));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers()),
  cookies: () => Promise.resolve({ get: () => undefined }),
}));

vi.mock("@/modules/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/admin")>();
  const session = () =>
    Promise.resolve({
      userId: "11111111-1111-4111-8111-111111111111",
      displayName: "Founder Test",
      roles: data.roles,
      timeZone: "Europe/Tallinn",
    });
  return {
    ...actual,
    requireAdminPage: (
      permission?: Parameters<typeof actual.requireAdminPage>[0],
    ) => actual.requireAdminPage(permission, { session }),
    requirePermission: (
      permission: Parameters<typeof actual.requirePermission>[0],
    ) => actual.requirePermission(permission, { session }),
    adminRequestId: () => Promise.resolve("request-1"),
    countryDetail: () => Promise.resolve(data.detail),
    listCountries: () => Promise.resolve(data.rows),
    setCountryStatus: () => {
      data.commands += 1;
      return Promise.resolve({ ok: false, reason: "invalid" });
    },
    setGoLiveFiscalFields: () => {
      data.commands += 1;
      return Promise.resolve({ ok: false, reason: "invalid", fields: [] });
    },
    defaultCountryStatusDeps: () => Promise.resolve({}),
    defaultFiscalFieldsDeps: () => Promise.resolve({}),
  };
});

const { default: ListPage } =
  await import("../../src/app/admin/(signed-in)/countries/page.tsx");
const { default: DetailPage } =
  await import("../../src/app/admin/(signed-in)/countries/[iso2]/page.tsx");
const actions =
  await import("../../src/app/admin/(signed-in)/countries/[iso2]/actions.ts");

function preflight(reasons: readonly PreflightReason[], saleable = 6) {
  return {
    iso2: "PL",
    reasons: [...reasons],
    realFlorists: 1,
    saleableProducts: saleable,
    productFloor: 6,
  };
}

function detail(over: Partial<CountryDetailView> = {}): CountryDetailView {
  return {
    iso2: "PL",
    status: "demo",
    firstLiveAt: null,
    guidePublished: true,
    realFlorists: 1,
    pricedProducts: 90,
    saleableProducts: 6,
    preflight: preflight([]),
    vatRateBp: 800,
    supplyModel: "principal",
    ianaZone: "Europe/Warsaw",
    sameDayCutoffLocal: "14:00",
    deliveryDays: [1, 2, 3, 4, 5, 6],
    sundayDelivery: "none",
    florists: [
      {
        code: "pl-real-1",
        legalName: "Kwiaciarnia Testowa",
        cityLabel: "Kraków",
        status: "active",
        products: 6,
      },
      {
        code: "demo-pl-1",
        legalName: "Demo Warszawa 1",
        cityLabel: "Warszawa",
        status: "demo",
        products: 84,
      },
    ],
    ...over,
  };
}

async function render(query: Record<string, string> = {}): Promise<string> {
  return renderToStaticMarkup(
    await DetailPage({
      params: Promise.resolve({ iso2: "PL" }),
      searchParams: Promise.resolve(query),
    }),
  );
}

/** The `name` of every form control in `html`, hidden ones included. */
function controlNames(html: string): string[] {
  return [
    ...html.matchAll(/<(?:input|textarea|select)\b[^>]*\bname="([^"]+)"/gu),
  ]
    .map((match) => match[1] ?? "")
    .sort();
}

async function digestOf(fn: () => unknown): Promise<string> {
  try {
    await fn();
    return "no error";
  } catch (error) {
    return typeof error === "object" && error !== null && "digest" in error
      ? String((error as { digest: unknown }).digest)
      : String(error);
  }
}

beforeEach(() => {
  data.roles = ["admin"];
  data.commands = 0;
  data.detail = detail();
});

describe("T-25: the fiscal inputs follow the stored nulls", () => {
  it("both null: the VAT and supply inputs and the reason, and no other operations input", async () => {
    data.detail = detail({
      vatRateBp: null,
      supplyModel: null,
      preflight: preflight(["vatRateMissing", "supplyModelMissing"]),
    });
    const html = await render();
    expect(controlNames(html)).toEqual([
      "iso2",
      "reason",
      "supplyModel",
      "supplyModel",
      "vatRateBp",
    ]);
    expect(html).toContain("VAT rate and supply model set: neither is set");
  });

  it("only the supply model null (Poland at 800 bp): no VAT input", async () => {
    data.detail = detail({
      supplyModel: null,
      preflight: preflight(["supplyModelMissing"]),
    });
    const html = await render();
    expect(controlNames(html)).toEqual([
      "iso2",
      "reason",
      "supplyModel",
      "supplyModel",
    ]);
    expect(html).toContain(
      "VAT rate and supply model set: the supply model is not set",
    );
  });

  it("both set: neither input, no reason field, and the facts are text", async () => {
    data.detail = detail({ preflight: preflight(["noRealFlorist"]) });
    const html = await render();
    expect(controlNames(html)).toEqual([]);
    expect(html).toContain("8.00%");
    expect(html).toContain("14:00, Warsaw time");
    expect(html).toContain("Monday to Saturday");
    expect(html).toContain("Principal");
  });
});

describe("T-25: the flip controls", () => {
  it("a demo country with an unmet condition has no Go live", async () => {
    data.detail = detail({
      preflight: preflight(["tooFewSaleableProducts"], 4),
    });
    const html = await render();
    expect(html).not.toContain("Go live in Poland");
    expect(html).toContain("At least 6 products can be bought here: 4 of 6");
    expect(controlNames(html)).toEqual([]);
  });

  it("a ready demo country offers Go live behind the typed code", async () => {
    const html = await render();
    expect(html).toContain("Go live in Poland");
    expect(html).toContain("Type PL to confirm");
    expect(controlNames(html)).toEqual(["confirmCode", "from", "iso2", "to"]);
    expect(html).toContain('name="to" value="live"');
    expect(html).not.toContain("Back to demo");
  });

  it("a code that did not match re-opens the dialog with the refusal", async () => {
    const html = await render({ result: "mismatch" });
    expect(html).toContain("That is not PL. Nothing changed.");
    expect(html).toContain('aria-invalid="true"');
  });

  it("a live country: the read-only check, Back to demo, no disabled", async () => {
    data.detail = detail({
      status: "live",
      firstLiveAt: new Date("2026-10-20T09:40:00Z"),
      preflight: preflight(["noRealFlorist", "tooFewSaleableProducts"], 0),
    });
    const html = await render();
    expect(html).toContain("Still true?");
    expect(html).toContain("No real florist covers Poland");
    expect(html).toContain("Back to demo");
    expect(html).toContain('name="to" value="demo"');
    expect(html).not.toContain('value="disabled"');
    expect(html).not.toContain("Go live in Poland");
    expect(html).toContain("Disabled is not offered for a live country");
  });

  it("ops reads the check with no control and the reason", async () => {
    data.roles = ["ops"];
    data.detail = detail({
      supplyModel: null,
      preflight: preflight(["supplyModelMissing"]),
    });
    const html = await render();
    expect(html).toContain("Only an admin can change the status.");
    expect(html).not.toContain("Go live in Poland");
    expect(controlNames(html)).toEqual([]);
  });

  it("the demo florists are listed and never count", async () => {
    const html = await render();
    expect(html).toContain("Kwiaciarnia Testowa");
    expect(html).toContain("never counts");
  });
});

describe("the list", () => {
  it("one row per country with its go-live check", async () => {
    const row = (
      iso2: string,
      status: CountryListRow["status"],
      reasons: PreflightReason[],
    ): CountryListRow => ({
      iso2,
      status,
      firstLiveAt: null,
      guidePublished: true,
      realFlorists: 0,
      pricedProducts: 84,
      saleableProducts: 0,
      preflight: { ...preflight(reasons), iso2 },
    });
    data.rows = [
      row("DE", "demo", ["operationsIncomplete", "noRealFlorist"]),
      row("PL", "demo", []),
      row("NL", "live", ["noRealFlorist"]),
    ];
    const html = renderToStaticMarkup(await ListPage());
    expect(html).toContain('href="/admin/countries/DE"');
    expect(html).toContain("2 to fix");
    expect(html).toContain("Ready");
    expect(html).toContain("1 no longer holds");
    expect(controlNames(html)).toEqual([]);
  });
});

describe("the actions answer 403 to ops before any command", () => {
  const FORBIDDEN = "NEXT_HTTP_ERROR_FALLBACK;403";

  it.each(["flipCountryStatusAction", "saveFiscalFieldsAction"] as const)(
    "%s",
    async (name) => {
      data.roles = ["ops"];
      const form = new FormData();
      form.set("iso2", "PL");
      expect(await digestOf(() => actions[name](form))).toBe(FORBIDDEN);
      expect(data.commands).toBe(0);
    },
  );
});
