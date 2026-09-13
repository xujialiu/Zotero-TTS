import { describe, expect, it, vi } from 'vitest';
import { DEFAULTS, PREF_PREFIX, loadSettings } from '../../src/core/settings';
import { createReadAloudShortcuts, type ShortcutKeyEvent } from '../../src/ui/read-aloud-shortcuts';

describe('previous and next voice keys', () => {
  it('uses physical punctuation keys, ignores repeats and typing, and requires an active session', () => {
    const values = new Map<string, unknown>();
    const prefs = { get: (k: string) => values.get(k), set: (k: string, v: unknown) => { values.set(k, v); } };
    const reader = {}, switchVoice = vi.fn();
    const manager = { active: true, paused: true, setSpeed: vi.fn() };
    const keys = createReadAloudShortcuts({ prefs, getBindings: () => loadSettings(prefs).shortcuts, getManager: () => manager, switchVoice });
    const event = (extra: Partial<ShortcutKeyEvent> = {}): ShortcutKeyEvent => ({ key: '<', code: 'Comma', shiftKey: true,
      ctrlKey: false, altKey: false, metaKey: false, preventDefault: vi.fn(), stopPropagation: vi.fn(), ...extra });
    expect(DEFAULTS.shortcuts.previousVoice).toBe('Shift+,');
    expect(DEFAULTS.shortcuts.nextVoice).toBe('Shift+.');
    expect(keys.handleKeyDown(event(), () => reader)).toBe(true);
    expect(switchVoice).toHaveBeenLastCalledWith(reader, -1);
    keys.handleKeyDown(event({ key: '>', code: 'Period' }), () => reader);
    expect(switchVoice).toHaveBeenLastCalledWith(reader, 1);
    keys.handleKeyDown(event({ repeat: true }), () => reader);
    expect(keys.handleKeyDown(event({ target: { tagName: 'INPUT' } }), () => reader)).toBe(false);
    manager.active = false;
    expect(keys.handleKeyDown(event(), () => reader)).toBe(false);
    expect(switchVoice).toHaveBeenCalledTimes(2);
    manager.active = true;
    prefs.set(PREF_PREFIX + 'shortcuts.nextVoice', 'Shift+Q');
    expect(keys.handleKeyDown(event({ key: '>', code: 'Period' }), () => reader)).toBe(false);
    keys.handleKeyDown(event({ key: 'Q', code: 'KeyQ' }), () => reader);
    expect(switchVoice).toHaveBeenCalledTimes(3);
    prefs.set(PREF_PREFIX + 'shortcuts.nextVoice', '');
    expect(keys.handleKeyDown(event({ key: 'Q', code: 'KeyQ' }), () => reader)).toBe(false);
  });
});
