/**
 * The florists' configuration (spec 011 §5.2 "`src/config/florists.ts`", §12 "Feature flags and
 * switches"; TASK-210).
 *
 * One file holds every switch spec 011's public pages and the florist inbox read:
 *
 *  - `basePath`: the one mount point of every florist route (`FLORIST_BASE_PATH`), `/demo/vendor-inbox`
 *    in Phase 0; spec 026 moves it.
 *  - `applicationForm`: `"off"` until the production database has spec 011's migration (§5.1), then
 *    `"on"` (TASK-213). The bounded config-file deviation from `CLAUDE.md`'s "data flip in admin"
 *    that specs 003, 004, 007, 008 and 041 record, retired by spec 012.
 *  - `payoutExample`: the landing's one example (§13 Q7). The **retail** amount is never written
 *    here: it is resolved through the catalogue's price API for (`productId`, `PL`, `tier`), so a
 *    price change in the dataset changes the page with no edit to this file. The **payout** is the
 *    authored integer the founder confirms (escalation in `docs/tasks/TASK-210.md`): a florist reads
 *    it as an offer. `floristsConfigSchemaFor(retail)` refuses a payout that is not a positive
 *    integer below the retail amount in the same currency (AC-4).
 *  - `photo`, `inboxRefresh`: the inbox's bounds (TASK-214, TASK-215 read them).
 *  - `signInPolicy(environment)`: which partner statuses' members may receive a sign-in link. A
 *    total function of the deployment environment; production is empty in Phase 0 (§13 Q4).
 *
 * No database is read (`pnpm check:no-db` scans `src/config`). `PARTNER_STATUSES` mirrors
 * `fulfillment_partner.status` (`db/schema/partners.ts`), which this file may not import because the
 * schema imports the ORM; `tests/unit/florists-config.test.ts` pins the two lists equal.
 */
import { z } from "zod";

import type { DeploymentEnvironment } from "../lib/env.schema.ts";

/** `fulfillment_partner.status`, in the schema's order. */
export const PARTNER_STATUSES = [
  "demo",
  "onboarding",
  "active",
  "paused",
  "offboarded",
] as const;
export type PartnerStatus = (typeof PARTNER_STATUSES)[number];

/** The application form's switch (§2 "The form switch"). */
export const APPLICATION_FORM_STATES = ["off", "on"] as const;
export type ApplicationFormState = (typeof APPLICATION_FORM_STATES)[number];

/** An integer amount in minor units with its ISO currency: never a float (`CLAUDE.md`). */
const MinorMoneySchema = z
  .object({
    amountMinor: z.number().int(),
    currency: z.string().regex(/^[A-Z]{3}$/u),
  })
  .strict();
export type MinorMoney = z.infer<typeof MinorMoneySchema>;

const PayoutExampleSchema = z
  .object({
    /** A catalogue `product.sku`. */
    productId: z.string().regex(/^FO-[A-Z]{2}-\d{3}$/u),
    /** The destination of the example: Poland, the first country (§13 Q7). */
    countryIso2: z.literal("PL"),
    /** A tier key of that product (`stems_15`). */
    tier: z.string().min(1),
    /** What the florist receives, in minor units: the authored figure of §13 Q7. */
    payoutMinor: z.number(),
    currency: z.string().regex(/^[A-Z]{3}$/u),
  })
  .strict();
export type PayoutExample = z.infer<typeof PayoutExampleSchema>;

/**
 * The sample values the walkthrough's example order prints that are neither catalogue data nor
 * copy: the buyer's own words on the card and in the delivery note (a buyer in London writes them,
 * so they stay in English in every locale), the delivery date, the answer-by instant and the
 * recipient. Plainly fictional: the recipient is `checkout-samples.ts`'s Polish row, restated here
 * because that file imports the checkout's types and the walkthrough may not reach them (spec 003
 * §14 A17 check 11); `tests/unit/florists-config.test.ts` pins the two equal.
 */
