import { getChromeWebSocket, newRequestId } from './core/providers/azure';
import { createProvider } from './core/providers/factory';
import { createMemoryCache } from './core/memory-cache';
import { createZoteroPrefs, loadSettings, migrateLegacyProviderPref } from './core/settings';
import { installHijack } from './read-aloud';
import { createReadAloudMemorySync, type ReadAloudMemorySync } from './read-aloud/memory-sync';
import { createHighlightStyling, type HighlightStyling } from './read-aloud/highlight-style';
import { createSystemVoiceHiding, type SystemVoiceHiding } from './read-aloud/system-voices';
import { createMultilingualFirst, type MultilingualFirst } from './read-aloud/multilingual-first';
import { createPositionSync, ACTIVE_TICK_MS, IDLE_TICK_MS, type PositionSync } from './read-aloud/position-sync';
import { readPositions, resumeTarget } from './read-aloud/read-aloud-position';
import { readMemory } from './read-aloud/read-aloud-memory';
import { readReadAloudVoices } from './core/read-aloud-speed';
import { listNamedCatalog, type CatalogEntry } from './read-aloud/catalog';
import { parseFavoriteVoices } from './read-aloud/favorites';
import { dropdownLanguage, languageDisplayName } from './read-aloud/language-dropdown';
import { decodeVoiceId } from './read-aloud/voice-catalog';
import type { ZoteroVoice } from './read-aloud/zotero-voices';
import {
  createRemoteInterface,
  type NativeRemoteInterface,
  type RemoteInterface,
} from './read-aloud/remote-interface';
import { onPaneLoad, registerPrefsPane, TEST_CONNECTION_TIMEOUT_MS, zoteroVoiceService } from './ui/prefs-pane';
import {
  createReadAloudShortcuts,
  deepActiveElement,
  isEditableTarget,
  isSpeaking,
  pickReader,
  type ReadAloudShortcuts,
} from './ui/read-aloud-shortcuts';
import { removeSpeedToast, showSpeedToast } from './ui/speed-toast';
import { browserVoices, createSamplePlayer, defaultVoiceLine, defaultVoiceRows, groupVoicesByTier, languageNameOf, startingSpeed } from './ui/voice-browser-rows';
import { silentWav } from './core/silence';
import { withTimeout } from './core/timeout';

export interface StartupParams {
  id: string;
  version: string;
  rootURI: string;
}

let uninstallHijack: (() => void) | null = null;
let pluginVersion = '0.0.0';
let readAloudShortcuts: ReadAloudShortcuts | null = null;
let readerOpenedListener: ((event: any) => void) | null = null;
let readAloudMemory: ReadAloudMemorySync | null = null;
let positionSync: PositionSync | null = null;
let highlightStyling: HighlightStyling | null = null;
let systemVoiceHiding: SystemVoiceHiding | null = null;
let multilingualFirst: MultilingualFirst | null = null;

const prefs = createZoteroPrefs();

/** The cache key includes a config fingerprint, so old audio automatically invalidates after a provider's configuration changes. */
function cacheVersion(): string {
  const s = loadSettings(prefs);
  return [pluginVersion, s.openai.model, s.azure.region, s.local.engine, s.local.baseURL].join('|');
}

/**
 * One process-wide audio cache, in memory. Replaces the Cache API: driving
 * `win.caches` from the plugin sandbox crashed Zotero with a Gecko release
 * assert on the DOMCacheThread on every playback (see core/memory-cache.ts).
 * 64 MiB is roughly forty minutes of 48 kbit/s speech — enough to make
 * re-reading a paragraph free, small enough to never matter.
 */
const audioCache = createMemoryCache({ maxBytes: 64 * 1024 * 1024 });

function providerDeps() {
  return { fetch, getWebSocket: getChromeWebSocket, newRequestId };
}

/** The voices of every enabled provider; one failing is logged and skipped, not fatal. */
async function listCatalog(): Promise<CatalogEntry[]> {
  const settings = loadSettings(prefs);
  return listNamedCatalog(settings, (id) => createProvider(id, settings, providerDeps()), (e) => Zotero.logError(e));
}

/**
 * The texts of the playback segments after the one whose text is `text`,
 * in speaking order, for the prefetcher. The list is the *controller's*
 * `_segments` — the sentence-level sequence its own `_prefetchFrom`
 * iterates — NOT `manager.segments`, which is the coarser list the reader
 * reported (verified live: warming that list synthesized paragraphs the
 * player never asks for). The search is anchored at the controller's
 * playback position so a sentence that repeats earlier in the document
 * cannot pull the window backwards. Reader-side arrays are read with
 * plain loops only: their `map`/`indexOf` would run in the reader's
 * compartment, which may not call back into sandbox-owned values.
 */
function upcomingSegmentTexts(reader: any, text: string, count: number): string[] {
  try {
    const controller = reader?._internalReader?._readAloudManager?._controller;
    const segments = controller?._segments;
    const length = typeof segments?.length === 'number' ? segments.length : 0;
    if (!length) return [];
    const position = controller._currentIndex ?? controller._position;
    const from = typeof position === 'number' && position >= 0 && position < length ? position : 0;
    let at = -1;
    for (let i = from; i < length; i++) {
      if (segments[i]?.text === text) {
        at = i;
        break;
      }
    }
    if (at === -1) return [];
    const out: string[] = [];
    for (let i = at + 1; i < length && out.length < count; i++) {
      const t = segments[i]?.text;
      if (typeof t === 'string' && t) out.push(t);
    }
    return out;
  } catch (e) {
    Zotero.logError(e);
    return [];
  }
}

