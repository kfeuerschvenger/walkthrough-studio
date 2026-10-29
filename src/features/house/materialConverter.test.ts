import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { makeStandardConverter } from './materialConverter';

describe('makeStandardConverter', () => {
  it('returns a Standard material untouched', () => {
    const ensureStandard = makeStandardConverter();
    const material = new THREE.MeshStandardMaterial();
    expect(ensureStandard(material)).toBe(material);
  });

  it('returns a Physical material untouched, since it extends Standard', () => {
    const ensureStandard = makeStandardConverter();
    const material = new THREE.MeshPhysicalMaterial();
    expect(ensureStandard(material)).toBe(material);
  });

  it('copies the visual properties of a Phong material', () => {
    const ensureStandard = makeStandardConverter();
    const map = new THREE.Texture();
    const normalMap = new THREE.Texture();
    const phong = new THREE.MeshPhongMaterial({
      color: '#336699',
      map,
      normalMap,
      emissive: '#112233',
      emissiveIntensity: 0.4,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      alphaTest: 0.2,
      depthWrite: false,
    });
    phong.name = 'wall';

    const standard = ensureStandard(phong);

    expect(standard).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(standard).not.toBe(phong);
    expect(standard.name).toBe('wall');
    expect(standard.color.getHexString()).toBe(phong.color.getHexString());
    expect(standard.map).toBe(map);
    expect(standard.normalMap).toBe(normalMap);
    expect(standard.emissive.getHexString()).toBe('112233');
    expect(standard.emissiveIntensity).toBe(0.4);
    expect(standard.transparent).toBe(true);
    expect(standard.opacity).toBe(0.5);
    expect(standard.side).toBe(THREE.DoubleSide);
    expect(standard.alphaTest).toBe(0.2);
    expect(standard.depthWrite).toBe(false);
    expect(standard.metalness).toBe(0);
  });

  it('converts Lambert materials, which have no shininess', () => {
    const ensureStandard = makeStandardConverter();
    const standard = ensureStandard(new THREE.MeshLambertMaterial({ color: '#ff0000' }));
    expect(standard.roughness).toBe(0.85);
    expect(standard.color.getHexString()).toBe('ff0000');
  });

  it.each([
    [0, 0.85],
    [50, 0.5],
    [100, 0.05],
    [1000, 0.05],
  ])('maps Phong shininess %f to roughness %f', (shininess, roughness) => {
    const ensureStandard = makeStandardConverter();
    const standard = ensureStandard(new THREE.MeshPhongMaterial({ shininess }));
    expect(standard.roughness).toBeCloseTo(roughness, 5);
  });

  it('reuses one converted material per source material', () => {
    const ensureStandard = makeStandardConverter();
    const phong = new THREE.MeshPhongMaterial();
    expect(ensureStandard(phong)).toBe(ensureStandard(phong));
  });

  it('keeps separate caches per converter', () => {
    const phong = new THREE.MeshPhongMaterial();
    expect(makeStandardConverter()(phong)).not.toBe(makeStandardConverter()(phong));
  });
});
