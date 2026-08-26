import { describe, expect, it, vi } from 'vitest';
import { READ_ALOUD_VOICES_PREF } from '../../src/core/read-aloud-speed';
import type { PrefsBackend } from '../../src/core/settings';
import {
  createReadAloudShortcuts,
  deepActiveElement,
  isEditableTarget,
  isSpeaking,
  pickReader,
  type ReadAloudManagerLike,
  type ShortcutKeyEvent,
  type ReadAloudShortcutsDeps,
} from '../../src/ui/read-aloud-shortcuts';

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
    paused: false,
    setSpeed: vi.fn((speed: number, _persist?: boolean) => {
      m.speed = speed;
    }),
    skipBack: vi.fn((_granularity: 'sentence' | 'paragraph', _accelerate?: boolean) => {}),
    skipAhead: vi.fn((_granularity: 'sentence' | 'paragraph', _accelerate?: boolean) => {}),
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

const BINDINGS = {
  speedReset: 'Shift+Z',
  speedDown: 'Shift+X',
  speedUp: 'Shift+C',
  previousSentence: 'ArrowLeft',
  nextSentence: 'ArrowRight',
  previousParagraph: 'Shift+ArrowLeft',
  nextParagraph: 'Shift+ArrowRight',
  startFromSelection: 'Shift+Space',
  returnToSpoken: 'Shift+Enter',
};
const voicesPref = (prefs: { store: Record<string, unknown> }) => JSON.parse(prefs.store[READ_ALOUD_VOICES_PREF] as string);

function setup(over: Partial<ReadAloudShortcutsDeps> = {}) {
  const prefs = fakePrefs();
  const manager = fakeManager();
  const reader = { id: 'reader' };
  const showToast = vi.fn();
  const lockPosition = vi.fn();
  const canReadAloud = vi.fn(() => true);
  const hasSelection = vi.fn(() => false);
  const startReadAloud = vi.fn();
  const togglePaused = vi.fn();
  const emitState = vi.fn();
  const resumeLastPosition = vi.fn(() => true);
  const log = vi.fn();
  const shortcuts = createReadAloudShortcuts({
    getBindings: () => BINDINGS,
    prefs,
    getManager: () => manager,
    showToast,
    lockPosition,
    canReadAloud,
    hasSelection,
    startReadAloud,
    togglePaused,
    emitState,
    resumeLastPosition,
    log,
    ...over,
  });
  return {
    shortcuts,
    prefs,
    manager,
    reader,
    showToast,
    lockPosition,
    canReadAloud,
    hasSelection,
    startReadAloud,
    togglePaused,
    emitState,
    resumeLastPosition,
    log,
    resolve: () => reader,
  };
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
      getBindings: () => ({ ...BINDINGS, speedReset: '', speedDown: 'garbage', speedUp: 'Shift+C' }),
    });
    expect(shortcuts.handleKeyDown(keyEvent({ key: 'Z', code: 'KeyZ' }), resolve)).toBe(false);
    expect(shortcuts.handleKeyDown(keyEvent({ key: 'C', code: 'KeyC' }), resolve)).toBe(true);
  });
});

