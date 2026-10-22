/**
 * The florist surface's copy (spec 011 §7; TASK-212): one translator per florist language over
 * the three namespaces the surface reads, `floristAuth`, `floristInbox` and `emails`.
 *
 * The language is never `Accept-Language` and never an IP (ADR-0006): it is the member's
 * `partner_member.locale_code` once signed in, and `?hl=` (default `en`) before (§7). Strings are
 * `messages/{en,pl,de}.json`; `pl` and `de` are machine drafts (`reviewed: false`) until a native
 * reviewer approves them (§13 Q10). The keys count toward no indexable locale's reviewed share
 * (`review-scope.ts`, spec 003 §14 A17): they render only under `FLORIST_BASE_PATH` and in email.
 */
import { createTranslator } from "next-intl";

import {
  DEFAULT_FLORIST_LANGUAGE,
  type FloristLanguage,
  FloristLanguageSchema,
} from "@/config/florists";
import { loadMessages } from "@/modules/i18n";

const NAMESPACES = ["floristAuth", "floristInbox", "emails"] as const;

/** A translator over the florist namespaces in `language`. */
export function floristTranslator(language: FloristLanguage) {
  return createTranslator({
    locale: language,
    messages: loadMessages(language, NAMESPACES),
  });
}

export type FloristTranslator = ReturnType<typeof floristTranslator>;

/** `value` as a florist language, or the default (`en`): `?hl=` and stored values both pass here. */
export function floristLanguageOf(value: unknown): FloristLanguage {
  const parsed = FloristLanguageSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_FLORIST_LANGUAGE;
}
