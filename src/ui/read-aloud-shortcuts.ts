import { nextSpeed, persistSpeed, readPersistedSpeed, type SpeedAction } from '../core/read-aloud-speed';
import type { PrefsBackend } from '../core/settings';
import {
  isNavigationAction,
  NAVIGATION,
  SHORTCUT_ACTIONS,
  type NavigationAction,
  type ShortcutAction,
  type SkipGranularity,
} from '../core/shortcut-actions';
import { matchesShortcut, parseShortcut, type KeyEventLike, type Shortcut } from '../core/shortcuts';

/**
 * The part of Zotero's ReadAloudManager (reader/src/common/read-aloud/
 * manager.ts, reached as `reader._internalReader._readAloudManager`) that
 * the shortcuts drive. While playing, `setSpeed(speed, true)` re-speaks the
 * current segment at the new rate and asks Zotero to persist it — the same
 * call the popup's slider makes. While idle, persisting through Zotero
 * would *start* playback (see adjust()), so the pref is written directly.
 * `skipBack` / `skipAhead` are the popup's skip buttons: one sentence, or
 * one paragraph (segments anchored `paragraphStart`), from the current
 * position; while paused they move the highlight without playing.
 */
export interface ReadAloudManagerLike {
  active?: boolean;
  paused?: boolean;
  speed?: number;
  lang?: string | null;
  selectedVoiceID?: string | null;
  setSpeed(speed: number, persist?: boolean): void;
  skipBack?(granularity: SkipGranularity, accelerate?: boolean): void;
  skipAhead?(granularity: SkipGranularity, accelerate?: boolean): void;
}

type SkippingManager = ReadAloudManagerLike & Required<Pick<ReadAloudManagerLike, 'skipBack' | 'skipAhead'>>;

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

