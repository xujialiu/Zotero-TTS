import { describe, expect, it } from 'vitest';
import { DEFAULTS, loadSettings, saveSettings, type PrefsBackend } from '../../src/core/settings';

function fakePrefs(initial: Record<string, unknown> = {}): PrefsBackend & { store: Record<string, unknown> } {
  const store = { ...initial };
  return {
    store,
    get: (k) => store[k],
    set: (k, v) => {
      store[k] = v;
    },
  };
}

describe('loadSettings', () => {
  it('returns the defaults when nothing is stored', () => {
    expect(loadSettings(fakePrefs())).toEqual(DEFAULTS);
  });

  // The plugin has exactly one way of working: it drives Zotero's built-in
  // Read Aloud player. The earlier "mode" switch (hijack vs. a standalone
  // player) was removed once the hijack was confirmed live in a real Zotero,
  // and a leftover pref from that era must be ignored, not surfaced.
  it('has no mode field, and ignores a stale mode pref from an older build', () => {
    const prefs = fakePrefs({ 'extensions.zotero.zotero-tts.mode': 'standalone' });
    const s = loadSettings(prefs);
    expect('mode' in s).toBe(false);
    expect('mode' in DEFAULTS).toBe(false);
  });

  it('reads stored values using the extensions.zotero.zotero-tts. prefix', () => {
    const prefs = fakePrefs({
      'extensions.zotero.zotero-tts.provider': 'azure',
      'extensions.zotero.zotero-tts.azure.region': 'eastasia',
    });
    const s = loadSettings(prefs);
    expect(s.provider).toBe('azure');
    expect(s.azure.region).toBe('eastasia');
  });

  it('falls back to the default when a stored value has the wrong type', () => {
    const prefs = fakePrefs({ 'extensions.zotero.zotero-tts.speed': 'fast' });
    expect(loadSettings(prefs).speed).toBe(DEFAULTS.speed);
  });

  it('clamps speed into the supported range', () => {
    expect(loadSettings(fakePrefs({ 'extensions.zotero.zotero-tts.speed': 99 })).speed).toBe(3);
    expect(loadSettings(fakePrefs({ 'extensions.zotero.zotero-tts.speed': 0 })).speed).toBe(0.5);
  });

  it('rejects an unknown provider id', () => {
    const prefs = fakePrefs({ 'extensions.zotero.zotero-tts.provider': 'elevenlabs' });
    expect(loadSettings(prefs).provider).toBe(DEFAULTS.provider);
  });
});

describe('saveSettings', () => {
  it('round-trips through the backend', () => {
    const prefs = fakePrefs();
    const s = { ...DEFAULTS, provider: 'local' as const, speed: 1.5 };
    saveSettings(prefs, s);
    expect(loadSettings(prefs)).toEqual(s);
  });
});
