/**
 * @purpose GET /admin/flags: registry flags, toggles, orphans
 * @spec 012
 *
 * Admin only (`flags.toggle`). The two database flags of the registry, by scope (a switch per
 * destination for `checkout.open`, one for `checkout.demo_guard`), and every key the database
 * holds that the registry does not name, as an orphan with no control (spec 012 §2.4, AC-14).
 * A standard switch is a form post; a high-risk one opens the typed-key confirmation, the page's
 * one client island. The outcome comes back in the query string and is shown as a toast or a
 * refusal. Artboards `admin-flags-desktop.dc.html` (table) and `admin-flags-mobile.dc.html`
 * (cards).
 */
import type { ReactElement, ReactNode } from "react";
import { z } from "zod";

import { isCountryIso2 } from "@/config/countries";
import {
  type FlagKey,
  type FlagScopeKind,
  isRegisteredFlagKey,
} from "@/config/feature-flags";
import {
  type FlagValueView,
  type OrphanFlagView,
  type RegisteredFlagView,
  adminRequestId,
  adminT,
  listFlags,
  requireAdminPage,
} from "@/modules/admin";
import { AdminPageTitle } from "@/modules/ui/admin/AdminChrome";
import { AdminConfirmSwitch } from "@/modules/ui/admin/AdminConfirmSwitch";
import {
  AdminRefusal,
  AdminSwitch,
  AdminToast,
} from "@/modules/ui/admin/AdminControls";
import {
  AdminCell,
  AdminChip,
  AdminCode,
  AdminNote,
  AdminRow,
  AdminSecondLine,
  AdminTable,
} from "@/modules/ui/admin/AdminData";

import { AdminFrame } from "../frame";
import { toggleFlagAction } from "./actions";

const SAVED = ["on", "off", "unchanged"] as const;
const REFUSED = [
  "invalid",
  "unregistered",
  "forbidden",
  "mismatch",
  "conflict",
  "not_seeded",
] as const;

const ResultSchema = z.object({
  result: z
    .enum([...SAVED, ...REFUSED])
    .optional()
    .catch(undefined),
  key: z
    .string()
    .refine((key) => isRegisteredFlagKey(key))
    .optional()
    .catch(undefined),
  ref: z
    .string()
    .regex(/^(?:\*|[A-Z]{2})$/u)
    .optional()
    .catch(undefined),
});

/** The confirmation body of each high-risk key, by the value asked for (`tests/unit/admin-flags`). */
const CONFIRM_BODY = {
  "checkout.demo_guard": {
    on: "admin.flags.confirmBody.checkout.demo_guard.on",
    off: "admin.flags.confirmBody.checkout.demo_guard.off",
  },
  // Spec 013 §12 (TASK-257): high-risk, flipped by the founder in admin, never in code.
  "payments.stripe": {
    on: "admin.flags.confirmBody.payments.stripe.on",
    off: "admin.flags.confirmBody.payments.stripe.off",
  },
  // Spec 022a §12 (TASK-368): the two review switches.
  "reviews.invite": {
    on: "admin.flags.confirmBody.reviews.invite.on",
    off: "admin.flags.confirmBody.reviews.invite.off",
  },
  "reviews.trustpilot": {
    on: "admin.flags.confirmBody.reviews.trustpilot.on",
    off: "admin.flags.confirmBody.reviews.trustpilot.off",
  },
  // Spec 016 §12 (TASK-327): the two rollback switches.
  "routing.auto": {
    on: "admin.flags.confirmBody.routing.auto.on",
    off: "admin.flags.confirmBody.routing.auto.off",
  },
  "notifications.email": {
    on: "admin.flags.confirmBody.notifications.email.on",
    off: "admin.flags.confirmBody.notifications.email.off",
  },
} as const satisfies Partial<
  Record<FlagKey, { readonly on: string; readonly off: string }>
>;

type ConfirmBody = (typeof CONFIRM_BODY)[keyof typeof CONFIRM_BODY];

/** The confirmation body of a high-risk key; `undefined` for a key without one (no control). */
function confirmBodyFor(key: FlagKey): ConfirmBody | undefined {
  const bodies: Partial<Record<FlagKey, ConfirmBody>> = CONFIRM_BODY;
  return bodies[key];
}

/** A separator no message contains, so a sentence can carry the flag key in `<code>`. */
const MARK = "\u001f";

function withCode(sentence: string, key: string): ReactNode {
  const [before = "", after = ""] = sentence.split(MARK);
  return (
    <>
      {before}
      <code>{key}</code>
      {after}
    </>
  );
}

function domId(...parts: readonly string[]): string {
  return parts.join("-").replace(/[^A-Za-z0-9_-]/gu, "-");
}

function scopeLabel(kind: FlagScopeKind): string {
  return adminT(`admin.flags.scope.${kind}`);
}

