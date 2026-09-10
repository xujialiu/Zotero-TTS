import { getChromeWebSocket, newRequestId } from './core/providers/azure';
import { createProvider } from './core/providers/factory';
import type { SpeechBackend } from './core/providers/system/backend';
import { createDaemon, type DaemonProcess } from './core/providers/system/daemon';
import { encodeCommand, WINDOWS_DAEMON_SCRIPT, WINDOWS_POWERSHELL, windowsCommandArguments } from './core/providers/system/daemon-script.win';
import { createMacBackend, type MacProcess } from './core/providers/system/mac';
import { listSystemVoiceRecords, systemUnavailableReason, type SystemProviderDeps } from './core/providers/system';
import { zoteroVoiceId } from './core/providers/system/voices';
import { FTL_FILE, hasMessageSource, sentences, setMessageSource, t } from './core/l10n';
import { installOwnSource, OWN_SOURCE_NAME, unregisterOwnSource } from './core/l10n-source';
import { createMemoryCache } from './core/memory-cache';
import { audioCacheOn, createZoteroPrefs, DEFAULTS, loadSettings, migrateLegacyProviderPref, PREF_PREFIX } from './core/settings';
import { createBackup, flattenSettings, machineSettingsFilename, serializeBackup, SETTINGS_FILE_PATTERN } from './core/settings-backup';
import { createSettingsAutoUpload, type SettingsAutoUpload } from './core/settings-autoupload';
import { machineId } from './core/machine-id';
import { createSettingsSyncTransport, type SettingsSyncApplied, type SettingsSyncTransport } from './core/settings-sync-transport';
import {
  heldSections,
  parseSharedSettings,
  readSyncState,
  SHARED_SETTINGS_FILENAME,
  SYNC_SETTINGS_OBSERVER,
  SYNCABLE_KEYS,
  writeSyncState,
  type SyncState,
} from './core/settings-sync';
import { installHijack, nativeInterfaceOf } from './read-aloud';
import { createPlayerStop, isPlayerOpen } from './read-aloud/player-stop';
import { forgetViewReadAloudState, readAloudViewKind, type ReadAloudViewKind } from './read-aloud/return-to-spoken';
import { redeliverInterfaces, restoreInterfaces } from './read-aloud/interface-redelivery';
import { createReadAloudMemorySync, type ReadAloudMemorySync } from './read-aloud/memory-sync';
import { createHighlightStyling, type HighlightStyling } from './read-aloud/highlight-style';
import { createSentenceInView, type SentenceInView } from './read-aloud/sentence-in-view';
import { createSystemVoiceHiding, type SystemVoiceHiding } from './read-aloud/system-voices';
import { createMultilingualFirst, type MultilingualFirst } from './read-aloud/multilingual-first';
import { createFavoriteMarks, type FavoriteMarks } from './read-aloud/favorite-marks';
import { createPauses, pauseSettingsOf, type Pauses } from './read-aloud/pauses';
import { createUnchangedVoice, type UnchangedVoice } from './read-aloud/unchanged-voice';
import { createVolumeControl, type VolumeControl } from './read-aloud/volume';
import { settleVolumePref, VOLUME_OBSERVER } from './core/read-aloud-volume';
import { HIGHLIGHT_LEVEL_PREF, type HighlightLevel, type WordTiming } from './core/highlight-level';
import { createPositionSync, ACTIVE_TICK_MS, IDLE_TICK_MS, type PositionSync } from './read-aloud/position-sync';
import { createPositionStore, type PositionStore } from './read-aloud/position-store';
import { createPositionTransport, type PositionTransport } from './read-aloud/position-transport';
import { POSITIONS_FILENAME } from './read-aloud/position-file';
import { createWebDAVClient } from './core/webdav';
import { describePosition, READ_ALOUD_POSITIONS_PREF, readPositions, resumeTarget, type PositionEntry } from './read-aloud/read-aloud-position';
import { readMemory } from './read-aloud/read-aloud-memory';
import { readReadAloudVoices, resolveVoiceLang } from './core/read-aloud-speed';
import { runStartupSteps, type StartupReport } from './core/startup-steps';
import { CATALOG_CAP_MS, listNamedCatalog, type CatalogEntry } from './read-aloud/catalog';
import { FAVORITES_OBSERVER, FAVORITES_ONLY_OBSERVER, parseFavoriteVoices } from './read-aloud/favorites';
import { dropdownLanguage, languageDisplayName } from './read-aloud/language-dropdown';
import { decodeVoiceId } from './read-aloud/voice-catalog';
import { isInvisibleSegment } from './read-aloud/invisible-text';
import type { ZoteroVoice } from './read-aloud/zotero-voices';
import {
  createRemoteInterface,
  type NativeRemoteInterface,
  type RemoteInterface,
} from './read-aloud/remote-interface';
import { defaultMachineName, onPaneLoad, registerPrefsPane, runConnectionCheck, unregisterPrefsPane, zoteroVoiceService } from './ui/prefs-pane';
import {
  createReadAloudShortcuts,
  deepActiveElement,
  isEditableTarget,
  isSpeaking,
  pickReader,
  type ReadAloudShortcuts,
} from './ui/read-aloud-shortcuts';
import { findOptionsButton, hasPlayer, isOptionsPanelOpen } from './ui/player-options';
import { removeSpeedToast, showSpeedToast, showToast, SPEED_TOAST_ID } from './ui/speed-toast';
import { browserVoices, createSamplePlayer, defaultVoiceRows, groupVoicesByTier, languageNameOf, listBrowserVoices, startingSpeed, statusLine, tierLabel } from './ui/voice-browser-rows';
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
/**
 * Every player that is open, in every window (read-aloud/player-stop.ts):
 * what the stop key closes and the `players` diagnostic reports. The pane
 * builds its own for the reading guard (ui/prefs-pane.ts); neither holds
 * state.
 */
const playerStop = createPlayerStop<any>({ readers: () => Zotero.Reader._readers ?? [], log: (e) => Zotero.logError(e) });
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
/** Carries the settings both ways over the folder (#68, core/settings-sync-transport.ts); null while stopped. */
let settingsSyncTransport: SettingsSyncTransport | null = null;
/** The syncSettings checkbox's observer token, so flipping it on syncs at once. */
let settingsSyncSwitchObserver: unknown = null;
/** What the pane registers to hear every completed settings sync (ui/sync-status-rows.ts). */
const settingsSyncListeners = new Set<(report: SettingsSyncApplied | null) => void>();
/** The raw `Zotero.DBConnection`, kept for diagnostics (path, row count). */
let positionDB: any = null;
let deleteNotifierID: string | null = null;
let highlightStyling: HighlightStyling | null = null;
/** The whole sentence on screen while a PDF is followed (read-aloud/sentence-in-view.ts, issue #83). */
let sentenceInView: SentenceInView | null = null;
let systemVoiceHiding: SystemVoiceHiding | null = null;
let multilingualFirst: MultilingualFirst | null = null;
let favoriteMarks: FavoriteMarks | null = null;
/** The two prefs the marks follow, unregistered at shutdown. */
let favoriteMarkObservers: unknown[] = [];
/** The pauses between sentences and before paragraphs, for every voice (read-aloud/pauses.ts, issue #44). */
let pauses: Pauses | null = null;
/** How loud Read Aloud plays, for every voice (read-aloud/volume.ts, issue #62), and the pref observer that moves every open chain. */
let volumeControl: VolumeControl | null = null;
/** A voice list landing on the voice already playing keeps the controller (read-aloud/unchanged-voice.ts, issue #75). */
let unchangedVoice: UnchangedVoice | null = null;
let volumeObserver: unknown = null;

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

