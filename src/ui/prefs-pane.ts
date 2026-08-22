import type { TTSProvider } from '../core/providers/types';
import { LOCAL_ENGINES } from '../core/providers/local/registry';
import { createProvider } from '../core/providers/factory';
import { createZoteroPrefs, loadSettings, PROVIDER_IDS } from '../core/settings';
import { getChromeWebSocket, newRequestId } from '../core/providers/azure';
import { initShortcutRows } from './shortcut-rows';

export function engineOptions(): { value: string; label: string }[] {
  return LOCAL_ENGINES.map((e) => ({ value: e.id, label: e.label }));
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
  const prefs = createZoteroPrefs();
  initShortcutRows(doc, prefs, Zotero.isMac ? 'Cmd' : Zotero.isWin ? 'Win' : 'Super');

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
    // Zotero synced the pref into the menulist before these items existed,
    // so nothing was selected; apply the stored value again now
    const menulist = doc.getElementById('ztts-engine') as (HTMLElement & { value: string }) | null;
    if (menulist) menulist.value = loadSettings(prefs).local.engine;
  }

  for (const id of PROVIDER_IDS) {
    doc.getElementById(`ztts-test-${id}`)?.addEventListener('command', async () => {
      const result = doc.getElementById(`ztts-test-result-${id}`);
      result?.setAttribute('value', 'Testing…');
      let message: string;
      try {
        const provider = createProvider(id, loadSettings(prefs), {
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
}
