import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { PREF_PREFIX, type PrefsBackend } from '../../src/core/settings';
import { FAVORITES_ONLY_OBSERVER } from '../../src/read-aloud/favorites';
import { initVoiceListSwitches, VOICE_LIST_SWITCHES } from '../../src/ui/voice-list-switches';

function fakePrefs(initial: Record<string, unknown> = {}): PrefsBackend & { store: Record<string, unknown> } {
  const store = { ...initial };
  return { store, get: (k) => store[k], set: (k, v) => void (store[k] = v) };
}

/** A XUL checkbox: the click flips `checked` itself, then `command` fires. */
class FakeCheckbox {
  checked = false;
  listeners = new Map<string, Array<() => unknown>>();
  addEventListener(type: string, fn: () => unknown) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type)!.push(fn);
  }
  click() {
    this.checked = !this.checked;
    for (const fn of this.listeners.get('command') ?? []) fn();
  }
}

const FAVORITES = VOICE_LIST_SWITCHES.find((s) => s.pref === 'readAloud.favoritesOnly')!;

function setup(options: { prefs?: Record<string, unknown>; reading?: string[]; watch?: boolean } = {}) {
  const boxes = new Map(VOICE_LIST_SWITCHES.map((s) => [s.id, new FakeCheckbox()]));
  const doc = { getElementById: (id: string) => boxes.get(id) ?? null };
  const prefs = fakePrefs(options.prefs);
  const warn = vi.fn((_message: string) => {});
  const watchers: Array<{ name: string; onChange: () => void }> = [];
  const rows = initVoiceListSwitches(doc, {
    prefs,
    readingTabs: () => options.reading ?? [],
    warn,
    watch:
      options.watch === false
        ? undefined
        : (name, onChange) => {
            const entry = { name, onChange };
            watchers.push(entry);
            return () => void watchers.splice(watchers.indexOf(entry), 1);
          },
  });
  return {
    prefs,
    rows,
    warn,
    watchers,
    box: (id: string) => boxes.get(id)!,
    value: (pref: string) => prefs.store[PREF_PREFIX + pref],
    /** What an observer of `pref` firing does — a settings restore. */
    notify: (pref: string) => watchers.filter((w) => w.name === `zotero-tts.${pref}`).forEach((w) => w.onChange()),
  };
}

describe('initVoiceListSwitches', () => {
  // Issue #17 retired the second one, *Hide System Local voices*: hiding
  // Zotero's own Local voices is unconditional now and has no setting.
  it('covers exactly the switches that edit what the player lists, and names their observers as Zotero does', () => {
    expect(VOICE_LIST_SWITCHES.map((s) => s.pref)).toEqual(['readAloud.favoritesOnly']);
    expect(FAVORITES.observer).toBe(FAVORITES_ONLY_OBSERVER);
    expect('extensions.zotero.' + FAVORITES_ONLY_OBSERVER).toBe(PREF_PREFIX + 'readAloud.favoritesOnly');
  });

  it('paints every box from its pref on load', () => {
    const t = setup({ prefs: { [PREF_PREFIX + FAVORITES.pref]: true } });
    expect(t.box(FAVORITES.id).checked).toBe(true);
    expect(setup().box(FAVORITES.id).checked).toBe(false);
  });

  it('writes the pref while nothing is reading, in both directions', () => {
    const t = setup();
    t.box(FAVORITES.id).click();
    expect(t.value(FAVORITES.pref)).toBe(true);
    expect(t.warn).not.toHaveBeenCalled();
    t.box(FAVORITES.id).click();
    expect(t.value(FAVORITES.pref)).toBe(false);
  });

  // The list is rebuilt only when the player opens, so a switch that moved
  // now would leave the tabs listing different voices (ui/reading-guard.ts)
  it('refuses both directions while a tab is reading: the pref stays, the box goes back, the user is told where', () => {
    const on = setup({ reading: ['Deep learning'] });
    on.box(FAVORITES.id).click();
    expect(on.value(FAVORITES.pref)).toBeUndefined();
    expect(on.box(FAVORITES.id).checked).toBe(false);
    expect(on.warn).toHaveBeenCalledWith(expect.stringContaining('Deep learning'));

    const off = setup({ prefs: { [PREF_PREFIX + FAVORITES.pref]: true }, reading: ['Deep learning', 'Attention'] });
    expect(off.box(FAVORITES.id).checked).toBe(true);
    off.box(FAVORITES.id).click();
    expect(off.value(FAVORITES.pref)).toBe(true);
    expect(off.box(FAVORITES.id).checked).toBe(true);
    expect(off.warn).toHaveBeenCalledWith(expect.stringContaining('Attention'));
  });

  it('says nothing and writes nothing when the box already holds the pref', () => {
    const t = setup({ prefs: { [PREF_PREFIX + FAVORITES.pref]: true }, reading: ['Deep learning'] });
    t.box(FAVORITES.id).checked = true;
    for (const fn of t.box(FAVORITES.id).listeners.get('command') ?? []) fn();
    expect(t.warn).not.toHaveBeenCalled();
  });

  // The box is no longer `preference=`-bound, so nothing redraws it for us:
  // a settings restore writes the pref from elsewhere
  it('follows a pref written elsewhere, through the observer and through refresh()', () => {
    const t = setup();
    expect(t.watchers.map((w) => w.name)).toEqual([FAVORITES_ONLY_OBSERVER]);
    t.prefs.store[PREF_PREFIX + FAVORITES.pref] = true;
    t.notify(FAVORITES.pref);
    expect(t.box(FAVORITES.id).checked).toBe(true);

    t.prefs.store[PREF_PREFIX + FAVORITES.pref] = false;
    t.rows.refresh();
    expect(t.box(FAVORITES.id).checked).toBe(false);
  });

  it('dispose unregisters every observer', () => {
    const t = setup();
    expect(t.watchers).toHaveLength(1);
    t.rows.dispose();
    expect(t.watchers).toHaveLength(0);
  });

  it('works without a watch dep and without the boxes', () => {
    expect(() => setup({ watch: false }).rows.refresh()).not.toThrow();
    const bare = initVoiceListSwitches({ getElementById: () => null }, { prefs: fakePrefs(), readingTabs: () => [], warn: () => {} });
    expect(() => {
      bare.refresh();
      bare.dispose();
    }).not.toThrow();
  });
});

describe('addon/content/preferences.xhtml', () => {
  const xhtml = readFileSync(new URL('../../addon/content/preferences.xhtml', import.meta.url), 'utf8');
  const checkboxes = [...xhtml.matchAll(/<checkbox\b[^>]*>/g)].map((match) => match[0]);

  // A bound checkbox has already written the pref by the time any listener
  // runs (preferences.js:465), so there would be nothing left to refuse
  it('gives each switch its id and leaves it unbound, so the rows own the write', () => {
    for (const s of VOICE_LIST_SWITCHES) {
      const box = checkboxes.find((markup) => markup.includes(`id="${s.id}"`));
      expect(box, s.id).toBeDefined();
      expect(box, s.id).not.toContain('preference=');
      expect(xhtml).not.toContain(`preference="${PREF_PREFIX}${s.pref}"`);
    }
  });

  // Issue #17: the switch is gone from the pane, and so is the pref behind it
  it('has no Hide System Local voices row left', () => {
    expect(xhtml).not.toContain('ztts-hide-system-voices');
    expect(xhtml).not.toContain('hideZoteroLocalVoices');
    expect(xhtml).not.toContain('Hide System Local voices');
  });
});
