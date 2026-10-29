import type { ReactNode } from 'react';
import SectionHeader from '../atoms/SectionHeader';

type Props = {
  /** Section title, wrapped in the industrial `<h3>` header. */
  title: ReactNode;
  /** Optional right-aligned action slot (e.g. an "add" button). */
  action?: ReactNode;
  children: ReactNode;
};

/**
 * Side-panel section wrapper: orange tick-mark header + body.
 *
 * Used inside `TexturePanel` to keep every section visually consistent
 * (same padding, same border separator, same header style).
 */
export default function PanelSection({ title, action, children }: Props) {
  return (
    <section className="tt-panel__section">
      <SectionHeader title={title} action={action} />
      {children}
    </section>
  );
}
