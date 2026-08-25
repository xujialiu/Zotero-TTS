import type { ProviderId, TTSProvider } from '../core/providers/types';
import { LOCAL_ENGINES } from '../core/providers/local/registry';
import { createProvider } from '../core/providers/factory';
import { createZoteroPrefs, loadSettings, PROVIDER_IDS, type PrefsBackend } from '../core/settings';
import { getChromeWebSocket, newRequestId } from '../core/providers/azure';
import { SynthesisError } from '../core/providers/errors';
import { withTimeout } from '../core/timeout';
import { createWebDAVClient } from '../core/webdav';
import { listNamedCatalog } from '../read-aloud/catalog';
import { initShortcutRows } from './shortcut-rows';
import { initBackupRows, type BackupFileIO } from './backup-rows';
import { initServerPresetRows } from './server-preset-rows';
import { initWebDAVRows } from './webdav-rows';
import { initHighlightRows } from './highlight-rows';
import { createSamplePlayer, initVoiceBrowserRows } from './voice-browser-rows';
import { resolveReaderTheme, type ResolvedReaderTheme } from '../core/reader-theme';

const XHTML = 'http://www.w3.org/1999/xhtml';

/** Display name of the configured local engine, from the registry; the raw id if it is unknown. */
export function engineLabel(engineId: string): string {
  return LOCAL_ENGINES.find((e) => e.id === engineId)?.label ?? engineId;
}

export const TEST_CONNECTION_TIMEOUT_MS = 15_000;

export type ConnectionResult = {
  ok: boolean;
  message: string;
  /** The server's model ids, when it has a model list. */
  models?: string[];
};

/**
 * Model ids with the speech-related ones first. OpenAI's /v1/models lists
 * everything the account can use — chat, embeddings, whisper — and the
 * handful of TTS models would otherwise drown in it.
 */
export function rankModelsForSpeech(ids: string[]): string[] {
  const speech = /tts|speech|kokoro|voice|audio/i;
  const by = (a: string, b: string) => a.localeCompare(b);
  return [...ids.filter((id) => speech.test(id)).sort(by), ...ids.filter((id) => !speech.test(id)).sort(by)];
}

/**
 * Prove the provider's configuration works: its probe first (for OpenAI,
 * whose voice list does not need the key), then the voice list. Bounded by a
 * timeout, because a server that never answers must read as a failure here,
 * not as "Testing…" forever. When the server has a model list and a model
 * was chosen, says whether the server lists it. With `synthesisVoice` set
 * (or `probeSynthesis`, which uses the first listed voice), also proves the
 * account can synthesize (checkSynthesis) — a key lists voices fine after
 * its quota ran out, and only this stage would say so.
 */
export async function testConnection(
  provider: TTSProvider,
  options: { timeoutMs?: number; model?: string; synthesisVoice?: string; probeSynthesis?: boolean } = {},
): Promise<ConnectionResult> {
  const timeoutMs = options.timeoutMs ?? TEST_CONNECTION_TIMEOUT_MS;
  const timeout = () => new SynthesisError('network', `No reply within ${Math.round(timeoutMs / 1000)} s`);
  let models: string[] | undefined;
  try {
    const listed = await withTimeout(
      (async () => {
        if (provider.listModels) models = await provider.listModels();
        else await provider.checkConnection?.();
        return { voices: await provider.listVoices() };
      })(),
      timeoutMs,
      timeout,
    );
    let synthesisPart = '';
    // Probe with the configured voice, else the first voice the server just
    // listed — a fixed name like "alloy" is wrong on servers with their own
    // voice library, and the listed voices are ground truth everywhere.
    const probeVoice = options.synthesisVoice ?? (options.probeSynthesis ? listed.voices[0]?.id : undefined);
    if (probeVoice && provider.checkSynthesis) {
      try {
        await withTimeout(provider.checkSynthesis(probeVoice), timeoutMs, timeout);
        synthesisPart = ' Synthesis works.';
      } catch (e) {
        // The server answered; what failed is spending, not connecting —
        // say so instead of the generic "Connection failed".
        const detail = e instanceof Error ? e.message : String(e);
        return { ok: false, models, message: `Connected, but synthesis failed: ${detail}` };
      }
    }
    // A provider that can prove word timestamps (Kokoro) does so here: any
    // OpenAI-compatible server lists voices fine, so only this tells a wrong
    // server apart while the user is still in the pane (issue #1).
    let timestampsPart = '';
    const timestampsVoice = listed.voices[0]?.id;
    if (timestampsVoice && provider.checkWordTimestamps) {
      try {
        const probed = await withTimeout(provider.checkWordTimestamps(timestampsVoice), timeoutMs, timeout);
        timestampsPart = probed.ok ? ' Word timestamps available.' : ` No word timestamps: ${probed.detail ?? 'the server did not return any'}.`;
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        return { ok: false, models, message: `Connected, but the word-timestamp check failed: ${detail}` };
      }
    }
    const voicesPart = `${listed.voices.length} voices available.`;
    if (models?.length && options.model) {
      return models.includes(options.model)
        ? { ok: true, models, message: `Connected. Model ${options.model} available. ${voicesPart}${synthesisPart}${timestampsPart}` }
        : { ok: true, models, message: `Connected, but model "${options.model}" is not listed by this server. ${voicesPart}${synthesisPart}${timestampsPart}` };
    }
    return { ok: true, models, message: `Connected. ${voicesPart}${synthesisPart}${timestampsPart}` };
  } catch (e) {
    const kind = (e as { kind?: string })?.kind;
    const detail = e instanceof Error ? e.message : String(e);
    if (kind === 'local-server-down') {
      return { ok: false, message: 'Local TTS server is not running at that address.' };
    }
    if (kind === 'no-key') {
      return { ok: false, message: 'No API key set for this provider.' };
    }
    if (kind === 'auth') {
      return { ok: false, message: `The server rejected the API key. (${detail})` };
    }
    if (kind === 'network') {
      return { ok: false, message: `Cannot connect: ${detail}` };
    }
    return { ok: false, message: `Connection failed: ${detail}` };
  }
}

