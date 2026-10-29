import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

/**
 * Renders a keyboard key chip, used in help overlays and HUDs to indicate
 * a key the user can press. Purely presentational; no interactivity.
 */
export default function Kbd({ children }: Props) {
  return <kbd>{children}</kbd>;
}
