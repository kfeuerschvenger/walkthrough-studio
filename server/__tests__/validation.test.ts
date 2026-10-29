import { describe, expect, it } from 'vitest';
import {
  MAX_BODIES,
  MAX_FACES,
  MAX_LIGHTS,
  SCALE_MAX,
  SCALE_MIN,
  isNumberInRange,
  isTextureId,
  validateScalePatch,
  validateScene,
} from '../validation.js';
import { sampleScene } from './helpers.js';

const TEXTURE_ID = '3b241101-e2bb-4255-8caf-4136c566a962';

describe('isTextureId', () => {
  it('accepts UUIDs in any case', () => {
    expect(isTextureId('3b241101-e2bb-4255-8caf-4136c566a962')).toBe(true);
    expect(isTextureId('3B241101-E2BB-4255-8CAF-4136C566A962')).toBe(true);
  });

  it.each([
    '',
    '..',
    '../../scene',
    '..%2f..%2fscene',
    'a/b',
    '3b241101e2bb42558caf4136c566a962',
    '3b241101-e2bb-4255-8caf-4136c566a962/',
    '3b241101-e2bb-4255-8caf-4136c566a962\n',
    '3b241101-e2bb-0255-8caf-4136c566a962',
    'zzzzzzzz-zzzz-4zzz-8zzz-zzzzzzzzzzzz',
  ])('rejects %j', (value) => {
    expect(isTextureId(value)).toBe(false);
  });

  it.each([undefined, null, 42, {}, ['3b241101-e2bb-4255-8caf-4136c566a962']])(
    'rejects the non-string %j',
    (value) => {
      expect(isTextureId(value)).toBe(false);
    },
  );
});

describe('isNumberInRange', () => {
  it('accepts values inside the range, bounds included', () => {
    expect(isNumberInRange(0, 0, 10)).toBe(true);
    expect(isNumberInRange(10, 0, 10)).toBe(true);
    expect(isNumberInRange(5.5, 0, 10)).toBe(true);
  });

  it.each([-0.001, 10.001, NaN, Infinity, -Infinity, '5', null, undefined])(
    'rejects %j',
    (value) => {
      expect(isNumberInRange(value, 0, 10)).toBe(false);
    },
  );
});

