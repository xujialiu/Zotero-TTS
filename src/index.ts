import { getChromeWebSocket, newRequestId } from './core/providers/azure';
import { createProvider } from './core/providers/factory';
import { createDaemon, type Daemon, type DaemonProcess } from './core/providers/system/daemon';
import { encodeCommand, WINDOWS_DAEMON_SCRIPT, WINDOWS_POWERSHELL, windowsCommandArguments } from './core/providers/system/daemon-script.win';
import { listSystemVoiceRecords, systemUnavailableReason, type SystemProviderDeps } from './core/providers/system';
import { zoteroVoiceId } from './core/providers/system/voices';
import { createMemoryCache } from './core/memory-cache';
import { audioCacheOn, createZoteroPrefs, DEFAULTS, loadSettings, migrateLegacyProviderPref } from './core/settings';
import { createBackup, flattenSettings, machineSettingsFilename, serializeBackup, SETTINGS_FILE_PATTERN } from './core/settings-backup';
import { createSettingsAutoUpload, type SettingsAutoUpload } from './core/settings-autoupload';
import { machineId } from './core/machine-id';
import { installHijack, nativeInterfaceOf } from './read-aloud';
import { redeliverInterfaces, restoreInterfaces } from './read-aloud/interface-redelivery';
import { createReadAloudMemorySync, type ReadAloudMemorySync } from './read-aloud/memory-sync';
import { createHighlightStyling, type HighlightStyling } from './read-aloud/highlight-style';
import { createSystemVoiceHiding, type SystemVoiceHiding } from './read-aloud/system-voices';
import { createMultilingualFirst, type MultilingualFirst } from './read-aloud/multilingual-first';
import { createPositionSync, ACTIVE_TICK_MS, IDLE_TICK_MS, type PositionSync } from './read-aloud/position-sync';
import { createPositionStore, type PositionStore } from './read-aloud/position-store';
import { createPositionTransport, type PositionTransport } from './read-aloud/position-transport';
import { POSITIONS_FILENAME } from './read-aloud/position-file';
import { createWebDAVClient } from './core/webdav';
import { describePosition, READ_ALOUD_POSITIONS_PREF, readPositions, resumeTarget, type PositionEntry } from './read-aloud/read-aloud-position';
import { readMemory } from './read-aloud/read-aloud-memory';
import { readReadAloudVoices, resolveVoiceLang } from './core/read-aloud-speed';
import { runStartupSteps, type StartupReport } from './core/startup-steps';
import { listNamedCatalog, type CatalogEntry } from './read-aloud/catalog';
import { parseFavoriteVoices } from './read-aloud/favorites';
import { dropdownLanguage, languageDisplayName } from './read-aloud/language-dropdown';
import { decodeVoiceId } from './read-aloud/voice-catalog';
import { isInvisibleSegment } from './read-aloud/invisible-text';
import type { ZoteroVoice } from './read-aloud/zotero-voices';
import {
  createRemoteInterface,
  type NativeRemoteInterface,
  type RemoteInterface,
} from './read-aloud/remote-interface';
import { defaultMachineName, onPaneLoad, registerPrefsPane, TEST_CONNECTION_TIMEOUT_MS, unregisterPrefsPane, zoteroVoiceService } from './ui/prefs-pane';
import {
  createReadAloudShortcuts,
  deepActiveElement,
  isEditableTarget,
  isSpeaking,
  pickReader,
  type ReadAloudShortcuts,
} from './ui/read-aloud-shortcuts';
import { findOptionsButton, hasPlayer, isOptionsPanelOpen } from './ui/player-options';
import { removeSpeedToast, showSpeedToast, showToast } from './ui/speed-toast';
import { browserVoices, createSamplePlayer, defaultVoiceLine, defaultVoiceRows, groupVoicesByTier, languageNameOf, startingSpeed } from './ui/voice-browser-rows';
import { silentWav } from './core/silence';
import { withTimeout } from './core/timeout';

export interface StartupParams {
  id: string;
  version: string;
  rootURI: string;
}

let uninstallHijack: (() => void) | null = null;
/** Which open readers carry this instance's override — shared by the push hook and the redelivery walk, so one uninstall clears both (issue #38). */
let hijackPatched = new WeakSet<object>();
/**
 * Stamped onto every interface this instance builds, under
 * `__zoteroTTSInstance`. The slot never holds the object itself — Zotero
 * clones its options into the reader iframe (xpcom/reader.js:648), and the
 * walks clone the same way — so the `interfaces` diagnostic matches this
 * stamp, which the clone carries and object identity does not (issue #38).
 */
const interfaceInstanceToken = 'instance-' + Math.random().toString(36).slice(2, 10);
let pluginVersion = '0.0.0';
let readAloudShortcuts: ReadAloudShortcuts | null = null;
let readerOpenedListener: ((event: any) => void) | null = null;
let readAloudMemory: ReadAloudMemorySync | null = null;
/** What startup() installed and what it could not (core/startup-steps.ts); null until it has run. */
let startupReport: StartupReport | null = null;
let positionSync: PositionSync | null = null;
let positionStore: PositionStore | null = null;
/** The WebDAV side of the bookmarks (#40); null while tracking is down. */
let positionTransport: PositionTransport | null = null;
/** The syncPositions checkbox's observer token, so flipping it on syncs at once. */
let syncSwitchObserver: unknown = null;
/** Keeps this machine's settings file on the server fresh (#41, core/settings-autoupload.ts). */
let settingsAutoUpload: SettingsAutoUpload | null = null;
/** The raw `Zotero.DBConnection`, kept for diagnostics (path, row count). */
let positionDB: any = null;
let deleteNotifierID: string | null = null;
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

// ---- The operating system's own voices (issue #12) -------------------------
//
// One helper process for the whole session, driven through the framed
// protocol in core/providers/system. Everything Zotero-flavored is here;
// the provider itself knows only the injected shape.

