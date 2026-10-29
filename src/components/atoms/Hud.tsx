import type { ReactNode } from 'react';

type Props = {
  /** The help text, typically key bindings. */
  children: ReactNode;
};

/**
 * Fixed bottom-left HUD overlay that displays static help text while the
 * walkthrough is pointer-locked. Non-interactive (pointer-events: none in
 * CSS) so it never steals input from the canvas underneath.
 */
export default function Hud({ children }: Props) {
  return <div className="hud">{children}</div>;
}
