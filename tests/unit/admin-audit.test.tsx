/**
 * `/admin/audit` and the audit module's pure parts (spec 012 §2.3, §5.2 `AuditFilterSchema`,
 * §5.3 `/admin/audit` "filters · masked value · empty", AC-11, AC-13; TASK-218).
 *
 *  - `auditDiff` turns a stored mask into a `masked` cell and never into a value, and a view row
 *    (no before, no after) into no rows;
 *  - `parseAuditFilter` keeps what parses and drops the rest, so a hand-edited URL shows the log;
 *  - the page renders the filtered log: the time in the viewer's zone, the channel, the action and
 *    entity, "None" for no reason; one row expanded to its diff where a masked value reads
 *    "changed" on both sides and the stored mask never reaches the HTML; a view row has no link
 *    and says "No values"; the empty state; the 390 filters' count.
 *
 * The data layer is replaced (no database in the unit project); `tests/integration/audit-trail.
 * test.ts` proves the rows themselves.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditEntry, AuditFilter } from "../../src/modules/admin/audit.ts";
import {
  AUDIT_MASK,
  auditDiff,
  parseAuditFilter,
  shortEntityId,
  zoneCity,
} from "../../src/modules/admin/audit.ts";

const data = vi.hoisted(() => ({
  entries: [] as AuditEntry[],
  calls: [] as { filter: AuditFilter; timeZone: string }[],
}));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers()),
  cookies: () => Promise.resolve({ get: () => undefined }),
}));

vi.mock("@/modules/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/admin")>();
  return {
    ...actual,
    requireAdminPage: (permission: string) => {
      if (permission !== "audit.read")
        throw new Error(`asked for ${permission}`);
      return Promise.resolve({
        userId: "11111111-1111-4111-8111-111111111111",
        displayName: "Founder Test",
        roles: ["admin"],
        timeZone: "Europe/Tallinn",
      });
    },
    adminRequestId: () => Promise.resolve("request-1"),
    listAuditEntries: (
      _actor: unknown,
      filter: AuditFilter,
      timeZone: string,
    ) => {
      data.calls.push({ filter, timeZone });
      return Promise.resolve(data.entries);
    },
    auditFilterOptions: () =>
      Promise.resolve({
        actors: [
          {
            userId: "11111111-1111-4111-8111-111111111111",
            name: "Founder Test",
          },
        ],
        actions: ["order.viewed", "partner.update"],
      }),
  };
});

const PARTNER = "3f2a9c1e-5b7d-4e2a-9c1e-5b7d4e2a9c1e";
const ORDER = "7c4d2a10-1111-4222-8333-944455556666";
const UPDATE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VIEW_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CLI_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function entries(): AuditEntry[] {
  return [
    {
      id: UPDATE_ID,
      at: new Date("2026-10-05T09:02:00Z"),
      actorUserId: "11111111-1111-4111-8111-111111111111",
      actorLabel: "Founder Test",
      channel: "admin",
      action: "partner.update",
      entityTable: "fulfillment_partner",
      entityId: PARTNER,
      reason: null,
      before: { contact_email: AUDIT_MASK, capacity_per_day: 6 },
      after: { contact_email: AUDIT_MASK, capacity_per_day: 8 },
    },
    {
      id: VIEW_ID,
      at: new Date("2026-10-05T08:41:00Z"),
      actorUserId: "11111111-1111-4111-8111-111111111111",
      actorLabel: "Founder Test",
      channel: "admin",
      action: "order.viewed",
      entityTable: "order",
      entityId: ORDER,
      reason: null,
      before: null,
      after: null,
    },
    {
      id: CLI_ID,
      at: new Date("2026-10-04T18:03:00Z"),
      actorUserId: null,
      actorLabel: "cli:admin-grant",
      channel: "cli",
      action: "users.grant",
      entityTable: "user_role",
      entityId: `${PARTNER}:admin`,
      reason: "Bootstrap",
      before: null,
      after: { role: "admin" },
    },
  ];
}

async function render(params: Record<string, string> = {}): Promise<string> {
  const { default: AdminAuditPage } =
    await import("../../src/app/admin/(signed-in)/audit/page.tsx");
  return renderToStaticMarkup(
    await AdminAuditPage({ searchParams: Promise.resolve(params) }),
  );
}

beforeEach(() => {
  data.entries = entries();
  data.calls.length = 0;
});

describe("auditDiff (AC-11)", () => {
  it("reads the mask as masked on both sides and a plain value as text", () => {
    expect(
      auditDiff(
        { contact_email: AUDIT_MASK, capacity_per_day: 6, note: null },
        { contact_email: AUDIT_MASK, capacity_per_day: 8, note: "x" },
      ),
    ).toEqual([
      {
        column: "contact_email",
        before: { kind: "masked" },
        after: { kind: "masked" },
      },
      {
        column: "capacity_per_day",
        before: { kind: "value", text: "6" },
        after: { kind: "value", text: "8" },
      },
      {
        column: "note",
        before: { kind: "value", text: "" },
        after: { kind: "value", text: "x" },
      },
    ]);
  });

  it("names every column of an insert or a delete once, and gives a view row no rows", () => {
    expect(auditDiff(null, { a: 1 })).toEqual([
      {
        column: "a",
        before: { kind: "none" },
        after: { kind: "value", text: "1" },
      },
    ]);
    expect(auditDiff({ b: true }, null)).toEqual([
      {
        column: "b",
        before: { kind: "value", text: "true" },
        after: { kind: "none" },
      },
    ]);
    expect(auditDiff(null, null)).toEqual([]);
  });
});

describe("parseAuditFilter (§5.2 AuditFilterSchema)", () => {
  it("keeps every filter that parses", () => {
    expect(
      parseAuditFilter({
        entity: "fulfillment_partner",
        actor: "11111111-1111-4111-8111-111111111111",
        action: "partner.update",
        from: "2026-10-01",
        to: "2026-10-05",
        open: UPDATE_ID,
      }),
    ).toEqual({
      entity: "fulfillment_partner",
      actor: "11111111-1111-4111-8111-111111111111",
      action: "partner.update",
      from: "2026-10-01",
      to: "2026-10-05",
      open: UPDATE_ID,
    });
  });

  it("drops what does not parse, one field at a time, and reads the first of a repeated key", () => {
    expect(
      parseAuditFilter({
        entity: "users",
        actor: "someone",
        action: "DROP TABLE",
        from: "1 Oct",
        to: "2026-13-40",
        open: "x",
      }),
    ).toEqual({});
    expect(
      parseAuditFilter({ entity: ["order", "country"], actor: "" }),
    ).toEqual({
      entity: "order",
    });
  });
});

describe("the entity column and the zone header", () => {
  it("shortens each uuid of an id and leaves other ids whole", () => {
    expect(shortEntityId(PARTNER)).toBe("3f2a…");
    expect(shortEntityId(`${PARTNER}:2027-02-14`)).toBe("3f2a…:2027-02-14");
    expect(shortEntityId("checkout.open")).toBe("checkout.open");
  });

  it("names the zone's city", () => {
    expect(zoneCity("Europe/Tallinn")).toBe("Tallinn");
    expect(zoneCity("America/Argentina/Buenos_Aires")).toBe("Buenos Aires");
  });
});

describe("/admin/audit", () => {
  it("asks for audit.read and passes the parsed filters and the viewer's zone to the read", async () => {
    await render({ entity: "order", from: "2026-10-01", actor: "nope" });
    expect(data.calls).toEqual([
      {
        filter: { entity: "order", from: "2026-10-01" },
        timeZone: "Europe/Tallinn",
      },
    ]);
  });

  it("renders the log: time in the viewer's zone, who, channel, action, entity and reason", async () => {
    const html = await render();
    expect(html).toContain("Audit log");
    expect(html).toContain("Time (Tallinn)");
    expect(html).toContain("5 Oct, 12:02");
    expect(html).toContain('<code class="text-[13px]">partner.update</code>');
    expect(html).toContain("fulfillment_partner");
    expect(html).toContain(`title="${PARTNER}"`);
    expect(html).toContain("3f2a…");
    expect(html).toContain("cli:admin-grant");
    expect(html).toContain("Bootstrap");
    expect(html).toMatch(/bg-ink text-paper[^"]*">cli</u);
    expect(html).toContain("None");
  });

  it("expands one row: a masked value reads 'changed' on both sides, the mask never reaches the HTML", async () => {
    const closed = await render();
    expect(closed).not.toContain("Hide changes");
    expect(closed).toContain(`href="/admin/audit?open=${UPDATE_ID}"`);

    const html = await render({
      open: UPDATE_ID,
      entity: "fulfillment_partner",
    });
    expect(html).toContain("Hide changes");
    expect(html).toContain('href="/admin/audit?entity=fulfillment_partner"');
    const changed =
      html.match(/<span class="text-ink-2 italic">changed<\/span>/gu) ?? [];
    // Both sides, in the table and in the 390 card.
    expect(changed).toHaveLength(4);
    expect(html).not.toContain(AUDIT_MASK);
    expect(html).toContain("capacity_per_day");
  });

  it("gives a view row no link and no values, even when its id is asked to open", async () => {
    const html = await render({ open: VIEW_ID });
    expect(html).toContain("No values");
    expect(html).not.toContain(`open=${VIEW_ID}`);
    expect(html).not.toContain("Hide changes");
  });

  it("shows the empty state and counts the active filters on the 390 disclosure", async () => {
    data.entries = [];
    const html = await render({
      entity: "order",
      action: "order.viewed",
      from: "2026-10-01",
      to: "2026-10-05",
    });
    expect(html).toContain("No entries match these filters");
    expect(html).toContain("Filters (3)");
    expect(html).not.toContain("<table");
  });
});
