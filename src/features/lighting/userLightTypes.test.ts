import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cloneOffsetDistance,
  cloneUserLight,
  createUserLight,
  generateId,
  type LightShape,
} from './userLightTypes';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('generateId', () => {
  it('uses crypto.randomUUID when the context provides it', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'fixed-id' });
    expect(generateId()).toBe('fixed-id');
  });

  it('falls back to getRandomValues in an insecure context', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => bytes.fill(0xab),
    });
    expect(generateId()).toMatch(UUID_V4);
  });

  it('falls back to Math.random when no crypto API exists', () => {
    vi.stubGlobal('crypto', undefined);
    const first = generateId();
    expect(first).toMatch(UUID_V4);
    expect(generateId()).not.toBe(first);
  });

  it('lets createUserLight and cloneUserLight work without randomUUID', () => {
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array<ArrayBuffer>) => real.getRandomValues(bytes),
    });
    const light = createUserLight('box');
    expect(light.id).toMatch(UUID_V4);
    expect(cloneUserLight(light).id).toMatch(UUID_V4);
  });
});

describe('createUserLight', () => {
  it.each<[LightShape, number, number]>([
    ['box', 2.2, 5],
    ['sphere', 2.5, 8],
    ['spot', 2.5, 8],
  ])('builds a %s light with its default height and intensity', (shape, height, intensity) => {
    const light = createUserLight(shape);
    expect(light.shape).toBe(shape);
    expect(light.position).toEqual([0, height, 0]);
    expect(light.intensity).toBe(intensity);
    expect(light.rotation).toEqual([0, 0, 0]);
    expect(light.color).toBe('#ffd599');
  });

  it('gives every light a distinct id', () => {
    expect(createUserLight('box').id).not.toBe(createUserLight('box').id);
  });

  it('does not share arrays between lights', () => {
    const a = createUserLight('sphere');
    const b = createUserLight('sphere');
    a.position[0] = 99;
    a.scale[0] = 99;
    expect(b.position[0]).toBe(0);
    expect(b.scale[0]).toBe(0.15);
  });
});

describe('cloneOffsetDistance', () => {
  it('never goes below 0.3 m', () => {
    expect(cloneOffsetDistance([0.05, 1, 1])).toBe(0.3);
  });

  it('clears the light width plus 0.2 m for wide lights', () => {
    expect(cloneOffsetDistance([2, 0.05, 0.2])).toBeCloseTo(2.2, 10);
  });
});

describe('cloneUserLight', () => {
  it('offsets an unrotated light along world +X', () => {
    const source = createUserLight('box');
    const clone = cloneUserLight(source);
    expect(clone.position[0]).toBeCloseTo(source.position[0] + 2.2, 10);
    expect(clone.position[1]).toBeCloseTo(source.position[1], 10);
    expect(clone.position[2]).toBeCloseTo(source.position[2], 10);
  });

  it('offsets along the light local +X when it is rotated', () => {
    const source = { ...createUserLight('sphere'), rotation: [0, Math.PI / 2, 0] as [number, number, number] };
    const clone = cloneUserLight(source);
    // A 90 degree yaw sends local +X to world -Z.
    expect(clone.position[0]).toBeCloseTo(source.position[0], 10);
    expect(clone.position[2]).toBeCloseTo(source.position[2] - 0.35, 10);
  });

  it('keeps every other field and gets a fresh id', () => {
    const source = createUserLight('spot');
    const clone = cloneUserLight(source);
    expect(clone.id).not.toBe(source.id);
    expect({ ...clone, id: '', position: [] }).toEqual({ ...source, id: '', position: [] });
  });

  it('does not mutate the source', () => {
    const source = createUserLight('box');
    const before = JSON.stringify(source);
    cloneUserLight(source);
    expect(JSON.stringify(source)).toBe(before);
  });
});
