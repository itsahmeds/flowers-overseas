/**
 * Spec 030a's admin payout pages (§10 T-29, AC-29; TASK-367), without a database: the reads are
 * replaced by fixtures, the session by a role, and each page is rendered to HTML.
 *
 *  - Each page per role: no session goes to sign-in (the signed-in layout's rule, spec 012
 *    AC-1), `ops` and `content` get 403 before anything is read, `admin` and `finance` get the
 *    page. The admin document carries `noindex,nofollow` for every page under it.
 *  - A payout whose `sendStatement` would refuse has no "Send statement" button and says why, with
 *    the code; one that would send has the button (`sendRefusals`, in the command's order).
 *  - Amounts are `formatMoney`'s strings, in PLN, EUR and GBP; a zero and a negative total.
 *  - The export page: a partly paid export has no Cancel; a cancelled one has no control at all.
 *  - The Wise case: a sent statement without a recipient id gets no checkbox and the reason.
 *  - The outcome query string renders codes only and drops anything it did not earn.
 *  - `runPayoutCommand` turns a refusal (the module's, a trigger's, the Wise one) into its code
 *    and rethrows anything else.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { formatDate, formatMoney } from "../../src/modules/i18n/index.ts";
import type {
  ExportDetail,
  PayoutDetail,
  PayoutListRow,
  PayoutsOverview,
} from "../../src/modules/partners/payouts/admin-read.ts";
import { sendRefusals } from "../../src/modules/partners/payouts/admin-read.ts";
import {
  payoutRefusalCode,
  runPayoutCommand,
} from "../../src/modules/partners/payouts/admin-command.ts";
import { PayoutError } from "../../src/modules/partners/payouts/amount.ts";
import { WiseRecipientMissing } from "../../src/modules/partners/payouts/export.ts";
import { parsePayoutOutcome } from "../../src/app/admin/(signed-in)/payouts/outcome.ts";

vi.stubEnv("__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS", "true");

const USER = "11111111-1111-4111-8111-111111111111";
const P1 = "a1a1a1a1-1111-4111-8111-111111111111";
const P2 = "b2b2b2b2-2222-4222-8222-222222222222";
const P3 = "c3c3c3c3-3333-4333-8333-333333333333";
const X1 = "e5e5e5e5-5555-4555-8555-555555555555";
const ADJ = "d4d4d4d4-4444-4444-8444-444444444444";
const ORDER = "f6f6f6f6-6666-4666-8666-666666666666";

type Role = "admin" | "ops" | "finance" | "content";

const data = vi.hoisted(() => ({
  roles: ["admin"] as Role[],
  signedIn: true,
  reads: 0,
  overview: null as unknown,
  detail: null as unknown,
  export: null as unknown,
}));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers()),
  cookies: () => Promise.resolve({ get: () => undefined }),
}));

vi.mock("@/modules/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/admin")>();
  const session = () =>
    Promise.resolve(
      data.signedIn
        ? {
            userId: USER,
            displayName: "Founder Test",
            roles: data.roles,
            timeZone: "Europe/Tallinn",
          }
        : null,
    );
  return {
    ...actual,
    requireAdminPage: (
      permission?: Parameters<typeof actual.requireAdminPage>[0],
    ) => actual.requireAdminPage(permission, { session }),
    requirePermission: (
      permission: Parameters<typeof actual.requirePermission>[0],
    ) => actual.requirePermission(permission, { session }),
    adminRequestId: () => Promise.resolve("request-1"),
  };
});

vi.mock("@/modules/partners/payouts", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/modules/partners/payouts")>();
  return {
    ...actual,
    readPayouts: (_actor: unknown, read: (executor: unknown) => unknown) => {
      data.reads += 1;
      return Promise.resolve(read({}));
    },
    payoutsOverview: () => Promise.resolve(data.overview),
    payoutDetail: () => Promise.resolve(data.detail ?? undefined),
    exportDetail: () => Promise.resolve(data.export ?? undefined),
  };
});

const { default: ListPage } =
  await import("../../src/app/admin/(signed-in)/payouts/page.tsx");
const { default: DetailPage } =
  await import("../../src/app/admin/(signed-in)/payouts/[id]/page.tsx");
const { default: ExportPage } =
  await import("../../src/app/admin/(signed-in)/payouts/exports/[id]/page.tsx");
const { metadata: adminMetadata } =
  await import("../../src/app/admin/layout.tsx");

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

function row(overrides: Partial<PayoutListRow> = {}): PayoutListRow {
  const base: PayoutListRow = {
    id: P1,
    partnerId: "99999999-9999-4999-8999-999999999999",
    partnerCode: "pl-krk-pod-lipa",
    partnerName: "Kwiaciarnia pod Lipą",
    hasWiseRecipient: true,
    zone: "Europe/Warsaw",
    kind: "weekly",
    status: "draft",
    periodStart: "2026-10-19",
    periodEnd: "2026-10-25",
    closedAt: new Date("2026-10-25T23:30:00Z"),
    sentAt: null,
    paidAt: null,
    statementNumber: null,
    exportId: null,
    exportCreatedAt: null,
    currency: "PLN",
    totalMinor: 56600n,
    lineCount: 3,
    reviewCount: 0,
    blockingAdjustment: null,
    refusals: [],
  };
  const merged = { ...base, ...overrides };
  return {
    ...merged,
    refusals: sendRefusals({
      status: merged.status,
      kind: merged.kind,
      closed: merged.closedAt !== null,
      totalMinor: merged.totalMinor,
      reviewOpen: merged.reviewCount,
      adjustmentOpen: merged.blockingAdjustment !== null,
    }),
  };
}

function detail(overrides: Partial<PayoutListRow> = {}): PayoutDetail {
  return {
    ...row(overrides),
    lines: [
      {
        id: "77777777-7777-4777-8777-777777777771",
        kind: "order",
        orderId: ORDER,
        reference: "FO-7K2M-9QXA",
        deliveryDate: "2026-10-21",
        items: [{ productName: "Amber Hour", tierStems: 18, quantity: 1 }],
        amountMinor: 14900n,
        note: null,
        reviewOpen: (overrides.reviewCount ?? 0) > 0 ? "unpriced_lines" : null,
        settled: false,
      },
    ],
    prepaidRank: null,
    prepaidLimit: 5,
    sentByName: null,
    paidByName: null,
    emailStatus: null,
    hasPdf: false,
  };
}

function overview(parts: Partial<PayoutsOverview> = {}): PayoutsOverview {
  return {
    open: [],
    ready: [],
    sent: [],
    exported: [],
    paid: [],
    adjustments: [],
    waivers: [],
    ...parts,
  };
}

function exportOf(overrides: Partial<ExportDetail> = {}): ExportDetail {
  const payouts = overrides.payouts ?? [
    {
      id: P1,
      statementNumber: "P-000124",
      partnerCode: "pl-gdn-01",
      partnerName: "Kwiaty nad Motławą",
      wiseRecipientId: "48213077",
      currency: "PLN",
      totalMinor: 14900n,
      status: "statement_sent" as const,
      paidAt: null,
    },
    {
      id: P2,
      statementNumber: "P-000125",
      partnerCode: "pl-krk-pod-lipa",
      partnerName: "Kwiaciarnia pod Lipą",
      wiseRecipientId: "48213190",
      currency: "PLN",
      totalMinor: 123450n,
      status: "statement_sent" as const,
      paidAt: null,
    },
  ];
  return {
    id: X1,
    createdAt: new Date("2026-10-26T07:24:00Z"),
    cancelledAt: null,
    sourceCurrency: "EUR",
    createdByName: "Ahmad Hameed",
    cancelledByName: null,
    cancelledCount: null,
    totals: [{ currency: "PLN", totalMinor: 138350n }],
    ...overrides,
    payouts,
  };
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const digestOf = (error: unknown): string =>
  typeof error === "object" && error !== null && "digest" in error
    ? String((error as { digest: unknown }).digest)
    : `not a Next interrupt: ${String(error)}`;

async function thrown(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
  } catch (error) {
    return error;
  }
  return new Error("did not throw");
}

const search = (params: Record<string, string> = {}) => Promise.resolve(params);

async function renderList(
  params: Record<string, string> = {},
): Promise<string> {
  return renderToStaticMarkup(await ListPage({ searchParams: search(params) }));
}
async function renderDetail(
  params: Record<string, string> = {},
): Promise<string> {
  return renderToStaticMarkup(
    await DetailPage({
      params: Promise.resolve({ id: P1 }),
      searchParams: search(params),
    }),
  );
}
async function renderExport(
  params: Record<string, string> = {},
): Promise<string> {
  return renderToStaticMarkup(
    await ExportPage({
      params: Promise.resolve({ id: X1 }),
      searchParams: search(params),
    }),
  );
}

const PAGES = {
  "/admin/payouts": renderList,
  "/admin/payouts/[id]": renderDetail,
  "/admin/payouts/exports/[id]": renderExport,
} as const;

/** The text of the rendered HTML, entities decoded, so it can be compared with `formatMoney`. */
function text(html: string): string {
  return html
    .replace(/<[^>]+>/gu, " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&nbsp;", " ")
    .replace(/[ \t\n]+/gu, " ");
}

