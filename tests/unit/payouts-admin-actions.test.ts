/**
 * Spec 030a's admin actions (AC-1, AC-29; TASK-367), without a database: each server action is
 * guarded first, a role without the permission gets 403 before any command runs, and the
 * redirect carries codes only, never a typed note, reason, amount or Wise recipient id.
 *
 *  - `savePayoutTermsAction`: `partner.payout` (admin, finance); ops and content 403 (AC-1, the
 *    action half TASK-363 handed on); a refusal names the fields as codes.
 *  - The payouts actions: `payouts.manage`; a refusal comes back as its code (settle twice is
 *    `PAYOUT_ADJUSTMENT_RESOLVED`); an invalid form re-opens its dialog with the field names.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.stubEnv("__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS", "true");

const USER = "11111111-1111-4111-8111-111111111111";
const PARTNER = "22222222-2222-4222-8222-222222222222";
const PAYOUT = "33333333-3333-4333-8333-333333333333";
const ADJ = "44444444-4444-4444-8444-444444444444";
const ORDER = "55555555-5555-4555-8555-555555555555";

type Role = "admin" | "ops" | "finance" | "content";

const data = vi.hoisted(() => ({
  roles: ["finance"] as Role[],
  commands: [] as string[],
  terms: [] as unknown[],
  termsResult: { ok: true, code: "pl-krk-01" } as unknown,
  result: { ok: true, value: undefined } as unknown,
}));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers()),
  cookies: () => Promise.resolve({ get: () => undefined }),
}));

vi.mock("@/modules/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/admin")>();
  const session = () =>
    Promise.resolve({
      userId: USER,
      displayName: "Founder Test",
      roles: data.roles,
      timeZone: "Europe/Tallinn",
    });
  return {
    ...actual,
    requirePermission: (
      permission: Parameters<typeof actual.requirePermission>[0],
    ) => actual.requirePermission(permission, { session }),
    adminRequestId: () => Promise.resolve("request-1"),
  };
});

vi.mock("@/modules/partners", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/partners")>();
  return {
    ...actual,
    savePayoutTerms: (_actor: unknown, input: unknown) => {
      data.terms.push(input);
      return Promise.resolve(data.termsResult);
    },
  };
});

vi.mock("@/modules/partners/payouts", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/modules/partners/payouts")>();
  return {
    ...actual,
    runPayoutCommand: (_actor: unknown, action: string) => {
      data.commands.push(action);
      return Promise.resolve(data.result);
    },
  };
});

const partnerActions =
  await import("../../src/app/admin/(signed-in)/partners/actions.ts");
const payoutActions =
  await import("../../src/app/admin/(signed-in)/payouts/actions.ts");

function form(entries: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) formData.set(key, value);
  return formData;
}

const digestOf = (error: unknown): string =>
  typeof error === "object" && error !== null && "digest" in error
    ? String((error as { digest: unknown }).digest)
    : `not a Next interrupt: ${String(error)}`;

async function thrown(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (error) {
    return digestOf(error);
  }
  return "did not throw";
}

/** The redirect target of a `NEXT_REDIRECT` digest. */
function target(digest: string): string {
  return digest.split(";")[2] ?? "";
}

beforeEach(() => {
  data.roles = ["finance"];
  data.commands = [];
  data.terms = [];
  data.termsResult = { ok: true, code: "pl-krk-01" };
  data.result = { ok: true, value: undefined };
});

describe("savePayoutTermsAction (AC-1)", () => {
  const input = {
    partnerId: PARTNER,
    updatedAt: "2026-10-20T10:00:00.000Z",
    code: "pl-krk-01",
    cadence: "weekly",
    prepaidOrderLimit: "5",
    wiseRecipientId: "48213077",
  };

  for (const role of ["ops", "content"] as const) {
    it(`${role} gets 403 and nothing is saved`, async () => {
      data.roles = [role];
      expect(
        await thrown(() => partnerActions.savePayoutTermsAction(form(input))),
      ).toBe("NEXT_HTTP_ERROR_FALLBACK;403");
      expect(data.terms).toEqual([]);
    });
  }

  for (const role of ["admin", "finance"] as const) {
    it(`${role} saves and lands on the block with "saved"`, async () => {
      data.roles = [role];
      const digest = await thrown(() =>
        partnerActions.savePayoutTermsAction(form(input)),
      );
      expect(target(digest)).toBe(
        "/admin/partners/pl-krk-01?result=saved&form=payoutTerms",
      );
      expect(data.terms).toHaveLength(1);
    });
  }

  it("a refusal names the fields as codes, never the typed id", async () => {
    data.termsResult = {
      ok: false,
      reason: "invalid",
      errors: {
        prepaidOrderLimit: "prepaidLimit",
        wiseRecipientId: "wiseRecipient",
      },
    };
    const digest = await thrown(() =>
      partnerActions.savePayoutTermsAction(
        form({ ...input, prepaidOrderLimit: "51", wiseRecipientId: "12a" }),
      ),
    );
    const url = target(digest);
    expect(url).toContain("form=payoutTerms");
    expect(decodeURIComponent(url)).toContain(
      "err=prepaidOrderLimit:prepaidLimit,wiseRecipientId:wiseRecipient",
    );
    expect(url).not.toContain("12a");
    expect(url).not.toContain("48213077");
  });
});

