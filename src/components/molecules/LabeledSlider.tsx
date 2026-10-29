import { useId, type ReactNode } from 'react';

type Props = {
  /**
   * Optional inline label above the slider. Omit it when an outer section
   * header already names the control.
   */
  label?: ReactNode;
  /** Current value of the slider. */
  value: number;
  /** Smallest selectable value. */
  min: number;
  /** Largest selectable value. */
  max: number;
  /** Increment between selectable values. Defaults to 1. */
  step?: number;
  /** Receives the new value on every slider movement. */
  onChange: (value: number) => void;
  /**
   * Optional value formatter for the readout shown next to the slider.
   * When omitted, the readout is hidden (label-only slider, e.g. when the
   * label itself includes the current value).
   */
  formatValue?: (value: number) => string;
};

/**
 * Range slider with an inline label and an optional formatted readout.
 *
 * Used by the texture-scale and light-intensity controls. CSS is keyed off
 * `.tt-field` and `.tt-scale-row` so the look matches the rest of the panel.
 */
export default function LabeledSlider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  formatValue,
}: Props) {
  const inputId = useId();
  const input = (
    <input
      id={inputId}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(parseFloat(event.target.value))}
    />
  );

  return (
    <div className="tt-field">
      {label ? <label htmlFor={inputId}>{label}</label> : null}
      {formatValue ? (
        <div className="tt-scale-row">
          {input}
          <span className="tt-scale-value">{formatValue(value)}</span>
        </div>
      ) : (
        input
      )}
    </div>
  );
}