function startHijack(): void {
  uninstallHijack?.();
  // makeInterface only runs when Zotero calls it; targetWindow is the
  // reader iframe window it passes in — it doesn't exist yet at push
  // time (see Task 13).
  uninstallHijack = installHijack(Zotero.Reader._readers, (reader: any, targetWindow: any, native) =>
    wrapForWindow(
      targetWindow,
      createRemoteInterface({
        // Zotero's own interface is kept: its Standard and Premium voices,
        // credits and audio pass through untouched, and ours are merged in
        // under the local tier. Zotero's code runs in its own compartment
        // (including its use of the chrome window's Cache API, which only
        // ever crashed when driven from this sandbox).
        native: () => native() as NativeRemoteInterface | null,
        // The internal reader exists by the time Zotero asks for voices,
        // and Zotero restores the remembered voice on the same tick.
        onVoicesRequested: () => {
          readAloudMemory?.attach(reader);
          // The popup is open, so the document is rendered and its views exist
          highlightStyling?.attach(reader);
          // The manager exists and this very listing's _resolveVoice has not
          // run yet, so even the first popup open is filtered
          systemVoiceHiding?.attach(reader);
          // The popup renders its language options after the voices arrive,
          // so the label patch is in place for the first open too
          multilingualFirst?.attach(reader);
        },
        listCatalog,
        getHideZoteroLocalVoices: () => loadSettings(prefs).readAloud.hideZoteroLocalVoices,
        getFavoriteVoices: () => {
          const s = loadSettings(prefs);
          return s.readAloud.favoritesOnly ? parseFavoriteVoices(s.readAloud.favoriteVoices) : null;
        },
        getPrefetch: () => {
          const s = loadSettings(prefs);
          return { enabled: s.prefetchEnabled, count: s.prefetch };
        },
        getUpcomingTexts: (text, count) => upcomingSegmentTexts(reader, text, count),
        // Built from the voice id, not from the enabled flags: Zotero
        // remembers the last-selected voice, which may belong to a provider
        // the user has since switched off, and a cached or in-flight segment
        // must still play.
        getProvider: (id) => createProvider(id, loadSettings(prefs), providerDeps()),
        cacheVersion,
        cache: loadSettings(prefs).cacheAudio ? audioCache : undefined,
        log: (e) => Zotero.logError(e),
        debug: (message) => Zotero.debug('[zotero-tts] ' + message),
        // Every provider builds its audio Blob inside the plugin sandbox, and
        // it is then Cu.cloneInto'd into the reader iframe. Native Zotero's
        // Blob is created in the chrome window (syncAPIClient.js), so the
        // compartment hop native performs is chrome -> reader, never
        // sandbox -> reader. Re-create the Blob in the chrome window first so
        // the hop we make is the one native makes; the bytes are copied and
        // the sandbox object never leaves the plugin. (Kept after the Cache
        // API was removed: it was not the crash cause, but parity with the
        // native path is cheap and removes a difference we cannot test.)
        adoptAudio: (blob) => new reader._window.Blob([blob], { type: blob.type || 'audio/mpeg' }),
        // AbortController is not on the sandbox whitelist (spec §2.10); take
        // it from the reader's chrome window, the same way WebSocket and
        // caches are obtained. Per call, never cached, so a closed window is
        // never retained.
        newAbortController: () => new reader._window.AbortController(),
      }),
    ),
  );
}

/**
 * The native Zotero implementation wraps every return value in
 * `new targetWindow.Promise(...)` and `Cu.cloneInto`s it into the reader
 * iframe, because reading across scopes otherwise triggers a permission
 * error (comment at reader.js:1746). Our interface returns a plain
 * Promise, so we add the same wrapping here.
 */
function wrapForWindow(targetWindow: any, iface: RemoteInterface): unknown {
  const Cu = Components.utils;
  const wrapped: Record<string, unknown> = {};
  // RemoteInterface is a named interface with no index signature, so it
  // can't be assigned directly to Record<string, ...>; hence the
  // explicit cast here before iterating.
  const methods = iface as unknown as Record<string, (...args: any[]) => Promise<any>>;
  for (const [name, fn] of Object.entries(methods)) {
    wrapped[name] = (...args: any[]) =>
      new targetWindow.Promise((resolve: (v: unknown) => void) => {
        fn(...args)
          .then((result) => resolve(Cu.cloneInto(result, targetWindow, { cloneFunctions: false })))
          .catch((e) => {
            Zotero.logError(e);
            resolve(Cu.cloneInto({ error: 'unknown' }, targetWindow));
          });
      });
  }
  return wrapped;
}

// ---- Read Aloud shortcuts --------------------------------------------------
//
// The speed keys drive Zotero's own Read Aloud speed (the popup slider), the
// only speed there is: audio is synthesized at the voice's natural pace and
// Zotero time-stretches what it already has, so the change is immediate and
// cached audio stays valid. The sentence and paragraph keys call the
// manager's skipBack/skipAhead — the popup's skip buttons — and only while
// a session is open, since the arrows page the reader otherwise.
// Keys are captured at two levels. A capturing listener on each chrome
// window sees keys from the library, the item pane and — because Gecko
// propagates key events up through in-process frames — the reader as well.
// A second listener on each reader iframe is the safety net in case that
// propagation ever stops; handleKeyDown's defaultPrevented check keeps the
// two from both acting on one key.

function readAloudManager(reader: any) {
  return reader?._internalReader?._readAloudManager ?? null;
}

/** Every top-level Zotero window that can host reader tabs. */
function mainWindows(): any[] {
  if (typeof Zotero.getMainWindows === 'function') return Zotero.getMainWindows();
  const wins: any[] = [];
  const e = Services.wm.getEnumerator('navigator:browser');
  while (e.hasMoreElements()) wins.push(e.getNext());
  return wins;
}

/** Where a toast goes: the reader, unless its tab is hidden behind another, then the window itself. */
function toastDoc(reader: any): any {
  const win = reader?._window;
  const tabs = win?.Zotero_Tabs;
  const hiddenTab = !!(tabs && reader?.tabID && tabs.selectedID !== reader.tabID);
  return hiddenTab ? win.document : (reader?._iframeWindow?.document ?? win?.document);
}

function toastFor(reader: any, speed: number): void {
  const doc = toastDoc(reader);
  if (doc) showSpeedToast(doc, speed);
}