// ---- The operating system's own voices (issues #12, #23) ------------------
//
// One backend for the whole session (core/providers/system/backend.ts): on
// Windows the helper process driven through the framed protocol, on macOS a
// `say` per sentence and an `osascript` per listing. Everything
// Zotero-flavored is here; the provider itself knows only the injected shape.

/** How long any one backend request may take: a cold Windows start loads System.Speech (~285 ms) and a warm sentence is 10–100 ms; `say` is 0.3–0.6 s per sentence, 2.5 s cold. */
const SPEECH_TIMEOUT_MS = 20_000;

let speechBackend: SpeechBackend | null = null;
/** A backend ran and was shut down: the platform is fine, this instance stopped — say that, not "platform" (issue #38). */
let speechStopped = false;
/** Distinguishes this Zotero's temp WAVs from another instance's, so a sweep never takes a live one. */
const speechRunId = Math.random().toString(36).slice(2, 10);
let speechFileSeq = 0;

/** Why this platform gets no system voices, or null when it does: Windows and macOS have a backend, Linux has none. */
function speechUnsupportedReason(): string | null {
  if (Zotero.isWin || Zotero.isMac) return null;
  return t('ztts-system-unsupported');
}

/**
 * The Windows helper as Subprocess runs it. `pathSearch` cannot find
 * powershell.exe — Zotero's process environment has no PATH (measured
 * 2026-08-29) — so the absolute path is used. The process gets no console
 * window (`MainWindowHandle` 0), which is also why the helper never touches
 * `[Console]::OutputEncoding`. stderr is drained in the background:
 * PowerShell writes CLIXML progress records there, and a full pipe would
 * block it.
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

/**
 * One macOS process run to its end (core/providers/system/mac.ts):
 * `Subprocess.call` with an absolute path, both pipes drained chunk by
 * chunk — `readString()` without a length answers the next chunk, at most
 * 32 KiB, and an empty string at EOF (subprocess_common.sys.mjs:520; the
 * 37 KB voice list was cut short by a single read, measured 2026-09-06) —
 * and `wait()` for the exit code. `kill` is what the backend's timeout calls.
 */
async function runMacProcess(command: string, args: string[]): Promise<MacProcess> {
  const { Subprocess } = ChromeUtils.importESModule('resource://gre/modules/Subprocess.sys.mjs');
  const proc = await Subprocess.call({ command, arguments: args, stderr: 'pipe' });
  const drain = async (pipe: { readString(): Promise<string> }): Promise<string> => {
    let out = '';
    try {
      for (;;) {
        const chunk = await pipe.readString();
        if (!chunk) break;
        out += chunk;
      }
    } catch {
      // The pipe closed with the process; what was read is what there is
    }
    return out;
  };
  const output = (async () => {
    const [stdout, stderr, exit] = await Promise.all([drain(proc.stdout), drain(proc.stderr), proc.wait() as Promise<{ exitCode: number }>]);
    return { exitCode: exit.exitCode, stdout, stderr };
  })();
  return { output, kill: () => void proc.kill() };
}

function startSpeechBackend(): void {
  stopSpeechBackend();
  speechStopped = false;
  if (speechUnsupportedReason()) return;
  const debug = (message: string) => Zotero.debug('[zotero-tts] ' + message);
  speechBackend = Zotero.isMac
    ? createMacBackend({ run: runMacProcess, timeoutMs: SPEECH_TIMEOUT_MS, debug })
    : createDaemon({ spawn: spawnSpeechHelper, timeoutMs: SPEECH_TIMEOUT_MS, debug, log: (e) => Zotero.logError(e) });
}

