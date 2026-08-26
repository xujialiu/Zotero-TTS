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

/** Shown when the key is pressed on a document that has no stored position. */
export const NO_SAVED_POSITION = 'No saved position';

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
   * Whether the reader has a text selection to start reading from *and* its
   * Zotero can do so (`reader.startReadAloudAtPosition` exists). Checked
   * before the key is consumed: without a selection Shift+Space keeps
   * paging the reader.
   */
  canStartFromSelection?(reader: unknown): boolean;
  /**
   * Zotero's own "Read Aloud from Here" on the current selection
   * (`reader.startReadAloudAtPosition()` with no argument): an open session
   * jumps there, an idle reader opens the popup and starts reading there.
   */
  startFromSelection?(reader: unknown): void;
  /**
   * Re-emit the manager's state (`manager._stateChanged()`, a queued
   * onStateChange with no audio side effects), so a view just locked by
   * lockPosition gets a push to scroll back on right away. The PDF view
   * navigates on any push while locked; EPUB and snapshot views only on a
   * segment change, so there the view returns at the next sentence.
   */
  emitState?(reader: unknown): void;
  /**
   * Whether this reader could resume at all — Zotero's
   * `reader.startReadAloudAtPosition` exists. Unlike the other position
   * keys this does not ask whether there is anything to resume: the key is
   * consumed either way, so it never falls through to the reader and the
   * binding may sit on a key the reader itself uses.
   */
  canResumeLastPosition?(reader: unknown): boolean;
  /**
   * Resume at the position stored for this document. True when there was
   * one and Zotero was asked to start there; false when this document has
   * nothing stored, which turns into a toast.
   */
  resumeLastPosition?(reader: unknown): boolean;
  /** A plain-text toast, for telling the user there is nothing to resume. */
  showMessage?(reader: unknown, text: string): void;
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
  /** Start reading at the current selection; false when there is no selection to start from. */
  startFromSelection(reader: unknown): boolean;
  /** Bring the view back to the spoken position; false when no Read Aloud session is open. */
  returnToSpoken(reader: unknown): boolean;
  /** Resume at the stored position; false when this reader cannot resume at all, so the key is left alone. */
  resumeLastPosition(reader: unknown): boolean;
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

  const canStartFromSelection = (reader: unknown): boolean => {
    if (!deps.startFromSelection || !deps.canStartFromSelection) return false;
    try {
      return deps.canStartFromSelection(reader);
    } catch (e) {
      log(e);
      return false;
    }
  };

  function startFromSelection(reader: unknown): boolean {
    if (!canStartFromSelection(reader)) return false;
    try {
      deps.startFromSelection?.(reader);
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

  /** Read Aloud exists here, so the key is ours whether or not there is anything stored. */
  const canResumeLastPosition = (reader: unknown): boolean => {
    if (!deps.resumeLastPosition || !deps.canResumeLastPosition) return false;
    try {
      return deps.canResumeLastPosition(reader);
    } catch (e) {
      log(e);
      return false;
    }
  };

  function resumeLastPosition(reader: unknown): boolean {
    if (!canResumeLastPosition(reader)) return false;
    let resumed = false;
    try {
      resumed = deps.resumeLastPosition?.(reader) ?? false;
    } catch (e) {
      log(e);
    }
    if (!resumed) {
      try {
        deps.showMessage?.(reader, NO_SAVED_POSITION);
      } catch (e) {
        log(e);
      }
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
    // paused) and falls through untouched otherwise. Shift+Space pages too:
    // it is borrowed only while there is a selection to start reading from.
    if (isNavigationAction(action) && !canSkip(managerOf(reader))) return false;
    if (action === 'startFromSelection' && !canStartFromSelection(reader)) return false;
    if (action === 'returnToSpoken' && !canReturnToSpoken(reader)) return false;
    if (action === 'resumeLastPosition' && !canResumeLastPosition(reader)) return false;
    event.preventDefault();
    event.stopPropagation();
    // Holding the key down would restart the current segment on every auto-repeat
    if (event.repeat) return true;
    if (isNavigationAction(action)) navigate(reader, action);
    else if (action === 'startFromSelection') startFromSelection(reader);
    else if (action === 'returnToSpoken') returnToSpoken(reader);
    else if (action === 'resumeLastPosition') resumeLastPosition(reader);
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

  return { handleKeyDown, adjust, navigate, startFromSelection, returnToSpoken, resumeLastPosition, listen, unlisten, dispose };
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
