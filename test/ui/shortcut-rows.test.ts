import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { NAVIGATION_ACTIONS, SHORTCUT_ACTIONS } from '../../src/core/shortcut-actions';
import { SPEED_ACTIONS } from '../../src/core/read-aloud-speed';
import { DEFAULTS, PREF_PREFIX, type PrefsBackend } from '../../src/core/settings';
import { initShortcutRows } from '../../src/ui/shortcut-rows';

function fakePrefs(initial: Record<string, unknown> = {}): PrefsBackend & { store: Record<string, unknown> } {
  const store = { ...initial };
  return {
    store,
    get: (k) => store[k],
    set: (k, v) => {
      store[k] = v;
    },
  };
}

class FakeElement {
  attrs = new Map<string, string>();
  listeners = new Map<string, Array<(e: unknown) => void>>();
  classes = new Set<string>();
  classList = {
    toggle: (c: string, force?: boolean) => {
      const on = force ?? !this.classes.has(c);
      if (on) this.classes.add(c);
      else this.classes.delete(c);
      return on;
    },
  };
  setAttribute(k: string, v: string) {
    this.attrs.set(k, String(v));
  }
  getAttribute(k: string) {
    return this.attrs.get(k) ?? null;
  }
  addEventListener(type: string, fn: (e: unknown) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type)!.push(fn);
  }
  fire(type: string, event: unknown = {}) {
    for (const fn of this.listeners.get(type) ?? []) fn(event);
  }
  get label() {
    return this.getAttribute('label');
  }
}

const IDS = [
  'ztts-key-speedReset',
  'ztts-key-speedDown',
  'ztts-key-speedUp',
  'ztts-key-clear-speedReset',
  'ztts-key-clear-speedDown',
  'ztts-key-clear-speedUp',
  'ztts-key-previousSentence',
  'ztts-key-nextSentence',
  'ztts-key-previousParagraph',
  'ztts-key-nextParagraph',
  'ztts-key-startFromSelection',
  'ztts-key-returnToSpoken',
  'ztts-key-clear-previousSentence',
  'ztts-key-clear-nextSentence',
  'ztts-key-clear-previousParagraph',
  'ztts-key-clear-nextParagraph',
  'ztts-key-clear-startFromSelection',
  'ztts-key-clear-returnToSpoken',
  'ztts-key-defaults',
  'ztts-key-message',
];

function fakeDoc() {
  const els = new Map(IDS.map((id) => [id, new FakeElement()]));
  const keydownListeners: Array<{ fn: (e: unknown) => void; capture: boolean }> = [];
  return {
    els,
    el: (id: string) => els.get(id)!,
    getElementById: (id: string) => els.get(id) ?? null,
    addEventListener: vi.fn((type: string, fn: (e: unknown) => void, capture: boolean) => {
      if (type === 'keydown') keydownListeners.push({ fn, capture });
    }),
    removeEventListener: vi.fn((type: string, fn: (e: unknown) => void) => {
      const i = keydownListeners.findIndex((l) => l.fn === fn);
      if (i >= 0) keydownListeners.splice(i, 1);
    }),
    keydown(partial: Record<string, unknown>) {
      const event = {
        key: '',
        code: '',
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        ...partial,
      };
      for (const l of [...keydownListeners]) l.fn(event);
      return event;
    },
    get recording() {
      return keydownListeners.length;
    },
    get captureFlags() {
      return keydownListeners.map((l) => l.capture);
    },
  };
}

const key = (action: string) => `${PREF_PREFIX}shortcuts.${action}`;

function setup(initial: Record<string, unknown> = {}) {
  const doc = fakeDoc();
  const prefs = fakePrefs(initial);
  initShortcutRows(doc, prefs, 'Meta');
  return { doc, prefs };
}

