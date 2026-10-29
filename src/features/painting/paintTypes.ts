/**
 * Persisted paint records. They are part of the scene document the server
 * stores (`shared/sceneTypes.ts`) and are replayed against the model each
 * time the house loads.
 *
 * A `BodyPaint` is identified by the body name alone: there is at most
 * one body paint per body.
 *
 * A `FacePaint` is identified by `(bodyName, seedTriIndex)`: the seed
 * triangle is the one the user originally clicked, and the rest of the
 * face is rediscovered at apply-time via `floodFill`.
 */

export type { BodyPaint, FacePaint } from '../../../shared/sceneTypes';