/** A session is open (playing or paused) and the manager knows how to skip. */
function canSkip(manager: ReadAloudManagerLike | null): manager is SkippingManager {
  return !!manager?.active && typeof manager.skipBack === 'function' && typeof manager.skipAhead === 'function';
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

export interface ReadAloudShortcutsDeps {
  /** Raw binding text per action. Read on every key, so a settings change applies at once. */
  getBindings(): Record<ShortcutAction, string>;
  /** Full-key pref access, for Zotero's reader.readAloudVoices pref. */
  prefs: PrefsBackend;
  getManager(reader: unknown): ReadAloudManagerLike | null;
  showToast?(reader: unknown, speed: number): void;
  /** After a skip, what the popup's own buttons do: lock the view to the spoken position, so it follows again. */
  lockPosition?(reader: unknown): void;
  /**
   * Whether Read Aloud exists on this reader at all (Zotero's
   * `reader.startReadAloudAtPosition` feature-detect). The smart key is
   * consumed whenever it does, in every session state — it never falls
   * through to the reader, which would page up on Shift+Space.
   */
  canReadAloud?(reader: unknown): boolean;
  /**
   * Whether the view has a text selection to start reading from (the
   * selection-popup state). Only consulted while idle, to keep an explicit
   * resume position from overriding a selection; an open session toggles
   * regardless (a stray selection must never steal the pause).
   */
  hasSelection?(reader: unknown): boolean;
  /**
   * Zotero's own start: bare `reader.startReadAloudAtPosition()`. With a
   * selection it starts there; without one an idle reader opens the popup
   * and auto-plays from Zotero's near-view saved position, else the first
   * visible segment.
   */
  startReadAloud?(reader: unknown): void;
  /**
   * The popup's play button: `reader.toggleReadAloudPaused()`. Unpausing
   * locks the view to the spoken position, and with a selection present
   * Zotero itself restarts from the selection (reader.js ~83595) — the
   * paused case needs nothing beyond this toggle.
   */
  togglePaused?(reader: unknown): void;
  /**
   * Re-emit the manager's state (`manager._stateChanged()`, a queued
   * onStateChange with no audio side effects), so a view just locked by
   * lockPosition gets a push to scroll back on right away. The PDF view
   * navigates on any push while locked; EPUB and snapshot views only on a
   * segment change, so there the view returns at the next sentence.
   */
  emitState?(reader: unknown): void;
  /**
   * Start at the position stored for this document. True when there was
   * one and Zotero was asked to start there; false when this document has
   * nothing stored — the smart key then falls back to startReadAloud.
   */
  resumeLastPosition?(reader: unknown): boolean;
  log?(e: unknown): void;
}

export interface HandleOptions {
  /** Replaces the default `event.target` check; chrome windows look at the focused element inside nested frames instead. */
  isEditable?(event: ShortcutKeyEvent): boolean;
}

export interface ReadAloudShortcuts {
  /** Returns true when the key was consumed. `resolveReader` returning null means "not in a reader context, let the key through". */
  handleKeyDown(event: ShortcutKeyEvent, resolveReader: () => unknown, options?: HandleOptions): boolean;
  /** Apply a speed action to a reader and return the new speed. */
  adjust(reader: unknown, action: SpeedAction): number;
  /** Skip by sentence or paragraph; false when the reader has no open Read Aloud session to skip in. */
  navigate(reader: unknown, action: NavigationAction): boolean;
  /** The smart play key; false when this reader has no Read Aloud to act on, so the key is left alone. */
  smartPlay(reader: unknown): boolean;
  /** Bring the view back to the spoken position; false when no Read Aloud session is open. */
  returnToSpoken(reader: unknown): boolean;
  /** Attach a capturing keydown listener to a window; idempotent per window, detaches itself on unload. */
  listen(target: EventTargetLike, resolveReader: () => unknown, options?: HandleOptions): void;
  unlisten(target: EventTargetLike): void;
  dispose(): void;
}

export function createReadAloudShortcuts(deps: ReadAloudShortcutsDeps): ReadAloudShortcuts {
  const log = (e: unknown) => deps.log?.(e);

  // Parsed bindings keyed by their text, so parsing repeats only when a pref changes
  const parsed = new Map<string, Shortcut | null>();
  const shortcutFor = (text: string): Shortcut | null => {
    if (!parsed.has(text)) parsed.set(text, parseShortcut(text));
    return parsed.get(text) ?? null;
  };

  const actionFor = (event: ShortcutKeyEvent): ShortcutAction | null => {
    const bindings = deps.getBindings();
    for (const action of SHORTCUT_ACTIONS) {
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

  function navigate(reader: unknown, action: NavigationAction): boolean {
    const manager = managerOf(reader);
    if (!canSkip(manager)) return false;
    const { direction, granularity } = NAVIGATION[action];
    try {
      if (direction === 'back') manager.skipBack(granularity);
      else manager.skipAhead(granularity);
    } catch (e) {
      log(e);
    }
    try {
      deps.lockPosition?.(reader);
    } catch (e) {
      log(e);
    }
    return true;
  }

  /** Read Aloud exists here, so the key is ours in every session state. */
  const canSmartPlay = (reader: unknown): boolean => {
    if (!deps.startReadAloud || !deps.canReadAloud) return false;
    try {
      return deps.canReadAloud(reader);
    } catch (e) {
      log(e);
      return false;
    }
  };

  const hasSelection = (reader: unknown): boolean => {
    try {
      return deps.hasSelection?.(reader) ?? false;
    } catch (e) {
      log(e);
      return false;
    }
  };

  /**
   * The one position key (action `startFromSelection`, its historical pref
   * name — notes/shift_space_logic.md): a session that is open, playing or
   * paused, gets the play button; an idle reader starts at the selection,
   * else at the stored position, else wherever Zotero's own start would.
   */
  function smartPlay(reader: unknown): boolean {
    if (!canSmartPlay(reader)) return false;
    if (managerOf(reader)?.active) {
      try {
        deps.togglePaused?.(reader);
      } catch (e) {
        log(e);
      }
      return true;
    }
    if (!hasSelection(reader)) {
      let resumed = false;
      try {
        resumed = deps.resumeLastPosition?.(reader) ?? false;
      } catch (e) {
        log(e);
      }
      if (resumed) return true;
    }
    try {
      deps.startReadAloud?.(reader);
    } catch (e) {
      log(e);
    }
    return true;
  }

  /** A session is open (the view has a spoken position to return to) and the lock is wired. */
  const canReturnToSpoken = (reader: unknown): boolean => !!deps.lockPosition && !!managerOf(reader)?.active;

  function returnToSpoken(reader: unknown): boolean {
    if (!canReturnToSpoken(reader)) return false;
    try {
      deps.lockPosition?.(reader);
    } catch (e) {
      log(e);
    }
    try {
      deps.emitState?.(reader);
    } catch (e) {
      log(e);
    }
    return true;
  }

  function handleKeyDown(event: ShortcutKeyEvent, resolveReader: () => unknown, options: HandleOptions = {}): boolean {
    if (event.defaultPrevented) return false;
    const action = actionFor(event);
    if (!action) return false;
    const isEditable = options.isEditable ?? ((e: ShortcutKeyEvent) => isEditableTarget(e.target));
    if (isEditable(event)) return false;
    const reader = resolveReader();
    if (!reader) return false;
    // The arrow keys page and scroll the reader: a sentence or paragraph key
    // is borrowed only while a Read Aloud session is open (playing or
    // paused) and falls through untouched otherwise. The smart key is
    // consumed whenever Read Aloud exists — only an older Zotero without
    // startReadAloudAtPosition leaves Shift+Space paging.
    if (isNavigationAction(action) && !canSkip(managerOf(reader))) return false;
    if (action === 'startFromSelection' && !canSmartPlay(reader)) return false;
    if (action === 'returnToSpoken' && !canReturnToSpoken(reader)) return false;
    event.preventDefault();
    event.stopPropagation();
    // Holding the key down would restart the current segment on every auto-repeat
    if (event.repeat) return true;
    if (isNavigationAction(action)) navigate(reader, action);
    else if (action === 'startFromSelection') smartPlay(reader);
    else if (action === 'returnToSpoken') returnToSpoken(reader);
    else adjust(reader, action);
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

  return { handleKeyDown, adjust, navigate, smartPlay, returnToSpoken, listen, unlisten, dispose };
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
