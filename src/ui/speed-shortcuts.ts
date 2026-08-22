import { nextSpeed, persistSpeed, readPersistedSpeed, SPEED_ACTIONS, type SpeedAction } from '../core/read-aloud-speed';
import type { PrefsBackend } from '../core/settings';
import { matchesShortcut, parseShortcut, type KeyEventLike, type Shortcut } from '../core/shortcuts';

/**
 * The part of Zotero's ReadAloudManager (reader/src/common/read-aloud/
 * manager.ts, reached as `reader._internalReader._readAloudManager`) that
 * the shortcuts drive. While playing, `setSpeed(speed, true)` re-speaks the
 * current segment at the new rate and asks Zotero to persist it — the same
 * call the popup's slider makes. While idle, persisting through Zotero
 * would *start* playback (see adjust()), so the pref is written directly.
 */
export interface ReadAloudManagerLike {
  active?: boolean;
  paused?: boolean;
  speed?: number;
  lang?: string | null;
  selectedVoiceID?: string | null;
  setSpeed(speed: number, persist?: boolean): void;
}

/**
 * Whether this manager is speaking right now. Zotero's `active` means "the
 * Read Aloud session is open": pause() leaves it true, and only closing the
 * popup deactivates. A popup left open on a background tab therefore stays
 * `active` forever, and treating that as "playing" would route every
 * shortcut to the hidden tab instead of the one the user is looking at.
 */
export function isSpeaking(manager: ReadAloudManagerLike | null): boolean {
  return !!manager?.active && !manager.paused;
}

export interface ShortcutKeyEvent extends KeyEventLike {
  repeat?: boolean;
  defaultPrevented?: boolean;
  target?: unknown;
  preventDefault(): void;
  stopPropagation(): void;
}

export interface EventTargetLike {
  addEventListener(type: string, listener: (event: any) => void, options?: unknown): void;
  removeEventListener(type: string, listener: (event: any) => void, options?: unknown): void;
}

export interface SpeedShortcutsDeps {
  /** Raw binding text per action. Read on every key, so a settings change applies at once. */
  getBindings(): Record<SpeedAction, string>;
  /** Full-key pref access, for Zotero's reader.readAloudVoices pref. */
  prefs: PrefsBackend;
  getManager(reader: unknown): ReadAloudManagerLike | null;
  showToast?(reader: unknown, speed: number): void;
  log?(e: unknown): void;
}

export interface HandleOptions {
  /** Replaces the default `event.target` check; chrome windows look at the focused element inside nested frames instead. */
  isEditable?(event: ShortcutKeyEvent): boolean;
}

export interface SpeedShortcuts {
  /** Returns true when the key was consumed. `resolveReader` returning null means "not in a reader context, let the key through". */
  handleKeyDown(event: ShortcutKeyEvent, resolveReader: () => unknown, options?: HandleOptions): boolean;
  /** Apply an action to a reader and return the new speed. */
  adjust(reader: unknown, action: SpeedAction): number;
  /** Attach a capturing keydown listener to a window; idempotent per window, detaches itself on unload. */
  listen(target: EventTargetLike, resolveReader: () => unknown, options?: HandleOptions): void;
  unlisten(target: EventTargetLike): void;
  dispose(): void;
}