function valueLabel(value: FlagValueView): string {
  if (value.scope.kind === "country" && isCountryIso2(value.scope.ref)) {
    return adminT(`admin.flags.countries.${value.scope.ref}`);
  }
  return value.scope.ref;
}

function Toggle({
  flag,
  value,
  prefix,
  labelledBy,
}: {
  readonly flag: RegisteredFlagView;
  readonly value: FlagValueView;
  readonly prefix: string;
  readonly labelledBy: string;
}): ReactElement {
  const id = domId("flag", prefix, flag.key, value.scope.ref, "switch");
  const next = value.enabled ? "off" : "on";
  const hidden = {
    key: flag.key,
    scopeKind: value.scope.kind,
    scopeRef: value.scope.ref,
    enabled: next,
    version: value.version,
  };
  const labels = {
    onLabel: adminT("admin.flags.on"),
    offLabel: adminT("admin.flags.off"),
  };
  if (flag.risk === "high") {
    const body = confirmBodyFor(flag.key);
    if (body === undefined) return <AdminNote>{flag.key}</AdminNote>;
    return (
      <AdminConfirmSwitch
        id={id}
        checked={value.enabled}
        labelledBy={labelledBy}
        {...labels}
        title={withCode(
          value.enabled
            ? adminT("admin.flags.confirmTitleOff", { flag: MARK })
            : adminT("admin.flags.confirmTitleOn", { flag: MARK }),
          flag.key,
        )}
        body={adminT(value.enabled ? body.off : body.on)}
        fieldName="confirmKey"
        fieldLabel={adminT("admin.flags.confirmField")}
        cancelLabel={adminT("admin.flags.cancel")}
        confirmLabel={
          value.enabled
            ? adminT("admin.flags.turnOff")
            : adminT("admin.flags.turnOn")
        }
        action={toggleFlagAction}
        hidden={hidden}
      />
    );
  }
  return (
    <form action={toggleFlagAction}>
      {Object.entries(hidden).map(([name, field]) => (
        <input key={name} type="hidden" name={name} value={field} />
      ))}
      <AdminSwitch
        id={id}
        checked={value.enabled}
        labelledBy={labelledBy}
        {...labels}
      />
    </form>
  );
}

function Values({
  flag,
  prefix,
}: {
  readonly flag: RegisteredFlagView;
  readonly prefix: string;
}): ReactElement {
  if (!flag.seeded)
    return <AdminNote>{adminT("admin.flags.notSeeded")}</AdminNote>;
  const keyId = domId("flag", prefix, flag.key);
  const [only] = flag.values;
  if (flag.values.length === 1 && only?.scope.kind === "global") {
    return (
      <Toggle flag={flag} value={only} prefix={prefix} labelledBy={keyId} />
    );
  }
  return (
    <ul className="grid min-w-[260px]">
      {flag.values.map((value) => {
        const nameId = domId("flag", prefix, flag.key, value.scope.ref);
        return (
          <li
            key={value.scope.ref}
            className="border-rule flex items-center justify-between gap-[12px] border-b py-[4px]"
          >
            <span id={nameId}>{valueLabel(value)}</span>
            <Toggle
              flag={flag}
              value={value}
              prefix={prefix}
              labelledBy={nameId}
            />
          </li>
        );
      })}
    </ul>
  );
}

function riskChip(flag: RegisteredFlagView): ReactElement {
  return flag.risk === "high" ? (
    <AdminChip tone="bad">{adminT("admin.flags.risk.high")}</AdminChip>
  ) : (
    <AdminChip>{adminT("admin.flags.risk.standard")}</AdminChip>
  );
}

function orphanValue(orphan: OrphanFlagView): string {
  return orphan.enabled
    ? adminT("admin.flags.orphanOn")
    : adminT("admin.flags.orphanOff");
}

function Message({
  result,
  keyName,
  scopeRef,
}: {
  readonly result: z.infer<typeof ResultSchema>["result"];
  readonly keyName: string | undefined;
  readonly scopeRef: string | undefined;
}): ReactElement | null {
  if (result === undefined) return null;
  if (result === "on" || result === "off" || result === "unchanged") {
    if (keyName === undefined) return null;
    if (result === "unchanged") {
      return (
        <AdminToast>
          {adminT("admin.flags.saved.unchanged", { flag: keyName })}
        </AdminToast>
      );
    }
    if (
      keyName === "checkout.open" &&
      scopeRef !== undefined &&
      isCountryIso2(scopeRef)
    ) {
      const country = adminT(`admin.flags.countries.${scopeRef}`);
      return (
        <AdminToast>
          {result === "on"
            ? adminT("admin.flags.saved.openOn", { country })
            : adminT("admin.flags.saved.openOff", { country })}
        </AdminToast>
      );
    }
    return (
      <AdminToast>
        {result === "on"
          ? adminT("admin.flags.saved.flagOn", { flag: keyName })
          : adminT("admin.flags.saved.flagOff", { flag: keyName })}
      </AdminToast>
    );
  }
  return <AdminRefusal>{adminT(`admin.flags.refused.${result}`)}</AdminRefusal>;
}

