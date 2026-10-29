import { describe, expect, it } from 'vitest';
import { createSaveTracker } from './saveTracker';

describe('createSaveTracker', () => {
  it('treats the hydrated state as already saved', () => {
    const tracker = createSaveTracker();
    tracker.reset('A');
    expect(tracker.isRedundant('A')).toBe(true);
    expect(tracker.isRedundant('B')).toBe(false);
  });

  it('saves a revert to the acknowledged state while a newer snapshot is in flight', () => {
    const tracker = createSaveTracker();
    tracker.reset('A');
    tracker.begin('B');

    expect(tracker.isRedundant('B')).toBe(true);
    expect(tracker.isRedundant('A')).toBe(false);
  });

  it('keeps the newest sent snapshot as the expected one when an older response arrives late', () => {
    const tracker = createSaveTracker();
    tracker.reset('A');
    const first = tracker.begin('B');
    tracker.begin('C');
    tracker.acknowledge(first, 'B');

    expect(tracker.isRedundant('C')).toBe(true);
    expect(tracker.isRedundant('B')).toBe(false);
  });

  it('falls back to the acknowledged state when the newest send fails', () => {
    const tracker = createSaveTracker();
    tracker.reset('A');
    const sequence = tracker.begin('B');
    tracker.fail(sequence);

    expect(tracker.isRedundant('B')).toBe(false);
    expect(tracker.isRedundant('A')).toBe(true);
  });

  it('ignores the failure of a send that is no longer the newest', () => {
    const tracker = createSaveTracker();
    tracker.reset('A');
    const first = tracker.begin('B');
    tracker.begin('C');
    tracker.fail(first);

    expect(tracker.isRedundant('C')).toBe(true);
  });

  it('never moves the acknowledged state backwards', () => {
    const tracker = createSaveTracker();
    tracker.reset('A');
    const first = tracker.begin('B');
    const second = tracker.begin('C');
    tracker.acknowledge(second, 'C');
    tracker.acknowledge(first, 'B');
    const third = tracker.begin('D');
    tracker.fail(third);

    expect(tracker.isRedundant('C')).toBe(true);
  });
});
