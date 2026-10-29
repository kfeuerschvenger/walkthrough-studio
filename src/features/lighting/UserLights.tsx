import EditableLight from './EditableLight';
import LightContents from './LightContents';
import { nightnessFromDayness } from './nightness';
import type { LightTransform, TransformMode, UserLight } from './userLightTypes';

export type { TransformMode } from './userLightTypes';

type Props = {
  lights: UserLight[];
  /** From `sun.ts`: 1 at noon, 0 at midnight. Used to gate light on/off. */
  dayness: number;
  /** Whether the visible mesh renders. The actual light always renders. */
  meshVisible: boolean;
  /** Id of the light currently being edited (TransformControls attached). */
  editingId?: string | null;
  /** Gizmo mode when a light is selected. */
  transformMode?: TransformMode;
  /** Fires with the final transform of the attached group when a drag ends. */
  onTransform?: (id: string, transform: LightTransform) => void;
  /** Optional click-to-select handler. Wired only in lights mode. */
  onSelectLight?: (id: string) => void;
  /**
   * Fires `true` when the gizmo grabs the pointer and `false` after it
   * releases. The parent uses this to suppress its own pointer-missed
   * deselect logic during a drag (the trailing DOM click bubbles to the
   * canvas as a "miss" because the gizmo lives outside R3F's event tree).
   */
  onTransformDragChange?: (dragging: boolean) => void;
};

/**
 * Renders every user-placed light.
 *
 * Non-editing lights apply their transform via React props on their wrapper
 * `<group>`. The editing light uses the `object`-prop pattern of
 * `<TransformControls>`: we own the group, the gizmo attaches via ref, and
 * a `useEffect` syncs the transform from React state.
 *
 * This avoids the double-transform bug from drei's wrapper pattern (drei
 * wraps children in its own group and attaches the gizmo there; if our
 * children also carry a transform, they multiply).
 */
export default function UserLights({
  lights,
  dayness,
  meshVisible,
  editingId,
  transformMode = 'translate',
  onTransform,
  onSelectLight,
  onTransformDragChange,
}: Props) {
  const nightness = nightnessFromDayness(dayness);
  return (
    <>
      {lights.map((light) => {
        const contents = (
          <LightContents light={light} nightness={nightness} meshVisible={meshVisible} />
        );
        if (light.id === editingId) {
          return (
            <EditableLight
              key={light.id}
              light={light}
              mode={transformMode}
              onTransform={onTransform}
              onDragChange={onTransformDragChange}
            >
              {contents}
            </EditableLight>
          );
        }
        return (
          <group
            key={light.id}
            position={light.position}
            rotation={light.rotation}
            scale={light.scale}
            userData={{ lightId: light.id }}
            onClick={
              onSelectLight
                ? (e) => {
                    e.stopPropagation();
                    onSelectLight(light.id);
                  }
                : undefined
            }
          >
            {contents}
          </group>
        );
      })}
    </>
  );
}
