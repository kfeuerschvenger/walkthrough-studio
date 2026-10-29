import Button from '../atoms/Button';
import ColorField from '../molecules/ColorField';
import LabeledSlider from '../molecules/LabeledSlider';
import PanelSection from '../molecules/PanelSection';
import SegmentedControl from '../molecules/SegmentedControl';
import type { TransformMode, UserLight } from '../../features/lighting/userLightTypes';

/** Smallest, largest, and step of the intensity slider. */
const INTENSITY_MIN = 0;
const INTENSITY_MAX = 20;
const INTENSITY_STEP = 0.1;

type Props = {
  /** The light being edited. */
  light: UserLight;
  /** Gizmo mode currently active on the light. */
  transformMode: TransformMode;
  onChangeTransformMode: (mode: TransformMode) => void;
  /** Receives the new CSS hex color. */
  onChangeColor: (color: string) => void;
  /** Receives the new peak intensity. Fires on every slider tick. */
  onChangeIntensity: (intensity: number) => void;
  /** Duplicates this light and selects the clone in translate mode. */
  onClone: () => void;
  /** Removes this light. */
  onDelete: () => void;
};

/**
 * Editor for the currently-selected light: gizmo mode picker, color
 * picker, intensity slider, and a delete button.
 *
 * Each control is a thin wrapper over a molecule so the editor stays
 * declarative and the visual style stays consistent across the panel.
 */
export default function LightEditor({
  light,
  transformMode,
  onChangeTransformMode,
  onChangeColor,
  onChangeIntensity,
  onClone,
  onDelete,
}: Props) {
  return (
    <PanelSection title="Editar">
      <div className="tt-field">
        <label>Gizmo</label>
        <SegmentedControl<TransformMode>
          variant="transform"
          value={transformMode}
          onChange={onChangeTransformMode}
          options={[
            { value: 'translate', label: 'Mover', title: 'Mover (flechas en X/Y/Z)' },
            { value: 'rotate', label: 'Rotar', title: 'Rotar' },
            { value: 'scale', label: 'Escalar', title: 'Escalar (estirar)' },
          ]}
        />
      </div>

      <ColorField label="Color" value={light.color} onChange={onChangeColor} />

      <LabeledSlider
        label={`Intensidad · ${light.intensity.toFixed(1)}`}
        value={light.intensity}
        min={INTENSITY_MIN}
        max={INTENSITY_MAX}
        step={INTENSITY_STEP}
        onChange={onChangeIntensity}
      />

      <div className="tt-light-actions" style={{ marginTop: 4 }}>
        <Button onClick={onClone} title="Crear una copia de esta luz desplazada">
          Clonar
        </Button>
        <Button variant="danger" onClick={onDelete}>
          Eliminar
        </Button>
      </div>
    </PanelSection>
  );
}
