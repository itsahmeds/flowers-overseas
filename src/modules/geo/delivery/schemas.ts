/**
 * The zod boundary of the delivery calendar (spec 009 §5.2's `DeliveryDateSchema`,
 * `DeliveryWindowSchema` and `CountryHolidaySchema`; AC-7, AC-8; TASK-123).
 *
 * The shapes carry the honesty rules, so a wrong picker is a parse error rather than a rendered
 * promise. Five refinements, each a sentence of the spec turned into a check:
 *
 *  - **"`selectable: false` requires a `reasonKey`"** (§5.2, AC-7) — the spec 004 `CompanySchema`
 *    pattern: a state cannot be set without its explanation. The converse is refined too: a
 *    selectable date may not carry a reason, so "exactly one reason per unselectable date" is a
 *    property of the type and not of a code path.
 *  - **"`state: "unavailable"` requires `dates: []`"** (§5.2) — an unavailable picker is
 *    structurally incapable of listing a day, so the state that means "we have no operational
 *    data for this country" cannot be rendered beside a date grid. It may name no cutoff either.
 *  - **A cutoff and its zone are one fact** — "Order by 14:00" with no zone named is exactly the
 *    ambiguity `plan/03` §10 exists to prevent, so the two fields are present or absent together.
 *  - **A non-`live` window has no selectable date** — §2's states table: `preview` renders "the
 *    full computed grid, **every date unselectable**". AC-8's "there is no code path by which a
 *    country without a partner renders a selectable date" is asserted here as well as in
 *    `calendar.ts`, because a later task composing a window by hand would otherwise build one.
 *  - **`notOrderable` belongs to `preview` and nowhere else** — it is the one reason that is a
 *    fact about *us* rather than about the destination's calendar (§13 Q6), and the refinement
 *    stops it leaking into a live window where AC-7's five calendar reasons are the only honest
 *    answers.
 *
 * It is a **separate file, deliberately not re-exported from `src/modules/geo/index.ts`** — the
 * reason `src/modules/geo/occasions/schema.ts` states: the calendar itself is zod-free so that a
 * parser does not reach the render path of every page that shows a date. A caller with untrusted
 * rows imports this file by path and parses once.
 */
import { z } from "zod";

import { MoneySchema } from "../../i18n/index.ts";

import {
  type DeliveryDate,
  type DeliveryWindow,
  NOT_ORDERABLE_REASON,
  deliveryReasonKeys,
  pickerStates,
} from "./types.ts";

/** `YYYY-MM-DD`, shape only — `zone.ts`'s `parseIsoDate` is what proves the day exists. */
const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, "must be a `YYYY-MM-DD` calendar date");

/** One day in the grid (spec 009 §2 "Each date in the grid is a value, not a rendering decision"). */
export const DeliveryDateSchema = z
  .object({
    date: IsoDateSchema,
    selectable: z.boolean(),
    reasonKey: z.enum(deliveryReasonKeys).optional(),
    surcharge: MoneySchema.optional(),
    occasionKeys: z.array(z.string().min(1)),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.selectable && value.reasonKey === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["reasonKey"],
        message: `${value.date} is unselectable with no reason: a closed date states why in words beside it (spec 009 AC-7, WCAG 1.4.1)`,
      });
    }
    if (value.selectable && value.reasonKey !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["reasonKey"],
        message: `${value.date} is selectable and carries the reason \`${value.reasonKey}\`: a reason is why a date cannot be chosen, and a chooseable one has none`,
      });
    }
  });

/** The grid the page renders, with the state that decides what it is allowed to say. */
export const DeliveryWindowSchema = z
  .object({
    state: z.enum(pickerStates),
    timeZone: z.string().min(3).optional(),
    cutoffLocal: z
      .string()
      .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u)
      .optional(),
    dates: z.array(DeliveryDateSchema),
    noticeKey: z.string().min(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.state === "unavailable" && value.dates.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["dates"],
        message: `an \`unavailable\` picker listed ${String(value.dates.length)} date(s): with no \`operations\` block there is no calendar to show (spec 009 §2, AC-8)`,
      });
    }
    const hasZone = value.timeZone !== undefined;
    if (hasZone !== (value.cutoffLocal !== undefined)) {
      ctx.addIssue({
        code: "custom",
        path: ["cutoffLocal"],
        message: `a cutoff and its zone are one fact: \`${value.cutoffLocal ?? "—"}\` in \`${value.timeZone ?? "—"}\` states a time with no zone or a zone with no time (plan/03 §10)`,
      });
    }
    if (value.state === "unavailable" && hasZone) {
      ctx.addIssue({
        code: "custom",
        path: ["timeZone"],
        message: `an \`unavailable\` picker named a cutoff: §2's table renders no cutoff for a country with no operational data`,
      });
    }
    if (value.state !== "unavailable" && !hasZone) {
      ctx.addIssue({
        code: "custom",
        path: ["timeZone"],
        message: `a \`${value.state}\` picker has no zone: the grid was computed in some zone and the page must name it (plan/03 §10)`,
      });
    }
    value.dates.forEach((date, index) => {
      if (value.state !== "live" && date.selectable) {
        ctx.addIssue({
          code: "custom",
          path: ["dates", index, "selectable"],
          message: `${date.date} is selectable in a \`${value.state}\` picker: no destination without an active partner may offer a date (spec 009 AC-8)`,
        });
      }
      if (
        date.reasonKey === NOT_ORDERABLE_REASON &&
        value.state !== "preview"
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["dates", index, "reasonKey"],
          message: `${date.date} claims \`${NOT_ORDERABLE_REASON}\` in a \`${value.state}\` picker: that reason is the preview state's own sentence (spec 009 §13 Q6)`,
        });
      }
    });
  });

/**
 * Parse an untrusted value into the shape the calendar returns.
 *
 * The **return type annotation is the drift check**: the day a field is added to a schema and not
 * to `types.ts` — or the other way round — this stops compiling, which is the only way a page can
 * be stopped from rendering a field no parser has ever seen.
 */
export function parseDeliveryDate(value: unknown): DeliveryDate {
  return DeliveryDateSchema.parse(value);
}

/** Parse an untrusted window. See `parseDeliveryDate` for why the annotation is load-bearing. */
export function parseDeliveryWindow(value: unknown): DeliveryWindow {
  return DeliveryWindowSchema.parse(value);
}

/**
 * One public holiday of one destination, as the calendar reads it.
 *
 * **Re-exported from the seed schema, not restated** — the same decision, for the same reason, as
 * `src/modules/geo/occasions/schema.ts`: one shape, in `seed/schema/holidays.ts`, parsed by the
 * seed gate, by spec 002's importer and by anyone holding rows from outside the repository. A
 * second copy here is exactly how a holiday the seed accepts and the calendar ignores comes
 * about.
 */
export {
  HolidayDateSchema,
  HolidayNameKeySchema,
  SeedCountryHolidayRegistrySchema as CountryHolidayRegistrySchema,
  SeedCountryHolidaySchema as CountryHolidaySchema,
} from "../../../../seed/schema/holidays.ts";
