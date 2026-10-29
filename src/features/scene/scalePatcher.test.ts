import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScalePatcher } from './scalePatcher';

/** Lets pending promise callbacks run. */
const settle = () => vi.advanceTimersByTimeAsync(0);

describe('createScalePatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function setup(send = vi.fn().mockResolvedValue(undefined)) {
    const onFailure = vi.fn();
    const patcher = createScalePatcher({ send, onFailure, delayMs: 400 });
    return { patcher, send, onFailure };
  }

  it('sends one request with the last value of a burst', async () => {
    const { patcher, send } = setup();
    patcher.schedule('t1', 1);
    await vi.advanceTimersByTimeAsync(200);
    patcher.schedule('t1', 2);
    await vi.advanceTimersByTimeAsync(200);
    patcher.schedule('t1', 3);
    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(400);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('t1', 3, false);
  });

  it('keeps textures independent', async () => {
    const { patcher, send } = setup();
    patcher.schedule('a', 1);
    patcher.schedule('b', 2);
    await vi.advanceTimersByTimeAsync(400);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('holds a newer scale until the in-flight request answers', async () => {
    let release!: () => void;
    const send = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => (release = resolve)))
      .mockResolvedValue(undefined);
    const { patcher } = setup(send);

    patcher.schedule('t1', 1);
    await vi.advanceTimersByTimeAsync(400);
    patcher.schedule('t1', 2);
    await vi.advanceTimersByTimeAsync(400);
    expect(send).toHaveBeenCalledTimes(1);

    release();
    await settle();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith('t1', 2, false);
  });

  it('rolls back to the last confirmed scale when the send fails', async () => {
    const send = vi.fn().mockRejectedValue(new Error('500'));
    const { patcher, onFailure } = setup(send);
    patcher.confirm('t1', 1);
    patcher.schedule('t1', 4);
    await vi.advanceTimersByTimeAsync(400);
    await settle();
    expect(onFailure).toHaveBeenCalledWith('t1', 1);
  });

  it('does not roll back while a newer scale is queued', async () => {
    let fail!: (error: Error) => void;
    const send = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((_, reject) => (fail = reject)))
      .mockResolvedValue(undefined);
    const { patcher, onFailure } = setup(send);
    patcher.confirm('t1', 1);
    patcher.schedule('t1', 2);
    await vi.advanceTimersByTimeAsync(400);
    patcher.schedule('t1', 3);
    fail(new Error('500'));
    await settle();
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('flush sends queued scales at once, marked keepalive', async () => {
    const { patcher, send } = setup();
    patcher.schedule('t1', 2);
    patcher.flush();
    expect(send).toHaveBeenCalledWith('t1', 2, true);
    await vi.advanceTimersByTimeAsync(400);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('flush sends the newest scale with keepalive even while a request is open', async () => {
    let release!: () => void;
    const send = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => (release = resolve)))
      .mockResolvedValue(undefined);
    const { patcher } = setup(send);

    patcher.schedule('t1', 1);
    await vi.advanceTimersByTimeAsync(400);
    patcher.schedule('t1', 2);
    patcher.flush();

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith('t1', 2, true);

    release();
    await settle();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('keeps keepalive on a scale that was queued behind an open request at flush', async () => {
    let release!: () => void;
    const send = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => (release = resolve)))
      .mockResolvedValue(undefined);
    const { patcher } = setup(send);

    patcher.schedule('t1', 1);
    patcher.flush();
    patcher.schedule('t1', 2);
    // The timer path waits behind the open request.
    await vi.advanceTimersByTimeAsync(400);
    expect(send).toHaveBeenCalledTimes(1);

    release();
    await settle();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith('t1', 2, true);
  });

  it('does not let an older response overwrite the accepted scale of a newer send', async () => {
    let releaseOld!: () => void;
    const send = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => (releaseOld = resolve)))
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('500'));
    const { patcher, onFailure } = setup(send);
    patcher.confirm('t1', 1);

    patcher.schedule('t1', 2);
    await vi.advanceTimersByTimeAsync(400);
    patcher.schedule('t1', 3);
    patcher.flush();
    await settle();
    releaseOld();
    await settle();

    // The older response arrived last but must not replace the accepted 3.
    patcher.schedule('t1', 4);
    await vi.advanceTimersByTimeAsync(400);
    await settle();
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onFailure).toHaveBeenCalledWith('t1', 3);
  });

  it('rolls back to the older accepted scale when the newest overlapping send fails', async () => {
    let releaseOld!: () => void;
    let failNew!: (error: Error) => void;
    const send = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => (releaseOld = resolve)))
      .mockImplementationOnce(
        () => new Promise<void>((_resolve, reject) => (failNew = reject)),
      );
    const { patcher, onFailure } = setup(send);
    patcher.confirm('t1', 1);

    patcher.schedule('t1', 2);
    await vi.advanceTimersByTimeAsync(400);
    patcher.schedule('t1', 3);
    patcher.flush();

    // The older send is accepted first, then the newest one fails.
    releaseOld();
    await settle();
    failNew(new Error('500'));
    await settle();

    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onFailure).toHaveBeenLastCalledWith('t1', 2);
  });

  it('realigns the rollback when the older send is accepted after the newest failed', async () => {
    let releaseOld!: () => void;
    const send = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => (releaseOld = resolve)))
      .mockRejectedValueOnce(new Error('500'));
    const { patcher, onFailure } = setup(send);
    patcher.confirm('t1', 1);

    patcher.schedule('t1', 2);
    await vi.advanceTimersByTimeAsync(400);
    patcher.schedule('t1', 3);
    patcher.flush();
    await settle();
    expect(onFailure).toHaveBeenLastCalledWith('t1', 1);

    releaseOld();
    await settle();
    expect(onFailure).toHaveBeenLastCalledWith('t1', 2);
  });

  it('does not re-add a forgotten texture when its open request resolves', async () => {
    let release!: () => void;
    const send = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => (release = resolve)))
      .mockRejectedValue(new Error('404'));
    const { patcher, onFailure } = setup(send);
    patcher.confirm('t1', 1);
    patcher.schedule('t1', 2);
    await vi.advanceTimersByTimeAsync(400);

    patcher.forget('t1');
    release();
    await settle();

    // With the accepted scale gone, a later failure has nothing to roll back to.
    patcher.schedule('t1', 3);
    await vi.advanceTimersByTimeAsync(400);
    await settle();
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('forget cancels a queued scale and silences a later failure', async () => {
    const send = vi.fn().mockRejectedValue(new Error('404'));
    const { patcher, onFailure } = setup(send);
    patcher.confirm('t1', 1);
    patcher.schedule('t1', 2);
    patcher.forget('t1');
    await vi.advanceTimersByTimeAsync(400);
    expect(send).not.toHaveBeenCalled();

    patcher.schedule('t1', 3);
    await vi.advanceTimersByTimeAsync(400);
    await settle();
    expect(onFailure).not.toHaveBeenCalled();
  });
});
