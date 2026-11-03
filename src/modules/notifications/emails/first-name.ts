/**
 * `firstNameOf(fullName)` (spec 016 §5.2 "Names in buyer emails", §14 A-founder-2026-10-14b;
 * AC-42; TASK-333).
 *
 * The name B1 thanks ("Thank you, {firstName}.") and B4 names ("Delivered to
 * {recipientFirstName}"), from the name exactly as the buyer typed it: the trimmed name's first
 * whitespace-separated token, or the whole trimmed name when that token ends with "." or has fewer
 * than two letters, so "Dr. Anna Nowak" reads "Dr. Anna Nowak" (never "Dr.") and "J Smith" reads
 * "J Smith" (never "J"). Letters are Unicode letters (`\p{L}`), so "Zoë", "Łucja" and an Arabic or
 * Hebrew name count their letters as such. Pure; never used in a subject or a preheader.
 */
const LETTER = /\p{L}/gu;

export function firstNameOf(fullName: string): string {
  const trimmed = fullName.trim();
  const [first = ""] = trimmed.split(/\s+/u);
  const letters = first.match(LETTER)?.length ?? 0;
  if (first.endsWith(".") || letters < 2) return trimmed;
  return first;
}
