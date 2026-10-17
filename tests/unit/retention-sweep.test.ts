/**
 * The pure half of `retention.sweep` (spec 002 AC-20, §8; TASK-025): what a pseudonymised
 * snapshot keeps and what it drops. The database half is `tests/integration/retention-sweep.test.ts`.
 */
import { describe, expect, it } from "vitest";

import {
  initialsOf,
  isRedactedSnapshot,
  pseudonymiseBuyerSnapshot,
  pseudonymiseRecipientSnapshot,
  redactedEmail,
} from "../../src/jobs/retention";

const AT = new Date("2027-05-26T03:00:00.000Z");

describe("retention.sweep — pseudonymisation (AC-20)", () => {
  it("initials: first character of each word, upper-cased, dotted; never empty", () => {
    expect(initialsOf("Anna Maria Nowak")).toBe("A. M. N.");
    expect(initialsOf("  łucja   żak ")).toBe("Ł. Ż.");
    expect(initialsOf("Zoë")).toBe("Z.");
    expect(initialsOf("   ")).toBe("X.");
  });

  it("a recipient snapshot keeps city-level keys and the initials, and drops everything else", () => {
    const snapshot = {
      full_name: "Anna Nowak",
      phone_e164: "+48500000000",
      lines: ["ul. Testowa 1"],
      postal_code: "00-001",
      delivery_note: "ring twice",
      place_kind: "hospital",
      some_future_field: "anything",
      city: "Warszawa",
      city_id: "c1",
      country_iso2: "PL",
    };
    expect(pseudonymiseRecipientSnapshot(snapshot, AT)).toEqual({
      full_name: "A. N.",
      city: "Warszawa",
      city_id: "c1",
      country_iso2: "PL",
      redacted: true,
      redacted_at: AT.toISOString(),
    });
  });

  it("a buyer snapshot keeps the country and the initials only", () => {
    expect(
      pseudonymiseBuyerSnapshot(
        {
          name: "Jan Kowalski",
          email: "jan@example.test",
          phone_e164: "+48600000000",
          country_iso2: "GB",
          city: "London",
        },
        AT,
      ),
    ).toEqual({
      name: "J. K.",
      country_iso2: "GB",
      redacted: true,
      redacted_at: AT.toISOString(),
    });
  });

  it("marks its output, so the next sweep does not select it again", () => {
    expect(isRedactedSnapshot(pseudonymiseRecipientSnapshot({}, AT))).toBe(
      true,
    );
    expect(isRedactedSnapshot({ city: "Warszawa" })).toBe(false);
    expect(isRedactedSnapshot({ redacted: "true" })).toBe(false);
  });

  it("the redacted email is unique per customer, valid in shape and undeliverable (.invalid)", () => {
    const email = redactedEmail("8f0c2d4e-0000-4000-8000-000000000001");
    expect(email).toMatch(/^[^\s@]+@[^\s@]+$/);
    expect(email.endsWith(".invalid")).toBe(true);
    expect(email).not.toBe(
      redactedEmail("8f0c2d4e-0000-4000-8000-000000000002"),
    );
  });
});