/** How long any one helper request may take: a cold start loads System.Speech (~285 ms), a sentence is 10–100 ms warm. */
const SPEECH_TIMEOUT_MS = 20_000;

let speechDaemon: Daemon | null = null;
/** A daemon ran and was shut down: the platform is fine, this instance stopped — say that, not "platform" (issue #38). */
let speechStopped = false;
/** Distinguishes this Zotero's temp WAVs from another instance's, so a sweep never takes a live one. */
const speechRunId = Math.random().toString(36).slice(2, 10);
let speechFileSeq = 0;

/** Why this platform gets no system voices, or null when it does. Windows only for now: nothing else has been measured. */
function speechUnsupportedReason(): string | null {
  if (!Zotero.isWin) {
    return 'System voices need the Windows speech helper; this build has none for macOS or Linux yet.';
  }
  return null;
}

/**
 * The helper as Subprocess runs it. `pathSearch` cannot find powershell.exe
 * — Zotero's process environment has no PATH (measured 2026-08-29) — so the
 * absolute path is used. The process gets no console window
 * (`MainWindowHandle` 0), which is also why the helper never touches
 * `[Console]::OutputEncoding`. stderr is drained in the background: PowerShell
 * writes CLIXML progress records there, and a full pipe would block it.
 */
async function spawnSpeechHelper(): Promise<DaemonProcess> {
  const { Subprocess } = ChromeUtils.importESModule('resource://gre/modules/Subprocess.sys.mjs');
  const encoded = encodeCommand(WINDOWS_DAEMON_SCRIPT, (binary) => btoa(binary));
  const proc = await Subprocess.call({
    command: WINDOWS_POWERSHELL,
    arguments: windowsCommandArguments(encoded),
    stderr: 'pipe',
  });
  void (async () => {
    try {
      for (;;) {
        const chunk = await proc.stderr.readString();
        if (!chunk) break;
        // CLIXML progress records are normal; anything else is worth the log
        if (!/^#< CLIXML/.test(chunk.trim())) Zotero.debug('[zotero-tts] speech helper stderr: ' + chunk.trim().slice(0, 500));
      }
    } catch {
      // The pipe closes with the process; nothing to report
    }
  })();
  return {
    write: (bytes) => proc.stdin.write(bytes),
    read: async (length) => new Uint8Array(await proc.stdout.read(length)),
    kill: () => proc.kill(),
  };
}

function startSpeechDaemon(): void {
  stopSpeechDaemon();
  speechStopped = false;
  if (speechUnsupportedReason()) return;
  speechDaemon = createDaemon({
    spawn: spawnSpeechHelper,
    timeoutMs: SPEECH_TIMEOUT_MS,
    debug: (message) => Zotero.debug('[zotero-tts] ' + message),
    log: (e) => Zotero.logError(e),
  });
}

function stopSpeechDaemon(): void {
  if (speechDaemon) {
    speechDaemon.stop();
    speechStopped = true;
  }
  speechDaemon = null;
}

/**
 * Temp WAVs a crash left behind. Every synthesis removes its own file in a
 * `finally`, so only an unclean exit leaks one; an hour of age is what
 * distinguishes those from a file another Zotero profile is using right now,
 * which must never be taken from under it.
 */
async function sweepSpeechFiles(): Promise<void> {
  const hourAgo = Date.now() - 3600_000;
  const dir = await PathUtils.tempDir;
  for (const path of await IOUtils.getChildren(dir)) {
    // On the name, not the path: Windows separators are backslashes
    if (!/^zotero-tts-[a-z0-9]+-\d+\.wav$/.test(PathUtils.filename(path))) continue;
    try {
      const stat = await IOUtils.stat(path);
      if (stat.lastModified < hourAgo) await IOUtils.remove(path, { ignoreAbsent: true });
    } catch {
      // A file that vanished or is locked is not this sweep's business
    }
  }
}

/** The plugin sandbox has no AbortController (CLAUDE.md); the diagnostics' one synthesis needs a signal that simply never fires. */
const NEVER_ABORTS = {
  aborted: false,
  addEventListener() {},
  removeEventListener() {},
} as unknown as AbortSignal;

/** The system provider's plumbing: the session's helper, and one temp WAV per sentence. */
function speechDeps(): SystemProviderDeps {
  return {
    daemon: speechDaemon,
    unsupportedReason: systemUnavailableReason({ stopped: speechStopped, platformReason: speechUnsupportedReason() }),
    tempFile: async () => PathUtils.join(await PathUtils.tempDir, `zotero-tts-${speechRunId}-${speechFileSeq++}.wav`),
    readFile: (path) => IOUtils.read(path),
    removeFile: (path) => IOUtils.remove(path, { ignoreAbsent: true }),
    debug: (message) => Zotero.debug('[zotero-tts] ' + message),
  };
}

function providerDeps() {
  return { fetch, getWebSocket: getChromeWebSocket, newRequestId, system: speechDeps() };
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
 *
 * Segments the page does not show are left out (read-aloud/invisible-text.ts):
 * the player refuses them, and warming one would synthesize the very audio
 * that refusal exists to avoid — in the background, where nothing is
 * playing to make the cost visible.
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
      const segment = segments[i];
      const t = segment?.text;
      if (typeof t === 'string' && t && !isInvisibleSegment(segment)) out.push(t);
    }
    return out;
  } catch (e) {
    Zotero.logError(e);
    return [];
  }
}

/**
 * The composite interface for one reader, wrapped for its window: what the
 * push hook hands Zotero when _open() asks, and what the redelivery walk
 * writes into a tab that was already open (issue #38). Stamped with this
 * instance's token so the `interfaces` diagnostic can prove whose interface
 * a tab's slots hold — the slot always holds a clone, never this object.
 */
