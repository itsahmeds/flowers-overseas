/**
 * Spec 030b T-27 (unit half), T-28 to T-30 (parse half), the tab bar of AC-1 and AC-2, and the
 * AC-5 source scan (TASK-441):
 *
 *  - `textHasContactDetails`: an email address, `+48 600 100 200` and `600 100 200` are found;
 *    `Met on 2026-10-21, agreed 149,00 zł for size M` passes;
 *  - the note, contact-log and contact-name schemas refuse exactly the spec's cases, each with its
 *    field code, and accept the boundaries (2000 and 1000 characters, 5 minutes ahead);
 *  - rating and acceptance formatting: 9000 bp is "4.50", 6667 bp is "66.67%";
 *  - the florist tab bar per role: Money only with `finance.view`, Relationship only with
 *    `partner.crm.view`;
 *  - no import of `modules/partners/crm` outside `src/app/admin`, the partners module itself and
 *    the tests.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { formatPercentBp, formatRatingBp } from "@/modules/i18n";

import {
  parseContactCreate,
  parseContactName,
  parseContactNameEdit,
  parseNoteCreate,
  parseNoteEdit,
} from "../../src/modules/partners/crm/schemas.ts";
import { textHasContactDetails } from "../../src/modules/partners/crm/text.ts";
import { partnerTabsFor } from "../../src/app/admin/(signed-in)/partners/[code]/tabs.tsx";

const PARTNER = "8f9c1d3e-6a3b-4f1e-9b8c-1a2b3c4d5e6f";
const NOW = new Date("2026-10-28T10:00:00.000Z");

describe("textHasContactDetails (AC-28, AC-29, AC-30)", () => {
  it.each([
    ["Call anna@example.pl on Monday"],
    ["Call Anna on +48 600 100 200 about Saturday"],
    ["Her number is 600 100 200"],
    ["+48600100200"],
    ["600100200"],
  ])("finds contact details in %j", (text) => {
    expect(textHasContactDetails(text)).toBe(true);
  });

  it.each([
    ["Met on 2026-10-21, agreed 149,00 zł for size M"],
    ["Closed on Sundays and on 1 November."],
    ["21 stems, 15 stems, 7 stems"],
    ["Order FO-7K2M-Q9XD was late by 20 minutes"],
    ["+48 600"],
  ])("lets %j pass", (text) => {
    expect(textHasContactDetails(text)).toBe(false);
  });
});

describe("PartnerNoteCreateSchema and PartnerNoteEditSchema (AC-28)", () => {
  it("stores 2000 characters and refuses 2001", () => {
    expect(
      parseNoteCreate({ partnerId: PARTNER, body: "a".repeat(2000) }),
    ).toMatchObject({ ok: true, value: { body: "a".repeat(2000) } });
    expect(
      parseNoteCreate({ partnerId: PARTNER, body: "a".repeat(2001) }),
    ).toEqual({ ok: false, errors: { body: "tooLong" } });
  });

  it.each([
    ["", "required"],
    ["   \n  ", "required"],
    ["Write to anna@example.pl", "contactDetails"],
    ["Call +48 600 100 200", "contactDetails"],
    ["Call 600 100 200", "contactDetails"],
  ])("refuses %j with %s", (body, code) => {
    expect(parseNoteCreate({ partnerId: PARTNER, body })).toEqual({
      ok: false,
      errors: { body: code },
    });
  });

  it("accepts the dated, priced note and trims it; the pin is a checkbox", () => {
    expect(
      parseNoteCreate({
        partnerId: PARTNER,
        body: "  Met on 2026-10-21, agreed 149,00 zł for size M  ",
        pinned: "on",
      }),
    ).toEqual({
      ok: true,
      value: {
        partnerId: PARTNER,
        body: "Met on 2026-10-21, agreed 149,00 zł for size M",
        pinned: true,
      },
    });
  });

  it("needs a note id and a version to edit", () => {
    expect(parseNoteEdit({ body: "Fine" })).toEqual({
      ok: false,
      errors: { noteId: "target" },
    });
    expect(
      parseNoteEdit({
        noteId: PARTNER,
        updatedAt: "2026-10-28T10:00:00.000Z",
        body: "Fine",
      }),
    ).toMatchObject({ ok: true, value: { pinned: false } });
  });
});

describe("ContactLogCreateSchema (AC-29)", () => {
  const valid = {
    partnerId: PARTNER,
    occurredAt: "2026-10-28T10:05:00.000Z",
    channel: "phone",
    direction: "outbound",
    topic: "pricing",
    summary: "Photo of the 15-stem bouquet received.",
    followUpOn: "2026-11-02",
  };

  it("accepts an entry 5 minutes ahead of now, with its follow-up date", () => {
    expect(parseContactCreate(valid, NOW)).toMatchObject({
      ok: true,
      value: { followUpOn: "2026-11-02", channel: "phone" },
    });
  });

  it.each([
    ["channel", { channel: "fax" }, "choice"],
    ["direction", { direction: "sideways" }, "choice"],
    ["topic", { topic: "gossip" }, "choice"],
    ["summary", { summary: "a".repeat(1001) }, "tooLong"],
    ["summary", { summary: "Call +48 600 100 200" }, "contactDetails"],
    ["occurredAt", { occurredAt: "2026-10-28T10:06:00.000Z" }, "future"],
    ["followUpOn", { followUpOn: "2026-13-40" }, "date"],
  ])("refuses a bad %s", (field, change, code) => {
    expect(parseContactCreate({ ...valid, ...change }, NOW)).toEqual({
      ok: false,
      errors: { [field]: code },
    });
  });

  it("reads a datetime-local value through the viewer's zone", () => {
    const parsed = parseContactCreate(
      { ...valid, occurredAt: "2026-10-28T12:00" },
      NOW,
      () => new Date("2026-10-28T09:00:00.000Z"),
    );
    expect(parsed).toMatchObject({
      ok: true,
      value: { occurredAt: new Date("2026-10-28T09:00:00.000Z") },
    });
  });

  it("keeps 1000 characters", () => {
    expect(
      parseContactCreate({ ...valid, summary: "a".repeat(1000) }, NOW).ok,
    ).toBe(true);
  });
});

describe("contactName (AC-30)", () => {
  it.each([
    ["P", "tooShort"],
    ["a".repeat(121), "tooLong"],
    ["piotr.nowak@example.com", "contactDetails"],
  ])("refuses %j", (name, code) => {
    expect(parseContactName(name)).toEqual({ error: code });
    expect(
      parseContactNameEdit({
        partnerId: PARTNER,
        updatedAt: "2026-10-28T10:00:00.000Z",
        contactName: name,
      }),
    ).toEqual({ ok: false, errors: { contactName: code } });
  });

  it("keeps 2 and 120 characters and clears on empty", () => {
    expect(parseContactName("Jo")).toEqual({ name: "Jo" });
    expect(parseContactName("a".repeat(120))).toEqual({
      name: "a".repeat(120),
    });
    expect(parseContactName("  ")).toEqual({ name: null });
  });
});

describe("rating and acceptance formatting (AC-27)", () => {
  it("renders 9000 bp as 4.50 and 6667 bp as 66.67%", () => {
    expect(formatRatingBp(9000, "en")).toBe("4.50");
    expect(formatPercentBp(6667, "en")).toBe("66.67%");
  });
});

describe("the florist tab bar (AC-1, AC-2)", () => {
  const keys = (roles: string[]) =>
    partnerTabsFor(roles, "pl-krk-pod-lipa", "profile").map((tab) => tab.key);

  it("gives admin every tab, ops no Money, finance and content no 030b tab", () => {
    expect(keys(["admin"])).toEqual([
      "profile",
      "payoutTerms",
      "money",
      "relationship",
      // TASK-442 (AC-36): Contracts is admin only.
      "contracts",
    ]);
    expect(keys(["ops"])).toEqual(["profile", "payoutTerms", "relationship"]);
    expect(keys(["finance"])).toEqual(["profile", "payoutTerms"]);
    expect(keys(["content"])).toEqual(["profile", "payoutTerms"]);
  });

  it("links each tab by code, Payout terms to its block, and marks the current one", () => {
    const tabs = partnerTabsFor(["admin"], "pl-krk-pod-lipa", "money");
    expect(tabs.map((tab) => tab.href)).toEqual([
      "/admin/partners/pl-krk-pod-lipa",
      "/admin/partners/pl-krk-pod-lipa#terms",
      "/admin/partners/pl-krk-pod-lipa/money",
      "/admin/partners/pl-krk-pod-lipa/relationship",
      "/admin/partners/pl-krk-pod-lipa/contracts",
    ]);
    expect(tabs.filter((tab) => tab.current).map((tab) => tab.key)).toEqual([
      "money",
    ]);
  });
});

describe("AC-5: modules/partners/crm is imported only by admin and its own module", () => {
  const ROOT = join(import.meta.dirname, "../..");
  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
  }

  it("has no importer outside src/app/admin and src/modules/partners", () => {
    const importers = walk(join(ROOT, "src"))
      .filter((file) => /\.(ts|tsx)$/u.test(file))
      .filter((file) =>
        /modules\/partners\/crm|from "\.\.?\/crm/u.test(
          readFileSync(file, "utf8"),
        ),
      )
      .map((file) => relative(ROOT, file))
      .filter(
        (file) =>
          !file.startsWith("src/app/admin/") &&
          !file.startsWith("src/modules/partners/"),
      );
    expect(importers).toEqual([]);
  });
});

describe("AC-35: the finance runbook, the RoPA rows and the architecture note", () => {
  const ROOT = join(import.meta.dirname, "../..");
  const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

  it("has docs/runbooks/finance.md, indexed, with each section the spec names", () => {
    const runbook = read("docs/runbooks/finance.md");
    for (const heading of [
      "## Reading the overview",
      "## What each reason means",
      "## Backfilling fees",
      "## Confirming a tax question",
      "## What the CSV is, and is not",
    ]) {
      expect(runbook).toContain(heading);
    }
    expect(read("docs/runbooks/README.md")).toContain("[finance](finance.md)");
  });

  it("carries the florist relationship row and the extended payments row in the RoPA", () => {
    const ropa = read("docs/compliance/ropa.md");
    expect(ropa).toContain("**Florist relationship record**");
    expect(ropa).toContain("**payment balance facts**");
  });

  it("names the finance read model and the balance-fact flow in docs/architecture.md", () => {
    const architecture = read("docs/architecture.md");
    expect(architecture).toContain("finance read model");
    expect(architecture).toContain("balance-fact flow");
  });
});
