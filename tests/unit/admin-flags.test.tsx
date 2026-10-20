/**
 * `/admin/flags` and its action (spec 012 §2.4, §5.3 `/admin/flags` "two flags by scope ·
 * high-risk confirmation · orphaned key", AC-14 page half; TASK-220).
 *
 *  - the page asks for `flags.toggle`, lists the registry keys by scope — a switch per destination
 *    for `checkout.open`, each a form posting the opposite value with the row's version — and the
 *    orphaned keys with no control at all;
 *  - the high-risk switch opens the typed-key confirmation: a field named `confirmKey`, an
 *    always-enabled confirm button, the key in `<code>` in the title;
 *  - every destination and every high-risk key has its words in the admin catalogue;
 *  - the outcome in the query string is a toast or a refusal; anything else shows nothing;
 *  - the action calls `requirePermission("flags.toggle")` first, hands the session's roles to
 *    `toggleFlag` and redirects with the outcome, the key and the scope reference only.
 *
 * The data layer is replaced (no database in the unit project); `tests/integration/admin-flags.
 * test.ts` proves the commands on the migrated tables.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COUNTRIES } from "../../src/config/countries.ts";
import { FEATURE_FLAGS } from "../../src/config/feature-flags.ts";
import type {
  FlagsView,
  FlagToggleResult,
  RegisteredFlagView,
} from "../../src/modules/admin/flags.ts";
import { adminNavFor } from "../../src/modules/admin/nav.ts";

const data = vi.hoisted(() => ({
  view: { registered: [], orphans: [] } as FlagsView,
  asked: [] as string[],
  toggles: [] as { actor: unknown; input: unknown }[],
  result: { ok: false, reason: "invalid" } as FlagToggleResult,
}));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers()),
  cookies: () => Promise.resolve({ get: () => undefined }),
}));

vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return {
    ...actual,
    redirect: (url: string) => {
      throw new Error(`REDIRECT ${url}`);
    },
  };
});

const SESSION = {
  userId: "11111111-1111-4111-8111-111111111111",
  displayName: "Founder Test",
  roles: ["admin"],
  timeZone: "Europe/Tallinn",
};

vi.mock("@/modules/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/admin")>();
  return {
    ...actual,
    requireAdminPage: (permission: string) => {
      data.asked.push(`page:${permission}`);
      return Promise.resolve(SESSION);
    },
    requirePermission: (permission: string) => {
      data.asked.push(`action:${permission}`);
      return Promise.resolve(SESSION);
    },
    adminRequestId: () => Promise.resolve("request-1"),
    listFlags: () => Promise.resolve(data.view),
    toggleFlag: (actor: unknown, input: unknown) => {
      data.toggles.push({ actor, input });
      return Promise.resolve(data.result);
    },
  };
});

const VERSION = "2026-10-20T10:00:00.000Z";

function seededView(): FlagsView {
  return {
    registered: [
      {
        key: "checkout.open",
        risk: "standard",
        scopeKinds: ["country"],
        seeded: true,
        values: COUNTRIES.map((country) => ({
          scope: { kind: "country" as const, ref: country.iso2 },
          enabled: country.iso2 === "PL",
          version: country.iso2 === "PL" ? VERSION : "none",
        })),
      },
      {
        key: "checkout.demo_guard",
        risk: "high",
        scopeKinds: ["global"],
        seeded: true,
        values: [
          {
            scope: { kind: "global", ref: "*" },
            enabled: true,
            version: "none",
          },
        ],
      },
    ],
    orphans: [
      { key: "checkout.legacy_banner", enabled: true, scopeKinds: ["global"] },
    ],
  };
}

async function render(
  search: Record<string, string> = {},
  view: FlagsView = seededView(),
): Promise<string> {
  data.view = view;
  const { default: Page } =
    await import("../../src/app/admin/(signed-in)/flags/page.tsx");
  return renderToStaticMarkup(
    await Page({ searchParams: Promise.resolve(search) }),
  );
}

/** The desktop table's markup only (the 390 cards repeat every control). */
function desktop(html: string): string {
  const start = html.indexOf("<table");
  return html.slice(start, html.indexOf("</table>", start));
}

/** Every `<form>…</form>` of `html`. */
function forms(html: string): string[] {
  return html.match(/<form[\s\S]*?<\/form>/gu) ?? [];
}

function hidden(form: string, name: string): string | undefined {
  return new RegExp(`name="${name}" value="([^"]*)"`, "u").exec(form)?.[1];
}

beforeEach(() => {
  data.asked = [];
  data.toggles = [];
});

