import type { ReactNode } from 'react';

type Props = {
  /** `error` for failures the user should notice, `info` for neutral status. */
  tone?: 'error' | 'info';
  children: ReactNode;
};

/**
 * Presentational toast body: the message with its tone styling. Carries no
 * live-region semantics itself; `ToastRegion` announces it.
 */
export default function Toast({ tone = 'error', children }: Props) {
  return <div className={`toast toast--${tone}`}>{children}</div>;
}