function watchWindow(win: any): void {
  if (!win || !readAloudShortcuts) return;
  readAloudShortcuts.listen(
    win,
    () =>
      pickReader(
        Zotero.Reader._readers,
        win,
        win.Zotero_Tabs ? win.Zotero_Tabs.selectedID : null,
        (r: any) => isSpeaking(readAloudManager(r)),
      ),
    { isEditable: (event) => isEditableTarget(event.target) || isEditableTarget(deepActiveElement(win.document)) },
  );
}

function watchReader(reader: any): void {
  if (!reader || !readAloudShortcuts) return;
  watchWindow(reader._window);
  readAloudMemory?.attach(reader);
  highlightStyling?.attach(reader);
  systemVoiceHiding?.attach(reader);
  multilingualFirst?.attach(reader);
  const iframe = reader._iframeWindow;
  if (iframe) {
    readAloudShortcuts.listen(iframe, () => reader, {
      isEditable: (event) => isEditableTarget(event.target) || isEditableTarget(deepActiveElement(iframe.document)),
    });
  }
  hookPositionCapture(reader);
  hookTabClose(reader);
}

/**
 * The closing tab's last chance: a per-reader wrap of the chrome-side
 * `reader.uninit`, which the tab-close notification runs synchronously
 * while the reader's state is still whole (uninit itself reads it to flush
 * the view state). The capture runs first, then the original — so the
 * sentence being read *at* close is stored instead of whatever the last
 * tick saw. An iframe 'unload' hook was tried first and never fired:
 * removing the iframe's node does not dispatch unload (verified
 * 2026-08-26, notes/NOTES.md). Same chrome-side per-reader pattern as
 * read-aloud/index.ts. Entries drop off as uninit runs; the rest are
 * restored on stop, so a reloaded plugin leaves no wrap behind.
 */
const positionCaptureHooks = new Map<any, { original: any; wrapper: any }>();

/**
 * Chrome objects reached through `reader._window` have shown Xray-flavored
 * views before (the invisible-Intl incident, NOTES.md): an assignment can
 * land on the wrapper, where our side reads it back happily while chrome
 * keeps seeing the original — exactly a silent no-op hook. The team
 * remedy stands: waive unconditionally (a no-op on a transparent wrapper)
 * and assign through the waived view, which is the target itself.
 */
function waived(obj: any): any {
  try {
    return Components.utils.waiveXrays(obj) ?? obj;
  } catch {
    return obj;
  }
}

/**
 * Ring buffer tracing the close path, because three rounds of evidence say
 * the user's close gesture reaches neither tab.onClose nor reader.uninit.
 * Shown by diagnostics.position() as `trace`; cheap enough to keep.
 */
const closeTrace: string[] = [];

function trace(msg: string): void {
  try {
    closeTrace.push(new Date().toISOString().slice(11, 23) + ' ' + msg);
    if (closeTrace.length > 60) closeTrace.splice(0, closeTrace.length - 60);
  } catch {
    // Tracing must never be the thing that throws
  }
}

/** Every tab notifier event, timestamped, so a close gesture shows its real path. */
let tabNotifierID: string | null = null;

function startCloseTrace(): void {
  if (tabNotifierID !== null) return;
  try {
    tabNotifierID = Zotero.Notifier.registerObserver(
      {
        notify: (event: string, _type: string, ids: unknown[]) => {
          try {
            trace(`notifier tab ${event} ${JSON.stringify(ids)}`);
          } catch {
            trace(`notifier tab ${event}`);
          }
        },
      },
      ['tab'],
      'zotero-tts-trace',
    );
  } catch (e) {
    Zotero.logError(e);
  }
}

function stopCloseTrace(): void {
  if (tabNotifierID === null) return;
  try {
    Zotero.Notifier.unregisterObserver(tabNotifierID);
  } catch {
    // Already gone at shutdown
  }
  tabNotifierID = null;
}

/**
 * The primary capture point. `Zotero_Tabs.close` calls `tab.onClose()`
 * synchronously for every close path — the × button included — while the
 * tab's DOM removal is still a setTimeout away and the Reader.notify
 * uninit runs much later still (observed lagging by many seconds, the
 * reader lingering deactivated in `_readers`). Wrapping the tab object's
 * own `onClose` is Zotero's own pattern (xpcom/reader.js ~1968). Patching
 * `Zotero_Tabs.close` instead would miss the × button, which goes through
 * a reference bound at init (tabs.js ~541).
 */
const tabCloseHooks = new Map<any, { original: any; wrapper: any }>();

function hookTabClose(reader: any): void {
  try {
    const tabs = reader?._window?.Zotero_Tabs?._tabs;
    const tabID = reader?.tabID;
    if (!Array.isArray(tabs) || !tabID) return;
    const raw = tabs.find((t: any) => t?.id === tabID);
    if (!raw) return;
    const tab = waived(raw);
    if (tabCloseHooks.has(tab)) return;
    const original = tab.onClose;
    const wrapper = function zttsTabCloseCapture(this: unknown) {
      tabCloseHooks.delete(tab);
      trace(`tab.onClose fired ${String(tabID)}`);
      try {
        positionSync?.captureClose(reader);
      } catch (e) {
        Zotero.logError(e);
      }
      return original?.call(tab);
    };
    tab.onClose = wrapper;
    // Read back through the waived view — the target itself. A mismatch
    // means the hook silently landed somewhere chrome will not look.
    if (tab.onClose !== wrapper) {
      throw new Error('zotero-tts: tab.onClose wrap did not stick');
    }
    tabCloseHooks.set(tab, { original, wrapper });
    trace(`hooked tab ${String(tabID)}`);
  } catch (e) {
    Zotero.logError(e);
  }
}

function unhookTabCloses(): void {
  for (const [tab, { original, wrapper }] of [...tabCloseHooks]) {
    try {
      if (tab.onClose === wrapper) tab.onClose = original;
    } catch {
      // A tab already gone took its wrap with it
    }
  }
  tabCloseHooks.clear();
}

