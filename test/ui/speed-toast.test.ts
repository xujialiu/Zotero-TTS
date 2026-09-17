import { describe, expect, it, vi } from 'vitest';
import { removeSpeedToast, showSpeedToast, showToast, SPEED_TOAST_ID } from '../../src/ui/speed-toast';
import { createVoiceNotices, VOICE_NOTICE_ID } from '../../src/ui/voice-notice';

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

describe('showToast', () => {
  it('does not let an obsolete dismissal hide a newer notice', () => {
    const doc = fakeDoc(), timer = fakeTimer();
    const first = showToast(doc, 'B', timer, null);
    showToast(doc, 'C', timer, null);
    first();
    expect(doc.children[0].textContent).toBe('C');
    expect(doc.children[0].style.opacity).toBe('1');
  });
  it('keeps a persistent notice visible until its owner dismisses it', () => {
    const doc = fakeDoc(), timer = fakeTimer();
    const dismiss = showToast(doc, 'Preparing B', timer, null);
    expect(timer.set).not.toHaveBeenCalled();
    expect(doc.children[0].style.opacity).toBe('1');
    dismiss();
    expect(doc.children[0].style.opacity).toBe('0');
  });
  it('does not throw when the reader closes before a voice notice hides', () => {
    const doc = fakeDoc(), timer = fakeTimer();
    showToast(doc, 'Preparing voice: B', timer);
    Object.defineProperty(doc.children[0], 'style', { get() { throw new TypeError("can't access dead object"); } });
    expect(() => timer.pending[0]()).not.toThrow();
  });
  it('still reports unrelated errors in the hide callback', () => {
    const doc = fakeDoc(), timer = fakeTimer();
    showToast(doc, 'Preparing voice: B', timer);
    Object.defineProperty(doc.children[0], 'style', { get() { throw new Error('unrelated style failure'); } });
    expect(() => timer.pending[0]()).toThrow('unrelated style failure');
  });
  it('shows arbitrary text in the same overlay', () => {
    const doc = fakeDoc();
    showToast(doc, 'No saved position');
    expect(doc.getElementById(SPEED_TOAST_ID).textContent).toBe('No saved position');
    expect(doc.getElementById(SPEED_TOAST_ID).style.opacity).toBe('1');
  });

  it('reuses the element a speed toast created', () => {
    const doc = fakeDoc();
    showSpeedToast(doc, 1.3);
    showToast(doc, 'No saved position');
    expect(doc.children).toHaveLength(1);
    expect(doc.getElementById(SPEED_TOAST_ID).textContent).toBe('No saved position');
  });
});

describe('voice notices', () => {
  it('survives a long preparation and unrelated speed toasts, then disappears immediately', () => {
    vi.useFakeTimers();
    try {
      const doc = fakeDoc(), reader = {};
      const notices = createVoiceNotices({ document: () => doc, message: (kind, voice) => `${kind}: ${voice}` });
      notices.notice(reader, 'preparing', 'B');
      showSpeedToast(doc, 2);
      vi.advanceTimersByTime(6000);
      expect(doc.getElementById(VOICE_NOTICE_ID).style.opacity).toBe('1');
      expect(doc.getElementById(SPEED_TOAST_ID).style.opacity).toBe('0');
      notices.notice(reader, 'selected', 'B');
      expect(doc.getElementById(VOICE_NOTICE_ID).style.opacity).toBe('0');
      expect(doc.getElementById(VOICE_NOTICE_ID).style.transition).toBe('none');
      notices.dispose();
    } finally { vi.useRealTimers(); }
  });
  it.each(['ready', 'cancelled'] as const)('clears the original document on %s even after a tab switch', kind => {
    const first = fakeDoc(), second = fakeDoc(), reader = {};
    let doc = first;
    const notices = createVoiceNotices({ document: () => doc, message: () => 'Preparing' });
    notices.notice(reader, 'preparing', 'B'); doc = second;
    notices.notice(reader, kind, 'B');
    expect(first.children[0].style.opacity).toBe('0');
    expect(second.children).toHaveLength(0);
  });
  it('replaces a pending notice with a timed failure and cleans up on disposal', () => {
    const doc = fakeDoc(), reader = {};
    const notices = createVoiceNotices({ document: () => doc, message: kind => kind });
    notices.notice(reader, 'preparing', 'B');
    notices.notice(reader, 'failed', 'B');
    expect(doc.getElementById(VOICE_NOTICE_ID).textContent).toBe('failed');
    notices.dispose();
    expect(doc.getElementById(VOICE_NOTICE_ID).style.opacity).toBe('0');
  });
});

describe('ordinary playback and voice-switch notice priority', () => {
  it('keeps one switching notice while playback waits and then starts the old voice', () => {
    const doc = fakeDoc(), reader = {};
    const notices = createVoiceNotices({ document: () => doc,
      message: (kind, voice) => `${kind}:${voice}`, playbackMessage: kind => kind });
    notices.playback(reader, 'preparing');
    expect(doc.getElementById('ztts-playback-notice').style.opacity).toBe('1');
    notices.notice(reader, 'preparing', 'B');
    expect(doc.getElementById('ztts-playback-notice').style.opacity).toBe('0');
    expect(doc.getElementById(VOICE_NOTICE_ID).textContent).toBe('preparing:B');
    notices.playback(reader, 'idle');
    expect(doc.getElementById(VOICE_NOTICE_ID).style.opacity).toBe('1');
    notices.notice(reader, 'selected', 'B');
    expect(doc.getElementById(VOICE_NOTICE_ID).style.opacity).toBe('0');
    notices.dispose();
  });
  it('restores an ongoing playback wait after a switch is cancelled and expires failures', () => {
    vi.useFakeTimers();
    try {
      const doc = fakeDoc(), reader = {};
      const notices = createVoiceNotices({ document: () => doc,
        message: (kind, voice) => `${kind}:${voice}`, playbackMessage: kind => kind });
      notices.notice(reader, 'preparing', 'B'); notices.playback(reader, 'preparing');
      expect(doc.getElementById('ztts-playback-notice')).toBeNull();
      notices.notice(reader, 'cancelled', 'B');
      expect(doc.getElementById('ztts-playback-notice').style.opacity).toBe('1');
      notices.playback(reader, 'failed');
      expect(doc.getElementById('ztts-playback-notice').textContent).toBe('failed');
      vi.advanceTimersByTime(5000);
      expect(doc.getElementById('ztts-playback-notice').style.opacity).toBe('0');
      notices.dispose(); expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
});
