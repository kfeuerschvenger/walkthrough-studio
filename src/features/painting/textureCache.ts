import * as THREE from 'three';

const loader = new THREE.TextureLoader();

/**
 * Anisotropic filtering level applied to every loaded texture. Triplanar
 * projection samples walls and floors at grazing angles, where 4x keeps
 * the pattern sharp without the cost of the GPU maximum.
 */
const TEXTURE_ANISOTROPY = 4;

/**
 * In-memory cache of `THREE.Texture` instances keyed by texture id.
 *
 * The cache stores `Promise<Texture>` (not the resolved texture) so we
 * de-duplicate concurrent requests for the same id: if two paints touch
 * the same texture in the same tick, only one load is kicked off.
 *
 * A load that fails is evicted again, so the next request retries instead
 * of replaying the failure forever. Disposed entries are evicted via
 * {@link disposeTexture}.
 */
const cache = new Map<string, Promise<THREE.Texture>>();

/**
 * Returns a cached texture, loading it once on first request.
 *
 * Sets repeating wrap mode and sRGB color space so the texture is ready
 * for the triplanar shader. The GPU sampler handles the sRGB → linear
 * conversion in hardware (see `triplanarMaterial.ts`).
 */
export function getTexture(id: string, url: string): Promise<THREE.Texture> {
  const cached = cache.get(id);
  if (cached) return cached;

  const promise = new Promise<THREE.Texture>((resolve, reject) => {
    loader.load(
      url,
      (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = TEXTURE_ANISOTROPY;
        texture.needsUpdate = true;
        resolve(texture);
      },
      undefined,
      (error) => reject(error),
    );
  });

  cache.set(id, promise);
  promise.catch(() => {
    if (cache.get(id) === promise) cache.delete(id);
  });
  return promise;
}

/**
 * Releases GPU memory for a single texture and removes its cache entry.
 *
 * The promise is awaited inside the callback so a texture that has not
 * yet finished loading is still disposed once the load completes.
 */
export function disposeTexture(id: string): void {
  const cached = cache.get(id);
  if (!cached) return;
  cached.then((texture) => texture.dispose()).catch(() => {});
  cache.delete(id);
}
