import { describe, expect, it, vi } from 'vitest';
import { PREF_PREFIX, type PrefsBackend } from '../../src/core/settings';
import {
  FISH_SOURCE_PREFS,
  FISH_SOURCE_IDS,
  initFishVoiceSources,
  type FishVoiceSourceProvider,
} from '../../src/ui/fish-voice-sources';

class Element {
  checked = false;
  disabled = false;
  hidden = false;
  textContent = '';
  value = '';
  attrs = new Map<string, string>();
  listeners = new Map<string, Array<() => unknown>>();

  setAttribute(name: string, value: string) {
    this.attrs.set(name, value);
  }

  removeAttribute(name: string) {
    this.attrs.delete(name);
  }

  addEventListener(type: string, listener: () => unknown) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  async fire(type: string) {
    for (const listener of this.listeners.get(type) ?? []) await listener();
  }
}

function prefs(initial: Record<string, unknown> = {}): PrefsBackend & { store: Record<string, unknown> } {
  const store = { ...initial };
  return { store, get: (key) => store[key], set: (key, value) => void (store[key] = value) };
}

function setup(options: { enabled?: boolean; reading?: string[] } = {}) {
  const ids = Object.values(FISH_SOURCE_IDS) as string[];
  const elements = new Map(ids.map((id) => [id, new Element()]));
  const doc = { getElementById: (id: string) => elements.get(id) ?? null };
  const store = prefs();
  let enabled = options.enabled ?? true;
  const reading = options.reading ?? [];
  const watchers = new Map<string, () => void>();
  const askToStop = vi.fn(async () => true);
  const stopReading = vi.fn(() => reading.splice(0));
  const reloadCatalog = vi.fn(async () => {});
  const provider: FishVoiceSourceProvider = {
    listVoices: vi.fn(async () => []),
    voiceListNotices: vi.fn(() => []),
  };
  const controller = { signal: { aborted: false } as AbortSignal, abort: vi.fn() };
  const sources = initFishVoiceSources(doc, {
    prefs: store,
    fishEnabled: () => enabled,
    provider: () => provider,
    reloadCatalog,
    watch: (name, onChange) => {
      watchers.set(name, onChange);
      return () => watchers.delete(name);
    },
    createAbortController: () => controller,
    readingTabs: () => reading,
    warn: vi.fn(),
    askToStop,
    stopReading,
  });
  const el = (id: string) => elements.get(id)!;
  return {
    sources,
    provider,
    reloadCatalog,
    store,
    enabled: (next?: boolean) => (next === undefined ? enabled : (enabled = next)),
    reading,
    askToStop,
    stopReading,
    watchers,
    el,
  };
}

describe('Fish voice source switches', () => {
  it('paints all three sources on by default and keeps the Model IDs field locked while Fish is enabled', () => {
    const t = setup();
    expect(t.el(FISH_SOURCE_IDS.official).checked).toBe(true);
    expect(t.el(FISH_SOURCE_IDS.own).checked).toBe(true);
    expect(t.el(FISH_SOURCE_IDS.manual).checked).toBe(true);
    expect(t.el(FISH_SOURCE_IDS.modelIds).disabled).toBe(true);
  });

  it.each(['official', 'own', 'manual'] as const)('writes the %s unbound switch and reloads the catalog when Fish is enabled', async (name) => {
    const t = setup();
    t.el(FISH_SOURCE_IDS[name]).checked = false;
    await t.el(FISH_SOURCE_IDS[name]).fire('command');
    expect(t.store.store[PREF_PREFIX + FISH_SOURCE_PREFS[name]]).toBe(false);
    expect(t.reloadCatalog).toHaveBeenCalledOnce();
    expect(t.el(FISH_SOURCE_IDS[name]).checked).toBe(false);
  });

  it('uses the reading guard in both directions and restores a cancelled switch', async () => {
    const t = setup({ reading: ['Deep learning'] });
    t.askToStop.mockResolvedValueOnce(false);
    t.el(FISH_SOURCE_IDS.own).checked = false;
    await t.el(FISH_SOURCE_IDS.own).fire('command');
    expect(t.store.store[PREF_PREFIX + FISH_SOURCE_PREFS.own]).toBeUndefined();
    expect(t.el(FISH_SOURCE_IDS.own).checked).toBe(true);

    t.askToStop.mockResolvedValueOnce(true);
    t.el(FISH_SOURCE_IDS.own).checked = false;
    await t.el(FISH_SOURCE_IDS.own).fire('command');
    expect(t.store.store[PREF_PREFIX + FISH_SOURCE_PREFS.own]).toBe(false);
    expect(t.stopReading).toHaveBeenCalledOnce();
  });

  it('allows source configuration without a guard while Fish is disabled', async () => {
    const t = setup({ enabled: false, reading: ['Deep learning'] });
    t.el(FISH_SOURCE_IDS.manual).checked = false;
    await t.el(FISH_SOURCE_IDS.manual).fire('command');
    expect(t.askToStop).not.toHaveBeenCalled();
    expect(t.store.store[PREF_PREFIX + FISH_SOURCE_PREFS.manual]).toBe(false);
    expect(t.reloadCatalog).not.toHaveBeenCalled();
  });

  it('repaints from external pref observers and unregisters them on dispose', () => {
    const t = setup();
    const observer = FISH_SOURCE_PREFS.official;
    t.store.set(PREF_PREFIX + observer, false);
    t.watchers.get('zotero-tts.' + observer)!();
    expect(t.el(FISH_SOURCE_IDS.official).checked).toBe(false);
    expect(t.watchers.size).toBe(3);
    t.sources.dispose();
    expect(t.watchers.size).toBe(0);
  });

  it('disables the manual field and says why when manual voices are off', async () => {
    const t = setup({ enabled: false });
    t.el(FISH_SOURCE_IDS.manual).checked = false;
    await t.el(FISH_SOURCE_IDS.manual).fire('command');
    expect(t.el(FISH_SOURCE_IDS.modelIds).disabled).toBe(true);
    expect(t.el(FISH_SOURCE_IDS.manualHint).textContent).toMatch(/Manual voices are off|手动语音/);
  });

  it('refreshes the Fish list with the explicit refresh option and reloads the catalog', async () => {
    const t = setup();
    await t.el(FISH_SOURCE_IDS.refresh).fire('command');
    expect(t.provider.listVoices).toHaveBeenCalledWith(expect.objectContaining({ refresh: true, signal: expect.anything() }));
    expect(t.reloadCatalog).toHaveBeenCalledOnce();
  });

  it('reports non-fatal Fish list notices after refreshing', async () => {
    const t = setup();
    vi.mocked(t.provider.voiceListNotices!).mockReturnValue([{ kind: 'limited' }, { kind: 'stale', detail: 'last list retained' }]);
    await t.sources.refreshList();
    expect(t.el(FISH_SOURCE_IDS.status).textContent).toContain('Fish Audio limits');
    expect(t.el(FISH_SOURCE_IDS.status).textContent).toContain('last list retained');
  });

  it('guards an explicit refresh while Read Aloud is open', async () => {
    const t = setup({ reading: ['Deep learning'] });
    t.askToStop.mockResolvedValueOnce(false);
    await t.sources.refreshList();
    expect(t.askToStop).toHaveBeenCalledOnce();
    expect(t.provider.listVoices).not.toHaveBeenCalled();
    expect(t.reloadCatalog).not.toHaveBeenCalled();
  });
});
