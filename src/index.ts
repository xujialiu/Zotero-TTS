import { getChromeWebSocket, newRequestId } from './core/providers/azure';
import { createProvider } from './core/providers/factory';
import type { ProviderId, VoiceInfo } from './core/providers/types';
import { createMemoryCache } from './core/memory-cache';
import { createZoteroPrefs, enabledProviders, loadSettings, migrateLegacyProviderPref } from './core/settings';
import { installHijack } from './modes/hijack';
import { createReadAloudMemorySync, type ReadAloudMemorySync } from './modes/hijack/memory-sync';
import { collectCatalog } from './modes/hijack/catalog';
import {
  createRemoteInterface,
  type NativeRemoteInterface,
  type RemoteInterface,
} from './modes/hijack/remote-interface';
import { onPaneLoad, registerPrefsPane } from './ui/prefs-pane';
import {
  createSpeedShortcuts,
  deepActiveElement,
  isEditableTarget,
  pickReader,
  type SpeedShortcuts,
} from './ui/speed-shortcuts';
import { removeSpeedToast, showSpeedToast } from './ui/speed-toast';

export interface StartupParams {
  id: string;
  version: string;
  rootURI: string;
}

let uninstallHijack: (() => void) | null = null;
let pluginVersion = '0.0.0';
let speedShortcuts: SpeedShortcuts | null = null;
let readerOpenedListener: ((event: any) => void) | null = null;
let readAloudMemory: ReadAloudMemorySync | null = null;

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
async function listCatalog(): Promise<{ provider: ProviderId; voices: VoiceInfo[] }[]> {
  const settings = loadSettings(prefs);
  return collectCatalog(
    enabledProviders(settings),
    (id) => createProvider(id, settings, providerDeps()),
    (e) => Zotero.logError(e),
  );
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
        },
        listCatalog,
        // Built from the voice id, not from the enabled flags: Zotero
        // remembers the last-selected voice, which may belong to a provider
        // the user has since switched off, and a cached or in-flight segment
        // must still play.
        getProvider: (id) => createProvider(id, loadSettings(prefs), providerDeps()),
        getSpeed: () => loadSettings(prefs).speed,
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

// ---- Speed shortcuts -------------------------------------------------------
//
// The shortcuts drive Zotero's own Read Aloud speed (the popup slider), not
// the synthesis speed in our settings: Zotero time-stretches the audio it
// already has, so the change is immediate and cached audio stays valid.
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

/** Where the toast goes: the reader, unless its tab is hidden behind another, then the window itself. */
function toastFor(reader: any, speed: number): void {
  const win = reader?._window;
  const tabs = win?.Zotero_Tabs;
  const hiddenTab = !!(tabs && reader?.tabID && tabs.selectedID !== reader.tabID);
  const doc = hiddenTab ? win.document : (reader?._iframeWindow?.document ?? win?.document);
  if (doc) showSpeedToast(doc, speed);
}

function watchWindow(win: any): void {
  if (!win || !speedShortcuts) return;
  speedShortcuts.listen(
    win,
    () =>
      pickReader(
        Zotero.Reader._readers,
        win,
        win.Zotero_Tabs ? win.Zotero_Tabs.selectedID : null,
        (r: any) => !!readAloudManager(r)?.active,
      ),
    { isEditable: (event) => isEditableTarget(event.target) || isEditableTarget(deepActiveElement(win.document)) },
  );
}

function watchReader(reader: any): void {
  if (!reader || !speedShortcuts) return;
  watchWindow(reader._window);
  readAloudMemory?.attach(reader);
  const iframe = reader._iframeWindow;
  if (iframe) {
    speedShortcuts.listen(iframe, () => reader, {
      isEditable: (event) => isEditableTarget(event.target) || isEditableTarget(deepActiveElement(iframe.document)),
    });
  }
}

function startSpeedShortcuts(pluginID: string): void {
  stopSpeedShortcuts();
  speedShortcuts = createSpeedShortcuts({
    getBindings: () => loadSettings(prefs).shortcuts,
    prefs,
    getManager: readAloudManager,
    showToast: toastFor,
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

function stopSpeedShortcuts(): void {
  if (readerOpenedListener) {
    try {
      Zotero.Reader.unregisterEventListener('renderToolbar', readerOpenedListener);
    } catch (e) {
      Zotero.logError(e);
    }
    readerOpenedListener = null;
  }
  speedShortcuts?.dispose();
  speedShortcuts = null;
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
// language; see modes/hijack/read-aloud-memory.ts for what is kept instead.

function startReadAloudMemory(): void {
  stopReadAloudMemory();
  readAloudMemory = createReadAloudMemorySync({
    prefs,
    enabled: () => loadSettings(prefs).readAloud.sameForAllDocuments,
    registerObserver: (name, handler) => Zotero.Prefs.registerObserver(name, handler),
    unregisterObserver: (token) => Zotero.Prefs.unregisterObserver(token),
    readers: () => Zotero.Reader._readers ?? [],
    // The reader iframe may not call a bare sandbox function (the call
    // throws there and takes the Read Aloud button with it); export it into
    // the iframe's compartment, as Zotero does with its own interface.
    exportFunction: (fn, target) => Components.utils.exportFunction(fn, target),
    error: (e) => Zotero.logError(e),
    debug: (message) => Zotero.debug('[zotero-tts] ' + message),
  });
  for (const reader of Zotero.Reader._readers ?? []) readAloudMemory.attach(reader);
}

function stopReadAloudMemory(): void {
  readAloudMemory?.dispose();
  readAloudMemory = null;
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
  } catch (e) {
    Zotero.logError(e);
    Zotero.debug('[zotero-tts] failed to install the Read Aloud memory');
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
    startSpeedShortcuts(id);
  } catch (e) {
    Zotero.logError(e);
    Zotero.debug('[zotero-tts] failed to install the speed shortcuts');
  }
  Zotero.debug('[zotero-tts] started');
}

async function shutdown(): Promise<void> {
  uninstallHijack?.();
  uninstallHijack = null;
  stopSpeedShortcuts();
  stopReadAloudMemory();
  Zotero.debug('[zotero-tts] stopped');
}

function onMainWindowLoad(win: any): void {
  watchWindow(win);
}

function onMainWindowUnload(win: any): void {
  speedShortcuts?.unlisten(win);
  try {
    removeSpeedToast(win.document);
  } catch {
    // Window already gone
  }
}

Zotero.ZoteroTTS = { startup, shutdown, onMainWindowLoad, onMainWindowUnload, prefsPane: { onPaneLoad } };
