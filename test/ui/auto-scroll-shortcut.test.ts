import { describe, expect, it, vi } from 'vitest';
import { DEFAULTS, PREF_PREFIX, loadSettings } from '../../src/core/settings';
import { createReadAloudShortcuts, type ShortcutKeyEvent } from '../../src/ui/read-aloud-shortcuts';

function setup() {
  const values = new Map<string, unknown>();
  const prefs = { get: (k: string) => values.get(k), set: (k: string, v: unknown) => { values.set(k, v); } };
  const lockPosition = vi.fn(), emitState = vi.fn(), showAutoScrollToast = vi.fn(), startReadAloud = vi.fn();
  const reader = {};
  const shortcuts = createReadAloudShortcuts({ prefs, getBindings: () => loadSettings(prefs).shortcuts,
    getManager: () => null, lockPosition, emitState, startReadAloud, showAutoScrollToast });
  const event = (extra: Partial<ShortcutKeyEvent> = {}): ShortcutKeyEvent => ({ key: 'A', code: 'KeyA', shiftKey: true,
    ctrlKey: false, altKey: false, metaKey: false, preventDefault: vi.fn(), stopPropagation: vi.fn(), ...extra });
  return { values, prefs, shortcuts, event, reader, lockPosition, emitState, startReadAloud, showAutoScrollToast };
}

describe('auto-scroll shortcut', () => {
  it('defaults to Shift+A and toggles the shared persistent mode in an idle reader', () => {
    const f = setup();
    expect(DEFAULTS.shortcuts.toggleAutoScroll).toBe('Shift+A');
    expect(f.shortcuts.handleKeyDown(f.event(), () => f.reader)).toBe(true);
    expect(loadSettings(f.prefs).readAloud.autoScrollMode).toBe('sentence');
    expect(f.showAutoScrollToast).toHaveBeenLastCalledWith(f.reader, 'sentence');
    f.shortcuts.handleKeyDown(f.event(), () => f.reader);
    expect(loadSettings(f.prefs).readAloud.autoScrollMode).toBe('outside');
    expect(f.showAutoScrollToast).toHaveBeenLastCalledWith(f.reader, 'outside');
    expect(f.lockPosition).not.toHaveBeenCalled();
    expect(f.emitState).not.toHaveBeenCalled();
    expect(f.startReadAloud).not.toHaveBeenCalled();
  });
  it('uses a customized binding immediately and supports clearing', () => {
    const f = setup();
    f.prefs.set(PREF_PREFIX + 'shortcuts.toggleAutoScroll', 'Shift+Q');
    expect(f.shortcuts.handleKeyDown(f.event(), () => f.reader)).toBe(false);
    expect(f.shortcuts.handleKeyDown(f.event({ key: 'Q', code: 'KeyQ' }), () => f.reader)).toBe(true);
    f.prefs.set(PREF_PREFIX + 'shortcuts.toggleAutoScroll', '');
    expect(f.shortcuts.handleKeyDown(f.event({ key: 'Q', code: 'KeyQ' }), () => f.reader)).toBe(false);
  });
  it('ignores editable controls, handled events and non-reader contexts', () => {
    const f = setup();
    expect(f.shortcuts.handleKeyDown(f.event({ target: { tagName: 'INPUT' } }), () => f.reader)).toBe(false);
    expect(f.shortcuts.handleKeyDown(f.event({ defaultPrevented: true }), () => f.reader)).toBe(false);
    expect(f.shortcuts.handleKeyDown(f.event(), () => null)).toBe(false);
    expect(f.values.size).toBe(0);
  });
  it('consumes repeat events without flipping the setting again', () => {
    const f = setup(); const e = f.event({ repeat: true });
    expect(f.shortcuts.handleKeyDown(e, () => f.reader)).toBe(true);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(f.values.size).toBe(0);
  });
  it('does not announce a failed preference write', () => {
    const f = setup(); const log = vi.fn();
    const shortcuts = createReadAloudShortcuts({ prefs: { get: () => 'outside', set: () => { throw new Error('refused'); } },
      getBindings: () => DEFAULTS.shortcuts, getManager: () => null, showAutoScrollToast: f.showAutoScrollToast, log });
    expect(shortcuts.handleKeyDown(f.event(), () => f.reader)).toBe(true);
    expect(f.showAutoScrollToast).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledOnce();
  });
});
