import { getChromeWebSocket, newRequestId } from './core/providers/azure';
import { createProvider } from './core/providers/factory';
import type { ProviderId, VoiceInfo } from './core/providers/types';
import { createMemoryCache } from './core/memory-cache';
import { createZoteroPrefs, loadSettings } from './core/settings';
import { installHijack } from './modes/hijack';
import { createRemoteInterface, type RemoteInterface } from './modes/hijack/remote-interface';
import { onPaneLoad, registerPrefsPane } from './ui/prefs-pane';

export interface StartupParams {
  id: string;
  version: string;
  rootURI: string;
}

let uninstallHijack: (() => void) | null = null;
let pluginVersion = '0.0.0';

const prefs = createZoteroPrefs();

/** The cache key includes a config fingerprint, so old audio automatically invalidates after the provider or voice changes. */
function cacheVersion(): string {
  const s = loadSettings(prefs);
  return [pluginVersion, s.provider, s.openai.model, s.azure.region, s.local.engine, s.local.baseURL].join('|');
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

async function listCatalog(): Promise<{ provider: ProviderId; voices: VoiceInfo[] }[]> {
  const settings = loadSettings(prefs);
  const provider = createProvider(settings, providerDeps());
  return [{ provider: settings.provider, voices: await provider.listVoices() }];
}

function startHijack(): void {
  uninstallHijack?.();
  // makeInterface only runs when Zotero calls it; targetWindow is the
  // reader iframe window it passes in — it doesn't exist yet at push
  // time (see Task 13).
  uninstallHijack = installHijack(Zotero.Reader._readers, (reader: any, targetWindow: any) =>
    wrapForWindow(
      targetWindow,
      createRemoteInterface({
        listCatalog,
        // Must honor the passed-in id: Zotero remembers the last-selected
        // voice, and after the user switches provider in settings, that
        // leftover selection may still point at a different provider.
        getProvider: (id) => createProvider({ ...loadSettings(prefs), provider: id }, providerDeps()),
        getSpeed: () => loadSettings(prefs).speed,
        cacheVersion,
        cache: loadSettings(prefs).cacheAudio ? audioCache : undefined,
        log: (e) => Zotero.logError(e),
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

async function startup({ id, version, rootURI }: StartupParams): Promise<void> {
  pluginVersion = version;
  await registerPrefsPane(rootURI, id);

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
  Zotero.debug('[zotero-tts] started');
}

async function shutdown(): Promise<void> {
  uninstallHijack?.();
  uninstallHijack = null;
  Zotero.debug('[zotero-tts] stopped');
}

Zotero.ZoteroTTS = { startup, shutdown, prefsPane: { onPaneLoad } };
