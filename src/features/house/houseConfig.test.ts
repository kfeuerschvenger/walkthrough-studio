import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type HouseConfig = typeof import('./houseConfig');

const KEYS = [
  'VITE_HOUSE_URL',
  'VITE_HOUSE_SPAWN',
  'VITE_HOUSE_GROUND_HINTS',
  'VITE_SUN_PATH_ROTATION_DEG',
] as const;

/**
 * `houseConfig.ts` parses `import.meta.env` once at import time, so each
 * case stubs the variables it needs and imports a fresh copy of the module.
 * Variables not listed are removed, which keeps a developer's `.env.local`
 * out of the assertions.
 */
async function load(env: Partial<Record<(typeof KEYS)[number], string>> = {}): Promise<HouseConfig> {
  vi.resetModules();
  for (const key of KEYS) vi.stubEnv(key, env[key]);
  return import('./houseConfig');
}

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('defaults', () => {
  it('falls back to the demo house and neutral settings', async () => {
    const config = await load();
    expect(config.HOUSE_URL).toBe(config.DEFAULT_HOUSE_URL);
    expect(config.HOUSE_URL).toBe('/demo/house.glb');
    expect(config.HOUSE_SPAWN).toEqual([-2, 0]);
    expect(config.GROUND_NAME_HINTS).toEqual([]);
    expect(config.SUN_PATH_ROTATION_RAD).toBe(0);
  });
});

describe('VITE_HOUSE_URL', () => {
  it('uses the configured URL, trimmed', async () => {
    const config = await load({ VITE_HOUSE_URL: '  /models/House.fbx ' });
    expect(config.HOUSE_URL).toBe('/models/House.fbx');
  });

  it('treats a blank value as unset', async () => {
    const config = await load({ VITE_HOUSE_URL: '   ' });
    expect(config.HOUSE_URL).toBe('/demo/house.glb');
  });
});

describe('VITE_HOUSE_SPAWN', () => {
  it.each([
    ['1.5,-3', [1.5, -3]],
    [' 4 , 5 ', [4, 5]],
    ['0,0', [0, 0]],
  ])('parses %j', async (value, expected) => {
    const config = await load({ VITE_HOUSE_SPAWN: value });
    expect(config.HOUSE_SPAWN).toEqual(expected);
  });

  it.each(['', '1', '1,2,3', 'a,b', '1,', ',2', '1,Infinity', '1,NaN'])(
    'falls back to the default for %j',
    async (value) => {
      const config = await load({ VITE_HOUSE_SPAWN: value });
      expect(config.HOUSE_SPAWN).toEqual([-2, 0]);
    },
  );
});

describe('VITE_HOUSE_GROUND_HINTS', () => {
  it('splits, trims, lower-cases, and drops empty entries', async () => {
    const config = await load({ VITE_HOUSE_GROUND_HINTS: ' Floor, GROUND ,, base ' });
    expect(config.GROUND_NAME_HINTS).toEqual(['floor', 'ground', 'base']);
  });

  it('yields no hints for a blank value', async () => {
    const config = await load({ VITE_HOUSE_GROUND_HINTS: ' , ' });
    expect(config.GROUND_NAME_HINTS).toEqual([]);
  });
});

describe('VITE_SUN_PATH_ROTATION_DEG', () => {
  it('converts degrees to radians', async () => {
    const config = await load({ VITE_SUN_PATH_ROTATION_DEG: '90' });
    expect(config.SUN_PATH_ROTATION_RAD).toBeCloseTo(Math.PI / 2, 10);
  });

  it('accepts negative values', async () => {
    const config = await load({ VITE_SUN_PATH_ROTATION_DEG: '-45' });
    expect(config.SUN_PATH_ROTATION_RAD).toBeCloseTo(-Math.PI / 4, 10);
  });

  it.each(['', '  ', 'north', 'Infinity'])('falls back to zero for %j', async (value) => {
    const config = await load({ VITE_SUN_PATH_ROTATION_DEG: value });
    expect(config.SUN_PATH_ROTATION_RAD).toBe(0);
  });
});
