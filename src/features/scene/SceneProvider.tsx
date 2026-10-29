import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { BodyPaint, FacePaint } from '../painting/paintTypes';
import type { Texture } from '../painting/types';
import type { UserLight } from '../lighting/userLightTypes';
import {
  ApiError,
  MAX_UPLOAD_MB,
  deleteTextureRequest,
  fetchScene,
  fetchTextures,
  patchTextureScale,
  saveScene,
  toTexture,
  uploadTexture,
  type SceneDocument,
} from './api';
import { SceneContext, type SceneContextValue } from './sceneContext';
import { createSaveTracker } from './saveTracker';
import { createScalePatcher } from './scalePatcher';
import { useTextureDisposal } from './useTextureDisposal';
import { DEFAULT_HOUR, clampHour } from '../lighting/timeOfDay';
import { useNotifications } from '../notifications/useNotifications';

/**
 * Debounce window for the scene autosave. Gizmo drags fire `onTransform`
 * every animation frame; without a debounce we'd PUT the whole scene
 * 60 times per second per drag. 300 ms is short enough to feel instant
 * and long enough to coalesce a drag into a single write.
 */
const AUTOSAVE_DEBOUNCE_MS = 300;

/**
 * Debounce window for the texture scale PATCH. A slider drag changes the
 * scale on every input event; only the value the user settles on needs to
 * reach the server.
 */
const SCALE_PATCH_DEBOUNCE_MS = 400;

type Props = {
  children: ReactNode;
};

/**
 * Spanish tail of the upload failure toast. The server's two specific
 * rejections are explained to the user (unsupported type, file too large);
 * any other failure keeps the generic message.
 */
function uploadFailureReason(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 415) {
      return ': el formato no es compatible (se admiten PNG, JPEG, WebP, GIF y AVIF).';
    }
    if (error.status === 413) {
      return `: el archivo supera el máximo de ${MAX_UPLOAD_MB} MB.`;
    }
  }
  return '.';
}

/**
 * Single source of truth for everything persisted on the server.
 *
 * On mount it fetches the scene document and the texture manifest in
 * parallel, then hydrates the local React state. Subsequent state
 * changes flow through `setBodies` / `setFaces` / `setLights` /
 * `setHour`, each of which schedules a debounced PUT of the full scene
 * document. Texture mutations bypass the debounce because they involve
 * binary uploads that the user expects to feel synchronous.
 *
 * Autosave is armed only after a successful hydration. When the initial
 * fetch fails, the provider stays disarmed and exposes `loadError`, so
 * the default empty scene can never be written over the server's copy.
 * A pending autosave (and any pending texture-scale patch) is flushed
 * when the provider unmounts and when the page is being closed.
 *
 * Failed saves, uploads, deletes, and scale updates are reported to the
 * user through `useNotifications`. A delete changes local state only
 * after the server confirmed it; a failed scale update rolls the texture
 * back to the last scale the server accepted.
 *
 * Children are rendered immediately with default-empty state: the
 * canvas and walkthrough start loading the house model in parallel and
 * the painted-state apply effects pick up the real data once
 * `isHydrated` flips to `true`.
 */