describe("the payouts actions (AC-29)", () => {
  const cases = [
    ["sendStatementAction", { payoutId: PAYOUT, from: "list" }],
    ["createExportAction", { payoutIds: PAYOUT }],
    ["markPaidAction", { payoutId: PAYOUT, from: "detail" }],
    ["markExportPaidAction", { exportId: PAYOUT }],
    ["cancelExportAction", { exportId: PAYOUT }],
    [
      "settleAdjustmentAction",
      { adjustmentId: ADJ, amountMinor: "4500", note: "Bouquet made" },
    ],
    [
      "waiveAdjustmentAction",
      { adjustmentId: ADJ, reason: "Agreed by phone today" },
    ],
    [
      "waivePhotoAction",
      { orderId: ORDER, reason: "Recipient phoned us back" },
    ],
    [
      "addLineAction",
      {
        payoutId: PAYOUT,
        kind: "goodwill",
        amountMinor: "2000",
        note: "Thanks",
      },
    ],
    ["removeLineAction", { payoutId: PAYOUT, lineId: ADJ }],
    ["resolveReviewAction", { payoutId: PAYOUT, lineId: ADJ }],
  ] as const;

  for (const [name, entries] of cases) {
    for (const role of ["ops", "content"] as const) {
      it(`${name}: ${role} gets 403 and no command runs`, async () => {
        data.roles = [role];
        const action = payoutActions[name] as (f: FormData) => Promise<void>;
        expect(await thrown(() => action(form(entries)))).toBe(
          "NEXT_HTTP_ERROR_FALLBACK;403",
        );
        expect(data.commands).toEqual([]);
      });
    }
  }

  it("a second settle comes back as PAYOUT_ADJUSTMENT_RESOLVED in its dialog", async () => {
    data.result = { ok: false, code: "PAYOUT_ADJUSTMENT_RESOLVED" };
    const digest = await thrown(() =>
      payoutActions.settleAdjustmentAction(
        form({ adjustmentId: ADJ, amountMinor: "4500", note: "Bouquet made" }),
      ),
    );
    expect(target(digest)).toBe(
      `/admin/payouts?refused=PAYOUT_ADJUSTMENT_RESOLVED&open=settle-${ADJ}`,
    );
    expect(data.commands).toEqual(["payout.adjustment_settled"]);
  });

  it("a second waive comes back the same way", async () => {
    data.result = { ok: false, code: "PAYOUT_ADJUSTMENT_RESOLVED" };
    const digest = await thrown(() =>
      payoutActions.waiveAdjustmentAction(
        form({ adjustmentId: ADJ, reason: "Agreed by phone today" }),
      ),
    );
    expect(target(digest)).toBe(
      `/admin/payouts?refused=PAYOUT_ADJUSTMENT_RESOLVED&open=waive-${ADJ}`,
    );
  });

  it("a zero settle never reaches the command; the note stays out of the URL", async () => {
    const digest = await thrown(() =>
      payoutActions.settleAdjustmentAction(
        form({ adjustmentId: ADJ, amountMinor: "0", note: "Secret note text" }),
      ),
    );
    expect(target(digest)).toBe(
      `/admin/payouts?open=settle-${ADJ}&err=amountMinor`,
    );
    expect(data.commands).toEqual([]);
  });

  it("a 9-character waiver reason never reaches the command", async () => {
    const digest = await thrown(() =>
      payoutActions.waivePhotoAction(
        form({ orderId: ORDER, reason: "Phoned he" }),
      ),
    );
    expect(target(digest)).toBe(
      `/admin/payouts?open=waiver-${ORDER}&err=reason`,
    );
    expect(data.commands).toEqual([]);
  });

  it("an export refused for a missing Wise id names the florist codes", async () => {
    data.result = {
      ok: false,
      code: "PAYOUT_WISE_RECIPIENT_MISSING",
      partnerCodes: ["pl-waw-02"],
    };
    const digest = await thrown(() =>
      payoutActions.createExportAction(form({ payoutIds: PAYOUT })),
    );
    expect(target(digest)).toBe(
      "/admin/payouts?refused=PAYOUT_WISE_RECIPIENT_MISSING&codes=pl-waw-02",
    );
  });

  it("a sent statement lands on the page it came from with its number", async () => {
    data.result = { ok: true, value: "P-000127" };
    const digest = await thrown(() =>
      payoutActions.sendStatementAction(
        form({ payoutId: PAYOUT, from: "detail", florist: "pl-gdn-01" }),
      ),
    );
    expect(target(digest)).toBe(
      `/admin/payouts/${PAYOUT}?done=sent&n=P-000127&florist=pl-gdn-01`,
    );
  });

  it("a goodwill of 0 names the goodwill rule", async () => {
    const digest = await thrown(() =>
      payoutActions.addLineAction(
        form({
          payoutId: PAYOUT,
          kind: "goodwill",
          amountMinor: "0",
          note: "Thanks",
        }),
      ),
    );
    expect(target(digest)).toBe(
      `/admin/payouts/${PAYOUT}?open=add-line&err=amountMinor%2Cgoodwill`,
    );
    expect(data.commands).toEqual([]);
  });
});