export default async function AdminFlagsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const session = await requireAdminPage("flags.toggle");
  const { result, key, ref } = ResultSchema.parse(await searchParams);
  const { registered, orphans } = await listFlags({
    userId: session.userId,
    requestId: await adminRequestId(),
  });
  const columns = [
    { key: "flag", label: adminT("admin.flags.columnFlag") },
    { key: "scope", label: adminT("admin.flags.columnScope") },
    { key: "risk", label: adminT("admin.flags.columnRisk") },
    { key: "value", label: adminT("admin.flags.columnValue") },
  ];
  return (
    <AdminFrame session={session} current="flags">
      <div className="grid gap-[20px]">
        <header className="grid gap-[6px]">
          <AdminPageTitle>{adminT("admin.flags.title")}</AdminPageTitle>
          <p className="text-ink-3 text-[14px]">{adminT("admin.flags.lead")}</p>
        </header>
        <Message result={result} keyName={key} scopeRef={ref} />
        <div className="hidden md:block">
          <AdminTable columns={columns}>
            {registered.map((flag) => (
              <AdminRow key={flag.key}>
                <AdminCell top>
                  <span id={domId("flag", "d", flag.key)}>
                    <AdminCode>{flag.key}</AdminCode>
                  </span>
                  <AdminSecondLine>
                    {adminT(`admin.flags.description.${flag.key}`)}
                  </AdminSecondLine>
                </AdminCell>
                <AdminCell top>
                  {flag.scopeKinds.map(scopeLabel).join(", ")}
                </AdminCell>
                <AdminCell top>{riskChip(flag)}</AdminCell>
                <AdminCell top>
                  <Values flag={flag} prefix="d" />
                </AdminCell>
              </AdminRow>
            ))}
            {orphans.map((orphan) => (
              <AdminRow key={orphan.key} muted>
                <AdminCell top>
                  <AdminCode>{orphan.key}</AdminCode>
                  <AdminSecondLine>
                    {adminT("admin.flags.orphanLine")}
                  </AdminSecondLine>
                </AdminCell>
                <AdminCell top>
                  {orphan.scopeKinds.map(scopeLabel).join(", ")}
                </AdminCell>
                <AdminCell top>
                  <AdminChip tone="warn">
                    {adminT("admin.flags.risk.orphaned")}
                  </AdminChip>
                </AdminCell>
                <AdminCell top>
                  <AdminNote>{orphanValue(orphan)}</AdminNote>
                </AdminCell>
              </AdminRow>
            ))}
          </AdminTable>
        </div>
        <div className="grid gap-[12px] md:hidden">
          {registered.map((flag) => (
            <section
              key={flag.key}
              aria-labelledby={domId("flag", "m", flag.key)}
              className="bg-card grid min-w-0 gap-[12px] rounded-[12px] px-[16px] py-[14px] shadow-[inset_0_0_0_1px_var(--color-rule)]"
            >
              <div className="flex flex-wrap items-center gap-[6px]">
                <span id={domId("flag", "m", flag.key)}>
                  <AdminCode>{flag.key}</AdminCode>
                </span>
                {flag.scopeKinds.map((kind) => (
                  <AdminChip key={kind}>{scopeLabel(kind)}</AdminChip>
                ))}
                {flag.risk === "high" ? riskChip(flag) : null}
              </div>
              <AdminNote>
                {adminT(`admin.flags.description.${flag.key}`)}
              </AdminNote>
              <Values flag={flag} prefix="m" />
            </section>
          ))}
          {orphans.map((orphan) => (
            <section
              key={orphan.key}
              aria-labelledby={domId("flag", "m", orphan.key)}
              className="bg-paper-2 grid min-w-0 gap-[12px] rounded-[12px] px-[16px] py-[14px] shadow-[inset_0_0_0_1px_var(--color-rule)]"
            >
              <div className="flex flex-wrap items-center gap-[6px]">
                <span id={domId("flag", "m", orphan.key)}>
                  <AdminCode>{orphan.key}</AdminCode>
                </span>
                <AdminChip tone="warn">
                  {adminT("admin.flags.risk.orphaned")}
                </AdminChip>
              </div>
              <AdminNote>
                {adminT("admin.flags.orphanLine")} {orphanValue(orphan)}
              </AdminNote>
            </section>
          ))}
        </div>
      </div>
    </AdminFrame>
  );
}
