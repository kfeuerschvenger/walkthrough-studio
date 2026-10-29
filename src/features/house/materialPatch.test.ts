import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FALLBACK_MATERIAL_COLOR, patchUndefinedMaterials, patchUndefinedMaterialsInTree } from './materialPatch';
import { CENTIMETER_MODEL_THRESHOLD, MILLIMETER_MODEL_THRESHOLD, unitScaleForDimension } from './modelUnits';

function meshWith(material: unknown): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry());
  mesh.material = material as THREE.Material;
  return mesh;
}

describe('patchUndefinedMaterials', () => {
  it('gives a mesh with no material a grey standard material', () => {
    const mesh = meshWith(undefined);
    patchUndefinedMaterials(mesh);
    const material = mesh.material as THREE.MeshStandardMaterial;
    expect(material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(material.color.getHex()).toBe(FALLBACK_MATERIAL_COLOR);
  });

  it('fills holes in a material array and keeps existing entries', () => {
    const keep = new THREE.MeshBasicMaterial();
    const mesh = meshWith([keep, undefined, undefined]);
    patchUndefinedMaterials(mesh);
    const list = mesh.material as THREE.Material[];
    expect(list[0]).toBe(keep);
    expect(list[1]).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(list[2]).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(list[1]).not.toBe(list[2]);
  });

  it('grows the array to cover every geometry group', () => {
    const mesh = meshWith([new THREE.MeshBasicMaterial()]);
    mesh.geometry.clearGroups();
    mesh.geometry.addGroup(0, 3, 3);
    patchUndefinedMaterials(mesh);
    const list = mesh.material as THREE.Material[];
    expect(list).toHaveLength(4);
    expect(list.every(Boolean)).toBe(true);
  });

  it('leaves a single existing material alone', () => {
    const material = new THREE.MeshBasicMaterial();
    const mesh = meshWith(material);
    patchUndefinedMaterials(mesh);
    expect(mesh.material).toBe(material);
  });

  it('patches every mesh under a root', () => {
    const root = new THREE.Group();
    root.add(meshWith(undefined), meshWith(undefined));
    patchUndefinedMaterialsInTree(root);
    for (const child of root.children) {
      expect((child as THREE.Mesh).material).toBeTruthy();
    }
  });
});

describe('unitScaleForDimension', () => {
  it('keeps meter-sized models as they are', () => {
    expect(unitScaleForDimension(30)).toBe(1);
    expect(unitScaleForDimension(CENTIMETER_MODEL_THRESHOLD)).toBe(1);
  });

  it('treats models past 100 units as centimeters', () => {
    expect(unitScaleForDimension(CENTIMETER_MODEL_THRESHOLD + 1)).toBe(0.01);
    expect(unitScaleForDimension(MILLIMETER_MODEL_THRESHOLD)).toBe(0.01);
  });

  it('treats models past 10000 units as millimeters', () => {
    expect(unitScaleForDimension(MILLIMETER_MODEL_THRESHOLD + 1)).toBe(0.001);
  });
});
