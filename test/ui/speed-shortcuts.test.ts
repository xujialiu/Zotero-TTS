import { describe, expect, it, vi } from 'vitest';
import { READ_ALOUD_VOICES_PREF } from '../../src/core/read-aloud-speed';
import type { PrefsBackend } from '../../src/core/settings';
import {
  createSpeedShortcuts,
  deepActiveElement,
  isEditableTarget,
  pickReader,
  type ReadAloudManagerLike,
  type ShortcutKeyEvent,
  type SpeedShortcutsDeps,
} from '../../src/ui/speed-shortcuts';

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

function fakeManager() {
  const m = {
    active: true,
    speed: 1,
    lang: 'en' as string | null,
    selectedVoiceID: 'voice-1' as string | null,
    setSpeed: vi.fn((speed: number, _persist?: boolean) => {
      m.speed = speed;
    }),
  };
  return m satisfies ReadAloudManagerLike;
}

function keyEvent(partial: Partial<ShortcutKeyEvent> = {}): ShortcutKeyEvent {
  return {
    key: 'C',
    code: 'KeyC',
    ctrlKey: false,
    altKey: false,
    shiftKey: true,
    metaKey: false,
    repeat: false,
    defaultPrevented: false,
    target: { tagName: 'DIV' },
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...partial,
  };
}

const BINDINGS = { speedReset: 'Shift+Z', speedDown: 'Shift+X', speedUp: 'Shift+C' };
const voicesPref = (prefs: { store: Record<string, unknown> }) => JSON.parse(prefs.store[READ_ALOUD_VOICES_PREF] as string);

function setup(over: Partial<SpeedShortcutsDeps> = {}) {
  const prefs = fakePrefs();
  const manager = fakeManager();
  const reader = { id: 'reader' };
  const showToast = vi.fn();
  const log = vi.fn();
  const shortcuts = createSpeedShortcuts({
    getBindings: () => BINDINGS,
    prefs,
    getManager: () => manager,
    showToast,
    log,
    ...over,
  });
  return { shortcuts, prefs, manager, reader, showToast, log, resolve: () => reader };
}

