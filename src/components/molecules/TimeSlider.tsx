import { useId } from 'react';
import { formatHour } from '../../features/lighting/sun';
import {
  MAX_HOUR,
  MIN_HOUR,
  TIME_SLIDER_STEP_HOURS,
} from '../../features/lighting/timeOfDay';

type Props = {
  /** Hour of day in [0, 24]. */
  hour: number;
  /** Receives the new hour on every slider movement. */
  onChange: (hour: number) => void;
};

/**
 * Floating top-center time-of-day control. Drives the global sun/moon
 * lighting via the parent's `useTimeOfDay` hook.
 *
 * Visible only when the user is NOT pointer-locked (the walkthrough hides
 * it as soon as the player enters first-person mode).
 */
export default function TimeSlider({ hour, onChange }: Props) {
  const inputId = useId();
  return (
    <div className="time-slider">
      <label className="time-slider__label" htmlFor={inputId}>
        Hora
      </label>
      <input
        id={inputId}
        type="range"
        min={MIN_HOUR}
        max={MAX_HOUR}
        step={TIME_SLIDER_STEP_HOURS}
        value={hour}
        onChange={(event) => onChange(parseFloat(event.target.value))}
      />
      <span className="time-slider__value">{formatHour(hour)}</span>
    </div>
  );
}
