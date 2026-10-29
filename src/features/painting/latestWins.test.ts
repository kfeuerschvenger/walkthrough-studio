import { describe, expect, it, vi } from 'vitest';
import { createLatestWinsRunner } from './latestWins';

/** A promise whose resolution the test controls. */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('createLatestWinsRunner', () => {
  it('runs a single call with its arguments', async () => {
    const seen: number[] = [];
    const run = createLatestWinsRunner(async (_isStale, value: number) => {
      seen.push(value);
    });
    await run(1);
    expect(seen).toEqual([1]);
  });

  it('never runs two tasks at the same time', async () => {
    let active = 0;
    let maxActive = 0;
    const gates = [deferred(), deferred(), deferred()];
    let index = 0;
    const run = createLatestWinsRunner(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await gates[index++].promise;
      active -= 1;
    });

    const first = run();
    run();
    gates[0].resolve();
    gates[1].resolve();
    await first;
    expect(maxActive).toBe(1);
  });

  it('drops the calls between the running one and the newest', async () => {
    const seen: number[] = [];
    const gate = deferred();
    const run = createLatestWinsRunner(async (_isStale, value: number) => {
      seen.push(value);
      if (value === 1) await gate.promise;
    });

    const done = run(1);
    run(2);
    run(3);
    gate.resolve();
    await done;
    expect(seen).toEqual([1, 3]);
  });

  it('marks the running task stale as soon as a newer call arrives', async () => {
    const gate = deferred();
    const staleAtEnd: boolean[] = [];
    const run = createLatestWinsRunner(async (isStale, value: number) => {
      if (value === 1) {
        expect(isStale()).toBe(false);
        await gate.promise;
        staleAtEnd.push(isStale());
      }
    });

    const done = run(1);
    run(2);
    gate.resolve();
    await done;
    expect(staleAtEnd).toEqual([true]);
  });

  it('reports a failing run and still runs the next one', async () => {
    const onError = vi.fn();
    const seen: number[] = [];
    const gate = deferred();
    const run = createLatestWinsRunner(
      async (_isStale, value: number) => {
        if (value === 1) {
          await gate.promise;
          throw new Error('boom');
        }
        seen.push(value);
      },
      { onError },
    );

    const done = run(1);
    run(2);
    gate.resolve();
    await done;
    expect(onError).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([2]);
  });

  it('starts a fresh chain after the previous one drained', async () => {
    const seen: number[] = [];
    const run = createLatestWinsRunner(async (_isStale, value: number) => {
      seen.push(value);
    });
    await run(1);
    await run(2);
    expect(seen).toEqual([1, 2]);
  });
});
