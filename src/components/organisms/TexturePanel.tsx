import BackLink from '../atoms/BackLink';
import Hint from '../atoms/Hint';
import Button from '../atoms/Button';
import LabeledSlider from '../molecules/LabeledSlider';
import PanelSection from '../molecules/PanelSection';
import SegmentedControl from '../molecules/SegmentedControl';
import LightList from './LightList';
import LightEditor from './LightEditor';
import TextureGrid from './TextureGrid';
import type { Mode, Texture } from '../../features/painting/types';
import type {
  LightShape,
  TransformMode,
  UserLight,
} from '../../features/lighting/userLightTypes';

/**
 * Top-level mode of the side panel.
 *
 * - `paint`:  texture grid + body/face toggle + scale slider.
 * - `lights`: light list + per-light editor.
 */
export type PanelMode = 'paint' | 'lights';

/** Smallest, largest, and step of the texture tile-size slider, in meters. */
const TEXTURE_SCALE_MIN = 0.1;
const TEXTURE_SCALE_MAX = 5;
const TEXTURE_SCALE_STEP = 0.05;

type Props = {
  /** Every uploaded texture, in display order. */
  textures: Texture[];
  /** Texture armed for painting, or `null` when none is. */
  selectedTextureId: string | null;
  /** Body or face painting. */
  mode: Mode;
  /** Number of placed lights, shown in the section title. */
  userLightCount: number;
  /** Which tab (paint or lights) is showing. */
  panelMode: PanelMode;
  /** Every placed light, in list order. */
  userLights: UserLight[];
  /** Light being edited, or `null` when none is selected. */
  selectedLight: UserLight | null;
  /** Gizmo mode used on the selected light. */
  transformMode: TransformMode;
  /** Receives the files the user picked in the file dialog. */
  onLoadFiles: (files: FileList) => void;
  /** Selects a texture for painting; `null` clears the selection. */
  onSelectTexture: (id: string | null) => void;
  /** Asks to delete a texture. */
  onDeleteTexture: (id: string) => void;
  /** Switches between painting a whole body and painting a flood-filled face. */
  onChangeMode: (mode: Mode) => void;
  /** Sets the tile size, in meters, of a texture. Fires on every slider tick. */
  onChangeScale: (id: string, scale: number) => void;
  /** Adds a new light of the given shape and selects it. */
  onAddLight: (shape: LightShape) => void;
  /** Duplicates a light and selects the copy. */
  onCloneLight: (id: string) => void;
  /** Removes every light. Called only after the user confirmed. */
  onClearLights: () => void;
  /** Switches the panel between the texture and the lighting tab. */
  onChangePanelMode: (mode: PanelMode) => void;
  /** Selects a light; `null` clears the selection. */
  onSelectLight: (id: string | null) => void;
  /** Sets the gizmo mode (translate, rotate or scale) used on the selected light. */
  onChangeTransformMode: (mode: TransformMode) => void;
  /** Sets the color of a light, as a CSS hex string. */
  onChangeLightColor: (id: string, color: string) => void;
  /** Sets the intensity of a light. */
  onChangeLightIntensity: (id: string, intensity: number) => void;
  /** Removes one light. */
  onDeleteLight: (id: string) => void;
};

/**
 * Right-side dock that hosts every editor control for the Texture Tool.
 *
 * The panel composes molecules (segmented controls, sliders, color fields,
 * panel sections) and feature-specific organisms (`TextureGrid`,
 * `LightList`, `LightEditor`). The component itself stays a thin
 * composition: state lives in `TextureToolPage`, this just renders.
 */
export default function TexturePanel(props: Props) {
  return (
    <aside className="tt-panel">
      <header className="tt-panel__header">
        <BackLink to="/" className="tt-panel__back">
          ← Inicio
        </BackLink>
        <h2>Scene Editor</h2>
        <SegmentedControl<PanelMode>
          variant="tabs"
          value={props.panelMode}
          onChange={props.onChangePanelMode}
          options={[
            { value: 'paint', label: 'Texturas' },
            { value: 'lights', label: 'Iluminación' },
          ]}
        />
      </header>

      {props.panelMode === 'paint' ? <PaintSections {...props} /> : <LightSections {...props} />}

      <footer className="tt-panel__footer">
        {props.panelMode === 'paint' ? (
          <Hint>
            {props.selectedTextureId
              ? 'Textura activa: click izquierdo para pintar. ESC deselecciona.'
              : 'Seleccioná una textura para pintar.'}
          </Hint>
        ) : (
          <Hint>
            {props.selectedLight
              ? 'Luz seleccionada: arrastrá las flechas del gizmo. ESC deselecciona.'
              : 'Click sobre una luz para seleccionarla.'}
          </Hint>
        )}
        <Hint style={{ marginTop: 8 }}>
          Cámara: <strong>MMB</strong> pan · <strong>Shift+MMB</strong> orbit · <strong>Rueda</strong> zoom
        </Hint>
        <Hint style={{ marginTop: 8, opacity: 0.6 }}>
          Autosave activo · se aplica en el walkthrough automáticamente.
        </Hint>
      </footer>
    </aside>
  );
}

