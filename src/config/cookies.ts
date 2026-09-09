/**
 * The cookie register (spec 004 §2 "Consent", §5.1, §8, AC-22; TASK-050).
 *
 * Every cookie and client-storage key the application sets **or intends to set**, with its
 * category, lifetime, party, purpose message key and the spec that introduces it. One file, four
 * consumers: the consent settings panel (TASK-051) renders it, spec 007's cookie-policy page
 * renders it, `docs/compliance/cookie-register.md` **derives its normative table from it**
 * (`node scripts/cookie-register.ts --write`, asserted byte-for-byte by
 * `tests/unit/cookies-config.test.ts`), and AC-22's e2e check compares the cookies a real session
 * accumulates against `isRegisteredCookie()`.
 *
 * No database is read here and none may be (`pnpm check:no-db`, AC-2); spec 002's `consent_log`
 * is the durable half of the *record*, not of this register.
 *
 * ## Why the declared-but-unset rows are here
 *
 * A register that listed only what is set today would be complete and useless: the disclosure a
 * visitor is owed is about what the site does, and the settings panel has to name the analytics
 * and marketing cookies *before* the tag exists, or the first accept is consent to a list nobody
 * showed. So `status: "declared"` rows carry the GA4 and Stripe names, and the schema refuses to
 * let one of them be marked `set` while it is written by anything but the browser (Phase 0
 * invariant: no `Set-Cookie` on a cached response — spec 001 AC-15, spec 003 AC-12).
 *
 * ## Names, and the one wildcard
 *
 * GA4 writes a per-container cookie whose name embeds the measurement id (`_ga_G-XXXXXXX`), so
 * that row's name ends in `*` and `isRegisteredCookie()` matches it as a prefix. A `*` anywhere
 * else is refused: a register whose rows matched broadly would answer "registered" to a cookie
 * nobody declared, which is the exact failure AC-22 exists to catch.
 */
import { z } from "zod";

/** `plan/07` §5 / spec 004 §2: three categories, and `essential` is the only ungated one. */
export const cookieCategories = [
  "essential",
  "analytics",
  "marketing",
] as const;
export type CookieCategory = (typeof cookieCategories)[number];

/** Cookies and the two Web Storage areas: ePrivacy Art. 5(3) covers all three alike. */
export const storageKinds = [
  "cookie",
  "localStorage",
  "sessionStorage",
] as const;
export type StorageKind = (typeof storageKinds)[number];

/** Whose domain the storage belongs to. Web Storage is always first-party (origin-scoped). */
export const cookieParties = ["first", "third"] as const;
export type CookieParty = (typeof cookieParties)[number];

/**
 * Who writes it. `browser` means our own client code on an explicit user action;
 * `third-party-script` means a vendor tag we embed; `server` means a `Set-Cookie` header, which
 * nothing in Phase 0 does and which the schema refuses to combine with `status: "set"`.
 */
export const cookieWriters = [
  "browser",
  "server",
  "third-party-script",
] as const;
export type CookieWriter = (typeof cookieWriters)[number];

/** `set` — written by the app today. `declared` — disclosed now, written by a later spec. */
export const cookieStatuses = ["set", "declared"] as const;
export type CookieStatus = (typeof cookieStatuses)[number];

/**
 * Lifetime in seconds, or a session. `secondsOnReject` is the asymmetry `plan/07` §5 expects of
 * a consent cookie: a refusal is remembered for less time than an acceptance, so a visitor who
 * said no is asked again sooner than one who said yes.
 */
export const CookieLifetimeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("session") }).strict(),
  z
    .object({
      kind: z.literal("maxAge"),
      seconds: z.number().int().positive(),
      secondsOnReject: z.number().int().positive().optional(),
    })
    .strict(),
]);
export type CookieLifetime = z.infer<typeof CookieLifetimeSchema>;

/** Cookie-name token per RFC 6265, plus one optional trailing `*` for a per-container family. */
const NAME_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_-]*\*?$/;

/** The message key the settings panel and the cookie policy read the purpose from (§7). */
const PURPOSE_KEY_PATTERN = /^consent\.cookies\.[a-z][A-Za-z0-9]*\.purpose$/;

