// Invalid fixture: physical utility behind a variant, with a negative value (spec 001 AC-4).
export function PhysicalCssVariant() {
  return <div className="md:-mr-2" />;
}
