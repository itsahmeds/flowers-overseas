"use server";

// RED: a server action reads a field straight off its form.
export async function subscribe(formData: FormData): Promise<string> {
  await Promise.resolve();
  const value = formData.get("x");
  return typeof value === "string" ? value : "";
}
