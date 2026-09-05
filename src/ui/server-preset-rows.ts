import { loadSettings, PREF_PREFIX, type PrefsBackend } from '../core/settings';
import { parsePresetValues, PRESETS, SERVER_PRESETS, serverPreset, switchPreset, type OpenAIField, type ServerPreset } from '../core/server-presets';
import { HELP_ATTRIBUTE } from './help-tips';

/**
 * The Server dropdown of the OpenAI section. Not bound with preference=:
 * switching presets has side effects — the address, model, key, voices and
 * headers the user last used with the chosen server are written (its
 * defaults and blanks on a first visit, issues #34 and #52), the fields it
 * does not use are grayed out — which must happen on the
 * user's action only, never on load, so that stored values survive. The
 * bound inputs redraw themselves when the values are written. The preset's
 * note is the tooltip of the ? beside the dropdown (ui/help-tips.ts opens
 * it from the icon's `help` attribute).
 */

export const SERVER_MENU_ID = 'ztts-openai-server';
export const SERVER_HELP_ID = 'ztts-openai-server-help';
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
    doc.getElementById(SERVER_HELP_ID)?.setAttribute(HELP_ATTRIBUTE, spec.note);
  };

  const refresh = () => render(serverPreset(loadSettings(prefs).openai));

  menu?.addEventListener('command', () => {
    const chosen = menu.value ?? '';
    const id: ServerPreset = (SERVER_PRESETS as readonly string[]).includes(chosen) ? (chosen as ServerPreset) : 'other';
    // The preset being left is read from the prefs — the menu already shows
    // the new one — and its address and model are filed under it before
    // anything is written, so a switch back finds them again (issue #34)
    const before = loadSettings(prefs).openai;
    const { remembered, values } = switchPreset(parsePresetValues(before.presetValues), serverPreset(before), id, before);
    prefs.set(pref('presetValues'), JSON.stringify(remembered));
    prefs.set(pref('server'), id);
    for (const [key, value] of Object.entries(values)) prefs.set(pref(key), value);
    render(id);
  });

  refresh();
  return { refresh };
}
