/**
 * The free-text boundary of steps 1 and 2 (spec 010 §2, §5.2, §7, AC-8, AC-9, AC-10; `/review 201`
 * change 2, `/break 201` holes 2, 3 and 4; TASK-200).
 *
 *  - **Name and phone on every row.** `AddressFormatSchema` refuses a format without `fullName`
 *    or `phone`, and step 1 requires both even when handed a model that lacks them (DE).
 *  - **Every grapheme limit through the schema** (hole 2): the delivery note, an address line, the
 *    recipient's name and the buyer's name each accept exactly 120 and refuse 121.
 *  - **A raw ceiling before counting** (hole 3): `4 ×` the grapheme limit in UTF-16 code units, so
 *    a 200-grapheme card of combining-mark stacks and a 60 000-unit joiner chain are refused.
 *  - **No control characters, nothing invisible** (hole 4): U+0000, C0 and C1 controls and lone
 *    surrogates are refused in names, address lines and the card (a line break is allowed in the
 *    card and the note only); a value of only format characters is blank.
 */
import { describe, expect, it } from "vitest";

import {
  ADDRESS_FORMATS,
  AddressFormatSchema,
} from "../../src/config/address-formats.ts";
import {
  CHECKOUT_LIMITS,
  CHECKOUT_MAX_CODE_UNITS_PER_GRAPHEME,
} from "../../src/config/checkout.ts";
import {
  CHECKOUT_ERROR_KEYS,
  CardAndBuyerStepSchema,
  RecipientStepSchema,
  addressFormModel,
} from "../../src/modules/checkout/index.ts";
import { recipientStepSchemaFor } from "../../src/modules/checkout/schemas.ts";

const DE_STEP = {
  fullName: "Erika Mustermann",
  street: "Kastanienallee",
  houseNumber: "12",
  careOf: "",
  postcode: "10115",
  city: "Berlin",
  phone: "030 12345678",
  deliveryDate: "2027-02-14",
  placeKind: "home",
  deliveryNote: "",
} as const;

const BUYER = {
  email: "sample.buyer@example.com",
  buyerName: "Sam Sample",
  buyerPhone: "",
  residenceCountry: "GB",
} as const;

const recipient = () => RecipientStepSchema("DE", "de");
const buyer = () =>
  CardAndBuyerStepSchema({ locale: "pl", offeredAddonKeys: [] });

/** The first issue's path and message, for one-line assertions. */
function firstIssue(result: {
  readonly error?: {
    readonly issues: readonly {
      path: readonly PropertyKey[];
      message: string;
    }[];
  };
}): { path: readonly PropertyKey[]; message: string } | undefined {
  const issue = result.error?.issues[0];
  return issue === undefined
    ? undefined
    : { path: issue.path, message: issue.message };
}

/* -------------------------------------------------------------------------- */
/* Name and phone on every row (/review 201 change 2)                          */
/* -------------------------------------------------------------------------- */

describe("every format collects the recipient's name and phone (AC-8, AC-9)", () => {
  it.each(["phone", "fullName"] as const)(
    "AddressFormatSchema refuses a DE row without %s in its order",
    (field) => {
      const de = ADDRESS_FORMATS.DE;
      const result = AddressFormatSchema.safeParse({
        ...de,
        fieldOrder: de.fieldOrder.filter((f) => f !== field),
        required: de.required.filter((f) => f !== field),
        labelKeys: Object.fromEntries(
          Object.entries(de.labelKeys).filter(([f]) => f !== field),
        ),
      });
      expect(result.success).toBe(false);
      expect(
        result.error?.issues.some((issue) => issue.message.includes(field)),
      ).toBe(true);
    },
  );

  it("AddressFormatSchema refuses a DE row where the phone is ordered but optional", () => {
    const de = ADDRESS_FORMATS.DE;
    const result = AddressFormatSchema.safeParse({
      ...de,
      required: de.required.filter((f) => f !== "phone"),
    });
    expect(result.success).toBe(false);
  });

  it("step 1 still requires the phone and the name when the DE model lacks them", () => {
    const model = addressFormModel("DE");
    const stripped = {
      ...model,
      fields: model.fields.filter(
        (f) => f.field !== "phone" && f.field !== "fullName",
      ),
    };
    const schema = recipientStepSchemaFor(stripped, "de");
    const without = (field: string) =>
      Object.fromEntries(
        Object.entries(DE_STEP).filter(([key]) => key !== field),
      );
    expect(firstIssue(schema.safeParse(without("phone")))).toEqual({
      path: ["phone"],
      message: CHECKOUT_ERROR_KEYS.required,
    });
    expect(firstIssue(schema.safeParse(without("fullName")))).toEqual({
      path: ["fullName"],
      message: CHECKOUT_ERROR_KEYS.required,
    });
    expect(schema.parse(DE_STEP).phone.e164).toBe("+493012345678");
  });
});

