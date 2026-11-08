/**
 * The deferred GA4 chunk (spec 023 §5.2 "gtag configuration", "Client events", "Loading and
 * withdrawal", AC-2, AC-3, AC-7 to AC-14, AC-18; ADR-0022; TASK-492). At most 4 096 B Brotli,
 * imported only by `./loader.ts` after an analytics grant, after `load` and idle.
 *
 * It injects `gtag.js`, queues `js` and the one `config` with §5.2's options, sends a manual
 * `page_view` per route (first load and each client-side navigation, none on a same-route
 * re-render), sends the server-built events of the page payload (`data-fo-analytics`, built by
 * `../page.ts` from the page's view model), listens for `select_item`, `select_item_variant`,
 * `select_delivery_date` and `add_to_cart`, reports `web_vital`, and publishes
 * `window.__foAnalytics` for the islands (`add_payment_info`, `select_payment_method`,
 * `begin_checkout` from the wallet sheet, `login`).
 *
 * No money arithmetic: every `price` and `value` arrives finished in the payload. No zod: the
 * payload is the server's own bytes, and the schemas live in `../page.ts`. No user id, ever.
 */
import { type Metric, onCLS, onINP, onLCP } from "web-vitals";

import { ga4TagUrl } from "../ga4";
import {
  isPrivateLocation,
  sanitisePageLocation,
  sanitiseReferrer,
} from "../location";

type Params = Record<string, unknown>;

interface PagePayload {
  readonly common: Params;
  readonly events?: readonly { readonly name: string; readonly params: Params }[];
  readonly tiers?: Readonly<Record<string, Params>>;
  readonly tz?: string;
  readonly checkout?: Params;
}

/** What the islands may call, optionally chained: a no-op while analytics is not running. */
export interface ClientApi {
  track(name: string, params?: Params): void;
  stop(): void;
}

type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  __foAnalytics?: ClientApi;
} & Record<string, unknown>;

const w = window as unknown as AnalyticsWindow;

let measurementId = "";
let running = false;
let configured = false;
let lastRoute = "";
let referrer = document.referrer;
let payload: PagePayload = { common: {} };

function gtag(...args: unknown[]): void {
  if (w.gtag !== undefined) {
    w.gtag(...args);
    return;
  }
  (w.dataLayer ??= []).push(args);
}

/** The document's payload: the last `data-fo-analytics` element, or the bare locale. */
function readPayload(): PagePayload {
  const elements = document.querySelectorAll("[data-fo-analytics]");
  const raw = elements[elements.length - 1]?.getAttribute("data-fo-analytics");
  const fallback: PagePayload = {
    common: {
      locale: document.documentElement.lang.toLowerCase(),
      page_type: "other",
    },
  };
  if (raw === null || raw === undefined) return fallback;
  try {
    const parsed = JSON.parse(raw) as PagePayload & {
      event?: string;
      params?: Params;
    };
    // Spec 045's results page renders its `search` event in this attribute (TASK-403).
    if (parsed.event !== undefined && parsed.params !== undefined) {
      return {
        common: { locale: parsed.params.locale, page_type: "search" },
        events: [{ name: parsed.event, params: parsed.params }],
      };
    }
    return typeof parsed.common === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function send(name: string, params: Params = {}): void {
  if (running) gtag("event", name, { ...params, ...payload.common });
}

function pageView(): void {
  const route = location.pathname + location.search;
  if (!running || route === lastRoute) return;
  lastRoute = route;
  payload = readPayload();
  const here = sanitisePageLocation(location.href);
  const from = sanitiseReferrer(referrer, location.origin);
  const title = isPrivateLocation(location.href)
    ? String(payload.common.page_type)
    : document.title;
  referrer = location.href;
  gtag("set", { page_location: here, page_referrer: from, page_title: title });
  send("page_view", {
    page_location: here,
    page_referrer: from,
    page_title: title,
  });
  for (const event of payload.events ?? []) send(event.name, event.params);
}

function afterNavigation(): void {
  setTimeout(pageView, 0);
}

function listItem(index: number): Params | undefined {
  const list = payload.events?.find((event) => event.name === "view_item_list");
  const items = list?.params.items as readonly Params[] | undefined;
  const item = items?.[index];
  return list === undefined || item === undefined
    ? undefined
    : {
        item_list_id: list.params.item_list_id,
        item_list_name: list.params.item_list_name,
        items: [item],
      };
}

/** Whole days from the destination's local today to `date` (`YYYY-MM-DD`). */
function daysAhead(date: string): number {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: payload.tz,
  }).format(new Date());
  return Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000);
}