/**
 * No `scripts` here on purpose: Zotero runs pane scripts before the pane's
 * markup is parsed and inserted, so a script cannot reach any element. The
 * root <vbox> of preferences.xhtml instead calls onPaneLoad from its
 * `onload`, which Zotero dispatches after insertion and pref binding.
 */
let pluginVersion = '';

export async function registerPrefsPane(rootURI: string, pluginID: string, version = ''): Promise<void> {
  pluginVersion = version;
  await Zotero.PreferencePanes.register({
    pluginID,
    id: 'zotero-tts-pane',
    src: rootURI + 'content/preferences.xhtml',
    label: 'TTS',
  });
}

/** File dialogs and file access for the Backup group, on Zotero's own helpers. */
function backupFileIO(win: any): BackupFileIO {
  const pick = async (title: string, mode: 'open' | 'save', defaultName?: string): Promise<string | null> => {
    const { FilePicker } = ChromeUtils.importESModule('chrome://zotero/content/modules/filePicker.mjs');
    const fp = new FilePicker();
    fp.init(win, title, mode === 'save' ? fp.modeSave : fp.modeOpen);
    fp.appendFilter('JSON', '*.json');
    fp.defaultExtension = 'json';
    if (defaultName) fp.defaultString = defaultName;
    const rv = await fp.show();
    // The chosen path is `file` (a string, despite the name); there is no `path`
    const chosen = rv === fp.returnOK || rv === fp.returnReplace ? fp.file : null;
    return typeof chosen === 'string' && chosen ? chosen : null;
  };
  return {
    pickSavePath: (defaultName) => pick('Backup Zotero TTS settings', 'save', defaultName),
    pickOpenPath: () => pick('Restore Zotero TTS settings', 'open'),
    // IOUtils is handed to the plugin scope by Zotero's plugin loader
    writeFile: async (path, text) => {
      await IOUtils.writeUTF8(path, text);
    },
    readFile: (path) => IOUtils.readUTF8(path),
  };
}

/**
 * One bounded sample synthesis for the voice browser's play button. The
 * AbortController comes from the pane's chrome window — the plugin
 * sandbox's whitelist has none — and without one the timeout still fires,
 * only the request is not cancelled.
 */
async function synthesizeSample(win: any, prefs: PrefsBackend, id: ProviderId, voiceId: string, text: string): Promise<Blob> {
  const provider = createProvider(id, loadSettings(prefs), { fetch, getWebSocket: getChromeWebSocket, newRequestId });
  let controller: { signal: AbortSignal; abort(): void } | null = null;
  try {
    if (win?.AbortController) controller = new win.AbortController();
  } catch {
    controller = null;
  }
  const signal = controller?.signal ?? ({ aborted: false, addEventListener() {}, removeEventListener() {} } as unknown as AbortSignal);
  const result = await withTimeout(
    provider.synthesize(text, { voice: voiceId, signal }),
    TEST_CONNECTION_TIMEOUT_MS,
    () => new SynthesisError('network', `No audio within ${Math.round(TEST_CONNECTION_TIMEOUT_MS / 1000)} s`),
    () => controller?.abort(),
  );
  return result.audio;
}

/**
 * The theme the reader is showing right now, resolved as the reader does
 * (core/reader-theme.ts): the app's color scheme picks the light or the
 * dark theme pref, among Zotero's themes and the user's custom ones.
 */