const ExampleOrderSchema = z
  .object({
    /** A fixed date, so the ISR page reads no clock: printed with its weekday, never its year. */
    deliveryDate: z.iso.date(),
    /** When the offer must be answered, an instant printed in the destination's zone. */
    answerBy: z.iso.datetime({ offset: true }),
    timeZone: z.string().min(1),
    addonKey: z.string().min(1),
    cardMessage: z.string().min(1).max(250),
    deliveryNote: z.string().min(1).max(250),
    recipient: z
      .object({
        fullName: z.string().min(1),
        street: z.string().min(1),
        postcode: z.string().min(1),
        city: z.string().min(1),
        /** As the sample types it; the view stores it as E.164. */
        phone: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export const FloristsConfigSchema = z
  .object({
    basePath: z.string().regex(/^(?:\/[a-z0-9-]+)+$/u),
    applicationForm: z.enum(APPLICATION_FORM_STATES),
    payoutExample: PayoutExampleSchema,
    example: ExampleOrderSchema,
    photo: z
      .object({
        maxBytes: z.number().int().positive(),
        maxEdgePx: z.number().int().positive(),
        signedUrlTtlSeconds: z.number().int().positive().max(300),
      })
      .strict(),
    inboxRefresh: z
      .object({
        intervalMs: z.number().int().positive(),
        idleStopMs: z.number().int().positive(),
      })
      .strict(),
  })
  .strict();
export type FloristsConfig = z.infer<typeof FloristsConfigSchema>;

/**
 * The schema with §5.2's refinement: `payoutMinor` is a positive integer **below** the resolved
 * retail amount, in the **same** currency. The retail amount is an argument because it is the
 * catalogue's answer, not this file's (AC-4); `payoutExampleView()` in `src/modules/partners`
 * resolves it and parses through this.
 */
export function floristsConfigSchemaFor(retail: MinorMoney) {
  const parsedRetail = MinorMoneySchema.parse(retail);
  return FloristsConfigSchema.superRefine((config, ctx) => {
    const { payoutMinor, currency } = config.payoutExample;
    if (!Number.isInteger(payoutMinor) || payoutMinor <= 0) {
      ctx.addIssue({
        code: "custom",
        path: ["payoutExample", "payoutMinor"],
        message: "the payout is a positive integer in minor units",
      });
    } else if (payoutMinor >= parsedRetail.amountMinor) {
      ctx.addIssue({
        code: "custom",
        path: ["payoutExample", "payoutMinor"],
        message: `the payout (${String(payoutMinor)}) must be below the retail amount the buyer pays (${String(parsedRetail.amountMinor)})`,
      });
    }
    if (currency !== parsedRetail.currency) {
      ctx.addIssue({
        code: "custom",
        path: ["payoutExample", "currency"],
        message: `the payout's currency (${currency}) differs from the retail price's (${parsedRetail.currency})`,
      });
    }
  });
}

/** The committed configuration, before the retail refinement (which needs the catalogue). */
export const FLORISTS: FloristsConfig = FloristsConfigSchema.parse({
  basePath: "/demo/vendor-inbox",
  applicationForm: "off",
  payoutExample: {
    // Amber Hour, the 15-stem tier: the artboard's example product (its "18 stems" tier became 15
    // when TASK-240 made every stem count odd).
    productId: "FO-BQ-001",
    countryIso2: "PL",
    tier: "stems_15",
    // 149 zł: spec 011 §13 Q7's default, approved by the founder for Amber Hour, 15 stems,
    // Poland: 2026-10-05 (item 4, decisions log) and 2026-10-24 ("149 ok").
    payoutMinor: 14_900,
    currency: "PLN",
  },
  example: {
    deliveryDate: "2026-10-08",
    answerBy: "2026-10-07T13:40:00Z",
    timeZone: "Europe/Warsaw",
    addonKey: "vase",
    cardMessage: "Happy birthday, Mama! All my love from London.",
    deliveryNote: "Please call when you are downstairs.",
    recipient: {
      fullName: "Anna Przykładowa",
      street: "ul. Marszałkowska 10/5",
      postcode: "00-001",
      city: "Warszawa",
      phone: "+48 22 000 00 00",
    },
  },
  photo: {
    maxBytes: 15_728_640,
    maxEdgePx: 2000,
    signedUrlTtlSeconds: 300,
  },
  inboxRefresh: { intervalMs: 5000, idleStopMs: 600_000 },
} satisfies z.input<typeof FloristsConfigSchema>);

/** `FLORIST_BASE_PATH`: every florist route derives from it (§2 "One mount point"). */
export const FLORIST_BASE_PATH = FLORISTS.basePath;

/**
 * Who may sign in, per environment (§2 "Who may sign in"). Total over `DeploymentEnvironment`, so a
 * new environment is a type error until it states its answer. Spec 026 widens production.
 */
const SIGN_IN_POLICY: Readonly<
  Record<DeploymentEnvironment, readonly PartnerStatus[]>
> = {
  development: ["demo"],
  test: ["demo"],
  preview: ["demo"],
  staging: ["demo"],
  production: [],
};

export function signInPolicy(
  environment: DeploymentEnvironment,
): readonly PartnerStatus[] {
  return SIGN_IN_POLICY[environment];
}