/** How many hooks chrome can actually see right now, per family. */
function liveHookCounts(): { tabs: number; uninits: number } {
  let tabs = 0;
  for (const [tab, { wrapper }] of tabCloseHooks) {
    try {
      if (tab.onClose === wrapper) tabs++;
    } catch {
      // A dead tab counts as not live
    }
  }
  let uninits = 0;
  for (const [reader, { wrapper }] of positionCaptureHooks) {
    try {
      if (waived(reader).uninit === wrapper) uninits++;
    } catch {
      // A dead reader counts as not live
    }
  }
  return { tabs, uninits };
}

function hookPositionCapture(reader: any): void {
  try {
    if (positionCaptureHooks.has(reader)) return;
    const target = waived(reader);
    if (typeof target?.uninit !== 'function') return;
    const original = target.uninit;
    const wrapper = function zttsUninitCapture(this: unknown, ...args: unknown[]) {
      positionCaptureHooks.delete(reader);
      trace(`reader.uninit fired item ${String(reader?.itemID)}`);
      try {
        positionSync?.captureClose(reader);
      } catch (e) {
        Zotero.logError(e);
      }
      try {
        target.uninit = original;
      } catch {
        // A frozen reader keeps the wrap; original still runs below
      }
      return Reflect.apply(original, this, args);
    };
    target.uninit = wrapper;
    if (target.uninit !== wrapper) {
      throw new Error('zotero-tts: reader.uninit wrap did not stick');
    }
    positionCaptureHooks.set(reader, { original, wrapper });
  } catch (e) {
    Zotero.logError(e);
  }
}

function unhookPositionCaptures(): void {
  for (const [reader, { original, wrapper }] of [...positionCaptureHooks]) {
    try {
      const target = waived(reader);
      if (target.uninit === wrapper) target.uninit = original;
    } catch {
      // A reader already gone took its wrap with it
    }
  }
  positionCaptureHooks.clear();
}

function startReadAloudShortcuts(pluginID: string): void {
  stopReadAloudShortcuts();
  readAloudShortcuts = createReadAloudShortcuts({
    getBindings: () => loadSettings(prefs).shortcuts,
    prefs,
    getManager: readAloudManager,
    showToast: toastFor,
    // After a skip, what the popup's own buttons do: the view follows the spoken position again
    lockPosition: (reader: any) => reader?._internalReader?._lockPositionToReadAloud?.(),
    // The smart key is consumed whenever Read Aloud exists — never left to
    // the reader (notes/shift_space_logic.md)
    canReadAloud: (reader: any) => typeof reader?._internalReader?.startReadAloudAtPosition === 'function',
    // getSelectionPosition reads the selection-popup state — the same check
    // Zotero's own Cmd/Ctrl+Shift+R makes before startReadAloudAtPosition()
    hasSelection: (reader: any) => !!reader?._internalReader?.getSelectionPosition?.(),
    // Zotero's own start: selection > near-view saved position > first
    // visible segment; an idle reader opens the popup and auto-plays
    startReadAloud: (reader: any) => reader?._internalReader?.startReadAloudAtPosition?.(),
    // The popup's play button; unpausing with a selection restarts from it
    // (Zotero native, reader.js ~83595)
    togglePaused: (reader: any) => reader?._internalReader?.toggleReadAloudPaused?.(),
    // A queued onStateChange with no audio side effects; with the position
    // just locked, the PDF view scrolls back on this push (EPUB and
    // snapshot views wait for the next segment change)
    emitState: (reader: any) => reader?._internalReader?._readAloudManager?._stateChanged?.(),
    // Zotero's own resume path. Idle: the popup opens, the position becomes
    // the manager's target and the reader auto-activates once a voice
    // resolves. Passing the position explicitly takes the
    // consumeTargetPosition branch of _captureReadAloudStart, so the
    // isPositionNearView gate that erases Zotero's own copy is never reached.
    resumeLastPosition: (reader: any) => {
      if (!positionSync) return false;
      // Catch up first, so the current sentence counts even between ticks
      positionSync.sample();
      const pos = positionSync.lookup(reader);
      if (pos === null || pos === undefined) return false;
      // A PDF sentence rect lands one segment early; hand Zotero the same
      // point shape the context menu's "Read Aloud from Here" uses
      const target = resumeTarget(pos);
      try {
        trace(`resume item ${String(reader?.itemID)} target ${JSON.stringify(target).slice(0, 100)}`);
      } catch {
        // Tracing only
      }
      // A sandbox-built object reads as empty inside the reader
      const win = reader?._iframeWindow;
      reader._internalReader.startReadAloudAtPosition(win ? Components.utils.cloneInto(target, win) : target);
      return true;
    },
    log: (e) => Zotero.logError(e),
  });
  for (const win of mainWindows()) watchWindow(win);
  for (const reader of Zotero.Reader._readers) watchReader(reader);
  // renderToolbar fires once the reader iframe exists, which is when there
  // is something to listen on; readers open before startup are covered above.
  readerOpenedListener = (event: any) => {
    try {
      watchReader(event.reader);
    } catch (e) {
      Zotero.logError(e);
    }
  };
  Zotero.Reader.registerEventListener('renderToolbar', readerOpenedListener, pluginID);
}

function stopReadAloudShortcuts(): void {
  if (readerOpenedListener) {
    try {
      Zotero.Reader.unregisterEventListener('renderToolbar', readerOpenedListener);
    } catch (e) {
      Zotero.logError(e);
    }
    readerOpenedListener = null;
  }
  readAloudShortcuts?.dispose();
  readAloudShortcuts = null;
  for (const win of mainWindows()) {
    try {
      removeSpeedToast(win.document);
    } catch {
      // A window torn down mid-shutdown has nothing left to clean
    }
  }
  for (const reader of Zotero.Reader._readers ?? []) {
    try {
      // The chrome document too: a separate reader window is not a main window
      for (const doc of [reader._iframeWindow?.document, reader._window?.document]) {
        if (doc) removeSpeedToast(doc);
      }
    } catch {
      // Same: a closed reader is already clean
    }
  }
}

