/**
 * @purpose POST /admin/api/media: upload one photo, metadata stripped, stored privately, derive job enqueued (012b AC-22)
 * @spec 012b
 *
 * Spec 012b §2.7, §5.2 (TASK-299). `media.upload` (admin, content) is the first statement: no
 * session 401, no permission 403, and nothing is read. A body declared larger than 15 MiB plus
 * the form's envelope is refused before a byte is read; an undeclared one stops being read once
 * it passes that bound. Then `uploadPhoto` refuses, in order, a delivery photo, a florist photo
 * with no florist, a missing provenance field, a file that is not JPEG, PNG or WebP by its magic
 * bytes (an SVG, a HEIC), more than 15 MiB, more than 40 megapixels; nothing is stored on any
 * refusal. The answer is JSON for the upload island (`{ ok, assetId }` or `{ ok, reason }`), or a
 * `303` back to the photos page for a plain form post. Never cached, never indexed.
 */
import { MEDIA_UPLOAD_CONFIG } from "@/config/media-upload";
import { ADMIN_CACHE_HEADER, ADMIN_ROBOTS_HEADER } from "@/lib/admin-headers";
import {
  type UploadResult,
  adminRequestId,
  requirePermission,
  uploadPhoto,
} from "@/modules/admin";

export const dynamic = "force-dynamic";

/** Room for the form's text fields and the multipart boundaries around the file. */
const ENVELOPE_BYTES = 64 * 1024;
const LIMIT = MEDIA_UPLOAD_CONFIG.maxBytes + ENVELOPE_BYTES;

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

const STATUS: Readonly<Record<string, number>> = {
  too_large: 413,
  storage_unconfigured: 503,
  duplicate: 409,
};

function answer(request: Request, result: UploadResult): Response {
  const wantsJson = (request.headers.get("accept") ?? "").includes(
    "application/json",
  );
  if (!wantsJson) {
    const query = new URLSearchParams(
      result.ok
        ? { result: "uploaded" }
        : { result: "refused", reason: result.reason },
    );
    const location = result.ok
      ? `/admin/media/${result.assetId}?${query.toString()}`
      : `/admin/media?upload=1&${query.toString()}`;
    return new Response(null, {
      status: 303,
      headers: { ...HEADERS, Location: location },
    });
  }
  const status = result.ok ? 201 : (STATUS[result.reason] ?? 422);
  return Response.json(result, { status, headers: HEADERS });
}

export async function POST(request: Request): Promise<Response> {
  const session = await requirePermission("media.upload");
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > LIMIT) {
    await request.body?.cancel();
    return answer(request, { ok: false, reason: "too_large" });
  }
  const body = await readCapped(request, LIMIT);
  if (body === undefined) {
    return answer(request, { ok: false, reason: "too_large" });
  }
  let form: FormData;
  try {
    form = await new Response(body, {
      headers: { "content-type": request.headers.get("content-type") ?? "" },
    }).formData();
  } catch {
    return answer(request, { ok: false, reason: "empty" });
  }
  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0) {
    return answer(request, { ok: false, reason: "empty" });
  }
  if (file.size > MEDIA_UPLOAD_CONFIG.maxBytes) {
    return answer(request, { ok: false, reason: "too_large" });
  }
  const fields: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string" && !key.startsWith("$")) fields[key] = value;
  }
  const result = await uploadPhoto(
    {
      userId: session.userId,
      requestId: await adminRequestId(),
      roles: session.roles,
    },
    fields,
    new Uint8Array(await file.arrayBuffer()),
  );
  return answer(request, result);
}