function buildReaderInterface(reader: any, targetWindow: any, native: () => unknown): unknown {
  const iface = wrapForWindow(
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
          // A popup open begins here: what it has to say about a substitute voice starts afresh
          readAloudMemory?.opening(reader);
          // The popup is open, so the document is rendered and its views exist
          highlightStyling?.attach(reader);
          // The manager exists and this very listing's _resolveVoice has not
          // run yet, so even the first popup open is filtered
          systemVoiceHiding?.attach(reader);
          // The popup renders its language options after the voices arrive,
          // so the label patch is in place for the first open too
          multilingualFirst?.attach(reader);
        },
        // The list this reader is about to receive: the remembered voice is
        // planned against it before Zotero resolves from it (issue #35)
        onVoicesListed: (voices) => readAloudMemory?.reconcile(reader, voices),
        listCatalog,
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
        // Read per call, so the pane applies to a reader that is already open;
        // prefetch keeps it on where the pane never locked it (core/settings.ts audioCacheOn)
        cache: () => (audioCacheOn(loadSettings(prefs)) ? audioCache : undefined),
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
    );
  (iface as Record<string, unknown>).__zoteroTTSInstance = interfaceInstanceToken;
  return iface;
}

function startHijack(): void {
  uninstallHijack?.();
  hijackPatched = new WeakSet();
  // buildReaderInterface only runs when Zotero calls the method; targetWindow
  // is the reader iframe window it passes in — it doesn't exist yet at push
  // time (see Task 13).
  uninstallHijack = installHijack(Zotero.Reader._readers, buildReaderInterface, hijackPatched);
  // The readers already open read their interface from a previous instance
  // at _open() and would keep calling it for the rest of the tab's life
  // (issue #38): hand them this instance's, and rebuild the voice lists
  // they already built.
  redeliverInterfaces({ ...interfaceWalkIO(), patch: patchOpenReader, build: buildForOpenReader });
}

/**
 * The two slots an open tab reads its interface from: loadVoices builds its
 * provider from the manager's construction options on every call
 * (reader.js:82024), and the props pass re-reads the internal reader's
 * field (82832) — so writing both moves listing, audio and the credits UI
 * to the written interface at the tab's next list build. Null while the
 * reader has not finished opening.
 */
function interfaceSlots(reader: any): { options: any; internal: any } | null {
  const internal = reader?._internalReader;
  const options = internal?._readAloudManager?._options;
  return internal && options ? { options, internal } : null;
}

/** The walks' reach into Zotero, shared by redelivery and restore (issue #38). */
function interfaceWalkIO() {
  return {
    readers: () => (Zotero.Reader._readers ?? []) as unknown[],
    isDead: (reader: unknown) => Components.utils.isDeadWrapper(reader),
    isPatched: (reader: any) => hijackPatched.has(reader),
    deliver: (reader: any, iface: unknown) => {
      const slots = interfaceSlots(reader);
      const win = reader?._iframeWindow;
      if (!slots || !win) return false;
      // Zotero hands the reader its options through Cu.cloneInto(...,
      // { cloneFunctions: true }) (xpcom/reader.js:233-648); a raw object
      // written into the slot is unreadable from the reader's compartment
      // ("Security wrapper denied access"), which empties the voice list.
      // Clone exactly as Zotero does; a cleared slot stays null.
      const cloned = iface === null ? null : Components.utils.cloneInto(iface, win, { cloneFunctions: true });
      slots.options.remoteInterface = cloned;
      slots.internal._readAloudRemoteInterface = cloned;
      return true;
    },
    hasVoices: (reader: any) => {
      const voices = reader?._internalReader?._readAloudManager?._allVoices;
      return Array.isArray(voices) && voices.length > 0;
    },
    // Unawaited, as Zotero's own _prepareReadAloud runs it; a rejection is
    // logged rather than left floating
    refreshVoices: (reader: any) => {
      void Promise.resolve(reader._internalReader._readAloudManager.loadVoices(true)).catch((e: unknown) => Zotero.logError(e));
    },
    debug: (message: string) => Zotero.debug('[zotero-tts] ' + message),
    error: (e: unknown) => Zotero.logError(e),
  };
}

/** What the push hook does at push time, for a reader pushed before this instance installed it. */
function patchOpenReader(reader: any): void {
  reader._getReadAloudRemoteInterface = (targetWindow: unknown) => buildReaderInterface(reader, targetWindow, () => nativeInterfaceOf(reader, targetWindow));
  hijackPatched.add(reader);
}

/** The composite interface for a tab that is already open, wrapped for the window it already has. */
function buildForOpenReader(reader: any): unknown | null {
  const win = reader?._iframeWindow;
  return win ? buildReaderInterface(reader, win, () => nativeInterfaceOf(reader, win)) : null;
}