// ---- One voice and speed across documents ----------------------------------
//
// Zotero remembers the Read Aloud voice and speed per detected document
// language; see read-aloud/read-aloud-memory.ts for what is kept instead.

function startReadAloudMemory(): void {
  stopReadAloudMemory();
  readAloudMemory = createReadAloudMemorySync({
    prefs,
    sameVoice: () => loadSettings(prefs).readAloud.sameForAllDocuments,
    globalSpeed: () => loadSettings(prefs).readAloud.globalSpeed,
    registerObserver: (name, handler) => Zotero.Prefs.registerObserver(name, handler),
    unregisterObserver: (token) => Zotero.Prefs.unregisterObserver(token),
    readers: () => Zotero.Reader._readers ?? [],
    // The reader iframe may not call a bare sandbox function (the call
    // throws there and takes the Read Aloud button with it); export it into
    // the iframe's compartment, as Zotero does with its own interface.
    exportFunction: (fn, target) => Components.utils.exportFunction(fn, target),
    waiveXrays: (value) => ((value && typeof value === 'object') || typeof value === 'function' ? Components.utils.waiveXrays(value) : value),
    // Zotero's own per-reader observer (xpcom/reader.js
    // _handleReadAloudVoicesPrefChange) copies the pref into the reader's
    // state; observers run in registration order, so a reader opened after
    // startup hears a write after this sync does. Run its handler first;
    // failing that, do what it does.
    refreshVoices: (reader: any) => {
      if (typeof reader?._handleReadAloudVoicesPrefChange === 'function') {
        reader._handleReadAloudVoicesPrefChange();
        return;
      }
      const internal = reader?._internalReader;
      const win = reader?._iframeWindow;
      if (internal && typeof internal.setReadAloudVoices === 'function' && win) {
        internal.setReadAloudVoices(Components.utils.cloneInto(readReadAloudVoices(prefs), win));
      }
    },
    error: (e) => Zotero.logError(e),
    debug: (message) => Zotero.debug('[zotero-tts] ' + message),
  });
  for (const reader of Zotero.Reader._readers ?? []) readAloudMemory.attach(reader);
}

function stopReadAloudMemory(): void {
  readAloudMemory?.dispose();
  readAloudMemory = null;
}

// ---- Where Read Aloud stopped ---------------------------------------------
//
// Zotero keeps this itself but erases it as soon as the user scrolls away
// (reader bundle ~84365); read-aloud/position-sync.ts keeps a copy nothing
// erases. Everything here is a read — no reader internals are patched.

function startPositionSync(): void {
  stopPositionSync();
  positionSync = createPositionSync({
    prefs,
    readers: () => Zotero.Reader._readers ?? [],
    // The item key, not itemID: itemID is a local autoincrement, the key is
    // what identifies the attachment anywhere.
    attachmentOf: (reader: any) => {
      const item = reader?.itemID ? Zotero.Items.get(reader.itemID) : null;
      return item && typeof item.libraryID === 'number' && item.key ? { lib: item.libraryID, key: item.key } : null;
    },
    managerOf: (reader: any) => reader?._internalReader?._readAloudManager ?? null,
    savedPositionOf: (reader: any) => reader?._internalReader?._state?.readAloudState?.savedPosition ?? null,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (handle: any) => clearTimeout(handle),
    now: () => Date.now(),
    error: (e) => Zotero.logError(e),
  });
  positionSync.start();
  startCloseTrace();
}

function stopPositionSync(): void {
  stopCloseTrace();
  unhookTabCloses();
  unhookPositionCaptures();
  positionSync?.stop();
  positionSync = null;
}

// ---- Highlight colors -----------------------------------------------------
//
// Zotero's highlight colors are constants in its reader bundle; see
// read-aloud/highlight-style.ts for how they are replaced per reader.

function startHighlightStyling(): void {
  stopHighlightStyling();
  highlightStyling = createHighlightStyling({
    style: () => loadSettings(prefs).highlight,
    exportFunction: (fn, target) => Components.utils.exportFunction(fn, target),
    // The view's timers live in the reader iframe's window, not in this sandbox
    clearTimeout: (reader: any, id) => reader?._iframeWindow?.clearTimeout?.(id),
    // A repaired selector built in this sandbox is unreadable by reader code; clone it over
    cloneIntoReader: (reader: any, value) => (reader?._iframeWindow ? Components.utils.cloneInto(value, reader._iframeWindow) : value),
    // What the reader hands an exported function arrives behind Xray wrappers (see highlight-style.ts)
    waiveXrays: (value) => ((value && typeof value === 'object') || typeof value === 'function' ? Components.utils.waiveXrays(value) : value),
    error: (e) => Zotero.logError(e),
    debug: (message) => Zotero.debug('[zotero-tts] ' + message),
  });
  for (const reader of Zotero.Reader._readers ?? []) highlightStyling.attach(reader);
}

function stopHighlightStyling(): void {
  highlightStyling?.dispose();
  highlightStyling = null;
}

// ---- Hiding Zotero's own Local voices --------------------------------------
//
// The OS voices never pass through the remote interface; see
// read-aloud/system-voices.ts for the manager-side filter.

function startSystemVoiceHiding(): void {
  stopSystemVoiceHiding();
  systemVoiceHiding = createSystemVoiceHiding({
    enabled: () => loadSettings(prefs).readAloud.hideZoteroLocalVoices,
    exportFunction: (fn, target) => Components.utils.exportFunction(fn, target),
    waiveXrays: (value) => ((value && typeof value === 'object') || typeof value === 'function' ? Components.utils.waiveXrays(value) : value),
    error: (e) => Zotero.logError(e),
    debug: (message) => Zotero.debug('[zotero-tts] ' + message),
  });
  for (const reader of Zotero.Reader._readers ?? []) systemVoiceHiding.attach(reader);
}

