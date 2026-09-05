import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PRESETS, SERVER_PRESETS } from '../../src/core/server-presets';
import { PREF_PREFIX, type PrefsBackend } from '../../src/core/settings';
import { FIELD_IDS, initServerPresetRows, SERVER_HELP_ID, SERVER_MENU_ID } from '../../src/ui/server-preset-rows';

function fakePrefs(initial: Record<string, unknown> = {}): PrefsBackend & { store: Record<string, unknown> } {
  const store = { ...initial };
  return { store, get: (k) => store[k], set: (k, v) => void (store[k] = v) };
}

class FakeElement {
  value = '';
  disabled = false;
  attrs = new Map<string, string>();
  listeners = new Map<string, Array<() => void>>();
  setAttribute(k: string, v: string) {
    this.attrs.set(k, String(v));
  }
  addEventListener(type: string, fn: () => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type)!.push(fn);
  }
  fire(type: string) {
    for (const fn of this.listeners.get(type) ?? []) fn();
  }
}

const key = (k: string) => `${PREF_PREFIX}openai.${k}`;

function setup(initial: Record<string, unknown> = {}) {
  const ids = [SERVER_MENU_ID, SERVER_HELP_ID, ...Object.values(FIELD_IDS)];
  const els = new Map(ids.map((id) => [id, new FakeElement()]));
  const doc = { getElementById: (id: string) => els.get(id) ?? null };
  const prefs = fakePrefs(initial);
  const rows = initServerPresetRows(doc, prefs);
  const menu = els.get(SERVER_MENU_ID)!;
  return {
    prefs,
    rows,
    menu,
    // The preset's note is the tooltip of the ? beside the dropdown (ui/help-tips.ts reads `help`)
    note: () => els.get(SERVER_HELP_ID)!.attrs.get('help'),
    disabled: () => Object.fromEntries(Object.entries(FIELD_IDS).map(([field, id]) => [field, els.get(id)!.disabled])),
    choose(id: string) {
      menu.value = id;
      menu.fire('command');
    },
  };
}

