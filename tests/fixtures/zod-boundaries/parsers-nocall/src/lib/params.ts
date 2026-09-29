// RED as a PARSERS entry: it trusts its argument and parses nothing, itself or through a helper.
export function request(raw: unknown): string {
  return describe(raw);
}

function describe(raw: unknown): string {
  return typeof raw === "string" ? raw : "";
}