function currentReaderTheme(win: any): ResolvedReaderTheme {
  let dark = false;
  try {
    dark = !!win?.matchMedia?.('(prefers-color-scheme: dark)')?.matches;
  } catch {
    // A window without matchMedia is a light one
  }
  let customThemes: unknown = [];
  try {
    customThemes = Zotero.SyncedSettings.get(Zotero.Libraries.userLibraryID, 'readerCustomThemes') ?? [];
  } catch {
    // No synced settings (not logged in, or an older Zotero): built-in themes only
  }
  return resolveReaderTheme({
    appScheme: dark ? 'dark' : 'light',
    lightTheme: Zotero.Prefs.get('reader.lightTheme'),
    darkTheme: Zotero.Prefs.get('reader.darkTheme'),
    customThemes,
  });
}

export function onPaneLoad(doc: Document): void {
  const prefs = createZoteroPrefs();
  const shortcutRows = initShortcutRows(doc, prefs, Zotero.isMac ? 'Cmd' : Zotero.isWin ? 'Win' : 'Super');
  const presetRows = initServerPresetRows(doc, prefs);
  const highlightRows = initHighlightRows(doc, prefs, { theme: () => currentReaderTheme(doc.defaultView) });

  const win = doc.defaultView;
  const voiceBrowserRows = initVoiceBrowserRows(doc, {
    prefs,
    // The very catalog the Read Aloud interface publishes, so the browser
    // and the popup agree on voices and names. Bounded like every network
    // call: a hanging server must become a status line, not a spinner.
    listCatalog: () => {
      const settings = loadSettings(prefs);
      return withTimeout(
        listNamedCatalog(settings, (id) => createProvider(id, settings, { fetch, getWebSocket: getChromeWebSocket, newRequestId }), (e) => Zotero.logError(e)),
        TEST_CONNECTION_TIMEOUT_MS,
        () => new SynthesisError('network', `No voice list within ${Math.round(TEST_CONNECTION_TIMEOUT_MS / 1000)} s`),
      );
    },
    synthesizeSample: (id, voiceId, text) => synthesizeSample(win, prefs, id, voiceId, text),
    // A detached element plays fine; the pane window closing stops it
    player: createSamplePlayer(() => doc.createElementNS(XHTML, 'audio') as HTMLAudioElement),
    localeName: (code) => {
      try {
        return new Intl.DisplayNames([Zotero.locale ?? 'en'], { type: 'language' }).of(code) ?? code;
      } catch {
        return code;
      }
    },
  });
  // The popup lists the catalog on every open; the pane doing the same on
  // load costs one request per enabled provider and spends nothing.
  void voiceBrowserRows.load();

  const restoreDeps = {
    prefs,
    pluginVersion,
    now: () => new Date().toISOString(),
    confirm: (message: string): boolean => Services.prompt.confirm(win, 'Zotero TTS', message),
    // Bound inputs redraw themselves (Zotero observes every bound pref); these rows do not
    onRestored: () => {
      shortcutRows.refresh();
      presetRows.refresh();
      highlightRows.refresh();
      voiceBrowserRows.refresh();
    },
  };
  initBackupRows(doc, { ...backupFileIO(win), ...restoreDeps });
  // The sandbox's own fetch: Basic auth needs nothing from a window
  initWebDAVRows(doc, { ...restoreDeps, createClient: (cfg) => createWebDAVClient(cfg, { fetch }) });

  doc.getElementById('ztts-local-enable')?.setAttribute('label', `Enable ${engineLabel(loadSettings(prefs).local.engine)}`);

  for (const id of PROVIDER_IDS) {
    doc.getElementById(`ztts-test-${id}`)?.addEventListener('command', async () => {
      const result = doc.getElementById(`ztts-test-result-${id}`);
      result?.setAttribute('value', 'Testing…');
      const settings = loadSettings(prefs);
      let outcome: ConnectionResult;
      try {
        const provider = createProvider(id, settings, {
          fetch,
          getWebSocket: getChromeWebSocket,
          newRequestId,
        });
        outcome = await testConnection(provider, {
          model: id === 'openai' ? settings.openai.model : undefined,
          // Azure and OpenAI cost money and have quotas, so their test also
          // proves the account can spend; the local engine has neither.
          // Azure probes its configured voice; OpenAI-compatible servers get
          // the first voice they list, since a fixed name would be wrong.
          synthesisVoice: id === 'azure' ? settings.azure.voice : undefined,
          probeSynthesis: id === 'openai',
        });
      } catch (e) {
        outcome = { ok: false, message: `Connection failed: ${String(e)}` };
      }
      result?.setAttribute('value', outcome.message);
      // Offer the server's models as suggestions under the Model field
      const suggestions = doc.getElementById(`ztts-${id}-models`);
      if (suggestions && outcome.models) {
        suggestions.replaceChildren(
          ...rankModelsForSpeech(outcome.models).map((model) => {
            const option = doc.createElementNS(XHTML, 'option') as HTMLOptionElement;
            option.value = model;
            return option;
          }),
        );
      }
    });
  }
}