describe('validateScene', () => {
  it('accepts a complete scene and returns an equal copy', () => {
    const input = sampleScene();
    const result = validateScene(input);
    expect(result).toEqual({ ok: true, value: input });
  });

  it('accepts an empty scene', () => {
    const empty = { bodies: [], faces: [], lights: [], hour: 0 };
    expect(validateScene(empty)).toEqual({ ok: true, value: empty });
  });

  it('accepts the hour bounds 0 and 24', () => {
    expect(validateScene({ ...sampleScene(), hour: 0 }).ok).toBe(true);
    expect(validateScene({ ...sampleScene(), hour: 24 }).ok).toBe(true);
  });

  it('drops unknown keys at every level', () => {
    const input = {
      ...sampleScene(),
      extra: 'x',
      bodies: [{ bodyName: 'a', textureId: TEXTURE_ID, admin: true }],
      lights: [{ ...sampleScene().lights[0], evil: '<script>' }],
    };
    const result = validateScene(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).not.toHaveProperty('extra');
    expect(result.value.bodies[0]).toEqual({ bodyName: 'a', textureId: TEXTURE_ID });
    expect(result.value.lights[0]).not.toHaveProperty('evil');
  });

  it('copies vectors instead of sharing the input arrays', () => {
    const input = sampleScene();
    const result = validateScene(input);
    if (!result.ok) throw new Error('expected a valid scene');
    expect(result.value.lights[0].position).not.toBe(input.lights[0].position);
  });

  it.each([null, undefined, [], 'scene', 7])('rejects the non-object %j', (value) => {
    expect(validateScene(value)).toEqual({ ok: false, error: 'scene must be an object' });
  });

  it.each([
    ['bodies', 'bodies must be an array'],
    ['faces', 'faces must be an array'],
    ['lights', 'lights must be an array'],
  ])('rejects a non-array %s', (key, message) => {
    const result = validateScene({ ...sampleScene(), [key]: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(message);
  });

  it.each([
    ['bodies', MAX_BODIES],
    ['faces', MAX_FACES],
    ['lights', MAX_LIGHTS],
  ])('rejects more than the cap of %s', (key, cap) => {
    const result = validateScene({ ...sampleScene(), [key]: new Array(cap + 1).fill(null) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(`at most ${cap}`);
  });

  it.each([-1, 24.01, NaN, Infinity, '12', null, undefined])('rejects the hour %j', (hour) => {
    const result = validateScene({ ...sampleScene(), hour });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('hour');
  });

  it('names the first invalid body, face, or light by index', () => {
    const scene = sampleScene();
    expect(validateScene({ ...scene, bodies: [scene.bodies[0], { bodyName: '' }] })).toEqual({
      ok: false,
      error: 'bodies[1] is invalid',
    });
    expect(validateScene({ ...scene, faces: [{ ...scene.faces[0], seedTriIndex: -1 }] })).toEqual({
      ok: false,
      error: 'faces[0] is invalid',
    });
    expect(validateScene({ ...scene, lights: [{ ...scene.lights[0], shape: 'cone' }] })).toEqual({
      ok: false,
      error: 'lights[0] is invalid',
    });
  });

  it.each([
    ['a fractional triangle index', { seedTriIndex: 1.5 }],
    ['a huge triangle index', { seedTriIndex: 2e9 }],
    ['a tolerance above 180', { normalToleranceDeg: 181 }],
    ['a negative tolerance', { normalToleranceDeg: -1 }],
    ['an over-long body name', { bodyName: 'x'.repeat(257) }],
    ['a missing texture id', { textureId: undefined }],
    ['a texture id that is not a UUID', { textureId: '../scene' }],
  ])('rejects a face with %s', (_label, patch) => {
    const scene = sampleScene();
    const result = validateScene({ ...scene, faces: [{ ...scene.faces[0], ...patch }] });
    expect(result.ok).toBe(false);
  });

  it('rejects a body whose texture id is not a UUID', () => {
    const scene = sampleScene();
    const result = validateScene({
      ...scene,
      bodies: [{ bodyName: 'a', textureId: '../scene' }],
    });
    expect(result).toEqual({ ok: false, error: 'bodies[0] is invalid' });
  });

  it.each([
    ['a bad color', { color: 'red' }],
    ['a color without the hash', { color: 'ffcc88' }],
    ['a 5-digit color', { color: '#ffcc8' }],
    ['a 2-component position', { position: [1, 2] }],
    ['a non-finite position', { position: [1, NaN, 3] }],
    ['an out-of-range scale', { scale: [1e5, 1, 1] }],
    ['a negative intensity', { intensity: -1 }],
    ['an intensity above the cap', { intensity: 1e5 }],
    ['an empty id', { id: '' }],
  ])('rejects a light with %s', (_label, patch) => {
    const scene = sampleScene();
    const result = validateScene({ ...scene, lights: [{ ...scene.lights[0], ...patch }] });
    expect(result.ok).toBe(false);
  });

  it.each(['#abc', '#aabbcc', '#aabbccdd', '#ABC'])('accepts the color %s', (color) => {
    const scene = sampleScene();
    expect(validateScene({ ...scene, lights: [{ ...scene.lights[0], color }] }).ok).toBe(true);
  });

  it.each(['box', 'sphere', 'spot'])('accepts the light shape %s', (shape) => {
    const scene = sampleScene();
    expect(validateScene({ ...scene, lights: [{ ...scene.lights[0], shape }] }).ok).toBe(true);
  });
});

describe('validateScalePatch', () => {
  it.each([SCALE_MIN, 1, 2.5, SCALE_MAX])('accepts the scale %f', (scale) => {
    expect(validateScalePatch({ scale })).toEqual({ ok: true, value: { scale } });
  });

  it('drops other keys from the accepted value', () => {
    expect(validateScalePatch({ scale: 2, filename: 'x' })).toEqual({
      ok: true,
      value: { scale: 2 },
    });
  });

  it.each([0, -1, SCALE_MIN / 2, SCALE_MAX + 1, NaN, Infinity, '2', null, undefined])(
    'rejects the scale %j',
    (scale) => {
      const result = validateScalePatch({ scale });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/scale must be a finite number/);
    },
  );

  it.each([undefined, null, [], 'x', 3])('rejects the non-object body %j', (body) => {
    expect(validateScalePatch(body)).toEqual({ ok: false, error: 'body must be a JSON object' });
  });
});
