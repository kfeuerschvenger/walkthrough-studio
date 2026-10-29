import { LOGO_MARK_GEOMETRY } from './logoMarkGeometry';

type Props = {
  /**
   * Rendered width and height in pixels. When omitted the SVG has no size
   * attributes and the caller sizes it with CSS.
   */
  size?: number;
  /** Extra classes, merged after the base `logo-mark` class. */
  className?: string;
};

/**
 * Brand mark: an isometric house whose front wall is painted orange.
 *
 * Decorative by default (`aria-hidden`), since it always sits next to the
 * product name. Colours come from the CSS tokens, so it follows the palette
 * defined in `index.css`.
 *
 * The path data lives in `LOGO_MARK_GEOMETRY`, which is the source of truth:
 * `public/favicon.svg` and the files in `docs/assets/brand` are static copies
 * and a unit test fails when they drift from it.
 */
export default function LogoMark({ size, className }: Props) {
  return (
    <svg
      className={className ? `logo-mark ${className}` : 'logo-mark'}
      viewBox="0 0 48 48"
      width={size}
      height={size}
      fill="none"
      strokeWidth={3}
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <g className="logo-mark__edges">
        {LOGO_MARK_GEOMETRY.edges.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <path className="logo-mark__wall" d={LOGO_MARK_GEOMETRY.wall} />
    </svg>
  );
}