function stopSystemVoiceHiding(): void {
  systemVoiceHiding?.dispose();
  systemVoiceHiding = null;
}

// ---- "Multiple languages" first in the language dropdown --------------------
//
// The popup sorts languages by display label, hard-coded; see
// read-aloud/multilingual-first.ts for the label patch that wins that sort.

function startMultilingualFirst(): void {
  stopMultilingualFirst();
  multilingualFirst = createMultilingualFirst({
    exportFunction: (fn, target) => Components.utils.exportFunction(fn, target),
    waiveXrays: (value) => ((value && typeof value === 'object') || typeof value === 'function' ? Components.utils.waiveXrays(value) : value),
    // The diagnostics probe hands an options object to a reader-compartment
    // constructor; a sandbox-built object is unreadable there
    cloneInto: (reader: any, value) => (reader?._iframeWindow ? Components.utils.cloneInto(value, reader._iframeWindow) : value),
    error: (e) => Zotero.logError(e),
    debug: (message) => Zotero.debug('[zotero-tts] ' + message),
  });
  for (const reader of Zotero.Reader._readers ?? []) multilingualFirst.attach(reader);
}

function stopMultilingualFirst(): void {
  multilingualFirst?.dispose();
  multilingualFirst = null;
}

async function startup({ id, version, rootURI }: StartupParams): Promise<void> {
  pluginVersion = version;
  try {
    if (migrateLegacyProviderPref(prefs)) Zotero.debug('[zotero-tts] migrated the single-provider setting');
  } catch (e) {
    Zotero.logError(e);
  }
  await registerPrefsPane(rootURI, id, version);

  try {
    startReadAloudMemory();
    startPositionSync();
  } catch (e) {
    Zotero.logError(e);
    Zotero.debug('[zotero-tts] failed to install the Read Aloud memory');
  }
  try {
    startHighlightStyling();
  } catch (e) {
    Zotero.logError(e);
    Zotero.debug('[zotero-tts] failed to install the highlight colors');
  }
  try {
    startSystemVoiceHiding();
  } catch (e) {
    Zotero.logError(e);
    Zotero.debug('[zotero-tts] failed to install the system-voice hiding');
  }
  try {
    startMultilingualFirst();
  } catch (e) {
    Zotero.logError(e);
    Zotero.debug('[zotero-tts] failed to install the Multiple-languages-first ordering');
  }
  // Caught deliberately: if _readers or any other Zotero internal we
  // reach into gets renamed or moved, it will throw here. Without
  // catching it, startup() would reject with no indication at all — the
  // preferences pane would already be registered and look fine, while
  // read-aloud silently produces no voices. Better to have the hijack
  // fail to install than to take down the rest of the plugin (at least
  // the preferences pane) with it.
  try {
    startHijack();
  } catch (e) {
    Zotero.logError(e);
    Zotero.debug('[zotero-tts] failed to install the Read Aloud hook');
  }
  try {
    startReadAloudShortcuts(id);
  } catch (e) {
    Zotero.logError(e);
    Zotero.debug('[zotero-tts] failed to install the Read Aloud shortcuts');
  }
  Zotero.debug('[zotero-tts] started');
}

async function shutdown(): Promise<void> {
  uninstallHijack?.();
  uninstallHijack = null;
  stopReadAloudShortcuts();
  stopPositionSync();
  stopReadAloudMemory();
  stopHighlightStyling();
  stopSystemVoiceHiding();
  stopMultilingualFirst();
  Zotero.debug('[zotero-tts] stopped');
}

function onMainWindowLoad(win: any): void {
  watchWindow(win);
}

function onMainWindowUnload(win: any): void {
  readAloudShortcuts?.unlisten(win);
  try {
    removeSpeedToast(win.document);
  } catch {
    // Window already gone
  }
}

/**
 * A diagnostics field, read behind its own guard and copied before it
 * leaves: a probe that throws on one dead object tells you nothing about
 * the rest, which is how the 2026-08-26 bug hid.
 */
function safe(fn: () => unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(fn() ?? null));
  } catch (e) {
    return String(e);
  }
}

/** A language tag named as the popup's dropdown names it, in the app's locale — what the pane hands the voice browser too. */
const appLanguageName = (code: string) => languageDisplayName(code, Zotero.locale ?? 'en');

