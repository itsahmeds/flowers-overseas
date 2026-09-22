/**
 * `Organization`, carrying only the facts `src/config/company.ts` actually holds (spec 007 §2
 * "Schema", §5.2 L65, AC-15; T-16; `plan/02` §9; `plan/07` §6; TASK-093).
 *
 * The Phase 0 company is `registered: false`: there is no Estonian OÜ yet, so there is no legal
 * name, no registry number, no VAT id and no registered address, and `CompanySchema` refuses to
 * hold one without the others. Structured data is exactly where an invented registry fact would do
 * the most damage — it is a machine-readable claim about a legal entity — so this builder is
 * written as a projection of that config and of nothing else:
 *
 *  - always `name` (the trading name), `url` (the site origin) and `logo` (the committed
 *    `public/icon.svg`, absolute as Google requires);
 *  - `address`, `vatID` and `sameAs` **only** when `company.registered` is true, and each only when
 *    its value is present. Flipping the flag with the five registry fields filled in is therefore
 *    the whole change — the same data flip the footer already obeys (spec 004 AC-9).
 *
 * `sameAs` is a caller-supplied list because no registry of social profiles exists in the repo:
 * an absent list stays absent rather than becoming `[]`, and a profile we do not own can never be
 * guessed here. Nothing else is added — no `ContactPoint` (the support number is a channel we
 * answer, not a published sales line), no `description`, no `foundingDate`.
 */
import type { Company, RegisteredAddress } from "../../../config/company.ts";
import {
  absoluteUrl,
  siteOrigin,
  type CanonicalOptions,
} from "../canonical.ts";

import type { JsonLdNode } from "./JsonLd.tsx";

/** The committed brand mark (`public/icon.svg`), the only logo asset this site has. */
export const ORGANIZATION_LOGO_PATH = "/icon.svg";

export interface OrganizationOptions extends CanonicalOptions {
  /** Verified profile URLs, when there are any. Absent and empty both emit no `sameAs`. */
  readonly sameAs?: readonly string[];
}

function postalAddress(address: RegisteredAddress): JsonLdNode {
  return {
    "@type": "PostalAddress",
    streetAddress: address.lines.join(", "),
    postalCode: address.postalCode,
    addressLocality: address.city,
    addressCountry: address.countryIso2,
  };
}

export function organization(
  company: Company,
  options: OrganizationOptions,
): JsonLdNode {
  const { baseUrl } = options;
  const sameAs = options.sameAs ?? [];
  const identity = {
    "@type": "Organization",
    name: company.tradingName,
    url: siteOrigin(baseUrl),
    logo: absoluteUrl(ORGANIZATION_LOGO_PATH, { baseUrl }),
  };

  // `registered: false` is the whole of Phase 0: nothing below exists, and `CompanySchema`
  // guarantees the optionals are absent rather than empty, so there is nothing to withhold.
  if (!company.registered) return identity;

  return {
    ...identity,
    ...(company.address === undefined
      ? {}
      : { address: postalAddress(company.address) }),
    ...(company.vatId === undefined ? {} : { vatID: company.vatId }),
    ...(sameAs.length === 0 ? {} : { sameAs: [...sameAs] }),
  };
}