describe('handleKeyDown', () => {
  it('ignores keys that match no binding, without touching the event', () => {
    const { shortcuts, manager, resolve } = setup();
    const event = keyEvent({ key: 'Q', code: 'KeyQ' });
    expect(shortcuts.handleKeyDown(event, resolve)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(manager.setSpeed).not.toHaveBeenCalled();
  });

  it("applies the matching action through the reader's manager and lets Zotero persist it", () => {
    const { shortcuts, manager, reader, showToast, resolve } = setup();
    const event = keyEvent({ key: 'C', code: 'KeyC' });
    expect(shortcuts.handleKeyDown(event, resolve)).toBe(true);
    expect(manager.setSpeed).toHaveBeenCalledWith(1.1, true);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(reader, 1.1);
  });

  it("steps from the manager's live speed, not from the pref", () => {
    const { shortcuts, manager, resolve } = setup();
    manager.speed = 2;
    shortcuts.handleKeyDown(keyEvent({ key: 'X', code: 'KeyX' }), resolve);
    expect(manager.setSpeed).toHaveBeenCalledWith(1.9, true);
  });

  it('resets to 1', () => {
    const { shortcuts, manager, resolve } = setup();
    manager.speed = 1.7;
    shortcuts.handleKeyDown(keyEvent({ key: 'Z', code: 'KeyZ' }), resolve);
    expect(manager.setSpeed).toHaveBeenCalledWith(1, true);
  });

  it('persists the speed itself when no voice is selected yet, since Zotero will not', () => {
    const { shortcuts, manager, prefs, resolve } = setup();
    manager.selectedVoiceID = null;
    shortcuts.handleKeyDown(keyEvent({ key: 'C', code: 'KeyC' }), resolve);
    expect(manager.setSpeed).toHaveBeenCalledWith(1.1, false);
    expect(voicesPref(prefs)).toEqual({ en: { speed: 1.1 } });
  });

  // Zotero's persistence path (reader._setReadAloudVoice) re-syncs and
  // activates an idle manager that still holds a voice from an earlier
  // popup: the shortcut would start playback with the popup closed.
  it('never lets Zotero persist for an idle manager, even one with a voice', () => {
    const { shortcuts, manager, prefs, resolve } = setup();
    manager.active = false;
    shortcuts.handleKeyDown(keyEvent({ key: 'C', code: 'KeyC' }), resolve);
    expect(manager.setSpeed).toHaveBeenCalledWith(1.1, false);
    expect(voicesPref(prefs)).toEqual({ en: { speed: 1.1 } });
  });

  // Until the manager has learned its language it has never been synced from
  // the pref, so its speed is the constructor default, not the user's setting
  it('starts from the persisted speed until the manager knows its language', () => {
    const { shortcuts, manager, prefs, resolve } = setup();
    manager.active = false;
    manager.lang = null;
    manager.speed = 1;
    prefs.set(READ_ALOUD_VOICES_PREF, JSON.stringify({ en: { speed: 1.5 } }));
    shortcuts.handleKeyDown(keyEvent({ key: 'C', code: 'KeyC' }), resolve);
    expect(manager.setSpeed).toHaveBeenCalledWith(1.6, false);
    expect(voicesPref(prefs)).toEqual({ en: { speed: 1.6 } });
  });

  it('falls back to the pref alone when the reader has no manager', () => {
    const { shortcuts, prefs, reader, showToast, resolve } = setup({ getManager: () => null });
    prefs.set(READ_ALOUD_VOICES_PREF, JSON.stringify({ en: { speed: 1.5 } }));
    expect(shortcuts.handleKeyDown(keyEvent({ key: 'C', code: 'KeyC' }), resolve)).toBe(true);
    expect(voicesPref(prefs)).toEqual({ en: { speed: 1.6 } });
    expect(showToast).toHaveBeenCalledWith(reader, 1.6);
  });

  it('treats a manager lookup that throws as no manager, and records it', () => {
    const { shortcuts, prefs, log, resolve } = setup({
      getManager: () => {
        throw new Error('dead window');
      },
    });
    expect(shortcuts.handleKeyDown(keyEvent({ key: 'C', code: 'KeyC' }), resolve)).toBe(true);
    expect(voicesPref(prefs)).toEqual({});
    expect(log).toHaveBeenCalled();
  });

  it('does nothing when no reader is available', () => {
    const { shortcuts, manager } = setup();
    const event = keyEvent({ key: 'C', code: 'KeyC' });
    expect(shortcuts.handleKeyDown(event, () => null)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(manager.setSpeed).not.toHaveBeenCalled();
  });

  it('lets typing through in editable fields', () => {
    const { shortcuts, manager, resolve } = setup();
    for (const target of [{ tagName: 'INPUT', type: 'text' }, { tagName: 'TEXTAREA' }, { tagName: 'DIV', isContentEditable: true }]) {
      const event = keyEvent({ key: 'C', code: 'KeyC', target });
      expect(shortcuts.handleKeyDown(event, resolve), JSON.stringify(target)).toBe(false);
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
    expect(manager.setSpeed).not.toHaveBeenCalled();
  });

  it('accepts a custom editable check for listeners that need to look deeper than event.target', () => {
    const { shortcuts, manager, resolve } = setup();
    const event = keyEvent({ key: 'C', code: 'KeyC' });
    expect(shortcuts.handleKeyDown(event, resolve, { isEditable: () => true })).toBe(false);
    expect(manager.setSpeed).not.toHaveBeenCalled();
  });

  it('swallows key auto-repeat without re-applying the action', () => {
    const { shortcuts, manager, resolve } = setup();
    const event = keyEvent({ key: 'C', code: 'KeyC', repeat: true });
    expect(shortcuts.handleKeyDown(event, resolve)).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(manager.setSpeed).not.toHaveBeenCalled();
  });

  it('skips events another listener already consumed', () => {
    const { shortcuts, manager, resolve } = setup();
    const event = keyEvent({ key: 'C', code: 'KeyC', defaultPrevented: true });
    expect(shortcuts.handleKeyDown(event, resolve)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(manager.setSpeed).not.toHaveBeenCalled();
  });

  it('logs a manager that throws, still persists the speed, and still consumes the key', () => {
    const { shortcuts, manager, prefs, log, showToast, resolve } = setup();
    manager.setSpeed.mockImplementation(() => {
      throw new Error('boom');
    });
    const event = keyEvent({ key: 'C', code: 'KeyC' });
    expect(shortcuts.handleKeyDown(event, resolve)).toBe(true);
    expect(log).toHaveBeenCalledWith(expect.any(Error));
    expect(voicesPref(prefs)).toEqual({ en: { speed: 1.1 } });
    expect(showToast).toHaveBeenCalledWith(expect.anything(), 1.1);
  });

  it('re-reads the bindings on every key so a settings change applies immediately', () => {
    const bindings = { ...BINDINGS };
    const { shortcuts, manager, resolve } = setup({ getBindings: () => bindings });
    bindings.speedUp = 'Ctrl+K';
    expect(shortcuts.handleKeyDown(keyEvent({ key: 'C', code: 'KeyC' }), resolve)).toBe(false);
    expect(shortcuts.handleKeyDown(keyEvent({ key: 'k', code: 'KeyK', shiftKey: false, ctrlKey: true }), resolve)).toBe(true);
    expect(manager.setSpeed).toHaveBeenCalledTimes(1);
  });

  it('ignores bindings that are empty or unparsable', () => {
    const { shortcuts, resolve } = setup({
      getBindings: () => ({ speedReset: '', speedDown: 'garbage', speedUp: 'Shift+C' }),
    });
    expect(shortcuts.handleKeyDown(keyEvent({ key: 'Z', code: 'KeyZ' }), resolve)).toBe(false);
    expect(shortcuts.handleKeyDown(keyEvent({ key: 'C', code: 'KeyC' }), resolve)).toBe(true);
  });
});

describe('pickReader', () => {
  const win1 = { name: 'main' };
  const win2 = { name: 'reader window' };
  const r1 = { _window: win1, tabID: 'tab-1' };
  const r2 = { _window: win1, tabID: 'tab-2' };
  const r3 = { _window: win2, tabID: 'tab-3' };
  const readers = [r1, r2, r3];
  const none = () => false;

  it('prefers the reader whose Read Aloud is playing in that window', () => {
    expect(pickReader(readers, win1, 'tab-1', (r) => r === r2)).toBe(r2);
  });

  it('otherwise uses the reader in the selected tab', () => {
    expect(pickReader(readers, win1, 'tab-2', none)).toBe(r2);
  });

  it('returns null when the selected tab is not a reader and nothing is playing', () => {
    expect(pickReader(readers, win1, 'zotero-pane', none)).toBeNull();
  });

  it('in a window without tabs (a reader window) uses that window\'s reader', () => {
    expect(pickReader(readers, win2, null, none)).toBe(r3);
  });

  it('never picks a reader from another window', () => {
    expect(pickReader([r3], win1, null, () => true)).toBeNull();
    expect(pickReader([r3], win1, 'tab-3', () => true)).toBeNull();
  });
});

describe('listen', () => {
  function fakeTarget() {
    const listeners: Record<string, Array<{ fn: (e: unknown) => void; opts: unknown }>> = {};
    return {
      listeners,
      addEventListener: vi.fn((type: string, fn: (e: unknown) => void, opts: unknown) => {
        (listeners[type] ??= []).push({ fn, opts });
      }),
      removeEventListener: vi.fn((type: string, fn: (e: unknown) => void) => {
        listeners[type] = (listeners[type] ?? []).filter((l) => l.fn !== fn);
      }),
    };
  }

  it('attaches one capturing keydown listener per target, however often it is asked', () => {
    const { shortcuts, resolve } = setup();
    const target = fakeTarget();
    shortcuts.listen(target, resolve);
    shortcuts.listen(target, resolve);
    const keydownCalls = target.addEventListener.mock.calls.filter(([type]) => type === 'keydown');
    expect(keydownCalls).toHaveLength(1);
    expect(keydownCalls[0][2]).toBe(true);
  });

  it('routes keys from the target to handleKeyDown', () => {
    const { shortcuts, manager, resolve } = setup();
    const target = fakeTarget();
    shortcuts.listen(target, resolve);
    target.listeners.keydown[0].fn(keyEvent({ key: 'C', code: 'KeyC' }));
    expect(manager.setSpeed).toHaveBeenCalledWith(1.1, true);
  });

  it('unlisten removes exactly the listener it added', () => {
    const { shortcuts, resolve } = setup();
    const target = fakeTarget();
    shortcuts.listen(target, resolve);
    const fn = target.listeners.keydown[0].fn;
    shortcuts.unlisten(target);
    expect(target.removeEventListener).toHaveBeenCalledWith('keydown', fn, true);
    expect(target.listeners.keydown).toHaveLength(0);
  });

  it('detaches itself when the target window unloads', () => {
    const { shortcuts, resolve } = setup();
    const target = fakeTarget();
    shortcuts.listen(target, resolve);
    const fn = target.listeners.keydown[0].fn;
    expect(target.listeners.unload).toHaveLength(1);
    target.listeners.unload[0].fn({});
    expect(target.removeEventListener).toHaveBeenCalledWith('keydown', fn, true);
  });

  it('dispose detaches every target', () => {
    const { shortcuts, resolve } = setup();
    const a = fakeTarget();
    const b = fakeTarget();
    shortcuts.listen(a, resolve);
    shortcuts.listen(b, resolve);
    shortcuts.dispose();
    expect(a.listeners.keydown).toHaveLength(0);
    expect(b.listeners.keydown).toHaveLength(0);
  });

  it('never lets an exception escape into the event loop', () => {
    const { shortcuts, log } = setup();
    const target = fakeTarget();
    shortcuts.listen(target, () => {
      throw new Error('reader gone');
    });
    expect(() => target.listeners.keydown[0].fn(keyEvent({ key: 'C', code: 'KeyC' }))).not.toThrow();
    expect(log).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe('isEditableTarget', () => {
  it('recognises text entry elements', () => {
    expect(isEditableTarget({ tagName: 'INPUT', type: 'text' })).toBe(true);
    expect(isEditableTarget({ tagName: 'input', type: 'search' })).toBe(true);
    expect(isEditableTarget({ tagName: 'INPUT' })).toBe(true);
    expect(isEditableTarget({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isEditableTarget({ tagName: 'SELECT' })).toBe(true);
    expect(isEditableTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(isEditableTarget({ localName: 'editable-text' })).toBe(true);
  });

  it('does not treat buttons, checkboxes or plain elements as editable', () => {
    expect(isEditableTarget({ tagName: 'INPUT', type: 'checkbox' })).toBe(false);
    expect(isEditableTarget({ tagName: 'INPUT', type: 'range' })).toBe(false);
    expect(isEditableTarget({ tagName: 'BUTTON' })).toBe(false);
    expect(isEditableTarget({ tagName: 'DIV' })).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget(undefined)).toBe(false);
  });
});

describe('deepActiveElement', () => {
  it('follows focus into nested frames and shadow roots', () => {
    const inner = { tagName: 'TEXTAREA' };
    const doc = {
      activeElement: {
        tagName: 'IFRAME',
        contentDocument: {
          activeElement: {
            tagName: 'CUSTOM-ELEMENT',
            shadowRoot: { activeElement: { tagName: 'IFRAME', contentDocument: { activeElement: inner } } },
          },
        },
      },
    };
    expect(deepActiveElement(doc)).toBe(inner);
  });

  it('returns null without a focused element', () => {
    expect(deepActiveElement({ activeElement: null })).toBeNull();
    expect(deepActiveElement(null)).toBeNull();
  });
});
