// Invalid fixture: physical utility passed to a class helper (spec 001 §5).
export function PhysicalCssHelper({ active }) {
  return <div className={cn("pl-2", active && "border-r-2")} />;
}
