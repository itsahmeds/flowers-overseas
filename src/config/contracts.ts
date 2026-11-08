/**
 * Florist contracts settings (spec 030b §14.4 `ContractsConfigSchema`; TASK-442).
 *
 *  - `maxBytes`: a stored PDF is at most 10 MiB (§13 Q18); the upload stops reading past it;
 *  - `signedUrlTtlSeconds`: a download link lives 60 seconds and is issued only on a click;
 *  - `withdrawWindowDays`: a wrong upload can be withdrawn for 7 days (§13 Q19), then only
 *    superseded (the database trigger holds the same 7 days);
 *  - `defaultNoticeDays`: the review reminder's default notice (§13 Q20);
 *  - `retentionYearsAfterOffboarding`: 10 years after the florist is offboarded (§13 Q16);
 *  - `docKinds`: the three stored kinds.
 *
 * No database here (`pnpm check:no-db` scans `src/config`).
 */
import { z } from "zod";

export const ContractsConfigSchema = z
  .object({
    maxBytes: z.literal(10_485_760),
    signedUrlTtlSeconds: z.number().int().min(1).max(300),
    withdrawWindowDays: z.number().int().min(1).max(30),
    defaultNoticeDays: z.number().int().min(0).max(365),
    retentionYearsAfterOffboarding: z.number().int().min(1),
    docKinds: z.tuple([
      z.literal("agreement"),
      z.literal("dpa_addendum"),
      z.literal("annex"),
    ]),
  })
  .strict();
export type ContractsConfig = z.infer<typeof ContractsConfigSchema>;

export const CONTRACTS_CONFIG: ContractsConfig = ContractsConfigSchema.parse({
  maxBytes: 10_485_760,
  signedUrlTtlSeconds: 60,
  withdrawWindowDays: 7,
  defaultNoticeDays: 30,
  retentionYearsAfterOffboarding: 10,
  docKinds: ["agreement", "dpa_addendum", "annex"],
});

export type ContractDocKind = ContractsConfig["docKinds"][number];