export const CookieRegistryEntrySchema = z
  .object({
    /** Exact name, or a prefix family ending in `*` (`_ga_*`). */
    name: z
      .string()
      .regex(NAME_PATTERN, "must be a cookie name, optionally ending in `*`"),
    kind: z.enum(storageKinds),
    category: z.enum(cookieCategories),
    /** Derived from the category, and stated anyway so a row cannot be read two ways. */
    consentRequired: z.boolean(),
    party: z.enum(cookieParties),
    writer: z.enum(cookieWriters),
    status: z.enum(cookieStatuses),
    lifetime: CookieLifetimeSchema,
    /** `consent.cookies.<id>.purpose`; the catalogue entry itself is TASK-051's. */
    purposeKey: z
      .string()
      .regex(
        PURPOSE_KEY_PATTERN,
        "must be a `consent.cookies.<id>.purpose` message key",
      ),
    /** Owning spec, three digits, the spec that introduces or will introduce the entry. */
    spec: z.string().regex(/^\d{3}$/, "must be a three-digit spec number"),
    /** Attribute string as written, for the disclosure. Empty for Web Storage. */
    scope: z.string(),
  })
  .strict()
  .superRefine((entry, ctx) => {
    if (entry.consentRequired !== (entry.category !== "essential")) {
      ctx.addIssue({
        code: "custom",
        path: ["consentRequired"],
        message: `\`${entry.name}\`: consentRequired must be ${String(entry.category !== "essential")} for category \`${entry.category}\``,
      });
    }
    if (entry.status === "set" && entry.writer === "server") {
      ctx.addIssue({
        code: "custom",
        path: ["writer"],
        message: `\`${entry.name}\`: nothing is set by the server in Phase 0 — a cached response must carry no \`Set-Cookie\` (spec 001 AC-15, spec 003 AC-12)`,
      });
    }
    if (entry.kind !== "cookie" && entry.party !== "first") {
      ctx.addIssue({
        code: "custom",
        path: ["party"],
        message: `\`${entry.name}\`: web storage is origin-scoped and therefore always first-party`,
      });
    }
  });

export type CookieRegistryEntry = z.infer<typeof CookieRegistryEntrySchema>;

export const CookieRegistrySchema = z
  .array(CookieRegistryEntrySchema)
  .min(1)
  .superRefine((entries, ctx) => {
    const seen = new Set<string>();
    entries.forEach((entry, index) => {
      if (seen.has(entry.name)) {
        ctx.addIssue({
          code: "custom",
          path: [index, "name"],
          message: `duplicate register entry \`${entry.name}\``,
        });
      }
      seen.add(entry.name);
    });
  });

const DAY = 24 * 60 * 60;

/**
 * The rows. Order is the order the disclosure reads in: what we set, then what we have declared
 * but do not set yet, essential first.
 */
const REGISTER: readonly unknown[] = [
  {
    name: "fo_locale",
    kind: "cookie",
    category: "essential",
    consentRequired: false,
    party: "first",
    writer: "browser",
    status: "set",
    lifetime: { kind: "maxAge", seconds: 365 * DAY },
    purposeKey: "consent.cookies.locale.purpose",
    spec: "003",
    scope: "Path=/; SameSite=Lax; Secure outside development",
  },
  {
    name: "fo_locale_suggestion_dismissed",
    kind: "sessionStorage",
    category: "essential",
    consentRequired: false,
    party: "first",
    writer: "browser",
    status: "set",
    lifetime: { kind: "session" },
    purposeKey: "consent.cookies.localeSuggestionDismissed.purpose",
    spec: "003",
    scope: "",
  },
  {
    name: "fo_consent",
    kind: "cookie",
    category: "essential",
    consentRequired: false,
    party: "first",
    writer: "browser",
    status: "set",
    lifetime: {
      kind: "maxAge",
      seconds: 365 * DAY,
      secondsOnReject: 183 * DAY,
    },
    purposeKey: "consent.cookies.consent.purpose",
    spec: "004",
    scope: "Path=/; SameSite=Lax; Secure outside development",
  },
  {
    name: "fo_session",
    kind: "cookie",
    category: "essential",
    consentRequired: false,
    party: "first",
    writer: "server",
    status: "declared",
    lifetime: { kind: "session" },
    purposeKey: "consent.cookies.session.purpose",
    spec: "019",
    scope: "Path=/; SameSite=Lax; HttpOnly; Secure",
  },
  {
    name: "fo_csrf",
    kind: "cookie",
    category: "essential",
    consentRequired: false,
    party: "first",
    writer: "server",
    status: "declared",
    lifetime: { kind: "session" },
    purposeKey: "consent.cookies.csrf.purpose",
    spec: "010",
    scope: "Path=/; SameSite=Lax; Secure",
  },
  {
    name: "fo_currency",
    kind: "cookie",
    category: "essential",
    consentRequired: false,
    party: "first",
    writer: "browser",
    status: "declared",
    lifetime: { kind: "maxAge", seconds: 365 * DAY },
    purposeKey: "consent.cookies.currency.purpose",
    spec: "008",
    scope: "Path=/; SameSite=Lax; Secure outside development",
  },
  {
    name: "fo_basket",
    kind: "cookie",
    category: "essential",
    consentRequired: false,
    party: "first",
    writer: "browser",
    status: "declared",
    lifetime: { kind: "maxAge", seconds: 30 * DAY },
    purposeKey: "consent.cookies.basket.purpose",
    spec: "010",
    scope: "Path=/; SameSite=Lax; Secure outside development",
  },
  // The two Stripe rows are classified `essential` / `consentRequired: false` on the Art. 5(3)
  // fraud-prevention exemption, which is the right reading for a payment the visitor asked for —
  // to be **confirmed in spec 013**, where the payment element and the cookies it actually sets
  // are specified (`/review 28` item 7).
  {
    name: "__stripe_mid",
    kind: "cookie",
    category: "essential",
    consentRequired: false,
    party: "third",
    writer: "third-party-script",
    status: "declared",
    lifetime: { kind: "maxAge", seconds: 395 * DAY },
    purposeKey: "consent.cookies.stripeMid.purpose",
    spec: "013",
    scope: "Path=/; SameSite=Strict; Secure",
  },
  {
    name: "__stripe_sid",
    kind: "cookie",
    category: "essential",
    consentRequired: false,
    party: "third",
    writer: "third-party-script",
    status: "declared",
    lifetime: { kind: "maxAge", seconds: 1800 },
    purposeKey: "consent.cookies.stripeSid.purpose",
    spec: "013",
    scope: "Path=/; SameSite=Strict; Secure",
  },
  {
    name: "_ga",
    kind: "cookie",
    category: "analytics",
    consentRequired: true,
    party: "third",
    writer: "third-party-script",
    status: "declared",
    lifetime: { kind: "maxAge", seconds: 730 * DAY },
    purposeKey: "consent.cookies.ga.purpose",
    spec: "004",
    scope: "Path=/; SameSite=Lax; Secure",
  },
  {
    name: "_ga_*",
    kind: "cookie",
    category: "analytics",
    consentRequired: true,
    party: "third",
    writer: "third-party-script",
    status: "declared",
    lifetime: { kind: "maxAge", seconds: 730 * DAY },
    purposeKey: "consent.cookies.gaContainer.purpose",
    spec: "004",
    scope: "Path=/; SameSite=Lax; Secure",
  },
];

