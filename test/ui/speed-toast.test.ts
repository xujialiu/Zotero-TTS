import { describe, expect, it, vi } from 'vitest';
import { removeSpeedToast, showSpeedToast, SPEED_TOAST_ID } from '../../src/ui/speed-toast';

function fakeDoc() {
  const children: any[] = [];
  const body = {
    appendChild: vi.fn((el: any) => {
      children.push(el);
    }),
  };
  return {
    children,
    body,
    documentElement: body,
    getElementById: (id: string) => children.find((e) => e.id === id) ?? null,
    createElementNS: vi.fn((_ns: string, name: string) => {
      const el: any = {
        id: '',
        tagName: name,
        style: { cssText: '', opacity: '' },
        textContent: '',
        remove: vi.fn(() => {
          const i = children.indexOf(el);
          if (i >= 0) children.splice(i, 1);
        }),
      };
      return el;
    }),
  };
}

function fakeTimer() {
  const pending: Array<() => void> = [];
  return {
    pending,
    set: vi.fn((fn: () => void) => {
      pending.push(fn);
      return pending.length;
    }),
    clear: vi.fn(),
  };
}

describe('showSpeedToast', () => {
  it('creates one XHTML element, shows the speed, and hides it again after the delay', () => {
    const doc = fakeDoc();
    const timer = fakeTimer();
    showSpeedToast(doc, 1.1, timer);

    expect(doc.createElementNS).toHaveBeenCalledWith('http://www.w3.org/1999/xhtml', 'div');
    expect(doc.children).toHaveLength(1);
    const el = doc.children[0];
    expect(el.id).toBe(SPEED_TOAST_ID);
    expect(el.textContent).toBe('1.1×');
    expect(el.style.opacity).toBe('1');
    expect(el.style.cssText).toContain('position:fixed');

    timer.pending[0]();
    expect(el.style.opacity).toBe('0');
  });

  it('reuses the element and restarts the timer on repeated presses', () => {
    const doc = fakeDoc();
    const timer = fakeTimer();
    showSpeedToast(doc, 1.1, timer);
    showSpeedToast(doc, 1.2, timer);

    expect(doc.createElementNS).toHaveBeenCalledTimes(1);
    expect(doc.children).toHaveLength(1);
    expect(doc.children[0].textContent).toBe('1.2×');
    expect(timer.clear).toHaveBeenCalledWith(1);
    expect(timer.set).toHaveBeenCalledTimes(2);
  });

  it('always prints one decimal so 1 reads as 1.0×', () => {
    const doc = fakeDoc();
    showSpeedToast(doc, 1, fakeTimer());
    expect(doc.children[0].textContent).toBe('1.0×');
  });

  it('falls back to the document element when there is no body (XUL windows)', () => {
    const doc = fakeDoc();
    (doc as any).body = null;
    showSpeedToast(doc, 1.5, fakeTimer());
    expect(doc.children).toHaveLength(1);
  });
});

describe('removeSpeedToast', () => {
  it('removes the element if present and is a no-op otherwise', () => {
    const doc = fakeDoc();
    expect(() => removeSpeedToast(doc)).not.toThrow();
    showSpeedToast(doc, 1.1, fakeTimer());
    removeSpeedToast(doc);
    expect(doc.children).toHaveLength(0);
  });
});
