import type { TTSProvider } from '../core/providers/types';
import { LOCAL_ENGINES } from '../core/providers/local/registry';
import { createProvider } from '../core/providers/factory';
import { createZoteroPrefs, loadSettings, PROVIDER_IDS } from '../core/settings';
import { getChromeWebSocket, newRequestId } from '../core/providers/azure';
import { SynthesisError } from '../core/providers/errors';
import { withTimeout } from '../core/timeout';
import { initShortcutRows } from './shortcut-rows';

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
 * was chosen, says whether the server lists it.
 */
export async function testConnection(
  provider: TTSProvider,
  options: { timeoutMs?: number; model?: string } = {},
): Promise<ConnectionResult> {
  const timeoutMs = options.timeoutMs ?? TEST_CONNECTION_TIMEOUT_MS;
  try {
    const { models, voices } = await withTimeout(
      (async () => {
        let models: string[] | undefined;
        if (provider.listModels) models = await provider.listModels();
        else await provider.checkConnection?.();
        return { models, voices: await provider.listVoices() };
      })(),
      timeoutMs,
      () => new SynthesisError('network', `No reply within ${Math.round(timeoutMs / 1000)} s`),
    );
    const voicesPart = `${voices.length} voices available.`;
    if (models?.length && options.model) {
      return models.includes(options.model)
        ? { ok: true, models, message: `Connected. Model ${options.model} available. ${voicesPart}` }
        : { ok: true, models, message: `Connected, but model "${options.model}" is not listed by this server. ${voicesPart}` };
    }
    return { ok: true, models, message: `Connected. ${voicesPart}` };
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
export async function registerPrefsPane(rootURI: string, pluginID: string): Promise<void> {
  await Zotero.PreferencePanes.register({
    pluginID,
    id: 'zotero-tts-pane',
    src: rootURI + 'content/preferences.xhtml',
    label: 'TTS',
  });
}

export function onPaneLoad(doc: Document): void {
  const prefs = createZoteroPrefs();
  initShortcutRows(doc, prefs, Zotero.isMac ? 'Cmd' : Zotero.isWin ? 'Win' : 'Super');

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
        outcome = await testConnection(provider, { model: id === 'openai' ? settings.openai.model : undefined });
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