/** Zotero's own interface for a tab that is already open; null when there is no window or no prototype method — the slot is then cleared. */
function nativeForOpenReader(reader: any): unknown | null {
  const win = reader?._iframeWindow;
  return win ? nativeInterfaceOf(reader, win) : null;
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
  // Another machine may have read further since the last sync; a burst of
  // tabs at startup coalesces into one request (position-transport.ts)
  positionTransport?.poke('reader-open');
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

/**
 * One close, one sync. Both close hooks fire for an ordinary tab close —
 * tab.onClose first, reader.uninit later — and each capture is followed by
 * a transport poke; unmarked, a healthy close cost two WebDAV round trips
 * (measured live, 2026-09-01). The tab hook marks the reader; the uninit
 * backstop pokes only for closes the tab hook never saw — separate reader
 * windows, which have no tab.
 */
const closePoked = new WeakSet<object>();

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
      // The capture above is synchronous, so the closing tab's final
      // sentence is already in the sampler's map when this sync reads it
      try {
        closePoked.add(reader);
      } catch {
        // A primitive-ish reader cannot be marked; the uninit poke then runs
      }
      positionTransport?.poke('reader-close');
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
      if (!closePoked.has(reader)) positionTransport?.poke('reader-close');
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

/**
 * What Zotero's resolveLanguage reads as `navigator.languages` when it
 * picks among regional entries of its pref (core/read-aloud-speed.ts): the
 * plugin sandbox has no navigator, so it is read off an open reader's
 * window — the same value in every window, since Firefox derives it from
 * intl.accept_languages. None open: empty, and Zotero's default regions
 * decide, as they do for Zotero when no navigator language matches.
 */
function preferredLanguages(): string[] {
  for (const reader of Zotero.Reader._readers ?? []) {
    try {
      const languages = (reader as any)?._iframeWindow?.navigator?.languages;
      if (languages?.length) return Array.from(languages, String);
    } catch {
      // a window on its way out
    }
  }
  return [];
}

function startReadAloudShortcuts(pluginID: string): void {
  stopReadAloudShortcuts();
  readAloudShortcuts = createReadAloudShortcuts({
    getBindings: () => loadSettings(prefs).shortcuts,
    prefs,
    getManager: readAloudManager,
    preferredLanguages,
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
    // The player's Options button, in the reader's own document: the panel
    // is React state local to Zotero's popup, so there is nothing to call
    // (ui/player-options.ts). No player on screen, no button — the key
    // falls through.
    findOptionsButton: (reader: any) => findOptionsButton(reader?._iframeWindow?.document),
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
    preferredLanguages,
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
    // A prototype whose reader tab has closed: its compartment is nuked and
    // every assignment through it throws, so shutdown skips it (proto-patches.ts)
    isDead: (value) => Components.utils.isDeadWrapper(value),
    // Every favorite, switch or no switch: what a substitute for a voice the list lacks prefers (issue #35)
    favorites: () => parseFavoriteVoices(loadSettings(prefs).readAloud.favoriteVoices),
    // Said where the speed's toast goes, long enough to be read
    announce: (reader, message) => {
      const doc = toastDoc(reader);
      if (doc) showToast(doc, message, undefined, ANNOUNCEMENT_TOAST_MS);
    },
    // The entry staged as the manager's _persistedVoices is destructured by
    // the reader's own code, which may not touch a sandbox object
    cloneForReader: (reader: any, value) => (reader?._iframeWindow ? Components.utils.cloneInto(value, reader._iframeWindow) : value),
    error: (e) => Zotero.logError(e),
    debug: (message) => Zotero.debug('[zotero-tts] ' + message),
  });
  for (const reader of Zotero.Reader._readers ?? []) readAloudMemory.attach(reader);
}

/** How long the line about a substitute voice stays on screen: a sentence, not a "1.3×". */
const ANNOUNCEMENT_TOAST_MS = 5000;

function stopReadAloudMemory(): void {
  readAloudMemory?.dispose();
  readAloudMemory = null;
}

// ---- Where Read Aloud stopped ---------------------------------------------
//
// Zotero keeps this itself but erases it as soon as the user scrolls away
// (reader bundle ~84365); read-aloud/position-sync.ts keeps a copy nothing
// erases — one row per attachment in the plugin's own database,
// `<data directory>/zotero-tts.sqlite` (position-store.ts, #16). Everything
// read from a reader is a read — no reader internals are patched.

/** Bounds the shutdown flush and the close: a wedged write degrades to a lost bookmark, never a hung quit. */
const STORE_SHUTDOWN_TIMEOUT_MS = 3000;

/** Bounds the shutdown push of the positions file: one GET and one PUT on a healthy network; on a dead one the push is lost and the next machine's sync carries on without it. */
const SYNC_SHUTDOWN_TIMEOUT_MS = 8000;

async function startPositionTracking(): Promise<void> {
  await stopPositionTracking();
  // The name form, not a path: it follows the configured data directory
  // (dataDirectory.js:1023) and keeps _externalDB false, which is what buys
  // Zotero's own robustness — WAL, corruption recovery, idle .bak backups —
  // all switched off for absolute-path connections (xpcom/db.js:81-90)
  const db = new Zotero.DBConnection('zotero-tts');
  positionDB = db;
  positionStore = createPositionStore({
    db,
    legacy: {
      read: () => readPositions(prefs),
      clear: () => prefs.clear?.(READ_ALOUD_POSITIONS_PREF),
    },
    // Synchronous map lookups: plugins start in initComplete, after
    // Items._loadIDsAndKeys has run for every library (xpcom/zotero.js:746)
    itemExists: (lib, key) => !!Zotero.Items.getIDFromLibraryAndKey(lib, key),
    libraryExists: (lib) => !!Zotero.Libraries.exists(lib),
    now: () => Date.now(),
    error: (e) => Zotero.logError(e),
  });
  let initial: PositionEntry[] = [];
  try {
    initial = await positionStore.open();
  } catch (e) {
    // Fail loudly, keep going: the sampler runs against the in-memory map,
    // so bookmarks still work for this session — they just do not persist
    Zotero.logError(e);
    Zotero.debug('[zotero-tts] position store failed to open; bookmarks stay in memory this session');
    initial = readPositions(prefs);
  }
  const sync = createPositionSync({
    initial,
    save: (entry) => positionStore?.save(entry),
    retryWrites: () => positionStore?.retry(),
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
  positionSync = sync;
  sync.start();
  // The WebDAV side (#40): every trigger funnels into one single-flight
  // read-merge-write against the shared positions file; with the switch off
  // it costs a boolean read. Deps close over this generation's sampler, so
  // a shutdown flush still sees the final captures after the global clears.
  positionTransport = createPositionTransport({
    enabled: () => loadSettings(prefs).webdav.syncPositions,
    client: () => createWebDAVClient(loadSettings(prefs).webdav, { fetch }),
    local: () => sync.list(),
    adopt: (entry) => sync.adopt(entry),
    itemExists: (lib, key) => !!Zotero.Items.getIDFromLibraryAndKey(lib, key),
    libraryExists: (lib) => !!Zotero.Libraries.exists(lib),
    now: () => Date.now(),
    error: (e) => Zotero.logError(e),
    debug: (message) => Zotero.debug('[zotero-tts] ' + message),
  });
  positionTransport.poke('startup');
  // Ticking the checkbox syncs right away — the user is at the pane,
  // watching for exactly that; without this the first sync would wait for
  // the next opened or closed tab
  try {
    syncSwitchObserver = Zotero.Prefs.registerObserver('zotero-tts.webdav.syncPositions', () => {
      if (loadSettings(prefs).webdav.syncPositions) positionTransport?.poke('switch-on');
    });
  } catch (e) {
    Zotero.logError(e);
  }
  startCloseTrace();
  startDeletionObserver();
}

async function stopPositionTracking(): Promise<void> {
  stopDeletionObserver();
  stopCloseTrace();
  unhookTabCloses();
  unhookPositionCaptures();
  positionSync?.stop(); // the final reads become queued saves
  positionSync = null;
  if (syncSwitchObserver !== null) {
    try {
      Zotero.Prefs.unregisterObserver(syncSwitchObserver);
    } catch {
      // Already gone at shutdown
    }
    syncSwitchObserver = null;
  }
  const transport = positionTransport;
  positionTransport = null;
  if (transport) {
    // The session's final positions go up before the store closes; the
    // transport's deps hold this generation's sampler, so the captures the
    // stop() above just made are what it reads
    try {
      await withTimeout(transport.flush('shutdown'), SYNC_SHUTDOWN_TIMEOUT_MS, () => new Error('zotero-tts: position sync flush timed out at shutdown'));
    } catch (e) {
      Zotero.logError(e);
    }
  }
  const store = positionStore;
  positionStore = null;
  positionDB = null;
  if (!store) return;
  // Drain, then close, each bounded: Sqlite.sys.mjs blocks
  // profile-before-change on every open connection, so a leaked one turns
  // quitting Zotero into a 60-second AsyncShutdown hang and a crash report.
  // The close runs even when the drain fails or times out.
  try {
    await withTimeout(store.drain(), STORE_SHUTDOWN_TIMEOUT_MS, () => new Error('zotero-tts: position flush timed out at shutdown'));
  } catch (e) {
    Zotero.logError(e);
  } finally {
    try {
      await withTimeout(store.close(), STORE_SHUTDOWN_TIMEOUT_MS, () => new Error('zotero-tts: position store close timed out'));
    } catch (e) {
      Zotero.logError(e);
    }
  }
}

/**
 * Rows follow permanent deletion. Zotero queues `('delete', 'item', ids,
 * extraData)` with `extraData[id] = { libraryID, key }` — exactly the
 * store's primary key, put there because the object is gone by notification
 * time (xpcom/data/dataObject.js:1446-1489). Erasing a parent item erases
 * each child attachment through its own `erase()`, so children notify too
 * (item.js:5573-5583); Empty Trash and sync-driven deletions take the same
 * path. Trashing is a different event and clears nothing — a trashed item
 * can be restored, and its bookmark must survive.
 *
 * `notify` stays synchronous: Zotero awaits every observer
 * (xpcom/notifier.js:167), so the deletion goes into the store's write
 * queue — the same serialized queue as saves, so a captureClose racing the
 * deletion cannot resurrect the row.
 */
function startDeletionObserver(): void {
  if (deleteNotifierID !== null) return;
  try {
    deleteNotifierID = Zotero.Notifier.registerObserver(
      {
        notify: (event: string, _type: string, ids: unknown[], extraData: any) => {
          if (event !== 'delete') return;
          for (const id of ids ?? []) {
            try {
              const gone = extraData?.[id as never];
              const lib = gone?.libraryID;
              const key = gone?.key;
              if (typeof lib === 'number' && typeof key === 'string' && key) positionStore?.remove(lib, key);
            } catch (e) {
              Zotero.logError(e);
            }
          }
        },
      },
      ['item'],
      'zotero-tts-positions',
    );
  } catch (e) {
    Zotero.logError(e);
  }
}

function stopDeletionObserver(): void {
  if (deleteNotifierID === null) return;
  try {
    Zotero.Notifier.unregisterObserver(deleteNotifierID);
  } catch {
    // Already gone at shutdown
  }
  deleteNotifierID = null;
}

// ---- This machine's settings file, kept fresh on the server (#41) ----------
//
// Settings cannot merge, so every machine writes only its own
// zotero-tts-settings_<id>.json (core/machine-id.ts) — upload only, the
// debounce and gating in core/settings-autoupload.ts. Applying remote
// settings stays a manual act in the pane (ui/webdav-rows.ts).

function startSettingsAutoUpload(): void {
  stopSettingsAutoUpload();
  settingsAutoUpload = createSettingsAutoUpload({
    enabled: () => loadSettings(prefs).webdav.autoUploadSettings,
    // Every settings pref there is; the observer names are relative to extensions.zotero.
    keys: Object.keys(flattenSettings(DEFAULTS)).map((key) => 'zotero-tts.' + key),
    registerObserver: (name, handler) => Zotero.Prefs.registerObserver(name, handler),
    unregisterObserver: (token) => Zotero.Prefs.unregisterObserver(token),
    upload: async () => {
      const id = machineId(prefs, defaultMachineName);
      const name = machineSettingsFilename(id);
      const backup = createBackup(prefs, { pluginVersion, exportedAt: new Date().toISOString(), machine: id });
      const client = createWebDAVClient(loadSettings(prefs).webdav, { fetch });
      await client.upload(name, serializeBackup(backup));
      return { name, count: Object.keys(backup.settings).length };
    },
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (handle: any) => clearTimeout(handle),
    now: () => Date.now(),
    error: (e) => Zotero.logError(e),
    debug: (message) => Zotero.debug('[zotero-tts] ' + message),
  });
  settingsAutoUpload.start();
}

function stopSettingsAutoUpload(): void {
  settingsAutoUpload?.stop();
  settingsAutoUpload = null;
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
    isDead: (value) => Components.utils.isDeadWrapper(value),
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
    exportFunction: (fn, target) => Components.utils.exportFunction(fn, target),
    waiveXrays: (value) => ((value && typeof value === 'object') || typeof value === 'function' ? Components.utils.waiveXrays(value) : value),
    isDead: (value) => Components.utils.isDeadWrapper(value),
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
    isDead: (value) => Components.utils.isDeadWrapper(value),
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
  // Each step on its own (core/startup-steps.ts): a Zotero internal that
  // moved, a pane id already taken, a database that will not open — any of
  // them costs what that step installs and nothing else, lands in the
  // error console, and shows in diagnostics.startup() (issue #25: the pane
  // was the one unguarded call, and its failure took everything down)
  startupReport = await runStartupSteps(
    [
      [
        'legacy provider setting',
        () => {
          if (migrateLegacyProviderPref(prefs)) Zotero.debug('[zotero-tts] migrated the single-provider setting');
        },
      ],
      ['settings pane', () => registerPrefsPane(rootURI, id, version)],
      ['Read Aloud memory', startReadAloudMemory],
      // Awaited: the database rows must be in memory before the sampler and
      // the resume path run; open-failure is handled inside (in-memory mode)
      ['reading-position store', startPositionTracking],
      ['settings auto-upload', startSettingsAutoUpload],
      ['highlight colors', startHighlightStyling],
      [
        'system speech helper',
        () => {
          startSpeechDaemon();
          // Nothing waits on the sweep; a crash's leftovers are not urgent
          void sweepSpeechFiles().catch((e) => Zotero.debug('[zotero-tts] temp sweep skipped: ' + e));
        },
      ],
      ['system-voice hiding', startSystemVoiceHiding],
      ['Multiple-languages-first ordering', startMultilingualFirst],
      ['Read Aloud hook', startHijack],
      ['Read Aloud shortcuts', () => startReadAloudShortcuts(id)],
    ],
    (name, e) => {
      Zotero.logError(e);
      Zotero.debug(`[zotero-tts] failed to install the ${name}: ${e}`);
    },
  );
  const { failed } = startupReport;
  Zotero.debug(failed.length ? `[zotero-tts] started without the ${failed.join(', ')}` : '[zotero-tts] started');
}

async function shutdown(reason?: number): Promise<void> {
  // First: the pane goes with this instance, not with Zotero's observer,
  // which runs too late for the next instance's register on a reload (#28)
  try {
    unregisterPrefsPane();
  } catch (e) {
    Zotero.logError(e);
  }
  // A disable or uninstall would strand every open tab on this stopped
  // instance's interface (issue #38): hand them back to Zotero's own first.
  // An upgrade or downgrade leaves them alone — the successor redelivers,
  // and a voice-list rebuild from here would race the one it starts. At
  // app shutdown the tabs are going down with Zotero.
  if (reason === ADDON_DISABLE || reason === ADDON_UNINSTALL) {
    try {
      restoreInterfaces({ ...interfaceWalkIO(), buildNative: nativeForOpenReader });
    } catch (e) {
      Zotero.logError(e);
    }
  }
  uninstallHijack?.();
  uninstallHijack = null;
  stopReadAloudShortcuts();
  // A settings change still inside its quiet period goes up now, bounded;
  // then the observers come off
  const auto = settingsAutoUpload;
  settingsAutoUpload = null;
  if (auto) {
    try {
      await withTimeout(auto.flush(), SYNC_SHUTDOWN_TIMEOUT_MS, () => new Error('zotero-tts: settings auto-upload flush timed out at shutdown'));
    } catch (e) {
      Zotero.logError(e);
    }
    auto.stop();
  }
  // Awaited: the final bookmarks flush to the database and the connection
  // closes before Zotero goes on shutting down (plugins.js awaits us)
  await stopPositionTracking();
  stopReadAloudMemory();
  stopHighlightStyling();
  stopSpeechDaemon();
  stopSystemVoiceHiding();
  stopMultilingualFirst();
  Zotero.debug('[zotero-tts] stopped' + (reason !== undefined ? ` (reason ${reason})` : ''));
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
  /**
   * Whether this instance actually started: the outcome of every startup
   * step (core/startup-steps.ts), `failed` empty when all of it is
   * installed. `Zotero.ZoteroTTS` existing proves only that the bundle was
   * evaluated — it is assigned below, before startup() ever runs (issue #25).
   */
  startup: () => JSON.stringify({ version: pluginVersion, ...(startupReport ?? { steps: null, failed: null }) }, null, 1),
  highlight: () => JSON.stringify((Zotero.Reader._readers ?? []).map((r: any) => highlightStyling?.inspect(r) ?? null), null, 1),
  systemVoices: () => JSON.stringify((Zotero.Reader._readers ?? []).map((r: any) => systemVoiceHiding?.inspect(r) ?? null), null, 1),
  /**
   * The key of Zotero's reader.readAloudVoices pref a language resolves to,
   * through the shipped resolver (Zotero's resolveLanguage ported, issue
   * #26): `keys` default to the pref's own, `preferred` to what the reader
   * window's navigator.languages says. Run beside Zotero's function over
   * the same inputs, the two must agree.
   */
  resolveVoiceLang: (lang: string, keys?: string[], preferred?: string[]) => {
    const k = keys ?? Object.keys(readReadAloudVoices(prefs));
    const p = preferred ?? preferredLanguages();
    return JSON.stringify({ lang, keys: k, preferred: p, key: resolveVoiceLang(lang, k, p) });
  },
  multilingualFirst: () => JSON.stringify((Zotero.Reader._readers ?? []).map((r: any) => multilingualFirst?.inspect(r) ?? null), null, 1),
  /**
   * The undo logs of the four modules that shadow a reader-side prototype
   * (read-aloud/proto-patches.ts): `total` entries held, `live` of them
   * belonging to a tab that is still open. They used to drift apart by one
   * tab's worth of entries per closed tab, and shutdown logged a dead
   * object for each of those (issue #5); now `total` follows the open tabs.
   */
  patches: () =>
    JSON.stringify(
      {
        readers: (Zotero.Reader._readers ?? []).length,
        highlight: safe(() => highlightStyling?.patchCounts()) ?? null,
        systemVoices: safe(() => systemVoiceHiding?.patchCounts()) ?? null,
        multilingualFirst: safe(() => multilingualFirst?.patchCounts()) ?? null,
        readAloudMemory: safe(() => readAloudMemory?.patchCounts()) ?? null,
        // Which instance serves each tab (issue #38): `hijacked` — the
        // reader carries this instance's own method; `slotsCurrent` — both
        // stored slots hold a clone stamped by this instance. A tab
        // upgraded over used to show hijacked: false while speaking with
        // the stopped instance's voice.
        interfaces: (Zotero.Reader._readers ?? []).map((r: any) => ({
          itemID: safe(() => r?.itemID),
          hijacked: safe(() => Object.prototype.hasOwnProperty.call(r, '_getReadAloudRemoteInterface')) === true,
          slotsPresent: safe(() => !!interfaceSlots(r)) === true,
          slotsCurrent:
            safe(() => {
              const slots = interfaceSlots(r);
              if (!slots) return false;
              const stamp = (o: any) => o?.__zoteroTTSInstance;
              return stamp(slots.options.remoteInterface) === interfaceInstanceToken && stamp(slots.internal._readAloudRemoteInterface) === interfaceInstanceToken;
            }) === true,
        })),
      },
      null,
      1,
    ),
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
   * The Options key (Shift+O) as the plugin sees it: for every reader,
   * whether the player is on screen, whether its Options button was found,
   * and whether the panel is unfolded. `playerOptions(true)` runs the very
   * toggle the key runs and reports the panel state before and after — the
   * press is proved by `expanded` flipping, never by the panel looking
   * right (CLAUDE.md, verify by mechanism).
   */
  playerOptions: async (press = false) => {
    const docOf = (r: any) => {
      try {
        return r?._iframeWindow?.document ?? null;
      } catch {
        return null;
      }
    };
    const state = (r: any) => {
      const doc = docOf(r);
      return {
        player: safe(() => hasPlayer(doc)) === true,
        button: safe(() => !!findOptionsButton(doc)) === true,
        expanded: safe(() => isOptionsPanelOpen(doc)) === true,
      };
    };
    const readers: unknown[] = [];
    for (const r of Zotero.Reader._readers ?? []) {
      const before = state(r);
      let toggled: unknown = 'not pressed';
      let after: unknown = null;
      if (press) {
        toggled = safe(() => readAloudShortcuts?.toggleOptions(r));
        // React flushes its re-render on the click itself; a tick costs nothing and rules the timing out
        await new Promise((resolve) => setTimeout(resolve, 50));
        after = state(r);
      }
      readers.push({ itemID: safe(() => r?.itemID), before, toggled, after });
    }
    return JSON.stringify({ shortcut: loadSettings(prefs).shortcuts.toggleOptions, readers }, null, 1);
  },
  /**
   * The stored Read Aloud positions and what the sampler sees right now.
   * `zoteroSaved` is Zotero's own copy — it goes null once the user scrolls
   * away, which is exactly what `stored` is here to survive.
   */
  position: async () => {
    safe(() => positionSync?.sample());
    const readers = (Zotero.Reader._readers ?? []).map((r: any) => ({
      itemID: safe(() => r?.itemID),
      attachment: safe(() => {
        const item = r?.itemID ? Zotero.Items.get(r.itemID) : null;
        return item ? item.libraryID + '/' + item.key : null;
      }),
      active: safe(() => !!r?._internalReader?._readAloudManager?.active),
      // Described, not dumped: Zotero's copy is the full merged-line rect
      // list — one such object measured 100 KB (#14)
      zoteroSaved: safe(() => {
        const p = r?._internalReader?._state?.readAloudState?.savedPosition;
        return p === null || p === undefined ? null : describePosition(p);
      }),
      // Ours is the normalized resume point — small enough to show whole
      stored: safe(() => positionSync?.lookup(r)),
    }));
    // The file-level facts that verify a build by rows on disk (#16):
    // read through the live connection, never through sqlite3 — WAL +
    // exclusive locking keeps out-of-process readers out
    let database: unknown;
    try {
      const db = positionDB;
      if (!db) database = 'not started';
      else {
        const path = String(db.path ?? '');
        let fileBytes: unknown = null;
        try {
          fileBytes = (await IOUtils.stat(path)).size;
        } catch (e) {
          fileBytes = String(e);
        }
        database = {
          path,
          userVersion: Number(await db.valueQueryAsync('PRAGMA user_version')),
          rows: Number(await db.valueQueryAsync('SELECT COUNT(*) FROM positions')),
          fileBytes,
        };
      }
    } catch (e) {
      database = String(e);
    }
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
        // The queue and the import/sweep/load counters — never row contents
        store: safe(() => positionStore?.stats() ?? 'not started'),
        database,
        // Gone after the first run of this version; entries here mean the
        // import has not happened (or the pref was written by a 1.9.x again)
        legacyPref: safe(() => {
          const raw = prefs.get(READ_ALOUD_POSITIONS_PREF);
          return typeof raw === 'string' ? { chars: raw.length, entries: readPositions(prefs).length } : null;
        }),
        readers,
      },
      null,
      1,
    );
  },
  /**
   * The WebDAV side of the bookmarks (#40): whether the switch and the
   * server are set, and what the last sync did — trigger, outcome, counts.
   * `adopted` counts entries taken from other machines; `uploaded` says
   * whether the merged union went back up. A build is proved by this report
   * changing across a poke, never by the server's file looking right.
   */
  positionSync: () => {
    const webdav = loadSettings(prefs).webdav;
    return JSON.stringify(
      {
        enabled: webdav.syncPositions,
        configured: !!webdav.url,
        localEntries: safe(() => positionSync?.list().length ?? null),
        transport: safe(() => positionTransport?.stats() ?? 'not started'),
      },
      null,
      1,
    );
  },
  /**
   * The settings side of the sync (#41): this machine's id and file name,
   * and what the auto-upload last did — pending, outcome, count. A build is
   * proved by `autoUpload.uploads` rising after a settings change with the
   * switch on, never by the server's file looking fresh.
   */
  settingsUpload: () => {
    const webdav = loadSettings(prefs).webdav;
    const id = safe(() => machineId(prefs, defaultMachineName));
    return JSON.stringify(
      {
        enabled: webdav.autoUploadSettings,
        configured: !!webdav.url,
        machine: id,
        filename: typeof id === 'string' ? machineSettingsFilename(id) : null,
        autoUpload: safe(() => settingsAutoUpload?.stats() ?? 'not started'),
      },
      null,
      1,
    );
  },
  /**
   * What the server's folder holds of ours, through the same list the
   * Restore button runs: every settings file with its machine id and date,
   * and the positions file. The pull picker cannot be driven from here —
   * it is a modal dialog — so this is how a listing is proved headlessly.
   */
  settingsFiles: async () => {
    try {
      const client = createWebDAVClient(loadSettings(prefs).webdav, { fetch });
      const files = (await client.list()).filter((f) => SETTINGS_FILE_PATTERN.test(f.name) || f.name === POSITIONS_FILENAME);
      return JSON.stringify({ url: client.url, files }, null, 1);
    } catch (e) {
      return JSON.stringify({ error: String(e) }, null, 1);
    }
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
   * The system-voice provider, proved by its own mechanism rather than by
   * the list looking right: the helper's state, the voices it enumerates
   * with the id each maps onto in Zotero's own list, and — with a voice id
   * — one real synthesis, reporting the audio's length, the engine's word
   * marks and the timestamps they became. `words: 0` with `marks` above zero
   * is the SAPI rate trap (core/providers/system/daemon-script.win.ts): the
   * engine's timeline is not the file's and the marks were dropped rather
   * than drawn in the wrong place.
   */
  systemProvider: async (voice?: string) => {
    const settings = loadSettings(prefs);
    const out: Record<string, unknown> = {
      enabled: settings.system.enabled,
      platform: Zotero.isWin ? 'win' : Zotero.isMac ? 'mac' : 'other',
      unsupported: speechUnsupportedReason(),
      daemon: speechDaemon ? speechDaemon.state() : null,
    };
    try {
      const records = await listSystemVoiceRecords(speechDeps());
      out.voices = records.map((r) => ({ id: r.id, name: r.name, lang: r.lang, zoteroId: zoteroVoiceId(r) }));
    } catch (e) {
      out.voicesError = String(e);
    }
    if (voice) {
      try {
        const text = 'Read Aloud gives Zotero a voice, and this plugin gives it more.';
        const provider = createProvider('system', settings, providerDeps());
        const started = Date.now();
        const result = await provider.synthesize(text, { voice, signal: NEVER_ABORTS });
        out.synthesis = {
          ms: Date.now() - started,
          bytes: result.audio.size,
          type: result.audio.type,
          words: result.timestamps?.length ?? 0,
          note: result.note ?? null,
          first: result.timestamps?.slice(0, 3).map((t) => ({ ...t, text: text.slice(t.charStart, t.charEnd) })),
          last: result.timestamps?.[result.timestamps.length - 1],
        };
      } catch (e) {
        out.synthesisError = String(e);
      }
    }
    if (speechDaemon) out.daemonAfter = speechDaemon.state();
    return JSON.stringify(out, null, 1);
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
   * from), `listsDefault` whether the manager's voice list — loaded at
   * its popup's last open — has the memory's voice at all, and
   * `substitution` what the last sync did when it did not: the voice that
   * was not offered and the Local voice put in its place for that open
   * (`instead` null: none was offered, Zotero's own choice stands); null
   * when the memory's voice was offered (issue #35).
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
        selectedTier: safe(() => manager()?.selectedTier ?? null),
        listsDefault: safe(() => (remembered ? lists(remembered) : null)),
        substitution: safe(() => readAloudMemory?.substitution(r) ?? null),
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
  prefsPane: {
    onPaneLoad: (doc: Document) =>
      onPaneLoad(doc, {
        spreadVoice: (choice) => readAloudMemory?.spreadVoice(choice),
        // A rewrite of Zotero's voices pref that is not a pick must not be learned as one
        applySilently: (fn) => (readAloudMemory ? readAloudMemory.applySilently(fn) : fn()),
        // The speech helper is one process for the whole of Zotero, so the
        // pane's samples and checks must use this session's, not one of their own
        providerDeps,
        // The Backup group's positions pair (#41): the live sampler's map,
        // and a merge in through the same adopt the WebDAV sync uses —
        // existence-filtered, only the strictly newer taken
        positionsIO: {
          list: () => positionSync?.list() ?? [],
          importEntries: (entries) => {
            let taken = 0;
            for (const entry of entries) {
              try {
                if (!Zotero.Libraries.exists(entry.lib) || !Zotero.Items.getIDFromLibraryAndKey(entry.lib, entry.key)) continue;
              } catch {
                continue;
              }
              if (positionSync?.adopt(entry)) taken++;
            }
            // What was just merged should reach the other machines too
            positionTransport?.poke('import');
            return taken;
          },
        },
        // The machine-id rename should reach the server soon (#41)
        settingsUploadSoon: () => settingsAutoUpload?.changed(),
      }),
  },
  diagnostics,
};
