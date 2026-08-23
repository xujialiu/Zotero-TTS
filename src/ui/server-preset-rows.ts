import { loadSettings, PREF_PREFIX, type PrefsBackend } from '../core/settings';
import { PRESETS, SERVER_PRESETS, serverPreset, type OpenAIField, type ServerPreset } from '../core/server-presets';

/**
 * The Server dropdown of the OpenAI section. Not bound with preference=:
 * switching presets has side effects — the preset's defaults are written
 * once, the fields it does not use are greyed out — which must happen on
 * the user's action only, never on load, so that stored values survive.
 * The bound inputs redraw themselves when the defaults are written.
 */

export const SERVER_MENU_ID = 'ztts-openai-server';
export const SERVER_NOTE_ID = 'ztts-openai-server-note';
export const FIELD_IDS: Record<OpenAIField, string> = {
  apiKey: 'ztts-openai-apiKey',
  baseURL: 'ztts-openai-baseURL',
  model: 'ztts-openai-model',
  voices: 'ztts-openai-voices',
  headers: 'ztts-openai-headers',
};

interface ElementLike {
  value?: string;
  disabled?: boolean;
  setAttribute(name: string, value: string): void;
  addEventListener(type: string, fn: () => void): void;
}

interface RowsDocument {
  getElementById(id: string): ElementLike | null;
}

export function initServerPresetRows(doc: RowsDocument, prefs: PrefsBackend): { refresh(): void } {
  const menu = doc.getElementById(SERVER_MENU_ID);
  const pref = (key: string) => `${PREF_PREFIX}openai.${key}`;

  const render = (id: ServerPreset) => {
    const spec = PRESETS[id];
    if (menu) menu.value = id;
    for (const [field, elementId] of Object.entries(FIELD_IDS) as [OpenAIField, string][]) {
      const el = doc.getElementById(elementId);
      if (el) el.disabled = !spec.uses[field];
    }
    doc.getElementById(SERVER_NOTE_ID)?.setAttribute('value', spec.note);
  };

  const refresh = () => render(serverPreset(loadSettings(prefs).openai));

  menu?.addEventListener('command', () => {
    const chosen = menu.value ?? '';
    const id: ServerPreset = (SERVER_PRESETS as readonly string[]).includes(chosen) ? (chosen as ServerPreset) : 'other';
    prefs.set(pref('server'), id);
    for (const [key, value] of Object.entries(PRESETS[id].defaults)) prefs.set(pref(key), value);
    render(id);
  });

  refresh();
  return { refresh };
}
