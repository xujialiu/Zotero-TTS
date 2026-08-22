import type { ProviderId, TTSProvider } from '../core/providers/types';
import { getLocalEngine, LOCAL_ENGINES } from '../core/providers/local/registry';
import { createProvider } from '../core/providers/factory';
import { createZoteroPrefs, loadSettings } from '../core/settings';
import { getChromeWebSocket, newRequestId } from '../core/providers/azure';
import { initShortcutRows } from './shortcut-rows';

export function engineOptions(): { value: string; label: string }[] {
  return LOCAL_ENGINES.map((e) => ({ value: e.id, label: e.label }));
}

/** Source for the capability line shown under each provider in the preferences pane. */
export function highlightCapabilityLabel(provider: ProviderId, engineId: string): 'word' | 'sentence' {
  if (provider === 'azure') return 'word';
  if (provider === 'openai') return 'sentence';
  return getLocalEngine(engineId)?.capabilities.wordTimestamps ? 'word' : 'sentence';
}

export async function testConnection(provider: TTSProvider): Promise<{ ok: boolean; message: string }> {
  try {
    const voices = await provider.listVoices();
    return { ok: true, message: `Connected. ${voices.length} voices available.` };
  } catch (e) {
    const kind = (e as { kind?: string })?.kind;
    if (kind === 'local-server-down') {
      return { ok: false, message: 'Local TTS server is not running at that address.' };
    }
    if (kind === 'no-key') {
      return { ok: false, message: 'No API key set for this provider.' };
    }
    return { ok: false, message: `Connection failed: ${String(e)}` };
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
  initShortcutRows(doc, createZoteroPrefs(), Zotero.isMac ? 'Cmd' : Zotero.isWin ? 'Win' : 'Super');

  const popup = doc.getElementById('ztts-engine-popup');
  if (popup) {
    popup.replaceChildren(
      ...engineOptions().map((o) => {
        const item = doc.createXULElement('menuitem');
        item.setAttribute('value', o.value);
        item.setAttribute('label', o.label);
        return item;
      }),
    );
  }

  const refreshCapability = () => {
    const s = loadSettings(createZoteroPrefs());
    const el = doc.getElementById('ztts-capability');
    if (el) {
      const level = highlightCapabilityLabel(s.provider, s.local.engine);
      el.setAttribute('value', level === 'word' ? 'Word-level highlighting' : 'Sentence-level highlighting only');
    }
  };
  refreshCapability();
  doc.getElementById('ztts-provider')?.addEventListener('command', refreshCapability);
  doc.getElementById('ztts-engine')?.addEventListener('command', refreshCapability);

  doc.getElementById('ztts-test')?.addEventListener('command', async () => {
    const result = doc.getElementById('ztts-test-result');
    result?.setAttribute('value', 'Testing…');
    const settings = loadSettings(createZoteroPrefs());
    let message: string;
    try {
      const provider = createProvider(settings, {
        fetch,
        getWebSocket: getChromeWebSocket,
        newRequestId,
      });
      message = (await testConnection(provider)).message;
    } catch (e) {
      message = `Connection failed: ${String(e)}`;
    }
    result?.setAttribute('value', message);
  });
}
