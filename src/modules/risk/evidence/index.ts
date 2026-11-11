/**
 * `buildEvidencePack(orderId)` (spec 021 §5.2 "Evidence pack", §8 flow 2, §13 Q8; AC-28;
 * TASK-495): the chargeback evidence PDF of one order, built on demand from immutable records and
 * never stored by us. The route (`GET /admin/risk/evidence/[orderId]`, `risk.evidence`) hands in
 * the admin catalogue's captions, the payment's authorisation facts (spec 013's `riskFactsFor`,
 * through the job layer's provider) and the private-bucket photo reader (spec 011), so this
 * module imports neither `payments` nor `admin`.
 *
 * At most `EVIDENCE_MAX_BYTES` (4.5 MB) and `EVIDENCE_MAX_PAGES` (19 pages), Stripe's and
 * Mastercard's limits: a pack over either throws `EvidencePackTooLarge` (the photo is spec 011's
 * 1,200 px JPEG, so a real order stays far under both). A `demo` order has no pack (`null`).
 */
import { createTranslator } from "next-intl";

import { isLocaleCode } from "@/config/locales";
import { loadMessages } from "@/modules/i18n";

import type { RiskTransaction } from "../context.ts";

import { type EvidenceFacts, evidenceFacts } from "./facts.ts";
import {
  type EvidenceAuthorisation,
  type EvidenceTranslate,
  renderEvidencePack,
} from "./pdf.ts";

export { EVIDENCE_STEPS, type EvidenceFacts, evidenceFacts } from "./facts.ts";
export {
  type EvidenceAuthorisation,
  type EvidenceRenderInput,
  type EvidenceTranslate,
  renderEvidencePack,
} from "./pdf.ts";

/** Stripe's upload limit for dispute evidence (4.5 MB). */
export const EVIDENCE_MAX_BYTES = 4_718_592;
/** Mastercard's page limit for evidence (19 pages). */
export const EVIDENCE_MAX_PAGES = 19;

export class EvidencePackTooLarge extends Error {
  readonly code = "EVIDENCE_PACK_TOO_LARGE";

  constructor() {
    super("EVIDENCE_PACK_TOO_LARGE");
    this.name = "EvidencePackTooLarge";
  }
}

export interface EvidencePackDeps {
  /** A read transaction (admin context in the route). */
  readonly transaction: RiskTransaction;
  /** How the payment was authenticated, as the provider reports it now. */
  readonly authorisationFor: (
    orderId: string,
  ) => Promise<EvidenceAuthorisation>;
  /** The delivery photo's bytes from the private bucket, or `null` when it cannot be read. */
  readonly photoBytes: (location: {
    readonly bucket: string;
    readonly objectKey: string;
  }) => Promise<Buffer | null>;
  readonly t: EvidenceTranslate;
  readonly now?: () => Date;
}

/** `checkout.legal.cancellation` in the buyer's locale (the sentence they saw at checkout). */
export function cancellationSentence(locale: string): string {
  const code = isLocaleCode(locale) ? locale : "en";
  const t = createTranslator({
    locale: code,
    messages: loadMessages(code, ["checkout"]),
    namespace: "checkout.legal",
  });
  return t("cancellation");
}

const NOT_REPORTED: EvidenceAuthorisation = {
  threeDsResult: null,
  liabilityShift: null,
  cardBrand: null,
  cardLast4: null,
};

/** The pack's PDF bytes, or `null` for an unknown or `demo` order (the file header). */
export async function buildEvidencePack(
  orderId: string,
  deps: EvidencePackDeps,
): Promise<Uint8Array | null> {
  const facts: EvidenceFacts | null = await deps.transaction((executor) =>
    evidenceFacts(executor, orderId),
  );
  if (facts === null || facts.mode === "demo") return null;
  const [authorisation, photo] = await Promise.all([
    deps.authorisationFor(facts.orderId).catch(() => NOT_REPORTED),
    facts.photo === null
      ? Promise.resolve(null)
      : deps.photoBytes(facts.photo).catch(() => null),
  ]);
  const { bytes, pages } = await renderEvidencePack({
    facts,
    authorisation,
    photo,
    cancellation: cancellationSentence(facts.locale),
    t: deps.t,
    generatedAt: (deps.now ?? (() => new Date()))(),
  });
  if (bytes.byteLength > EVIDENCE_MAX_BYTES || pages > EVIDENCE_MAX_PAGES) {
    throw new EvidencePackTooLarge();
  }
  return bytes;
}
