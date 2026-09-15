/**
 * `robots.txt` (spec 001 AC-15; spec 007 AC-12, TASK-090).
 *
 * Spec 001 disallowed everything in **every** environment, because nothing was indexable and a
 * `*.vercel.app` production alias without a custom domain is still crawlable. Spec 007 lifts that
 * for exactly one case — production on the canonical host — and the decision lives in
 * `modules/seo` with the robots directive and the sitemap membership, so the file and the pages
 * cannot disagree (`plan/02` §7, §10; ADR-0007).
 *
 * The environment is read here, at the route, and handed to a pure module function — the
 * `devUiEnabled(process.env)` / `ga4MeasurementId(process.env)` pattern — so `modules/seo` needs
 * neither `server-only` nor a module-load parse. Both facts are build-time constants of a
 * deployment, so the file is still statically generated: no request, no `headers()`, no `Vary`
 * (spec 001 §5.4, spec 007 §5.4).
 */
import type { MetadataRoute } from "next";

import { deploymentDescriptor, robotsMetadataRoute } from "@/modules/seo";

export default function robots(): MetadataRoute.Robots {
  return robotsMetadataRoute(deploymentDescriptor(process.env));
}
