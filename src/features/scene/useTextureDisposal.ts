import { useEffect, useRef } from 'react';
import type { Texture } from '../painting/types';
import { disposeTexture } from '../painting/textureCache';

/**
 * Frees the GPU texture of every entry that leaves the `textures` list.
 *
 * It runs as an effect, after the commit, so it fires after the pages'
 * paint-apply effects have already swapped the deleted texture's
 * materials back to their originals: no material is left sampling a
 * texture that has just been disposed.
 */
export function useTextureDisposal(textures: readonly Texture[]): void {
  const knownIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const currentIds = new Set(textures.map((texture) => texture.id));
    for (const id of knownIds.current) {
      if (!currentIds.has(id)) disposeTexture(id);
    }
    knownIds.current = currentIds;
  }, [textures]);
}
