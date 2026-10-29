import { useId, type ReactNode } from 'react';

type Props = {
  /** Visible label, also the accessible name of the color input. */
  label: ReactNode;
  /** Color as a CSS hex string (e.g. `#ffd599`). */
  value: string;
  /** Receives the newly picked color as a CSS hex string. */
  onChange: (hex: string) => void;
};

/**
 * Native color picker with the hex value displayed next to it.
 *
 * The visible hex string doubles as a quick-read of the current value
 * without forcing the user to open the picker. The label is bound to the
 * input, so clicking it opens the picker and screen readers announce it.
 */
export default function ColorField({ label, value, onChange }: Props) {
  const inputId = useId();
  return (
    <div className="tt-field">
      <label htmlFor={inputId}>{label}</label>
      <div className="tt-color-row">
        <input
          id={inputId}
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <span className="tt-mono">{value}</span>
      </div>
    </div>
  );
}
