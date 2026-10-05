/**
 * The one decision a checkout makes before anything else: is it `closed`, a `demo`, a `test` or
 * `live`? (spec 010 §2 "One decision decides what the checkout may do", §5.2's table, AC-1, AC-2,
 * AC-4, AC-8; TASK-200.)
 *
 * Three pure functions, and the reason they are in one file is AC-1: **no other file branches on
 * the inputs of this decision.** The country's `checkout.open` flag, the global
 * `checkout.demo_guard` flag and the kind of Stripe key in the environment are read to decide a
 * mode here and nowhere else; `tests/unit/checkout-mode.test.ts` greps the repository for them
 * and fails on a reader outside this file and its allow-list (decisions log 2026-10-05, ruling R5).
 * The database read of the two flags is wired into this file by TASK-203 through `isEnabled`.
 *
 *  - **`checkoutMode(inputs)`** — §5.2's table, row for row, plus AC-8's precondition that a
 *    destination with only the generic address format is `closed`. Every input is data handed in
 *    by the caller (the start route and every server action, TASK-203 onwards), so the function
 *    reads no flag, no clock, no environment and no database itself, and AC-1's fixture can
 *    enumerate every combination.
 *  - **`legalReadiness(locale, buyerCountry, sources)`** — the conjunction that must hold before
 *    a live checkout may exist: the company is registered, the privacy page exists in the locale,
 *    the terms and the cancellation documents of the buyer's regime are in force and
 *    lawyer-reviewed, the `checkout.legal.*` copy is reviewed in the locale, and spec 017's
 *    confirmation email is registered. Each term is a named predicate on an injectable source,
 *    so AC-4 can make each one false in turn. In Phase 0 every source but the company register
 *    answers `false` because the thing it asks about does not exist yet (spec 041 §13 Q1, spec
 *    017, spec 013): the honest answer to "is this lawyer-reviewed?" before there is a lawyer.
 *  - **`checkoutEntryFor(pickerState, deployment)`** — the database-free predicate the product
 *    page calls at build time (TASK-206) to decide whether to draw "Try a demo order", the live
 *    continue button or nothing. It decides only what a cached page shows; the authoritative
 *    check is `checkoutMode()` at the start route and on every action (§5.3, §5.4).
 *
 * **Why `test` and `live` are unreachable today.** `test` needs spec 013's Stripe test payment
 * step to be registered, a test key, the `payments.stripe` flag on and a non-production
 * environment; `live` needs the guard off, a live destination, legal readiness and spec 013's
 * live step. This task registers no payment step, so in Phase 0 the guard yields `demo` and its
 * absence yields `closed` (§2: "Taking money needs spec 013 merged; it cannot happen by flipping
 * a flag").
 */
import { z } from "zod";

import { isCompanyRegistered } from "@/config/company";
import { DEMO_ENTRY_ENVIRONMENTS } from "@/config/checkout";
import { type LocaleCode, isLocaleCode } from "@/config/locales";
import {
  type DeploymentEnvironment,
  deploymentEnvironments,
} from "@/lib/env.schema";
import { type PickerState, pickerStates } from "@/modules/geo";

/* -------------------------------------------------------------------------- */
/* The vocabulary                                                              */
/* -------------------------------------------------------------------------- */

/** The four modes of §5.2, and no others. */
export const checkoutModes = ["closed", "demo", "test", "live"] as const;
export type CheckoutMode = (typeof checkoutModes)[number];

/**
 * The feature-flag keys this decision reads (spec 002 §12, spec 010 §12 "Feature flags"). Named
 * once, here: TASK-203 reads them through `isEnabled`, and TASK-219's registry declares them.
 * `checkout.open` is country-scoped; the other two are global.
 */
export const CHECKOUT_FLAG_KEYS = {
  open: "checkout.open",
  demoGuard: "checkout.demo_guard",
  stripe: "payments.stripe",
} as const;

/**
 * What kind of Stripe secret key the environment carries. `unknown` is a key with neither
 * prefix (a restricted key, a typo, a Mollie key in the wrong slot); it counts as no test key.
 */
export const stripeKeyKinds = ["absent", "test", "live", "unknown"] as const;
export type StripeKeyKind = (typeof stripeKeyKinds)[number];

/**
 * The kind of a Stripe secret key, from its prefix (§5.2's table, "key"). The one place a key's
 * prefix is read to decide a mode (AC-1). Spec 013 declares the key in the env schema and passes
 * its value here; this function never logs it and returns only the kind.
 */
export function stripeKeyKind(secretKey: string | undefined): StripeKeyKind {
  if (secretKey === undefined || secretKey.trim() === "") return "absent";
  if (secretKey.startsWith("sk_test_")) return "test";
  if (secretKey.startsWith("sk_live_")) return "live";
  return "unknown";
}

/** Whether the destination has an authored address format or only the generic one (AC-8). */
export const addressFormatKinds = ["authored", "generic"] as const;
export type AddressFormatKind = (typeof addressFormatKinds)[number];

