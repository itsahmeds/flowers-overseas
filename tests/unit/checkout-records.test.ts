/**
 * The checkout's records and docs (spec 010 §8, §12 task 7; AC-36 RoPA half, AC-40, AC-75;
 * T-36, T-40, T-75; TASK-207): the three RoPA rows with every column, the runbook's sections, the
 * architecture row and the quote-signing secret in both env lists.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string): string =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

function ropaRow(number: number): string[] {
  const line = read("docs/compliance/ropa.md")
    .split("\n")
    .find((candidate) => candidate.startsWith(`| ${String(number)} |`));
  if (line === undefined) return [];
  return line
    .split(" | ")
    .map((cell) => cell.replace(/^\| /u, "").replace(/ \|$/u, "").trim());
}

describe("T-36, T-75: the RoPA rows of spec 010 §8", () => {
  it.each([8, 9, 10])("row %i has all ten columns, none empty", (number) => {
    const cells = ropaRow(number);
    expect(cells).toHaveLength(10);
    for (const cell of cells) expect(cell).not.toBe("");
    expect(cells.at(-1)).toMatch(/^010 /u);
  });

  it("row 8 is the checkout drafts: a pseudonymous cookie, 30 days and 24 hours, the same processors", () => {
    const [, activity, , , , , processors, retention] = ropaRow(8);
    expect(activity).toContain("**Checkout drafts**");
    expect(activity).toContain("`fo_checkout`");
    expect(retention).toContain(
      "Lines 30 days after the last change; recipient, card and buyer details 24 hours after the last activity",
    );
    expect(processors).toBe(
      "Neon (Frankfurt), Railway (Amsterdam), Cloudflare",
    );
  });

  it("row 9 is the demo and test orders at 24 hours and 7 days; row 10 starts with spec 013", () => {
    expect(ropaRow(9)[1]).toContain("**Demo and test orders**");
    expect(ropaRow(9)[7]).toContain(
      "24 hours after placement in production and 7 days after placement on staging",
    );
    expect(ropaRow(10)[1]).toContain("**Starts with spec 013**");
  });
});

describe("T-40: the runbook, the architecture row and the env key", () => {
  it("docs/runbooks/checkout.md covers opening and closing, the cap, retention per environment and the guard", () => {
    const runbook = read("docs/runbooks/checkout.md");
    for (const heading of [
      "## Opening and closing the demo per country",
      "## Production data before the first production demo order",
      "## The daily cap",
      "## Retention per environment",
      "## What turning the guard off requires",
    ]) {
      expect(runbook).toContain(heading);
    }
  });

  it("docs/architecture.md lists modules/checkout", () => {
    expect(read("docs/architecture.md")).toMatch(/^\| `checkout` \| /mu);
  });

  it("QUOTE_SIGNING_SECRET is in .env.example and in lib/env", () => {
    expect(read(".env.example")).toMatch(/^QUOTE_SIGNING_SECRET=/mu);
    expect(read("src/lib/env.schema.ts")).toContain("QUOTE_SIGNING_SECRET:");
  });
});
