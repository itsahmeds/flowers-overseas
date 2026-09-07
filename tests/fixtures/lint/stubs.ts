// Shared stand-ins so the rule fixtures are syntactically complete without depending on
// Drizzle, Next.js or a database (spec 001 §2: fixtures are lint input, never executed).
export interface StubHeaders {
  get(name: string): string | null;
}

export interface StubRequest {
  headers: StubHeaders;
  url: string;
  geo?: { country?: string };
}

export interface StubUpdate {
  set(values: Record<string, string>): { where(id: string): Promise<void> };
}

export const db = {
  update(table: string): StubUpdate {
    throw new Error(table);
  },
};

export const orders = "orders";

export const sql = (
  strings: TemplateStringsArray,
  ...values: string[]
): Promise<void> => Promise.reject(new Error(strings.join(",") + values.join(",")));

export const NextResponse = {
  redirect(url: URL): { status: number; url: string } {
    return { status: 307, url: url.href };
  },
};
