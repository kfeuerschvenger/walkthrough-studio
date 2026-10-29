import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type SunModule = typeof import('./sun');

/**
 * `sun.ts` reads its rotation from `houseConfig.ts` at import time, so each
 * test that cares about the rotation re-imports the module under a stubbed
 * `VITE_SUN_PATH_ROTATION_DEG`.
 */
async function loadSun(rotationDeg = '0'): Promise<SunModule> {
  vi.resetModules();
  vi.stubEnv('VITE_SUN_PATH_ROTATION_DEG', rotationDeg);
  return import('./sun');
}

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('formatHour', () => {
  it.each([
    [0, '00:00'],
    [6, '06:00'],
    [13.5, '13:30'],
    [9.25, '09:15'],
    [23.99, '23:59'],
  ])('formats %f as %s', async (hour, expected) => {
    const { formatHour } = await loadSun();
    expect(formatHour(hour)).toBe(expected);
  });

  it('renders the 24h edge as 24:00', async () => {
    const { formatHour } = await loadSun();
    expect(formatHour(24)).toBe('24:00');
  });

  it('floors the minutes instead of rounding up to the next hour', async () => {
    const { formatHour } = await loadSun();
    expect(formatHour(11.999)).toBe('11:59');
  });
});

describe('computeSun', () => {
  it('puts the sun at its zenith at noon', async () => {
    const { computeSun } = await loadSun();
    const sun = computeSun(12);
    expect(sun.sunPosition[1]).toBeCloseTo(100, 5);
    expect(sun.sunLightPosition[1]).toBeCloseTo(40, 5);
    expect(sun.dayness).toBe(1);
    expect(sun.sunIntensity).toBeCloseTo(2.4, 5);
    expect(sun.moonIntensity).toBe(0);
  });

  it('is pure: a later call never changes the colors of an earlier result', async () => {
    const { computeSun } = await loadSun();
    const noon = computeSun(12);
    const noonAmbient = noon.ambientColor.getHex();
    const midnight = computeSun(0);
    expect(midnight.ambientColor).not.toBe(noon.ambientColor);
    expect(noon.ambientColor.getHex()).toBe(noonAmbient);
    expect(midnight.ambientColor.getHex()).not.toBe(noonAmbient);
  });

  it('puts the sun at its nadir at midnight and lights the moon', async () => {
    const { computeSun } = await loadSun();
    const sun = computeSun(0);
    expect(sun.sunPosition[1]).toBeLessThan(0);
    expect(sun.dayness).toBe(0);
    expect(sun.sunIntensity).toBe(0);
    expect(sun.moonIntensity).toBeCloseTo(0.55, 5);
  });

  it('places the sun on the horizon at 6 and 18', async () => {
    const { computeSun } = await loadSun();
    expect(computeSun(6).sunPosition[1]).toBeCloseTo(0, 5);
    expect(computeSun(18).sunPosition[1]).toBeCloseTo(0, 5);
  });

  it('rises at +X and sets at -X with no rotation', async () => {
    const { computeSun } = await loadSun();
    expect(computeSun(6).sunPosition[0]).toBeGreaterThan(99);
    expect(computeSun(18).sunPosition[0]).toBeLessThan(-99);
  });

  it('rotates the whole arc around Y by the configured degrees', async () => {
    const { computeSun } = await loadSun('90');
    const [x, , z] = computeSun(6).sunPosition;
    expect(x).toBeCloseTo(0, 5);
    expect(z).toBeGreaterThan(99);
  });

  it('keeps the moon light opposite to the sun light', async () => {
    const { computeSun } = await loadSun();
    const sun = computeSun(9);
    sun.sunLightPosition.forEach((component, i) => {
      expect(sun.moonLightPosition[i]).toBeCloseTo(-component, 8);
    });
  });

  it('scales the light vector to 40 and the sky vector to 100', async () => {
    const { computeSun } = await loadSun();
    const sun = computeSun(9);
    expect(Math.hypot(...sun.sunPosition)).toBeCloseTo(100, 5);
    expect(Math.hypot(...sun.sunLightPosition)).toBeCloseTo(40, 5);
  });

  it('clamps hours outside [0, 24]', async () => {
    const { computeSun } = await loadSun();
    expect(computeSun(-5).sunPosition).toEqual(computeSun(0).sunPosition);
    expect(computeSun(99).sunPosition).toEqual(computeSun(24).sunPosition);
  });

  it('treats 0 and 24 as the same instant', async () => {
    const { computeSun } = await loadSun();
    const start = computeSun(0).sunPosition;
    const end = computeSun(24).sunPosition;
    start.forEach((component, i) => expect(end[i]).toBeCloseTo(component, 5));
  });

  it('keeps the ambient intensity between night and day bounds', async () => {
    const { computeSun } = await loadSun();
    expect(computeSun(0).ambientIntensity).toBeCloseTo(0.12, 5);
    expect(computeSun(12).ambientIntensity).toBeCloseTo(0.45, 5);
    expect(computeSun(12).hemisphereIntensity).toBeCloseTo(0.9, 5);
  });

  it('drops dayness under the stars threshold shortly after dusk', async () => {
    const { computeSun, STARS_DAYNESS_THRESHOLD } = await loadSun();
    expect(computeSun(18.1).dayness).toBeLessThan(STARS_DAYNESS_THRESHOLD);
    expect(computeSun(17).dayness).toBeGreaterThan(STARS_DAYNESS_THRESHOLD);
  });
});
