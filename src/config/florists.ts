/**
 * The florist surface's configuration (spec 011 §5.2 "`src/config/florists.ts`", §2 "One mount
 * point", §13 Q4; TASK-212). No database (`check:no-db`).
 *
 *  - `basePath` — the one mount point every florist route derives from, `FLORIST_BASE_PATH`:
 *    `/demo/vendor-inbox` in Phase 0; spec 026 moves it to `/vendor`. Pages, the Auth.js base
 *    path, the cookie path and the response-header rules are all built from it
 *    (`floristPaths()`), and `tests/unit/florist-routes.test.ts` holds the route tree under
 *    `src/app` equal to it.
 *  - `signInPolicy(environment)` — which partner statuses' members may receive a sign-in link: a
 *    total function of the deployment environment. Phase 0 is `demo` partners everywhere but
 *    `production`, and nobody in `production` (§13 Q4), which is also what turns every florist
 *    route into a 404 there (`floristSurfaceOpen()`). Spec 026 widens production to `active`.
 *  - `languages` — the three languages the florist surface speaks (`partner_member.locale_code`,
 *    `0022_florists_v0`), with `en` the default before sign-in (§7: never `Accept-Language`,
 *    never an IP).
 *  - `inboxRefresh` — the list's refresh island: every 5 s while visible, stopping after 10
 *    minutes without interaction (§2, AC-26; TASK-214 reads it).
 *  - `applicationForm` — the apply page's switch (§2 "The form switch"); `off` until the
 *    production database has `0022` and TASK-213 turns it on.
 *
 *  - `payoutExample` (TASK-210): the for-florists landing's one example (§13 Q7). The **retail**
 *    amount is never written here: it is resolved through the catalogue's price API for
 *    (`productId`, country, `tier`), so a price change in the dataset changes the page with no edit
 *    to this file. The **payout** is the authored integer the founder confirmed (escalation in
 *    `docs/tasks/TASK-210.md`): a florist reads it as an offer. `floristsConfigSchemaFor(retail)`
 *    refuses a payout that is not a positive integer below the retail amount in the same currency
 *    (AC-4).
 *  - `example` (TASK-210): the walkthrough's sample order values that are neither catalogue data
 *    nor copy.
 *  - `photo`: the delivery photo's bounds (TASK-215 reads them).
 */
import { z } from "zod";

/** `fulfillment_partner.status`, mirrored here because `src/config` reads no schema module. */
export const FLORIST_PARTNER_STATUSES = [
  "demo",
  "onboarding",
  "active",
  "paused",
  "offboarded",
] as const;
export type FloristPartnerStatus = (typeof FLORIST_PARTNER_STATUSES)[number];

/** The deployment environments, as `src/lib/env.schema.ts` names them. */
export const FLORIST_ENVIRONMENTS = [
  "development",
  "test",
  "preview",
  "staging",
  "production",
] as const;
export type FloristEnvironment = (typeof FLORIST_ENVIRONMENTS)[number];

/** The florist surface's languages (`partner_member.locale_code`). */
export const FLORIST_LANGUAGES = ["en", "pl", "de"] as const;
export type FloristLanguage = (typeof FLORIST_LANGUAGES)[number];
export const FloristLanguageSchema = z.enum(FLORIST_LANGUAGES);

/**
 * The florist pages' query before sign-in: `?hl=` among the three, anything else dropped (§7).
 * Other keys (`state`, `t`) are the sign-in core's and are read by the pages themselves.
 */
export const FloristQuerySchema = z.object({
  hl: FloristLanguageSchema.optional().catch(undefined),
});

/** Before sign-in, `?hl=` among the three, else this (§7). */
export const DEFAULT_FLORIST_LANGUAGE: FloristLanguage = "en";

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
    /** The destination of the example (§13 Q7): data, like every country. */
    countryIso2: z.string().regex(/^[A-Z]{2}$/u),
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

const PathSchema = z
  .string()
  .regex(/^\/[a-z0-9/_-]*[a-z0-9_-]$/u, "a path, no trailing slash");

export const FloristsConfigSchema = z
  .object({
    basePath: PathSchema,
    applicationForm: z.enum(["off", "on"]),
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
    /** Statuses whose members may sign in, per environment. */
    signIn: z.record(
      z.enum(FLORIST_ENVIRONMENTS),
      z.array(z.enum(FLORIST_PARTNER_STATUSES)),
    ),
  })
  .strict();
export type FloristsConfig = z.infer<typeof FloristsConfigSchema>;

/** The application form's switch (§2 "The form switch"). */
export type ApplicationFormState = FloristsConfig["applicationForm"];

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

export const floristsConfig: FloristsConfig = FloristsConfigSchema.parse({
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
  inboxRefresh: { intervalMs: 5_000, idleStopMs: 600_000 },
  signIn: {
    development: ["demo"],
    test: ["demo"],
    preview: ["demo"],
    staging: ["demo"],
    // §13 Q4: nobody until spec 026 opens production to `active` partners.
    production: [],
  },
} satisfies z.input<typeof FloristsConfigSchema>);

/** `FLORIST_BASE_PATH`: every florist route starts with it. */
export const FLORIST_BASE_PATH = floristsConfig.basePath;

/**
 * The partner statuses whose members may receive a link in `environment` (§2 "Who may sign in").
 * A total function: an environment outside the five is treated as `production` (fail closed).
 */
export function signInPolicy(
  environment: string,
): readonly FloristPartnerStatus[] {
  const parsed = z.enum(FLORIST_ENVIRONMENTS).safeParse(environment);
  return floristsConfig.signIn[parsed.success ? parsed.data : "production"];
}

/** Whether the florist surface answers at all in `environment` (§13 Q4: 404 while empty). */
export function floristSurfaceOpen(environment: string): boolean {
  return signInPolicy(environment).length > 0;
}

/** Every florist path, built from `FLORIST_BASE_PATH` and nothing else (AC-22). */
export function floristPaths(base: string = FLORIST_BASE_PATH) {
  return Object.freeze({
    base,
    authBase: `${base}/api/auth`,
    request: `${base}/api/auth/request`,
    confirmPost: `${base}/api/auth/confirm`,
    signOut: `${base}/api/auth/sign-out`,
    language: `${base}/api/language`,
    signIn: `${base}/sign-in`,
    confirm: `${base}/sign-in/confirm`,
    order: (assignmentId: string) => `${base}/orders/${assignmentId}`,
  });
}

export const FLORIST_PATHS = floristPaths();

/** True when `pathname` is the florist base or under it. */
export function isFloristPath(pathname: string): boolean {
  return (
    pathname === FLORIST_BASE_PATH ||
    pathname.startsWith(`${FLORIST_BASE_PATH}/`)
  );
}