/* -------------------------------------------------------------------------- */
/* checkoutMode()                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Every input of §5.2's table, as data. `.strict()`: an input the table does not name cannot be
 * smuggled into the decision.
 */
export const CheckoutModeInputsSchema = z
  .object({
    /** The destination's `checkout.open` flag (country scope). */
    countryCheckoutOpen: z.boolean(),
    /** `addressFormModel(countryIso).status`'s source: an authored format, or generic only. */
    addressFormat: z.enum(addressFormatKinds),
    /** Spec 009's `pickerState()` for the destination. */
    pickerState: z.enum(pickerStates),
    /** The global `checkout.demo_guard` flag. */
    demoGuard: z.boolean(),
    /** Spec 013 has registered its Stripe test payment step. This task registers none. */
    testStepRegistered: z.boolean(),
    /** The global `payments.stripe` flag. */
    stripeFlag: z.boolean(),
    /** `stripeKeyKind()` of the environment's Stripe secret key. */
    stripeKeyKind: z.enum(stripeKeyKinds),
    /** `appEnvironment()` of the deployment. */
    appEnv: z.enum(deploymentEnvironments),
    /** `legalReadiness(locale, buyerCountry)`. */
    legalReady: z.boolean(),
    /** Spec 013 has registered its live payment step. This task registers none. */
    liveStepRegistered: z.boolean(),
  })
  .strict();
export type CheckoutModeInputs = z.infer<typeof CheckoutModeInputsSchema>;

/**
 * May the guarded checkout run in `test` rather than `demo`? Only with every one of spec 013's
 * preconditions, and never in production (§2 "The demo guard", AC-2).
 */
function testModeAllowed(inputs: CheckoutModeInputs): boolean {
  return (
    inputs.testStepRegistered &&
    inputs.stripeFlag &&
    inputs.stripeKeyKind === "test" &&
    inputs.appEnv !== "production"
  );
}

/**
 * The checkout's mode (spec 010 §5.2's table, AC-1, AC-2, AC-4, AC-8). Rows in the table's order:
 *
 *  1. `checkout.open` off → `closed`.
 *  2. (AC-8) only the generic address format for the destination → `closed`: a destination
 *     reaches checkout only with a format somebody authored (§7).
 *  3. `pickerState = unavailable` → `closed`.
 *  4. guard on → `test` when spec 013's test step, flag, test key and a non-production
 *     environment all hold, otherwise `demo`. Never `live` while the guard is on.
 *  5. guard off and `pickerState = preview` → `closed`: no florist is taking orders there.
 *  6. guard off, `live` destination → `live` only when legal readiness and spec 013's live step
 *     both hold, otherwise `closed`.
 */
export function checkoutMode(inputs: CheckoutModeInputs): CheckoutMode {
  const parsed = CheckoutModeInputsSchema.parse(inputs);
  if (!parsed.countryCheckoutOpen) return "closed";
  if (parsed.addressFormat === "generic") return "closed";
  if (parsed.pickerState === "unavailable") return "closed";
  if (parsed.demoGuard) return testModeAllowed(parsed) ? "test" : "demo";
  if (parsed.pickerState === "preview") return "closed";
  return parsed.legalReady && parsed.liveStepRegistered ? "live" : "closed";
}

/* -------------------------------------------------------------------------- */
/* legalReadiness()                                                            */
/* -------------------------------------------------------------------------- */

/** The two legal regimes of spec 041 §2: `uk` for a buyer resident in GB, `eu` otherwise. */
export const legalRegimes = ["uk", "eu"] as const;
export type LegalRegime = (typeof legalRegimes)[number];

/** The buyer's regime, from their country of residence (never from an IP, ADR-0006). */
export function legalRegimeFor(buyerCountry: string): LegalRegime {
  return buyerCountry === "GB" ? "uk" : "eu";
}

/** The two documents whose status the readiness check reads (spec 041 §2). */
export const legalDocumentKinds = ["terms", "cancellation"] as const;
export type LegalDocumentKind = (typeof legalDocumentKinds)[number];

/** What spec 041's document register says about one document in one regime. */
export interface LegalDocumentStatus {
  readonly inForce: boolean;
  readonly lawyerReviewed: boolean;
}

/**
 * Where each term's answer comes from. Injectable, so AC-4's fixture can make each one false in
 * turn and so specs 013, 017 and 041 replace one source each without touching the conjunction.
 */
export interface LegalReadinessSources {
  /** `src/config/company.ts`: a registered legal entity exists. */
  readonly isCompanyRegistered: () => boolean;
  /** Spec 041: the privacy page exists in this locale. */
  readonly infoPageExists: (page: "privacy", locale: LocaleCode) => boolean;
  /** Spec 041: the document's status in the buyer's regime. */
  readonly legalDocument: (
    kind: LegalDocumentKind,
    regime: LegalRegime,
  ) => LegalDocumentStatus;
  /** Spec 013: every `checkout.legal.*` key is reviewed in this locale (and at least one exists). */
  readonly legalKeysReviewed: (locale: LocaleCode) => boolean;
  /** Spec 017: the order confirmation email (the durable medium of CRD Art. 8(7)) is registered. */
  readonly confirmationEmailRegistered: () => boolean;
}

