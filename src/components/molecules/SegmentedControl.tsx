import type { ReactNode } from 'react';

/**
 * Single option in a segmented control.
 *
 * `value` is opaque to the control: callers pick the type via the generic
 * parameter so it can be a string literal union (e.g. `'body' | 'face'`)
 * and stay type-safe at the call site.
 */
export type SegmentOption<T extends string> = {
  value: T;
  label: ReactNode;
  /** Optional tooltip (rendered as the native `title` attribute). */
  title?: string;
};

type Props<T extends string> = {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /**
   * Visual variant: picks which CSS class set is applied:
   *
   * - `mode`:      large equal-width buttons (used for Body/Face).
   * - `tabs`:      flat tabs with inner border (used for Texturas/Iluminación).
   * - `transform`: compact 3-segment toggle (used for translate/rotate/scale).
   *
   * The CSS for all three lives in `styles/components.css`.
   */
  variant?: 'mode' | 'tabs' | 'transform';
};

const CLASS_BY_VARIANT = {
  mode: 'tt-mode-toggle',
  tabs: 'tt-panel-tabs',
  transform: 'tt-transform-tabs',
} as const;

/**
 * Segmented control shared by the mode, tab and transform toggles: one row
 * of buttons where exactly one option is active. The variant only changes
 * the CSS class set.
 *
 * Active option is highlighted with the orange industrial accent.
 */
export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  variant = 'mode',
}: Props<T>) {
  return (
    <div className={CLASS_BY_VARIANT[variant]}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={opt.value === value ? 'is-active' : ''}
          onClick={() => onChange(opt.value)}
          title={opt.title}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