export function createSpeedShortcuts(deps: SpeedShortcutsDeps): SpeedShortcuts {
  const log = (e: unknown) => deps.log?.(e);

  // Parsed bindings keyed by their text, so parsing repeats only when a pref changes
  const parsed = new Map<string, Shortcut | null>();
  const shortcutFor = (text: string): Shortcut | null => {
    if (!parsed.has(text)) parsed.set(text, parseShortcut(text));
    return parsed.get(text) ?? null;
  };

  const actionFor = (event: ShortcutKeyEvent): SpeedAction | null => {
    const bindings = deps.getBindings();
    for (const action of SPEED_ACTIONS) {
      const shortcut = shortcutFor(bindings[action] ?? '');
      if (shortcut && matchesShortcut(shortcut, event)) return action;
    }
    return null;
  };

  const managerOf = (reader: unknown): ReadAloudManagerLike | null => {
    try {
      return deps.getManager(reader);
    } catch (e) {
      log(e);
      return null;
    }
  };

  function adjust(reader: unknown, action: SpeedAction): number {
    const manager = managerOf(reader);
    const lang = manager?.lang ?? null;
    // A manager only learns the persisted speed once it knows its language
    // (reader._syncPersistedVoicesToManager); before that its `speed` is the
    // constructor default, not the user's setting, so start from the pref.
    const current = lang && typeof manager?.speed === 'number' ? manager.speed : readPersistedSpeed(deps.prefs, lang);
    const next = nextSpeed(current, action);

    // Let Zotero persist only while it is playing. Its persistence path
    // (reader._setReadAloudVoice) re-syncs and activates an idle manager
    // that still holds a voice from an earlier popup — audio would start
    // with the popup closed — and it does nothing at all without a voice.
    // Outside that one case write the pref ourselves; the reader picks it
    // up when the popup opens.
    let persistedByZotero = false;
    if (manager) {
      const canPersist = !!manager.active && !!manager.selectedVoiceID;
      try {
        manager.setSpeed(next, canPersist);
        persistedByZotero = canPersist;
      } catch (e) {
        log(e);
      }
    }
    // With no language known the pref is updated for every language: the
    // user asked for a speed, not for a speed in one language.
    if (!persistedByZotero) persistSpeed(deps.prefs, lang, next);

    deps.showToast?.(reader, next);
    return next;
  }

  function handleKeyDown(event: ShortcutKeyEvent, resolveReader: () => unknown, options: HandleOptions = {}): boolean {
    if (event.defaultPrevented) return false;
    const action = actionFor(event);
    if (!action) return false;
    const isEditable = options.isEditable ?? ((e: ShortcutKeyEvent) => isEditableTarget(e.target));
    if (isEditable(event)) return false;
    const reader = resolveReader();
    if (!reader) return false;
    event.preventDefault();
    event.stopPropagation();
    // Holding the key down would restart the current segment on every auto-repeat
    if (event.repeat) return true;
    adjust(reader, action);
    return true;
  }

  const listeners = new Map<EventTargetLike, { keydown: (event: any) => void; unload: () => void }>();

  function listen(target: EventTargetLike, resolveReader: () => unknown, options?: HandleOptions): void {
    if (listeners.has(target)) return;
    const keydown = (event: ShortcutKeyEvent) => {
      try {
        handleKeyDown(event, resolveReader, options);
      } catch (e) {
        log(e);
      }
    };
    const unload = () => unlisten(target);
    listeners.set(target, { keydown, unload });
    target.addEventListener('keydown', keydown, true);
    target.addEventListener('unload', unload, { once: true });
  }

  function unlisten(target: EventTargetLike): void {
    const entry = listeners.get(target);
    if (!entry) return;
    listeners.delete(target);
    try {
      target.removeEventListener('keydown', entry.keydown, true);
      target.removeEventListener('unload', entry.unload);
    } catch (e) {
      log(e);
    }
  }

  function dispose(): void {
    for (const target of [...listeners.keys()]) unlisten(target);
  }

  return { handleKeyDown, adjust, listen, unlisten, dispose };
}

/**
 * Which reader a key pressed in a chrome window should drive: one that is
 * playing, else the one in the selected tab, else none — so the shortcuts
 * do nothing while the user is in the library with nothing playing. A
 * window without a tab bar (a separate reader window) has exactly its own
 * reader.
 */
export function pickReader<R extends { _window?: unknown; tabID?: string }>(
  readers: readonly R[],
  win: unknown,
  selectedTabID: string | null,
  isActive: (reader: R) => boolean,
): R | null {
  const inWindow = readers.filter((r) => r._window === win);
  if (!inWindow.length) return null;
  const playing = inWindow.find((r) => {
    try {
      return isActive(r);
    } catch {
      return false;
    }
  });
  if (playing) return playing;
  if (selectedTabID === null) return inWindow[inWindow.length - 1];
  return inWindow.find((r) => r.tabID === selectedTabID) ?? null;
}

const NON_TEXT_INPUT_TYPES = new Set(['button', 'checkbox', 'radio', 'submit', 'reset', 'range', 'color', 'file', 'image']);

/** True when a key pressed on this element would type into it, so shortcuts must stay out of the way. */
export function isEditableTarget(target: unknown): boolean {
  const el = target as { tagName?: unknown; localName?: unknown; type?: unknown; isContentEditable?: unknown } | null;
  if (!el || typeof el !== 'object') return false;
  try {
    if (el.isContentEditable === true) return true;
    const tag = String(el.tagName ?? el.localName ?? '').toLowerCase();
    if (tag === 'input') return !NON_TEXT_INPUT_TYPES.has(String(el.type ?? 'text').toLowerCase());
    return tag === 'textarea' || tag === 'select' || tag === 'editable-text' || tag === 'textbox' || tag === 'search-textbox';
  } catch {
    return false;
  }
}

/** The focused element, following focus down through nested frames (reader iframe, view iframe) and shadow roots. */
export function deepActiveElement(doc: unknown): unknown {
  let el = (doc as { activeElement?: unknown } | null)?.activeElement ?? null;
  for (let depth = 0; depth < 10 && el; depth++) {
    const host = el as { contentDocument?: { activeElement?: unknown }; shadowRoot?: { activeElement?: unknown } };
    const inner = host.contentDocument?.activeElement ?? host.shadowRoot?.activeElement ?? null;
    if (!inner) break;
    el = inner;
  }
  return el;
}
