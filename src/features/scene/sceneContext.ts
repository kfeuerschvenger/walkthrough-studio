import { createContext, type Dispatch, type SetStateAction } from 'react';
import type { BodyPaint, FacePaint } from '../painting/paintTypes';
import type { Texture } from '../painting/types';
import type { UserLight } from '../lighting/userLightTypes';

/** Everything `SceneProvider` shares with the pages below it. */
export type SceneContextValue = {
  /* ---- Scene state (autosaved) ---- */
  bodies: BodyPaint[];
  setBodies: Dispatch<SetStateAction<BodyPaint[]>>;
  faces: FacePaint[];
  setFaces: Dispatch<SetStateAction<FacePaint[]>>;
  lights: UserLight[];
  setLights: Dispatch<SetStateAction<UserLight[]>>;
  hour: number;
  setHour: (hour: number) => void;

  /* ---- Textures (uploaded blobs) ---- */
  textures: Texture[];
  uploadTextures: (files: FileList) => Promise<void>;
  /**
   * Deletes a texture on the server, then removes it and every paint that
   * uses it from local state. Resolves to `false` (and leaves everything
   * untouched) when the server refuses, so the UI never drifts from it.
   */
  deleteTexture: (id: string) => Promise<boolean>;
  /**
   * Applies a new tile scale locally at once and sends it to the server
   * after the calls stop (debounced per texture).
   */
  updateTextureScale: (id: string, scale: number) => void;

  /**
   * True once the initial fetch has succeeded. Autosave stays disabled
   * until then so the empty default state can never overwrite the
   * server's copy.
   */
  isHydrated: boolean;
  /** Set when the initial fetch failed; `null` while loading or after success. */
  loadError: Error | null;
  /** Clears `loadError` and retries the initial fetch. */
  retryLoad: () => void;
};

/** Context object behind `SceneProvider` and `useScene`. */
export const SceneContext = createContext<SceneContextValue | null>(null);