export default function SceneProvider({ children }: Props) {
  const [bodies, setBodies] = useState<BodyPaint[]>([]);
  const [faces, setFaces] = useState<FacePaint[]>([]);
  const [lights, setLights] = useState<UserLight[]>([]);
  const [hour, setHourState] = useState<number>(DEFAULT_HOUR);
  const [textures, setTextures] = useState<Texture[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const { notify } = useNotifications();

  useTextureDisposal(textures);

  // Knows which serialized scene the server holds or is about to hold. Lets
  // the autosave skip the echo of freshly hydrated data and redundant
  // writes without dropping a revert while a newer save is in flight.
  const saveTracker = useMemo(() => createSaveTracker(), []);
  // Scene waiting for the debounce timer; flushed early on unmount/unload.
  const pendingRef = useRef<SceneDocument | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  // Tail of the queue of scene PUTs.
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());

  // Debounces and orders the texture scale PATCH requests, and rolls a
  // texture back to the last accepted scale when the server refuses one.
  const scalePatcher = useMemo(
    () =>
      createScalePatcher({
        delayMs: SCALE_PATCH_DEBOUNCE_MS,
        send: (id, scale, keepalive) =>
          patchTextureScale(id, scale, { keepalive }).then(() => undefined),
        onFailure: (id, confirmed) => {
          console.warn('[scene] patch texture scale failed', id);
          setTextures((previous) =>
            previous.map((t) => (t.id === id ? { ...t, scale: confirmed } : t)),
          );
          notify('No se pudo guardar la escala de la textura.');
        },
      }),
    [notify],
  );

  // Initial hydration. A failure leaves `isHydrated` false and sets
  // `loadError`; `retryLoad` runs this effect again.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [scene, textureRecords] = await Promise.all([
          fetchScene(),
          fetchTextures(),
        ]);
        if (cancelled) return;
        const nextHour = clampHour(scene.hour);
        saveTracker.reset(
          JSON.stringify({
            bodies: scene.bodies,
            faces: scene.faces,
            lights: scene.lights,
            hour: nextHour,
          }),
        );
        setBodies(scene.bodies);
        setFaces(scene.faces);
        setLights(scene.lights);
        setHourState(nextHour);
        for (const record of textureRecords) {
          scalePatcher.confirm(record.id, record.scale);
        }
        setTextures(textureRecords.map(toTexture));
        setLoadError(null);
        setIsHydrated(true);
      } catch (error) {
        if (cancelled) return;
        console.warn('[scene] failed to hydrate from server', error);
        setLoadError(error instanceof Error ? error : new Error(String(error)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadAttempt, scalePatcher, saveTracker]);

  const retryLoad = useCallback(() => {
    setLoadError(null);
    setLoadAttempt((attempt) => attempt + 1);
  }, []);

  /**
   * Sends one scene snapshot. Never rejects: a failure is reported to the
   * user and the tracker goes back to the acknowledged state, so the next
   * change saves again. The tracker only moves its acknowledged state
   * forward, whatever order the responses arrive in.
   */
  const sendSnapshot = useCallback(
    (snapshot: SceneDocument): Promise<void> => {
      const serialized = JSON.stringify(snapshot);
      const sequence = saveTracker.begin(serialized);
      return saveScene(snapshot, { keepalive: true })
        .then(() => {
          saveTracker.acknowledge(sequence, serialized);
        })
        .catch((error) => {
          saveTracker.fail(sequence);
          console.warn('[scene] autosave failed', error);
          notify('No se pudo guardar la escena. Se reintentará con el próximo cambio.');
        });
    },
    [notify, saveTracker],
  );

  /**
   * Sends the pending scene right away, if any. `keepalive` is set so the
   * request survives the page being torn down. Normally the save joins a
   * chain, so at most one PUT is in flight and the server applies the
   * snapshots in the order they were taken. With `overlap` (the page is
   * closing) it is sent immediately instead, because a request queued
   * behind another would never leave a page that is going away.
   */
  const flushPending = useCallback(
    (overlap = false) => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      const pending = pendingRef.current;
      if (!pending) return;
      pendingRef.current = null;
      if (overlap) {
        void sendSnapshot(pending);
        return;
      }
      saveChainRef.current = saveChainRef.current.then(() => sendSnapshot(pending));
    },
    [sendSnapshot],
  );

  const flushOnPageClose = useCallback(() => flushPending(true), [flushPending]);

  // Debounced autosave. Coalesces bursts of state changes into a single
  // PUT. Does nothing until hydration succeeded, and does nothing when
  // the state equals what the server already has.
  useEffect(() => {
    if (!isHydrated) return;
    const snapshot: SceneDocument = { bodies, faces, lights, hour };
    if (saveTracker.isRedundant(JSON.stringify(snapshot))) {
      pendingRef.current = null;
      return;
    }
    pendingRef.current = snapshot;
    saveTimerRef.current = window.setTimeout(() => flushPending(), AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [bodies, faces, lights, hour, isHydrated, flushPending, saveTracker]);

  // Flush on unmount (route change) and when the page is closed or
  // reloaded inside the debounce window.
  useEffect(() => {
    window.addEventListener('beforeunload', flushOnPageClose);
    window.addEventListener('pagehide', flushOnPageClose);
    return () => {
      window.removeEventListener('beforeunload', flushOnPageClose);
      window.removeEventListener('pagehide', flushOnPageClose);
      flushPending();
    };
  }, [flushPending, flushOnPageClose]);

  const setHour = useCallback((next: number) => {
    setHourState(clampHour(next));
  }, []);

  /* ---- Texture mutations ---- */

  const uploadTextures = useCallback(
    async (files: FileList) => {
      const uploaded: Texture[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) {
          notify(`"${file.name}" no es una imagen y se omitió.`, 'info');
          continue;
        }
        try {
          const record = await uploadTexture(file);
          scalePatcher.confirm(record.id, record.scale);
          uploaded.push(toTexture(record));
        } catch (error) {
          console.warn('[scene] upload failed', file.name, error);
          notify(`No se pudo subir "${file.name}"${uploadFailureReason(error)}`);
        }
      }
      if (uploaded.length > 0) {
        setTextures((previous) => [...previous, ...uploaded]);
      }
    },
    [notify, scalePatcher],
  );

  const deleteTexture = useCallback(
    async (id: string) => {
      // The server goes first: local state changes only once it confirmed,
      // so a refused delete leaves the list and the paints exactly as the
      // server still has them.
      try {
        await deleteTextureRequest(id);
      } catch (error) {
        console.warn('[scene] delete texture failed', id, error);
        notify('No se pudo borrar la textura. Sigue disponible.');
        return false;
      }
      scalePatcher.forget(id);
      setTextures((previous) => previous.filter((t) => t.id !== id));
      setBodies((previous) => previous.filter((paint) => paint.textureId !== id));
      setFaces((previous) => previous.filter((paint) => paint.textureId !== id));
      return true;
    },
    [notify, scalePatcher],
  );

  const updateTextureScale = useCallback(
    (id: string, scale: number) => {
      setTextures((previous) =>
        previous.map((t) => (t.id === id ? { ...t, scale } : t)),
      );
      scalePatcher.schedule(id, scale);
    },
    [scalePatcher],
  );

  // Send any scale patch still waiting on its debounce timer when the
  // provider unmounts or the page is closed.
  useEffect(() => {
    window.addEventListener('pagehide', scalePatcher.flush);
    return () => {
      window.removeEventListener('pagehide', scalePatcher.flush);
      scalePatcher.flush();
    };
  }, [scalePatcher]);

  const value = useMemo<SceneContextValue>(
    () => ({
      bodies,
      setBodies,
      faces,
      setFaces,
      lights,
      setLights,
      hour,
      setHour,
      textures,
      uploadTextures,
      deleteTexture,
      updateTextureScale,
      isHydrated,
      loadError,
      retryLoad,
    }),
    [
      bodies,
      faces,
      lights,
      hour,
      setHour,
      textures,
      uploadTextures,
      deleteTexture,
      updateTextureScale,
      isHydrated,
      loadError,
      retryLoad,
    ],
  );

  return (
    <SceneContext.Provider value={value}>
      {children}
      {loadError && (
        <div className="scene-load-error" role="alert">
          <span>
            No se pudo cargar la escena guardada. Los cambios no se guardarán hasta que se
            recupere la conexión con el servidor.
          </span>
          <button type="button" onClick={retryLoad}>
            Reintentar
          </button>
        </div>
      )}
    </SceneContext.Provider>
  );
}
