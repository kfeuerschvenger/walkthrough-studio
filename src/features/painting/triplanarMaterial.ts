import * as THREE from 'three';

/**
 * Marker payload attached to `material.userData.triplanar` so we can
 * recognize triplanar materials at runtime and read back their state
 * (texture id, current scale uniform) without keeping a separate registry.
 */
type TriplanarUserData = {
  isTriplanar: true;
  textureId: string;
  uniforms: {
    triplanarMap: { value: THREE.Texture };
    triplanarScale: { value: number };
  };
};

/**
 * Builds a `MeshStandardMaterial` that samples its base color through
 * triplanar projection: three axis-aligned planar samples blended by the
 * absolute world-space normal.
 *
 * Triplanar projection ignores existing UVs entirely, which is exactly
 * what we need for the Fusion 360 FBX export where UVs are unusable.
 *
 * `scaleMeters` is the tile size in world units, so `scale = 1.0` means
 * the texture covers a 1 m × 1 m patch of any surface before repeating.
 *
 * The triplanar logic is injected via `onBeforeCompile` so we still get
 * MeshStandard's full lighting pipeline (PBR, shadow receive, area lights)
 * for free; only the base color sampling changes.
 */
export function createTriplanarMaterial(
  texture: THREE.Texture,
  textureId: string,
  scaleMeters: number,
): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    metalness: 0,
    roughness: 0.9,
    side: THREE.DoubleSide,
    color: 0xffffff,
  });

  const uniforms = {
    triplanarMap: { value: texture },
    triplanarScale: { value: scaleMeters },
  };

  material.onBeforeCompile = (shader) => {
    shader.uniforms.triplanarMap = uniforms.triplanarMap;
    shader.uniforms.triplanarScale = uniforms.triplanarScale;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vTpWorldPos;
varying vec3 vTpWorldNormal;`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
vTpWorldPos = worldPosition.xyz;
vTpWorldNormal = normalize(mat3(modelMatrix) * normal);`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D triplanarMap;
uniform float triplanarScale;
varying vec3 vTpWorldPos;
varying vec3 vTpWorldNormal;

vec3 sampleTriplanar() {
  vec3 absN = abs(vTpWorldNormal);
  vec3 w = pow(absN, vec3(4.0));
  w /= max(dot(w, vec3(1.0)), 1e-6);

  float s = max(triplanarScale, 1e-4);
  vec2 uvX = vTpWorldPos.zy / s;
  vec2 uvY = vTpWorldPos.xz / s;
  vec2 uvZ = vTpWorldPos.xy / s;

  // texture2D() already returns LINEAR-space color when the texture is
  // flagged SRGBColorSpace: three.js uploads it with gl.SRGB8_ALPHA8 and
  // the GPU sampler does the sRGB→linear conversion in hardware. So we
  // blend in linear space and hand it straight to the lighting pipeline.
  vec3 cX = texture2D(triplanarMap, uvX).rgb;
  vec3 cY = texture2D(triplanarMap, uvY).rgb;
  vec3 cZ = texture2D(triplanarMap, uvZ).rgb;

  return cX * w.x + cY * w.y + cZ * w.z;
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
diffuseColor.rgb = sampleTriplanar();`,
      );
  };

  const userData: TriplanarUserData = {
    isTriplanar: true,
    textureId,
    uniforms,
  };
  material.userData.triplanar = userData;

  return material;
}

/** Type-guard: is this material one we created via `createTriplanarMaterial`? */
export function isTriplanarMaterial(material: THREE.Material): boolean {
  return material.userData?.triplanar?.isTriplanar === true;
}

/**
 * Disposes every triplanar material in a single material or an array,
 * leaving the other materials (the originals) untouched. The shared
 * texture is not disposed: it belongs to the texture cache.
 */
export function disposeTriplanarMaterials(
  material: THREE.Material | THREE.Material[],
): void {
  const list = Array.isArray(material) ? material : [material];
  for (const entry of list) {
    if (entry && isTriplanarMaterial(entry)) entry.dispose();
  }
}

/** Returns the texture id baked into a triplanar material (or `null`). */
export function getTriplanarTextureId(material: THREE.Material): string | null {
  const triplanar = material.userData?.triplanar as TriplanarUserData | undefined;
  return triplanar?.textureId ?? null;
}

/**
 * Live-updates the scale uniform of a triplanar material. Cheap: only
 * touches the uniform, no shader recompile.
 */
export function updateTriplanarScale(material: THREE.Material, scale: number): void {
  const triplanar = material.userData?.triplanar as TriplanarUserData | undefined;
  if (triplanar) triplanar.uniforms.triplanarScale.value = scale;
}