describe("/admin/flags — two flags by scope", () => {
  it("asks for flags.toggle", async () => {
    await render();
    expect(data.asked).toEqual(["page:flags.toggle"]);
  });

  it("draws checkout.open with one switch per destination, each posting the opposite value and its version", async () => {
    const table = desktop(await render());
    const open = forms(table).filter(
      (form) => hidden(form, "key") === "checkout.open",
    );
    expect(open.map((form) => hidden(form, "scopeRef"))).toEqual(
      COUNTRIES.map((country) => country.iso2),
    );
    for (const form of open) {
      const ref = hidden(form, "scopeRef");
      expect(hidden(form, "scopeKind"), ref).toBe("country");
      expect(hidden(form, "enabled"), ref).toBe(ref === "PL" ? "off" : "on");
      expect(hidden(form, "version"), ref).toBe(
        ref === "PL" ? VERSION : "none",
      );
      expect(form, ref).toContain('role="switch"');
      expect(form, ref).toContain(`aria-checked="${String(ref === "PL")}"`);
      expect(form, ref).toContain('type="submit"');
      expect(form, ref).toContain(
        ref === "PL" ? ">On</button>" : ">Off</button>",
      );
    }
    // The switch is named by its destination and its state word.
    expect(table).toContain(">Poland</span>");
    expect(table).toMatch(
      /id="flag-d-checkout-open-PL"[^>]*>Poland<\/span>[\s\S]*?aria-labelledby="flag-d-checkout-open-PL flag-d-checkout-open-PL-switch"/u,
    );
  });

  it("draws the description, the scope and the risk of each registry key", async () => {
    const table = desktop(await render());
    expect(table).toContain("<code");
    expect(table).toContain(
      "Lets the product page&#x27;s demo button lead to the checkout, per country.",
    );
    expect(table).toContain(
      "Keeps every checkout in demo mode: nothing is charged.",
    );
    expect(table).toContain(">Country</td>");
    expect(table).toContain(">Global</td>");
    expect(table).toContain(">Normal</span>");
    expect(table).toContain(">High risk</span>");
  });

  it("names every configured destination from the admin catalogue", async () => {
    const table = desktop(await render());
    for (const country of COUNTRIES) {
      expect(table, country.iso2).not.toContain(
        `admin.flags.countries.${country.iso2}`,
      );
      expect(table, country.iso2).toContain(
        `id="flag-d-checkout-open-${country.iso2}">`,
      );
    }
  });

  it("draws a registered key with no database row without a control", async () => {
    const view = seededView();
    const open = view.registered[0] as RegisteredFlagView;
    const table = desktop(
      await render({}, { ...view, registered: [{ ...open, seeded: false }] }),
    );
    expect(table).toContain("Not in the database yet.");
    expect(forms(table)).toEqual([]);
    expect(table).not.toContain('role="switch"');
  });
});

describe("/admin/flags — the high-risk confirmation", () => {
  it("opens a dialog asking for the key typed, with the confirm button enabled", async () => {
    const table = desktop(await render());
    const [guard] = forms(table).filter(
      (form) => hidden(form, "key") === "checkout.demo_guard",
    );
    expect(guard).toBeDefined();
    expect(hidden(guard ?? "", "enabled")).toBe("off");
    expect(hidden(guard ?? "", "scopeKind")).toBe("global");
    expect(guard).toContain('name="confirmKey"');
    expect(guard).toContain(">Flag name</label>");
    expect(guard).toMatch(/<button type="submit"[^>]*>Turn off<\/button>/u);
    expect(guard).not.toContain("disabled");
    expect(table).toMatch(
      /<dialog[^>]*aria-labelledby="flag-d-checkout-demo_guard-[^"]*-title"/u,
    );
    expect(table).toContain("Turn off <code>checkout.demo_guard</code>?");
    expect(table).toContain(
      "Checkouts will stop being demonstrations wherever checkout is open.",
    );
    // The switch itself opens the dialog; it does not submit.
    expect(table).toMatch(
      /<button[^>]*id="flag-d-checkout-demo_guard-[^"]*-switch"[^>]*type="button"[^>]*role="switch"[^>]*aria-checked="true"/u,
    );
  });

  it("has a confirmation for every high-risk key in the registry", async () => {
    const high = FEATURE_FLAGS.filter((flag) => flag.risk === "high");
    expect(high.length).toBeGreaterThan(0);
    const view: FlagsView = {
      orphans: [],
      registered: high.map((flag) => ({
        key: flag.key as RegisteredFlagView["key"],
        risk: "high",
        scopeKinds: ["global"],
        seeded: true,
        values: [
          {
            scope: { kind: "global", ref: "*" },
            enabled: false,
            version: "none",
          },
        ],
      })),
    };
    const table = desktop(await render({}, view));
    for (const flag of high) {
      expect(table, flag.key).toContain(`Turn on <code>${flag.key}</code>?`);
      expect(table, flag.key).not.toContain("admin.flags.confirmBody");
    }
  });
});