function stopSpeechBackend(): void {
  if (speechBackend) {
    speechBackend.stop();
    speechStopped = true;
  }
  speechBackend = null;
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

/** The system provider's plumbing: the session's backend, and one temp WAV per sentence. */
function speechDeps(): SystemProviderDeps {
  return {
    backend: speechBackend,
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

/**
 * An AbortController from a chrome window, for a listing request the
 * catalog has to cancel once it runs past its bound (read-aloud/catalog.ts,
 * issue #55): the plugin sandbox has none (CLAUDE.md), and no reader is at
 * hand where the pane and the diagnostics list. Per call, never cached, so
 * a closed window is never retained; null when no window is up, and the
 * request is then left to finish on its own — the bound is what matters.
 */
function newChromeAbortController(): AbortController | null {
  const win = Zotero.getMainWindow() ?? Services.wm.getMostRecentWindow(null);
  return typeof win?.AbortController === 'function' ? new win.AbortController() : null;
}

/** The voices of every enabled provider; one failing, or not answering within its bound, is logged and skipped, not fatal. */
async function listCatalog(): Promise<CatalogEntry[]> {
  const settings = loadSettings(prefs);
  return listNamedCatalog(settings, (id) => createProvider(id, settings, providerDeps()), (e) => Zotero.logError(e), {
    newAbortController: newChromeAbortController,
  });
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
          // The same views: the PDF one's follow is taken over here (issue #83)
          sentenceInView?.attach(reader);
          // The manager exists and this very listing's _resolveVoice has not
          // run yet, so even the first popup open is filtered
          systemVoiceHiding?.attach(reader);
          // The popup renders its language options after the voices arrive,
          // so the label patch is in place for the first open too
          multilingualFirst?.attach(reader);
          // The dropdown is drawn from this very listing; the stylesheet has
          // to be in the document before it opens (issue #45)
          favoriteMarks?.attach(reader);
          // The manager's controller is built after the voices land, so its
          // prototype is patched from the first one this session builds
          pauses?.attach(reader);
          volumeControl?.attach(reader);
          unchangedVoice?.attach(reader);
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
  sentenceInView?.attach(reader);
  systemVoiceHiding?.attach(reader);
  multilingualFirst?.attach(reader);
  favoriteMarks?.attach(reader);
  pauses?.attach(reader);
  volumeControl?.attach(reader);
  unchangedVoice?.attach(reader);
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
  settingsSyncTransport?.poke('reader-open');
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
      settingsSyncTransport?.poke('reader-close');
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
      if (!closePoked.has(reader)) {
        positionTransport?.poke('reader-close');
        settingsSyncTransport?.poke('reader-close');
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

/** What the Go to reading position key did to the view, for the debug log and diagnostics.returnKey() (issue #76). */
const RETURN_KEY_BRANCH: Record<ReadAloudViewKind, string> = {
  dom: 'dom view, state forgotten',
  pdf: 'pdf view, state kept',
  none: 'no view',
};

function startReadAloudShortcuts(pluginID: string): void {
  stopReadAloudShortcuts();
  readAloudShortcuts = createReadAloudShortcuts({
    getBindings: () => loadSettings(prefs).shortcuts,
    prefs,
    getManager: readAloudManager,
    preferredLanguages,
    // A speed the pref cannot carry goes to the memory (issue #59)
    rememberSpeed: (speed) => readAloudMemory?.learnSpeed(speed),
    showToast: toastFor,
    // The level in percent, where the speed's toast goes (issue #62)
    showVolumeToast: (reader: any, level: number) => {
      const doc = toastDoc(reader);
      if (doc) showToast(doc, t('ztts-volume-toast', { percent: level }));
    },
    // The stop key (issue #71): every player in every window, the reading
    // guard's own close. The toast goes where the key was pressed — the
    // reader, or the window the listener sits on when no reader was picked
    // (the library tab selected, a player paused in another tab)
    anyPlayerOpen: () => playerStop.open().length > 0,
    stopAllPlayers: () => playerStop.stopAll().length,
    showStopToast: (reader: any, count: number, fallbackDoc: any) => {
      const doc = reader ? toastDoc(reader) : fallbackDoc;
      if (doc) showToast(doc, t('ztts-stopped-toast', { count }));
    },
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
    // Zotero's EPUB, snapshot and Reading Mode views act on the push below
    // only when it is their first: forget the state they hold (issue #76).
    // The line in the debug log is the proof the path ran, and which branch
    forgetViewState: (reader: any) => {
      const kind = forgetViewReadAloudState(reader, waived);
      Zotero.debug('[zotero-tts] return to spoken: ' + RETURN_KEY_BRANCH[kind]);
    },
    // A queued onStateChange with no audio side effects; with the position
    // just locked, the PDF view scrolls back on this push, and so does a
    // DOM view that has just forgotten its state
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
    // The highlight key's toast (issue #67): the level in Zotero's own words,
    // and, on a voice without word timing, why nothing on screen changed —
    // that one stays up long enough to be read
    showHighlightToast: (reader: any, level: HighlightLevel, timing: WordTiming) => {
      const doc = toastDoc(reader);
      if (!doc) return;
      if (level === 'word' && timing === 'stand-in') showToast(doc, t('ztts-highlight-toast-word-no-timing'), undefined, ANNOUNCEMENT_TOAST_MS);
      else showToast(doc, level === 'word' ? t('ztts-highlight-toast-word') : t('ztts-highlight-toast-sentence'));
    },
    wordTiming: (reader: any) => highlightStyling?.wordTiming(reader) ?? 'none',
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
  const store = positionStore;
  positionTransport = createPositionTransport({
    enabled: () => loadSettings(prefs).webdav.syncPositions,
    client: () => createWebDAVClient(loadSettings(prefs).webdav, { fetch }),
    local: () => sync.list(),
    adopt: (entry) => sync.adopt(entry),
    itemExists: (lib, key) => !!Zotero.Items.getIDFromLibraryAndKey(lib, key),
    libraryExists: (lib) => !!Zotero.Libraries.exists(lib),
    // This machine's tombstones (#51): what it permanently deleted leaves the file
    deletedAt: (lib, key) => store?.deletedAt(lib, key) ?? null,
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
 * Bookmarks follow permanent deletion. Zotero queues `('delete', 'item',
 * ids, extraData)` with `extraData[id] = { libraryID, key }` — exactly the
 * store's primary key, put there because the object is gone by notification
 * time (xpcom/data/dataObject.js:1446-1489). Erasing a parent item erases
 * each child attachment through its own `erase()`, so children notify too
 * (item.js:5573-5583); Empty Trash and sync-driven deletions
 * (sync/syncLocal.js:464-469) take the same path. Trashing is a different
 * event and clears nothing — a trashed item can be restored, and its
 * bookmark must survive. Removing a library from this machine deletes its
 * rows without item notifications (data/library.js:667), so nothing here
 * runs for it: those rows go at the next start's sweep, tombstone-less.
 *
 * Three things per deleted attachment this machine held a bookmark for
 * (#51): the sampler's map drops the entry, so no sync of this session
 * re-uploads it; the store's row goes, with a tombstone stamped above
 * whatever was held; and one poke sends the transport to take the entry
 * out of the shared file now, rather than at the next tab event. A
 * deletion of something never read aloud — a note, an annotation, a
 * parent item's other children — costs a map miss and writes nothing.
 *
 * `notify` stays synchronous: Zotero awaits every observer
 * (xpcom/notifier.js:167), so the deletion goes into the store's write
 * queue — the same serialized queue as saves. `Zotero.Reader`'s own
 * observer, registered at init with the same priority, runs first and
 * closes the attachment's tab (xpcom/reader.js:2831), so a close capture's
 * save is queued before this remove; and the sampler marks the key erased
 * for the session, so a lingering reader cannot put the entry back. The
 * notifier yields between observers, though, so the close's own sync can
 * read the map before this remove and upload the entry — measured live
 * 2026-09-06 — which is why the poke below runs on every held removal
 * rather than trusting the close: its trailing sync takes the entry out.
 */
function startDeletionObserver(): void {
  if (deleteNotifierID !== null) return;
  try {
    deleteNotifierID = Zotero.Notifier.registerObserver(
      {
        notify: (event: string, _type: string, ids: unknown[], extraData: any) => {
          if (event !== 'delete') return;
          let held = 0;
          for (const id of ids ?? []) {
            try {
              const gone = extraData?.[id as never];
              const lib = gone?.libraryID;
              const key = gone?.key;
              if (typeof lib === 'number' && typeof key === 'string' && key) {
                const entry = positionSync?.remove(lib, key) ?? null;
                if (entry) held++;
                // Stamped above what was held: an entry adopted from a machine
                // with a fast clock must not outlive its own deletion
                positionStore?.remove(lib, key, entry ? Math.max(Date.now(), entry.ts) : undefined);
              }
            } catch (e) {
              Zotero.logError(e);
            }
          }
          if (held > 0) positionTransport?.poke('delete');
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

// ---- The settings, both ways over the folder (#68) --------------------------
//
// One shared file, one setting at a time by recency (core/settings-sync.ts,
// core/settings-sync-transport.ts); the pokes ride beside the positions
// transport's, a change of this machine's syncs after its quiet period, and
// the pane hears every completed sync for its status line. The per-machine
// snapshot above stays the backup.

function startSettingsSync(): void {
  dropSettingsSync();
  const transport = createSettingsSyncTransport({
    enabled: () => loadSettings(prefs).webdav.syncSettings,
    client: () => createWebDAVClient(loadSettings(prefs).webdav, { fetch }),
    values: () => flattenSettings(loadSettings(prefs)),
    machine: () => machineId(prefs, defaultMachineName),
    readState: () => readSyncState(prefs),
    writeState: (state) => writeSyncState(prefs, state),
    write: (key, value) => prefs.set(PREF_PREFIX + key, value),
    // Any open player, paused included: the list-editing settings wait for it
    readingTabs: () => playerStop.open().map((reader: any) => String(safe(() => reader?.itemID) ?? 'reader')),
    // The check Enable and a restore run, headless (ui/prefs-pane.ts, issue #21)
    checkProvider: (id) => runConnectionCheck(prefs, id, providerDeps()),
    onSynced: (report) => {
      for (const listener of settingsSyncListeners) {
        try {
          listener(report);
        } catch (e) {
          Zotero.logError(e);
        }
      }
    },
    keys: SYNCABLE_KEYS.map((key) => ({ key, observer: 'zotero-tts.' + key })),
    registerObserver: (name, handler) => Zotero.Prefs.registerObserver(name, handler),
    unregisterObserver: (token) => Zotero.Prefs.unregisterObserver(token),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (handle: any) => clearTimeout(handle),
    now: () => Date.now(),
    error: (e) => Zotero.logError(e),
    debug: (message) => Zotero.debug('[zotero-tts] ' + message),
  });
  settingsSyncTransport = transport;
  transport.start();
  transport.poke('startup');
  // Ticking the checkbox syncs right away — the user is at the pane, watching for exactly that
  try {
    settingsSyncSwitchObserver = Zotero.Prefs.registerObserver(SYNC_SETTINGS_OBSERVER, () => {
      if (loadSettings(prefs).webdav.syncSettings) settingsSyncTransport?.poke('switch-on');
    });
  } catch (e) {
    Zotero.logError(e);
  }
}

/** Forget the transport without a flush: a restart of the step, or after the shutdown's own flush. */
function dropSettingsSync(): void {
  if (settingsSyncSwitchObserver !== null) {
    try {
      Zotero.Prefs.unregisterObserver(settingsSyncSwitchObserver);
    } catch {
      // Already gone at shutdown
    }
    settingsSyncSwitchObserver = null;
  }
  settingsSyncTransport?.stop();
  settingsSyncTransport = null;
}

async function stopSettingsSync(): Promise<void> {
  const transport = settingsSyncTransport;
  if (transport) {
    // This machine's last changes go up, push only — adopting and checking
    // are for the next start — inside the same bound as the other flushes
    try {
      await withTimeout(transport.flush('shutdown', { pushOnly: true }), SYNC_SHUTDOWN_TIMEOUT_MS, () => new Error('zotero-tts: settings sync flush timed out at shutdown'));
    } catch (e) {
      Zotero.logError(e);
    }
  }
  dropSettingsSync();
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

// ---- The whole sentence on screen -----------------------------------------
//
// Zotero's PDF follow measures a sentence by its first-page box and asks only
// whether the box's top is on screen; see read-aloud/sentence-in-view.ts for
// how the follow's call is taken over per reader (issue #83).

function startSentenceInView(): void {
  stopSentenceInView();
  sentenceInView = createSentenceInView({
    exportFunction: (fn, target) => Components.utils.exportFunction(fn, target),
    // What the reader hands an exported function arrives behind Xray wrappers (see highlight-style.ts)
    waiveXrays: (value) => ((value && typeof value === 'object') || typeof value === 'function' ? Components.utils.waiveXrays(value) : value),
    // The scroll options are built in this sandbox; the container's scrollTo reads a foreign dictionary as empty
    cloneInto: (container: any, value) => {
      const win = container?.ownerDocument?.defaultView;
      return win ? Components.utils.cloneInto(value, win) : value;
    },
    isDead: (value) => Components.utils.isDeadWrapper(value),
    // Only a real word is followed; the whole-segment stand-in of a wordless voice is not one
    wordTiming: (reader) => highlightStyling?.wordTiming(reader) ?? 'none',
    error: (e) => Zotero.logError(e),
    debug: (message) => Zotero.debug('[zotero-tts] ' + message),
  });
  for (const reader of Zotero.Reader._readers ?? []) sentenceInView.attach(reader);
}

function stopSentenceInView(): void {
  sentenceInView?.dispose();
  sentenceInView = null;
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

// ---- The ♥ on the favorites in the player's voice list ---------------------
//
// A stylesheet in the reader's document, marking rows by the voice id in
// their DOM id; see read-aloud/favorite-marks.ts for why the label is left
// alone. Unlike everything else that edits the player's list, a heart may be
// toggled while a tab reads: the ids never change, so ui/reading-guard.ts
// has nothing to protect here, and an open dropdown repaints on the spot.

function startFavoriteMarks(): void {
  stopFavoriteMarks();
  favoriteMarks = createFavoriteMarks({
    marks: () => {
      const s = loadSettings(prefs).readAloud;
      return { favorites: parseFavoriteVoices(s.favoriteVoices), favoritesOnly: s.favoritesOnly };
    },
    documentOf: (reader: any) => reader?._iframeWindow?.document ?? null,
    isDead: (value) => Components.utils.isDeadWrapper(value),
    error: (e) => Zotero.logError(e),
    debug: (message) => Zotero.debug('[zotero-tts] ' + message),
  });
  favoriteMarkObservers = [FAVORITES_OBSERVER, FAVORITES_ONLY_OBSERVER].map((name) =>
    Zotero.Prefs.registerObserver(name, () => favoriteMarks?.refresh()),
  );
  for (const reader of Zotero.Reader._readers ?? []) favoriteMarks.attach(reader);
}

function stopFavoriteMarks(): void {
  for (const token of favoriteMarkObservers) {
    try {
      Zotero.Prefs.unregisterObserver(token);
    } catch (e) {
      Zotero.logError(e);
    }
  }
  favoriteMarkObservers = [];
  favoriteMarks?.dispose();
  favoriteMarks = null;
}

// ---- The pauses between sentences and before paragraphs ------------------
//
// Zotero's per-voice sentenceDelay and its paragraph extra, replaced by the
// pane's two settings for every voice; see read-aloud/pauses.ts for the
// scheduling hook.

function startPauses(): void {
  stopPauses();
  pauses = createPauses({
    // Read on every sentence boundary, never cached: the pane applies at once
    getSettings: () => pauseSettingsOf(loadSettings(prefs).readAloud),
    exportFunction: (fn, target) => Components.utils.exportFunction(fn, target),
    waiveXrays: (value) => ((value && typeof value === 'object') || typeof value === 'function' ? Components.utils.waiveXrays(value) : value),
    isDead: (value) => Components.utils.isDeadWrapper(value),
    error: (e) => Zotero.logError(e),
    debug: (message) => Zotero.debug('[zotero-tts] ' + message),
  });
  for (const reader of Zotero.Reader._readers ?? []) pauses.attach(reader);
}

function stopPauses(): void {
  pauses?.dispose();
  pauses = null;
}

// ---- The volume ------------------------------------------------------------
//
// A gain ahead of Zotero's own filter chain, per controller, at the level of
// the readAloud.volume pref; see read-aloud/volume.ts. The pref is written by
// the pane's field and by the volume keys alike, and the observer here is the
// one path from it to the audio, so both land within the sentence being spoken.

function startVolume(): void {
  stopVolume();
  // A level 1.11.1's 0–200 field stored above 100 is brought to 100 once,
  // before the observer is up, so the pane's field shows what plays (issue #66)
  try {
    const settled = settleVolumePref(prefs);
    if (settled) Zotero.debug(`[zotero-tts] volume settled to ${settled.to} from ${settled.from}`);
  } catch (e) {
    Zotero.logError(e);
  }
  volumeControl = createVolumeControl({
    getLevel: () => loadSettings(prefs).readAloud.volume,
    exportFunction: (fn, target) => Components.utils.exportFunction(fn, target),
    waiveXrays: (value) => ((value && typeof value === 'object') || typeof value === 'function' ? Components.utils.waiveXrays(value) : value),
    isDead: (value) => Components.utils.isDeadWrapper(value),
    error: (e) => Zotero.logError(e),
    debug: (message) => Zotero.debug('[zotero-tts] ' + message),
  });
  for (const reader of Zotero.Reader._readers ?? []) volumeControl.attach(reader);
  volumeObserver = Zotero.Prefs.registerObserver(VOLUME_OBSERVER, () => volumeControl?.apply());
}

function stopVolume(): void {
  if (volumeObserver !== null) {
    try {
      Zotero.Prefs.unregisterObserver(volumeObserver);
    } catch (e) {
      Zotero.logError(e);
    }
    volumeObserver = null;
  }
  volumeControl?.dispose();
  volumeControl = null;
}

// ---- The voice kept through a voice-list reload ---------------------------
//
// Zotero rebuilds the controller when its voice list lands, even onto the
// voice already playing, which restarts the sentence on every popup reopen;
// see read-aloud/unchanged-voice.ts for the shadow (issue #75).

function startUnchangedVoice(): void {
  stopUnchangedVoice();
  unchangedVoice = createUnchangedVoice({
    exportFunction: (fn, target) => Components.utils.exportFunction(fn, target),
    waiveXrays: (value) => ((value && typeof value === 'object') || typeof value === 'function' ? Components.utils.waiveXrays(value) : value),
    isDead: (value) => Components.utils.isDeadWrapper(value),
    error: (e) => Zotero.logError(e),
    debug: (message) => Zotero.debug('[zotero-tts] ' + message),
  });
  for (const reader of Zotero.Reader._readers ?? []) unchangedVoice.attach(reader);
}

function stopUnchangedVoice(): void {
  unchangedVoice?.dispose();
  unchangedVoice = null;
}

/**
 * Gecko's Fluent globals — L10nRegistry and L10nFileSource — from the scope
 * Zotero's own modules run in (issue #64): the plugin sandbox is handed
 * Localization only, and xpcom/plugins.js reaches these two as bare
 * globals of that scope. Throws when they are not there, so the step that
 * needs them is reported instead of failing quietly.
 */
function fluentGlobals(): { L10nRegistry: any; L10nFileSource: any } {
  const scope = Components.utils.getGlobalForObject(Zotero);
  if (typeof scope?.L10nRegistry?.getInstance !== 'function' || typeof scope?.L10nFileSource?.createMock !== 'function') {
    throw new Error('zotero-tts: the Fluent registry is not reachable from the plugin scope');
  }
  return scope;
}

let ownStringsInstalled = false;

/** Registers the plugin's own copy of its Fluent file (core/l10n-source.ts, issue #64), read from the xpi's locale/ directory. */
async function installOwnStrings(rootURI: string): Promise<void> {
  const { L10nRegistry, L10nFileSource } = fluentGlobals();
  const report = await installOwnSource({
    registry: L10nRegistry.getInstance(),
    createMock: (name, metasource, locales, prePath, files) => L10nFileSource.createMock(name, metasource, locales, prePath, files),
    resolveLocale: (locale, available) => Zotero.Utilities.Internal.resolveLocale(locale, available, { silent: true }),
    readFile: (locale) => Zotero.File.getResourceAsync(`${rootURI}locale/${locale}/${FTL_FILE}`),
    zoteroLocales: Array.from(Services.locale.availableLocales as Iterable<string>),
    fileName: FTL_FILE,
    warn: (message) => Zotero.debug(`[zotero-tts] ${message}`),
  });
  ownStringsInstalled = true;
  Zotero.debug(`[zotero-tts] own strings source ${report.updated ? 'replaced' : 'registered'}: ${report.locales.join(', ')} for ${report.entries} Zotero locales`);
}

function removeOwnStrings(): void {
  if (!ownStringsInstalled) return;
  ownStringsInstalled = false;
  try {
    unregisterOwnSource(fluentGlobals().L10nRegistry.getInstance());
  } catch (e) {
    Zotero.logError(e);
  }
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
      // First, so every later step's strings resolve: a sync Localization
      // over the plugin's own Fluent file, which Zotero registered before
      // calling startup (core/l10n.ts, issue #30). Without it t() shows ids.
      ['strings', () => setMessageSource(new Localization([FTL_FILE], true))],
      // Then the plugin's own copy of that file in the registry
      // (core/l10n-source.ts, issue #64): a reload's disable tail deletes
      // Zotero's shared entry after this instance has started, and ours is
      // what the pane, t() and the rest of the settings window read then
      ['own strings source', () => installOwnStrings(rootURI)],
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
      ['settings sync', startSettingsSync],
      ['highlight colors', startHighlightStyling],
      ['sentence in view', startSentenceInView],
      [
        'system speech helper',
        () => {
          startSpeechBackend();
          // Nothing waits on the sweep; a crash's leftovers are not urgent
          void sweepSpeechFiles().catch((e) => Zotero.debug('[zotero-tts] temp sweep skipped: ' + e));
        },
      ],
      ['system-voice hiding', startSystemVoiceHiding],
      ['Multiple-languages-first ordering', startMultilingualFirst],
      ['favorite marks in the player', startFavoriteMarks],
      ['sentence and paragraph pauses', startPauses],
      ['Read Aloud volume', startVolume],
      ['the voice kept through a list reload', startUnchangedVoice],
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
  // The settings sync's last push, bounded, then its observers come off (#68)
  await stopSettingsSync();
  // Awaited: the final bookmarks flush to the database and the connection
  // closes before Zotero goes on shutting down (plugins.js awaits us)
  await stopPositionTracking();
  stopReadAloudMemory();
  stopHighlightStyling();
  stopSentenceInView();
  stopSpeechBackend();
  stopSystemVoiceHiding();
  stopMultilingualFirst();
  stopFavoriteMarks();
  stopPauses();
  stopVolume();
  stopUnchangedVoice();
  // The plugin's copy of its strings leaves with it; a reload's successor
  // registers its own (issue #64)
  removeOwnStrings();
  // Last: the stop line above is the one string that never goes through t()
  setMessageSource(null);
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
  /**
   * The strings' state (issue #30): Zotero's locale and the app locales
   * Fluent negotiates from it; whether the sandbox formats a message of the
   * plugin's file (`sample`, in the app's language) and hands back the id
   * for one the file lacks (`fallback`); and, while the settings window is
   * open with the pane loaded, the pane's data-l10n-id elements that
   * Fluent left blank and the ? icons left without their ? — both empty.
   */
  l10n: () => {
    const probe = 'ztts-no-such-message';
    // The window itself, not through safe(): that copies through JSON
    let pane: any = null;
    try {
      pane = Services.wm.getMostRecentWindow('zotero:pref')?.document?.querySelector('.ztts-pane') ?? null;
    } catch {
      pane = null;
    }
    let paneReport: { elements: number; blank: string[]; questionless: string[] } | null = null;
    if (pane) {
      const blank: string[] = [];
      const questionless: string[] = [];
      const elements: any[] = Array.from(pane.querySelectorAll('[data-l10n-id]'));
      for (const el of elements) {
        const attr = (name: string) => el.getAttribute(name) ?? '';
        const value = attr('value');
        const filled = (el.textContent ?? '').trim() || attr('label') || attr('placeholder') || attr('tooltiptext') || attr('help') || (value && value !== '?');
        if (!filled) blank.push(attr('data-l10n-id'));
      }
      for (const el of Array.from(pane.querySelectorAll('.ztts-help')) as any[]) {
        if (el.getAttribute('value') !== '?') questionless.push(el.getAttribute('data-l10n-id') || el.id || '?');
      }
      paneReport = { elements: elements.length, blank, questionless };
    }
    return JSON.stringify(
      {
        zoteroLocale: Zotero.locale ?? null,
        appLocales: safe(() => Array.from(Services.locale.appLocalesAsBCP47)) ?? null,
        requestedLocales: safe(() => Array.from(Services.locale.requestedLocales)) ?? null,
        source: hasMessageSource(),
        // The file in the registry (issue #64): Zotero's shared source and the
        // plugin's own, `present` / `missing` / `unknown` as hasFile says (or
        // `no source`), and the bundles the app locale yields for the file —
        // 2 while both hold it, 1 after a reload has cost Zotero's; `locale`
        // is the first app locale, what the registry resolves the file by
        registry: safe(() => {
          const reg = fluentGlobals().L10nRegistry.getInstance();
          // The locale Fluent negotiates now, not Zotero.locale, which is
          // fixed at startup: the field follows a live locale switch
          const locale: string = Array.from(Services.locale.appLocalesAsBCP47 as Iterable<string>)[0] ?? Zotero.locale;
          const file = (name: string) => (reg.hasSource(name) ? reg.getSource(name).hasFile(locale, FTL_FILE) : 'no source');
          let bundles = 0;
          for (const bundle of reg.generateBundlesSync([locale], [FTL_FILE])) if (bundle) bundles++;
          return { locale, shared: file('zotero-plugins'), own: file(OWN_SOURCE_NAME), bundles };
        }),
        sample: t('ztts-heading-voice-browser'),
        fallback: t(probe),
        // The strings TypeScript writes (issue #43): a count handed over as
        // text, the plural at one and at two, the joiner, a tier name, and
        // whether any bidi isolation mark (U+2066–U+2069) surrounds a placeable
        formatted: {
          voices: t('ztts-voices-available', { count: '2267' }),
          oneTab: t('ztts-reading-tabs', { count: 1, list: '  • A' }),
          twoTabs: t('ztts-reading-tabs', { count: 2, list: '  • A\n  • B' }),
          joined: sentences(t('ztts-connected'), t('ztts-synthesis-works')),
          tier: tierLabel('local'),
          isolationMarks: /[\u2066-\u2069]/.test(t('ztts-voices-available', { count: '2267' }) + t('ztts-reading-tabs', { count: 2, list: 'x' })),
        },
        pane: paneReport,
      },
      null,
      1,
    );
  },
  highlight: () => JSON.stringify((Zotero.Reader._readers ?? []).map((r: any) => highlightStyling?.inspect(r) ?? null), null, 1),
  /**
   * The whole-sentence follow on a PDF (read-aloud/sentence-in-view.ts,
   * issue #83): per reader the view kind, whether its prototype is patched,
   * the current sentence's head and whole boxes against the viewport with
   * `fits` and `cut`, the word being followed, and the last decision the
   * shadow made — its reason, the scrollTop it saw and the target it
   * issued. The debug log carries one `sentence in view: <reason> on page
   * N: scrollTop A -> B` line per scroll issued; a sentence wholly on
   * screen leaves the call to Zotero (`handled` false, no line).
   */
  sentenceInView: () => JSON.stringify((Zotero.Reader._readers ?? []).map((r: any) => sentenceInView?.inspect(r) ?? null), null, 1),
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
   * The ♥ marks (issue #45), per open reader: whether the stylesheet is in
   * that reader's document, how many voices it marks, and — the mechanism,
   * not the effect — how many rows of the dropdown those rules match right
   * now. `options` is 0 while the dropdown is closed, since Zotero renders
   * the list only then; with it open, `matched` is what proves the rules
   * found their rows.
   */
  favoriteMarks: () => JSON.stringify((Zotero.Reader._readers ?? []).map((r: any) => favoriteMarks?.inspect(r) ?? null), null, 1),
  /**
   * The pauses (issue #44), per open reader: whether the manager and its
   * running controller are patched, the two settings, the speed, the
   * selected voice's own `sentenceDelay`, the gaps a sentence boundary and
   * a paragraph boundary would get right now, and `last` — the number
   * Zotero's timer actually received at the latest boundary, with `count`.
   * `last` advancing while a session plays is what proves the hook ran.
   */
  pauses: () => JSON.stringify((Zotero.Reader._readers ?? []).map((r: any) => pauses?.inspect(r) ?? null), null, 1),
  /**
   * The volume (issue #62), per open reader: whether the manager and the
   * controllers' base prototype are patched, the session state, the level
   * and the gain it means, and `chains` — every open chain the hook gained
   * in the tab (a session's, a popup sample's), each with the gain it
   * carries and, for the live controller, `inChain`: its `_filterChainInput`
   * is that very node, so every source lands on it. `count` is how many
   * chains the hook has gained in the tab, which is what proves it ran.
   */
  volume: () => JSON.stringify((Zotero.Reader._readers ?? []).map((r: any) => volumeControl?.inspect(r) ?? null), null, 1),
  /**
   * The voice kept through a voice-list reload (issue #75), per open
   * reader: whether the manager's prototype is patched, the session state,
   * the voice in use, `kept` — how many rebuilds onto the voice already
   * playing the shadow skipped in that tab — and `last`. `kept` going up by
   * one on a popup reopen, with one `volume gain inserted` line per start
   * in the log, is what proves the hook ran.
   */
  unchangedVoice: () => JSON.stringify((Zotero.Reader._readers ?? []).map((r: any) => unchangedVoice?.inspect(r) ?? null), null, 1),
  /**
   * The undo logs of the five modules that shadow a reader-side prototype
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
        pauses: safe(() => pauses?.patchCounts()) ?? null,
        volume: safe(() => volumeControl?.patchCounts()) ?? null,
        unchangedVoice: safe(() => unchangedVoice?.patchCounts()) ?? null,
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
   * The Go to reading position key (Shift+Enter) as the plugin sees it
   * (issue #76): for every reader, which of Zotero's view classes its
   * current view is — `dom` (EPUB, snapshot, Reading Mode) or `pdf` — and
   * that view's own lock and scroll flags, whether it holds a state and
   * whether that state's segment is the manager's. Right after a press on
   * a DOM view the scroll flag is up while Zotero's navigate runs (until
   * 100 ms after its last scroll event), the lock is true and the state is
   * held again on the manager's segment; the debug log carries `return to
   * spoken: dom view, state forgotten`. Before the fix the flag never went
   * up on a press. Read-only: the press itself is the key's.
   */
  returnKey: () => {
    const read = (fn: () => unknown): any => {
      try {
        return fn() ?? null;
      } catch {
        return null;
      }
    };
    const readers = (Zotero.Reader._readers ?? []).map((r: any) => {
      const view = read(() => r?._internalReader?._lastView);
      const manager = read(() => r?._internalReader?._readAloudManager);
      const kind = readAloudViewKind(view);
      const held = read(() => (kind === 'dom' ? view._readAloud.state : kind === 'pdf' ? view._readAloudState : null));
      return {
        itemID: safe(() => r?.itemID),
        view: kind,
        branch: RETURN_KEY_BRANCH[kind],
        active: safe(() => !!manager?.active),
        paused: safe(() => !!manager?.paused),
        locked: safe(() => (kind === 'dom' ? !!view._readAloud.positionLocked : kind === 'pdf' ? !!view._readAloudPositionLocked : null)),
        scrolling: safe(() => (kind === 'dom' ? !!view._readAloud.scrolling : kind === 'pdf' ? !!view._readAloudScrolling : null)),
        stateHeld: safe(() => !!held),
        sameSegment: safe(() => !!held && !!manager?.activeSegment && held.activeSegment === manager.activeSegment),
        segment: safe(() => String(manager?.activeSegment?.text ?? '').slice(0, 60)),
      };
    });
    return JSON.stringify({ shortcut: loadSettings(prefs).shortcuts.returnToSpoken, readers }, null, 1);
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
   * Every player as the reading guard sees it (read-aloud/player-stop.ts,
   * issue #71): per reader `open` — the guard's test — with the popup flag
   * and the manager's flags behind it, and whether the popup element is in
   * the DOM. `players(true)` runs the very `stopAll()` the dialog's Stop
   * button runs and reports the same fields at once and a second later —
   * the press is proved by `popupOpen` and `active` flipping, never by the
   * popup looking gone (the element leaves on React's next render).
   */
  players: async (stop = false) => {
    const state = (r: any) => {
      const open = isPlayerOpen(r);
      return {
        itemID: safe(() => r?.itemID),
        open,
        popupOpen: safe(() => !!r?._internalReader?._state?.readAloudState?.popupOpen),
        active: safe(() => !!r?._internalReader?._readAloudManager?.active),
        // A manager that never ran reads `paused: true`; the flag means something only behind an open player
        paused: open ? safe(() => !!r?._internalReader?._readAloudManager?.paused) : null,
        popupInDom: safe(() => hasPlayer(r?._iframeWindow?.document ?? null)),
      };
    };
    const readers = () => (Zotero.Reader._readers ?? []) as any[];
    const before = readers().map(state);
    if (!stop) return JSON.stringify({ before }, null, 1);
    const stopped = playerStop.stopAll().map((r: any) => safe(() => r?.itemID));
    const after = readers().map(state);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const later = readers().map(state);
    return JSON.stringify({ before, stopped, after, later }, null, 1);
  },
  /**
   * The stop key (issue #71) as the plugin sees it: its binding, whether a
   * press would be taken right now — a player open somewhere — and which
   * players. `stopKey(true)` runs the very `stopReading()` the key runs,
   * routed as a press on the main window is, and reports the count it
   * returned, the players left open, and the toast's text in the document
   * it landed in — proved by the count and the flags, never by the players
   * looking closed.
   */
  stopKey: async (press = false) => {
    const open = () => playerStop.open().map((r: any) => safe(() => r?.itemID));
    const before = open();
    const shortcut = loadSettings(prefs).shortcuts.stopReading;
    // `taken`: a press would be consumed — the key is bound and there is something to stop
    const result: Record<string, unknown> = { shortcut, taken: shortcut !== '' && before.length > 0, open: before };
    if (!press) return JSON.stringify(result, null, 1);
    const win = mainWindows()[0];
    const reader = pickReader(Zotero.Reader._readers ?? [], win, win?.Zotero_Tabs ? win.Zotero_Tabs.selectedID : null, (r: any) => isSpeaking(readAloudManager(r)));
    result.count = safe(() => readAloudShortcuts?.stopReading(reader, win?.document));
    result.after = open();
    const doc = reader ? toastDoc(reader) : win?.document;
    result.toast = safe(() => doc?.getElementById(SPEED_TOAST_ID)?.textContent ?? null);
    return JSON.stringify(result, null, 1);
  },
  /**
   * The highlight key (issue #67) as the plugin sees it: its binding, the
   * level Zotero's pref holds, and per reader the level the reader's own
   * state carries — what its views draw by — with the word timing the toast
   * would report. `highlightKey(true)` runs the very `toggleWordHighlight`
   * the key runs, on the reader a press on the main window would pick, and
   * reports the pref, every reader's state and the toast's text afterwards
   * — proved by the pref and the states flipping in the same call, never by
   * the highlight looking different.
   */
  highlightKey: (press = false) => {
    const state = () => ({
      pref: safe(() => Zotero.Prefs.get(HIGHLIGHT_LEVEL_PREF, true)),
      readers: (Zotero.Reader._readers ?? []).map((r: any) => ({
        itemID: safe(() => r?.itemID),
        state: safe(() => r?._internalReader?._state?.readAloudState?.highlightGranularity ?? null),
        wordTiming: safe(() => highlightStyling?.wordTiming(r) ?? 'none'),
      })),
    });
    const shortcut = loadSettings(prefs).shortcuts.toggleWordHighlight;
    const result: Record<string, unknown> = { shortcut, before: state() };
    if (!press) return JSON.stringify(result, null, 1);
    const win = mainWindows()[0];
    const reader = pickReader(Zotero.Reader._readers ?? [], win, win?.Zotero_Tabs ? win.Zotero_Tabs.selectedID : null, (r: any) => isSpeaking(readAloudManager(r)));
    result.picked = safe(() => reader?.itemID ?? null);
    result.level = reader ? safe(() => readAloudShortcuts?.toggleWordHighlight(reader)) : 'no reader';
    result.after = state();
    const doc = reader ? toastDoc(reader) : null;
    result.toast = safe(() => doc?.getElementById(SPEED_TOAST_ID)?.textContent ?? null);
    return JSON.stringify(result, null, 1);
  },
  /**
   * The stored Read Aloud positions and what the sampler sees right now.
   * `zoteroSaved` is Zotero's in-memory copy, what the sampler reads; it
   * stays until the tab closes. `zoteroPersisted` is Zotero's synced
   * setting, the copy it nulls once the view is more than five pages away —
   * the loss `stored` is here to survive (issue #39).
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
      // The synced setting `lastReadAloudPosition`: what the debounced
      // view-state change nulls when the view is more than five pages from
      // it, and what the next open is seeded from
      zoteroPersisted: safe(() => {
        const item = r?.itemID ? Zotero.Items.get(r.itemID) : null;
        const p = item?.isFileAttachment?.() ? item.getAttachmentLastReadAloudPosition() : null;
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
   * `adopted` counts entries taken from other machines, `dropped` the ones
   * this machine's tombstones took out of the file (#51); `uploaded` says
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
        // Attachments permanently deleted here whose bookmark this machine
        // held (#51): what the transport drops from the shared file
        tombstones: safe(() => positionStore?.stats().deletions ?? null),
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
   * The settings sync (#68): the switch, this machine's id, which provider
   * sections are held here for their address, the stamps (keys and count,
   * never values), the providers held off, and the transport's last sync
   * field by field. A build is proved by `transport.adopted` / `pushed`
   * moving after a change on the other side, never by the file looking
   * fresh.
   */
  settingsSync: () => {
    const settings = loadSettings(prefs);
    const values = flattenSettings(settings);
    const state = safe(() => readSyncState(prefs)) as SyncState | undefined;
    return JSON.stringify(
      {
        enabled: settings.webdav.syncSettings,
        configured: !!settings.webdav.url,
        machine: safe(() => machineId(prefs, defaultMachineName)),
        file: SHARED_SETTINGS_FILENAME,
        syncable: SYNCABLE_KEYS.length,
        heldSections: safe(() => [...heldSections(values)]),
        state: state ? { seeded: state.seeded, stamps: Object.keys(state.stamps).length, stamped: Object.keys(state.stamps).sort(), held: state.held } : null,
        transport: safe(() => settingsSyncTransport?.stats() ?? 'not started'),
      },
      null,
      1,
    );
  },
  /**
   * The shared settings file as this machine reads it (#68): every item's
   * key, stamp and writer, and its value only where it is not a secret —
   * keys, tokens, passwords, headers and the preset memory show as a
   * length. A push or an adoption is proved by the stamps here, never by
   * printing a key.
   */
  sharedSettings: async () => {
    try {
      const client = createWebDAVClient(loadSettings(prefs).webdav, { fetch });
      const items = parseSharedSettings(await client.download(SHARED_SETTINGS_FILENAME));
      const secret = /apiKey|apiToken|password|headers|presetValues/i;
      return JSON.stringify(
        {
          url: client.url,
          count: items.length,
          items: items.map((i) => ({ key: i.key, value: secret.test(i.key) ? `<${String(i.value).length} chars>` : i.value, ts: i.ts, by: i.by })),
        },
        null,
        1,
      );
    } catch (e) {
      return JSON.stringify({ error: String(e) }, null, 1);
    }
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
      const files = (await client.list()).filter((f) => SETTINGS_FILE_PATTERN.test(f.name) || f.name === POSITIONS_FILENAME || f.name === SHARED_SETTINGS_FILENAME);
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
   * line it paints — the very line, listed and composed by the pane's own
   * functions (issue #32) — so a pane that marks the wrong row can be told
   * apart from a memory that names the wrong voice.
   */
  defaultVoice: async () => {
    try {
      const memory = readMemory(prefs);
      const { readAloud } = loadSettings(prefs);
      const { globalSpeed, sameForAllDocuments: sameVoice, favoritesOnly } = readAloud;
      const favorites = parseFavoriteVoices(readAloud.favoriteVoices);
      // The pane's listing (ui/voice-browser-rows.ts listBrowserVoices): both catalogs, each failing on its own, the catalog capped as the pane caps it — each provider is bounded inside it (issue #55), this is the last resort
      const { voices, problems } = await listBrowserVoices({
        listCatalog: () => withTimeout(listCatalog(), CATALOG_CAP_MS, () => new Error(`No voice list within ${Math.round(CATALOG_CAP_MS / 1000)} s`)),
        listZoteroVoices: () => zoteroVoiceService().listVoices(),
      });
      const rows = defaultVoiceRows(voices, memory.voice);
      const home = rows[0] ?? null;
      const tiers = groupVoicesByTier(voices, appLanguageName);
      return JSON.stringify(
        {
          memory,
          globalSpeed,
          sameVoice,
          favoritesOnly,
          // Whether the remembered voice is marked: while only favorites are offered, one that is not cannot start Read Aloud
          favorite: memory.voice ? favorites.includes(memory.voice.id) : null,
          listed: voices.length,
          // What failed to list, in the status line's own words
          problems,
          rows: rows.map((r) => ({ tier: r.tier, locale: r.locale, label: r.label, id: r.encoded })),
          // The language entry the row sits under, named as the popup's dropdown names it
          opensOn: home ? { tier: home.tier, language: dropdownLanguage(home.locale), name: languageNameOf(tiers, home) } : 'the usual tier (no listed row is the default)',
          // The pane's line as it opens (statusLine): the slider starts at startingSpeed, each half answers to its "everywhere" switch, then the not-a-favorite warning and the listing trouble
          status: statusLine({ voices, problems, choice: memory.voice, home, tiers, speed: globalSpeed ? startingSpeed(prefs) : null, sameVoice, favoritesOnly, favorites }),
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
      const catalog = await withTimeout(listCatalog(), CATALOG_CAP_MS, () => new Error(`No voice list within ${Math.round(CATALOG_CAP_MS / 1000)} s`));
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
      // How the silence ends — `ended`, or the failure the player would put
      // on the voice browser's status line: on a machine with no audio
      // output the element errors a few ms after it starts (issue #48)
      let settle: (outcome: string) => void = () => {};
      const outcome = new Promise<string>((resolve) => (settle = resolve));
      await player.play(silentWav(100), 1.5, (error) => settle(error ? `error: ${error.message}` : 'ended'));
      const playing = { playbackRate: el.playbackRate, defaultPlaybackRate: el.defaultPlaybackRate, preservesPitch: el.preservesPitch };
      player.setRate(2);
      const afterSetRate = el.playbackRate;
      const ending = await Promise.race([outcome, new Promise<string>((resolve) => setTimeout(() => resolve('neither ended nor failed within 3 s'), 3000))]);
      player.stop();
      return JSON.stringify({ startingSpeed: startingSpeed(prefs), playing, afterSetRate, outcome: ending }, null, 1);
    } catch (e) {
      return JSON.stringify({ error: String(e) }, null, 1);
    }
  },
  /**
   * The system-voice provider, proved by its own mechanism rather than by
   * the list looking right: the backend's platform and state, the voices it
   * enumerates with the id each maps onto in Zotero's own list, and — with
   * a voice id — one real synthesis, reporting the audio's length, the
   * engine's word marks and the timestamps they became. `words: 0` with a
   * `note` about marks is the SAPI rate trap
   * (core/providers/system/daemon-script.win.ts): the engine's timeline is
   * not the file's and the marks were dropped rather than drawn in the
   * wrong place. On macOS `words` is always 0 and the note says why: the
   * backend has no marks (issue #23).
   */
  systemProvider: async (voice?: string) => {
    const settings = loadSettings(prefs);
    const out: Record<string, unknown> = {
      enabled: settings.system.enabled,
      platform: Zotero.isWin ? 'win' : Zotero.isMac ? 'mac' : 'other',
      unsupported: speechUnsupportedReason(),
      backend: speechBackend ? { platform: speechBackend.platform, wordTimestamps: speechBackend.wordTimestamps, ...speechBackend.state() } : null,
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
    if (speechBackend) out.backendAfter = speechBackend.state();
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
        // The restores run again after Zotero moved the language inside a resolution of its own (issue #59)
        resyncs: safe(() => readAloudMemory?.resyncs(r) ?? null),
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
        // The settings sync (#68): the status line's stats, a listener per
        // completed sync, and a poke when the pane opens — where the user looks
        settingsSync: {
          stats: () => settingsSyncTransport?.stats() ?? null,
          watch: (onSynced) => {
            settingsSyncListeners.add(onSynced);
            return () => void settingsSyncListeners.delete(onSynced);
          },
          poke: () => settingsSyncTransport?.poke('pane-open'),
        },
      }),
  },
  diagnostics,
};