beforeEach(() => {
  data.roles = ["admin"];
  data.signedIn = true;
  data.reads = 0;
  data.overview = overview();
  data.detail = detail();
  data.export = exportOf();
});

/* -------------------------------------------------------------------------- */
/* T-29: the three pages per role                                             */
/* -------------------------------------------------------------------------- */

describe("T-29 (AC-29): the three pages per role", () => {
  for (const [path, render] of Object.entries(PAGES)) {
    it(`${path}: no session goes to sign-in, reading nothing`, async () => {
      data.signedIn = false;
      expect(digestOf(await thrown(() => render()))).toMatch(
        /^NEXT_REDIRECT;replace;\/admin\/sign-in;/u,
      );
      expect(data.reads).toBe(0);
    });

    for (const role of ["ops", "content"] as const) {
      it(`${path}: ${role} gets 403, reading nothing`, async () => {
        data.roles = [role];
        expect(digestOf(await thrown(() => render()))).toBe(
          "NEXT_HTTP_ERROR_FALLBACK;403",
        );
        expect(data.reads).toBe(0);
      });
    }

    for (const role of ["admin", "finance"] as const) {
      it(`${path}: ${role} gets the page`, async () => {
        data.roles = [role];
        const html = await render();
        expect(html).toContain("<h1");
        expect(data.reads).toBe(1);
      });
    }
  }

  it("every page sits under the admin document, whose robots meta is noindex,nofollow", () => {
    expect(adminMetadata.robots).toBe("noindex,nofollow");
  });

  it("an unknown payout or export is 404", async () => {
    data.detail = null;
    expect(digestOf(await thrown(() => renderDetail()))).toBe(
      "NEXT_HTTP_ERROR_FALLBACK;404",
    );
    data.export = null;
    expect(digestOf(await thrown(() => renderExport()))).toBe(
      "NEXT_HTTP_ERROR_FALLBACK;404",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* The send control: absent with the reason, or present                       */
/* -------------------------------------------------------------------------- */

describe("AC-29: a payout whose send would refuse shows the reason and no send button", () => {
  it("a closed payout with an open review: reason and code, no button", async () => {
    data.detail = detail({ reviewCount: 1 });
    const html = await renderDetail();
    expect(html).not.toContain("Send statement</button>");
    expect(text(html)).toContain(
      "1 line needs your review before this statement can go.",
    );
    expect(html).toContain("PAYOUT_REVIEW_OPEN");
    expect(text(html)).toContain("Review: add-on not priced");
    expect(html).toContain("Mark reviewed");
  });

  it("an open weekly payout: not closed, named with its Sunday and zone", async () => {
    data.detail = detail({
      closedAt: null,
      periodStart: "2026-10-26",
      periodEnd: "2026-11-01",
    });
    const html = await renderDetail();
    expect(html).not.toContain("Send statement</button>");
    const sunday = formatDate(
      new Date("2026-11-01T12:00:00Z"),
      "en",
      "deliveryDate",
      "UTC",
    );
    expect(text(html)).toContain(
      `This payout is still open. It closes after ${sunday} in Europe/Warsaw.`,
    );
    expect(html).toContain("PAYOUT_NOT_CLOSED");
  });

  it("a zero and a negative total: nothing to send, the amount through formatMoney", async () => {
    for (const totalMinor of [0n, -100n]) {
      data.detail = detail({ totalMinor });
      const html = text(await renderDetail());
      expect(html).not.toContain("Send statement Sending");
      expect(html).toContain(
        `The total is ${formatMoney({ amountMinor: totalMinor, currency: "PLN" }, "en")}, so there is nothing to send.`,
      );
      expect(html).toContain("PAYOUT_TOTAL_NOT_POSITIVE");
    }
  });

  it("an open adjustment holds a weekly statement, with its reference; never a prepaid one", async () => {
    const blockingAdjustment = {
      reference: "FO-5RTB-2KQM",
      createdAt: new Date("2026-10-23T16:05:00Z"),
    };
    data.detail = detail({ blockingAdjustment });
    let html = await renderDetail();
    expect(html).toContain("PAYOUT_ADJUSTMENT_OPEN");
    expect(text(html)).toContain(
      "An open adjustment for this florist (FO-5RTB-2KQM, created 23 October) must be settled or waived first.",
    );
    expect(html).not.toContain("Send statement</button>");
    data.detail = detail({ kind: "prepaid", blockingAdjustment: null });
    html = await renderDetail();
    expect(html).toContain("Send statement</button>");
  });

  it("a payout that would send has the button, and the list says so too", async () => {
    const html = await renderDetail();
    expect(html).toContain("Send statement</button>");
    expect(html).not.toContain('data-testid="send-refusals"');
    data.overview = overview({
      ready: [row(), row({ id: P2, reviewCount: 2 })],
    });
    const list = await renderList();
    // Desktop table and 390 card: one send per layout for P1, none for P2.
    expect(list.match(/Send statement<\/button>/gu)?.length).toBe(2);
    expect(text(list)).toContain("2 lines to review");
  });

  it("a sent statement has no send and no line controls", async () => {
    data.detail = detail({
      status: "statement_sent",
      statementNumber: "P-000127",
      sentAt: new Date("2026-10-26T07:20:00Z"),
    });
    const html = await renderDetail();
    expect(html).not.toContain("Send statement</button>");
    expect(html).not.toContain("Add a line");
    expect(html).toContain("P-000127");
    expect(text(html)).toContain("The PDF is made with the email.");
  });
});

describe("sendRefusals: sendStatement's checks, in its order", () => {
  const ready = {
    status: "draft",
    kind: "weekly",
    closed: true,
    totalMinor: 1n,
    reviewOpen: 0,
    adjustmentOpen: false,
  } as const;

  it("passes a closed draft above zero with nothing open", () => {
    expect(sendRefusals(ready)).toEqual([]);
  });
  it("names every reason that applies, in the command's order", () => {
    expect(
      sendRefusals({
        ...ready,
        closed: false,
        totalMinor: 0n,
        reviewOpen: 1,
        adjustmentOpen: true,
      }),
    ).toEqual([
      "PAYOUT_NOT_CLOSED",
      "PAYOUT_TOTAL_NOT_POSITIVE",
      "PAYOUT_REVIEW_OPEN",
      "PAYOUT_ADJUSTMENT_OPEN",
    ]);
  });
  it("one minor unit is above zero; zero and minus one are not", () => {
    expect(sendRefusals({ ...ready, totalMinor: 0n })).toEqual([
      "PAYOUT_TOTAL_NOT_POSITIVE",
    ]);
    expect(sendRefusals({ ...ready, totalMinor: -1n })).toEqual([
      "PAYOUT_TOTAL_NOT_POSITIVE",
    ]);
  });
  it("an open adjustment never holds a prepaid or per-order payout", () => {
    for (const kind of ["prepaid", "per_order"] as const) {
      expect(sendRefusals({ ...ready, kind, adjustmentOpen: true })).toEqual(
        [],
      );
    }
  });
  it("a sent or paid payout has the one reason", () => {
    for (const status of ["statement_sent", "paid"] as const) {
      expect(sendRefusals({ ...ready, status })).toEqual([
        "PAYOUT_STATUS_ILLEGAL",
      ]);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Money, the Wise case, the export page                                      */
/* -------------------------------------------------------------------------- */

describe("AC-29: amounts render through formatMoney (PLN, EUR, GBP)", () => {
  for (const [currency, amount] of [
    ["PLN", 123450n],
    ["EUR", 4590n],
    ["GBP", 1n],
  ] as const) {
    it(`${currency} ${amount.toString()}`, async () => {
      data.overview = overview({
        open: [row({ currency, totalMinor: amount, closedAt: null })],
      });
      expect(text(await renderList())).toContain(
        formatMoney({ amountMinor: amount, currency }, "en"),
      );
      data.detail = detail({ currency, totalMinor: amount });
      expect(text(await renderDetail())).toContain(
        formatMoney({ amountMinor: amount, currency }, "en"),
      );
    });
  }
});

describe("the export selection", () => {
  it("a sent statement without a Wise recipient id gets no checkbox and the reason", async () => {
    data.overview = overview({
      sent: [
        row({ id: P1, status: "statement_sent", statementNumber: "P-000124" }),
        row({
          id: P3,
          status: "statement_sent",
          statementNumber: "P-000126",
          partnerCode: "pl-waw-02",
          hasWiseRecipient: false,
        }),
      ],
    });
    const html = await renderList();
    expect(html).toContain(`value="${P1}"`);
    expect(html).not.toContain(`value="${P3}"`);
    expect(text(html)).toContain("No Wise recipient id.");
    expect(html).toContain('href="/admin/partners/pl-waw-02"');
    expect(html).toContain("Create Wise export");
  });

  it("every group empty: the one card, the side lists' lines", async () => {
    const html = text(await renderList());
    expect(html).toContain("No payouts yet");
    expect(html).toContain("No open adjustments.");
    expect(html).toContain("Every delivered order has its photo.");
  });

  it("an open adjustment offers settle and waive; a waiver candidate the waiver", async () => {
    data.overview = overview({
      adjustments: [
        {
          id: ADJ,
          orderId: ORDER,
          reference: "FO-5RTB-2KQM",
          createdAt: new Date("2026-10-23T16:05:00Z"),
          partnerCode: "pl-poz-01",
          partnerName: "Kwiaty Jeżyce",
          zone: "Europe/Warsaw",
          currency: "PLN",
          holdsStatement: true,
        },
      ],
      waivers: [
        {
          orderId: ORDER,
          reference: "FO-8MZD-4HWE",
          deliveredAt: new Date(Date.now() - 19 * 3_600_000 - 60_000),
          partnerCode: "pl-krk-pod-lipa",
          partnerName: "Kwiaciarnia pod Lipą",
          zone: "Europe/Warsaw",
        },
      ],
    });
    const html = text(await renderList());
    expect(html).toContain("Holds a statement");
    expect(html).toContain("Settle the adjustment for FO-5RTB-2KQM");
    expect(html).toContain("Waive the adjustment for FO-5RTB-2KQM");
    expect(html).toContain("no photo for 19 hours");
    expect(html).toContain("Accrue FO-8MZD-4HWE without a photo");
  });
});

describe("the export page: active, partly paid, cancelled", () => {
  it("active: download, mark all, mark one, cancel; one total per currency", async () => {
    const html = await renderExport();
    expect(html).toContain(`href="/admin/api/payouts/exports/${X1}"`);
    expect(html).toContain("Mark all paid");
    expect(html).toContain("Cancel export");
    expect(text(html)).toContain(
      formatMoney({ amountMinor: 138350n, currency: "PLN" }, "en"),
    );
  });

  it("partly paid: cancel is absent and the reason is text", async () => {
    const base = exportOf();
    data.export = exportOf({
      payouts: [
        {
          ...base.payouts[0]!,
          status: "paid",
          paidAt: new Date("2026-10-27T10:00:00Z"),
        },
        base.payouts[1]!,
      ],
    });
    const html = await renderExport();
    expect(html).not.toContain("Cancel export");
    expect(text(html)).toContain(
      "1 payout is paid. This export can no longer be cancelled.",
    );
    expect(html).toContain("Mark all paid");
  });

  it("cancelled: no download, mark paid or cancel; the banner says what happened", async () => {
    data.export = exportOf({
      cancelledAt: new Date("2026-10-26T07:40:00Z"),
      cancelledCount: 2,
      payouts: [],
      totals: [],
    });
    const html = await renderExport();
    expect(html).not.toContain("Download CSV");
    expect(html).not.toContain("Mark all paid");
    expect(html).not.toContain("Cancel export");
    expect(text(html)).toContain("Its 2 payouts are back under “Sent”");
  });
});

/* -------------------------------------------------------------------------- */
/* The outcome line and the command runner                                    */
/* -------------------------------------------------------------------------- */

describe("the outcome in the query string", () => {
  it("renders a refusal's message, the Wise case with its florist codes", async () => {
    const html = text(
      await renderList({
        refused: "PAYOUT_WISE_RECIPIENT_MISSING",
        codes: "pl-waw-02",
      }),
    );
    expect(html).toContain(
      "Nothing was exported. pl-waw-02 has no Wise recipient id.",
    );
  });

  it("drops what it did not earn", () => {
    expect(
      parsePayoutOutcome({
        done: "hacked",
        refused: "DROP TABLE",
        n: "P-12",
        florist: "Anna Kowalska",
        codes: "<script>",
        open: "settle-x",
        err: "amountMinor,recipientName",
      }),
    ).toEqual({ err: ["amountMinor"] });
  });

  it("re-opens a dialog with its field error and no page-level refusal", async () => {
    data.overview = overview({
      adjustments: [
        {
          id: ADJ,
          orderId: ORDER,
          reference: "FO-5RTB-2KQM",
          createdAt: new Date("2026-10-23T16:05:00Z"),
          partnerCode: "pl-poz-01",
          partnerName: "Kwiaty Jeżyce",
          zone: "Europe/Warsaw",
          currency: "PLN",
          holdsStatement: false,
        },
      ],
    });
    const html = await renderList({ open: `waive-${ADJ}`, err: "reason" });
    expect(text(html)).toContain("Write at least 10 characters.");
    expect(html).toContain('aria-invalid="true"');
  });
});

describe("runPayoutCommand: a refusal is its code, and no write", () => {
  const actor = { userId: USER, requestId: "request-1" };
  const run = <T,>(fail: unknown) =>
    runPayoutCommand<T>(
      actor,
      "payout.statement_sent",
      () => Promise.reject(fail),
      {
        run: (_input, fn) => fn({ execute: () => Promise.resolve([]) }),
      },
    );

  it("the module's refusal", async () => {
    expect(
      await run(new PayoutError("PAYOUT_ADJUSTMENT_RESOLVED", "x")),
    ).toEqual({
      ok: false,
      code: "PAYOUT_ADJUSTMENT_RESOLVED",
    });
  });
  it("a trigger's refusal, in the driver error or its cause", async () => {
    expect(
      await run(
        new Error(
          "PAYOUT_NOT_DRAFT: the lines of a statement_sent payout are frozen",
        ),
      ),
    ).toEqual({ ok: false, code: "PAYOUT_NOT_DRAFT" });
    expect(
      await run(
        new Error("query failed", {
          cause: new Error("PAYOUT_STATUS_ILLEGAL: x"),
        }),
      ),
    ).toEqual({ ok: false, code: "PAYOUT_STATUS_ILLEGAL" });
  });
  it("the Wise refusal keeps the florist codes", async () => {
    expect(await run(new WiseRecipientMissing(["pl-waw-02"]))).toEqual({
      ok: false,
      code: "PAYOUT_WISE_RECIPIENT_MISSING",
      partnerCodes: ["pl-waw-02"],
    });
  });
  it("anything else is thrown on", async () => {
    await expect(run(new Error("connection reset"))).rejects.toThrow(
      "connection reset",
    );
    expect(
      payoutRefusalCode(new Error("NOT_A_PAYOUT_CODE: x")),
    ).toBeUndefined();
  });
});