describe("/admin/flags — orphaned key", () => {
  it("shows the key as orphaned, with its value in words and no control", async () => {
    const html = await render();
    const table = desktop(html);
    const row = table.slice(table.indexOf("checkout.legacy_banner"));
    expect(row).toContain(">Orphaned</span>");
    expect(row).toContain("Not in the registry. It cannot be changed here.");
    expect(row).toContain("On in the database");
    expect(row).not.toContain("<form");
    expect(row).not.toContain('role="switch"');
    for (const form of forms(html)) {
      expect(hidden(form, "key")).not.toBe("checkout.legacy_banner");
    }
  });
});

describe("/admin/flags — the outcome", () => {
  it("toasts an opened destination by name, politely", async () => {
    const html = await render({
      result: "on",
      key: "checkout.open",
      ref: "PL",
    });
    expect(html).toMatch(
      /<p role="status"[^>]*>Checkout opened for Poland\.<\/p>/u,
    );
  });

  it("toasts a closed destination and a global flag", async () => {
    expect(
      await render({ result: "off", key: "checkout.open", ref: "DE" }),
    ).toContain("Checkout closed for Germany.");
    expect(
      await render({ result: "off", key: "checkout.demo_guard", ref: "*" }),
    ).toContain("checkout.demo_guard is off.");
  });

  it.each([
    [
      "mismatch",
      "The name you typed does not match the flag. Nothing changed.",
    ],
    [
      "forbidden",
      "Only an admin can change a high-risk flag. Nothing changed.",
    ],
    ["unregistered", "That flag is not in the registry. Nothing changed."],
    ["conflict", "This flag changed since the page opened."],
  ])("refuses %s with its message, assertively", async (result, text) => {
    const html = await render({ result });
    expect(html).toMatch(new RegExp(`<p role="alert"[^>]*>${text}`, "u"));
  });

  it("shows nothing for an outcome it does not know, or a key outside the registry", async () => {
    const plain = await render();
    expect(await render({ result: "deleted" })).toBe(plain);
    expect(
      await render({ result: "on", key: "checkout.legacy_banner", ref: "*" }),
    ).toBe(plain);
  });
});

describe("the toggle action", () => {
  it("checks flags.toggle first, passes the session's roles and redirects with the outcome", async () => {
    const { toggleFlagAction } =
      await import("../../src/app/admin/(signed-in)/flags/actions.ts");
    data.result = {
      ok: true,
      key: "checkout.open",
      scope: { kind: "country", ref: "PL" },
      enabled: true,
      changed: true,
    };
    const form = new FormData();
    for (const [name, value] of Object.entries({
      key: "checkout.open",
      scopeKind: "country",
      scopeRef: "PL",
      enabled: "on",
      version: VERSION,
      $ACTION_ID_abc: "",
    })) {
      form.set(name, value);
    }
    await expect(toggleFlagAction(form)).rejects.toThrow(
      "REDIRECT /admin/flags?result=on&key=checkout.open&ref=PL",
    );
    expect(data.asked).toEqual(["action:flags.toggle"]);
    expect(data.toggles).toEqual([
      {
        actor: {
          userId: SESSION.userId,
          requestId: "request-1",
          roles: ["admin"],
        },
        input: {
          key: "checkout.open",
          scopeKind: "country",
          scopeRef: "PL",
          enabled: "on",
          version: VERSION,
        },
      },
    ]);
  });

  it("redirects a refusal with its reason only", async () => {
    const { toggleFlagAction } =
      await import("../../src/app/admin/(signed-in)/flags/actions.ts");
    data.result = { ok: false, reason: "mismatch" };
    await expect(toggleFlagAction(new FormData())).rejects.toThrow(
      /^REDIRECT \/admin\/flags\?result=mismatch$/u,
    );
    expect(data.toggles.at(-1)?.input).toBeUndefined();
  });
});

describe("the admin navigation", () => {
  it("shows Flags to an admin and to nobody else", () => {
    expect(adminNavFor(["admin"]).map((item) => item.key)).toContain("flags");
    for (const role of ["ops", "finance", "content"]) {
      expect(
        adminNavFor([role]).map((item) => item.key),
        role,
      ).not.toContain("flags");
    }
  });
});
