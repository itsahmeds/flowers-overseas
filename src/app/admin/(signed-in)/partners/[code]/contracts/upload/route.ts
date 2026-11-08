/**
 * @purpose POST /admin/partners/[code]/contracts/upload: store a florist's signed PDF (030b AC-37)
 * @spec 030b
 *
 * Spec 030b §14.4 "upload, exactly", §5.4 (TASK-442). `partner.contract.write` (admin only) is the
 * first statement; without a session 401, without the permission 403, and nothing is read or
 * stored. The multipart body is read as a stream and the read stops once it passes the 10 MiB
 * cap plus the form's envelope (`contract.too_large`, nothing buffered beyond). Then the command:
 * `checkPdf`, `Storage.put` to the private bucket, one transaction. The answer is a `303` back to
 * the Contracts tab naming the outcome as codes (no file name, note or value in the URL).
 */
import { CONTRACTS_CONFIG } from "@/config/contracts";
import { ADMIN_CACHE_HEADER, ADMIN_ROBOTS_HEADER } from "@/lib/admin-headers";
import { adminRequestId, requirePermission } from "@/modules/admin";
import { partnerHead } from "@/modules/partners";
import { uploadContract } from "@/modules/partners/contracts";

import { PartnerCodeSchema } from "../../../view";
import { contractErrorsParam } from "../view";

export const dynamic = "force-dynamic";

/** Room for the form's text fields and the multipart boundaries around the file. */
const ENVELOPE_BYTES = 64 * 1024;

const HEADERS = {
  [ADMIN_CACHE_HEADER.key]: ADMIN_CACHE_HEADER.value,
  [ADMIN_ROBOTS_HEADER.key]: ADMIN_ROBOTS_HEADER.value,
};

/** The body, or `undefined` once it passes `limit` (the read stops there). */
async function readCapped(
  request: Request,
  limit: number,
): Promise<Uint8Array<ArrayBuffer> | undefined> {
  const reader = request.body?.getReader();
  if (reader === undefined) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function back(code: string, params: Record<string, string>): Response {
  const query = new URLSearchParams({ form: "upload", ...params });
  return new Response(null, {
    status: 303,
    headers: {
      ...HEADERS,
      Location: `/admin/partners/${encodeURIComponent(code)}/contracts?${query.toString()}`,
    },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  const session = await requirePermission("partner.contract.write");
  const code = PartnerCodeSchema.safeParse((await params).code);
  if (!code.success)
    return new Response(null, { status: 404, headers: HEADERS });
  const actor = { userId: session.userId, requestId: await adminRequestId() };
  const head = await partnerHead(actor, code.data);
  if (head === undefined)
    return new Response(null, { status: 404, headers: HEADERS });

  const body = await readCapped(
    request,
    CONTRACTS_CONFIG.maxBytes + ENVELOPE_BYTES,
  );
  if (body === undefined)
    return back(head.code, { result: "rule", rule: "too_large" });
  let form: FormData;
  try {
    form = await new Response(body, {
      headers: { "content-type": request.headers.get("content-type") ?? "" },
    }).formData();
  } catch {
    return back(head.code, { result: "rule", rule: "not_pdf" });
  }
  const file = form.get("file");
  const fields: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string" && !key.startsWith("$")) fields[key] = value;
  }
  if (!(file instanceof Blob) || file.size === 0) {
    return back(head.code, { result: "invalid", err: "file:required" });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await uploadContract(actor, head.id, fields, bytes);
  if (result.ok) {
    return back(head.code, { result: "uploaded", entry: result.contractId });
  }
  if (result.reason === "rule") {
    return back(head.code, {
      result: "rule",
      rule: result.ruleId.replace("contract.", ""),
    });
  }
  if (result.reason === "invalid") {
    return back(head.code, {
      result: "invalid",
      err: contractErrorsParam(result.errors),
    });
  }
  return back(head.code, { result: result.reason });
}
