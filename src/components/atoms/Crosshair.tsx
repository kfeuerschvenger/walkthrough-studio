/**
 * Fixed-position crosshair reticle used in first-person walkthrough mode.
 *
 * Renders nothing interactive; purely a visual aid. The cross is drawn
 * entirely in CSS via `::before` / `::after` so this atom has no runtime
 * cost beyond the wrapping div.
 */
export default function Crosshair() {
  return <div className="crosshair" />;
}
