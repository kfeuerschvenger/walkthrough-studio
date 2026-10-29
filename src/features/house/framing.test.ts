import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { EDITOR_VIEW_DIRECTION, FRAMING_PADDING, MAX_DISTANCE_FACTOR, frameBounds } from './framing';

const boxOfSize = (size: number, center = new THREE.Vector3()) =>
  new THREE.Box3().setFromCenterAndSize(center, new THREE.Vector3(size, size, size));

describe('frameBounds', () => {
  it('targets the middle of the model', () => {
    const framing = frameBounds(boxOfSize(10, new THREE.Vector3(4, 2, -6)), 55);
    expect(framing.target).toEqual([4, 2, -6]);
  });

  it('places the camera along the view direction at the fitting distance', () => {
    const box = boxOfSize(10);
    const framing = frameBounds(box, 60);
    const radius = Math.sqrt(3) * 5;
    const expected = (radius / Math.tan(THREE.MathUtils.degToRad(30))) * FRAMING_PADDING;
    const offset = new THREE.Vector3(...framing.position);
    expect(offset.length()).toBeCloseTo(expected, 8);
    const direction = new THREE.Vector3(...EDITOR_VIEW_DIRECTION).normalize();
    expect(offset.clone().normalize().dot(direction)).toBeCloseTo(1, 8);
  });

  it('moves the camera farther for a bigger model', () => {
    const small = new THREE.Vector3(...frameBounds(boxOfSize(5), 55).position).length();
    const large = new THREE.Vector3(...frameBounds(boxOfSize(50), 55).position).length();
    expect(large).toBeGreaterThan(small * 5);
  });

  it('moves the camera farther for a narrower field of view', () => {
    const wide = new THREE.Vector3(...frameBounds(boxOfSize(10), 85).position).length();
    const narrow = new THREE.Vector3(...frameBounds(boxOfSize(10), 40).position).length();
    expect(narrow).toBeGreaterThan(wide);
  });

  it('caps the orbit distance relative to the framing distance', () => {
    const framing = frameBounds(boxOfSize(10), 55);
    const distance = new THREE.Vector3(...framing.position).distanceTo(
      new THREE.Vector3(...framing.target),
    );
    expect(framing.maxDistance).toBeCloseTo(distance * MAX_DISTANCE_FACTOR, 8);
  });

  it('survives an empty-sized box with a minimum radius', () => {
    const framing = frameBounds(boxOfSize(0), 55);
    expect(Number.isFinite(framing.position[0])).toBe(true);
    expect(framing.maxDistance).toBeGreaterThan(0);
  });
});