/** For Tools → Developer → Run JavaScript: `Zotero.ZoteroTTS.diagnostics.highlight()` etc. */
const diagnostics = {
  highlight: () => JSON.stringify((Zotero.Reader._readers ?? []).map((r: any) => highlightStyling?.inspect(r) ?? null), null, 1),
  systemVoices: () => JSON.stringify((Zotero.Reader._readers ?? []).map((r: any) => systemVoiceHiding?.inspect(r) ?? null), null, 1),
  multilingualFirst: () => JSON.stringify((Zotero.Reader._readers ?? []).map((r: any) => multilingualFirst?.inspect(r) ?? null), null, 1),
  /**
   * What the smart play key (Shift+Space) would do on each reader right
   * now, mirroring smartPlay's dispatch (notes/shift_space_logic.md):
   * session open → togglePaused; idle → selection > stored > plain start.
   */
  smartKey: () => {
    safe(() => positionSync?.sample());
    const readers = (Zotero.Reader._readers ?? []).map((r: any) => {
      const canReadAloud = safe(() => typeof r?._internalReader?.startReadAloudAtPosition === 'function') === true;
      const active = safe(() => !!r?._internalReader?._readAloudManager?.active) === true;
      const paused = safe(() => !!r?._internalReader?._readAloudManager?.paused) === true;
      const hasSelection = safe(() => !!r?._internalReader?.getSelectionPosition?.()) === true;
      const stored = safe(() => positionSync?.lookup(r));
      const wouldDo = !canReadAloud
        ? 'fall through (no Read Aloud)'
        : active
          ? paused
            ? 'togglePaused (resume; a selection restarts from it)'
            : 'togglePaused (pause)'
          : hasSelection
            ? 'startReadAloud (from the selection)'
            : stored !== null && stored !== undefined
              ? 'resume at the stored position'
              : 'startReadAloud (plain start)';
      return { itemID: safe(() => r?.itemID), canReadAloud, active, paused, hasSelection, stored, wouldDo };
    });
    return JSON.stringify({ shortcut: loadSettings(prefs).shortcuts.startFromSelection, readers }, null, 1);
  },
  /**
   * The stored Read Aloud positions and what the sampler sees right now.
   * `zoteroSaved` is Zotero's own copy — it goes null once the user scrolls
   * away, which is exactly what `stored` is here to survive.
   */
  position: () => {
    safe(() => positionSync?.sample());
    const readers = (Zotero.Reader._readers ?? []).map((r: any) => ({
      itemID: safe(() => r?.itemID),
      attachment: safe(() => {
        const item = r?.itemID ? Zotero.Items.get(r.itemID) : null;
        return item ? item.libraryID + '/' + item.key : null;
      }),
      active: safe(() => !!r?._internalReader?._readAloudManager?.active),
      zoteroSaved: safe(() => r?._internalReader?._state?.readAloudState?.savedPosition),
      stored: safe(() => positionSync?.lookup(r)),
    }));
    return JSON.stringify(
      {
        sampling: !!positionSync,
        tickMs: { active: ACTIVE_TICK_MS, idle: IDLE_TICK_MS },
        // Close-capture wiring: one tabHook per reader tab (fires inside
        // Zotero_Tabs.close, the primary), one captureHook per reader (the
        // reader.uninit backstop); each drops off as it fires
        tabHooks: tabCloseHooks.size,
        captureHooks: positionCaptureHooks.size,
        // What chrome actually sees right now — below the map counts means
        // a wrap silently landed on an Xray wrapper
        live: safe(() => liveHookCounts()),
        trace: closeTrace.slice(-30),
        stored: safe(() => readPositions(prefs)),
        readers,
      },
      null,
      1,
    );
  },
  /**
   * What the voice browser sees of Zotero's own voices — through the very
   * calls the pane makes, from inside the plugin sandbox: the catalog, and
   * one sample of the first voice (free, no credits) to prove the audio
   * path as well. Also counts the favorites by side, since a heart on one
   * of Zotero's voices now trims its tier in the popup too.
   */
  zoteroVoices: async () => {
    try {
      const service = zoteroVoiceService();
      const voices = await service.listVoices();
      const tiers: Record<string, number> = {};
      const locales = new Set<string>();
      for (const v of voices) {
        tiers[v.tier] = (tiers[v.tier] ?? 0) + 1;
        locales.add(v.locale);
      }
      const marked = parseFavoriteVoices(loadSettings(prefs).readAloud.favoriteVoices);
      const first = voices[0] ?? null;
      const sample = first ? await service.sample(first.id) : null;
      return JSON.stringify(
        {
          voices: voices.length,
          tiers,
          locales: locales.size,
          favorites: { plugin: marked.filter((id) => decodeVoiceId(id)).length, zotero: marked.filter((id) => !decodeVoiceId(id)).length },
          first,
          sample: sample ? { voice: first!.id, bytes: sample.size, type: sample.type } : 'no voice to sample',
        },
        null,
        1,
      );
    } catch (e) {
      return JSON.stringify({ error: String(e) }, null, 1);
    }
  },
  /**
   * The default voice as the voice browser shows it, from inside the
   * sandbox: the memory, the rows it names in the very listing the pane
   * gets (the plugin's catalog and Zotero's own voices, each failing on
   * its own), the tier and language the browser opens on, and the status
   * line it paints — so a pane that marks the wrong row can be told apart
   * from a memory that names the wrong voice.
   */
  defaultVoice: async () => {
    try {
      const memory = readMemory(prefs);
      let zotero: ZoteroVoice[] = [];
      let zoteroError: string | null = null;
      try {
        zotero = await zoteroVoiceService().listVoices();
      } catch (e) {
        zoteroError = String(e);
      }
      // Bounded as the pane bounds its listing: a server that never answers must end in an error, not a hang
      const catalog = await withTimeout(listCatalog(), TEST_CONNECTION_TIMEOUT_MS, () => new Error('No voice list within 15 s'));
      const voices = browserVoices(catalog, zotero);
      const rows = defaultVoiceRows(voices, memory.voice);
      const home = rows[0] ?? null;
      const tiers = groupVoicesByTier(voices, appLanguageName);
      const { globalSpeed, sameForAllDocuments: sameVoice } = loadSettings(prefs).readAloud;
      return JSON.stringify(
        {
          memory,
          globalSpeed,
          sameVoice,
          listed: voices.length,
          zoteroError,
          rows: rows.map((r) => ({ tier: r.tier, locale: r.locale, label: r.label, id: r.encoded })),
          // The language entry the row sits under, named as the popup's dropdown names it
          opensOn: home ? { tier: home.tier, language: dropdownLanguage(home.locale), name: languageNameOf(tiers, home) } : 'the usual tier (no listed row is the default)',
          // The pane's line as it opens: the slider starts at startingSpeed; each half of the line answers to its "everywhere" switch
          status: defaultVoiceLine(memory.voice, home, tiers, globalSpeed ? startingSpeed(prefs) : null, sameVoice),
        },
        null,
        1,
      );
    } catch (e) {
      return JSON.stringify({ error: String(e) }, null, 1);
    }
  },
  /**
   * The voice browser's language column beside the popup's dropdown, from
   * inside the sandbox: per tier, the entries the browser shows for the
   * very listing the pane gets, and for every open reader whose popup has
   * loaded its voices, the languages its manager offers on the tier it is
   * on (`manager.languages` — Zotero's normalized codes). The two sets
   * must match while every voice is offered (favorites-only off, Zotero's
   * own Local voices hidden); the names are compared with the dropdown by
   * eye.
   */
  languageColumn: async () => {
    try {
      let zotero: ZoteroVoice[] = [];
      let zoteroError: string | null = null;
      try {
        zotero = await zoteroVoiceService().listVoices();
      } catch (e) {
        zoteroError = String(e);
      }
      const catalog = await withTimeout(listCatalog(), TEST_CONNECTION_TIMEOUT_MS, () => new Error('No voice list within 15 s'));
      const tiers = groupVoicesByTier(browserVoices(catalog, zotero), appLanguageName);
      const column = (tier: unknown) => tiers.find((g) => g.tier === tier)?.languages.map((l) => l.language).sort() ?? [];
      const readers = (Zotero.Reader._readers ?? []).map((r: any) => {
        const manager = r?._internalReader?._readAloudManager;
        const tier = safe(() => manager?._selectedTier ?? null);
        const languages = safe(() => [...(manager?.languages ?? [])]);
        const popup = Array.isArray(languages) ? [...languages].sort() : languages;
        const browser = column(tier);
        return {
          title: safe(() => {
            const item = r?.itemID ? Zotero.Items.get(r.itemID) : null;
            return (item?.parentItem ?? item)?.getField('title') ?? null;
          }),
          tier,
          popup,
          browser,
          same: Array.isArray(popup) && JSON.stringify(popup) === JSON.stringify(browser),
        };
      });
      return JSON.stringify(
        {
          favoritesOnly: loadSettings(prefs).readAloud.favoritesOnly,
          zoteroError,
          column: Object.fromEntries(tiers.map((g) => [g.tier, g.languages.map((l) => `${l.name} (${l.voices.length}) [${l.language}]`)])),
          readers,
        },
        null,
        1,
      );
    } catch (e) {
      return JSON.stringify({ error: String(e) }, null, 1);
    }
  },
  /**
   * The voice browser's speed slider, from inside the sandbox: the speed it
   * starts at (what Read Aloud will read at), and proof that an <audio>
   * element of a Zotero window takes the rate the way the pane's player
   * sets it — playbackRate with the pitch preserved, Read Aloud's own kind
   * of stretch — and follows the slider while playing (setRate). A tenth
   * of a second of silence is played to do it.
   */
  sampleSpeed: async () => {
    try {
      const win = mainWindows()[0];
      const el = win.document.createElementNS('http://www.w3.org/1999/xhtml', 'audio') as HTMLAudioElement;
      const player = createSamplePlayer(() => el);
      await player.play(silentWav(100), 1.5, () => {});
      const playing = { playbackRate: el.playbackRate, defaultPlaybackRate: el.defaultPlaybackRate, preservesPitch: el.preservesPitch };
      player.setRate(2);
      const afterSetRate = el.playbackRate;
      player.stop();
      return JSON.stringify({ startingSpeed: startingSpeed(prefs), playing, afterSetRate }, null, 1);
    } catch (e) {
      return JSON.stringify({ error: String(e) }, null, 1);
    }
  },
  /**
   * The default speed and voice, from every place that holds them: the
   * plugin's memory (what the pane's slider writes; memory-sync reads it on
   * every use and applies the voice while `sameForAllDocuments` is on, the
   * speed while `globalSpeed` is), Zotero's own entry per language, and the
   * manager of every open reader. After
   * the pane's slider is released at 1.8×: `memory.speed` 1.8, every
   * `zotero.<lang>.speed` 1.8, and `speed` 1.8 on every reader — the one
   * that was playing (`active`, not `paused`) changed pace at once. After
   * a voice is picked in one tab's popup: `memory.voice` names it and so
   * does `selectedVoiceID` on every reader that was reading and could take
   * it. Per reader, `docLang` is the document's language as memory-sync
   * knows it (the language the manager was moved to Multiple languages
   * from), and `listsDefault` whether the manager's voice list — loaded at
   * its popup's last open — has the memory's voice at all.
   */
  readAloudMemory: () => {
    const zotero: Record<string, unknown> = {};
    for (const [lang, entry] of Object.entries(readReadAloudVoices(prefs))) {
      zotero[lang] = { region: entry.region ?? null, voice: entry.voice ?? null, speed: entry.speed ?? null, tierVoices: entry.tierVoices ?? {} };
    }
    const remembered = readMemory(prefs).voice?.id ?? null;
    const readers = (Zotero.Reader._readers ?? []).map((r: any) => {
      const manager = () => r?._internalReader?._readAloudManager;
      const lists = (id: string) => {
        const all = manager()?.allVoices;
        const length = typeof all?.length === 'number' ? all.length : 0;
        for (let i = 0; i < length; i++) if (all[i]?.id === id) return true;
        return false;
      };
      return {
        itemID: safe(() => r?.itemID),
        manager: safe(() => !!manager()),
        lang: safe(() => manager()?.lang ?? null),
        docLang: safe(() => readAloudMemory?.documentLanguage(r) ?? null),
        region: safe(() => manager()?.region ?? null),
        speed: safe(() => manager()?.speed ?? null),
        selectedVoiceID: safe(() => manager()?.selectedVoiceID ?? null),
        listsDefault: safe(() => (remembered ? lists(remembered) : null)),
        active: safe(() => !!manager()?.active),
        paused: safe(() => !!manager()?.paused),
      };
    });
    return JSON.stringify(
      {
        memory: safe(() => readMemory(prefs)),
        syncInstalled: !!readAloudMemory,
        sameForAllDocuments: loadSettings(prefs).readAloud.sameForAllDocuments,
        globalSpeed: loadSettings(prefs).readAloud.globalSpeed,
        startingSpeed: startingSpeed(prefs),
        zotero,
        readers,
      },
      null,
      1,
    );
  },
};

Zotero.ZoteroTTS = {
  startup,
  shutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  // The pane runs in this sandbox too, but its module has no reach to the
  // running memory-sync; a default picked there goes to the tabs through this
  prefsPane: { onPaneLoad: (doc: Document) => onPaneLoad(doc, { spreadVoice: (choice) => readAloudMemory?.spreadVoice(choice) }) },
  diagnostics,
};
