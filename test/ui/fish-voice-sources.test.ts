import { describe, expect, it } from 'vitest';
import { PREF_PREFIX, type PrefsBackend } from '../../src/core/settings';
import { FISH_SOURCE_PREFS, FISH_SOURCE_IDS, initFishVoiceSources } from '../../src/ui/fish-voice-sources';

class Element {
  checked = false;
  disabled = false;
  value = '';
  listeners = new Map<string, Array<() => unknown>>();
  addEventListener(type: string, fn: () => unknown) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  async fire(type: string) {
    for (const fn of this.listeners.get(type) ?? []) await fn();
  }
}

function setup(enabled = true) {
  const elements = new Map<string, Element>(Object.values(FISH_SOURCE_IDS).map(id => [id, new Element()]));
  const store: Record<string, unknown> = {};
  const prefs: PrefsBackend = { get: key => store[key], set: (key, value) => { store[key] = value; } };
  const watchers = new Map<string, () => void>();
  const sources = initFishVoiceSources({ getElementById: id => elements.get(id) }, {
    prefs,
    fishEnabled: () => enabled,
    watch: (name, onChange) => {
      watchers.set(name, onChange);
      return () => { watchers.delete(name); };
    },
  });
  return { sources, store, prefs, watchers, enabled: (value: boolean) => { enabled = value; }, el: (id: string) => elements.get(id)! };
}

const names = ['official', 'own', 'manual'] as const;

describe('Fish voice source switches', () => {
  it('locks all three sources and the ID field while Fish is enabled', () => {
    const t = setup();
    for (const name of names) {
      expect(t.el(FISH_SOURCE_IDS[name]).checked).toBe(true);
      expect(t.el(FISH_SOURCE_IDS[name]).disabled).toBe(true);
    }
    expect(t.el(FISH_SOURCE_IDS.modelIds).disabled).toBe(true);
  });

  it.each(names)('saves the %s source while Fish is disabled', async name => {
    const t = setup(false);
    expect(t.el(FISH_SOURCE_IDS[name]).disabled).toBe(false);
    t.el(FISH_SOURCE_IDS[name]).checked = false;
    await t.el(FISH_SOURCE_IDS[name]).fire('command');
    expect(t.store[PREF_PREFIX + FISH_SOURCE_PREFS[name]]).toBe(false);
  });

  it('ignores even a synthetic command on an enabled provider', async () => {
    const t = setup();
    t.el(FISH_SOURCE_IDS.official).checked = false;
    await t.el(FISH_SOURCE_IDS.official).fire('command');
    expect(t.store[PREF_PREFIX + FISH_SOURCE_PREFS.official]).toBeUndefined();
    expect(t.el(FISH_SOURCE_IDS.official).checked).toBe(true);
  });

  it('follows enabled-state and source changes and unregisters its observers', () => {
    const t = setup();
    t.enabled(false);
    expect(t.watchers.has('zotero-tts.fish.enabled')).toBe(true);
    t.watchers.get('zotero-tts.fish.enabled')!();
    expect(t.el(FISH_SOURCE_IDS.own).disabled).toBe(false);
    t.prefs.set(PREF_PREFIX + FISH_SOURCE_PREFS.own, false);
    t.watchers.get('zotero-tts.fish.includeOwn')!();
    expect(t.el(FISH_SOURCE_IDS.own).checked).toBe(false);
    t.enabled(true);
    t.watchers.get('zotero-tts.fish.enabled')!();
    expect(t.el(FISH_SOURCE_IDS.own).disabled).toBe(true);
    expect(t.el(FISH_SOURCE_IDS.own).checked).toBe(false);
    t.sources.dispose();
    expect(t.watchers.size).toBe(0);
  });

  it('retains manual IDs when that source is turned off', async () => {
    const t = setup(false);
    const ids = 'a'.repeat(32);
    t.prefs.set(PREF_PREFIX + 'fish.voices', ids);
    t.el(FISH_SOURCE_IDS.modelIds).value = ids;
    t.el(FISH_SOURCE_IDS.manual).checked = false;
    await t.el(FISH_SOURCE_IDS.manual).fire('command');
    expect(t.el(FISH_SOURCE_IDS.modelIds).disabled).toBe(true);
    expect(t.el(FISH_SOURCE_IDS.modelIds).value).toBe(ids);
    expect(t.store[PREF_PREFIX + 'fish.voices']).toBe(ids);
  });
});