describe('initShortcutRows', () => {
  it('shows the stored bindings, or the defaults when nothing is stored', () => {
    const { doc } = setup();
    expect(doc.el('ztts-key-speedReset').label).toBe('Shift+Z');
    expect(doc.el('ztts-key-speedDown').label).toBe('Shift+X');
    expect(doc.el('ztts-key-speedUp').label).toBe('Shift+C');
    expect(doc.el('ztts-key-previousSentence').label).toBe('ArrowLeft');
    expect(doc.el('ztts-key-nextSentence').label).toBe('ArrowRight');
    expect(doc.el('ztts-key-previousParagraph').label).toBe('Shift+ArrowLeft');
    expect(doc.el('ztts-key-nextParagraph').label).toBe('Shift+ArrowRight');
    expect(doc.el('ztts-key-startFromSelection').label).toBe('Shift+Space');
    expect(doc.el('ztts-key-returnToSpoken').label).toBe('Shift+Enter');
    expect(doc.recording).toBe(0);
  });

  it('accepts a bare arrow key for a navigation row', () => {
    const { doc, prefs } = setup();
    doc.el('ztts-key-nextParagraph').fire('command');
    doc.keydown({ key: 'ArrowDown', code: 'ArrowDown' });
    expect(prefs.store[key('nextParagraph')]).toBe('ArrowDown');
    expect(doc.el('ztts-key-nextParagraph').label).toBe('ArrowDown');
    expect(doc.recording).toBe(0);
  });

  it('tells a navigation row that arrows are allowed when a bare letter is refused', () => {
    const { doc, prefs } = setup();
    doc.el('ztts-key-nextSentence').fire('command');
    doc.keydown({ key: 'n', code: 'KeyN' });
    expect(doc.el('ztts-key-message').getAttribute('value')).toMatch(/arrow key/i);
    expect(prefs.store[key('nextSentence')]).toBeUndefined();
  });

  it('records a new combination when a row is clicked and a key is pressed', () => {
    const { doc, prefs } = setup();
    doc.el('ztts-key-speedUp').fire('command');
    expect(doc.el('ztts-key-speedUp').label).toMatch(/press/i);
    expect(doc.recording).toBe(1);
    expect(doc.captureFlags).toEqual([true]);

    const event = doc.keydown({ key: 'k', code: 'KeyK', ctrlKey: true });
    expect(event.preventDefault).toHaveBeenCalled();
    expect(prefs.store[key('speedUp')]).toBe('Ctrl+K');
    expect(doc.el('ztts-key-speedUp').label).toBe('Ctrl+K');
    expect(doc.recording).toBe(0);
  });

  it('waits through a lone modifier press', () => {
    const { doc, prefs } = setup();
    doc.el('ztts-key-speedUp').fire('command');
    doc.keydown({ key: 'Shift', code: 'ShiftLeft', shiftKey: true });
    expect(doc.recording).toBe(1);
    expect(prefs.store[key('speedUp')]).toBeUndefined();
  });

  it('rejects a conflicting combination with a message and keeps the old binding', () => {
    const { doc, prefs } = setup();
    doc.el('ztts-key-speedUp').fire('command');
    doc.keydown({ key: 'X', code: 'KeyX', shiftKey: true });
    expect(prefs.store[key('speedUp')]).toBeUndefined();
    expect(doc.el('ztts-key-speedUp').label).toBe('Shift+C');
    expect(doc.el('ztts-key-message').getAttribute('value')).toMatch(/already used/i);
    expect(doc.recording).toBe(0);
  });

  it('explains why a bare key is refused', () => {
    const { doc } = setup();
    doc.el('ztts-key-speedUp').fire('command');
    doc.keydown({ key: 'k', code: 'KeyK' });
    expect(doc.el('ztts-key-message').getAttribute('value')).toMatch(/modifier/i);
  });

  it('cancels on Escape, or on clicking the same row again', () => {
    const { doc, prefs } = setup();
    doc.el('ztts-key-speedUp').fire('command');
    doc.keydown({ key: 'Escape', code: 'Escape' });
    expect(doc.recording).toBe(0);
    expect(doc.el('ztts-key-speedUp').label).toBe('Shift+C');

    doc.el('ztts-key-speedUp').fire('command');
    doc.el('ztts-key-speedUp').fire('command');
    expect(doc.recording).toBe(0);
    expect(prefs.store[key('speedUp')]).toBeUndefined();
  });

  it('moves the recording when another row is clicked', () => {
    const { doc, prefs } = setup();
    doc.el('ztts-key-speedUp').fire('command');
    doc.el('ztts-key-speedDown').fire('command');
    expect(doc.recording).toBe(1);
    doc.keydown({ key: 'j', code: 'KeyJ', ctrlKey: true });
    expect(prefs.store[key('speedDown')]).toBe('Ctrl+J');
    expect(prefs.store[key('speedUp')]).toBeUndefined();
  });

  it('clears a binding from its Clear button or with Backspace while recording', () => {
    const { doc, prefs } = setup();
    doc.el('ztts-key-clear-speedReset').fire('command');
    expect(prefs.store[key('speedReset')]).toBe('');
    expect(doc.el('ztts-key-speedReset').label).toBe('Not set');

    doc.el('ztts-key-speedDown').fire('command');
    doc.keydown({ key: 'Backspace', code: 'Backspace' });
    expect(prefs.store[key('speedDown')]).toBe('');
    expect(doc.el('ztts-key-speedDown').label).toBe('Not set');
  });

  it('restores every default', () => {
    const { doc, prefs } = setup({ [key('speedUp')]: 'Ctrl+K', [key('speedDown')]: '' });
    expect(doc.el('ztts-key-speedUp').label).toBe('Ctrl+K');
    doc.el('ztts-key-defaults').fire('command');
    expect(prefs.store[key('speedUp')]).toBe(DEFAULTS.shortcuts.speedUp);
    expect(prefs.store[key('speedDown')]).toBe(DEFAULTS.shortcuts.speedDown);
    expect(prefs.store[key('speedReset')]).toBe(DEFAULTS.shortcuts.speedReset);
    expect(doc.el('ztts-key-speedUp').label).toBe('Shift+C');
  });

  it('labels Meta for the platform it is shown on', () => {
    const doc = fakeDoc();
    initShortcutRows(doc, fakePrefs({ [key('speedUp')]: 'Meta+K' }), 'Cmd');
    expect(doc.el('ztts-key-speedUp').label).toBe('Cmd+K');
  });

  it('tolerates a pane that lacks the rows entirely', () => {
    const doc = { getElementById: () => null, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    expect(() => initShortcutRows(doc, fakePrefs(), 'Meta')).not.toThrow();
  });
});

// The pane finds its rows by id (initShortcutRows). An action without a row
// is invisible and unbindable, and nothing else would catch it.
describe('addon/content/preferences.xhtml', () => {
  const xhtml = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'addon', 'content', 'preferences.xhtml'),
    'utf8',
  );

  it('has a row and a Clear button for every shortcut action', () => {
    for (const action of SHORTCUT_ACTIONS) {
      expect(xhtml, action).toContain(`id="ztts-key-${action}"`);
      expect(xhtml, action).toContain(`id="ztts-key-clear-${action}"`);
    }
  });

  // What a key does outside a Read Aloud session is the one thing its row
  // cannot show: a ? at the end of the row says it on hover, where a
  // paragraph under the rows once did. The speed keys work in every state
  // and get none.
  it('explains the keys that depend on a session with a ? at the end of the row', () => {
    const rowOf = (action: string) => {
      const at = xhtml.indexOf(`id="ztts-key-${action}"`);
      return xhtml.slice(xhtml.lastIndexOf('<hbox', at), xhtml.indexOf('</hbox>', at));
    };
    const help = /<label class="ztts-help" value="\?" tooltiptext="([^"]+)"\/>/;
    for (const action of [...NAVIGATION_ACTIONS, 'returnToSpoken']) {
      expect(rowOf(action).match(help)?.[1], action).toMatch(/only while Read Aloud is open/);
    }
    expect(rowOf('startFromSelection').match(help)?.[1]).toMatch(/every state/);
    for (const action of SPEED_ACTIONS) expect(rowOf(action), action).not.toMatch(help);
    expect(xhtml).not.toContain('<description>Sentence, paragraph');
  });
});