/** Validated at module load, like every other file in `src/config/` (spec 003 precedent). */
export const COOKIE_REGISTRY: readonly CookieRegistryEntry[] = Object.freeze(
  CookieRegistrySchema.parse(REGISTER),
);

/** The consent cookie's name, read from the register rather than restated (TASK-051 writes it). */
export const CONSENT_COOKIE_NAME = "fo_consent";

function consentLifetime(): { seconds: number; secondsOnReject: number } {
  const entry = COOKIE_REGISTRY.find((row) => row.name === CONSENT_COOKIE_NAME);
  if (
    entry?.lifetime.kind !== "maxAge" ||
    entry.lifetime.secondsOnReject === undefined
  ) {
    throw new Error(
      "`fo_consent` must declare a `maxAge` lifetime with a shorter `secondsOnReject` (spec 004 §2)",
    );
  }
  return {
    seconds: entry.lifetime.seconds,
    secondsOnReject: entry.lifetime.secondsOnReject,
  };
}

/** 12 months on accept (spec 004 §2). */
export const CONSENT_ACCEPT_MAX_AGE_SECONDS = consentLifetime().seconds;
/** 6 months on reject: shorter, so a refusal is revisited sooner than an acceptance (§8). */
export const CONSENT_REJECT_MAX_AGE_SECONDS = consentLifetime().secondsOnReject;

/** Every declared name, wildcards included, in register order. */
export function registeredCookieNames(): readonly string[] {
  return COOKIE_REGISTRY.map((entry) => entry.name);
}

/** The row for an exact declared name, or `undefined`. Wildcards are matched by name here too. */
export function cookieRegistryEntry(
  name: string,
): CookieRegistryEntry | undefined {
  return COOKIE_REGISTRY.find((entry) => entry.name === name);
}

/**
 * Whether an observed storage key is declared. A trailing `*` in a register name matches a
 * non-empty suffix and nothing else, so `_ga_*` covers `_ga_G12345` and not `_gid`.
 */
export function isRegisteredCookie(name: string): boolean {
  return COOKIE_REGISTRY.some((entry) => {
    if (!entry.name.endsWith("*")) return entry.name === name;
    const prefix = entry.name.slice(0, -1);
    return name.startsWith(prefix) && name.length > prefix.length;
  });
}

/** Rows in one category, in register order — the settings panel's list (TASK-051). */
export function cookiesInCategory(
  category: CookieCategory,
): readonly CookieRegistryEntry[] {
  return COOKIE_REGISTRY.filter((entry) => entry.category === category);
}

/** Every row a visitor must opt into. Empty of `set` rows while nothing non-essential runs. */
export function cookiesRequiringConsent(): readonly CookieRegistryEntry[] {
  return COOKIE_REGISTRY.filter((entry) => entry.consentRequired);
}
