// Valid fixture: structural attributes and letter-free text only (spec 001 AC-5).
export function LiteralStringsValid() {
  return (
    <a className="x" href="/" data-testid="y" id="z" rel="noreferrer" target="_blank">
      <span aria-hidden="true">·</span>
    </a>
  );
}
