import { describe, expect, it, vi } from 'vitest';
import { DEFAULTS, PREF_PREFIX, loadSettings } from '../../src/core/settings';
import { createReadAloudShortcuts, type ReadAloudManagerLike, type ShortcutKeyEvent } from '../../src/ui/read-aloud-shortcuts';

function setup(manager: ReadAloudManagerLike | null = { active: true, paused: false, setSpeed: () => {} }) {
  const values = new Map<string, unknown>();
  const prefs = { get: (k: string) => values.get(k), set: (k: string, v: unknown) => { values.set(k, v); } };
  const annotate = vi.fn((_reader: unknown, _type: 'highlight' | 'underline') => true);
  const reader = {};
  const shortcuts = createReadAloudShortcuts({ prefs, getBindings: () => loadSettings(prefs).shortcuts, getManager: () => manager, annotate });
  const event = (key: string, extra: Partial<ShortcutKeyEvent> = {}): ShortcutKeyEvent => ({ key, code: 'Key' + key, shiftKey: true,
    ctrlKey: false, altKey: false, metaKey: false, preventDefault: vi.fn(), stopPropagation: vi.fn(), ...extra });
  return { prefs, shortcuts, event, reader, annotate };
}

describe('annotate shortcuts (issue #145)', () => {
  it('default to Shift+H and Shift+U', () => {
    expect(DEFAULTS.shortcuts.highlightSentence).toBe('Shift+H');
    expect(DEFAULTS.shortcuts.underlineSentence).toBe('Shift+U');
  });
  it('highlight or underline the sentence while a session plays', () => {
    const f = setup();
    const h = f.event('H');
    expect(f.shortcuts.handleKeyDown(h, () => f.reader)).toBe(true);
    expect(h.preventDefault).toHaveBeenCalled();
    expect(f.annotate).toHaveBeenLastCalledWith(f.reader, 'highlight');
    expect(f.shortcuts.handleKeyDown(f.event('U'), () => f.reader)).toBe(true);
    expect(f.annotate).toHaveBeenLastCalledWith(f.reader, 'underline');
  });
  it('work while paused, the session still open', () => {
    const f = setup({ active: true, paused: true, setSpeed: () => {} });
    expect(f.shortcuts.handleKeyDown(f.event('H'), () => f.reader)).toBe(true);
    expect(f.annotate).toHaveBeenCalledOnce();
  });
  it('fall through when no session is open', () => {
    for (const manager of [null, { active: false, setSpeed: () => {} }]) {
      const f = setup(manager);
      const h = f.event('H');
      expect(f.shortcuts.handleKeyDown(h, () => f.reader)).toBe(false);
      expect(h.preventDefault).not.toHaveBeenCalled();
      expect(f.annotate).not.toHaveBeenCalled();
    }
  });
  it('consume a repeat without annotating again', () => {
    const f = setup();
    expect(f.shortcuts.handleKeyDown(f.event('H', { repeat: true }), () => f.reader)).toBe(true);
    expect(f.annotate).not.toHaveBeenCalled();
  });
  it('follow a customized or cleared binding', () => {
    const f = setup();
    f.prefs.set(PREF_PREFIX + 'shortcuts.highlightSentence', 'Shift+Q');
    expect(f.shortcuts.handleKeyDown(f.event('H'), () => f.reader)).toBe(false);
    expect(f.shortcuts.handleKeyDown(f.event('Q'), () => f.reader)).toBe(true);
    f.prefs.set(PREF_PREFIX + 'shortcuts.underlineSentence', '');
    expect(f.shortcuts.handleKeyDown(f.event('U'), () => f.reader)).toBe(false);
  });
  it('log a failed annotation and still consume the key', () => {
    const log = vi.fn();
    const shortcuts = createReadAloudShortcuts({ prefs: { get: () => undefined, set: () => {} }, getBindings: () => DEFAULTS.shortcuts,
      getManager: () => ({ active: true, setSpeed: () => {} }), annotate: () => { throw new Error('dead'); }, log });
    const e = { key: 'H', code: 'KeyH', shiftKey: true, ctrlKey: false, altKey: false, metaKey: false, preventDefault: vi.fn(), stopPropagation: vi.fn() };
    expect(shortcuts.handleKeyDown(e, () => ({}))).toBe(true);
    expect(log).toHaveBeenCalledOnce();
  });
});