/** Subtree shown while the panel is in `paint` mode. */
function PaintSections({
  textures,
  selectedTextureId,
  mode,
  onLoadFiles,
  onSelectTexture,
  onDeleteTexture,
  onChangeMode,
  onChangeScale,
}: Props) {
  const selectedTexture = textures.find((t) => t.id === selectedTextureId) ?? null;

  return (
    <>
      <PanelSection title="Modo">
        <SegmentedControl<Mode>
          variant="mode"
          value={mode}
          onChange={onChangeMode}
          options={[
            { value: 'body', label: 'Body' },
            { value: 'face', label: 'Face' },
          ]}
        />
        <Hint>
          {mode === 'body'
            ? 'Click sobre un body para pintarlo entero.'
            : 'Click sobre una cara: se expande por similitud de normal.'}
        </Hint>
      </PanelSection>

      <TextureGrid
        textures={textures}
        selectedTextureId={selectedTextureId}
        onLoadFiles={onLoadFiles}
        onSelectTexture={onSelectTexture}
        onDeleteTexture={onDeleteTexture}
      />

      {selectedTexture && (
        <PanelSection title="Escala">
          <LabeledSlider
            value={selectedTexture.scale}
            min={TEXTURE_SCALE_MIN}
            max={TEXTURE_SCALE_MAX}
            step={TEXTURE_SCALE_STEP}
            onChange={(value) => onChangeScale(selectedTexture.id, value)}
            formatValue={(value) => `${value.toFixed(2)} m`}
          />
          <Hint>
            Tamaño físico del tile. Ej: 1.0 = la textura cubre 1 m × 1 m del mundo.
          </Hint>
        </PanelSection>
      )}
    </>
  );
}

/** Subtree shown while the panel is in `lights` mode. */
function LightSections({
  userLightCount,
  userLights,
  selectedLight,
  transformMode,
  onAddLight,
  onCloneLight,
  onClearLights,
  onSelectLight,
  onChangeTransformMode,
  onChangeLightColor,
  onChangeLightIntensity,
  onDeleteLight,
}: Props) {
  return (
    <>
      <PanelSection
        title={`Luces · ${userLightCount}`}
        action={
          userLightCount > 0 ? (
            <Button
              variant="danger"
              onClick={() => {
                const message = `¿Borrar las ${userLightCount} luces de la escena? Esta acción no se puede deshacer.`;
                if (window.confirm(message)) onClearLights();
              }}
              title="Eliminar todas las luces"
            >
              Borrar todas
            </Button>
          ) : undefined
        }
      >
        <div className="tt-lights-actions">
          <Button onClick={() => onAddLight('box')}>+ Box</Button>
          <Button onClick={() => onAddLight('sphere')}>+ Esfera</Button>
          <Button onClick={() => onAddLight('spot')}>+ Foco</Button>
        </div>
        <Hint>
          Se prenden de noche (entre las 18 y las 6 h). Click sobre una luz para seleccionarla.
        </Hint>
      </PanelSection>

      <LightList
        lights={userLights}
        selectedId={selectedLight?.id ?? null}
        onSelect={onSelectLight}
      />

      {selectedLight && (
        <LightEditor
          light={selectedLight}
          transformMode={transformMode}
          onChangeTransformMode={onChangeTransformMode}
          onChangeColor={(color) => onChangeLightColor(selectedLight.id, color)}
          onChangeIntensity={(intensity) => onChangeLightIntensity(selectedLight.id, intensity)}
          onClone={() => onCloneLight(selectedLight.id)}
          onDelete={() => onDeleteLight(selectedLight.id)}
        />
      )}
    </>
  );
}