describe('navigation', () => {
  const right = (partial: Partial<ShortcutKeyEvent> = {}) => keyEvent({ key: 'ArrowRight', code: 'ArrowRight', shiftKey: false, ...partial });
  const left = (partial: Partial<ShortcutKeyEvent> = {}) => keyEvent({ key: 'ArrowLeft', code: 'ArrowLeft', shiftKey: false, ...partial });

  it('skips to the next or previous sentence through the manager and locks the view to the spoken position', () => {
    const { shortcuts, manager, reader, lockPosition, resolve } = setup();
    const event = right();
    expect(shortcuts.handleKeyDown(event, resolve)).toBe(true);
    expect(manager.skipAhead).toHaveBeenCalledWith('sentence');
    expect(lockPosition).toHaveBeenCalledWith(reader);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(shortcuts.handleKeyDown(left(), resolve)).toBe(true);
    expect(manager.skipBack).toHaveBeenCalledWith('sentence');
    expect(manager.setSpeed).not.toHaveBeenCalled();
  });

  it('skips by paragraph with Shift', () => {
    const { shortcuts, manager, resolve } = setup();
    shortcuts.handleKeyDown(right({ shiftKey: true }), resolve);
    expect(manager.skipAhead).toHaveBeenCalledWith('paragraph');
    shortcuts.handleKeyDown(left({ shiftKey: true }), resolve);
    expect(manager.skipBack).toHaveBeenCalledWith('paragraph');
  });

  it('works while paused: the highlight moves without playing', () => {
    const { shortcuts, manager, resolve } = setup();
    manager.paused = true;
    expect(shortcuts.handleKeyDown(right(), resolve)).toBe(true);
    expect(manager.skipAhead).toHaveBeenCalledWith('sentence');
  });

  // The arrows page and scroll the reader; they are only borrowed while something is being read
  it('leaves the arrows to the reader when no Read Aloud session is open', () => {
    const { shortcuts, manager, resolve } = setup();
    manager.active = false;
    const event = right();
    expect(shortcuts.handleKeyDown(event, resolve)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
    expect(manager.skipAhead).not.toHaveBeenCalled();
  });

  it('leaves the arrows alone without a manager, or with one that cannot skip', () => {
    const none = setup({ getManager: () => null });
    const event1 = right();
    expect(none.shortcuts.handleKeyDown(event1, none.resolve)).toBe(false);
    expect(event1.preventDefault).not.toHaveBeenCalled();
    const old = setup({ getManager: () => ({ active: true, setSpeed: () => {} }) });
    const event2 = right();
    expect(old.shortcuts.handleKeyDown(event2, old.resolve)).toBe(false);
    expect(event2.preventDefault).not.toHaveBeenCalled();
  });

  it('lets typing through in editable fields', () => {
    const { shortcuts, manager, resolve } = setup();
    const event = right({ target: { tagName: 'TEXTAREA' } });
    expect(shortcuts.handleKeyDown(event, resolve)).toBe(false);
    expect(manager.skipAhead).not.toHaveBeenCalled();
  });

  it('swallows auto-repeat: one skip per press', () => {
    const { shortcuts, manager, resolve } = setup();
    expect(shortcuts.handleKeyDown(right({ repeat: true }), resolve)).toBe(true);
    expect(manager.skipAhead).not.toHaveBeenCalled();
  });

  it('logs a manager that throws and still consumes the key', () => {
    const { shortcuts, manager, log, resolve } = setup();
    manager.skipAhead.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(shortcuts.handleKeyDown(right(), resolve)).toBe(true);
    expect(log).toHaveBeenCalledWith(expect.any(Error));
  });

  it('navigate() reports whether there was a session to skip in', () => {
    const { shortcuts, manager, reader } = setup();
    expect(shortcuts.navigate(reader, 'nextParagraph')).toBe(true);
    expect(manager.skipAhead).toHaveBeenCalledWith('paragraph');
    manager.active = false;
    expect(shortcuts.navigate(reader, 'previousParagraph')).toBe(false);
    expect(manager.skipBack).not.toHaveBeenCalled();
  });
});

describe('the smart play key (action startFromSelection)', () => {
  const space = (partial: Partial<ShortcutKeyEvent> = {}) => keyEvent({ key: ' ', code: 'Space', shiftKey: true, ...partial });

  // Session open: the play button. The default fake manager is playing.
  it('pauses a playing session', () => {
    const { shortcuts, reader, togglePaused, startReadAloud, resumeLastPosition, resolve } = setup();
    const event = space();
    expect(shortcuts.handleKeyDown(event, resolve)).toBe(true);
    expect(togglePaused).toHaveBeenCalledWith(reader);
    expect(startReadAloud).not.toHaveBeenCalled();
    expect(resumeLastPosition).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
  });

  // A stray selection must never steal the pause (user decision 2026-08-26)
  it('pauses even while text is selected', () => {
    const { shortcuts, manager, hasSelection, togglePaused, startReadAloud, resolve } = setup();
    manager.paused = false;
    hasSelection.mockReturnValue(true);
    expect(shortcuts.handleKeyDown(space(), resolve)).toBe(true);
    expect(togglePaused).toHaveBeenCalled();
    expect(startReadAloud).not.toHaveBeenCalled();
  });

  // Zotero itself restarts from a selection on unpause (reader.js ~83595),
  // so the paused case needs nothing beyond the toggle
  it('resumes a paused session through the same toggle', () => {
    const { shortcuts, manager, reader, togglePaused, resolve } = setup();
    manager.paused = true;
    expect(shortcuts.handleKeyDown(space(), resolve)).toBe(true);
    expect(togglePaused).toHaveBeenCalledWith(reader);
  });

  it('starts reading at the selection when idle', () => {
    const { shortcuts, manager, reader, hasSelection, startReadAloud, togglePaused, resumeLastPosition, resolve } = setup();
    manager.active = false;
    hasSelection.mockReturnValue(true);
    expect(shortcuts.handleKeyDown(space(), resolve)).toBe(true);
    expect(startReadAloud).toHaveBeenCalledWith(reader);
    expect(togglePaused).not.toHaveBeenCalled();
    // An explicit resume position must not override the selection
    expect(resumeLastPosition).not.toHaveBeenCalled();
  });

  it('starts at the selection with no manager at all', () => {
    const none = setup({ getManager: () => null });
    none.hasSelection.mockReturnValue(true);
    expect(none.shortcuts.handleKeyDown(space(), none.resolve)).toBe(true);
    expect(none.startReadAloud).toHaveBeenCalled();
  });

  it('resumes at the stored position when idle with no selection', () => {
    const { shortcuts, manager, reader, resumeLastPosition, startReadAloud, resolve } = setup();
    manager.active = false;
    expect(shortcuts.handleKeyDown(space(), resolve)).toBe(true);
    expect(resumeLastPosition).toHaveBeenCalledWith(reader);
    expect(startReadAloud).not.toHaveBeenCalled();
  });

  // Nothing stored: the key still starts — Zotero picks its own near-view
  // saved position or the first visible segment
  it('falls back to a plain start when nothing is stored', () => {
    const { shortcuts, manager, reader, startReadAloud, resolve } = setup({ resumeLastPosition: () => false });
    manager.active = false;
    expect(shortcuts.handleKeyDown(space(), resolve)).toBe(true);
    expect(startReadAloud).toHaveBeenCalledWith(reader);
  });

  it('falls back to a plain start when the resume dep is not wired', () => {
    const idle = setup({ resumeLastPosition: undefined });
    idle.manager.active = false;
    expect(idle.shortcuts.handleKeyDown(space(), idle.resolve)).toBe(true);
    expect(idle.startReadAloud).toHaveBeenCalled();
  });

  // The reader never sees the key while Read Aloud exists; only an older
  // Zotero without startReadAloudAtPosition lets it page again
  it('falls through untouched when the reader has no Read Aloud', () => {
    const { shortcuts, startReadAloud, togglePaused, canReadAloud, resolve } = setup();
    canReadAloud.mockReturnValue(false);
    const event = space();
    expect(shortcuts.handleKeyDown(event, resolve)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(startReadAloud).not.toHaveBeenCalled();
    expect(togglePaused).not.toHaveBeenCalled();
  });

  it('falls through when the deps are not wired', () => {
    const { shortcuts, resolve } = setup({ canReadAloud: undefined, startReadAloud: undefined });
    const event = space();
    expect(shortcuts.handleKeyDown(event, resolve)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('treats a selection check that throws as "no selection", and records it', () => {
    const { shortcuts, manager, hasSelection, resumeLastPosition, log, resolve } = setup();
    manager.active = false;
    hasSelection.mockImplementation(() => {
      throw new Error('dead reader');
    });
    expect(shortcuts.handleKeyDown(space(), resolve)).toBe(true);
    expect(resumeLastPosition).toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.any(Error));
  });

  it('logs a resume that throws, then still starts plainly', () => {
    const { shortcuts, manager, startReadAloud, log, resolve } = setup({
      resumeLastPosition: () => {
        throw new Error('cloneInto');
      },
    });
    manager.active = false;
    const event = space();
    expect(shortcuts.handleKeyDown(event, resolve)).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.any(Error));
    expect(startReadAloud).toHaveBeenCalled();
  });

  it('logs a toggle that throws and still consumes the key', () => {
    const { shortcuts, togglePaused, log, resolve } = setup();
    togglePaused.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(shortcuts.handleKeyDown(space(), resolve)).toBe(true);
    expect(log).toHaveBeenCalledWith(expect.any(Error));
  });

  it('lets typing through in editable fields', () => {
    const { shortcuts, togglePaused, resolve } = setup();
    const event = space({ target: { tagName: 'TEXTAREA' } });
    expect(shortcuts.handleKeyDown(event, resolve)).toBe(false);
    expect(togglePaused).not.toHaveBeenCalled();
  });

  it('swallows auto-repeat: one action per press', () => {
    const { shortcuts, togglePaused, startReadAloud, resolve } = setup();
    expect(shortcuts.handleKeyDown(space({ repeat: true }), resolve)).toBe(true);
    expect(togglePaused).not.toHaveBeenCalled();
    expect(startReadAloud).not.toHaveBeenCalled();
  });

  it('smartPlay() reports whether Read Aloud exists to act on', () => {
    const { shortcuts, reader, togglePaused, canReadAloud } = setup();
    expect(shortcuts.smartPlay(reader)).toBe(true);
    expect(togglePaused).toHaveBeenCalledWith(reader);
    canReadAloud.mockReturnValue(false);
    expect(shortcuts.smartPlay(reader)).toBe(false);
    expect(togglePaused).toHaveBeenCalledTimes(1);
  });
});

describe('return to spoken position', () => {
  const enter = (partial: Partial<ShortcutKeyEvent> = {}) => keyEvent({ key: 'Enter', code: 'Enter', shiftKey: true, ...partial });

  // Locking makes the view follow the reading again; re-emitting the state
  // gives it a push to navigate on right away instead of at the next segment
  it('locks the view to the spoken position and re-emits the manager state', () => {
    const { shortcuts, reader, lockPosition, emitState, resolve } = setup();
    const event = enter();
    expect(shortcuts.handleKeyDown(event, resolve)).toBe(true);
    expect(lockPosition).toHaveBeenCalledWith(reader);
    expect(emitState).toHaveBeenCalledWith(reader);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
  });

  it('works while paused: the view returns to the highlight without playing', () => {
    const { shortcuts, manager, lockPosition, resolve } = setup();
    manager.paused = true;
    expect(shortcuts.handleKeyDown(enter(), resolve)).toBe(true);
    expect(lockPosition).toHaveBeenCalled();
  });

  it('falls through when no Read Aloud session is open, or there is no manager', () => {
    const idle = setup();
    idle.manager.active = false;
    const event1 = enter();
    expect(idle.shortcuts.handleKeyDown(event1, idle.resolve)).toBe(false);
    expect(event1.preventDefault).not.toHaveBeenCalled();
    expect(idle.lockPosition).not.toHaveBeenCalled();
    const none = setup({ getManager: () => null });
    const event2 = enter();
    expect(none.shortcuts.handleKeyDown(event2, none.resolve)).toBe(false);
    expect(none.lockPosition).not.toHaveBeenCalled();
  });

  it('falls through when lockPosition is not wired', () => {
    const { shortcuts, emitState, resolve } = setup({ lockPosition: undefined });
    const event = enter();
    expect(shortcuts.handleKeyDown(event, resolve)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(emitState).not.toHaveBeenCalled();
  });

  // The lock alone still brings the view back at the next highlight update
  it('still acts without emitState', () => {
    const { shortcuts, lockPosition, resolve } = setup({ emitState: undefined });
    expect(shortcuts.handleKeyDown(enter(), resolve)).toBe(true);
    expect(lockPosition).toHaveBeenCalled();
  });

  it('logs a lock that throws and still re-emits the state', () => {
    const { shortcuts, lockPosition, emitState, log, resolve } = setup();
    lockPosition.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(shortcuts.handleKeyDown(enter(), resolve)).toBe(true);
    expect(emitState).toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.any(Error));
  });

  it('lets typing through in editable fields', () => {
    const { shortcuts, lockPosition, resolve } = setup();
    const event = enter({ target: { tagName: 'TEXTAREA' } });
    expect(shortcuts.handleKeyDown(event, resolve)).toBe(false);
    expect(lockPosition).not.toHaveBeenCalled();
  });

  it('swallows auto-repeat: one return per press', () => {
    const { shortcuts, lockPosition, resolve } = setup();
    expect(shortcuts.handleKeyDown(enter({ repeat: true }), resolve)).toBe(true);
    expect(lockPosition).not.toHaveBeenCalled();
  });

  it('returnToSpoken() reports whether there was a session to return to', () => {
    const { shortcuts, manager, reader, lockPosition } = setup();
    expect(shortcuts.returnToSpoken(reader)).toBe(true);
    expect(lockPosition).toHaveBeenCalledWith(reader);
    manager.active = false;
    expect(shortcuts.returnToSpoken(reader)).toBe(false);
    expect(lockPosition).toHaveBeenCalledTimes(1);
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

describe('isSpeaking', () => {
  const manager = (over: Partial<ReadAloudManagerLike>): ReadAloudManagerLike => ({ setSpeed() {}, ...over });

  it('is true only while active and not paused', () => {
    expect(isSpeaking(manager({ active: true, paused: false }))).toBe(true);
    expect(isSpeaking(manager({ active: false, paused: true }))).toBe(false);
    expect(isSpeaking(manager({ active: false, paused: false }))).toBe(false);
    expect(isSpeaking(null)).toBe(false);
  });

  it('a session paused on a background tab is active in Zotero, but not speaking', () => {
    // Zotero's pause() keeps `active` true; only closing the popup deactivates.
    // Such a tab must not capture the shortcuts from the tab the user is on.
    expect(isSpeaking(manager({ active: true, paused: true }))).toBe(false);
  });

  it('treats a manager without a paused field (older Zotero) as speaking while active', () => {
    expect(isSpeaking(manager({ active: true }))).toBe(true);
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
  it('recognizes text entry elements', () => {
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
