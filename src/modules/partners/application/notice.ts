/**
 * The version of the notice at collection (spec 011 §2 "The notice at collection", §8
 * "Transparency at collection"; AC-11; TASK-213): what `partner_application.privacy_notice_version`
 * records, so a row says which Art. 13 text its applicant was shown.
 *
 * Derived, not authored: `apply-notice-` and the first 16 hex characters of the SHA-256 of the
 * page locale's `forFlorists.apply.notice` messages (heading, controller line, privacy link and
 * body, in key order). Any change to the wording, in any locale, is a new version with no step to
 * forget, and two rows with the same version were shown the same words. 29 characters, inside
 * `0022`'s 64-character bound.
 */
import { createHash } from "node:crypto";

import { loadMessages } from "@/modules/i18n";

/** The prefix every version carries, so the column reads as what it is. */
export const NOTICE_VERSION_PREFIX = "apply-notice-";

/** Keys sorted at every depth, so the hash depends on the words and not on file order. */
function canonical(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, canonical(record[key])]),
  );
}

export function applicationNoticeVersion(locale: string): string {
  const messages = loadMessages(locale, ["forFlorists"]) as {
    readonly forFlorists?: { readonly apply?: { readonly notice?: unknown } };
  };
  const notice = messages.forFlorists?.apply?.notice;
  if (notice === undefined) {
    throw new Error(`no forFlorists.apply.notice in ${locale}`);
  }
  const digest = createHash("sha256")
    .update(JSON.stringify(canonical(notice)))
    .digest("hex");
  return `${NOTICE_VERSION_PREFIX}${digest.slice(0, 16)}`;
}
