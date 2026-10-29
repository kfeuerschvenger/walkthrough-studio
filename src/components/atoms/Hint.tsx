import type { CSSProperties, ReactNode } from 'react';

type Props = {
  children: ReactNode;
  /** Optional inline style override. Prefer CSS classes for anything reusable. */
  style?: CSSProperties;
  /** Render as empty-state italic text instead of a regular hint. */
  empty?: boolean;
};

/**
 * Small, muted helper-text atom. Used under controls to explain behavior
 * or in panels as an empty-state message.
 */
export default function Hint({ children, style, empty = false }: Props) {
  return <p className={empty ? 'tt-empty' : 'tt-hint'} style={style}>{children}</p>;
}
