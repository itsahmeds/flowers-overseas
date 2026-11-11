/**
 * @purpose GET /admin/risk/evidence/[orderId]: the chargeback evidence pack PDF, built on demand (021 AC-28)
 * @spec 021
 *
 * Spec 021 §5.2 "Evidence pack", §13 Q8 (TASK-495). `risk.evidence` first (admin only): no session
 * is 401, another role 403, and nothing is read. Then `buildEvidencePack` on an admin-context read
 * (the facts from immutable records; the payment's authorisation from spec 013's `riskFactsFor`
 * through the environment's provider; the delivery photo from spec 011's private bucket), one
 * audit read row (`logAdminRead('order_evidence', orderId)`, action `order_evidence.viewed`), and
 * the PDF as an attachment with `Cache-Control: no-store, private`. Nothing is stored. A malformed
 * id, an unknown order or a demo order is 404. Nothing is logged but the order id.
 */
import { z } from "zod";

import { ADMIN_CACHE_HEADER, ADMIN_ROBOTS_HEADER } from "@/lib/admin-headers";
import {
  adminRequestId,
  adminT,
  logAdminRead,
  requirePermission,
} from "@/modules/admin";
import { riskFactsFor, stripeProviderFromEnv } from "@/modules/payments";
import {
  type EvidenceTranslate,
  adminRiskTransaction,
  buildEvidencePack,
} from "@/modules/risk";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = {
  [ADMIN_CACHE_HEADER.key]: ADMIN_CACHE_HEADER.value,
  [ADMIN_ROBOTS_HEADER.key]: ADMIN_ROBOTS_HEADER.value,
};

/** The stored delivery photo: some bytes, at most spec 011's ceiling. */
const PhotoBytes = z
  .instanceof(ArrayBuffer)
  .refine(
    (buffer) => buffer.byteLength > 0 && buffer.byteLength <= 15 * 1024 * 1024,
  );

export async function GET(
  _request: Request,
  context: { params: Promise<{ orderId: string }> },
): Promise<Response> {
  const session = await requirePermission("risk.evidence");
  const parsed = z.uuid().safeParse((await context.params).orderId);
  if (!parsed.success) {
    return new Response(null, { status: 404, headers: HEADERS });
  }
  const orderId = parsed.data;
  const actor = { userId: session.userId, requestId: await adminRequestId() };
  const pdf = await buildEvidencePack(orderId, {
    transaction: adminRiskTransaction({ ...actor, action: "risk.read" }),
    authorisationFor: async (id) => {
      const facts = await riskFactsFor(id, {
        provider: stripeProviderFromEnv(),
      });
      return {
        threeDsResult: facts.threeDsResult,
        liabilityShift: facts.liabilityShift,
        cardBrand: facts.cardBrand,
        cardLast4: facts.cardLast4,
      };
    },
    photoBytes: async (location) => {
      const { deliveryPhotoSignedUrl, privatePhotoStoreFrom } =
        await import("@/modules/orders/photo");
      const url = await deliveryPhotoSignedUrl(
        privatePhotoStoreFrom(),
        location,
      );
      const response = await fetch(url);
      if (!response.ok) return null;
      return Buffer.from(PhotoBytes.parse(await response.arrayBuffer()));
    },
    t: adminT as unknown as EvidenceTranslate,
  });
  if (pdf === null) {
    return new Response(null, { status: 404, headers: HEADERS });
  }
  await logAdminRead(actor, "order_evidence", orderId);
  return new Response(Buffer.from(pdf), {
    status: 200,
    headers: {
      ...HEADERS,
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="evidence-${orderId}.pdf"`,
    },
  });
}