describe('initServerPresetRows', () => {
  it('shows the preset in force on load and grays out the fields it does not use', () => {
    const fresh = setup();
    expect(fresh.menu.value).toBe('openai');
    expect(fresh.disabled()).toEqual({ apiKey: false, baseURL: false, model: false, voices: false, headers: true });
    expect(fresh.note()).toBe(PRESETS.openai.note);

    const custom = setup({ [key('baseURL')]: 'http://localhost:8004' });
    expect(custom.menu.value).toBe('other');
    expect(Object.values(custom.disabled()).every((d) => d === false)).toBe(true);
    // Nothing is written just by loading
    expect(custom.prefs.store[key('server')]).toBeUndefined();
    expect(custom.prefs.store[key('baseURL')]).toBe('http://localhost:8004');
  });

  it('switching writes the choice and the preset defaults, and grays out its unused fields', () => {
    const t = setup({ [key('baseURL')]: 'https://api.openai.com', [key('model')]: 'gpt-4o-mini-tts' });
    t.choose('chatterbox');
    expect(t.prefs.store[key('server')]).toBe('chatterbox');
    expect(t.prefs.store[key('baseURL')]).toBe('http://localhost:8004');
    expect(t.prefs.store[key('model')]).toBe('tts-1');
    expect(t.disabled()).toEqual({ apiKey: true, baseURL: false, model: true, voices: true, headers: false });
    expect(t.note()).toBe(PRESETS.chatterbox.note);
  });

  it('"other" re-enables everything and overwrites nothing', () => {
    const t = setup({ [key('server')]: 'chatterbox', [key('baseURL')]: 'http://nas:8004' });
    t.choose('other');
    expect(t.prefs.store[key('server')]).toBe('other');
    expect(t.prefs.store[key('baseURL')]).toBe('http://nas:8004');
    expect(Object.values(t.disabled()).every((d) => d === false)).toBe(true);
  });

  it('treats an unknown menu value as "other"', () => {
    const t = setup();
    t.choose('nonsense');
    expect(t.prefs.store[key('server')]).toBe('other');
  });

  it('refresh re-reads the prefs, as after a settings restore', () => {
    const t = setup();
    t.prefs.store[key('server')] = 'chatterbox';
    t.rows.refresh();
    expect(t.menu.value).toBe('chatterbox');
    expect(t.disabled().apiKey).toBe(true);
  });

  // Issue #34: every pick used to write the preset's defaults, so a look at
  // another server and back replaced the user's own address with them.
  it('switching away and back gives the user their own address and model back', () => {
    const t = setup({ [key('server')]: 'chatterbox', [key('baseURL')]: 'https://h200-chatterbox.example', [key('model')]: 'tts-1' });
    t.choose('openai');
    // The first visit to a preset still fills in its defaults, as the README promises
    expect(t.prefs.store[key('baseURL')]).toBe('https://api.openai.com');
    expect(t.prefs.store[key('model')]).toBe('gpt-4o-mini-tts');
    t.choose('chatterbox');
    expect(t.prefs.store[key('server')]).toBe('chatterbox');
    expect(t.prefs.store[key('baseURL')]).toBe('https://h200-chatterbox.example');
    expect(t.prefs.store[key('model')]).toBe('tts-1');
    // Both servers' values wait in the pref for the next visit
    expect(JSON.parse(t.prefs.store[key('presetValues')] as string)).toEqual({
      chatterbox: { baseURL: 'https://h200-chatterbox.example', model: 'tts-1' },
      openai: { baseURL: 'https://api.openai.com', model: 'gpt-4o-mini-tts' },
    });
  });

  it('"other" gets its own address back too, where nothing used to write it', () => {
    const t = setup({ [key('server')]: 'other', [key('baseURL')]: 'https://api.groq.com/openai', [key('model')]: 'playai-tts' });
    t.choose('openai');
    expect(t.prefs.store[key('baseURL')]).toBe('https://api.openai.com');
    t.choose('other');
    expect(t.prefs.store[key('baseURL')]).toBe('https://api.groq.com/openai');
    expect(t.prefs.store[key('model')]).toBe('playai-tts');
  });

  it('remembers in the prefs, so the memory survives the pane being reopened', () => {
    const first = setup({ [key('server')]: 'chatterbox', [key('baseURL')]: 'http://nas:8004' });
    first.choose('openai');
    const reopened = setup({ ...first.prefs.store });
    expect(reopened.menu.value).toBe('openai');
    reopened.choose('chatterbox');
    expect(reopened.prefs.store[key('baseURL')]).toBe('http://nas:8004');
  });

  it('re-picking the current preset keeps an edit made since the last visit', () => {
    const t = setup({ [key('server')]: 'openai', [key('presetValues')]: JSON.stringify({ openai: { baseURL: 'https://api.openai.com', model: 'gpt-4o-mini-tts' } }) });
    // Typed into the bound Base URL input since
    t.prefs.store[key('baseURL')] = 'https://api.openai.com/v1';
    t.choose('openai');
    expect(t.prefs.store[key('baseURL')]).toBe('https://api.openai.com/v1');
  });

  it('files settings from before the dropdown under the preset guessed for them', () => {
    // No stored choice: http://nas:8004 reads as "other" (core/server-presets.ts serverPreset)
    const t = setup({ [key('baseURL')]: 'http://nas:8004' });
    t.choose('chatterbox');
    expect(t.prefs.store[key('baseURL')]).toBe('http://localhost:8004');
    t.choose('other');
    expect(t.prefs.store[key('baseURL')]).toBe('http://nas:8004');
  });

  it('tolerates a pane that lacks the rows', () => {
    expect(() => initServerPresetRows({ getElementById: () => null }, fakePrefs())).not.toThrow();
  });
});

// The rows are found by id; the note has no line of its own any more — it
// is the tooltip of the ? after the dropdown.
describe('addon/content/preferences.xhtml', () => {
  it('has the Server dropdown, the ? beside it, and every field', () => {
    const xhtml = readFileSync(new URL('../../addon/content/preferences.xhtml', import.meta.url), 'utf8');
    expect(xhtml).toContain(`id="${SERVER_MENU_ID}"`);
    expect(xhtml).toMatch(new RegExp(`<label id="${SERVER_HELP_ID}" class="ztts-help" value="\?"`));
    for (const id of Object.values(FIELD_IDS)) expect(xhtml, id).toContain(`id="${id}"`);
    expect(xhtml).not.toContain('ztts-openai-server-note');
    // One menu item per preset, in the dropdown's order
    for (const id of SERVER_PRESETS) expect(xhtml, id).toContain(`<menuitem value="${id}"`);
  });
});
