/**
 * Company identity (spec 004 §2 "Everything data-gated is config", §5.1, §5.3 "Footer"; `plan/07`
 * §6; `plan/09` Phase 0; TASK-047).
 *
 * The colophon identity the founder-approved footer prints. The canvas writes it as
 * `Operated by [COMPANY LEGAL NAME], [REGISTERED ADDRESS], [REGISTRATION NO].` — three
 * placeholders for facts that **do not exist yet**: the Estonian OÜ is registered on `plan/09`'s
 * 1 Nov target, and inventing a registry number, a VAT id or a registered address is a `plan/07`
 * §6 offence, not a placeholder. So this module ships:
 *
 *  - `registered: false`, the trading name and the contact channel — the whole of what is true
 *    today; and
 *  - `legalName`, `registryName`, `registrationNumber`, `vatId` and `address` as **optionals**,
 *    refined so that `registered: true` requires *all* of them.
 *
 * That refinement is the point of the file (spec 004 AC-9, verified by TASK-049/T-11): a footer
 * cannot end up rendering "Operated by , , ." and the founder cannot flip the flag halfway. While
 * `registered` is false, `SiteFooter` renders the identity sentence **without** the missing
 * clauses — never the canvas's literal brackets, and never an empty `<dd>`.
 *
 * The contact numbers are data, not copy: `plan/13`'s help channel is one WhatsApp-capable
 * number, so it is stored once (E.164 for `tel:`/`wa.me` and the founder's display form for the
 * printed line) and the surrounding words are message keys (`company.*`). Opening hours are copy
 * because they are localised prose ("Mon–Sat 8–20 CET").
 *
 * No database is read here and none may be (`pnpm check:no-db`, spec 004 AC-2). Spec 007's
 * `/legal/company` page and the `Organization` schema it may emit read this same object, which is
 * why the registry fields are typed as absent rather than as empty strings.
 */
import { z } from "zod";

import { TRADING_NAME } from "./company.data.ts";

/** A dotted `company.*` message key. */
const MessageKeySchema = z
  .string()
  .regex(
    /^company\.[a-zA-Z0-9]+(?:\.[a-zA-Z0-9]+)*$/,
    "must be a dotted `company.*` message key",
  );

/** E.164: `+` and 8–15 digits (`plan/03` §8; the same shape spec 002 stores as `phone_e164`). */
const PhoneE164Schema = z
  .string()
  .regex(
    /^\+[1-9]\d{7,14}$/,
    "must be an E.164 phone number such as `+12135925150`",
  );

export const RegisteredAddressSchema = z
  .object({
    /** Street lines, as spec 002 §5.1 stores them (`lines text[]`). */
    lines: z.array(z.string().min(1)).min(1),
    postalCode: z.string().min(1),
    city: z.string().min(1),
    countryIso2: z
      .string()
      .regex(
        /^[A-Z]{2}$/,
        "must be a two-letter uppercase ISO-3166-1 alpha-2 code",
      ),
  })
  .strict();

export type RegisteredAddress = z.infer<typeof RegisteredAddressSchema>;

export const CompanyContactSchema = z
  .object({
    /** For `tel:` and `wa.me` targets. */
    phoneE164: PhoneE164Schema,
    /** The founder's printed form of the same number, exactly as the canvas prints it. */
    phoneDisplay: z.string().min(1),
    /** Both channels reach the same number (`plan/13`, design round 6). */
    whatsapp: z.boolean(),
    /** "Help & WhatsApp" — the channel label. */
    labelKey: MessageKeySchema,
    /** "Mon–Sat 8–20 CET" — localised prose, so a message key rather than structured hours. */
    hoursKey: MessageKeySchema,
  })
  .strict();

export type CompanyContact = z.infer<typeof CompanyContactSchema>;

export const CompanySchema = z
  .object({
    /** The brand the buyer transacts with. A proper noun: never translated, never a message. */
    tradingName: z.string().min(1),
    /**
     * Is there a registered legal entity? The Phase 0 answer is `false` and it gates every
     * registry field below (`plan/09` targets 1 Nov 2026 for the OÜ).
     */
    registered: z.boolean(),
    /** Registered legal name (`Flowers Overseas OÜ`), once it exists. */
    legalName: z.string().min(1).optional(),
    /** The register the number is held in (`Estonian Business Register`). */
    registryName: z.string().min(1).optional(),
    /** Company registration number, as issued. */
    registrationNumber: z.string().min(1).optional(),
    /** VAT identification number, as issued (`EE…`). */
    vatId: z.string().min(1).optional(),
    address: RegisteredAddressSchema.optional(),
    contact: CompanyContactSchema,
    /** The relay sentence the colophon opens with. */
    descriptionKey: MessageKeySchema,
    /** `Operated by {legalName}, {address}, {registrationNumber}.` — rendered only when registered. */
    operatedByKey: MessageKeySchema,
  })
  .strict()
  .superRefine((company, ctx) => {
    const required = [
      "legalName",
      "registryName",
      "registrationNumber",
      "vatId",
      "address",
    ] as const;
    if (company.registered) {
      for (const field of required) {
        if (company[field] === undefined) {
          ctx.addIssue({
            code: "custom",
            path: [field],
            message: `\`registered: true\` requires \`${field}\`: a company identity line missing its registry, VAT or address is either incomplete disclosure or an invented fact (spec 004 AC-9, plan/07 §6)`,
          });
        }
      }
      return;
    }
    // The other direction, so the flag cannot lag the data either: a registry number present
    // while `registered` is false would be rendered by nothing and audited by nobody.
    for (const field of required) {
      if (company[field] !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: `\`${field}\` is set while \`registered\` is false: flip \`registered\` in the same edit, or the footer withholds a fact it has`,
        });
      }
    }
  });

export type Company = z.infer<typeof CompanySchema>;

/**
 * The Phase 0 identity. Every registry field is deliberately absent, and the `superRefine` above
 * is what keeps that state internally consistent until the founder fills all five at once.
 */
const company = {
  // From the import-free data module, because the two 500 boundaries print the wordmark and may
  // not reach zod to get it (`./company.data.ts`; spec 004 §14 A1, TASK-055).
  tradingName: TRADING_NAME,
  registered: false,
  contact: {
    phoneE164: "+12135925150",
    phoneDisplay: "+1 (213) 592-5150",
    whatsapp: true,
    labelKey: "company.support.label",
    hoursKey: "company.support.hours",
  },
  descriptionKey: "company.description",
  operatedByKey: "company.operatedBy",
} as const;

/** Parsed at module load: an inconsistent identity throws on first import, not at request time. */
export const COMPANY: Company = CompanySchema.parse(company);

/**
 * **The** predicate over `registered` (spec 004 §5.1: one predicate per flag). `SiteFooter` asks
 * this before it renders a single registry clause.
 */
export function isCompanyRegistered(): boolean {
  return COMPANY.registered;
}
