/**
 * `isDisposableEmail` (spec 021 §5.2 "Disposable email at step 1", §13 Q4, AC-1; TASK-493): the
 * email's normalised domain, and each parent domain of it, against the vendored disposable list,
 * minus the relay allowlist (a relay forwards to a real inbox and is never disposable). An IDN
 * domain is compared in punycode. The list is parsed once, on first use, never at import.
 */
import { DISPOSABLE_DOMAINS_TEXT } from "@/config/risk/disposable-domains";
import { RELAY_ALLOWLIST } from "@/config/risk/relay-allowlist";

import { asciiDomain } from "./normalise.ts";

let disposable: ReadonlySet<string> | undefined;

function disposableSet(): ReadonlySet<string> {
  disposable ??= new Set(
    DISPOSABLE_DOMAINS_TEXT.split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "" && !line.startsWith("#")),
  );
  return disposable;
}

/** The domain and its parents with at least two labels: `a.b.c.com` → `a.b.c.com`, `b.c.com`, `c.com`. */
function domainChain(domain: string): string[] {
  const labels = domain.split(".").filter((label) => label !== "");
  const chain: string[] = [];
  for (let start = 0; start + 2 <= labels.length; start += 1) {
    chain.push(labels.slice(start).join("."));
  }
  return chain;
}

export interface DisposableLists {
  readonly disposable: ReadonlySet<string>;
  readonly relays: readonly string[];
}

/** True when the email's domain (or a parent) is disposable and no relay covers it. */
export function isDisposableEmail(
  email: string,
  lists: DisposableLists = {
    disposable: disposableSet(),
    relays: RELAY_ALLOWLIST,
  },
): boolean {
  const at = email.trim().lastIndexOf("@");
  if (at < 0) return false;
  const chain = domainChain(asciiDomain(email.trim().slice(at + 1)));
  if (chain.some((domain) => lists.relays.includes(domain))) return false;
  return chain.some((domain) => lists.disposable.has(domain));
}