const NOT_IN_FORCE: LegalDocumentStatus = Object.freeze({
  inForce: false,
  lawyerReviewed: false,
});

/**
 * Phase 0's sources. The company register is real (`registered: false` until the OÜ exists);
 * the other four answer `false` because what they ask about does not exist yet: no privacy page
 * or document register (spec 041 §13 Q1), no `checkout.legal.*` copy (spec 013), no confirmation
 * email (spec 017). Each spec replaces its own source; until then a live checkout is unreachable.
 */
export const PHASE_0_LEGAL_SOURCES: LegalReadinessSources = Object.freeze({
  isCompanyRegistered,
  infoPageExists: () => false,
  legalDocument: () => NOT_IN_FORCE,
  legalKeysReviewed: () => false,
  confirmationEmailRegistered: () => false,
});

/** The six named terms of the conjunction, in §5.2's order. */
export const legalReadinessTerms = [
  "companyRegistered",
  "privacyPage",
  "terms",
  "cancellation",
  "legalKeysReviewed",
  "confirmationEmail",
] as const;
export type LegalReadinessTerm = (typeof legalReadinessTerms)[number];

const LegalReadinessArgsSchema = z
  .object({
    locale: z.custom<LocaleCode>(
      (value) => typeof value === "string" && isLocaleCode(value),
      { error: "must be a locale configured in src/config/locales.ts" },
    ),
    buyerCountry: z.string().regex(/^[A-Z]{2}$/u),
  })
  .strict();

/**
 * Each term's verdict, by name: what a log line or the admin flags page (spec 012) shows when it
 * explains why a checkout is not live.
 */
export function legalReadinessReport(
  locale: LocaleCode,
  buyerCountry: string,
  sources: LegalReadinessSources = PHASE_0_LEGAL_SOURCES,
): Readonly<Record<LegalReadinessTerm, boolean>> {
  const args = LegalReadinessArgsSchema.parse({ locale, buyerCountry });
  const regime = legalRegimeFor(args.buyerCountry);
  const document = (kind: LegalDocumentKind): boolean => {
    const status = sources.legalDocument(kind, regime);
    return status.inForce && status.lawyerReviewed;
  };
  return {
    companyRegistered: sources.isCompanyRegistered(),
    privacyPage: sources.infoPageExists("privacy", args.locale),
    terms: document("terms"),
    cancellation: document("cancellation"),
    legalKeysReviewed: sources.legalKeysReviewed(args.locale),
    confirmationEmail: sources.confirmationEmailRegistered(),
  };
}

/** True only when every term of `legalReadinessReport()` is true (spec 010 §5.2, AC-4). */
export function legalReadiness(
  locale: LocaleCode,
  buyerCountry: string,
  sources: LegalReadinessSources = PHASE_0_LEGAL_SOURCES,
): boolean {
  const report = legalReadinessReport(locale, buyerCountry, sources);
  return legalReadinessTerms.every((term) => report[term]);
}

/* -------------------------------------------------------------------------- */
/* checkoutEntryFor()                                                          */
/* -------------------------------------------------------------------------- */

/** What the product page's price summary offers (spec 010 §5.3, the spec 009 amendment). */
export const checkoutEntries = ["none", "demo", "continue"] as const;
export type CheckoutEntry = (typeof checkoutEntries)[number];

/** The build-time facts about a deployment the entry depends on (§5.4, §12). */
export interface CheckoutDeployment {
  readonly environment: DeploymentEnvironment;
}

/**
 * The product page's entry into checkout, decided without a database so the cached page stays
 * byte-identical for every visitor (spec 010 §5.3, §5.4, AC-5):
 *
 *  - `unavailable` → `none`: no control at all;
 *  - `preview` → `demo` ("Try a demo order") where the deployment offers the demo
 *    (`DEMO_ENTRY_ENVIRONMENTS`, §13 Q1), otherwise `none`;
 *  - `live` → `continue` ("Continue, {total}").
 *
 * A button drawn here can still lead to the `closed` state: `checkoutMode()` decides at the start
 * route, so a flag flipped after the page was cached is honoured on the click.
 */
export function checkoutEntryFor(
  pickerState: PickerState,
  deployment: CheckoutDeployment,
): CheckoutEntry {
  const state = z.enum(pickerStates).parse(pickerState);
  const environment = z
    .enum(deploymentEnvironments)
    .parse(deployment.environment);
  if (state === "live") return "continue";
  if (state === "preview" && DEMO_ENTRY_ENVIRONMENTS.includes(environment)) {
    return "demo";
  }
  return "none";
}
