import { describe, expect, it } from 'vitest';
import { MAX_TOASTS, dismissToast, pushToast, type Toast } from './toastState';

const toast = (id: number, message = `m${id}`, tone: Toast['tone'] = 'error'): Toast => ({
  id,
  message,
  tone,
});

describe('pushToast', () => {
  it('appends the newest toast last', () => {
    expect(pushToast([toast(1)], toast(2)).map((t) => t.id)).toEqual([1, 2]);
  });

  it('replaces a toast with the same message and tone instead of repeating it', () => {
    const result = pushToast([toast(1, 'same'), toast(2, 'other')], toast(3, 'same'));
    expect(result.map((t) => t.id)).toEqual([2, 3]);
  });

  it('treats the same message with another tone as distinct', () => {
    expect(pushToast([toast(1, 'x', 'error')], toast(2, 'x', 'info'))).toHaveLength(2);
  });

  it('drops the oldest toasts beyond the cap', () => {
    let list: Toast[] = [];
    for (let i = 1; i <= MAX_TOASTS + 2; i++) list = pushToast(list, toast(i));
    expect(list).toHaveLength(MAX_TOASTS);
    expect(list[0].id).toBe(3);
  });
});

describe('dismissToast', () => {
  it('removes only the toast with that id', () => {
    expect(dismissToast([toast(1), toast(2)], 1).map((t) => t.id)).toEqual([2]);
  });

  it('ignores an unknown id', () => {
    expect(dismissToast([toast(1)], 9)).toHaveLength(1);
  });
});
