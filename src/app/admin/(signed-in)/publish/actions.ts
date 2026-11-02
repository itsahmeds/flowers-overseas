/**
 * @purpose POST /admin/publish: the Publish button's server action
 * @spec 012b
 *
 * Thin (`plan/01` §5): `requirePermission("catalogue.publish")` is the first statement, then the
 * command (`requestPublishFromAdmin`, spec 012b §2.3, AC-6, AC-8; TASK-295), then a redirect that
 * names the outcome. A refusal writes nothing; its code (and, for an indexable removal, the
 * refused page paths, which are public addresses and never personal data) travel in the query.
 */
"use server";

import { redirect } from "next/navigation";

import { PublishError } from "@/lib/publish";
import {
  enqueuePublishJob,
  requestPublishFromAdmin,
} from "@/lib/publish-runtime";
import { adminRequestId, requirePermission } from "@/modules/admin";

/** The audit reason of a publish asked from this page. */
const PUBLISH_REASON = "publish asked on /admin/publish";

/** At most this many refused paths travel back in the query string. */
const REFUSED_IN_QUERY = 40;

export async function publishAction(): Promise<void> {
  const session = await requirePermission("catalogue.publish");
  const requestId = await adminRequestId();
  let params: URLSearchParams;
  try {
    await requestPublishFromAdmin({
      reason: PUBLISH_REASON,
      userId: session.userId,
      enqueue: (runId, addedUrls) =>
        enqueuePublishJob(runId, addedUrls, requestId),
    });
    params = new URLSearchParams({ result: "asked" });
  } catch (error) {
    if (!(error instanceof PublishError)) throw error;
    params = new URLSearchParams({ result: "refused", code: error.code });
    for (const url of error.urls.slice(0, REFUSED_IN_QUERY))
      params.append("url", url);
  }
  redirect(`/admin/publish?${params.toString()}`);
}