/* -------------------------------------------------------------------------- */
/* Every grapheme limit through the schema (hole 2)                            */
/* -------------------------------------------------------------------------- */

/** `n` graphemes of mixed widths (1, 2 and 1 code units), each one letter on the page. */
function letters(n: number): string {
  const units = ["ł", "ę", "Ж"];
  return Array.from({ length: n }, (_, i) => units[i % units.length]).join("");
}

describe("each 120-grapheme limit holds through the schema (hole 2)", () => {
  it("states 120 for the note, the names and an address line", () => {
    expect(CHECKOUT_LIMITS.deliveryNote).toBe(120);
    expect(CHECKOUT_LIMITS.fullName).toBe(120);
    expect(CHECKOUT_LIMITS.addressLine).toBe(120);
  });

  it.each(["deliveryNote", "street", "city", "fullName"] as const)(
    "step 1 %s: 120 accepted, 121 refused with {max: 120}",
    (field) => {
      expect(
        recipient().safeParse({ ...DE_STEP, [field]: letters(120) }).success,
      ).toBe(true);
      const result = recipient().safeParse({
        ...DE_STEP,
        [field]: letters(121),
      });
      expect(result.error?.issues).toEqual([
        expect.objectContaining({
          path: [field],
          message: CHECKOUT_ERROR_KEYS.tooLong,
          params: { max: 120 },
        }),
      ]);
    },
  );

  it("step 2 buyerName: 120 accepted, 121 refused with {max: 120}", () => {
    expect(
      buyer().safeParse({ ...BUYER, buyerName: letters(120) }).success,
    ).toBe(true);
    expect(
      buyer().safeParse({ ...BUYER, buyerName: letters(121) }).error?.issues,
    ).toEqual([
      expect.objectContaining({
        path: ["buyerName"],
        message: CHECKOUT_ERROR_KEYS.tooLong,
        params: { max: 120 },
      }),
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* A raw ceiling before counting (hole 3)                                      */
/* -------------------------------------------------------------------------- */

/** One letter carrying `marks` combining marks: one grapheme, `1 + marks` code units. */
const zalgo = (marks: number): string => `a${"́".repeat(marks)}`;

/** A joiner chain of `people` emoji: one grapheme, `3 × people − 1` code units. */
const zwjChain = (people: number): string =>
  Array.from({ length: people }, () => "\u{1F468}").join("‍");

describe("a raw code-unit ceiling stops what a grapheme count cannot (hole 3)", () => {
  it("allows four code units per grapheme of the limit", () => {
    expect(CHECKOUT_MAX_CODE_UNITS_PER_GRAPHEME).toBe(4);
  });

  it("refuses a 200-grapheme card of combining-mark stacks", () => {
    const card = Array.from({ length: 200 }, () => zalgo(4)).join("");
    expect(card.length).toBe(1000);
    expect(
      firstIssue(buyer().safeParse({ ...BUYER, cardMessage: card })),
    ).toEqual({ path: ["cardMessage"], message: CHECKOUT_ERROR_KEYS.tooLong });
  });

  it("refuses a 60 000-unit joiner chain that counts as one grapheme", () => {
    const chain = zwjChain(20_001);
    expect(chain.length).toBe(60_002);
    for (const [schema, field, step] of [
      [buyer(), "cardMessage", BUYER],
      [buyer(), "buyerName", BUYER],
      [recipient(), "deliveryNote", DE_STEP],
      [recipient(), "street", DE_STEP],
    ] as const) {
      expect(
        firstIssue(schema.safeParse({ ...step, [field]: chain })),
        field,
      ).toEqual({ path: [field], message: CHECKOUT_ERROR_KEYS.tooLong });
    }
  });

  it("checks the ceiling at exactly 4 × the limit", () => {
    // 200 graphemes of `e` plus three marks: 800 units, at the ceiling.
    const atCeiling = Array.from({ length: 200 }, () => zalgo(3)).join("");
    expect(atCeiling.length).toBe(800);
    expect(
      buyer().safeParse({ ...BUYER, cardMessage: atCeiling }).success,
    ).toBe(true);
    expect(
      buyer().safeParse({ ...BUYER, cardMessage: `${atCeiling}b` }).success,
    ).toBe(false);
  });

  it("caps the short fields at 64 units too", () => {
    expect(
      firstIssue(recipient().safeParse({ ...DE_STEP, phone: "1".repeat(65) })),
    ).toEqual({ path: ["phone"], message: CHECKOUT_ERROR_KEYS.phoneInvalid });
    expect(
      firstIssue(
        recipient().safeParse({ ...DE_STEP, postcode: "1".repeat(65) }),
      )?.message,
    ).toBe(CHECKOUT_ERROR_KEYS.postcodeFormat);
  });
});

/* -------------------------------------------------------------------------- */
/* No control characters, nothing invisible (hole 4)                           */
/* -------------------------------------------------------------------------- */

const CONTROLS = [
  ["NUL", "\u0000"],
  ["ESC sequence", "\u001b[2J"],
  ["tab", "\t"],
  ["DEL", "\u007f"],
  ["C1 NEL", "\u0085"],
  ["lone surrogate", "\ud800"],
] as const;

describe("control characters are refused (hole 4)", () => {
  it.each(CONTROLS)(
    "%s in the recipient's name, a street and the buyer's name",
    (_l, c) => {
      for (const field of ["fullName", "street"] as const) {
        expect(
          firstIssue(
            recipient().safeParse({ ...DE_STEP, [field]: `Ann${c}a` }),
          ),
          field,
        ).toEqual({
          path: [field],
          message: CHECKOUT_ERROR_KEYS.invalidCharacters,
        });
      }
      expect(
        firstIssue(buyer().safeParse({ ...BUYER, buyerName: `Sa${c}m` })),
      ).toEqual({
        path: ["buyerName"],
        message: CHECKOUT_ERROR_KEYS.invalidCharacters,
      });
    },
  );

  it.each(CONTROLS)("%s in the card and 'sign as'", (_l, c) => {
    for (const field of ["cardMessage", "signAs"] as const) {
      expect(
        firstIssue(buyer().safeParse({ ...BUYER, [field]: `Love${c}you` })),
        field,
      ).toEqual({
        path: [field],
        message: CHECKOUT_ERROR_KEYS.invalidCharacters,
      });
    }
  });

  it("allows a line break in the card and the note, and nowhere else", () => {
    expect(
      buyer().parse({ ...BUYER, cardMessage: "Happy birthday\nMum" })
        .cardMessage,
    ).toBe("Happy birthday\nMum");
    expect(
      recipient().parse({ ...DE_STEP, deliveryNote: "Ring twice\r\n3rd floor" })
        .deliveryNote,
    ).toBe("Ring twice\r\n3rd floor");
    expect(
      firstIssue(buyer().safeParse({ ...BUYER, signAs: "Mum\nDad" }))?.message,
    ).toBe(CHECKOUT_ERROR_KEYS.invalidCharacters);
    expect(
      firstIssue(recipient().safeParse({ ...DE_STEP, fullName: "Erika\nM" }))
        ?.message,
    ).toBe(CHECKOUT_ERROR_KEYS.invalidCharacters);
  });

  it("treats a card of only invisible characters as no card", () => {
    for (const card of ["​", "​‍⁠", "﻿  ", "‎"]) {
      expect(
        buyer().parse({ ...BUYER, cardMessage: card }).cardMessage,
        JSON.stringify(card),
      ).toBe("");
    }
  });

  it("calls a required name of only invisible characters `required`", () => {
    expect(
      firstIssue(recipient().safeParse({ ...DE_STEP, fullName: "​​" })),
    ).toEqual({ path: ["fullName"], message: CHECKOUT_ERROR_KEYS.required });
    expect(firstIssue(buyer().safeParse({ ...BUYER, buyerName: "⁠" }))).toEqual(
      { path: ["buyerName"], message: CHECKOUT_ERROR_KEYS.required },
    );
  });

  it("keeps the joiners inside a visible emoji", () => {
    const family = "\u{1F468}‍\u{1F469}‍\u{1F467}";
    expect(buyer().parse({ ...BUYER, cardMessage: family }).cardMessage).toBe(
      family,
    );
  });
});
