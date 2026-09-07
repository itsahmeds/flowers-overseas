/**
 * 404 shell (spec 001 §5.3, TASK-006).
 *
 * Same empty shell as `/` and the correct status code (Next serves this with 404); spec 003 adds
 * the message once there are message catalogues, which is why there is no text node here.
 */
export default function NotFound() {
  return <main />;
}
