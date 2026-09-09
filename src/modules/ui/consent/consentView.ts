/**
 * The server-side projection the consent islands render (spec 004 §5.3, §7, §8, AC-19, AC-20;
 * TASK-051).
 *
 * Everything that needs the message catalogue or the cookie register happens here, on the server,
 * once per document: the copy is resolved with the same translator the footer uses, the categories
 * and their rows come from `src/config/cookies.ts`, and the lifetimes are formatted through ICU
 * plurals in the catalogue rather than through an `Intl` call (§7 — this spec adds no formatter,
 * and `fo/no-adhoc-intl` enforces it).
 *
 * ## Why the categories come from the register and not from a list here
 *
 * AC-20's last clause is "the settings panel lists every register entry in the category with its
 * purpose and lifetime". Written as a projection of `COOKIE_REGISTRY`, that clause is *true by
 * construction*: a row added to the register in spec 013 or 023 appears in the panel with no edit
 * to a component and no second list to forget. The categories themselves are `cookieCategories`,
 * so a category with no rows yet — `marketing` today — is still disclosed, with an honest note
 * instead of an empty table. The alternative (list only categories that have rows) would mean the
 * first marketing cookie ever set was consented to on a panel that never named it.
 *
 * Lifetime is the register's `seconds`, i.e. the **acceptance** lifetime for `fo_consent`; the
 * shorter `secondsOnReject` is a property of the write, not of the disclosure, and it is stated in
 * `docs/compliance/cookie-register.md` and in the cookie's own purpose copy.
 */
import {
  CONSENT_ACCEPT_MAX_AGE_SECONDS,
  CONSENT_COOKIE_NAME,
  CONSENT_REJECT_MAX_AGE_SECONDS,
  type CookieRegistryEntry,
  cookieCategories,
  cookiesInCategory,
} from "@/config/cookies";
import { CONSENT_POLICY_VERSION } from "@/lib/consent";

import { CONSENT_REOPEN_ATTRIBUTE } from "../layout/SiteFooter";

import type {
  ConsentCategoryView,
  ConsentCookieView,
  ConsentView,
} from "./consentTypes";

/**
 * `POST /api/consent`, the route `src/app/api/consent/route.ts` serves (§5.2). A constant rather
 * than a literal in the island, so the path a browser posts to and the route that answers are
 * asserted against each other in `tests/unit/consent-islands.test.tsx`.
 */
export const CONSENT_ENDPOINT = "/api/consent";

/**
 * The two message keys of each category, written out rather than built from the category id.
 * `pnpm i18n:check`'s usage scan reads source text, so a key assembled in a template literal is
 * a key it reports as dead — and that is the right call for a gate that must not be fooled: a
 * catalogue key with no literal in the tree is one nobody can grep for either.
 */
const CATEGORY_KEYS: Readonly<
  Record<string, { readonly name: string; readonly purpose: string }>
> = {
  essential: {
    name: "consent.category.essential.name",
    purpose: "consent.category.essential.purpose",
  },
  analytics: {
    name: "consent.category.analytics.name",
    purpose: "consent.category.analytics.purpose",
  },
  marketing: {
    name: "consent.category.marketing.name",
    purpose: "consent.category.marketing.purpose",
  },
};

/** Seconds in a day; the register's own unit for everything but `__stripe_sid`. */
const DAY_SECONDS = 86_400;

/**
 * A translator bound to the **root** of the catalogue, so a fully-qualified key from the register
 * (`consent.cookies.ga.purpose`) can be resolved without re-deriving its namespace. The caller
 * narrows next-intl's key union once, exactly as `SiteFooter` does for `footer.group.*`.
 */
export type ConsentTranslate = (
  key: string,
  values?: Record<string, number | string>,
) => string;

/**
 * How long a row is kept, as a sentence. Two ICU keys and no `Intl` call: `session` for storage
 * that dies with the tab, `minutes` for the sub-day rows (`__stripe_sid` is 30 minutes) and
 * `days` for everything else. Rounded, because a disclosure is not an audit log.
 */
export function lifetimeLabel(
  entry: CookieRegistryEntry,
  translate: ConsentTranslate,
): string {
  if (entry.lifetime.kind === "session") {
    return translate("consent.lifetime.session");
  }
  const seconds = entry.lifetime.seconds;
  if (seconds < DAY_SECONDS) {
    return translate("consent.lifetime.minutes", {
      count: Math.max(1, Math.round(seconds / 60)),
    });
  }
  return translate("consent.lifetime.days", {
    count: Math.max(1, Math.round(seconds / DAY_SECONDS)),
  });
}

function cookieView(
  entry: CookieRegistryEntry,
  translate: ConsentTranslate,
): ConsentCookieView {
  return {
    name: entry.name,
    purpose: translate(entry.purposeKey),
    lifetime: lifetimeLabel(entry, translate),
  };
}

/** The whole projection. Pure: same register plus same catalogue gives the same object. */
export function consentView(translate: ConsentTranslate): ConsentView {
  const categories: ConsentCategoryView[] = cookieCategories.map((category) => {
    const rows = cookiesInCategory(category).map((entry) =>
      cookieView(entry, translate),
    );
    const locked = category === "essential";
    const keys = CATEGORY_KEYS[category];
    if (keys === undefined) {
      // Unreachable while `CATEGORY_KEYS` covers `cookieCategories`, which
      // `tests/unit/consent-view.test.ts` asserts. Thrown rather than rendered blank, because a
      // category with no disclosure is a category nobody consented to.
      throw new Error(
        `no consent copy for the cookie category \`${category}\``,
      );
    }
    return {
      key: category,
      name: translate(keys.name),
      purpose: translate(keys.purpose),
      locked,
      ...(locked ? { lockedReason: translate("consent.essentialLocked") } : {}),
      cookies: rows,
      ...(rows.length === 0
        ? { emptyNote: translate("consent.categoryEmpty") }
        : {}),
    };
  });

  return {
    strings: {
      headline: translate("consent.headline"),
      body: translate("consent.body"),
      reject: translate("consent.reject"),
      settings: translate("consent.settings"),
      accept: translate("consent.accept"),
      settingsHeadline: translate("consent.settingsHeadline"),
      save: translate("consent.save"),
      saved: translate("consent.saved"),
      close: translate("consent.close"),
    },
    config: {
      cookieName: CONSENT_COOKIE_NAME,
      policyVersion: CONSENT_POLICY_VERSION,
      acceptMaxAgeSeconds: CONSENT_ACCEPT_MAX_AGE_SECONDS,
      rejectMaxAgeSeconds: CONSENT_REJECT_MAX_AGE_SECONDS,
      endpoint: CONSENT_ENDPOINT,
      reopenAttribute: CONSENT_REOPEN_ATTRIBUTE,
    },
    categories,
  };
}
