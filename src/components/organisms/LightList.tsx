import type { LightShape, UserLight } from '../../features/lighting/userLightTypes';
import PanelSection from '../molecules/PanelSection';

/** Human-readable label for each light shape, shown in the list rows. */
function shapeLabel(shape: LightShape): string {
  switch (shape) {
    case 'box':
      return 'Box';
    case 'sphere':
      return 'Esfera';
    case 'spot':
      return 'Foco';
  }
}

type Props = {
  lights: UserLight[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

/**
 * Vertical list of user-placed lights. Each row shows a color swatch,
 * a friendly label (`Box #2`, `Esfera #3`), and the current intensity.
 *
 * Selecting an already-selected row deselects it, the same affordance as
 * clicking the light in the 3D scene.
 */
export default function LightList({ lights, selectedId, onSelect }: Props) {
  if (lights.length === 0) return null;

  return (
    <PanelSection title="Lista">
      <ul className="tt-light-list">
        {lights.map((light, index) => (
          <li key={light.id}>
            <button
              type="button"
              className={`tt-light-row ${light.id === selectedId ? 'is-selected' : ''}`}
              onClick={() => onSelect(light.id === selectedId ? null : light.id)}
            >
              <span
                className="tt-light-row__swatch"
                style={{ background: light.color }}
              />
              <span className="tt-light-row__label">
                {shapeLabel(light.shape)} #{index + 1}
              </span>
              <span className="tt-light-row__meta">
                {light.intensity.toFixed(1)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </PanelSection>
  );
}
