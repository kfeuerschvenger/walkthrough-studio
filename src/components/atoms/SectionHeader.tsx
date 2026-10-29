import type { ReactNode } from 'react';

type Props = {
  /** Header text, rendered in uppercase via CSS. */
  title: ReactNode;
  /** Optional inline action (e.g. an "add" button or count) rendered to the right. */
  action?: ReactNode;
};

/**
 * Heading atom for panel sections. Renders an `<h3>` with the industrial
 * orange tick mark on its left side (via CSS) and an optional action slot
 * on the right.
 *
 * When `action` is provided, the header lays out as a flex row so the
 * action stays right-aligned regardless of title length.
 */
export default function SectionHeader({ title, action }: Props) {
  if (!action) return <h3>{title}</h3>;
  return (
    <div className="tt-section-head">
      <h3>{title}</h3>
      {action}
    </div>
  );
}
