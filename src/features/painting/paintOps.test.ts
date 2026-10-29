import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FACE_TOLERANCE_DEG,
  retextureFacePaint,
  upsertBodyPaint,
  upsertFacePaint,
} from './paintOps';
import type { FacePaint } from './paintTypes';

describe('upsertBodyPaint', () => {
  it('appends a paint for a new body', () => {
    expect(upsertBodyPaint([{ bodyName: 'a', textureId: 't1' }], 'b', 't2')).toEqual([
      { bodyName: 'a', textureId: 't1' },
      { bodyName: 'b', textureId: 't2' },
    ]);
  });

  it('replaces the earlier paint of the same body and moves it last', () => {
    const result = upsertBodyPaint(
      [
        { bodyName: 'a', textureId: 't1' },
        { bodyName: 'b', textureId: 't2' },
      ],
      'a',
      't3',
    );
    expect(result).toEqual([
      { bodyName: 'b', textureId: 't2' },
      { bodyName: 'a', textureId: 't3' },
    ]);
  });

  it('does not mutate its input', () => {
    const input = [{ bodyName: 'a', textureId: 't1' }];
    upsertBodyPaint(input, 'a', 't2');
    expect(input).toEqual([{ bodyName: 'a', textureId: 't1' }]);
  });
});

const face = (bodyName: string, seedTriIndex: number, textureId: string): FacePaint => ({
  bodyName,
  seedTriIndex,
  normalToleranceDeg: 7,
  textureId,
});

describe('retextureFacePaint', () => {
  it('changes only the matching face and keeps its tolerance', () => {
    const result = retextureFacePaint([face('a', 1, 't1'), face('a', 2, 't1')], 'a', 2, 't9');
    expect(result).toEqual([face('a', 1, 't1'), face('a', 2, 't9')]);
  });

  it('leaves the list unchanged when no face matches', () => {
    const input = [face('a', 1, 't1')];
    expect(retextureFacePaint(input, 'b', 1, 't9')).toEqual(input);
  });
});

describe('upsertFacePaint', () => {
  it('adds a face with the default tolerance', () => {
    expect(upsertFacePaint([], 'a', 4, 't1')).toEqual([
      { bodyName: 'a', seedTriIndex: 4, normalToleranceDeg: DEFAULT_FACE_TOLERANCE_DEG, textureId: 't1' },
    ]);
  });

  it('replaces a face with the same body and seed', () => {
    const result = upsertFacePaint([face('a', 4, 't1'), face('a', 5, 't1')], 'a', 4, 't2');
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(face('a', 5, 't1'));
    expect(result[1].textureId).toBe('t2');
    expect(result[1].normalToleranceDeg).toBe(DEFAULT_FACE_TOLERANCE_DEG);
  });

  it('keeps faces of other bodies that share a seed index', () => {
    const result = upsertFacePaint([face('b', 4, 't1')], 'a', 4, 't2');
    expect(result).toHaveLength(2);
  });
});