function tierEvent(name: string, tierKey: unknown): void {
  const item = typeof tierKey === "string" ? payload.tiers?.[tierKey] : undefined;
  if (item === undefined) return;
  send(name, {
    currency: payload.common.display_currency,
    value: item.price,
    items: [item],
  });
}

function onClick(event: Event): void {
  const card =
    event.target instanceof Element
      ? event.target.closest("[data-fo-item]")
      : null;
  if (card === null) return;
  const selected = listItem(Number(card.getAttribute("data-fo-item")));
  if (selected !== undefined) send("select_item", selected);
}

function onChange(event: Event): void {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !input.checked) return;
  setTimeout(() => {
    if (input.name === "tier") {
      tierEvent("select_item_variant", input.value);
      return;
    }
    const chip = input.closest("[data-fo-date]");
    if (chip === null) return;
    const days = daysAhead(input.value);
    send("select_delivery_date", {
      days_ahead: days,
      is_same_day: days === 0,
      has_surcharge: chip.getAttribute("data-fo-date-state") === "surcharge",
    });
  }, 0);
}

function onSubmit(event: Event): void {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.hasAttribute("data-fo-pdp-form")) {
    return;
  }
  tierEvent("add_to_cart", new FormData(form).get("tier"));
}

const LISTENERS: readonly [string, (event: Event) => void][] = [
  ["click", onClick],
  ["change", onChange],
  ["submit", onSubmit],
];

function reportVital(metric: Metric): void {
  const { name, value: reading, rating } = metric;
  send("web_vital", {
    metric_name: name,
    metric_value: Math.round(name === "CLS" ? reading * 1000 : reading),
    metric_rating: rating,
  });
}

function track(name: string, params: Params = {}): void {
  send(name, name === "add_payment_info" ? { ...payload.checkout, ...params } : params);
}

/** A withdrawal: stop at once, switch the tag off and delete `_ga` and `_ga_*`. */
function stop(): void {
  running = false;
  w[`ga-disable-${measurementId}`] = true;
  for (const [type, listener] of LISTENERS) {
    document.removeEventListener(type, listener, true);
  }
  const host = location.hostname.split(".");
  for (const cookie of document.cookie.split("; ")) {
    const name = cookie.split("=")[0] ?? "";
    if (!/^_ga(?:_|$)/u.test(name)) continue;
    document.cookie = `${name}=; Max-Age=0; Path=/`;
    host.forEach((_, start) => {
      document.cookie = `${name}=; Max-Age=0; Path=/; Domain=${host.slice(start).join(".")}`;
    });
  }
}

/** Start (or restart after a withdrawal) for `id`. A second start while running is a no-op. */
export function startDeferred(id: string): void {
  if (running) return;
  measurementId = id;
  running = true;
  lastRoute = "";
  w[`ga-disable-${id}`] = false;
  for (const [type, listener] of LISTENERS) {
    document.addEventListener(type, listener, { capture: true, passive: true });
  }
  w.__foAnalytics = { track, stop };
  if (!configured) {
    configured = true;
    const script = document.createElement("script");
    script.async = true;
    script.src = ga4TagUrl(id);
    document.head.append(script);
    gtag("js", new Date());
    gtag("config", id, {
      send_page_view: false,
      page_location: sanitisePageLocation(location.href),
      page_referrer: sanitiseReferrer(referrer, location.origin),
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_expires: 31_536_000,
      cookie_update: false,
      cookie_flags: "SameSite=Lax;Secure",
      ...(process.env.NEXT_PUBLIC_APP_ENV === "production"
        ? {}
        : { debug_mode: true }),
    });
    for (const method of ["pushState", "replaceState"] as const) {
      const original = history[method].bind(history);
      history[method] = (...args: Parameters<History["pushState"]>) => {
        original(...args);
        afterNavigation();
      };
    }
    addEventListener("popstate", afterNavigation);
    onLCP(reportVital);
    onCLS(reportVital);
    onINP(reportVital);
  }
  pageView();
}
