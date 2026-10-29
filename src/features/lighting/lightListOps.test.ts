import { describe, expect, it } from 'vitest';
import { patchLight, removeLight, transformLight } from './lightListOps';
import { createUserLight } from './userLightTypes';
import { nightnessFromDayness, smoothstep } from './nightness';

describe('light list operations', () => {
  const a = createUserLight('box');
  const b = createUserLight('sphere');

  it('patchLight changes only the targeted light', () => {
    const result = patchLight([a, b], b.id, { color: '#ff0000' });
    expect(result[0]).toBe(a);
    expect(result[1]).toEqual({ ...b, color: '#ff0000' });
  });

  it('patchLight leaves the list equal for an unknown id', () => {
    expect(patchLight([a, b], 'nope', { intensity: 1 })).toEqual([a, b]);
  });

  it('transformLight rewrites position, rotation and scale', () => {
    const transform = {
      position: [1, 2, 3] as [number, number, number],
      rotation: [0.1, 0.2, 0.3] as [number, number, number],
      scale: [4, 5, 6] as [number, number, number],
    };
    expect(transformLight([a], a.id, transform)[0]).toEqual({ ...a, ...transform });
  });

  it('removeLight drops the light and keeps the order of the rest', () => {
    const c = createUserLight('spot');
    expect(removeLight([a, b, c], b.id)).toEqual([a, c]);
  });
});

describe('smoothstep', () => {
  it('is 0 below the range and 1 above it', () => {
    expect(smoothstep(0.2, 0.4, 0.1)).toBe(0);
    expect(smoothstep(0.2, 0.4, 0.9)).toBe(1);
  });

  it('is 0.5 in the middle of the range', () => {
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 10);
  });
});

describe('nightnessFromDayness', () => {
  it('is fully on at night and off in daylight', () => {
    expect(nightnessFromDayness(0)).toBe(1);
    expect(nightnessFromDayness(1)).toBe(0);
  });

  it('fades monotonically through dusk', () => {
    const samples = [0.05, 0.1, 0.15, 0.2, 0.25].map(nightnessFromDayness);
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeLessThanOrEqual(samples[i - 1]);
    }
  });
});
