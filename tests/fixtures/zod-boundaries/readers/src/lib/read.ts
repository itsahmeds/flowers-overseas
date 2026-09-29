// A reader: returns the raw body (the real one enforces a byte limit). With
// `src/lib/read.ts#readAll` in READERS its `.text()` is not checked, its callers are.
export async function readAll(request: Request): Promise<string | null> {
  const text = await request.text();
  return text.length > 1024 ? null : text;
}
